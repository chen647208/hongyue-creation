/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 本地推理运行时接入（docs/design/40 §5）：进程管理 + 端点探测 + 模型列举。
 *
 * 运行时（如 llama.cpp server / Ollama）由用户自备，不随包分发。主进程负责：
 *   - 按用户配置以子进程启动/停止运行时（不经过 shell，cwd 限定在数据目录子目录）；
 *   - 探测 OpenAI 兼容 `/v1/models` 或 Ollama `/api/tags`，返回可用模型；
 *   - 关闭或不可达时由渲染层回落远程网关（网关契约不变）。
 *
 * 子进程清理：app 退出时统一停止，避免遗留进程。
 */
import { type ChildProcess,spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { app, ipcMain } from 'electron';

import {
  type LocalProbeResult,
  type LocalRuntimeConfig,
  probeLocalEndpoint,
} from '../../core/ai/localInference.js';
import { IPC } from '../channels.js';
import { logger } from '../logger.js';

export class LocalRuntimeManager {
  private child: ChildProcess | null = null;
  private lastEndpoint = '';

  constructor(private readonly workDir: string) {}

  isRunning(): boolean {
    return this.child !== null && this.child.exitCode === null;
  }

  pid(): number | undefined {
    return this.child?.pid;
  }

  /** 启动用户自备运行时；未配置 command 时不启动进程（外部托管）。 */
  start(config: LocalRuntimeConfig): { running: boolean; pid?: number } {
    if (!config.enabled || !config.command) return { running: false };
    if (this.isRunning()) return { running: true, pid: this.pid() };
    fs.mkdirSync(this.workDir, { recursive: true });
    const child = spawn(config.command, config.args ?? [], {
      cwd: this.workDir,
      windowsHide: true,
      stdio: 'ignore',
      // 只透传最小环境，避免把宿主密钥带给本地运行时
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        USERPROFILE: process.env.USERPROFILE,
        SystemRoot: process.env.SystemRoot,
      },
    });
    child.on('error', (error) => logger.warn('local-runtime', '启动本地运行时报错', error));
    child.on('exit', () => {
      if (this.child === child) this.child = null;
    });
    this.child = child;
    this.lastEndpoint = config.endpoint;
    return { running: true, pid: child.pid };
  }

  /** 停止托管的子进程；外部托管的运行时不受影响。 */
  stop(): void {
    if (this.child && this.child.exitCode === null) {
      try {
        this.child.kill();
      } catch (error) {
        logger.warn('local-runtime', '停止本地运行时报错', error);
      }
    }
    this.child = null;
  }

  /** 探测本地端点（mockable fetch 便于测试）。 */
  probe(config: LocalRuntimeConfig, fetchFn: typeof fetch = fetch): Promise<LocalProbeResult> {
    return probeLocalEndpoint(config.endpoint, fetchFn);
  }
}

function configFile(): string {
  return path.join(app.getPath('userData'), 'local-inference.json');
}

export function loadLocalInferenceConfig(): LocalRuntimeConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(configFile(), 'utf-8')) as Record<string, unknown>;
    return {
      enabled: raw.enabled === true,
      endpoint: typeof raw.endpoint === 'string' ? raw.endpoint : '',
      model: typeof raw.model === 'string' ? raw.model : undefined,
      command: typeof raw.command === 'string' ? raw.command : undefined,
      args: Array.isArray(raw.args) ? raw.args.filter((a): a is string => typeof a === 'string') : undefined,
      autoStart: raw.autoStart === true,
    };
  } catch {
    return { enabled: false, endpoint: '' };
  }
}

export function saveLocalInferenceConfig(config: LocalRuntimeConfig): void {
  try {
    fs.writeFileSync(configFile(), JSON.stringify(config), 'utf-8');
  } catch (error) {
    logger.warn('local-runtime', '本地推理配置写盘失败', error);
  }
}

let manager: LocalRuntimeManager | null = null;

function runtimeManager(): LocalRuntimeManager {
  if (!manager) {
    manager = new LocalRuntimeManager(path.join(app.getPath('userData'), 'local-runtime'));
  }
  return manager;
}

/** 注册本地推理 IPC（启动/停止/状态/探测/配置）。 */
export function registerLocalInferenceIpc(): void {
  ipcMain.handle(IPC.local.getConfig, () => loadLocalInferenceConfig());
  ipcMain.handle(IPC.local.setConfig, (_event, config: LocalRuntimeConfig) => {
    saveLocalInferenceConfig({
      enabled: config.enabled === true,
      endpoint: typeof config.endpoint === 'string' ? config.endpoint : '',
      model: typeof config.model === 'string' ? config.model : undefined,
      command: typeof config.command === 'string' ? config.command : undefined,
      args: Array.isArray(config.args) ? config.args : undefined,
      autoStart: config.autoStart === true,
    });
    return { ok: true as const };
  });
  ipcMain.handle(IPC.local.start, () => runtimeManager().start(loadLocalInferenceConfig()));
  ipcMain.handle(IPC.local.stop, () => {
    runtimeManager().stop();
    return { ok: true as const };
  });
  ipcMain.handle(IPC.local.status, () => ({
    running: runtimeManager().isRunning(),
    pid: runtimeManager().pid(),
  }));
  ipcMain.handle(IPC.local.probe, () => runtimeManager().probe(loadLocalInferenceConfig()));
}

/** 退出时停止托管进程。 */
export function shutdownLocalRuntime(): void {
  manager?.stop();
}
