/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect,it } from 'vitest';

import { parseSkillMd, SkillCatalog } from '../skills.js';

const SAMPLE = `---
name: pov-switch
description: 多视角叙事切换。触发词：POV、视角
tools: [core.text.continue, core.index.query]
---
# 正文方法论
第一步：立声音。
`;

describe('parseSkillMd', () => {
  it('解析 frontmatter 与正文，合并两处触发词', () => {
    const { skill, error } = parseSkillMd(SAMPLE, 'builtin', 'pov/SKILL.md');
    expect(error).toBeUndefined();
    expect(skill!.name).toBe('pov-switch');
    expect(skill!.description).toContain('多视角');
    expect(skill!.triggers).toEqual(expect.arrayContaining(['pov', '视角']));
    expect(skill!.tools).toEqual(['core.text.continue', 'core.index.query']);
    expect(skill!.body).toContain('# 正文方法论');
  });

  it('缺少 frontmatter / 缺 name 时报错不抛出', () => {
    expect(parseSkillMd('没有元数据', 'user').error).toBeTruthy();
    expect(parseSkillMd('---\ndescription: 只有描述\n---\n正文', 'user').error).toBeTruthy();
  });
});

describe('SkillCatalog 渐进注入', () => {
  const catalog = new SkillCatalog({ manifestCharBudget: 200 });
  catalog.registerParsed([
    { md: SAMPLE, source: 'builtin' },
    {
      md: '---\nname: snowflake\ndescription: 雪片法大纲：从一句话到完整大纲的十步展开，适合从零起书或重构大纲，触发词：雪片\n---\n正文',
      source: 'builtin',
    },
  ]);

  it('manifest 只含 name+description 且受预算截断', () => {
    const text = catalog.manifest()!;
    expect(text).toContain('pov-switch：');
    expect(text).not.toContain('# 正文方法论');
    expect(text.length).toBeLessThanOrEqual(260);
  });

  it('激活后全文可用，卸载后清空', () => {
    expect(catalog.activate('pov-switch')).toBe(true);
    expect(catalog.getActive()!.name).toBe('pov-switch');
    expect(catalog.getActive()!.body).toContain('立声音');

    catalog.deactivate();
    expect(catalog.getActive()).toBeNull();
    expect(catalog.activate('不存在')).toBe(false);
  });

  it('触发词匹配建议技能', () => {
    expect(catalog.matchByTrigger('帮我看看这段 POV 切换')?.name).toBe('pov-switch');
    expect(catalog.matchByTrigger('无关输入')).toBeUndefined();
  });

  it('注销激活中的技能时自动清空激活态', () => {
    const c = new SkillCatalog();
    c.registerParsed([{ md: SAMPLE, source: 'builtin' }]);
    c.activate('pov-switch');
    c.unregister('pov-switch');
    expect(c.getActive()).toBeNull();
  });

  it('按 scope 隔离：会话 A 激活不影响会话 B', () => {
    const c = new SkillCatalog();
    c.registerParsed([{ md: SAMPLE, source: 'builtin' }]);
    c.activate('pov-switch', 'sess-a');
    expect(c.getActive('sess-a')?.name).toBe('pov-switch');
    expect(c.getActive('sess-b')).toBeNull();
    c.deactivate('sess-a');
    expect(c.getActive('sess-a')).toBeNull();
    // 另一 scope 的激活不受影响
    c.activate('pov-switch', 'sess-b');
    c.deactivate('sess-a');
    expect(c.getActive('sess-b')?.name).toBe('pov-switch');
  });
});
