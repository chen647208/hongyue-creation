/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** SQLite 后端（better-sqlite3 与 sqlite-wasm）跑共享 StorageRepository 契约。 */
import { afterEach, describe } from 'vitest';

import { SqliteRepository } from '../sqliteRepository';
import { sqliteFixtures } from './drivers';
import { runStorageRepositoryContract } from './repositoryContract';

for (const fixture of sqliteFixtures) {
  const disposers: Array<() => void> = [];
  afterEach(() => {
    while (disposers.length) disposers.pop()!();
  });

  describe(`引擎：${fixture.name}`, () => {
    runStorageRepositoryContract({
      name: `${fixture.name} → SqliteRepository`,
      create: async () => {
        const ctx = await fixture.create();
        disposers.push(ctx.dispose);
        return new SqliteRepository(ctx.driver);
      },
    });
  });
}
