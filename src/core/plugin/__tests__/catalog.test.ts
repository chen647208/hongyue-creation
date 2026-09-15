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
  compareSemver,
  decideCatalogInstall,
  loadPluginCatalog,
  parsePluginCatalog,
  type PluginCatalogEntry,
  verifyCatalogIndexSignature,
} from '../catalog.js';

const baseEntry: PluginCatalogEntry = {
  id: 'com.example.search',
  name: 'search',
  version: '1.2.0',
  host: '^2.0.0',
  license: 'MIT',
  source: 'https://example.com/search',
  path: 'search-plugin',
};

describe('catalog（目录索引解析与安装决策）', () => {
  it('解析合法索引', () => {
    const result = parsePluginCatalog({ schema: 1, entries: [baseEntry] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.catalog.entries).toHaveLength(1);
  });

  it('拒绝非法条目并带 JSON 路径', () => {
    const result = parsePluginCatalog({
      schema: 1,
      entries: [{ ...baseEntry, id: 'NotAnId', version: 'abc', path: '../escape' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const paths = result.issues.map((i) => i.path);
      expect(paths).toContain('entries[0].id');
      expect(paths).toContain('entries[0].version');
      expect(paths).toContain('entries[0].path');
    }
  });

  it('拒绝非法签名信封', () => {
    const result = parsePluginCatalog({ schema: 1, entries: [{ ...baseEntry, signature: { algorithm: 'rsa' } }] });
    expect(result.ok).toBe(false);
  });

  it('来源不在白名单：拒绝', () => {
    const decision = decideCatalogInstall(baseEntry, { allowedSources: ['https://other.example'], hostVersion: '2.1.0' });
    expect(decision.ok).toBe(false);
  });

  it('宿主版本不满足：拒绝', () => {
    const decision = decideCatalogInstall(baseEntry, { allowedSources: [], hostVersion: '1.0.0' });
    expect(decision.ok).toBe(false);
  });

  it('未安装=install，更高=update，同版本=up-to-date，更低=拒绝降级', () => {
    expect(decideCatalogInstall(baseEntry, { allowedSources: [], hostVersion: '2.0.0' })).toEqual({ ok: true, action: 'install' });
    expect(decideCatalogInstall(baseEntry, { allowedSources: [], hostVersion: '2.0.0', currentVersion: '1.0.0' })).toEqual({ ok: true, action: 'update' });
    expect(decideCatalogInstall(baseEntry, { allowedSources: [], hostVersion: '2.0.0', currentVersion: '1.2.0' })).toEqual({ ok: true, action: 'up-to-date' });
    const downgrade = decideCatalogInstall(baseEntry, { allowedSources: [], hostVersion: '2.0.0', currentVersion: '2.0.0' });
    expect(downgrade.ok).toBe(false);
  });

  it('版本比较忽略预发布后缀', () => {
    expect(compareSemver('1.2.0-beta.1', '1.2.0')).toBe(0);
    expect(compareSemver('1.3.0', '1.2.9')).toBeGreaterThan(0);
    expect(compareSemver('1.2.0', '2.0.0')).toBeLessThan(0);
  });
});

describe('catalog（整个索引 payload 的 detached 签名校验）', () => {
  const raw = { schema: 1, entries: [baseEntry] };
  const payloadText = JSON.stringify(raw);
  const ed25519 = { algorithm: 'ed25519' as const, signature: 'sig', publicKey: 'pem' };
  const verifier = (result: boolean) => ({ verifyPayload: async (): Promise<boolean> => result });

  it('签名有效：返回目录', async () => {
    const result = await loadPluginCatalog(raw, { payloadText, signature: ed25519, verifier: verifier(true) });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.catalog.entries).toHaveLength(1);
  });

  it('签名校验失败：拒绝使用该索引', async () => {
    const result = await loadPluginCatalog(raw, { payloadText, signature: ed25519, verifier: verifier(false) });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.path).toBe('signature');
      expect(result.issues[0]?.message).toContain('拒绝使用');
    }
  });

  it('索引未签名：fail-closed 拒绝', async () => {
    const result = await loadPluginCatalog(raw, { payloadText, verifier: verifier(true) });
    expect(result.ok).toBe(false);
  });

  it('显式 requireSignature=false：允许未签名索引', async () => {
    const result = await loadPluginCatalog(raw, { payloadText, requireSignature: false });
    expect(result.ok).toBe(true);
  });

  it('sha256 信封仅完整性，不足以认证索引来源：拒绝', async () => {
    const reason = await verifyCatalogIndexSignature(
      payloadText,
      { algorithm: 'sha256', digest: 'abc' },
      verifier(true),
    );
    expect(reason).toContain('不能认证来源');
  });

  it('缺少验签端口：拒绝', async () => {
    const reason = await verifyCatalogIndexSignature(payloadText, ed25519, undefined);
    expect(reason).toContain('验签端口');
  });

  it('结构非法：不进入验签，直接报结构问题', async () => {
    const result = await loadPluginCatalog({ schema: 1, entries: [{ id: 'bad' }] }, {
      payloadText,
      signature: ed25519,
      verifier: verifier(true),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.path === 'entries[0].name')).toBe(true);
  });
});
