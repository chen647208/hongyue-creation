/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect, it } from 'vitest';

import { AssistantTaskService } from '../assistantTaskService';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AssistantTaskService', () => {
  it('串行执行：前一个结束后才启动下一个', async () => {
    const service = new AssistantTaskService();
    const order: string[] = [];
    const first = service.enqueue({
      label: 'a',
      run: async () => {
        order.push('a:start');
        await tick();
        order.push('a:end');
        return 1;
      },
    });
    const second = service.enqueue({
      label: 'b',
      run: async () => {
        order.push('b:start');
        order.push('b:end');
        return 2;
      },
    });
    await first.result;
    await second.result;
    expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
  });

  it('中止排队中的任务：不执行，结果为 aborted', async () => {
    const service = new AssistantTaskService();
    let secondRan = false;
    const first = service.enqueue({ label: 'a', run: async () => { await tick(); return 1; } });
    const second = service.enqueue({ label: 'b', run: async () => { secondRan = true; return 2; } });
    service.abort(second.id);
    expect(await second.result).toMatchObject({ status: 'aborted' });
    await first.result;
    expect(secondRan).toBe(false);
  });

  it('中止运行中的任务：signal 被置为 aborted', async () => {
    const service = new AssistantTaskService();
    let aborted = false;
    const handle = service.enqueue({
      label: 'a',
      run: (signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            reject(new Error('aborted'));
          });
        }),
    });
    await tick();
    service.abort(handle.id);
    const outcome = await handle.result;
    expect(aborted).toBe(true);
    expect(outcome.status).toBe('error');
  });

  it('并发上限放开：两个任务并行，第三个排队', async () => {
    const service = new AssistantTaskService(2);
    const started: string[] = [];
    const gates: Array<() => void> = [];
    const make = (label: string) =>
      service.enqueue({
        label,
        run: async () => {
          started.push(label);
          await new Promise<void>((resolve) => gates.push(resolve));
          return label;
        },
      });
    const a = make('a');
    const b = make('b');
    const c = make('c');
    for (let i = 0; i < 50 && started.length < 2; i += 1) await tick();
    expect(started).toEqual(['a', 'b']);
    expect(service.activeCount).toBe(2);

    gates.shift()!(); // a 结束，c 补位
    for (let i = 0; i < 50 && started.length < 3; i += 1) await tick();
    expect(started).toEqual(['a', 'b', 'c']);

    gates.forEach((g) => g());
    await Promise.all([a.result, b.result, c.result]);
    expect(service.activeCount).toBe(0);
  });

  it('hasActive 按书籍过滤，clearFinished 清理已结束', async () => {
    const service = new AssistantTaskService();
    const handle = service.enqueue({ bookId: 'book-1', label: 'a', run: async () => 1 });
    expect(service.hasActive('book-1')).toBe(true);
    expect(service.hasActive('book-2')).toBe(false);
    await handle.result;
    expect(service.hasActive('book-1')).toBe(false);
    expect(service.getSnapshot()).toHaveLength(1);
    service.clearFinished();
    expect(service.getSnapshot()).toHaveLength(0);
  });
});
