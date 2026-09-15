/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 可执行贡献注册表（docs/design/49）：只登记描述符，不加载、不执行代码。
 *
 * 注册返回 Disposable（unwind 不变量），重复 id 拒绝，id 强制命名空间前缀；
 * 描述符先经 schema 与权限校验（deny-by-default），越权能力在注册前被拒。
 * 沙箱里程碑在此表之上接入执行器，本层不持有任何可执行句柄。
 */

import {
  type DescriptorIssue,
  type DescriptorKind,
  type RendererDescriptor,
  rendererId,
  type ScriptDescriptor,
  scriptId,
  validateRendererDescriptor,
  validateScriptDescriptor,
} from './descriptors.js';
import { type Disposable,type PluginManifest } from './manifest.js';
import { checkPluginRelPath } from './pathGate.js';

/** 已登记的描述符：id 为命名空间化后的全局 id。 */
export interface RegisteredExecutable<D> {
  readonly id: string;
  readonly pluginId: string;
  readonly descriptor: D;
}

/** 通用注册表：登记/查询/释放与命名空间强制。 */
export class ExecutableRegistry<D extends { id: string }> {
  private readonly entries = new Map<string, RegisteredExecutable<D>>();

  constructor(
    readonly kind: DescriptorKind,
    private readonly namespaced: (pluginId: string, id: string) => string,
  ) {}

  /** 登记一个描述符；同名重复即拒绝（抛出可读原因）。 */
  register(pluginId: string, descriptor: D): Disposable {
    const id = this.namespaced(pluginId, descriptor.id);
    if (this.entries.has(id)) {
      throw new Error(`重复注册${this.kind}：${id}`);
    }
    const entry: RegisteredExecutable<D> = { id, pluginId, descriptor };
    this.entries.set(id, entry);
    return {
      dispose: () => {
        // 只移除本次登记项，避免过期句柄误删后续替换的同名项。
        if (this.entries.get(id) === entry) this.entries.delete(id);
      },
    };
  }

  unregister(id: string): boolean {
    return this.entries.delete(id);
  }

  get(id: string): RegisteredExecutable<D> | undefined {
    return this.entries.get(id);
  }

  list(): RegisteredExecutable<D>[] {
    return [...this.entries.values()];
  }

  /** 按插件列举：插件停用/卸载时核对释放范围。 */
  listByPlugin(pluginId: string): RegisteredExecutable<D>[] {
    return this.list().filter((entry) => entry.pluginId === pluginId);
  }

  size(): number {
    return this.entries.size;
  }
}

/**
 * 只读查询句柄：宿主与其它贡献只能查询已登记描述符，写入一律经装配器
 * （design/49 §5）。执行层里程碑在此句柄之上取入口，不持有注册表写面。
 */
export type ExecutableReader<D extends { id: string }> = Pick<
  ExecutableRegistry<D>,
  'get' | 'list' | 'listByPlugin' | 'size'
>;

export class RendererRegistry extends ExecutableRegistry<RendererDescriptor> {
  constructor() {
    super('renderer', rendererId);
  }
}

export class ScriptRegistry extends ExecutableRegistry<ScriptDescriptor> {
  constructor() {
    super('script', scriptId);
  }
}

/** 可执行贡献来源：manifest 与已收集的贡献资源（相对路径 → 内容）。 */
export interface ExecutableContributionSource {
  manifest: PluginManifest;
  files: Record<string, string>;
}

export interface InstallExecutableOptions {
  /** 插件包是否经来源认证签名；未签名拒绝可执行贡献（fail-closed）。 */
  signed: boolean;
}

export interface InstallExecutableResult {
  ok: boolean;
  reason?: string;
  /** 注册成功时返回的释放句柄；逆序 dispose 即整体回滚。 */
  disposables: Disposable[];
}

type PendingDescriptor =
  | { kind: 'renderer'; id: string; descriptor: RendererDescriptor }
  | { kind: 'script'; id: string; descriptor: ScriptDescriptor };

function descriptorFiles(
  files: Record<string, string>,
  roots: readonly string[] | undefined,
): Array<{ root: string; file: string; text: string }> {
  const found: Array<{ root: string; file: string; text: string }> = [];
  for (const root of roots ?? []) {
    const check = checkPluginRelPath(root);
    if (!check.ok) continue;
    const prefix = `${check.rel}/`;
    for (const [file, text] of Object.entries(files)) {
      if (file.startsWith(prefix) && file.endsWith('.json')) found.push({ root: check.rel, file, text });
    }
  }
  return found;
}

function parseDescriptorList(text: string, kind: DescriptorKind): { ok: true; items: unknown[] } | { ok: false; reason: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: `${kind} 描述符 JSON 解析失败` };
  }
  if (!Array.isArray(raw)) return { ok: false, reason: `${kind} 描述符文件必须是数组` };
  return { ok: true, items: raw };
}

function formatIssues(issues: DescriptorIssue[]): string {
  return issues.map((issue) => `${issue.path || '<root>'}: ${issue.message}`).join('；');
}

function withinRoot(entry: string, root: string): boolean {
  return entry.startsWith(`${root}/`);
}

/**
 * 校验并登记插件的可执行描述符。
 *
 * 门序：无声明直接放行 → 未签名拒绝 → 逐文件解析/校验（路径、能力、schema）→
 * 根目录作用域核对 → 命名空间重复检查 → 全部通过才登记。任一步失败整体不注册。
 */
export function installExecutableDescriptors(
  source: ExecutableContributionSource,
  renderers: RendererRegistry,
  scripts: ScriptRegistry,
  options: InstallExecutableOptions,
): InstallExecutableResult {
  const rendererRoots = source.manifest.contributes?.renderers;
  const scriptRoots = source.manifest.contributes?.scripts;
  const hasRenderer = (rendererRoots?.length ?? 0) > 0;
  const hasScript = (scriptRoots?.length ?? 0) > 0;
  if (!hasRenderer && !hasScript) return { ok: true, disposables: [] };

  if (!options.signed) {
    return {
      ok: false,
      disposables: [],
      reason: '未签名插件不得注册可执行贡献（renderers/scripts），拒绝注册',
    };
  }

  const pending: PendingDescriptor[] = [];
  const problems: string[] = [];

  for (const file of descriptorFiles(source.files, rendererRoots)) {
    const parsed = parseDescriptorList(file.text, 'renderer');
    if (!parsed.ok) {
      problems.push(`${file.file}: ${parsed.reason}`);
      continue;
    }
    for (const item of parsed.items) {
      const result = validateRendererDescriptor(item, source.manifest);
      if (!result.ok) {
        problems.push(`${file.file}: ${formatIssues(result.issues)}`);
        continue;
      }
      if (!withinRoot(result.descriptor.entry, file.root)) {
        problems.push(`${file.file}: 入口 ${result.descriptor.entry} 不在贡献目录 ${file.root}/ 内`);
        continue;
      }
      if (source.files[result.descriptor.entry] === undefined) {
        problems.push(`${file.file}: 入口文件不存在：${result.descriptor.entry}`);
        continue;
      }
      pending.push({ kind: 'renderer', id: result.descriptor.id, descriptor: result.descriptor });
    }
  }

  for (const file of descriptorFiles(source.files, scriptRoots)) {
    const parsed = parseDescriptorList(file.text, 'script');
    if (!parsed.ok) {
      problems.push(`${file.file}: ${parsed.reason}`);
      continue;
    }
    for (const item of parsed.items) {
      const result = validateScriptDescriptor(item, source.manifest);
      if (!result.ok) {
        problems.push(`${file.file}: ${formatIssues(result.issues)}`);
        continue;
      }
      if (!withinRoot(result.descriptor.entry, file.root)) {
        problems.push(`${file.file}: 入口 ${result.descriptor.entry} 不在贡献目录 ${file.root}/ 内`);
        continue;
      }
      if (source.files[result.descriptor.entry] === undefined) {
        problems.push(`${file.file}: 入口文件不存在：${result.descriptor.entry}`);
        continue;
      }
      pending.push({ kind: 'script', id: result.descriptor.id, descriptor: result.descriptor });
    }
  }

  const seen = new Set<string>();
  for (const item of pending) {
    const id = item.kind === 'renderer' ? rendererId(source.manifest.id, item.id) : scriptId(source.manifest.id, item.id);
    if (seen.has(id)) problems.push(`重复描述符 id：${item.id}`);
    seen.add(id);
  }

  if (problems.length) {
    return { ok: false, disposables: [], reason: `可执行贡献校验失败：${problems.join('; ')}` };
  }

  const disposables: Disposable[] = [];
  try {
    for (const item of pending) {
      disposables.push(
        item.kind === 'renderer'
          ? renderers.register(source.manifest.id, item.descriptor)
          : scripts.register(source.manifest.id, item.descriptor),
      );
    }
  } catch (error) {
    for (let index = disposables.length - 1; index >= 0; index--) {
      disposables[index]?.dispose();
    }
    return { ok: false, disposables: [], reason: error instanceof Error ? error.message : String(error) };
  }
  return { ok: true, disposables };
}
