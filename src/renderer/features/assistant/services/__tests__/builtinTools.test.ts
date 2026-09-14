/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { ToolContext } from '@core/ai';
import { describe, expect, it, vi } from 'vitest';

import type { Project } from '../../../../../shared/types';

vi.mock('@/shared/services/ai/gatewayClient.js', () => ({
  aiGatewayClient: { complete: vi.fn(), stream: vi.fn() },
}));

import { createToolRegistry } from '../builtinTools';

function stubProject(): Project {
  return {
    id: 'book1',
    title: '测试书',
    inspiration: '灵感',
    intro: '简介',
    characters: [
      {
        id: 'char1', name: '阿星', gender: 'male', age: '20', role: 'protagonist',
        personality: '勇敢无畏，遇事冷静', background: '', relationships: '',
        appearance: '', distinctiveFeatures: '', occupation: '', motivation: '',
        strengths: '', weaknesses: '', characterArc: '',
      },
    ],
    outline: '全书大纲：三幕结构',
    chapters: [
      { id: 'ch1', title: '启程', summary: '主角出发', content: '第一章正文内容', order: 1 },
      { id: 'ch0', title: '楔子', summary: '背景交代', content: '', order: 0 },
    ],
    virtualChapters: [],
    knowledge: [
      { id: 'k1', name: '星辉术', content: '以星辰之力驱动的法术体系', type: 'rule', size: 10, addedAt: 1, category: 'writing' },
    ],
    lastModified: 1,
  };
}

function ctxOf(project: Project | null, services: Record<string, unknown> = {}): ToolContext {
  return { project: project ?? undefined, services };
}

describe('按需上下文工具', () => {
  it('注册表包含 17 个工具且无重复', () => {
    const registry = createToolRegistry();
    for (const id of [
      'core.chapter.list', 'core.chapter.read', 'core.outline.read', 'core.character.list',
      'core.knowledge.read', 'core.text.search', 'core.text.semanticSearch', 'core.skill.load', 'core.skill.run', 'core.plugin.run',
    ]) {
      expect(registry.has(id), id).toBe(true);
    }
    expect(registry.list()).toHaveLength(19);
  });

  it('chapter.list 按 order 排序并标注正文状态', async () => {
    const registry = createToolRegistry();
    const out = await registry.execute('core.chapter.list', {}, ctxOf(stubProject()));
    expect(out.ok).toBe(true);
    const data = out.data as { total: number; chapters: Array<{ order: number; hasContent: boolean }> };
    expect(data.total).toBe(2);
    expect(data.chapters.map((c) => c.order)).toEqual([0, 1]);
    expect(data.chapters[1]!.hasContent).toBe(true);
    expect(data.chapters[0]!.hasContent).toBe(false);
  });

  it('chapter.read 按 order/id 定位，超长截断并标注', async () => {
    const registry = createToolRegistry();
    const ctx = ctxOf(stubProject());
    const byOrder = await registry.execute('core.chapter.read', { order: 1 }, ctx);
    expect(byOrder.ok).toBe(true);
    expect((byOrder.data as { title: string }).title).toBe('启程');

    const byId = await registry.execute('core.chapter.read', { chapterId: 'ch0', maxChars: 500 }, ctx);
    expect(byId.ok).toBe(true);
    expect((byId.data as { summary: string }).summary).toBe('背景交代');

    const missing = await registry.execute('core.chapter.read', { order: 99 }, ctx);
    expect(missing.ok).toBe(false);
    expect(missing.error).toContain('core.chapter.list');

    const long = await registry.execute('core.chapter.read', { chapterId: 'ch1', maxChars: 500 }, ctx);
    expect((long.data as { content: string }).content).toContain('第一章正文内容');
    expect((long.data as { contentTruncated: boolean }).contentTruncated).toBe(false);
  });

  it('outline.read 返回大纲与章节标题清单', async () => {
    const registry = createToolRegistry();
    const out = await registry.execute('core.outline.read', {}, ctxOf(stubProject()));
    expect(out.ok).toBe(true);
    const data = out.data as { outline: string; chapters: Array<{ title: string }> };
    expect(data.outline).toContain('三幕结构');
    expect(data.chapters.map((c) => c.title)).toEqual(['楔子', '启程']);
  });

  it('character.list 返回精简人物', async () => {
    const registry = createToolRegistry();
    const out = await registry.execute('core.character.list', { limit: 5 }, ctxOf(stubProject()));
    expect(out.ok).toBe(true);
    const data = out.data as { total: number; characters: Array<{ name: string; brief: string }> };
    expect(data.total).toBe(1);
    expect(data.characters[0]!.name).toBe('阿星');
    expect(data.characters[0]!.brief).toContain('勇敢无畏');
  });

  it('knowledge.read 无参列清单，按名读全文，未命中报错', async () => {
    const registry = createToolRegistry();
    const ctx = ctxOf(stubProject());
    const list = await registry.execute('core.knowledge.read', {}, ctx);
    expect((list.data as { total: number }).total).toBe(1);

    const item = await registry.execute('core.knowledge.read', { name: '星辉' }, ctx);
    expect(item.ok).toBe(true);
    expect((item.data as { content: string }).content).toContain('星辰之力');

    const missing = await registry.execute('core.knowledge.read', { name: '不存在' }, ctx);
    expect(missing.ok).toBe(false);
  });

  it('text.search 透传宿主全文检索并返回带出处的引用；空结果明确未找到；缺服务时明确报错', async () => {
    const registry = createToolRegistry();
    const hits = [{ scope: 'chapter', id: 'ch1', title: '启程', snippet: '命中…', rank: 1 }];
    const textSearch = vi.fn(async () => hits);
    const ok = await registry.execute('core.text.search', { query: '星辰', limit: 5 }, ctxOf(stubProject(), { textSearch }));
    expect(ok.ok).toBe(true);
    expect(textSearch).toHaveBeenCalledWith('星辰', 5);
    const data = ok.data as { found: boolean; citations: Array<{ refId: string; anchor: string }>; text: string };
    expect(data.found).toBe(true);
    expect(data.citations[0]?.refId).toBe('ch1');
    expect(data.citations[0]?.anchor).toBe('chapter:ch1');
    expect(data.text).toContain('出处 chapter:ch1');

    const emptyHits = await registry.execute('core.text.search', { query: '没有的词' }, ctxOf(stubProject(), { textSearch: vi.fn(async () => []) }));
    expect(emptyHits.ok).toBe(true);
    const emptyData = emptyHits.data as { found: boolean; citations: unknown[]; text: string };
    expect(emptyData.found).toBe(false);
    expect(emptyData.citations).toEqual([]);
    expect(emptyData.text).toContain('未找到');

    const noService = await registry.execute('core.text.search', { query: '星辰' }, ctxOf(stubProject()));
    expect(noService.ok).toBe(false);
    expect(noService.error).toContain('全文检索服务不可用');

    const blank = await registry.execute('core.text.search', { query: '  ' }, ctxOf(stubProject(), { textSearch }));
    expect(blank.ok).toBe(false);
  });

  it('semanticSearch 缺服务时引导回落关键词检索', async () => {
    const registry = createToolRegistry();
    const out = await registry.execute('core.text.semanticSearch', { query: '法术体系' }, ctxOf(stubProject()));
    expect(out.ok).toBe(false);
    expect(out.error).toContain('core.text.search');
  });

  it('skill.load 经宿主服务按名激活；缺服务或无此技能报错', async () => {
    const registry = createToolRegistry();
    const skillLoad = vi.fn((name: string) => name === 'snowflake');
    const ok = await registry.execute('core.skill.load', { name: 'snowflake' }, ctxOf(stubProject(), { skillLoad }));
    expect(ok).toEqual({ ok: true, data: { activated: 'snowflake' } });

    const missing = await registry.execute('core.skill.load', { name: '不存在' }, ctxOf(stubProject(), { skillLoad }));
    expect(missing.ok).toBe(false);

    const noService = await registry.execute('core.skill.load', { name: 'snowflake' }, ctxOf(stubProject()));
    expect(noService.ok).toBe(false);
  });

  it('无项目时读工具直接报错', async () => {
    const registry = createToolRegistry();
    const out = await registry.execute('core.chapter.list', {}, ctxOf(null));
    expect(out.ok).toBe(false);
    expect(out.error).toContain('没有打开的书籍');
  });
});
