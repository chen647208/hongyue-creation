/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * Build Profile（docs/design/07 §2）：选择 → 变换 → 渲染 的声明式定义。
 * Profile 是一等公民：多套并存、可 diff、可分享。序列化支持 JSON 与
 * YAML（.novel/builds/*.yml，js-yaml 双向往返，验收 2）。
 */
import yaml from 'js-yaml';

export interface BuildSelection {
  /** 参与构建的类型模板 id；'*' 后缀为类别通配（如 'card.*'） */
  includeTypes: string[];
  /** false 时剔除 status=inactive/archived 的节点 */
  includeInactive: boolean;
  /** 单点排除（'node:<id>'） */
  exclude: string[];
  /** 整类开关 */
  rootSwitches: { cards: boolean; meta: boolean };
  /**
   * 素材口径：exclude（默认）剔除标记为素材的节点；include 保留原序；
   * prefer 保留并把素材排在非素材之前。缺席按 exclude。
   */
  materialPolicy?: 'exclude' | 'include' | 'prefer';
}

export interface BuildTransform {
  headings: {
    /** %N 章节号 %T 标题 %POV 视角 */
    chapter: string;
    scene: string;
    /** 隐藏的类型列表 */
    hide: string[];
    renumber: boolean;
  };
  content: {
    includeSynopsis: boolean;
    includeComments: boolean;
    /** 忽略的标签行（如 draft-only） */
    stripTags: string[];
    /** 'displayName'：引用替换为显示名；'raw'：保留原样 */
    resolveRefs: 'displayName' | 'raw';
  };
}

export interface BuildRender {
  font?: string;
  lineHeight?: number;
  chapterPageBreak: boolean;
  stripUnicode: boolean;
}

export interface BuildProfile {
  /** 稳定标识（注册表 key）；缺省时回落 name。 */
  id?: string;
  name: string;
  /** 面向用户的一句话说明（导出预设列表展示）。 */
  description?: string;
  /** 渲染器 id（md/txt/html 内置；插件可贡献） */
  format: string;
  selection: BuildSelection;
  transform: BuildTransform;
  render: BuildRender;
}

export const DEFAULT_BUILD_PROFILE: BuildProfile = {
  id: 'core.default',
  name: '快速导出',
  format: 'md',
  selection: {
    includeTypes: ['novel.chapter', 'novel.scene'],
    includeInactive: false,
    exclude: [],
    rootSwitches: { cards: false, meta: false },
    materialPolicy: 'exclude',
  },
  transform: {
    headings: { chapter: '%N、%T', scene: '* * *', hide: [], renumber: true },
    content: { includeSynopsis: false, includeComments: false, stripTags: ['draft-only'], resolveRefs: 'displayName' },
  },
  render: { chapterPageBreak: false, stripUnicode: false },
};

/** 设定集示例 profile（验收 1 的另一端：同书不同 profile 产出差异）。 */
export const COMPENDIUM_BUILD_PROFILE: BuildProfile = {
  id: 'core.compendium',
  name: '设定集',
  format: 'html',
  selection: {
    includeTypes: ['card.*', 'meta.*'],
    includeInactive: true,
    exclude: [],
    rootSwitches: { cards: true, meta: true },
    materialPolicy: 'prefer',
  },
  transform: {
    headings: { chapter: '【%T】', scene: '', hide: ['novel.chapter'], renumber: false },
    content: { includeSynopsis: true, includeComments: true, stripTags: [], resolveRefs: 'displayName' },
  },
  render: { chapterPageBreak: true, stripUnicode: false },
};

/** 深拷贝往返（验收 2：编辑→保存→重载无损）。 */
export function roundtripProfile(profile: BuildProfile): BuildProfile {
  return JSON.parse(JSON.stringify(profile)) as BuildProfile;
}

/** Profile → YAML 文本（.yml 分享单元）。 */
export function serializeProfileYaml(profile: BuildProfile): string {
  return yaml.dump(profile, { lineWidth: 120, noRefs: true });
}

/** YAML 文本 → Profile；结构校验失败抛错（导入 UI 捕获提示）。 */
export function parseProfileYaml(text: string): BuildProfile {
  const parsed = yaml.load(text);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Profile YAML 必须是对象');
  }
  const m = parsed as Record<string, unknown>;
  for (const key of ['name', 'format', 'selection', 'transform', 'render']) {
    if (!(key in m)) throw new Error(`Profile YAML 缺少字段：${key}`);
  }
  return m as unknown as BuildProfile;
}

/** 前缀匹配类型：'card.*' 匹配所有 card.*；否则精确相等。 */
export function typeMatches(nodeType: string, pattern: string): boolean {
  return pattern.endsWith('*') ? nodeType.startsWith(pattern.slice(0, -1)) : nodeType === pattern;
}
