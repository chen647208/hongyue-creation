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
import { collectConditionLeaves, insertConditionAt, makeConditionLeaf, removeConditionAt } from '../viewConditions';
import { applyViewQuery } from '../viewQuery';

/** 插件或手写 JSON 写入的 or/not 树：面板首次编辑不得把它拍平成平铺 AND。 */
function handWrittenOrNotTree(): QueryCondition {
  return {
    type: 'or',
    children: [
      { type: 'leaf', field: 'kind', operator: 'eq', value: 'character' },
      {
        type: 'not',
        children: [{ type: 'leaf', field: 'summary', operator: 'empty' }],
      },
    ],
  };
}

function makeData(rows: ViewRow[]): EntityViewData {
  return { columns: [{ key: 'title', label: 'views.col.title' }], rows, links: [] };
}

function makeRows(): ViewRow[] {
  return [
    { id: 'c1', kind: 'character', title: '主角', cells: { kind: 'character', title: '主角' }, values: { kind: 'character', summary: '剑士' } },
    { id: 'c2', kind: 'character', title: '游侠', cells: { kind: 'character', title: '游侠' }, values: { kind: 'character', summary: '' } },
    { id: 'e1', kind: 'event', title: '港城之战', cells: { kind: 'event', title: '港城之战' }, values: { kind: 'event', summary: '' } },
  ];
}

describe('collectConditionLeaves', () => {
  it('按文档顺序收集任意深度嵌套的叶子', () => {
    const leaves = collectConditionLeaves(handWrittenOrNotTree());
    expect(leaves).toEqual([
      { type: 'leaf', field: 'kind', operator: 'eq', value: 'character' },
      { type: 'leaf', field: 'summary', operator: 'empty' },
    ]);
    expect(collectConditionLeaves(undefined)).toEqual([]);
    expect(collectConditionLeaves({ type: 'or', children: [] })).toEqual([]);
  });
});

describe('insertConditionAt', () => {
  it('根分组缺席时新建 and 根分组承载叶子', () => {
    const leaf = makeConditionLeaf('title', 'contains', '港');
    expect(insertConditionAt(undefined, [], leaf)).toEqual({ type: 'and', children: [leaf] });
  });

  it('根分组缺席时追加分组，该分组直接作为根（不套空 and）', () => {
    expect(insertConditionAt(undefined, [], { type: 'or', children: [] })).toEqual({ type: 'or', children: [] });
  });

  it('平铺 AND 配置上追加叶子保持原结构与顺序', () => {
    const root: QueryCondition = { type: 'and', children: [{ type: 'leaf', field: 'kind', operator: 'eq', value: 'character' }] };
    const next = insertConditionAt(root, [], makeConditionLeaf('title', 'contains', '港'));
    expect(next).toEqual({
      type: 'and',
      children: [
        { type: 'leaf', field: 'kind', operator: 'eq', value: 'character' },
        { type: 'leaf', field: 'title', operator: 'contains', value: '港' },
      ],
    });
  });

  it('or/not 树上首次编辑只改命中的分组，未命中分支原样保留', () => {
    const next = insertConditionAt(handWrittenOrNotTree(), [], makeConditionLeaf('title', 'contains', '港'));
    expect(next).toEqual({
      type: 'or',
      children: [
        { type: 'leaf', field: 'kind', operator: 'eq', value: 'character' },
        { type: 'not', children: [{ type: 'leaf', field: 'summary', operator: 'empty' }] },
        { type: 'leaf', field: 'title', operator: 'contains', value: '港' },
      ],
    });
  });

  it('叶子进入 path 指向的嵌套分组，不触碰兄弟节点', () => {
    const next = insertConditionAt(handWrittenOrNotTree(), [1], makeConditionLeaf('age', 'gt', '20'));
    expect(next).toEqual({
      type: 'or',
      children: [
        { type: 'leaf', field: 'kind', operator: 'eq', value: 'character' },
        {
          type: 'not',
          children: [
            { type: 'leaf', field: 'summary', operator: 'empty' },
            { type: 'leaf', field: 'age', operator: 'gt', value: '20' },
          ],
        },
      ],
    });
  });
});

describe('removeConditionAt', () => {
  it('删除嵌套分组内的叶子，分组保留', () => {
    const root: QueryCondition = {
      type: 'or',
      children: [
        { type: 'leaf', field: 'kind', operator: 'eq', value: 'character' },
        {
          type: 'not',
          children: [
            { type: 'leaf', field: 'summary', operator: 'empty' },
            { type: 'leaf', field: 'age', operator: 'gt', value: 20 },
          ],
        },
      ],
    };
    expect(removeConditionAt(root, [1, 1])).toEqual({
      type: 'or',
      children: [
        { type: 'leaf', field: 'kind', operator: 'eq', value: 'character' },
        { type: 'not', children: [{ type: 'leaf', field: 'summary', operator: 'empty' }] },
      ],
    });
  });

  it('分组被删空后随父级一并移除，根分组删空回到无条件', () => {
    const root: QueryCondition = {
      type: 'and',
      children: [
        { type: 'leaf', field: 'kind', operator: 'eq', value: 'character' },
        { type: 'or', children: [{ type: 'leaf', field: 'age', operator: 'gt', value: 20 }] },
      ],
    };
    expect(removeConditionAt(root, [1, 0])).toEqual({
      type: 'and',
      children: [{ type: 'leaf', field: 'kind', operator: 'eq', value: 'character' }],
    });
    const single: QueryCondition = { type: 'and', children: [{ type: 'leaf', field: 'kind', operator: 'eq', value: 'character' }] };
    expect(removeConditionAt(single, [0])).toBeUndefined();
    expect(removeConditionAt(root, [])).toBeUndefined();
  });
});

describe('makeConditionLeaf', () => {
  it('empty/notEmpty 不写比较值，其余操作符带上输入值', () => {
    expect(makeConditionLeaf('summary', 'empty', '')).toEqual({ type: 'leaf', field: 'summary', operator: 'empty' });
    expect(makeConditionLeaf('title', 'contains', '港')).toEqual({ type: 'leaf', field: 'title', operator: 'contains', value: '港' });
  });
});

describe('面板投影对 or/not 树的递归求值', () => {
  it('角色行或摘要非空，事件行一律滤除', () => {
    const result = applyViewQuery(makeData(makeRows()), { conditions: handWrittenOrNotTree() });
    expect(result.rows.map((row) => row.id)).toEqual(['c1', 'c2']);
  });

  it('NOT 分组让命中该叶子的行整行滤除', () => {
    const result = applyViewQuery(makeData(makeRows()), {
      conditions: { type: 'not', children: [{ type: 'leaf', field: 'kind', operator: 'eq', value: 'character' }] },
    });
    expect(result.rows.map((row) => row.id)).toEqual(['e1']);
  });
});
