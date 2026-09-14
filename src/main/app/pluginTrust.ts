/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 主进程持有时受信任插件签名公钥集：签名校验只认主进程清单，渲染层不得自定锚点。 */
import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

import { logger } from '../logger.js';

let trusted: Set<string> = new Set();
let loaded = false;

function storeFile(): string {
  return path.join(app.getPath('userData'), 'plugin-trusted-keys.json');
}

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  try {
    const parsed = JSON.parse(fs.readFileSync(storeFile(), 'utf-8')) as unknown;
    trusted = new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []);
  } catch {
    trusted = new Set();
  }
}

function persist(): void {
  try {
    fs.writeFileSync(storeFile(), JSON.stringify([...trusted]), 'utf-8');
  } catch (error) {
    logger.warn('plugin', '信任键写盘失败', error);
  }
}

/** 整体替换信任清单（设置面板保存时同步）。 */
export function setTrustedPluginKeys(keys: readonly string[]): void {
  ensureLoaded();
  trusted = new Set(keys.filter((key) => typeof key === 'string' && key.length > 0));
  persist();
}

export function listTrustedPluginKeys(): string[] {
  ensureLoaded();
  return [...trusted];
}

export function isTrustedPluginKey(publicKeyPem: string): boolean {
  ensureLoaded();
  return trusted.has(publicKeyPem);
}
