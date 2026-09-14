/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { getSchema } from '@tiptap/core';
import { EditorState } from '@tiptap/pm/state';
import { describe, expect,it } from 'vitest';

import { BLOCK_ID_INIT_META, createBlockIdPlugin, DEFAULT_BLOCK_ID_TYPES } from '../blockId';
import { BLOCK_ID_ATTRIBUTE } from '../blockIndex';
import { createNovelExtensions } from '../schema';
import { dslToPmDoc, type PmNode } from '../serialization';

const schema = getSchema(createNovelExtensions());

function counter(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}-${(n += 1)}`;
}

function makeState(docJson: PmNode, generateId: () => string): EditorState {
  return EditorState.create({
    schema,
    doc: schema.nodeFromJSON(docJson),
    plugins: [createBlockIdPlugin({ types: DEFAULT_BLOCK_ID_TYPES, generateId })],
  });
}

function paragraph(id: string | undefined, text: string): PmNode {
  return {
    type: 'paragraph',
    attrs: id === undefined ? {} : { [BLOCK_ID_ATTRIBUTE]: id },
    content: [{ type: 'text', text }],
  };
}

function blockIds(state: EditorState): Array<string | undefined> {
  const ids: Array<string | undefined> = [];
  state.doc.forEach((node) => ids.push(node.attrs[BLOCK_ID_ATTRIBUTE]));
  return ids;
}

describe('blockId 扩展：生成', () => {
  it('普通块节点在首次文档变更后获得标识', () => {
    let state = makeState(dslToPmDoc('第一段。\n\n第二段。'), counter('new'));
    state = state.apply(state.tr.insertText('！', 1));
    const ids = blockIds(state);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe('new-1');
    expect(ids[1]).toBe('new-2');
  });

  it('场景分隔/关键字行等原子块同样获得标识', () => {
    const doc: PmNode = {
      type: 'doc',
      content: [
        { type: 'keywordLine', attrs: { keyword: 'pov', value: '林渊' } },
        { type: 'sceneBreak' },
        paragraph(undefined, '正文。'),
      ],
    };
    let state = makeState(doc, counter('id'));
    state = state.apply(state.tr.setMeta(BLOCK_ID_INIT_META, true));
    expect(blockIds(state)).toEqual(['id-1', 'id-2', 'id-3']);
  });

  it('无文档变更且无初始化标记时不动标识', () => {
    const state = makeState(dslToPmDoc('一段。'), counter('x'));
    const next = state.apply(state.tr);
    expect(blockIds(next)[0]).toBeUndefined();
  });
});

describe('blockId 扩展：保留与重排', () => {
  it('已存在的标识在编辑后不变', () => {
    const doc: PmNode = { type: 'doc', content: [paragraph('keep-1', '甲'), paragraph('keep-2', '乙')] };
    let state = makeState(doc, counter('new'));
    state = state.apply(state.tr.insertText('？', 1));
    expect(blockIds(state)).toEqual(['keep-1', 'keep-2']);
  });

  it('重排后标识随块移动，不变', () => {
    const doc: PmNode = { type: 'doc', content: [paragraph('a', '甲'), paragraph('b', '乙'), paragraph('c', '丙')] };
    let state = makeState(doc, counter('new'));
    const first = state.doc.child(0);
    const tr = state.tr.delete(0, first.nodeSize);
    tr.insert(tr.doc.content.size, first);
    state = state.apply(tr);
    expect(blockIds(state)).toEqual(['b', 'c', 'a']);
  });

  it('拆分块时原块保留、新块获得新标识', () => {
    const doc: PmNode = { type: 'doc', content: [paragraph('p1', '甲乙丙')] };
    let state = makeState(doc, counter('new'));
    // 位置 2 = 首段内「甲」之后，拆分点
    state = state.apply(state.tr.split(2));
    const ids = blockIds(state);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe('p1');
    expect(ids[1]).toBe('new-1');
  });
});

describe('blockId 扩展：去重（复制/跨章粘贴）', () => {
  it('重复标识只保留首个，其余重新生成', () => {
    const doc: PmNode = { type: 'doc', content: [paragraph('dup', '甲'), paragraph('dup', '乙')] };
    let state = makeState(doc, counter('new'));
    state = state.apply(state.tr.insertText('！', 1));
    const ids = blockIds(state);
    expect(ids[0]).toBe('dup');
    expect(ids[1]).toBe('new-1');
  });

  it('三处重复只保留首个', () => {
    const doc: PmNode = { type: 'doc', content: [paragraph('same', '甲'), paragraph('same', '乙'), paragraph('same', '丙')] };
    let state = makeState(doc, counter('new'));
    state = state.apply(state.tr.insertText('！', 1));
    const ids = blockIds(state);
    expect(ids[0]).toBe('same');
    expect(ids[1]).toBe('new-1');
    expect(ids[2]).toBe('new-2');
  });
});

describe('blockId 扩展：schema 属性配置', () => {
  it('blockId 全局属性已注册，缺省为 undefined（不影响既有 JSON 往返）', () => {
    const node = schema.nodes.paragraph;
    expect(node?.spec.attrs?.[BLOCK_ID_ATTRIBUTE]).toBeDefined();
    const parsed = schema.nodeFromJSON({ type: 'paragraph', content: [{ type: 'text', text: 'x' }] });
    expect(parsed.attrs[BLOCK_ID_ATTRIBUTE]).toBeUndefined();
  });
});
