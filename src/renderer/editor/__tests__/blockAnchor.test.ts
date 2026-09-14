/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect,it } from 'vitest';

import { BLOCK_ID_ATTRIBUTE } from '../blockIndex';
import { dslToPmDoc, pmDocToDsl, type PmNode } from '../serialization';

function ids(doc: PmNode): Array<string | null> {
  return (doc.content ?? []).map((b) => {
    const id = b.attrs?.[BLOCK_ID_ATTRIBUTE];
    return typeof id === 'string' ? id : null;
  });
}

function para(blockId: string | null, text: string): PmNode {
  return {
    type: 'paragraph',
    attrs: blockId === null ? {} : { [BLOCK_ID_ATTRIBUTE]: blockId },
    content: [{ type: 'text', text }],
  };
}

describe('块锚往返：写出 → 解析 → 标识一致', () => {
  const doc: PmNode = {
    type: 'doc',
    content: [
      para('p1', '第一段。'),
      { type: 'sceneBreak', attrs: { [BLOCK_ID_ATTRIBUTE]: 's1' } },
      { type: 'heading', attrs: { level: 2, [BLOCK_ID_ATTRIBUTE]: 'h1' }, content: [{ type: 'text', text: '标题' }] },
      { type: 'keywordLine', attrs: { keyword: 'pov', value: '林渊', [BLOCK_ID_ATTRIBUTE]: 'k1' } },
    ],
  };

  it('每类块都写锚并在重载后还原标识与可见文本', () => {
    const dsl = pmDocToDsl(doc);
    expect(dsl).toBe('^p1\n第一段。\n\n^s1\n***\n\n^h1\n## 标题\n\n^k1\n# @pov: 林渊');
    const reloaded = dslToPmDoc(dsl);
    expect(ids(reloaded)).toEqual(['p1', 's1', 'h1', 'k1']);
    expect((reloaded.content?.[0]?.content ?? []).map((n) => n.text)).toEqual(['第一段。']);
    expect(reloaded.content?.[2]?.attrs?.level).toBe(2);
    expect(reloaded.content?.[3]?.attrs).toMatchObject({ keyword: 'pov', value: '林渊' });
  });

  it('带锚 DSL 二次往返稳定（serialize→parse→serialize 幂等）', () => {
    const once = pmDocToDsl(doc);
    expect(pmDocToDsl(dslToPmDoc(once))).toBe(once);
  });

  it('空段落携带标识时也往返', () => {
    const empty: PmNode = { type: 'doc', content: [{ type: 'paragraph', attrs: { [BLOCK_ID_ATTRIBUTE]: 'e1' } }] };
    expect(pmDocToDsl(empty)).toBe('^e1');
    expect(ids(dslToPmDoc(pmDocToDsl(empty)))).toEqual(['e1']);
  });
});

describe('无标识的块不写锚（既有内容零改动）', () => {
  it('canonical 正文往返逐字不变且不含 ^', () => {
    const canonical = ['# @pov: 林渊', '', '他走进了[[云都]]的城门。', '', '***', '', '新场景开始。'].join('\n');
    const dsl = pmDocToDsl(dslToPmDoc(canonical));
    expect(dsl).toBe(canonical);
    expect(dsl).not.toContain('^');
  });

  it('同一文档中仅对已存在标识的块写锚', () => {
    const doc: PmNode = {
      type: 'doc',
      content: [para('p1', '有标识'), para(null, '无标识')],
    };
    expect(pmDocToDsl(doc)).toBe('^p1\n有标识\n\n无标识');
    expect(ids(dslToPmDoc(pmDocToDsl(doc)))).toEqual(['p1', null]);
  });
});

describe('锚与正文的避让：字面 ^ 行不被误读', () => {
  const paraDoc = (blockId: string | null, text: string): PmNode => ({ type: 'doc', content: [para(blockId, text)] });

  it('段落行恰为锚形时转义为字面文本', () => {
    const dsl = pmDocToDsl(paraDoc(null, '^abc-1'));
    expect(dsl).toBe('\\^abc-1');
    const reloaded = dslToPmDoc(dsl);
    expect(ids(reloaded)).toEqual([null]);
    expect((reloaded.content?.[0]?.content ?? []).map((n) => n.text)).toEqual(['^abc-1']);
  });

  it('有标识块内的字面锚形行仍归该块', () => {
    const dsl = pmDocToDsl(paraDoc('real-1', '^abc-1'));
    expect(dsl).toBe('^real-1\n\\^abc-1');
    const reloaded = dslToPmDoc(dsl);
    expect(ids(reloaded)).toEqual(['real-1']);
    expect((reloaded.content?.[0]?.content ?? []).map((n) => n.text)).toEqual(['^abc-1']);
  });

  it('含 ^ 但不成锚形的文本不受影响', () => {
    const dsl = pmDocToDsl(paraDoc(null, '公式 x^2 与 y'));
    expect(dsl).toBe('公式 x^2 与 y');
    expect(ids(dslToPmDoc(dsl))).toEqual([null]);
  });
});

describe('异常锚容错', () => {
  it('非法锚形（空 id / 中文 / 行内）按普通文本解析，不产生标识', () => {
    for (const text of ['^', '^带中文', '前缀 ^abc']) {
      const reloaded = dslToPmDoc(text);
      expect(ids(reloaded)).toEqual([null]);
      expect((reloaded.content?.[0]?.content ?? []).map((n) => n.text)).toEqual([text]);
    }
  });

  it('重复锚各自还原，不抛错（去重由编辑器 blockId 插件负责）', () => {
    const reloaded = dslToPmDoc('^dup\n甲\n\n^dup\n乙');
    expect(ids(reloaded)).toEqual(['dup', 'dup']);
  });
});
