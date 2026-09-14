/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect, it } from 'vitest';

import type { EntityViewData, QueryCondition, ViewRow } from '../types';
import { aggregateRows, applyViewQuery, evaluateCondition, evaluateFormula } from '../viewQuery';

function makeRows(): ViewRow[] {
  return [
    {
      id: 'c1',
      kind: 'character',
      title: '主角',
      cells: { kind: 'character', title: '主角', summary: '剑士', detail: '' },
      values: { age: 30, role: 'protagonist', note: 'hello world', zero: 0 },
    },
    {
      id: 'c2',
      kind: 'character',
      title: '游侠',
      cells: { kind: 'character', title: '游侠', summary: '', detail: '' },
      values: { age: 20, role: 'supporting', note: '', zero: 0 },
    },
    {
      id: 'e1',
      kind: 'event',
      title: '港城之战',
      cells: { kind: 'event', title: '港城之战', summary: '100-3', detail: '' },
      values: { date: { year: 100, month: 3 }, year: 100 },
    },
    {
      id: 'e2',
      kind: 'event',
      title: '旧日事变',
      cells: { kind: 'event', title: '旧日事变', summary: '90-1', detail: '' },
      values: { date: { year: 90, month: 1 }, year: 90 },
    },
  ];
}

function makeData(rows: ViewRow[]): EntityViewData {
  return {
    columns: [
      { key: 'kind', label: 'views.col.kind' },
      { key: 'title', label: 'views.col.title' },
    ],
    rows,
    links: [
      { source: 'c1', target: 'e1', label: 'involves' },
      { source: 'c2', target: 'e2', label: 'involves' },
    ],
  };
}

describe('evaluateCondition', () => {
  const rows = makeRows();

  it('缺省条件通过全部行', () => {
    expect(rows.every((row) => evaluateCondition(undefined, row))).toBe(true);
  });

  it('文本与数值操作符', () => {
    const eq: QueryCondition = { type: 'leaf', field: 'role', operator: 'eq', value: 'protagonist' };
    expect(evaluateCondition(eq, rows[0]!)).toBe(true);
    expect(evaluateCondition(eq, rows[1]!)).toBe(false);

    const contains: QueryCondition = { type: 'leaf', field: 'note', operator: 'contains', value: 'world' };
    expect(evaluateCondition(contains, rows[0]!)).toBe(true);
    expect(evaluateCondition(contains, rows[1]!)).toBe(false);

    const gt: QueryCondition = { type: 'leaf', field: 'age', operator: 'gt', value: 25 };
    expect(evaluateCondition(gt, rows[0]!)).toBe(true);
    expect(evaluateCondition(gt, rows[1]!)).toBe(false);
  });

  it('空值操作符', () => {
    const empty: QueryCondition = { type: 'leaf', field: 'summary', operator: 'empty' };
    expect(evaluateCondition(empty, rows[1]!)).toBe(true);
    expect(evaluateCondition(empty, rows[0]!)).toBe(false);

    const notEmpty: QueryCondition = { type: 'leaf', field: 'note', operator: 'notEmpty' };
    expect(evaluateCondition(notEmpty, rows[0]!)).toBe(true);
    expect(evaluateCondition(notEmpty, rows[1]!)).toBe(false);
  });

  it('与或非与嵌套分组', () => {
    const and: QueryCondition = {
      type: 'and',
      children: [
        { type: 'leaf', field: 'kind', operator: 'eq', value: 'character' },
        { type: 'leaf', field: 'age', operator: 'gte', value: 25 },
      ],
    };
    expect(evaluateCondition(and, rows[0]!)).toBe(true);
    expect(evaluateCondition(and, rows[1]!)).toBe(false);

    const nested: QueryCondition = {
      type: 'or',
      children: [
        { type: 'leaf', field: 'kind', operator: 'eq', value: 'event' },
        { type: 'and', children: [and] },
      ],
    };
    expect(evaluateCondition(nested, rows[2]!)).toBe(true);
    expect(evaluateCondition(nested, rows[1]!)).toBe(false);

    const not: QueryCondition = { type: 'not', children: [{ type: 'leaf', field: 'kind', operator: 'eq', value: 'event' }] };
    expect(evaluateCondition(not, rows[0]!)).toBe(true);
    expect(evaluateCondition(not, rows[2]!)).toBe(false);
  });
});

describe('evaluateFormula', () => {
  const rows = makeRows();

  it('求和、极值与文本拼接', () => {
    expect(evaluateFormula({ key: 'x', label: 'x', operator: 'add', operands: ['age', 'age'] }, rows[0]!)).toBe('60');
    expect(evaluateFormula({ key: 'x', label: 'x', operator: 'max', operands: ['age', 'zero'] }, rows[0]!)).toBe('30');
    expect(evaluateFormula({ key: 'x', label: 'x', operator: 'concat', operands: ['title', 'summary'] }, rows[0]!)).toBe('主角 剑士');
  });

  it('除零与缺操作数返回空串', () => {
    expect(evaluateFormula({ key: 'x', label: 'x', operator: 'divide', operands: ['age', 'zero'] }, rows[0]!)).toBe('');
    expect(evaluateFormula({ key: 'x', label: 'x', operator: 'add', operands: ['missing'] }, rows[0]!)).toBe('');
  });
});

describe('aggregateRows', () => {
  const rows = makeRows();

  it('计数/求和/均值/最长/最新', () => {
    const results = aggregateRows(rows, [
      { field: 'age', kind: 'count' },
      { field: 'age', kind: 'sum' },
      { field: 'age', kind: 'avg' },
      { field: 'note', kind: 'longest' },
      { field: 'date', kind: 'latest' },
    ]);
    expect(results).toEqual([
      { field: 'age', kind: 'count', value: 4 },
      { field: 'age', kind: 'sum', value: 50 },
      { field: 'age', kind: 'avg', value: 25 },
      { field: 'note', kind: 'longest', value: 11 },
      { field: 'date', kind: 'latest', value: '100-3' },
    ]);
  });

  it('无聚合定义返回空数组', () => {
    expect(aggregateRows(rows, undefined)).toEqual([]);
    expect(aggregateRows(rows, [])).toEqual([]);
  });
});

describe('applyViewQuery', () => {
  it('无查询配置时原样返回并保留布局行为', () => {
    const data = makeData(makeRows());
    const result = applyViewQuery(data, undefined);
    expect(result.rows).toHaveLength(4);
    expect(result.columns).toEqual(data.columns);
    expect(result.links).toHaveLength(2);
  });

  it('过滤不满足条件的行并裁剪关系边', () => {
    const data = makeData(makeRows());
    const result = applyViewQuery(data, {
      conditions: { type: 'leaf', field: 'kind', operator: 'eq', value: 'character' },
    });
    expect(result.rows.map((row) => row.id)).toEqual(['c1', 'c2']);
    expect(result.links).toEqual([]);
  });

  it('追加计算列并写入 cells', () => {
    const data = makeData(makeRows());
    const result = applyViewQuery(data, {
      conditions: { type: 'leaf', field: 'kind', operator: 'eq', value: 'character' },
      computed: [{ key: 'computed:double', label: '双倍年龄', operator: 'add', operands: ['age', 'age'] }],
    });
    expect(result.columns.map((column) => column.key)).toEqual(['kind', 'title', 'computed:double']);
    expect(result.rows[0]?.cells['computed:double']).toBe('60');
  });
});
