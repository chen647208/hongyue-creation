/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 助手后台任务（design/14）：把一次 AI 会话运行交给应用级单例，脱离面板生命周期。
 * 并发上限可配（默认 1，串行）；多个会话可并行，事件与上下文按会话 id 隔离
 * （见 aiSessionManager）。面板关闭或切换书籍都不中止；状态栏指示器订阅本服务
 * 显示进度与中止入口。
 */

export type AssistantTaskStatus = 'queued' | 'running' | 'done' | 'error' | 'aborted';

export interface AssistantTaskView {
  id: string;
  /** 任务标签（取用户输入前若干字）。 */
  label: string;
  bookId?: string;
  status: AssistantTaskStatus;
  startedAt: number;
  finishedAt?: number;
}

export interface AssistantTaskOutcome {
  status: 'done' | 'error' | 'aborted';
  value?: unknown;
  error?: string;
}

export interface AssistantTaskHandle {
  id: string;
  result: Promise<AssistantTaskOutcome>;
}

interface InternalTask {
  view: AssistantTaskView;
  controller: AbortController;
  run: (signal: AbortSignal) => Promise<unknown>;
  onSettled: (outcome: AssistantTaskOutcome) => void;
  abort: () => void;
  running: boolean;
  settled: boolean;
}

export class AssistantTaskService {
  private readonly tasks = new Map<string, InternalTask>();
  private queue: string[] = [];
  private runningCount = 0;
  private readonly listeners = new Set<() => void>();
  private cache: AssistantTaskView[] = [];

  /** maxConcurrent 为并行运行上限（缺省 1 = 串行）；排队任务按先入先出补位。 */
  constructor(private readonly maxConcurrent = 1) {}

  /** 当前运行中的任务数（诊断/指示器）。 */
  get activeCount(): number {
    return this.runningCount;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): AssistantTaskView[] => this.cache;

  /** 入队一次后台运行；返回任务 id 与结算 Promise。 */
  enqueue(opts: { bookId?: string; label: string; run: (signal: AbortSignal) => Promise<unknown> }): AssistantTaskHandle {
    const id = crypto.randomUUID();
    const controller = new AbortController();
    let resolveOutcome!: (outcome: AssistantTaskOutcome) => void;
    const result = new Promise<AssistantTaskOutcome>((resolve) => {
      resolveOutcome = resolve;
    });
    const view: AssistantTaskView = {
      id,
      label: opts.label.slice(0, 60),
      bookId: opts.bookId,
      status: 'queued',
      startedAt: Date.now(),
    };
    const task: InternalTask = {
      view,
      controller,
      run: opts.run,
      running: false,
      settled: false,
      onSettled: (outcome) => {
        if (task.settled) return;
        task.settled = true;
        view.status = outcome.status === 'done' ? 'done' : outcome.status === 'aborted' ? 'aborted' : 'error';
        view.finishedAt = Date.now();
        resolveOutcome(outcome);
        this.notify();
      },
      abort: () => {
        if (task.settled) return;
        if (task.running) {
          controller.abort();
          return;
        }
        this.queue = this.queue.filter((q) => q !== id);
        task.onSettled({ status: 'aborted' });
      },
    };
    this.tasks.set(id, task);
    this.queue.push(id);
    this.notify();
    void this.pump();
    return { id, result };
  }

  /** 中止任务：排队中直接移除，运行中触发 abort（由运行方如实回执）。 */
  abort(id: string): void {
    this.tasks.get(id)?.abort();
  }

  /** 指定书籍是否有排队中或运行中的任务。 */
  hasActive(bookId?: string): boolean {
    for (const task of this.tasks.values()) {
      if (task.settled) continue;
      if (bookId === undefined || task.view.bookId === bookId) return true;
    }
    return false;
  }

  /** 清理已结束（done/error/aborted）的任务记录。 */
  clearFinished(): void {
    let changed = false;
    for (const [id, task] of this.tasks) {
      if (task.settled) {
        this.tasks.delete(id);
        changed = true;
      }
    }
    if (changed) this.notify();
  }

  /** 补位泵：并发未满即从队首取任务启动；每个任务结束再泵一次。 */
  private async pump(): Promise<void> {
    while (this.runningCount < this.maxConcurrent) {
      const id = this.queue.shift();
      if (id === undefined) return;
      const task = this.tasks.get(id);
      if (!task || task.settled) continue;
      this.runningCount += 1;
      task.running = true;
      task.view.status = 'running';
      task.view.startedAt = Date.now();
      this.notify();
      void this.runTask(task);
    }
  }

  private async runTask(task: InternalTask): Promise<void> {
    try {
      const value = await task.run(task.controller.signal);
      task.onSettled({ status: 'done', value });
    } catch (error) {
      task.onSettled({ status: 'error', error: error instanceof Error ? error.message : String(error) });
    } finally {
      task.running = false;
      this.runningCount -= 1;
      void this.pump();
    }
  }

  private notify(): void {
    this.cache = [...this.tasks.values()].map((task) => task.view);
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // 单个订阅者异常不影响其余
      }
    }
  }
}

/** 应用级单例：最多两个助手会话并行（多助手会话），其余排队。 */
export const assistantTaskService = new AssistantTaskService(2);
