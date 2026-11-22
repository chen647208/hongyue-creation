/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect,it } from 'vitest';

import { APP_STATE_VERSION } from '../../../shared/constants/versions';
import { resolveModels } from '../../../shared/providers';
import type { AppState, Project } from '../../../shared/types';
import { checkImportVersion,INITIAL_APP_STATE, normalizeImportedState } from '../initialState';

const project = (id: string): Project =>
  ({ id, title: `书-${id}`, chapters: [] } as unknown as Project);

describe('normalizeImportedState', () => {
  it('空输入回退到结构完整的默认状态', () => {
    for (const input of [null, undefined, {}]) {
      const s = normalizeImportedState(input);
      expect(s.projects).toEqual([]);
      expect(s.activeProjectId).toBeNull();
      expect(s.models).toEqual(INITIAL_APP_STATE.models);
      expect(s.providers).toEqual(INITIAL_APP_STATE.providers);
      expect(s.prompts).toBe(INITIAL_APP_STATE.prompts);
      expect(s.activeModelId).toBe('default-deepseek');
      expect(s.embeddingModels).toEqual([]);
    }
  });

  it('非数组字段回退到默认值', () => {
    const s = normalizeImportedState({ projects: 'nope', models: 42 } as unknown as Partial<AppState>);
    expect(s.projects).toEqual([]);
    expect(s.models).toEqual(INITIAL_APP_STATE.models);
  });

  it('有项目但缺少有效 activeProjectId 时选中第一个', () => {
    const s = normalizeImportedState({ projects: [project('a'), project('b')] });
    expect(s.activeProjectId).toBe('a');
  });

  it('activeProjectId 指向不存在的项目时纠正为第一个', () => {
    const s = normalizeImportedState({ projects: [project('a')], activeProjectId: 'ghost' });
    expect(s.activeProjectId).toBe('a');
  });

  it('activeProjectId 有效时保持不变', () => {
    const s = normalizeImportedState({ projects: [project('a'), project('b')], activeProjectId: 'b' });
    expect(s.activeProjectId).toBe('b');
  });

  it('无项目时强制清空 activeProjectId', () => {
    const s = normalizeImportedState({ projects: [], activeProjectId: 'a' });
    expect(s.activeProjectId).toBeNull();
  });

  it('透传 cardPrompts / consistencyPrompts / consistencyCheckConfig（导入不丢数据）', () => {
    const imported = {
      projects: [project('a')],
      cardPrompts: [{ id: 'cp1' }],
      consistencyPrompts: [{ id: 'kp1' }],
      consistencyCheckConfig: { mode: 'ai' },
    } as unknown as Partial<AppState>;
    const s = normalizeImportedState(imported);
    expect(s.cardPrompts).toEqual([{ id: 'cp1' }]);
    expect(s.consistencyPrompts).toEqual([{ id: 'kp1' }]);
    expect(s.consistencyCheckConfig).toEqual({ mode: 'ai' });
  });

  it('缺失的可选配置回退到初始默认值', () => {
    const s = normalizeImportedState({ projects: [project('a')] });
    expect(s.cardPrompts).toBe(INITIAL_APP_STATE.cardPrompts);
    expect(s.consistencyPrompts).toBe(INITIAL_APP_STATE.consistencyPrompts);
    expect(s.consistencyCheckConfig).toBe(INITIAL_APP_STATE.consistencyCheckConfig);
  });

  it('透传合法 language，非法/缺失回退到默认（跟随检测）', () => {
    expect(normalizeImportedState({ language: 'en' }).language).toBe('en');
    expect(normalizeImportedState({ language: 'zh' }).language).toBe('zh');
    expect(normalizeImportedState({ language: 'fr' } as unknown as Partial<AppState>).language).toBeUndefined();
    expect(normalizeImportedState({}).language).toBeUndefined();
  });
});

describe('INITIAL_APP_STATE 内置模型种子', () => {
  const VALID_PROVIDERS = new Set(['openai-chat', 'openai-responses', 'anthropic', 'gemini', 'ollama']);

  it('内置 9 个模型，默认激活 DeepSeek V4 Pro', () => {
    expect(INITIAL_APP_STATE.models).toHaveLength(9);
    expect(INITIAL_APP_STATE.activeModelId).toBe('default-deepseek');
    const active = resolveModels(INITIAL_APP_STATE.providers, INITIAL_APP_STATE.models)
      .find((m) => m.id === INITIAL_APP_STATE.activeModelId);
    expect(active?.modelName).toBe('deepseek-v4-pro');
    expect(active?.provider).toBe('openai-chat');
  });

  it('每个模型都归属一个合法供应商，modelName 非空、id 唯一', () => {
    const ids = new Set<string>();
    const providerById = new Map(INITIAL_APP_STATE.providers.map((p) => [p.id, p]));
    for (const m of INITIAL_APP_STATE.models) {
      expect(providerById.has(m.providerId)).toBe(true);
      expect(VALID_PROVIDERS.has(providerById.get(m.providerId)!.provider)).toBe(true);
      expect(m.modelName.length).toBeGreaterThan(0);
      expect(ids.has(m.id)).toBe(false);
      ids.add(m.id);
    }
  });

  it('内置供应商均预置 presetId；除 gemini 外均预置 endpoint', () => {
    for (const p of INITIAL_APP_STATE.providers) {
      expect(p.presetId).toBeTruthy();
      if (p.provider !== 'gemini') {
        expect(p.endpoint && p.endpoint.length).toBeGreaterThan(0);
      }
    }
  });

  it('覆盖四种协议 + 五家国内渠道', () => {
    const protocols = new Set(INITIAL_APP_STATE.providers.map((p) => p.provider));
    expect(protocols.has('openai-chat')).toBe(true);
    expect(protocols.has('anthropic')).toBe(true);
    expect(protocols.has('gemini')).toBe(true);
    const presetIds = new Set(INITIAL_APP_STATE.providers.map((p) => p.presetId));
    for (const cn of ['deepseek', 'kimi', 'zhipu', 'qwen', 'minimax']) {
      expect(presetIds.has(cn)).toBe(true);
    }
  });
});

describe('checkImportVersion', () => {
  it('缺号/旧版/同版可读，新版拒绝', () => {
    expect(checkImportVersion(null)).toBe('ok');
    expect(checkImportVersion({})).toBe('ok');
    expect(checkImportVersion({ schemaVersion: APP_STATE_VERSION })).toBe('ok');
    expect(checkImportVersion({ schemaVersion: APP_STATE_VERSION + 1 })).toBe('too-new');
    expect(checkImportVersion({ schemaVersion: 'x' })).toBe('ok');
  });

  it('normalize 输出携带当前版本号', () => {
    expect(normalizeImportedState({}).schemaVersion).toBe(APP_STATE_VERSION);
  });
});
