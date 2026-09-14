/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 全局对话框服务 —— 用应用内可访问模态框替代原生 alert/confirm。
 *
 * 原生弹窗在 Electron/浏览器里阻塞、风格不统一、且可能被拦截；这里提供一个与 React
 * 解耦的单例：任意组件或服务都能 `await dialogService.confirm(...)` / `dialogService.alert(...)`，
 * 由挂载在应用根部的 <DialogHost/> 负责渲染与回执。多个请求按 FIFO 队列逐个弹出。
 */

export type ConfirmOptions = {
  message: string;
  title?: string;
  confirmText?: string;
  cancelText?: string;
  /** 破坏性操作：确认按钮用红色强调 */
  danger?: boolean;
};

export type AlertOptions = {
  message: string;
  title?: string;
  confirmText?: string;
  tone?: 'info' | 'success' | 'error' | 'warning';
};

export type PromptOptions = {
  message: string;
  title?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
};

type DialogRequest =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: 'alert'; options: AlertOptions; resolve: () => void }
  | { kind: 'prompt'; options: PromptOptions; resolve: (value: string | null) => void };

type Listener = (queue: readonly DialogRequest[]) => void;

class DialogService {
  private queue: DialogRequest[] = [];
  private readonly listeners = new Set<Listener>();

  /** 询问用户：确认返回 true，取消返回 false。 */
  confirm(options: ConfirmOptions | string): Promise<boolean> {
    const opts: ConfirmOptions = typeof options === 'string' ? { message: options } : options;
    return new Promise<boolean>((resolve) => this.enqueue({ kind: 'confirm', options: opts, resolve }));
  }

  /** 通知用户：即发即忘（返回 void），调用方无需 void/await。 */
  alert(options: AlertOptions | string): void {
    const opts: AlertOptions = typeof options === 'string' ? { message: options } : options;
    this.enqueue({ kind: 'alert', options: opts, resolve: () => {} });
  }

  /** 询问用户输入文本：确认返回输入的字符串，取消返回 null。 */
  prompt(options: PromptOptions | string): Promise<string | null> {
    const opts: PromptOptions = typeof options === 'string' ? { message: options } : options;
    return new Promise<string | null>((resolve) => this.enqueue({ kind: 'prompt', options: opts, resolve }));
  }

  /**
   * 宿主完成队首对话框：
   * - confirm：value 有意义（true=确认）
   * - alert：忽略参数
   * - prompt：value=true 时以 text（缺省空串）回执，value=false 时回执 null（取消）
   */
  settle(value: boolean, text?: string): void {
    const req = this.queue.shift();
    if (!req) return;
    if (req.kind === 'confirm') req.resolve(value);
    else if (req.kind === 'alert') req.resolve();
    else req.resolve(value ? (text ?? '') : null);
    this.emit();
  }

  /** 当前是否有全局对话框在展示（用于让功能弹窗让位，不响应外部点击/ Esc 关闭）。 */
  isOpen(): boolean {
    return this.queue.length > 0;
  }

  /** 订阅当前队列快照（含立即回调一次），返回取消订阅函数。 */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener([...this.queue]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** 丢弃全部挂起请求（各自以“取消”回执），用于测试或路由切换等场景。 */
  clear(): void {
    const pending = this.queue;
    this.queue = [];
    for (const req of pending) {
      if (req.kind === 'confirm') req.resolve(false);
      else if (req.kind === 'alert') req.resolve();
      else req.resolve(null);
    }
    this.emit();
  }

  private enqueue(req: DialogRequest): void {
    this.queue.push(req);
    this.emit();
  }

  private emit(): void {
    const snapshot = [...this.queue];
    for (const listener of this.listeners) listener(snapshot);
  }
}

export const dialogService = new DialogService();
