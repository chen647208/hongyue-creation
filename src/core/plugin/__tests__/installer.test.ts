/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect, it } from 'vitest';

import {
  installPackage,
  type PluginInstallPort,
  type PluginPackage,
  uninstallPackage,
} from '../installer.js';

function makePackage(overrides: Record<string, unknown> = {}, signature?: PluginPackage['signature']): PluginPackage {
  const manifest = {
    id: 'com.example.p',
    name: 'p',
    version: '1.0.0',
    host: '^2.0.0',
    license: 'MIT',
    source: 'https://example.com/p',
    ...overrides,
  };
  return { source: '/src/com.example.p', manifestText: JSON.stringify(manifest), manifestJson: manifest, signature, files: {} };
}

class FakePort implements PluginInstallPort {
  committed: PluginPackage[] = [];
  removed: string[] = [];
  cleared: string[] = [];
  verifyResult = true;
  verifySigCalls = 0;
  digestResult = true;
  commitError?: Error;
  installed = new Map<string, string>();

  constructor(private readonly pkg: PluginPackage) {}

  readPackage = async (): Promise<PluginPackage> => this.pkg;
  verifySignature = async (): Promise<boolean> => {
    this.verifySigCalls += 1;
    return this.verifyResult;
  };
  digestMatches = async (): Promise<boolean> => this.digestResult;
  readInstalledVersion = async (id: string): Promise<string | undefined> => this.installed.get(id);
  commit = async (pkg: PluginPackage): Promise<void> => {
    if (this.commitError) throw this.commitError;
    this.committed.push(pkg);
    this.installed.set((pkg.manifestJson as { id: string }).id, (pkg.manifestJson as { version: string }).version);
  };
  remove = async (id: string): Promise<void> => {
    this.removed.push(id);
    this.installed.delete(id);
  };
  clearState = async (id: string): Promise<void> => {
    this.cleared.push(id);
  };
}

const HOST = '2.5.0';
const ed = (): PluginPackage['signature'] => ({ algorithm: 'ed25519', signature: 's', publicKey: 'k' });

describe('installer（安装/更新/卸载与签名拒绝）', () => {
  it('签名有效：安装成功并落盘', async () => {
    const port = new FakePort(makePackage({}, ed()));
    const result = await installPackage(port, '/src/com.example.p', { hostVersion: HOST, requireSignature: true, allowAnySource: true });
    expect(result).toMatchObject({ ok: true, action: 'install', pluginId: 'com.example.p', version: '1.0.0' });
    expect(port.committed).toHaveLength(1);
  });

  it('签名校验失败（篡改）：拒装且不落盘', async () => {
    const port = new FakePort(makePackage({}, ed()));
    port.verifyResult = false;
    const result = await installPackage(port, '/src/com.example.p', { hostVersion: HOST, requireSignature: true, allowAnySource: true });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('签名');
    expect(port.committed).toHaveLength(0);
  });

  it('sha256 信封不满足 requireSignature：拒装（自算摘要不能冒充来源认证，51 篇）', async () => {
    const port = new FakePort(makePackage({ contributes: { logic: ['./logic/'] } }, { algorithm: 'sha256', digest: 'abc' }));
    const result = await installPackage(port, '/src/com.example.p', { hostVersion: HOST, allowAnySource: true });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('来源认证');
    expect(port.verifySigCalls).toBe(0);
  });

  it('非可执行插件带 sha256 信封：只做完整性校验，可安装', async () => {
    const port = new FakePort(makePackage({}, { algorithm: 'sha256', digest: 'abc' }));
    const result = await installPackage(port, '/src/com.example.p', { hostVersion: HOST, allowAnySource: true });
    expect(result).toMatchObject({ ok: true, action: 'install' });
    expect(port.verifySigCalls).toBe(0);
  });

  it('摘要不匹配（篡改）：拒装', async () => {
    const port = new FakePort(makePackage({}, ed()));
    port.digestResult = false;
    const result = await installPackage(port, '/src/com.example.p', { hostVersion: HOST, expectedDigest: 'deadbeef', allowAnySource: true });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('摘要');
    expect(port.committed).toHaveLength(0);
  });

  it('可执行贡献未签名：fail-closed', async () => {
    const port = new FakePort(makePackage({ contributes: { logic: ['./logic/'] } }));
    const result = await installPackage(port, '/src/com.example.p', { hostVersion: HOST, allowAnySource: true });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('签名');
  });

  it('渲染器/脚本描述符未签名：fail-closed', async () => {
    const port = new FakePort(makePackage({ contributes: { renderers: ['./renderers/'], scripts: ['./scripts/'] } }));
    const result = await installPackage(port, '/src/com.example.p', { hostVersion: HOST, allowAnySource: true });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('签名');
    expect(port.committed).toHaveLength(0);
  });

  it('资源型未签名：允许安装', async () => {
    const port = new FakePort(makePackage());
    const result = await installPackage(port, '/src/com.example.p', { hostVersion: HOST, allowAnySource: true });
    expect(result.ok).toBe(true);
  });

  it('来源白名单：清单外拒绝', async () => {
    const port = new FakePort(makePackage());
    const result = await installPackage(port, '/src/com.example.p', {
      hostVersion: HOST,
      allowedSources: ['https://trusted.example'],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('来源');
  });

  it('空白名单未显式放行：fail-closed 拒绝且不落盘', async () => {
    const port = new FakePort(makePackage());
    const result = await installPackage(port, '/src/com.example.p', { hostVersion: HOST });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('来源白名单');
    expect(port.committed).toHaveLength(0);
  });

  it('显式 allowAnySource：空白名单也放行', async () => {
    const port = new FakePort(makePackage());
    const result = await installPackage(port, '/src/com.example.p', { hostVersion: HOST, allowAnySource: true });
    expect(result.ok).toBe(true);
  });

  it('宿主版本不满足：拒绝', async () => {
    const port = new FakePort(makePackage());
    const result = await installPackage(port, '/src/com.example.p', { hostVersion: '1.0.0', allowAnySource: true });
    expect(result.ok).toBe(false);
  });

  it('更新：更高版本走 update', async () => {
    const port = new FakePort(makePackage({ version: '1.1.0' }));
    port.installed.set('com.example.p', '1.0.0');
    const result = await installPackage(port, '/src/com.example.p', { hostVersion: HOST, allowAnySource: true });
    expect(result).toMatchObject({ ok: true, action: 'update' });
  });

  it('同版本：up-to-date 且不重复落盘', async () => {
    const port = new FakePort(makePackage({ version: '1.0.0' }));
    port.installed.set('com.example.p', '1.0.0');
    const result = await installPackage(port, '/src/com.example.p', { hostVersion: HOST, allowAnySource: true });
    expect(result).toMatchObject({ ok: true, action: 'up-to-date' });
    expect(port.committed).toHaveLength(0);
  });

  it('降级：拒绝', async () => {
    const port = new FakePort(makePackage({ version: '0.9.0' }));
    port.installed.set('com.example.p', '1.0.0');
    const result = await installPackage(port, '/src/com.example.p', { hostVersion: HOST, allowAnySource: true });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('降级');
  });

  it('落盘失败：上报已回滚', async () => {
    const port = new FakePort(makePackage());
    port.commitError = new Error('disk full');
    const result = await installPackage(port, '/src/com.example.p', { hostVersion: HOST, allowAnySource: true });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('回滚');
  });

  it('卸载：删文件并清配置', async () => {
    const port = new FakePort(makePackage());
    const result = await uninstallPackage(port, 'com.example.p');
    expect(result.ok).toBe(true);
    expect(port.removed).toEqual(['com.example.p']);
    expect(port.cleared).toEqual(['com.example.p']);
  });
});
