/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 插件运行时（docs/design/04 §2/§6）。
 *
 * 生命周期：discover → validate → load（逐插件 try-catch，失败只标记自身）
 * → activate（懒激活：首次触达贡献点）→ deactivate → unwind（逆序释放全部注册）。
 *
 * 可逆注册不变量：一切注册 API 返回 Disposable，宿主持栈、禁用/卸载时逆序
 * dispose——插件的任何注册都不会残留在宿主里。
 *
 * 权限：deny-by-default。资源型贡献（skills/types/buildProfiles）零代码可热载；
 * 逻辑型贡献（logic/editor）由渲染端装配，执行前经 assertCan 权限门。
 */
import type { RendererDescriptor, ScriptDescriptor } from './descriptors.js';
import {
  assertPermission,
  type Disposable,
  PermissionDenied,
  type PluginError,
  type PluginManifest,
  satisfiesRange,
  toPluginError,
  validateManifest,
} from './manifest.js';
import type { ExecutableReader, RegisteredExecutable } from './registries.js';
import { ProviderStatusService } from './status.js';

export type PluginState = 'discovered' | 'active' | 'failed' | 'disabled' | 'uninstalled';

/** 资源配额（§11.3）：防止插件包以超大/超量资源拖垮宿主。 */
export const MAX_CONTRIBUTION_FILE_BYTES = 128 * 1024;
export const MAX_FILES_PER_CONTRIBUTION_KEY = 32;
export const MAX_TOTAL_FILES = 96;
export const MAX_TOTAL_BYTES = 2 * 1024 * 1024;

const encoder = new TextEncoder();

/** 贡献资源配额校验（相对路径安全 + 单文件/单键/总量上限）。返回问题清单，空数组即通过。 */
export function checkContributionLimits(plugin: DiscoveredPlugin): string[] {
  const issues: string[] = [];
  const keys = Object.keys(plugin.files);
  if (keys.length > MAX_TOTAL_FILES) {
    issues.push(`文件总数 ${keys.length} 超过上限 ${MAX_TOTAL_FILES}`);
  }
  const perKey = new Map<string, number>();
  let totalBytes = 0;
  for (const key of keys) {
    if (key.startsWith('/') || key.startsWith('\\') || /(^|[\\/])\.\.([\\/]|$)/.test(key)) {
      issues.push(`贡献路径越界：${key}`);
      continue;
    }
    const bytes = encoder.encode(plugin.files[key] ?? '').length;
    totalBytes += bytes;
    if (bytes > MAX_CONTRIBUTION_FILE_BYTES) {
      issues.push(`文件 ${key} 体积 ${bytes} 超上限 ${MAX_CONTRIBUTION_FILE_BYTES}`);
    }
    const group = key.split(/[\\/]/)[0] ?? key;
    perKey.set(group, (perKey.get(group) ?? 0) + 1);
  }
  for (const [group, count] of perKey) {
    if (count > MAX_FILES_PER_CONTRIBUTION_KEY) {
      issues.push(`贡献 ${group} 文件数 ${count} 超上限 ${MAX_FILES_PER_CONTRIBUTION_KEY}`);
    }
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    issues.push(`资源总字节 ${totalBytes} 超上限 ${MAX_TOTAL_BYTES}`);
  }
  return issues;
}

export interface PluginStatus {
  id: string;
  state: PluginState;
  error?: PluginError;
  activatedAt?: number;
}

/** 一个已发现的插件（manifest + 原始资源）。资源型贡献由宿主按需装配。 */
export interface DiscoveredPlugin {
  manifest: PluginManifest;
  /** 贡献点资源（相对路径 → 内容）。资源型：SKILL.md 原文 / JSON 字符串。 */
  files: Record<string, string>;
  /** 插件包是否经来源认证签名；可执行贡献（renderers/scripts）注册据此 fail-closed（design/49 §3）。 */
  signed?: boolean;
}

/** 贡献装配回调：宿主把插件资源注册进对应注册表，每项通过 `sink.add` 交回 Disposable。
 * 用 sink 交回（而非返回值）保证装配中途抛错时宿主仍持有已注册项，可逆序回滚。 */
export interface ContributionSink {
  add(disposable: Disposable): void;
}

export type ContributionInstaller = (plugin: DiscoveredPlugin, sink: ContributionSink) => void;

export interface PluginHostOptions {
  /** 禁用清单（配置级，不碰文件） */
  disabled?: string[];
  /** 主机版本（host 版本区间匹配；区间不匹配 = 贡献整体失效并上报） */
  hostVersion: string;
  /** 已装配导出渲染器描述符的只读查询句柄（design/49 里程碑②）；缺省即无。 */
  renderers?: ExecutableReader<RendererDescriptor>;
  /** 已装配脚本描述符的只读查询句柄（design/49 里程碑②）；缺省即无。 */
  scripts?: ExecutableReader<ScriptDescriptor>;
}



export class PluginHost {
  private readonly plugins = new Map<string, DiscoveredPlugin>();
  private readonly statuses = new Map<string, PluginStatus>();
  /** 每插件已装配的 Disposable 栈（unwind 逆序释放）。 */
  private readonly installed = new Map<string, Disposable[]>();
  private readonly disabled: Set<string>;
  private readonly installer: ContributionInstaller;
  /** 可执行描述符只读句柄：宿主只查询，写入经装配器（design/49 里程碑②）。 */
  private readonly executableReaders: {
    renderers?: ExecutableReader<RendererDescriptor>;
    scripts?: ExecutableReader<ScriptDescriptor>;
  };
  /** 激活失败退避：连续失败的插件在退避窗内跳过激活（§13.1）。 */
  readonly providerStatus = new ProviderStatusService();

  constructor(options: PluginHostOptions, installer: ContributionInstaller) {
    this.disabled = new Set(options.disabled ?? []);
    this.installer = installer;
    this.hostVersion = options.hostVersion;
    this.executableReaders = { renderers: options.renderers, scripts: options.scripts };
  }

  private readonly hostVersion: string;

  /** discover + validate + load。任一插件失败只标记自身，其余照常。 */
  loadAll(candidates: DiscoveredPlugin[]): void {
    for (const candidate of candidates) {
      const id = candidate.manifest.id;
      try {
        if (this.statuses.has(id)) {
          throw new Error('重复加载同名插件');
        }
        const limitIssues = checkContributionLimits(candidate);
        if (limitIssues.length) {
          this.statuses.set(id, {
            id,
            state: 'failed',
            error: { pluginId: id, phase: 'load', message: `资源配额校验失败：${limitIssues.join('; ')}`, cause: [] },
          });
          continue;
        }
        this.plugins.set(id, candidate);
        if (this.disabled.has(id)) {
          this.statuses.set(id, { id, state: 'disabled' });
          continue;
        }
        this.statuses.set(id, { id, state: 'discovered' });
      } catch (error) {
        this.statuses.set(id, { id, state: 'failed', error: toPluginError(id, 'load', error) });
      }
    }
  }

  /** 从原始 JSON 走 validate 再装载（错误定位 JSON 路径）。 */
  loadRaw(id: string, manifestJson: unknown, files: Record<string, string>, signed = false): void {
    const result = validateManifest(manifestJson);
    if (!result.ok) {
      this.statuses.set(id, {
        id,
        state: 'failed',
        error: {
          pluginId: id,
          phase: 'validate',
          message: `manifest 校验失败：${result.issues.map((i) => `${i.path || '<root>'}: ${i.message}`).join('; ')}`,
          cause: [],
        },
      });
      return;
    }
    this.loadAll([{ manifest: result.manifest, files, signed }]);
  }

  /** 发现/读取阶段失败的登记入口：状态面板可见、cause 链保留。 */
  markFailed(id: string, phase: PluginError['phase'], error: unknown): void {
    this.statuses.set(id, { id, state: 'failed', error: toPluginError(id, phase, error) });
  }

  /** 激活：装配贡献点（逐项 try-catch），幂等。依赖先于依赖方激活（拓扑序）。 */
  activate(pluginId: string, activating = new Set<string>()): void {
    const status = this.statuses.get(pluginId);
    const plugin = this.plugins.get(pluginId);
    if (!status || !plugin || status.state === 'active' || status.state === 'disabled') return;
    // 退避窗内跳过激活，避免反复失败刷屏
    if (this.providerStatus.isDisabled(pluginId)) return;
    try {
      if (!satisfiesRange(this.hostVersion, plugin.manifest.host)) {
        throw new Error(`宿主版本 ${this.hostVersion} 不满足插件要求 ${plugin.manifest.host}`);
      }
      // 依赖：先激活依赖方；缺失/版本不满足/循环都让本插件 failed（04 篇 §2）
      for (const [depId, range] of Object.entries(plugin.manifest.dependencies ?? {})) {
        if (activating.has(depId)) {
          throw new Error(`循环依赖：${[...activating, pluginId].join(' → ')} → ${depId}`);
        }
        const dep = this.plugins.get(depId);
        if (!dep) throw new Error(`缺少依赖插件：${depId}（要求 ${range}）`);
        if (!satisfiesRange(dep.manifest.version, range)) {
          throw new Error(`依赖 ${depId} 版本 ${dep.manifest.version} 不满足要求 ${range}`);
        }
        this.activate(depId, new Set([...activating, pluginId]));
        const depStatus = this.statuses.get(depId);
        if (depStatus?.state === 'failed') {
          throw new Error(`依赖 ${depId} 激活失败：${depStatus.error?.message ?? ''}`);
        }
      }
      // 注册前先挂栈：装配中途抛错时，已注册项仍可被 unwind 逆序回滚
      const disposables: Disposable[] = [];
      this.installed.set(pluginId, disposables);
      this.installer(plugin, { add: (d) => disposables.push(d) });
      status.state = 'active';
      status.activatedAt = Date.now();
      status.error = undefined;
      this.providerStatus.recordSuccess(pluginId);
    } catch (error) {
      // 装配中途失败：回滚已注册部分，插件标记 failed
      this.unwind(pluginId);
      status.state = 'failed';
      status.error = toPluginError(pluginId, 'activate', error);
      this.providerStatus.recordFailure(pluginId, error);
    }
  }

  /** 懒激活入口：按需激活未激活插件。 */
  ensureActive(pluginId: string): void {
    const status = this.statuses.get(pluginId);
    if (status && status.state === 'discovered') this.activate(pluginId);
  }

  /**
   * 批量激活全部 discovered 插件：按依赖拓扑排序（Kahn），
   * 环与缺失依赖让相关插件 failed，其余照常。
   */
  activateAll(): void {
    const pending = [...this.statuses.values()].filter((s) => s.state === 'discovered').map((s) => s.id);
    const indegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();
    for (const id of pending) {
      const deps = Object.keys(this.plugins.get(id)?.manifest.dependencies ?? {}).filter((d) => pending.includes(d));
      indegree.set(id, deps.length);
      for (const d of deps) {
        dependents.set(d, [...(dependents.get(d) ?? []), id]);
      }
    }
    const queue = pending.filter((id) => (indegree.get(id) ?? 0) === 0);
    while (queue.length) {
      const id = queue.shift();
      if (id === undefined) break;
      this.activate(id);
      for (const next of dependents.get(id) ?? []) {
        const left = (indegree.get(next) ?? 0) - 1;
        indegree.set(next, left);
        if (left === 0) queue.push(next);
      }
    }
    // 剩余 = 环上的插件：显式标 failed（附环信息）
    for (const id of pending) {
      const status = this.statuses.get(id);
      if (status && status.state === 'discovered') {
        this.activate(id, new Set(pending));
        if (this.statuses.get(id)?.state === 'discovered') {
          status.state = 'failed';
          status.error = toPluginError(id, 'activate', new Error('依赖等待队列停滞（疑似循环依赖）'));
        }
      }
    }
  }

  /** 禁用（配置级）：unwind 全部注册，状态置 disabled。 */
  disable(pluginId: string): void {
    this.unwind(pluginId);
    const status = this.statuses.get(pluginId);
    if (status) status.state = 'disabled';
    this.disabled.add(pluginId);
  }

  /** 重新启用：回到 discovered，可再次激活。 */
  enable(pluginId: string): void {
    this.disabled.delete(pluginId);
    const status = this.statuses.get(pluginId);
    if (status && status.state === 'disabled') status.state = 'discovered';
  }

  /** 卸载：unwind + 移除。 */
  uninstall(pluginId: string): void {
    this.unwind(pluginId);
    this.plugins.delete(pluginId);
    this.statuses.set(pluginId, { id: pluginId, state: 'uninstalled' });
  }

  /** unwind 不变量：逆序释放该插件全部注册。 */
  private unwind(pluginId: string): void {
    const stack = this.installed.get(pluginId) ?? [];
    for (let i = stack.length - 1; i >= 0; i--) {
      try {
        stack[i]?.dispose();
      } catch {
        // 单个 dispose 失败不阻断其余（尽力释放）
      }
    }
    this.installed.delete(pluginId);
  }

  list(): PluginStatus[] {
    return [...this.statuses.values()];
  }

  /** 插件当前是否 active：逻辑执行等边界据此放行（disabled/failed/uninstalled 均为 false）。 */
  isActive(pluginId: string): boolean {
    return this.statuses.get(pluginId)?.state === 'active';
  }

  get(pluginId: string): DiscoveredPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  manifest(pluginId: string): PluginManifest | undefined {
    return this.plugins.get(pluginId)?.manifest;
  }

  /** 已装配导出渲染器描述符快照（只读；沙箱执行里程碑据此取入口，本轮不执行代码）。 */
  rendererDescriptors(): RegisteredExecutable<RendererDescriptor>[] {
    return this.executableReaders.renderers?.list() ?? [];
  }

  /** 已装配脚本描述符快照（只读；沙箱执行里程碑据此取入口，本轮不执行代码）。 */
  scriptDescriptors(): RegisteredExecutable<ScriptDescriptor>[] {
    return this.executableReaders.scripts?.list() ?? [];
  }

  /** 权限代理：宿主在数据访问边界调用；未声明即 PermissionDenied。 */
  assertCan(pluginId: string, action: 'read' | 'write', domain: string): void {
    const manifest = this.manifest(pluginId);
    if (!manifest) throw new PermissionDenied(pluginId, domain, action);
    assertPermission(manifest, action, domain);
  }
}
