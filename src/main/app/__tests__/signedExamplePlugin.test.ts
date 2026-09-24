/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { installPluginFromDirectory, listInstalledPlugins } from '../pluginStore.js';

/**
 * 端到端：仓库自带的 `examples/plugins/opening-hook` 经 `scripts/sign-plugin.mjs`
 * 真实签发后，走生产安装端口（node fs + ed25519 校验）装入磁盘。
 *
 * 覆盖三方对账：签名工具写出的信封格式、安装门的判定、示例插件自身的贡献声明。
 * 密钥对由测试现生成，私钥只活在临时目录，不进版本库。
 */
const HOST = '1.0.0';
const EXAMPLE_DIR = join(process.cwd(), 'examples', 'plugins', 'opening-hook');
const SIGN_SCRIPT = join(process.cwd(), 'scripts', 'sign-plugin.mjs');

function runSignScript(args: string[]): void {
  execFileSync(process.execPath, [SIGN_SCRIPT, ...args], { stdio: 'pipe' });
}

/** 生成一把测试用 ed25519 密钥对，返回公钥文本与私钥文件路径。 */
function generateKeys(dir: string): { publicKey: string; privateKeyFile: string } {
  const publicKeyFile = join(dir, 'dev.pub');
  const privateKeyFile = join(dir, 'dev.pem');
  runSignScript(['--generate-key', publicKeyFile, privateKeyFile]);
  return { publicKey: readFileSync(publicKeyFile, 'utf-8'), privateKeyFile };
}

/** 把示例插件原样复制到临时目录，再用真实脚本签名。 */
function signedExample(root: string, keys: { privateKeyFile: string }): string {
  const source = join(root, 'source');
  rmSync(source, { recursive: true, force: true });
  cpSync(EXAMPLE_DIR, source, { recursive: true });
  runSignScript(['--key', keys.privateKeyFile, source]);
  return source;
}

describe('签名示例插件端到端（examples/plugins/opening-hook → 生产安装端口）', () => {
  let root: string;
  let pluginsRoot: string;
  let keys: { publicKey: string; privateKeyFile: string };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'hy-plugin-example-'));
    pluginsRoot = join(root, 'plugins');
    mkdirSync(pluginsRoot, { recursive: true });
    keys = generateKeys(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  /** 信任语义与主进程一致：只认传入的这把公钥，其余（含空清单）一律拒。 */
  function optionsTrusting(publicKey: string | null) {
    return { pluginsRoot, isTrustedKey: (key: string): boolean => key === publicKey };
  }

  it('示例插件带可执行贡献点，未签名即被拒', async () => {
    const source = join(root, 'unsigned');
    cpSync(EXAMPLE_DIR, source, { recursive: true });
    expect(existsSync(join(source, 'logic', 'hooks.js'))).toBe(true);

    const result = await installPluginFromDirectory(optionsTrusting(keys.publicKey), source, {
      hostVersion: HOST,
      allowAnySource: true,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('签名');
  });

  it('签名工具签出的包：装入并落盘全部贡献点文件', async () => {
    const source = signedExample(root, keys);
    const result = await installPluginFromDirectory(optionsTrusting(keys.publicKey), source, {
      hostVersion: HOST,
      allowAnySource: true,
    });
    expect(result).toMatchObject({
      ok: true,
      action: 'install',
      pluginId: 'com.hongyue.example-opening-hook',
      version: '1.0.0',
    });

    const installed = join(pluginsRoot, 'com.hongyue.example-opening-hook');
    for (const rel of [
      'plugin.json',
      'plugin.sig',
      'hooks.json',
      'logic/hooks.js',
      'editor/index.html',
      'types/opening.json',
      'skills/opening-hook/SKILL.md',
      'skills/opening-hook/handler.js',
    ]) {
      expect(existsSync(join(installed, rel)), rel).toBe(true);
    }
    expect(await listInstalledPlugins(optionsTrusting(keys.publicKey))).toHaveLength(1);
  });

  it('信任清单为空：签名有效也拒装（fail-closed）', async () => {
    const source = signedExample(root, keys);
    const result = await installPluginFromDirectory(optionsTrusting(null), source, { hostVersion: HOST, allowAnySource: true });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('签名');
    expect(existsSync(join(pluginsRoot, 'com.hongyue.example-opening-hook'))).toBe(false);
  });

  it('签名后改动 plugin.json：拒装且不落盘', async () => {
    const source = signedExample(root, keys);
    const manifestPath = join(source, 'plugin.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Record<string, unknown>;
    writeFileSync(manifestPath, JSON.stringify({ ...manifest, description: '被改过的描述' }, null, 2), 'utf-8');

    const result = await installPluginFromDirectory(optionsTrusting(keys.publicKey), source, {
      hostVersion: HOST,
      allowAnySource: true,
    });
    expect(result.ok).toBe(false);
    expect(existsSync(join(pluginsRoot, 'com.hongyue.example-opening-hook'))).toBe(false);
  });
});
