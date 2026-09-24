/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { ConditionOperator, QueryCondition } from '../types';
import ViewConditionEditor from '../ViewConditionEditor';

const noop = () => {};

function render(
  condition: QueryCondition | undefined,
  overrides: Partial<React.ComponentProps<typeof ViewConditionEditor>> = {},
): string {
  return renderToStaticMarkup(
    <ViewConditionEditor
      condition={condition}
      availableFields={['kind', 'title', 'summary', 'age']}
      fieldLabel={(field) => field}
      field="title"
      operator={'contains' as ConditionOperator}
      value=""
      onFieldChange={noop}
      onOperatorChange={noop}
      onValueChange={noop}
      onAddLeaf={noop}
      onAddGroup={noop}
      onRemove={noop}
      {...overrides}
    />,
  );
}

describe('ViewConditionEditor', () => {
  it('无筛选条件时显示空态提示', () => {
    const html = render(undefined);
    expect(html).toContain('暂无筛选条件，显示全部');
    expect(html).not.toContain('移除条件');
  });

  it('平铺 AND 配置按单选组渲染，叶子带字段、操作符与比较值', () => {
    const html = render({
      type: 'and',
      children: [
        { type: 'leaf', field: 'kind', operator: 'eq', value: 'character' },
        { type: 'leaf', field: 'title', operator: 'contains', value: '港' },
        { type: 'leaf', field: 'summary', operator: 'empty' },
      ],
    });
    expect(html).toContain('全部满足');
    expect(html).toContain('kind 等于 character');
    expect(html).toContain('title 包含 港');
    expect(html).toContain('summary 为空');
    // 每条叶子一个移除按钮，分组内还有新增入口。
    expect(html.match(/aria-label="移除条件"/g)?.length).toBe(3);
    expect(html).toContain('在本组内添加条件');
    expect(html).toContain('新建分组');
  });

  it('or/not 树无损渲染：分组类型标签与嵌套层级都在', () => {
    const html = render({
      type: 'or',
      children: [
        { type: 'leaf', field: 'kind', operator: 'eq', value: 'character' },
        { type: 'not', children: [{ type: 'leaf', field: 'summary', operator: 'empty' }] },
      ],
    });
    expect(html).toContain('任一满足');
    expect(html).toContain('都不满足');
    expect(html).toContain('kind 等于 character');
    expect(html).toContain('summary 为空');
    // 非根分组可整组移除。
    expect(html).toContain('aria-label="移除分组"');
    expect(html.match(/aria-label="移除条件"/g)?.length).toBe(2);
  });

  it('字段标签与操作符取自注入的映射', () => {
    const html = render(
      {
        type: 'and',
        children: [{ type: 'leaf', field: 'age', operator: 'gte', value: '20' }],
      },
      { fieldLabel: (field) => (field === 'age' ? '年龄' : field) },
    );
    expect(html).toContain('年龄 大于等于 20');
    expect(html).not.toContain('age 大于等于');
  });

  it('empty/notEmpty 操作符下不渲染比较值输入框', () => {
    const withValue = render(undefined, { operator: 'contains' });
    const withoutValue = render(undefined, { operator: 'empty' });
    expect(withValue).toContain('aria-label="值"');
    expect(withoutValue).not.toContain('aria-label="值"');
  });
});
