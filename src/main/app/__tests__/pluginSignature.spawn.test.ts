/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { generateKeyPairSync, sign } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  status: 0,
  throws: false,
  calls: [] as Array<{ cmd: string; args: string[] }>,
}));

vi.mock('node:child_process', () => ({
  spawnSync: (cmd: string, args: string[]): { status: number } => {
    state.calls.push({ cmd, args });
    if (state.throws) throw new Error('spawn failed');
    return { status: state.status };
  },
}));

import {
  buildCosignVerifyArgs,
  cosignAvailable,
  resolveCosignBin,
  sha256Base64,
  verifyCosignBlob,
  verifyEd25519,
} from '../pluginSignature.js';

describe('pluginSignature（外部 cosign 边界）', () => {
  beforeEach(() => {
    state.status = 0;
    state.throws = false;
    state.calls = [];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolveCosignBin 优先环境变量并去除空白', () => {
    expect(resolveCosignBin()).toBe('cosign');
    vi.stubEnv('HONGYUE_COSIGN_BIN', '  /opt/cosign  ');
    expect(resolveCosignBin()).toBe('/opt/cosign');
    vi.stubEnv('HONGYUE_COSIGN_BIN', '   ');
    expect(resolveCosignBin()).toBe('cosign');
  });

  it('cosignAvailable 以退出码判定，spawn 异常视为不可用', () => {
    expect(cosignAvailable()).toBe(true);
    state.status = 1;
    expect(cosignAvailable()).toBe(false);
    state.throws = true;
    expect(cosignAvailable()).toBe(false);
  });

  it('verifyCosignBlob 缺信任锚直接拒绝，不调用 cosign', () => {
    expect(verifyCosignBlob('content', { bundle: 'b64' })).toBe(false);
    expect(state.calls).toHaveLength(0);
  });

  it('verifyCosignBlob key 模式按退出码返回结果', () => {
    expect(verifyCosignBlob('content', { bundle: Buffer.from('b').toString('base64'), publicKey: 'pem' })).toBe(true);
    expect(state.calls[0]?.args).toEqual(['version']);
    expect(state.calls[1]?.args[0]).toBe('verify-blob');
    expect(state.calls[1]?.args).toContain('--key');

    state.status = 1;
    expect(verifyCosignBlob('content', { bundle: 'b64', publicKey: 'pem' })).toBe(false);
  });

  it('verifyCosignBlob keyless 模式携带身份与签发方', () => {
    const result = verifyCosignBlob('content', {
      bundle: 'b64',
      certificateIdentity: 'id@example.com',
      certificateOidcIssuer: 'https://issuer',
    });
    expect(result).toBe(true);
    const args = state.calls[1]?.args ?? [];
    expect(args).toContain('--certificate-identity');
    expect(args).toContain('id@example.com');
    expect(args).toContain('--certificate-oidc-issuer');
    expect(args).toContain('https://issuer');
  });

  it('verifyCosignBlob 在 spawn 抛错时返回 false', () => {
    state.throws = true;
    expect(verifyCosignBlob('content', { bundle: 'b64', publicKey: 'pem' })).toBe(false);
  });

  it('buildCosignVerifyArgs 省略可选字段', () => {
    expect(buildCosignVerifyArgs({ blob: '/tmp/blob', bundle: '/tmp/bundle' })).toEqual([
      'verify-blob',
      '--bundle',
      '/tmp/bundle',
      '/tmp/blob',
    ]);
  });

  it('sha256Base64 接受字节数组，verifyEd25519 拒绝非法 PEM', () => {
    const digest = sha256Base64(new Uint8Array([1, 2, 3]));
    expect(digest).toBe(sha256Base64(Buffer.from([1, 2, 3])));
    expect(verifyEd25519('x', 'c2ln', 'not a pem')).toBe(false);
  });

  it('verifyEd25519 对字节内容做 detached 校验', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const content = Buffer.from('plugin-bytes');
    const signature = sign(null, content, privateKey).toString('base64');
    expect(verifyEd25519(content, signature, pem)).toBe(true);
    expect(verifyEd25519(Buffer.from('tampered'), signature, pem)).toBe(false);
  });
});
