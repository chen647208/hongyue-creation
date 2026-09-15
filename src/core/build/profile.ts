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
 * 编译档案（docs/design/39）：在 profile 上追加 compile 编排（分卷/前后置页/目录/标题层级）。
 */
import yaml from 'js-yaml';

/** 素材口径：exclude 剔除素材；include 保留原序；prefer 保留并前移。 */
export type MaterialPolicy = 'exclude' | 'include' | 'prefer';

/** 编译范围：按构建序（1 起，含端点）截取；缺省即全选。 */
export interface BuildRange {
  from?: number;
  to?: number;
}

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
  materialPolicy?: MaterialPolicy;
  /**
   * 编译范围：按构建序取 [from, to]（1 起、含端点）。from 缺省 1，to 缺省末尾。
   * 只截取正文主体；compile.frontMatter/backMatter 由 id 指定，不受范围影响。
   */
  range?: BuildRange;
}

/** 标题处理：模板、隐藏类型、重编号、输出层级。 */
export interface BuildHeadings {
  /** %N 章节号 %T 标题 %POV 视角 */
  chapter: string;
  scene: string;
  /** 隐藏的类型列表 */
  hide: string[];
  renumber: boolean;
  /** 章节标题基础层级（md/html 输出，1..6）；缺省 2。 */
  level?: number;
}

export interface BuildTransform {
  headings: BuildHeadings;
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

/** 目录（TOC）配置。 */
export interface BuildToc {
  enabled: boolean;
  /** 目录标题，如「目录」。 */
  title: string;
  /** 收录的最大深度（相对章节层级）；缺省 1，只收章节标题。 */
  maxDepth?: number;
}

/** 参考文献与脚注（docs/design/41）：样式、文末表标题。 */
export interface BuildReferences {
  /** 是否在文末生成参考文献表；缺席按 true（有引文即生成）。 */
  enabled?: boolean;
  /** 引用样式 id（core/build/references 的 CITATION_STYLES）；缺省 numbered。 */
  style?: string;
  /** 文末参考文献表标题；缺省「参考文献」。 */
  title?: string;
  /** 脚注列表标题（纯文本/ODT 等回落为文末注时使用）；缺省「注释」。 */
  footnotesTitle?: string;
}

/** 编译编排：分卷、前后置页、目录。标题层级见 transform.headings.level。 */
export interface BuildCompile {
  toc?: BuildToc;
  /** 分卷类型模板 id（如 'novel.part'），命中即产出分卷标题。 */
  volumeTypes?: string[];
  /** 分卷节点 id；导出对话框按章节指定分卷标题时使用，与 volumeTypes 取并集。 */
  volumeIds?: string[];
  /** 分卷标题模板：%N 卷号 %T 标题。缺省「第%N卷 %T」。 */
  volumeHeading?: string;
  /** 前置页节点 id，按给定顺序置于正文前（前言/序）。 */
  frontMatter?: string[];
  /** 后置页节点 id，按给定顺序置于正文后（后记/附录）。 */
  backMatter?: string[];
}

export interface BuildProfile {
  /** 稳定标识（注册表 key）；缺省时回落 name。 */
  id?: string;
  name: string;
  /** 面向用户的一句话说明（导出预设列表展示）。 */
  description?: string;
  /** 渲染器 id（md/txt/html 内置；插件可贡献） */
  format: string;
  /**
   * 显式选择的插件渲染器 id（命名空间化，如 `<插件短名>.renderer.<声明 id>`）。
   * 命中已注册插件渲染器时优先于同格式内置渲染器；端口缺省时忽略（回落内置）。
   */
  renderer?: string;
  selection: BuildSelection;
  transform: BuildTransform;
  render: BuildRender;
  /** 编译编排（docs/design/39）；缺席即纯正文导出。 */
  compile?: BuildCompile;
  /** 参考文献与脚注（docs/design/41）；缺席按默认样式与默认标题。 */
  references?: BuildReferences;
}

/** 编译默认值：profile 缺省字段回落到此，保证默认档案等价纯正文导出。 */
export const COMPILE_DEFAULTS = {
  chapterLevel: 2,
  volumeHeading: '第%N卷 %T',
  tocTitle: '目录',
  tocMaxDepth: 1,
  referenceStyle: 'numbered',
  bibliographyTitle: '参考文献',
  footnotesTitle: '注释',
} as const;

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

/** 成稿编译档示例：章节重编号、生成目录、识别分卷（novel.part）。 */
export const MANUSCRIPT_BUILD_PROFILE: BuildProfile = {
  id: 'core.manuscript',
  name: '成稿（含目录）',
  description: '章节编号 + 目录 + 分卷标题，导出可交付稿件',
  format: 'md',
  selection: {
    includeTypes: ['novel.chapter', 'novel.part'],
    includeInactive: false,
    exclude: [],
    rootSwitches: { cards: false, meta: false },
    materialPolicy: 'exclude',
  },
  transform: {
    headings: { chapter: '%N、%T', scene: '* * *', hide: [], renumber: true, level: 2 },
    content: { includeSynopsis: false, includeComments: false, stripTags: ['draft-only'], resolveRefs: 'displayName' },
  },
  render: { chapterPageBreak: false, stripUnicode: false },
  compile: {
    toc: { enabled: true, title: '目录', maxDepth: 2 },
    volumeTypes: ['novel.part'],
    volumeHeading: '第%N卷 %T',
    frontMatter: [],
    backMatter: [],
  },
};

/** 深拷贝往返（验收 2：编辑→保存→重载无损）。 */
export function roundtripProfile(profile: BuildProfile): BuildProfile {
  return JSON.parse(JSON.stringify(profile)) as BuildProfile;
}

/** 标题层级收进 1..6；非法或缺省回落 COMPILE_DEFAULTS.chapterLevel。 */
export function clampHeadingLevel(level?: number): number {
  if (level === undefined || !Number.isFinite(level)) return COMPILE_DEFAULTS.chapterLevel;
  return Math.min(6, Math.max(1, Math.round(level)));
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
  const profile = m as unknown as BuildProfile;
  const errors = validateProfile(profile);
  if (errors.length > 0) throw new Error(`编译档案无效：${errors.join('；')}`);
  return profile;
}

/**
 * 校验编译档案，返回可读错误列表（空数组即通过）。
 * 供导入/保存与导出前检查共用；不抛错，调用方决定如何提示。
 */
export function validateProfile(profile: BuildProfile | null | undefined): string[] {
  const errors: string[] = [];
  if (!profile || typeof profile !== 'object') return ['编译档案必须是对象'];
  if (typeof profile.name !== 'string' || profile.name.trim() === '') errors.push('缺少档案名称 name');
  if (typeof profile.format !== 'string' || profile.format.trim() === '') errors.push('缺少导出格式 format');
  if (profile.renderer !== undefined && (typeof profile.renderer !== 'string' || profile.renderer.trim() === '')) {
    errors.push('插件渲染器 renderer 必须是非空字符串');
  }
  if (!Array.isArray(profile.selection?.includeTypes)) errors.push('selection.includeTypes 必须是数组');

  const policy = profile.selection?.materialPolicy;
  if (policy !== undefined && policy !== 'exclude' && policy !== 'include' && policy !== 'prefer') {
    errors.push(`未知素材口径 materialPolicy：${String(policy)}`);
  }

  const range = profile.selection?.range;
  if (range) {
    if (range.from !== undefined && (!Number.isInteger(range.from) || range.from < 1)) {
      errors.push('范围起点 range.from 必须是不小于 1 的整数');
    }
    if (range.to !== undefined && (!Number.isInteger(range.to) || range.to < 1)) {
      errors.push('范围终点 range.to 必须是不小于 1 的整数');
    }
    if (range.from !== undefined && range.to !== undefined && range.from > range.to) {
      errors.push('范围起点 range.from 不能大于终点 range.to');
    }
  }

  const level = profile.transform?.headings?.level;
  if (level !== undefined && (!Number.isInteger(level) || level < 1 || level > 6)) {
    errors.push('标题层级 level 必须是 1..6 的整数');
  }

  const toc = profile.compile?.toc;
  if (toc !== undefined && typeof toc.enabled !== 'boolean') errors.push('目录开关 compile.toc.enabled 必须是布尔值');
  if (toc?.maxDepth !== undefined && (!Number.isInteger(toc.maxDepth) || toc.maxDepth < 1)) {
    errors.push('目录深度 compile.toc.maxDepth 必须是不小于 1 的整数');
  }

  for (const key of ['frontMatter', 'backMatter', 'volumeIds'] as const) {
    const value = profile.compile?.[key];
    if (value !== undefined && (!Array.isArray(value) || value.some((id) => typeof id !== 'string'))) {
      errors.push(`compile.${key} 必须是节点 id 字符串数组`);
    }
  }
  const volumeTypes = profile.compile?.volumeTypes;
  if (volumeTypes !== undefined && (!Array.isArray(volumeTypes) || volumeTypes.some((t) => typeof t !== 'string'))) {
    errors.push('compile.volumeTypes 必须是字符串数组');
  }
  if (profile.compile?.volumeHeading !== undefined && typeof profile.compile.volumeHeading !== 'string') {
    errors.push('compile.volumeHeading 必须是字符串');
  }

  const references = profile.references;
  if (references !== undefined) {
    if (references.enabled !== undefined && typeof references.enabled !== 'boolean') {
      errors.push('references.enabled 必须是布尔值');
    }
    for (const key of ['style', 'title', 'footnotesTitle'] as const) {
      if (references[key] !== undefined && typeof references[key] !== 'string') {
        errors.push(`references.${key} 必须是字符串`);
      }
    }
  }

  return errors;
}

/** 装配编译档案：补齐缺省字段并深拷贝；不修改入参。 */
export function normalizeProfile(profile: BuildProfile): BuildProfile {
  const clone = roundtripProfile(profile);
  clone.selection = {
    ...clone.selection,
    materialPolicy: clone.selection.materialPolicy ?? 'exclude',
  };
  clone.transform = {
    ...clone.transform,
    headings: {
      ...clone.transform.headings,
      hide: clone.transform.headings.hide ?? [],
      level: clampHeadingLevel(clone.transform.headings.level),
    },
  };
  const toc = clone.compile?.toc;
  clone.compile = {
    ...clone.compile,
    volumeTypes: clone.compile?.volumeTypes ?? [],
    volumeIds: clone.compile?.volumeIds ?? [],
    volumeHeading: clone.compile?.volumeHeading ?? COMPILE_DEFAULTS.volumeHeading,
    frontMatter: clone.compile?.frontMatter ?? [],
    backMatter: clone.compile?.backMatter ?? [],
    toc: toc
      ? { enabled: toc.enabled, title: toc.title || COMPILE_DEFAULTS.tocTitle, maxDepth: toc.maxDepth ?? COMPILE_DEFAULTS.tocMaxDepth }
      : undefined,
  };
  return clone;
}

/** 前缀匹配类型：'card.*' 匹配所有 card.*；否则精确相等。 */
export function typeMatches(nodeType: string, pattern: string): boolean {
  return pattern.endsWith('*') ? nodeType.startsWith(pattern.slice(0, -1)) : nodeType === pattern;
}
