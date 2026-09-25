/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 沙箱宿主（docs/design/21 §4）：每次运行 fork 一个 utilityProcess，把请求发进去等结果。
 * 主进程侧还有一层墙钟兜底：子进程无响应即 kill，保证"死循环不拖垮主进程"。
 */

import { randomUUID } from 'node:crypto';
import { sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { utilityProcess } from 'electron';

import {
  clampSandboxLimits,
  type SandboxRunRequest,
  type SandboxRunResult,
} from '../../../shared/sandbox.js';

export interface SandboxChildHandle {
  postMessage(message: unknown): void;
  onMessage(listener: (message: unknown) => void): void;
  kill(): void;
}

export type SandboxFork = (childPath: string) => SandboxChildHandle;

const defaultFork: SandboxFork = (childPath) => {
  const child = utilityProcess.fork(childPath);
  return {
    postMessage: (message) => child.postMessage(message),
    onMessage: (listener) => {
      child.on('message', (message: unknown) => listener(message));
    },
    kill: () => {
      child.kill();
    },
  };
};

const defaultChildPath = (): string => {
  const path = fileURLToPath(new URL('./sandboxChild.js', import.meta.url));
  // 打包后入口在 asar 内，但 fork 需要真实文件：指向 asar.unpacked 副本
  return path.includes(`app.asar${sep}`) ? path.replace(`app.asar${sep}`, `app.asar.unpacked${sep}`) : path;
};

export class SandboxHost {
  constructor(
    private readonly fork: SandboxFork = defaultFork,
    private readonly childPath: string = defaultChildPath(),
    /** 子进程无响应的兜底宽限（毫秒）。 */
    private readonly graceMs = 1500,
  ) {}

  async run(request: SandboxRunRequest): Promise<SandboxRunResult> {
    // IPC 入口统一钳制（51 篇）：渲染层带来的限额只能下调不能上调默认值
    const limits = clampSandboxLimits(request.limits);
    const id = `sbx_${randomUUID()}`;
    let child: SandboxChildHandle;
    try {
      child = this.fork(this.childPath);
    } catch (error) {
      return { ok: false, error: { kind: 'runtime', message: `无法启动沙箱进程：${String(error)}` } };
    }

    return new Promise<SandboxRunResult>((resolve) => {
      let settled = false;
      const finish = (result: SandboxRunResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          child.kill();
        } catch {
          // 已退出
        }
        resolve(result);
      };

      const timer = setTimeout(() => {
        finish({ ok: false, error: { kind: 'timeout', message: `沙箱进程无响应（>${limits.timeoutMs + this.graceMs}ms），已终止` } });
      }, limits.timeoutMs + this.graceMs);

      try {
        child.onMessage((message) => {
          const payload = message as { id?: string; result?: SandboxRunResult } | undefined;
          if (payload?.id !== id || !payload.result) return;
          finish(payload.result);
        });
        child.postMessage({ id, request });
      } catch (error) {
        finish({ ok: false, error: { kind: 'runtime', message: String(error) } });
      }
    });
  }
}

export const sandboxHost = new SandboxHost();
