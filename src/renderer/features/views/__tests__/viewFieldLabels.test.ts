/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { builtinRegistry } from '@core/types-registry';
import { describe, expect, it } from 'vitest';

import { buildTemplateFieldLabels } from '../viewFieldLabels';

describe('buildTemplateFieldLabels', () => {
  it('扩展字段键取类型模板的字段标题', () => {
    const labels = buildTemplateFieldLabels(builtinRegistry.list());
    expect(labels.get('shotNumber')).toBe('镜号');
    expect(labels.get('framing')).toBe('景别');
    expect(labels.get('castingMethod')).toBe('施法方式');
  });

  it('未收录的键不进入表，由调用方回落原键', () => {
    const labels = buildTemplateFieldLabels(builtinRegistry.list());
    expect(labels.has('title')).toBe(false);
    expect(labels.has('不存在的键')).toBe(false);
  });

  it('同名键取模板 id 最小的声明，标题稳定', () => {
    const labels = buildTemplateFieldLabels(builtinRegistry.list());
    // comic.panel 与 storyboard.shot 都声明 image，取 id 更小的 comic.panel。
    expect(labels.get('image')).toBe('画面');
    expect(labels.get('order')).toBe('顺序');
  });

  it('注册表为空时返回空表', () => {
    expect(buildTemplateFieldLabels([]).size).toBe(0);
  });
});
