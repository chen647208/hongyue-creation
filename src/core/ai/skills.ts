/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 写法技能引擎（docs/design/05 §3，codex Skills 规范对齐）。
 *
 * 写法 = 数据不是代码：SKILL.md（frontmatter + 方法论正文）即可分发。
 * 渐进式加载是本引擎的核心语义：会话启动只注入 {name, description} 清单
 * （预算上限、超限截断），模型显式命中才激活全文；激活可卸载。
 * 纯模块：发现来源由调用方注入（内置 ?raw 打包 / 用户目录 / M3 插件贡献）。
 */

/** 技能的逻辑轨（轨道二）：沙箱内执行的 handler 源码。 */
export interface SkillHandler {
  /** handler 源码；JS 轨应定义 `function run(input)`，WASM 轨为模块字节（base64）。 */
  code: string;
  /** 来源文件（诊断用）。 */
  sourceFile: string;
  /** 执行形态：JS（QuickJS）或 WASM。 */
  mode?: 'js' | 'wasm';
  /** 内容哈希（装载时用于"内容未变不重载"）。 */
  hash?: string;
}

/** 内容哈希（FNV-1a 32 位十六进制）：判定 handler 是否变化，未变则不重载。 */
export function hashContent(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** 一个已解析的技能。body 是完整方法论正文（不常驻 prompt）。 */
export interface Skill {
  name: string;
  description: string;
  /** 触发词：模型输出/用户输入包含任一词即可建议激活（小写匹配） */
  triggers: string[];
  /** 技能自带的工具白名单（可选；空 = 不限制） */
  tools: string[];
  /** WASM 逻辑轨可用的宿主函数种类（now/log/hash；空 = 无导入权限）。 */
  hosts: string[];
  /** 来源：builtin / user / plugin / book */
  source: 'builtin' | 'user' | 'plugin' | 'book';
  /** 方法论正文 */
  body: string;
  /** 逻辑轨（可选）：双轨技能在资源轨之外提供可执行的 handler。 */
  handler?: SkillHandler;
}

/** 解析失败的容错信息（跳过该文件并记录原因）。 */
export interface SkillParseError {
  sourceFile: string;
  reason: string;
}

export interface ParsedSkillFile {
  skill?: Skill;
  error?: SkillParseError;
}

/**
 * 解析 SKILL.md：
 * ---
 * name: xxx
 * description: xxx（可含「触发词：a、b」）
 * triggers: [a, b]        # 可选，与 description 中的触发词合并
 * tools: [core.x, core.y] # 可选
 * source: builtin         # 可选，默认由调用方标注
 * ---
 * 正文（方法论全文）
 */
export function parseSkillMd(md: string, source: Skill['source'], sourceFile = 'SKILL.md'): ParsedSkillFile {
  const text = md.replace(/\r\n/g, '\n');
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { error: { sourceFile, reason: '缺少 frontmatter（--- 包围的元数据块）' } };
  }

  const frontmatter = match[1] ?? '';
  const body = match[2] ?? '';
  const meta: Record<string, string> = {};
  for (const line of frontmatter.split('\n')) {
    const kv = line.match(/^([A-Za-z_-]+)\s*:\s*(.*)$/);
    const key = kv?.[1];
    const value = kv?.[2];
    if (key && value !== undefined) {
      meta[key.toLowerCase()] = value.trim();
    }
  }

  const name = meta.name;
  const description = meta.description;
  if (!name || !description) {
    return { error: { sourceFile, reason: 'frontmatter 缺少 name 或 description' } };
  }

  const triggers = new Set<string>();
  // description 里的「触发词：a、b」
  const inlineTrigger = description.match(/触发词[:：]\s*(.+)$/);
  const inlineWords = inlineTrigger?.[1];
  if (inlineWords) {
    for (const t of inlineWords.split(/[、,，]/)) {
      const word = t.trim();
      if (word) triggers.add(word.toLowerCase());
    }
  }
  // frontmatter 的 triggers: [a, b] 或 a、b
  if (meta.triggers) {
    const list = meta.triggers.replace(/[\][]/g, '');
    for (const t of list.split(/[、,，]/)) {
      const word = t.trim();
      if (word) triggers.add(word.toLowerCase());
    }
  }

  const tools = meta.tools
    ? meta.tools.replace(/[\][]/g, '').split(/[、,，]/).map((s) => s.trim()).filter(Boolean)
    : [];

  const hosts = meta.hosts
    ? meta.hosts.replace(/[\][]/g, '').split(/[、,，]/).map((s) => s.trim()).filter(Boolean)
    : [];

  return {
    skill: {
      name,
      description,
      triggers: [...triggers],
      tools,
      hosts,
      source,
      body: body.trim(),
    },
  };
}

export interface SkillCatalogOptions {
  /** 注入清单的字符预算（约等于 500 token 的中文量级），超限截断 description */
  manifestCharBudget?: number;
}

const DEFAULT_MANIFEST_BUDGET = 1600;

/**
 * 技能目录：注册来源 → 渐进注入清单 → 激活/卸载。
 * 激活状态即 PromptContext.activeSkill 的数据源（每会话一个目录实例）。
 */
export class SkillCatalog {
  private readonly skills = new Map<string, Skill>();
  /** scope（会话 id）→ 激活技能名；并行会话各持一份，互不覆盖。 */
  private readonly activeByScope = new Map<string, string>();
  /** 最近一次激活的技能名；无 scope 查询的兼容出口，并行会话下仅作诊断。 */
  private lastActive: string | null = null;
  private readonly manifestBudget: number;

  constructor(options: SkillCatalogOptions = {}) {
    this.manifestBudget = options.manifestCharBudget ?? DEFAULT_MANIFEST_BUDGET;
  }

  /** 注册技能；同名覆盖（同名不同 source 时后注册者优先）。 */
  register(skill: Skill): this {
    this.skills.set(skill.name, skill);
    for (const [scope, name] of this.activeByScope) {
      if (!this.skills.has(name)) this.activeByScope.delete(scope);
    }
    if (this.lastActive && !this.skills.has(this.lastActive)) {
      this.lastActive = this.mostRecentActive();
    }
    return this;
  }

  registerParsed(files: Array<{ md: string; source: Skill['source']; sourceFile?: string }>): SkillParseError[] {
    const errors: SkillParseError[] = [];
    for (const file of files) {
      const parsed = parseSkillMd(file.md, file.source, file.sourceFile);
      if (parsed.skill) this.register(parsed.skill);
      if (parsed.error) errors.push(parsed.error);
    }
    return errors;
  }

  unregister(name: string): boolean {
    for (const [scope, active] of this.activeByScope) {
      if (active === name) this.activeByScope.delete(scope);
    }
    if (this.lastActive === name) this.lastActive = this.mostRecentActive();
    return this.skills.delete(name);
  }

  /** 为已注册技能挂上逻辑轨 handler；内容哈希未变则不重载（返回 unchanged）。 */
  setHandler(name: string, handler: SkillHandler): 'set' | 'unchanged' | 'missing' {
    const skill = this.skills.get(name);
    if (!skill) return 'missing';
    const hash = handler.hash ?? hashContent(handler.code);
    if (skill.handler?.hash === hash) return 'unchanged';
    skill.handler = { ...handler, hash };
    return 'set';
  }

  list(): Skill[] {
    return [...this.skills.values()];
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  /**
   * 渐进注入清单：只含 name + description（预算内），一行一技能。
   * 这是会话启动时唯一进入 prompt 的技能数据。
   */
  manifest(): string | undefined {
    if (!this.skills.size) return undefined;
    const lines: string[] = [];
    let used = 0;
    let truncated = false;
    for (const skill of this.skills.values()) {
      const line = `- ${skill.name}：${skill.description}`;
      if (used + line.length > this.manifestBudget) {
        truncated = true;
        break;
      }
      lines.push(line);
      used += line.length + 1;
    }
    if (!lines.length) {
      // 单条描述就超预算：硬截断描述
      const first = this.skills.values().next().value;
      if (!first) return undefined;
      return `- ${first.name}：${first.description.slice(0, Math.max(0, this.manifestBudget - first.name.length - 3))}…`;
    }
    if (truncated) lines.push(`（另有技能未列出，可按名称查询）`);
    return lines.join('\n');
  }

  /** 按触发词匹配可建议的技能（用户输入或模型自述包含触发词）。 */
  matchByTrigger(text: string): Skill | undefined {
    const lower = text.toLowerCase();
    return this.list().find((skill) => skill.triggers.some((t) => lower.includes(t)));
  }

  /**
   * 激活技能（全文进入 prompt）；scope 标识会话，缺省为全局默认。
   * 不同 scope 的激活状态互不影响，供并行助手会话做隔离。
   */
  activate(name: string, scope = ''): boolean {
    if (!this.skills.has(name)) return false;
    this.activeByScope.set(scope, name);
    this.lastActive = name;
    return true;
  }

  /** 卸载指定 scope 的激活技能；不传 scope 时清空全部。 */
  deactivate(scope?: string): void {
    if (scope === undefined) {
      this.activeByScope.clear();
      this.lastActive = null;
      return;
    }
    this.activeByScope.delete(scope);
    if (this.lastActive && ![...this.activeByScope.values()].includes(this.lastActive)) {
      this.lastActive = this.mostRecentActive();
    }
  }

  /**
   * 当前激活技能（PromptContext.activeSkill 数据源；tools 供 Agent 循环做白名单拦截）。
   * 传 scope 取该会话的激活状态；不传时取最近激活（兼容单会话调用与诊断）。
   */
  getActive(scope?: string): { name: string; body: string; tools: string[]; handler?: SkillHandler } | null {
    const name = scope === undefined ? this.lastActive : this.activeByScope.get(scope) ?? null;
    if (!name) return null;
    const skill = this.skills.get(name);
    return skill ? { name: skill.name, body: skill.body, tools: skill.tools, handler: skill.handler } : null;
  }

  private mostRecentActive(): string | null {
    return [...this.activeByScope.values()].at(-1) ?? null;
  }
}
