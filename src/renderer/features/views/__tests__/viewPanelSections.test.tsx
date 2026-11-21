/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

// @vitest-environment jsdom

import { builtinRegistry } from '@core/types-registry';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ViewChartSection } from '../components/ViewPanelSections';
import type { ChartSpec, ConditionOperator } from '../types';
import ViewConditionEditor from '../ViewConditionEditor';
import { buildTemplateFieldLabels } from '../viewFieldLabels';

beforeAll(() => {
  // Radix Select 的浮层依赖 PointerEvent、滚动与指针捕获 API，jsdom 不实现，补空实现。
  window.PointerEvent = window.MouseEvent as unknown as typeof PointerEvent;
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(cleanup);

const pointer = { pointerType: 'mouse', button: 0, ctrlKey: false, pointerId: 1 } as const;

const labelRegistry = buildTemplateFieldLabels(builtinRegistry.list());
const templateLabel = (field: string): string => labelRegistry.get(field) ?? field;

async function openSelect(selectLabel: string): Promise<void> {
  const trigger = screen.getByLabelText(selectLabel);
  fireEvent.pointerDown(trigger, pointer);
  fireEvent.pointerUp(trigger, pointer);
  fireEvent.click(trigger);
}

async function choose(selectLabel: string, optionLabel: string): Promise<void> {
  await openSelect(selectLabel);
  const option = await screen.findByRole('option', { name: optionLabel });
  fireEvent.pointerMove(option, pointer);
  fireEvent.pointerUp(option, pointer);
  fireEvent.click(option);
}

describe('ViewChartSection：type 与 aggregate 进 UI', () => {
  const chart: ChartSpec = {
    mark: 'bar',
    bindings: [
      { field: 'shotNumber', channel: 'x', type: 'temporal' },
      { field: 'wordCount', channel: 'y', aggregate: 'avg' },
    ],
  };

  it('x 通道可改维度类型，写回 binding.type 且不动字段', async () => {
    const onChange = vi.fn();
    render(<ViewChartSection chart={chart} availableFields={['shotNumber', 'wordCount']} fieldLabel={templateLabel} onChange={onChange} />);

    await choose('维度类型', '数值');

    expect(onChange).toHaveBeenCalledWith({
      mark: 'bar',
      bindings: [
        { field: 'shotNumber', channel: 'x', type: 'quantitative' },
        { field: 'wordCount', channel: 'y', aggregate: 'avg' },
      ],
    });
  });

  it('y 通道可改聚合方式，写回 binding.aggregate 且不动字段', async () => {
    const onChange = vi.fn();
    render(<ViewChartSection chart={chart} availableFields={['shotNumber', 'wordCount']} fieldLabel={templateLabel} onChange={onChange} />);

    await choose('聚合方式', '求和');

    expect(onChange).toHaveBeenCalledWith({
      mark: 'bar',
      bindings: [
        { field: 'shotNumber', channel: 'x', type: 'temporal' },
        { field: 'wordCount', channel: 'y', aggregate: 'sum' },
      ],
    });
  });

  it('未绑定 x/y 时不渲染类型与聚合下拉', () => {
    render(<ViewChartSection chart={{ mark: 'bar', bindings: [] }} availableFields={['shotNumber']} fieldLabel={templateLabel} onChange={vi.fn()} />);
    expect(screen.queryByLabelText('维度类型')).toBeNull();
    expect(screen.queryByLabelText('聚合方式')).toBeNull();
  });
});

describe('扩展字段标签：条件下拉与摘要', () => {
  function renderEditor(overrides: Partial<React.ComponentProps<typeof ViewConditionEditor>> = {}) {
    return render(
      <ViewConditionEditor
        condition={{ type: 'leaf', field: 'shotNumber', operator: 'eq', value: '1' }}
        availableFields={['shotNumber', 'framing', 'notRegistered']}
        fieldLabel={templateLabel}
        field="shotNumber"
        operator={'contains' as ConditionOperator}
        value=""
        onFieldChange={vi.fn()}
        onOperatorChange={vi.fn()}
        onValueChange={vi.fn()}
        onAddLeaf={vi.fn()}
        onAddGroup={vi.fn()}
        onRemove={vi.fn()}
        {...overrides}
      />,
    );
  }

  it('摘要显示类型注册表标题', () => {
    renderEditor();
    expect(screen.getByText('镜号 等于 1')).toBeTruthy();
  });

  it('字段下拉命中注册表用标题，未命中回落原键', async () => {
    const onFieldChange = vi.fn();
    renderEditor({ onFieldChange });

    await openSelect('字段');
    expect(await screen.findByRole('option', { name: '镜号' })).toBeTruthy();
    expect(screen.getByRole('option', { name: '景别' })).toBeTruthy();
    const option = screen.getByRole('option', { name: '景别' });
    fireEvent.pointerMove(option, pointer);
    fireEvent.pointerUp(option, pointer);
    fireEvent.click(option);

    expect(onFieldChange).toHaveBeenCalledWith('framing');
  });

  it('未收录的键在用户下拉里回落原键', async () => {
    renderEditor();
    await openSelect('字段');
    expect(await screen.findByRole('option', { name: 'notRegistered' })).toBeTruthy();
  });
});
