/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 书库屏：在自身内部订阅 projects/activeProjectId，避免工作台编辑时
 * 让整个 App 因 projects 数组变化而重渲染（design/26 第 H 项）。
 */
import React from 'react';

import { useProjectStore } from '@/app/stores/projectStore';

import Bookshelf from './Bookshelf';

type BookshelfProps = React.ComponentProps<typeof Bookshelf>;

export const BookshelfScreen = React.memo(function BookshelfScreen(props: Omit<BookshelfProps, 'books' | 'activeBookId'>) {
  const books = useProjectStore((s) => s.projects);
  const activeBookId = useProjectStore((s) => s.activeProjectId);
  return <Bookshelf {...props} books={books} activeBookId={activeBookId} />;
});
