/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 删除守卫（docs/design/35 §6）：破坏性操作先二次确认，确认期间吞掉重复触发。
 *
 * 触控场景双击/连点会连续投递两次点击事件，若不加守卫会发出两次删除请求；
 * 守卫在确认未返回前把后续调用直接拒绝（返回 false），确认通过后才执行删除。
 */

import { type ConfirmOptions,dialogService } from './dialogService';

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

/** 创建守卫：confirm 可注入（测试用），缺省走全局 dialogService。 */
export function createDeleteGuard(confirm: ConfirmFn = (options) => dialogService.confirm(options)) {
  let pending = false;

  /**
   * 请求一次删除：先确认再执行。
   * 返回 true 表示已确认且 task 执行完成；false 表示被取消或重复触发被忽略。
   */
  return async function requestDelete(
    task: () => void | Promise<void>,
    options: ConfirmOptions,
  ): Promise<boolean> {
    if (pending) return false;
    pending = true;
    try {
      const confirmed = await confirm(options);
      if (!confirmed) return false;
      await task();
      return true;
    } finally {
      pending = false;
    }
  };
}
