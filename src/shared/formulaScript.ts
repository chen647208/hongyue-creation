/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 视图公式脚本（可序列化派生字段层）。
 *
 * 边界：表达式是一棵 JSON 树，求值为纯函数——只读当前行的字段与视图参数，
 * 无网络、无文件、无 `eval`、无对象成员访问；函数白名单之外一律拒绝（deny-by-default）。
 * 这一层不执行插件代码；插件贡献的公式同样走本模块校验后注册。
 */
import { FORMULA_MAX_ARGS, FORMULA_MAX_DEPTH, FORMULA_MAX_NODES } from './constants/views';

/** 公式函数白名单：全部为无副作用的纯函数。 */
export type FormulaFunction =
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'divide'
  | 'min'
  | 'max'
  | 'round'
  | 'abs'
  | 'concat'
  | 'length'
  | 'lower'
  | 'upper'
  | 'if'
  | 'coalesce';

export const FORMULA_FUNCTIONS: readonly FormulaFunction[] = [
  'add',
  'subtract',
  'multiply',
  'divide',
  'min',
  'max',
  'round',
  'abs',
  'concat',
  'length',
  'lower',
  'upper',
  'if',
  'coalesce',
];

/** 函数元数区间；上界受 FORMULA_MAX_ARGS 约束。 */
const ARITY: Record<FormulaFunction, { min: number; max: number }> = {
  add: { min: 1, max: Number.POSITIVE_INFINITY },
  subtract: { min: 1, max: Number.POSITIVE_INFINITY },
  multiply: { min: 1, max: Number.POSITIVE_INFINITY },
  divide: { min: 2, max: Number.POSITIVE_INFINITY },
  min: { min: 1, max: Number.POSITIVE_INFINITY },
  max: { min: 1, max: Number.POSITIVE_INFINITY },
  round: { min: 1, max: 1 },
  abs: { min: 1, max: 1 },
  concat: { min: 1, max: Number.POSITIVE_INFINITY },
  length: { min: 1, max: 1 },
  lower: { min: 1, max: 1 },
  upper: { min: 1, max: 1 },
  if: { min: 2, max: 3 },
  coalesce: { min: 1, max: Number.POSITIVE_INFINITY },
};

export type FormulaLiteral = string | number | boolean | null;

/** 可序列化公式表达式：字段、参数、字面量或白名单函数调用。 */
export type FormulaExpr =
  | { kind: 'field'; key: string }
  | { kind: 'param'; name: string }
  | { kind: 'literal'; value: FormulaLiteral }
  | { kind: 'call'; fn: FormulaFunction; args: FormulaExpr[] };

export interface FormulaLimits {
  maxNodes: number;
  maxDepth: number;
  maxArgs: number;
}

export const DEFAULT_FORMULA_LIMITS: FormulaLimits = {
  maxNodes: FORMULA_MAX_NODES,
  maxDepth: FORMULA_MAX_DEPTH,
  maxArgs: FORMULA_MAX_ARGS,
};

export type FormulaValidation = { ok: true; expr: FormulaExpr } | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 校验并规范化公式表达式；未知 kind、未知函数、非法操作数或超限一律拒绝。
 * 缺省上限来自 shared/constants/views，调用方可用传入 limits 收紧。
 */
export function validateFormulaExpr(raw: unknown, limits: FormulaLimits = DEFAULT_FORMULA_LIMITS): FormulaValidation {
  let nodes = 0;

  const walk = (value: unknown, depth: number): FormulaValidation => {
    if (depth > limits.maxDepth) return { ok: false, reason: `公式嵌套超过上限 ${limits.maxDepth}` };
    nodes += 1;
    if (nodes > limits.maxNodes) return { ok: false, reason: `公式节点超过上限 ${limits.maxNodes}` };
    if (!isRecord(value)) return { ok: false, reason: '公式节点必须是对象' };
    switch (value.kind) {
      case 'field': {
        if (typeof value.key !== 'string' || value.key === '') return { ok: false, reason: 'field 缺 key' };
        return { ok: true, expr: { kind: 'field', key: value.key } };
      }
      case 'param': {
        if (typeof value.name !== 'string' || value.name === '') return { ok: false, reason: 'param 缺 name' };
        return { ok: true, expr: { kind: 'param', name: value.name } };
      }
      case 'literal': {
        const literal = value.value;
        if (literal !== null && typeof literal !== 'string' && typeof literal !== 'number' && typeof literal !== 'boolean') {
          return { ok: false, reason: 'literal 只接受字符串/数字/布尔/null' };
        }
        return { ok: true, expr: { kind: 'literal', value: literal } };
      }
      case 'call': {
        const fn = value.fn;
        if (typeof fn !== 'string' || !(FORMULA_FUNCTIONS as readonly string[]).includes(fn)) {
          return { ok: false, reason: `未知公式函数：${String(fn)}` };
        }
        if (!Array.isArray(value.args)) return { ok: false, reason: 'call 缺 args 数组' };
        const arity = ARITY[fn as FormulaFunction];
        if (value.args.length < arity.min || value.args.length > Math.min(arity.max, limits.maxArgs)) {
          return { ok: false, reason: `函数 ${fn} 参数个数 ${value.args.length} 越界` };
        }
        const args: FormulaExpr[] = [];
        for (const arg of value.args) {
          const parsed = walk(arg, depth + 1);
          if (!parsed.ok) return parsed;
          args.push(parsed.expr);
        }
        return { ok: true, expr: { kind: 'call', fn: fn as FormulaFunction, args } };
      }
      default:
        return { ok: false, reason: `未知公式节点：${String((value as Record<string, unknown>).kind)}` };
    }
  };

  return walk(raw, 1);
}

/** 求值作用域：字段与参数取值函数，由视图层按行提供。 */
export interface FormulaScope {
  field(key: string): unknown;
  param(name: string): unknown;
}

export type FormulaEvaluation = { ok: true; value: string } | { ok: false; reason: string };

/** 数字显示：整数原样，其余最多两位小数。 */
export function formatFormulaNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 100) / 100);
}

/** 字段/字面量的显示文本：日期对象按 年-月-日，数组逗号连接，其余原样。 */
export function formulaDisplay(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const date = value as { display?: unknown; year?: unknown; month?: unknown; day?: unknown };
  if (typeof date.display === 'string' && date.display !== '') return date.display;
  if (typeof date.year === 'number') {
    const parts = [date.year, date.month, date.day].filter((part): part is number => typeof part === 'number');
    return parts.join('-');
  }
  if (Array.isArray(value)) return value.map(formulaDisplay).filter((text) => text !== '').join(', ');
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function formulaNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formulaTruthy(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    return trimmed !== '' && trimmed !== 'false';
  }
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

type EvalResult = { ok: true; value: unknown } | { ok: false; reason: string };

/**
 * 求值公式表达式。只读 scope 提供的字段与参数；任何缺失/类型不符返回失败原因，
 * 由调用方决定展示（视图层失败即空串）。
 */
export function evaluateFormulaExpr(expr: FormulaExpr, scope: FormulaScope, limits: FormulaLimits = DEFAULT_FORMULA_LIMITS): FormulaEvaluation {
  let nodes = 0;
  const budget = {
    spend(depth: number): string | null {
      if (depth > limits.maxDepth) return `公式嵌套超过上限 ${limits.maxDepth}`;
      nodes += 1;
      if (nodes > limits.maxNodes) return `公式节点超过上限 ${limits.maxNodes}`;
      return null;
    },
  };

  const evaluate = (node: FormulaExpr, depth: number): EvalResult => {
    const overspend = budget.spend(depth);
    if (overspend) return { ok: false, reason: overspend };

    switch (node.kind) {
      case 'field':
        return { ok: true, value: scope.field(node.key) };
      case 'param':
        return { ok: true, value: scope.param(node.name) };
      case 'literal':
        return { ok: true, value: node.value };
      case 'call':
        break;
      default:
        return { ok: false, reason: '未知公式节点' };
    }

    const args: unknown[] = [];
    for (const arg of node.args) {
      const result = evaluate(arg, depth + 1);
      if (!result.ok) return result;
      args.push(result.value);
    }
    const numbers = args.map(formulaNumber).filter((value): value is number => value !== null);
    switch (node.fn) {
      case 'add':
        return numbers.length === 0 ? { ok: false, reason: 'add 无数值参数' } : { ok: true, value: numbers.reduce((sum, value) => sum + value, 0) };
      case 'subtract':
        return numbers.length === 0 ? { ok: false, reason: 'subtract 无数值参数' } : { ok: true, value: numbers.reduce((diff, value) => diff - value) };
      case 'multiply':
        return numbers.length === 0 ? { ok: false, reason: 'multiply 无数值参数' } : { ok: true, value: numbers.reduce((product, value) => product * value, 1) };
      case 'divide': {
        const head = numbers[0];
        const divisor = numbers.slice(1).reduce((product, value) => product * value, 1);
        if (head === undefined || numbers.length < 2 || divisor === 0) return { ok: false, reason: 'divide 除数缺失或为零' };
        return { ok: true, value: head / divisor };
      }
      case 'min':
        return numbers.length === 0 ? { ok: false, reason: 'min 无数值参数' } : { ok: true, value: Math.min(...numbers) };
      case 'max':
        return numbers.length === 0 ? { ok: false, reason: 'max 无数值参数' } : { ok: true, value: Math.max(...numbers) };
      case 'round': {
        const value = numbers[0];
        return value === undefined ? { ok: false, reason: 'round 缺少数值参数' } : { ok: true, value: Math.round(value) };
      }
      case 'abs': {
        const value = numbers[0];
        return value === undefined ? { ok: false, reason: 'abs 缺少数值参数' } : { ok: true, value: Math.abs(value) };
      }
      case 'concat':
        return { ok: true, value: args.map(formulaDisplay).filter((text) => text !== '').join(' ') };
      case 'length':
        return { ok: true, value: formulaDisplay(args[0]).length };
      case 'lower':
        return { ok: true, value: formulaDisplay(args[0]).toLowerCase() };
      case 'upper':
        return { ok: true, value: formulaDisplay(args[0]).toUpperCase() };
      case 'if':
        return formulaTruthy(args[0]) ? { ok: true, value: args[1] } : { ok: true, value: args[2] ?? '' };
      case 'coalesce': {
        for (const arg of args) {
          const text = formulaDisplay(arg);
          if (text !== '') return { ok: true, value: arg };
        }
        return { ok: true, value: '' };
      }
      default:
        return { ok: false, reason: '未知公式函数' };
    }
  };

  const result = evaluate(expr, 1);
  if (!result.ok) return result;
  return { ok: true, value: formulaDisplay(result.value) };
}
