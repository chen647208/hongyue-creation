/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect,it } from 'vitest';

import { annotationIdFromTarget } from '../annotationDecorations';

/** 模拟 DOM 元素：仅在命中选择器时返回带属性的元素。 */
function fakeElement(id: string | null): unknown {
  return {
    closest: (selector: string) =>
      selector === '[data-annotation-id]' && id !== null
        ? { getAttribute: (name: string) => (name === 'data-annotation-id' ? id : null) }
        : null,
  };
}

describe('annotationIdFromTarget', () => {
  it('向上找到批注高亮并取出 id', () => {
    expect(annotationIdFromTarget(fakeElement('anno1'))).toBe('anno1');
  });

  it('目标不含高亮祖先时返回 null', () => {
    expect(annotationIdFromTarget(fakeElement(null))).toBeNull();
    expect(annotationIdFromTarget({ closest: () => null })).toBeNull();
  });

  it('空 id 视为无命中', () => {
    expect(annotationIdFromTarget(fakeElement(''))).toBeNull();
  });

  it('非元素目标安全返回 null', () => {
    expect(annotationIdFromTarget(undefined)).toBeNull();
    expect(annotationIdFromTarget(null)).toBeNull();
    expect(annotationIdFromTarget('text')).toBeNull();
    expect(annotationIdFromTarget({})).toBeNull();
  });
});
