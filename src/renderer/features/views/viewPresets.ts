/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 视图预设：随功能分发的 ViewLayout 模板（数据资源，不进核心）。
 *
 * 类型模板（TypeTemplate.views）只声明视图形态名，不携带 ViewLayout 配置，
 * 也没有随模板播种视图的入口，故垂直形态以预设资源表达，由视图面板「插入预设」应用。
 * 预设里的列 key 对应实体字段 key；计算列公式与参数一并保存进 ViewDefinition.config。
 */
import type { ViewLayout } from './types';

export interface ViewPreset {
  id: string;
  /** 显示名 i18n 键（world 命名空间）。 */
  nameKey: string;
  /** 说明 i18n 键（world 命名空间）。 */
  descriptionKey: string;
  /** 面向的类型模板 id（文档用途，插入时不校验数据来源）。 */
  templateId: string;
  layout: ViewLayout;
}

/** 分镜表：镜号、景别、画面、台词、音效、时长，末两列由计算列 definitions 派生（键不得再写进 columns，否则列出现两份）。 */
const STORYBOARD_PRESET: ViewPreset = {
  id: 'preset:storyboard',
  nameKey: 'views.preset.storyboard.name',
  descriptionKey: 'views.preset.storyboard.description',
  templateId: 'storyboard.shot',
  layout: {
    kind: 'table',
    columns: [
      { key: 'shotNumber', label: 'views.preset.storyboard.col.shotNumber', width: 72 },
      { key: 'framing', label: 'views.preset.storyboard.col.framing', width: 88 },
      { key: 'image', label: 'views.preset.storyboard.col.image', width: 140 },
      { key: 'dialogue', label: 'views.preset.storyboard.col.dialogue', width: 220 },
      { key: 'sound', label: 'views.preset.storyboard.col.sound', width: 140 },
      { key: 'duration', label: 'views.preset.storyboard.col.duration', width: 96 }
    ],
    hidden: [],
    sortKey: 'shotNumber',
    sortDesc: false,
    // 章节型分镜正文用中文 DSL 关键字（# @画面: …）。别名把关键字补到模板字段，
    // 扩展类型 storyboard.shot 的条目字段键已对齐，别名只在目标为空时生效。
    fieldAliases: {
      title: 'shotNumber',
      画面: 'image',
      景别: 'framing',
      镜头运动: 'cameraMove',
      台词: 'dialogue',
      音效: 'sound',
      时长: 'duration',
    },
    computed: [
      { key: 'computed:shotWordCount', label: 'views.preset.storyboard.col.wordCount', operator: 'length', operands: ['dialogue'], width: 96 },
      {
        key: 'computed:shotSpeakDuration',
        label: 'views.preset.storyboard.col.speakDuration',
        operator: 'divide',
        operands: ['computed:shotWordCount', '$speechRate'],
        // 语速为视图参数，默认值可在视图面板改；引擎内不写死语速常数。
        params: { speechRate: 5 },
        width: 120,
      },
    ],
  },
};

export const VIEW_PRESETS: readonly ViewPreset[] = [STORYBOARD_PRESET];

export function findViewPreset(id: string): ViewPreset | undefined {
  return VIEW_PRESETS.find((preset) => preset.id === id);
}
