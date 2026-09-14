/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

// @vitest-environment jsdom

import { cleanup,render, screen } from '@testing-library/react';
import { afterEach,describe, expect, it, vi } from 'vitest';

import NewBookModal from '../NewBookModal';

afterEach(cleanup);

describe('NewBookModal 表单可达性', () => {
  it('标题与描述输入框有关联标签，弹层有可访问名', () => {
    render(<NewBookModal isOpen onClose={vi.fn()} onCreate={vi.fn()} />);

    expect(screen.getByLabelText(/书籍标题/)).toBeTruthy();
    expect(screen.getByLabelText(/书籍描述/)).toBeTruthy();
    const dialog = screen.getByRole('dialog', { name: '新建书籍' });
    expect(dialog).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: '新建方式' })).toBeTruthy();
  });
});
