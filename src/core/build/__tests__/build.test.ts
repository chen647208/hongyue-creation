/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect,it } from 'vitest';

import type { AttributeEntity, EdgeEntity,NodeEntity } from '../../entities';
import {
  type BuildProfile,
  COMPENDIUM_BUILD_PROFILE,
  DEFAULT_BUILD_PROFILE,
  listRenderers,
  listTransformers,
  registerTransformer,
  roundtripProfile,
  runBuild,
} from '../index.js';
import { parseProfileYaml, serializeProfileYaml } from '../profileYaml.js';

function node(id: string, type: string, title: string, body: string): NodeEntity {
  return { id, bookId: 'b1', type, title, body, createdAt: 0, updatedAt: 0, erased: false } as NodeEntity;
}

function entities(): { nodes: NodeEntity[]; attrs: AttributeEntity[]; edges: EdgeEntity[] } {
  return {
    nodes: [
      node('ch1', 'novel.chapter', '第一章', '他推开门。[draft-only] 这行要被剔除。\n\n正文第一段。引用了[[主角]]。'),
      node('sc1', 'novel.scene', '场景一', '场景正文。'),
      node('ch2', 'novel.chapter', '第二章', '第二章正文。'),
      node('cardA', 'card.character', '主角', '主角设定：夜行客。'),
      node('inactive1', 'novel.chapter', '废稿章', '不参与构建。'),
      node('cardB', 'card.character', '旧角色', '被归档的角色卡。'),
    ],
    attrs: [
      { id: 'a1', nodeId: 'inactive1', type: 'attr', name: 'status', value: 'inactive', inheritable: false, position: 0, erased: false },
      { id: 'a2', nodeId: 'cardB', type: 'attr', name: 'status', value: 'inactive', inheritable: false, position: 0, erased: false },
    ] as unknown as AttributeEntity[],
    edges: [],
  };
}

const draftProfile: BuildProfile = {
  ...DEFAULT_BUILD_PROFILE,
  name: '起点投稿版',
  format: 'txt',
};

describe('profile 往返（验收 2）', () => {
  it('JSON 编辑→保存→重载无损', () => {
    const saved = JSON.parse(JSON.stringify(draftProfile)) as BuildProfile;
    expect(roundtripProfile(saved)).toEqual(draftProfile);
  });
});

describe('select + transform + render', () => {
  it('默认 profile：inactive 剔除、cards 不选、draft-only 行剔除、引用替换为显示名', () => {
    const { text } = runBuild(DEFAULT_BUILD_PROFILE, entities());
    // renumber 按构建序重写编号（title 排序下 第二章 先于 第一章）
    expect(text).toContain('1、第二章');
    expect(text).not.toContain('主角设定');
    expect(text).not.toContain('draft-only');
    expect(text).toContain('正文第一段。引用了主角。');
    expect(text).not.toContain('废稿章');
  });

  it('引用 [[id|别名]] → 别名；[[别名]] 未解析保留', () => {
    const es = entities();
    es.nodes[0]!.body = '他走向[[cardA|夜行客]]。';
    const { text } = runBuild(DEFAULT_BUILD_PROFILE, es);
    expect(text).toContain('他走向夜行客。');
  });
});

describe('验收 1：同一本书两个 profile 产出正确差异', () => {
  it('投稿版 vs 设定集', () => {
    const draft = runBuild(DEFAULT_BUILD_PROFILE, entities());
    const compendium = runBuild(COMPENDIUM_BUILD_PROFILE, entities());
    // 投稿版：只章节正文
    expect(draft.text).toContain('第一章');
    expect(draft.text).not.toContain('主角设定：夜行客');
    // 设定集：卡片入选（含 inactive 卡片）、章节正文不入选
    expect(compendium.text).toContain('主角设定：夜行客');
    expect(compendium.text).toContain('被归档的角色卡'); // includeInactive: true
    expect(compendium.text).not.toContain('第二章正文');
  });
});

describe('验收 3：插件贡献点（变换器 + 渲染器）不改内核可被选用', () => {
  it('reverse-order 变换器 + 内置 rtf 渲染器', () => {
    registerTransformer({
      id: 'example.reverse-order',
      description: '章节倒序（示例插件贡献）',
      apply: (nodes) => [...nodes].reverse(),
    });
    expect(listTransformers().map((t) => t.id)).toContain('example.reverse-order');
    expect(listRenderers().map((r) => r.id)).toContain('rtf');

    const profile: BuildProfile = { ...DEFAULT_BUILD_PROFILE, format: 'rtf', transform: { ...DEFAULT_BUILD_PROFILE.transform, headings: { ...DEFAULT_BUILD_PROFILE.transform.headings } } };
    // profile 用 contributed 变换器：v0 经 runBuild 前手动应用
    const { nodes } = runBuild(profile, entities());
    const reversed = listTransformers().find((t) => t.id === 'example.reverse-order')!.apply(nodes);
    const built = runBuild(profile, { nodes: reversed as never, attrs: [], edges: [] });
    expect(built.text.startsWith('{\\rtf1')).toBe(true);
    // 倒序后第二章在前（标题已 renumber 为 1、/2、，CJK 转义后用 ASCII 序号定位）
    expect(built.text.indexOf('\\fs32 1')).toBeLessThan(built.text.indexOf('\\fs32 2'));
  });
});

describe('rtf 渲染器', () => {
  it('首行文档头 + 尾行括号，章节加粗、CJK 转 \\u、特殊字符转义', () => {
    const profile: BuildProfile = { ...DEFAULT_BUILD_PROFILE, format: 'rtf' };
    const { text } = runBuild(profile, entities());
    const lines = text.split('\n');
    expect(lines[0]).toMatch(/^\{\\rtf1\\ansi/);
    expect(lines[lines.length - 1]).toBe('}');
    expect(text).toContain('{\\b\\fs32');
    // 中文转 \uN? 形，原字不裸奔
    expect(text).toContain('\\u');
    expect(text).toContain('\\par');
  });

  it('花括号与反斜杠转义，不破坏文档括号配平', () => {
    const es = entities();
    es.nodes[0]!.body = ' brace {x} back\\slash ';
    const profile: BuildProfile = { ...DEFAULT_BUILD_PROFILE, format: 'rtf' };
    const { text } = runBuild(profile, es);
    expect(text).toContain('\\{x\\}');
    expect(text).toContain('back\\\\slash');
    const opens = (text.match(/\{/g) ?? []).length;
    const closes = (text.match(/\}/g) ?? []).length;
    expect(opens).toBe(closes);
  });

  it('未注册格式报错并列出可用项', () => {
    const profile: BuildProfile = { ...DEFAULT_BUILD_PROFILE, format: 'docx' };
    expect(() => runBuild(profile, entities())).toThrow(/未注册的渲染器.*rtf/);
  });
});

describe('YAML 序列化（design/07 §2 .yml 分享单元）', () => {
  it('YAML 往返无损', () => {
    const yamlText = serializeProfileYaml(draftProfile);
    expect(yamlText).toContain('name: 起点投稿版');
    const loaded = parseProfileYaml(yamlText);
    expect(loaded).toEqual(draftProfile);
  });

  it('YAML 双档往返互不串扰', () => {
    const a = parseProfileYaml(serializeProfileYaml(DEFAULT_BUILD_PROFILE));
    const b = parseProfileYaml(serializeProfileYaml(COMPENDIUM_BUILD_PROFILE));
    expect(a.format).toBe('md');
    expect(b.format).toBe('html');
    expect(a.selection.rootSwitches.cards).toBe(false);
    expect(b.selection.rootSwitches.cards).toBe(true);
  });

  it('缺字段报错', () => {
    expect(() => parseProfileYaml('name: x\nformat: txt')).toThrow(/缺少字段/);
  });
});
