/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import { app } from 'electron';

export type LogLevel = 'info' | 'warn' | 'error';

/** 单个日志文件超过该大小后轮转为 .1.log（覆盖旧备份） */
const MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024;
/** 保留最近多少天的日志，超出自动清理 */
const MAX_LOG_AGE_DAYS = 7;
const LOG_FILE_PREFIX = 'main-';

function dayStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * 主进程文件日志器。
 * - 按天分文件，写入 userData/logs/main-YYYY-MM-DD.log
 * - 所有写入串行排队，保证顺序且不阻塞彼此
 * - 日志失败绝不抛出（日志问题不能拖垮应用）
 */
class MainLogger {
  private logDir: string | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private pruned = false;
  /** 当前日志文件路径与已写字节数，避免每行 stat。 */
  private currentFile: string | null = null;
  private currentBytes = 0;

  private ensureLogFile(now: Date): string {
    if (!this.logDir) {
      this.logDir = path.join(app.getPath('userData'), 'logs');
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    return path.join(this.logDir, `${LOG_FILE_PREFIX}${dayStamp(now)}.log`);
  }

  private pruneOldLogs(logDir: string): void {
    const cutoff = Date.now() - MAX_LOG_AGE_DAYS * 24 * 60 * 60 * 1000;
    for (const name of fs.readdirSync(logDir)) {
      if (!name.startsWith(LOG_FILE_PREFIX) || !name.endsWith('.log')) continue;
      const full = path.join(logDir, name);
      try {
        if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
      } catch {
        // 单个文件清理失败不影响其余
      }
    }
  }

  private async appendLine(line: string, now: Date): Promise<void> {
    const file = this.ensureLogFile(now);
    if (!this.pruned && this.logDir) {
      this.pruned = true;
      try {
        this.pruneOldLogs(this.logDir);
      } catch {
        // 忽略清理失败
      }
    }
    try {
      if (file !== this.currentFile) {
        this.currentFile = file;
        this.currentBytes = await fsp.stat(file).then((stat) => stat.size).catch(() => 0);
      }
      if (this.currentBytes > MAX_LOG_SIZE_BYTES) {
        await fsp.rename(file, `${file.slice(0, -4)}.1.log`).catch(() => undefined);
        this.currentBytes = 0;
      }
      await fsp.appendFile(file, line, 'utf-8');
      this.currentBytes += Buffer.byteLength(line, 'utf-8');
    } catch {
      // 写日志失败时静默降级为仅控制台输出
    }
  }

  log(level: LogLevel, scope: string, message: string, error?: unknown): void {
    const now = new Date();
    let detail = '';
    if (error instanceof Error) {
      detail = ` :: ${error.stack ?? error.message}`;
    } else if (error !== undefined) {
      detail = ` :: ${String(error)}`;
    }
    const line = `${now.toISOString()} [${level.toUpperCase()}] [${scope}] ${message}${detail}\n`;

    const mirror = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    mirror(`[${scope}]`, message, error ?? '');

    this.writeChain = this.writeChain.then(() => this.appendLine(line, now)).catch(() => undefined);
  }

  info(scope: string, message: string): void {
    this.log('info', scope, message);
  }

  warn(scope: string, message: string, error?: unknown): void {
    this.log('warn', scope, message, error);
  }

  error(scope: string, message: string, error?: unknown): void {
    this.log('error', scope, message, error);
  }
}

export const logger = new MainLogger();
