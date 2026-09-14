// @vitest-environment jsdom
/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** JSON 后端跑共享 StorageRepository 契约（见 repositoryContract.ts）。 */
import { jsonRepository } from '../jsonRepository';
import { runStorageRepositoryContract } from './repositoryContract';

runStorageRepositoryContract({
  name: 'jsonRepository(localStorage)',
  create: async () => jsonRepository,
  reset: (repo) => repo.clear(),
});
