/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect, it } from 'vitest';

import { FormulaRegistry, installFormulas } from '../contributions.js';
import { formulaId } from '../manifest.js';

const VALID = {
  id: 'speakDuration',
  label: '口播时长',
  expression: {
    kind: 'call',
    fn: 'divide',
    args: [{ kind: 'field', key: 'wordCount' }, { kind: 'param', name: 'rate' }],
  },
};

describe('FormulaRegistry', () => {
  it('注册、查询与注销', () => {
    const registry = new FormulaRegistry();
    const disposable = registry.register({ id: 'x.one', label: '一', expression: { kind: 'literal', value: 1 } });
    expect(registry.get('x.one')?.label).toBe('一');
    expect(registry.list()).toHaveLength(1);
    disposable.dispose();
    expect(registry.get('x.one')).toBeUndefined();
  });
});

describe('installFormulas', () => {
  it('合法公式按命名空间注册，Disposable 可撤销', () => {
    const registry = new FormulaRegistry();
    const disposables = installFormulas('com.example.plugin', [VALID], registry, formulaId);
    expect(registry.get('plugin.formula.speakDuration')?.label).toBe('口播时长');
    expect(disposables).toHaveLength(1);
    disposables[0]?.dispose();
    expect(registry.list()).toHaveLength(0);
  });

  it('非法/未知函数公式不注册（deny-by-default）', () => {
    const registry = new FormulaRegistry();
    const disposables = installFormulas(
      'com.example.plugin',
      [
        { id: 'evil', label: 'evil', expression: { kind: 'call', fn: 'eval', args: [] } },
        { id: 'noLabel', expression: { kind: 'literal', value: 1 } },
        'not-an-object',
      ],
      registry,
      formulaId,
    );
    expect(disposables).toHaveLength(0);
    expect(registry.list()).toHaveLength(0);
  });
});
