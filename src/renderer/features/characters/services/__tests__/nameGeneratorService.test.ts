/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect, it } from 'vitest';

import { generateName, generateNames, pickRandom } from '../nameGeneratorService';

describe('nameGeneratorService', () => {
  it('pickRandom 用注入随机源选首项', () => {
    expect(pickRandom(['a', 'b', 'c'], () => 0)).toBe('a');
    expect(pickRandom(['a', 'b', 'c'], () => 0.99)).toBe('c');
  });

  it('随机名由姓与名组成', () => {
    const name = generateName('male', () => 0);
    expect(name).toBe('李浩然');
    expect(generateName('female', () => 0).length).toBeGreaterThanOrEqual(2);
  });

  it('批量取名数量正确', () => {
    expect(generateNames(5)).toHaveLength(5);
  });
});
