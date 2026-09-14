/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * MCP 客户端最小实现（docs/design/14）：stdio 上 newline-delimited JSON-RPC，
 * 与自家 server.ts 同帧格式。只实现客户端需要的最小集：
 * initialize / notifications/initialized / tools/list / tools/call。
 * 零依赖（child_process 为 Node 内置）。
 */
import { type ChildProcess,spawn } from 'node:child_process';

export interface McpToolDef {
  name: string;
  description?: string;
  inputSchema?: unknown;
  /** MCP annotations：readOnlyHint 为真即只读（宿主据此直通，不走审批）。 */
  annotations?: { readOnlyHint?: boolean };
  /** MCP 扩展元数据（`_meta`）；提案工具标记 `hongyue/proposal`。 */
  _meta?: Record<string, unknown>;
}

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

const PROTOCOL_VERSION = '2025-03-26';
const DEFAULT_TIMEOUT_MS = 15000;

export class MinimalMcpClient {
  private proc: ChildProcess | null = null;
  private buffer = '';
  private seq = 0;
  private readonly pending = new Map<number, PendingCall>();
  private readonly timeoutMs: number;

  constructor(
    private readonly command: string,
    private readonly args: string[] = [],
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {
    this.timeoutMs = timeoutMs;
  }

  /** 拉起进程并完成 initialize 握手。 */
  async start(): Promise<void> {
    if (this.proc) return;
    const proc = spawn(this.command, this.args, { stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc = proc;
    proc.on('error', (err) => this.failAll(err instanceof Error ? err : new Error(String(err))));
    proc.on('exit', () => this.failAll(new Error('MCP server 进程已退出')));
    proc.stdout?.on('data', (chunk: Buffer) => this.onData(chunk.toString('utf-8')));
    const hello = (await this.request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'hongyue-creation', version: '1.0.0' },
    })) as { protocolVersion?: string };
    if (!hello || typeof hello !== 'object') {
      throw new Error('MCP initialize 无响应');
    }
    this.notify('notifications/initialized', {});
  }

  async listTools(): Promise<McpToolDef[]> {
    const res = (await this.request('tools/list', {})) as { tools?: McpToolDef[] };
    return Array.isArray(res?.tools) ? res.tools : [];
  }

  async callTool(name: string, args: unknown): Promise<unknown> {
    return this.request('tools/call', { name, arguments: args ?? {} });
  }

  async close(): Promise<void> {
    this.failAll(new Error('client closed'));
    const proc = this.proc;
    this.proc = null;
    if (proc && !proc.killed) {
      proc.kill();
    }
  }

  private notify(method: string, params: unknown): void {
    this.proc?.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const proc = this.proc;
    if (!proc?.stdin) return Promise.reject(new Error('MCP client 未启动'));
    this.seq += 1;
    const id = this.seq;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP 请求超时：${method}`));
      }, this.timeoutMs);
      // timer 过期不拖住进程退出
      timer.unref?.();
      this.pending.set(id, { resolve, reject, timer });
      proc.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let idx = this.buffer.indexOf('\n');
    while (idx >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (line) this.onLine(line);
      idx = this.buffer.indexOf('\n');
    }
  }

  private onLine(line: string): void {
    let msg: { id?: number; result?: unknown; error?: { message?: string } };
    try {
      msg = JSON.parse(line) as typeof msg;
    } catch {
      return; // 非 JSON 行（server 日志）忽略
    }
    if (msg.id === undefined) return; // 通知无需处理
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);
    clearTimeout(pending.timer);
    if (msg.error) pending.reject(new Error(msg.error.message ?? 'MCP error'));
    else pending.resolve(msg.result);
  }

  private failAll(err: Error): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }
}
