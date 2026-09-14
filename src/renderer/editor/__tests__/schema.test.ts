/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { getSchema } from '@tiptap/core';
import { describe, expect,it } from 'vitest';

import { BLOCK_ID_ATTRIBUTE } from '../blockIndex';
import { createNovelExtensions } from '../schema';
import { dslToPmDoc, pmDocToDsl } from '../serialization';

// getSchema 仅收集节点/标记规格，不触碰 DOM，可无头构建。
const schema = getSchema(createNovelExtensions());

// nodeFromJSON 会把缺省属性并入 attrs；剥除 blockId（值为 undefined）与随之产生的空 attrs，还原 DSL 口径。
function toDslJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toDslJson);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === 'attrs') {
      const attrs = { ...(item as Record<string, unknown>) };
      delete attrs[BLOCK_ID_ATTRIBUTE];
      if (Object.keys(attrs).length > 0) out.attrs = attrs;
      continue;
    }
    out[key] = key === 'content' ? toDslJson(item) : item;
  }
  return out;
}

describe('novel schema', () => {
  it('包含全部小说自定义节点', () => {
    for (const n of [
      'doc', 'paragraph', 'heading', 'text', 'hardBreak',
      'sceneBreak', 'keywordLine', 'chapterRef', 'placeholder',
      'darlingSlot', 'ghostNote', 'dialogueBlock',
    ]) {
      expect(schema.nodes[n], `节点 ${n} 缺失`).toBeTruthy();
    }
  });

  it('包含小说标记（自定义 + StarterKit 的 bold/italic）', () => {
    for (const m of ['quoteStyle', 'tagRef', 'bold', 'italic']) {
      expect(schema.marks[m], `标记 ${m} 缺失`).toBeTruthy();
    }
  });

  it('标题节点接受 level 1-3', () => {
    for (const level of [1, 2, 3]) {
      const h = schema.nodeFromJSON({ type: 'heading', attrs: { level }, content: [{ type: 'text', text: 'x' }] });
      expect(h.attrs.level).toBe(level);
    }
  });

  it('serialization 产出的 doc JSON 对 schema 合法且 toJSON 往返稳定', () => {
    const json = dslToPmDoc('# @pov: 林渊\n\n他去了[[云都]]，留下{name|fact}。\n\n***\n\n## 小节\n\n新场景。');
    const node = schema.nodeFromJSON(json); // 非法结构会抛错
    expect(toDslJson(node.toJSON())).toEqual(json);
  });

  it('schema→DSL→schema 全链路稳定', () => {
    const json = dslToPmDoc('正文一段含[[链接]]。\n\n第二段。');
    const dsl = pmDocToDsl(json);
    const json2 = dslToPmDoc(dsl);
    expect(toDslJson(schema.nodeFromJSON(json2).toJSON())).toEqual(json);
  });
});
