/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { generateKeyPairSync, type KeyObject,sign } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { installPluginFromDirectory, listInstalledPlugins, uninstallInstalledPlugin } from '../pluginStore.js';

const HOST = '2.5.0';

interface Keys {
  publicKey: string;
  privateKey: KeyObject;
}

function generateKeys(): Keys {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(), privateKey };
}

function writePackage(
  dir: string,
  manifest: Record<string, unknown>,
  opts: { sign?: boolean; keys?: Keys } = {},
): Keys {
  mkdirSync(dir, { recursive: true });
  const text = JSON.stringify(manifest);
  writeFileSync(join(dir, 'plugin.json'), text, 'utf-8');
  const keys = opts.keys ?? generateKeys();
  if (opts.sign !== false) {
    const signature = sign(null, Buffer.from(text), keys.privateKey).toString('base64');
    writeFileSync(join(dir, 'plugin.sig'), JSON.stringify({ algorithm: 'ed25519', signature, publicKey: keys.publicKey }), 'utf-8');
  }
  return keys;
}

function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'com.example.store',
    name: 'store',
    version: '1.0.0',
    host: '^2.0.0',
    license: 'MIT',
    source: 'https://example.com/store',
    ...overrides,
  };
}

describe('pluginStore（磁盘安装/更新/卸载 + 签名拒绝）', () => {
  let root: string;
  let pluginsRoot: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'hy-plugin-store-'));
    pluginsRoot = join(root, 'plugins');
    mkdirSync(pluginsRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function optionsFor(publicKey: string) {
    return { pluginsRoot, isTrustedKey: (key: string): boolean => key === publicKey };
  }

  it('签名有效：安装落盘', async () => {
    const source = join(root, 'source');
    const { publicKey } = writePackage(source, manifest());
    const result = await installPluginFromDirectory(optionsFor(publicKey), source, { hostVersion: HOST });
    expect(result).toMatchObject({ ok: true, action: 'install', pluginId: 'com.example.store' });
    expect(existsSync(join(pluginsRoot, 'com.example.store', 'plugin.json'))).toBe(true);
  });

  it('篡改 manifest：签名校验失败并拒装', async () => {
    const source = join(root, 'tampered');
    const { publicKey } = writePackage(source, manifest());
    // 签名后改写 manifest，签名不再匹配
    writeFileSync(join(source, 'plugin.json'), JSON.stringify(manifest({ name: 'evil' })), 'utf-8');
    const result = await installPluginFromDirectory(optionsFor(publicKey), source, { hostVersion: HOST });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('签名');
    expect(existsSync(join(pluginsRoot, 'com.example.store'))).toBe(false);
  });

  it('公钥不受信任：拒装', async () => {
    const source = join(root, 'untrusted');
    writePackage(source, manifest());
    const result = await installPluginFromDirectory(optionsFor('-----BEGIN PUBLIC KEY-----other'), source, { hostVersion: HOST });
    expect(result.ok).toBe(false);
  });

  it('来源白名单外：拒装', async () => {
    const source = join(root, 'source2');
    const { publicKey } = writePackage(source, manifest());
    const result = await installPluginFromDirectory(optionsFor(publicKey), source, {
      hostVersion: HOST,
      allowedSources: ['https://trusted.example'],
    });
    expect(result.ok).toBe(false);
  });

  it('更新：覆盖为更高版本', async () => {
    const v1 = join(root, 'v1');
    const v2 = join(root, 'v2');
    const first = writePackage(v1, manifest());
    writePackage(v2, manifest({ version: '1.1.0' }), { keys: first });
    await installPluginFromDirectory(optionsFor(first.publicKey), v1, { hostVersion: HOST });
    const updated = await installPluginFromDirectory(optionsFor(first.publicKey), v2, { hostVersion: HOST });
    expect(updated).toMatchObject({ ok: true, action: 'update', version: '1.1.0' });
    const stored = JSON.parse(readFileSync(join(pluginsRoot, 'com.example.store', 'plugin.json'), 'utf-8')) as { version: string };
    expect(stored.version).toBe('1.1.0');
  });

  it('卸载：递归删除且列表不再出现', async () => {
    const source = join(root, 'source3');
    const { publicKey } = writePackage(source, manifest());
    await installPluginFromDirectory(optionsFor(publicKey), source, { hostVersion: HOST });
    expect(await listInstalledPlugins(optionsFor(publicKey))).toHaveLength(1);

    const removed = await uninstallInstalledPlugin(optionsFor(publicKey), 'com.example.store');
    expect(removed.ok).toBe(true);
    expect(existsSync(join(pluginsRoot, 'com.example.store'))).toBe(false);
    expect(await listInstalledPlugins(optionsFor(publicKey))).toHaveLength(0);
  });

  it('未签名资源型：允许；未签名逻辑型：拒绝', async () => {
    const resource = join(root, 'resource');
    writePackage(resource, manifest(), { sign: false });
    const resourceResult = await installPluginFromDirectory(optionsFor(''), resource, { hostVersion: HOST });
    expect(resourceResult.ok).toBe(true);

    const logic = join(root, 'logic');
    writePackage(logic, manifest({ id: 'com.example.logic', contributes: { logic: ['./logic/'] } }), { sign: false });
    const logicResult = await installPluginFromDirectory(optionsFor(''), logic, { hostVersion: HOST });
    expect(logicResult.ok).toBe(false);
    expect(logicResult.reason).toContain('签名');
  });
});
