/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect, it } from 'vitest';

import type { CanvasDocument } from '../jsonCanvas';
import { parseCanvasDocument, parseCanvasText, serializeCanvas } from '../jsonCanvas';

function doc(): CanvasDocument {
  return {
    nodes: [
      { id: 'a', type: 'text', x: 0, y: 0, width: 100, height: 50, text: 'hello', color: '1' },
      { id: 'b', type: 'file', x: 200, y: 0, width: 100, height: 50, file: 'notes/x.md', subpath: '#h', color: '#ff0000' },
      { id: 'c', type: 'link', x: 0, y: 200, width: 100, height: 50, url: 'https://example.com' },
      { id: 'g', type: 'group', x: -20, y: -20, width: 400, height: 400, label: 'Group', background: 'bg.png', backgroundStyle: 'cover' },
    ],
    edges: [
      { id: 'e1', fromNode: 'a', toNode: 'b', fromSide: 'right', toSide: 'left', fromEnd: 'none', toEnd: 'arrow', label: 'flow', color: '2' },
    ],
  };
}

describe('jsonCanvas：解析与序列化', () => {
  it('四种节点与边往返一致，且无校验问题', () => {
    const original = doc();
    const parsed = parseCanvasText(serializeCanvas(original));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.document).toEqual(original);
    expect(parsed.issues).toEqual([]);
  });

  it('规范外扩展字段原样保留并可再次往返', () => {
    const raw = {
      nodes: [{ id: 'a', type: 'text', x: 0, y: 0, width: 10, height: 10, text: 't', custom: { nested: [1, 2] }, kind: 'character' }],
      edges: [{ id: 'e', fromNode: 'a', toNode: 'a', weight: 3 }],
    };
    const parsed = parseCanvasDocument(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.document.nodes[0]?.custom).toEqual({ nested: [1, 2] });
    expect(parsed.document.nodes[0]?.kind).toBe('character');
    expect(parsed.document.edges[0]?.weight).toBe(3);
    const again = parseCanvasText(serializeCanvas(parsed.document));
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.document).toEqual(parsed.document);
  });

  it('根不是对象或 nodes/edges 非数组时整份拒绝', () => {
    expect(parseCanvasDocument(null).ok).toBe(false);
    expect(parseCanvasDocument([]).ok).toBe(false);
    expect(parseCanvasDocument({ nodes: {} }).ok).toBe(false);
    expect(parseCanvasDocument({ edges: 'x' }).ok).toBe(false);
    expect(parseCanvasText('{ not json').ok).toBe(false);
  });

  it('单节点非法按条降级：其余节点仍在，问题可读', () => {
    const result = parseCanvasDocument({
      nodes: [
        { id: 'good', type: 'text', x: 0, y: 0, width: 10, height: 10, text: 'ok' },
        { id: '', type: 'text', x: 0, y: 0, width: 10, height: 10, text: 'no id' },
        { id: 'dup', type: 'text', x: 0, y: 0, width: 10, height: 10, text: 'first' },
        { id: 'dup', type: 'text', x: 0, y: 0, width: 10, height: 10, text: 'second' },
        { id: 'badtype', type: 'video', x: 0, y: 0, width: 10, height: 10 },
        { id: 'badcoord', type: 'text', x: '0', y: 0, width: 10, height: 10, text: 't' },
        { id: 'notext', type: 'text', x: 0, y: 0, width: 10, height: 10 },
      ],
      edges: [
        { id: 'dangling', fromNode: 'good', toNode: 'missing' },
        { id: 'ok', fromNode: 'good', toNode: 'good', fromSide: 'middle' },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.nodes.map((node) => node.id)).toEqual(['good', 'dup']);
    expect(result.document.edges).toHaveLength(1);
    expect(result.document.edges[0]?.fromSide).toBeUndefined();
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.every((issue) => issue.path !== '' && issue.message !== '')).toBe(true);
  });

  it('非法颜色与端点枚举降级为省略并记录', () => {
    const result = parseCanvasDocument({
      nodes: [{ id: 'a', type: 'text', x: 0, y: 0, width: 10, height: 10, text: 't', color: 123 }],
      edges: [{ id: 'e', fromNode: 'a', toNode: 'a', toEnd: 'dot', label: 9 }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.nodes[0]?.color).toBeUndefined();
    expect(result.document.edges[0]?.toEnd).toBeUndefined();
    expect(result.document.edges[0]?.label).toBeUndefined();
    expect(result.issues).toHaveLength(3);
  });
});
