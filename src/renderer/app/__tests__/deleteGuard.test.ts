/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect, it, vi } from 'vitest';

import { createDeleteGuard } from '../../shared/services/deleteGuard';

const options = { message: '确定删除？', danger: true as const };

describe('createDeleteGuard', () => {
  it('确认后执行删除并返回 true', async () => {
    const task = vi.fn();
    const requestDelete = createDeleteGuard(async () => true);
    await expect(requestDelete(task, options)).resolves.toBe(true);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('取消时不执行删除并返回 false', async () => {
    const task = vi.fn();
    const requestDelete = createDeleteGuard(async () => false);
    await expect(requestDelete(task, options)).resolves.toBe(false);
    expect(task).not.toHaveBeenCalled();
  });

  it('确认未返回前的重复触发被忽略（触控双击只删一次）', async () => {
    let settle: (value: boolean) => void = () => {};
    const confirm = vi.fn(() => new Promise<boolean>((resolve) => { settle = resolve; }));
    const task = vi.fn();
    const requestDelete = createDeleteGuard(confirm);

    const first = requestDelete(task, options);
    const second = requestDelete(task, options);
    await expect(second).resolves.toBe(false);

    settle(true);
    await expect(first).resolves.toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('确认完成后守卫复位，可再次删除', async () => {
    const task = vi.fn();
    const requestDelete = createDeleteGuard(async () => true);
    await requestDelete(task, options);
    await requestDelete(task, options);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('删除抛错也复位守卫，且错误向上抛', async () => {
    const requestDelete = createDeleteGuard(async () => true);
    await expect(requestDelete(() => { throw new Error('落盘失败'); }, options)).rejects.toThrow('落盘失败');
    const task = vi.fn();
    await expect(requestDelete(task, options)).resolves.toBe(true);
    expect(task).toHaveBeenCalledTimes(1);
  });
});
