/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import {
  DEFAULT_FORMULA_LIMITS,
  evaluateFormulaExpr,
  type FormulaExpr,
  type FormulaScope,
  validateFormulaExpr,
} from '@shared/formulaScript';
import { describe, expect, it } from 'vitest';

const scope: FormulaScope = {
  field: (key) => ({ wordCount: 11, zero: 0, title: '主角', empty: '' })[key],
  param: (name) => ({ rate: 2 })[name],
};

function nest(depth: number): FormulaExpr {
  let expr: FormulaExpr = { kind: 'literal', value: 1 };
  for (let index = 0; index < depth; index += 1) expr = { kind: 'call', fn: 'add', args: [expr] };
  return expr;
}

describe('validateFormulaExpr（deny-by-default）', () => {
  it('接受字段/参数/字面量与白名单函数', () => {
    expect(validateFormulaExpr({ kind: 'field', key: 'wordCount' }).ok).toBe(true);
    expect(validateFormulaExpr({ kind: 'param', name: 'rate' }).ok).toBe(true);
    expect(validateFormulaExpr({ kind: 'literal', value: 1 }).ok).toBe(true);
    expect(validateFormulaExpr({ kind: 'call', fn: 'if', args: [{ kind: 'literal', value: true }, { kind: 'literal', value: 1 }] }).ok).toBe(true);
  });

  it('拒绝未知函数、未知节点与非法字面量', () => {
    expect(validateFormulaExpr({ kind: 'call', fn: 'eval', args: [] }).ok).toBe(false);
    expect(validateFormulaExpr({ kind: 'member', key: 'x' }).ok).toBe(false);
    expect(validateFormulaExpr({ kind: 'literal', value: { a: 1 } }).ok).toBe(false);
    expect(validateFormulaExpr('not-a-node').ok).toBe(false);
  });

  it('拒绝超出深度/节点/参数上限的表达式', () => {
    const tight = { maxNodes: 100, maxDepth: 3, maxArgs: 2 };
    expect(validateFormulaExpr(nest(5), tight).ok).toBe(false);
    expect(validateFormulaExpr({ kind: 'call', fn: 'add', args: [nest(20)] }).ok).toBe(false);
    const threeArgs = { kind: 'call', fn: 'abs', args: [{ kind: 'literal', value: 1 }, { kind: 'literal', value: 2 }, { kind: 'literal', value: 3 }] };
    expect(validateFormulaExpr(threeArgs, tight).ok).toBe(false);
  });

  it('缺省上限导出有效值', () => {
    expect(DEFAULT_FORMULA_LIMITS.maxNodes).toBeGreaterThan(0);
    expect(DEFAULT_FORMULA_LIMITS.maxDepth).toBeGreaterThan(0);
  });
});

function evalValue(expr: FormulaExpr): string | undefined {
  const result = evaluateFormulaExpr(expr, scope);
  return result.ok ? result.value : undefined;
}

describe('evaluateFormulaExpr（纯函数）', () => {
  it('四则、极值、文本与条件', () => {
    expect(evalValue({ kind: 'call', fn: 'add', args: [{ kind: 'field', key: 'wordCount' }, { kind: 'literal', value: 4 }] })).toBe('15');
    expect(evalValue({ kind: 'call', fn: 'divide', args: [{ kind: 'field', key: 'wordCount' }, { kind: 'param', name: 'rate' }] })).toBe('5.5');
    const conditional: FormulaExpr = {
      kind: 'call',
      fn: 'if',
      args: [{ kind: 'field', key: 'zero' }, { kind: 'literal', value: 'yes' }, { kind: 'literal', value: 'no' }],
    };
    expect(evalValue(conditional)).toBe('no');
    expect(evalValue({ kind: 'call', fn: 'coalesce', args: [{ kind: 'field', key: 'empty' }, { kind: 'field', key: 'title' }] })).toBe('主角');
    expect(evalValue({ kind: 'call', fn: 'upper', args: [{ kind: 'field', key: 'title' }] })).toBe('主角');
  });

  it('除零、缺字段与未知节点返回失败而非抛出', () => {
    expect(evaluateFormulaExpr({ kind: 'call', fn: 'divide', args: [{ kind: 'literal', value: 1 }, { kind: 'literal', value: 0 }] }, scope)).toEqual({
      ok: false,
      reason: expect.any(String),
    });
    expect(evaluateFormulaExpr({ kind: 'call', fn: 'multiply', args: [{ kind: 'field', key: 'missing' }] }, scope).ok).toBe(false);
    expect(evaluateFormulaExpr({ kind: 'member', key: 'x' } as never, scope).ok).toBe(false);
  });

  it('求值同样受节点/深度配额约束', () => {
    const tiny = { maxNodes: 2, maxDepth: 2, maxArgs: 4 };
    expect(evaluateFormulaExpr(nest(5), scope, tiny).ok).toBe(false);
  });
});
