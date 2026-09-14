/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 编辑器上下文单源：发布后可读回，清空后回落空态。 */
import { afterEach, describe, expect, it } from 'vitest';

import { getEditorContext, resetEditorContext, setEditorContext } from '../editorContextService';

afterEach(() => {
  resetEditorContext();
});

describe('editorContextService', () => {
  it('发布活动章节与选中文本后读回', () => {
    setEditorContext({ chapterId: 'ch1', selectionText: '林渊' });
    expect(getEditorContext()).toEqual({ chapterId: 'ch1', selectionText: '林渊' });
  });

  it('重置后回落空态', () => {
    setEditorContext({ chapterId: 'ch1' });
    resetEditorContext();
    expect(getEditorContext()).toEqual({ chapterId: undefined, selectionText: undefined });
  });
});
