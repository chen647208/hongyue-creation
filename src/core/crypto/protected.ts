/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 逐条目加密（docs/design/03 protected session）。
 *
 * AES-256-GCM + PBKDF2（210k 迭代，随机盐 + 随机 IV）。密钥只存在于
 * 会话内存（CryptoKey 不可导出），口令不落盘；加密节点以信封字符串
 * 存入节点正文（`enc.v1:<base64>`），未解锁时渲染为占位。
 * WebCrypto 在渲染端与 Node 20+ 均原生可用，测试无需 mock。
 */

const PBKDF2_ITERATIONS = 210_000;
const ENVELOPE_PREFIX = 'enc.v1:';

export function isEncryptedEnvelope(body: string): boolean {
  return body.startsWith(ENVELOPE_PREFIX);
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<{ key: CryptoKey; salt: Uint8Array }> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return { key, salt };
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

/** 加密正文 → 信封字符串（salt.iv.ciphertext 全 base64）。 */
export async function encryptBody(body: string, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const { key } = await deriveKey(passphrase, salt);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(body));
  return `${ENVELOPE_PREFIX}${toBase64(salt)}.${toBase64(iv)}.${toBase64(new Uint8Array(cipher))}`;
}

/** 解密信封；口令错误或数据损坏抛错（调用方提示，绝不安数返回）。 */
export async function decryptBody(envelope: string, passphrase: string): Promise<string> {
  if (!isEncryptedEnvelope(envelope)) throw new Error('不是加密信封');
  const payload = envelope.slice(ENVELOPE_PREFIX.length);
  const [saltB64, ivB64, dataB64] = payload.split('.');
  if (!saltB64 || !ivB64 || !dataB64) throw new Error('信封格式损坏');
  const { key } = await deriveKey(passphrase, fromBase64(saltB64));
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(ivB64) }, key, fromBase64(dataB64));
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error('解密失败：口令错误或数据损坏');
  }
}

/** 受保护会话：口令驻留内存（会话级），按信封盐缓存派生密钥；lock 全部抹除。 */
export class ProtectedSession {
  private keys = new Map<string, CryptoKey>();
  private passphrase = '';
  private salt: Uint8Array | null = null;
  private listeners = new Set<() => void>();

  /** 订阅解锁/锁定状态变化（供 UI 响应式刷新）。 */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // 订阅者异常不影响状态变更
      }
    }
  }

  get unlocked(): boolean {
    return this.keys.size > 0;
  }

  /** 用口令解锁。 */
  async unlock(passphrase: string): Promise<void> {
    if (!passphrase) throw new Error('口令不能为空');
    this.passphrase = passphrase;
    this.salt = crypto.getRandomValues(new Uint8Array(16));
    await this.keyFor(this.salt);
    this.notify();
  }

  lock(): void {
    this.keys.clear();
    this.passphrase = '';
    this.salt = null;
    this.notify();
  }

  /** 会话内加密正文（随机 IV，信封自带会话盐）。未解锁抛错。 */
  async encrypt(body: string): Promise<string> {
    if (!this.salt) throw new Error('受保护会话未解锁');
    const key = await this.keyFor(this.salt);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(body));
    return `${ENVELOPE_PREFIX}${toBase64(this.salt)}.${toBase64(iv)}.${toBase64(new Uint8Array(cipher))}`;
  }

  /** 会话内解密信封：按信封自带盐取缓存密钥（跨会话信封同样可解）。 */
  async decrypt(envelope: string): Promise<string> {
    if (!this.keys.size) throw new Error('受保护会话未解锁');
    const payload = envelope.slice(ENVELOPE_PREFIX.length);
    const [saltB64, ivB64, dataB64] = payload.split('.');
    if (!saltB64 || !ivB64 || !dataB64) throw new Error('信封格式损坏');
    const salt = fromBase64(saltB64);
    try {
      const key = await this.keyFor(salt);
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(ivB64) }, key, fromBase64(dataB64));
      return new TextDecoder().decode(plain);
    } catch {
      throw new Error('解密失败：口令错误或数据损坏');
    }
  }

  private async keyFor(salt: Uint8Array): Promise<CryptoKey> {
    const cacheKey = toBase64(salt);
    let key = this.keys.get(cacheKey);
    if (!key) {
      key = (await deriveKey(this.passphrase, salt)).key;
      this.keys.set(cacheKey, key);
    }
    return key;
  }
}
