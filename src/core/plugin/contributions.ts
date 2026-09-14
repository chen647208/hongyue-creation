/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 贡献注册表（docs/design/04 §4 v0 资源型贡献点）。
 * - 类型模板：插件 JSON 声明 → TypeRegistry（id 强制命名空间前缀）。
 * - Build Profile：导出构建档（07 篇消费），v0 先登记清单。
 * 注册一律返回 Disposable（unwind 不变量）。
 */
import { type FormulaExpr,validateFormulaExpr } from '../../shared/formulaScript';
import type { BuildProfile } from '../build/profile.js';
import type { TypeRegistry,TypeTemplate } from '../types-registry';
import type { InterceptHandler, SeamPolicy } from './events.js';
import { assertPermission, type Disposable, type PluginManifest } from './manifest.js';

/** 构建档注册表 key：id 优先，缺省回落 name（与 core/build 单源类型）。 */
export function buildProfileKey(profile: BuildProfile): string {
  return profile.id ?? profile.name;
}

export class BuildProfileRegistry {
  private readonly profiles = new Map<string, BuildProfile>();

  register(profile: BuildProfile): Disposable {
    const key = buildProfileKey(profile);
    this.profiles.set(key, profile);
    return { dispose: () => this.profiles.delete(key) };
  }

  get(id: string): BuildProfile | undefined {
    return this.profiles.get(id);
  }

  /** 移除注册项（用户删除档案/插件卸载）；不存在时静默。 */
  remove(id: string): void {
    this.profiles.delete(id);
  }

  list(): BuildProfile[] {
    return [...this.profiles.values()];
  }
}

/** hooks 声明（JSON）：一条策略 = 接缝 + 动作。 */
export interface HookDeclaration {
  on: string;
  seam?: 'fs' | 'ai' | 'index';
  do: 'inject' | 'filter' | 'observe' | 'logic' | 'gate';
  where?: 'system' | 'user';
  text?: string;
  pattern?: string;
  replacement?: string;
  /** do=gate 时：是否放行（默认 true）；false 即拒绝该接缝请求。 */
  allow?: boolean;
  /** do=gate 被拒绝时的原因文案。 */
  reason?: string;
  /** do=logic 时：插件逻辑贡献中的具名函数（design/22 §3）。 */
  fn?: string;
}

/** 解析 hooks 声明为总线操作（v0：inject/filter/logic 落 ai 接缝，observe 落事件观察）。
 *  声明 hooks 即视为写入对应接缝域，须在 manifest.permissions.write 声明，否则拒绝（默认拒绝）。 */
export function installHooks(
  hooks: HookDeclaration[],
  bus: {
    decorate(seam: 'fs' | 'ai' | 'index', policy: SeamPolicy, pluginId?: string): Disposable;
    intercept(type: string, handler: InterceptHandler, pluginId?: string): Disposable;
  },
  pluginId?: string,
  manifest?: PluginManifest,
): Disposable[] {
  const disposables: Disposable[] = [];
  for (const hook of hooks) {
    if (hook.do === 'inject' || hook.do === 'filter') {
      const seam = hook.seam ?? 'ai';
      if (manifest) assertPermission(manifest, 'write', seam);
      const policy: SeamPolicy =
        hook.do === 'inject'
          ? { do: 'inject', where: hook.where ?? 'system', text: hook.text ?? '' }
          : { do: 'filter', pattern: hook.pattern ?? '', replacement: hook.replacement };
      disposables.push(bus.decorate(seam, policy, pluginId));
    } else if (hook.do === 'logic' && pluginId && hook.fn) {
      const seam = hook.seam ?? 'ai';
      if (manifest) assertPermission(manifest, 'write', seam);
      disposables.push(bus.decorate(seam, { do: 'logic', pluginId, fn: hook.fn }, pluginId));
    } else if (hook.do === 'gate') {
      const seam = hook.seam ?? 'ai';
      if (manifest) assertPermission(manifest, 'write', seam);
      const allow = hook.allow !== false;
      const reason = hook.reason;
      disposables.push(bus.intercept(hook.on, () => (allow ? true : { allowed: false, reason }), pluginId));
    }
  }
  return disposables;
}

/** 视图公式定义：插件贡献的可序列化派生字段（JSON），无代码执行。 */
export interface FormulaDefinition {
  id: string;
  label: string;
  expression: FormulaExpr;
  description?: string;
}

/** 视图公式注册表：id → 公式定义；与类型模板同样可逆注册（Disposable 回退）。 */
export class FormulaRegistry {
  private readonly formulas = new Map<string, FormulaDefinition>();

  register(formula: FormulaDefinition): Disposable {
    this.formulas.set(formula.id, formula);
    return { dispose: () => this.formulas.delete(formula.id) };
  }

  unregister(id: string): boolean {
    return this.formulas.delete(id);
  }

  get(id: string): FormulaDefinition | undefined {
    return this.formulas.get(id);
  }

  list(): FormulaDefinition[] {
    return [...this.formulas.values()];
  }
}

/**
 * 校验并安装插件公式（强制命名空间前缀）。表达式经 shared/formulaScript 白名单校验，
 * 校验失败一律不注册（deny-by-default）；公式只读行字段，无网络/文件/代码执行。
 */
export function installFormulas(
  pluginId: string,
  rawFormulas: unknown,
  registry: FormulaRegistry,
  namespaced: (pluginId: string, id: string) => string,
): Disposable[] {
  const disposables: Disposable[] = [];
  const list = Array.isArray(rawFormulas) ? rawFormulas : [];
  for (const raw of list) {
    if (typeof raw !== 'object' || raw === null) continue;
    const record = raw as Record<string, unknown>;
    const declaredId = typeof record.id === 'string' ? record.id : '';
    if (!declaredId || typeof record.label !== 'string' || record.label === '') continue;
    const parsed = validateFormulaExpr(record.expression);
    if (!parsed.ok) continue;
    const id = namespaced(pluginId, declaredId);
    registry.register({
      id,
      label: record.label,
      expression: parsed.expr,
      description: typeof record.description === 'string' ? record.description : undefined,
    });
    disposables.push({ dispose: () => registry.unregister(id) });
  }
  return disposables;
}

/** 校验并安装插件类型模板（强制命名空间前缀，防止裸 id 抢占内置类型）。 */
export function installTypeTemplates(
  pluginId: string,
  templates: Array<Record<string, unknown>>,
  registry: TypeRegistry,
  namespaced: (pluginId: string, type: string) => string,
): Disposable[] {
  const disposables: Disposable[] = [];
  for (const raw of templates) {
    const declaredId = String(raw.id ?? '');
    if (!declaredId) continue;
    const id = namespaced(pluginId, declaredId);
    const template = { ...raw, id } as TypeTemplate;
    registry.register(template);
    disposables.push({ dispose: () => registry.unregister(id) });
  }
  return disposables;
}
