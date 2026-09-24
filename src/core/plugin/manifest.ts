/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 插件 manifest v0 与校验器（docs/design/04 §1）。
 * 校验错误定位到 JSON 路径（验收标准 1）；命名空间规则见 §3；
 * 权限模型 deny-by-default（§6）。
 */

/** 可逆注册句柄：unwind 不变量——注册方必须返回它，宿主逆序释放。 */
export interface Disposable {
  dispose(): void;
}

export type PluginPhase = 'discover' | 'validate' | 'load' | 'activate' | 'deactivate' | 'runtime';

/** 错误契约：cause 链完整保留，状态面板/日志/终端三处同一份。 */
export interface PluginError {
  pluginId: string;
  phase: PluginPhase;
  message: string;
  cause: unknown[];
}

export function toPluginError(pluginId: string, phase: PluginPhase, error: unknown): PluginError {
  const chain: unknown[] = [];
  let cur: unknown = error;
  while (cur) {
    chain.push(cur instanceof Error ? cur.message : String(cur));
    cur = (cur as { cause?: unknown }).cause;
    if (chain.length > 5) break;
  }
  return {
    pluginId,
    phase,
    message: error instanceof Error ? error.message : String(error),
    cause: chain,
  };
}

// ── manifest 类型 ──────────────────────────────────────────────────────

export interface PluginPermissions {
  read?: string[];
  write?: string[];
  network?: boolean;
  ai?: { quotaPerHour?: number };
}

export interface PluginContribution {
  types?: string[];
  skills?: string[];
  buildProfiles?: string[];
  commands?: string[];
  ui?: string[];
  mcpServers?: Record<string, { command: string; args?: string[] }>;
  hooks?: string;
  /** 编辑器扩展目录（含 index.html，iframe 内运行，design/22 §4）。 */
  editor?: string[];
  /** 逻辑贡献目录（.js，导出具名函数；调用时进沙箱，design/22 §3）。 */
  logic?: string[];
  /** 导出渲染器描述符目录（.json；函数引用 + 纯/同步声明，见 design/49）。 */
  renderers?: string[];
  /** 脚本描述符目录（.json；函数引用 + 触发挂点 + 能力白名单，见 design/49）。 */
  scripts?: string[];
  /** 视图公式目录（.json，可序列化派生字段；纯函数沙箱求值，无代码执行）。 */
  formulas?: string[];
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  keywords?: string[];
  host: string;
  license: string;
  /** 依赖的其他插件 id → 版本区间；激活按拓扑序，缺失/不满足/循环 = failed */
  dependencies?: Record<string, string>;
  contributes?: PluginContribution;
  permissions?: PluginPermissions;
  activation?: 'onDemand' | 'onStartup';
  /** 贡献设置的表单 schema（JSON Schema 对象）；宿主据此渲染设置面板（§13.2）。 */
  settingsSchema?: unknown;
  interface?: {
    displayName?: string;
    category?: string;
    capabilities?: string[];
    defaultPrompt?: string[];
    logo?: string;
    screenshots?: string[];
  };
}

// ── 校验器：错误带 JSON 路径 ───────────────────────────────────────────

export interface ManifestIssue {
  path: string;
  message: string;
}

export type ManifestValidateResult =
  | { ok: true; manifest: PluginManifest }
  | { ok: false; issues: ManifestIssue[] };

const ID_RE = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/;
const RANGE_RE = /^([~^*]?\d+\.\d+\.\d+|\*)$/;

/** 插件 id 是否为反向域名（com.example.plugin）。 */
export function isReverseDomainId(value: string): boolean {
  return ID_RE.test(value);
}

/** 是否为语义化版本（x.y.z，可带预发布/构建后缀）。 */
export function isSemver(value: string): boolean {
  return SEMVER_RE.test(value);
}

/** 是否为受支持的版本区间（^x.y.z / ~x.y.z / x.y.z / *）。 */
export function isVersionRange(value: string): boolean {
  return RANGE_RE.test(value);
}

/** 版本区间匹配：^x.y.z（同主版本且 ≥）/ ~x.y.z（同主.次且 ≥）/ * / 精确版本。 */
export function satisfiesRange(version: string, range: string): boolean {
  const parse = (v: string): [number, number, number] => {
    const [a = '0', b = '0', c = '0'] = v.replace(/^[~^*]\s*/, '').split('.');
    return [Number(a), Number(b), Number(c)];
  };
  if (range.trim() === '*') return true;
  const ver = parse(version);
  if (range.startsWith('^') || range.startsWith('~')) {
    const base = parse(range);
    const sameMinor = ver[0] === base[0] && ver[1] === base[1];
    return range.startsWith('^')
      ? ver[0] === base[0] && ver >= base
      : sameMinor && ver >= base;
  }
  return JSON.stringify(parse(range)) === JSON.stringify(ver);
}

function str(v: unknown): v is string {
  return typeof v === 'string';
}

/**
 * 读侧窄化组：manifest 来自 JSON.parse 的任意值。两条规则：
 *  - 必填字段与既有校验项：边校验边窄化，问题一次报出；
 *  - 可选字段（description/keywords/hooks/mcpServers/quotaPerHour/interface）逐字段窄化，
 *    无效值忽略该字段；settingsSchema 类型本就是 unknown，原样透传。
 * 通过校验后按字段重建 manifest，不做整体强转（脏值不能靠断言混进结构体）。
 */
function readString(value: unknown): string | undefined {
  return str(value) ? value : undefined;
}

/** 读字符串数组：任一元素不是字符串即整体判脏；空数组有效。 */
function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') return undefined;
    items.push(entry);
  }
  return items;
}

/** 读有限数；NaN/Infinity 判脏。 */
function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** 把未知值当普通对象读（数组与非对象返回 undefined）。 */
function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

/** 读 MCP 服务贡献：command 必填、args 可选；脏条目忽略。 */
function readMcpServers(value: unknown): PluginContribution['mcpServers'] | undefined {
  const data = readRecord(value);
  if (data === undefined) return undefined;
  const servers: NonNullable<PluginContribution['mcpServers']> = {};
  for (const [name, entry] of Object.entries(data)) {
    const server = readRecord(entry);
    if (server === undefined) continue;
    const command = readString(server.command);
    if (command === undefined) continue;
    const args = readStringArray(server.args);
    servers[name] = args === undefined ? { command } : { command, args };
  }
  return servers;
}

/** 读界面呈现段：五个字段全可选；无效值忽略该字段。 */
function readInterfaceSection(value: unknown): NonNullable<PluginManifest['interface']> | undefined {
  const data = readRecord(value);
  if (data === undefined) return undefined;
  const section: NonNullable<PluginManifest['interface']> = {};
  const displayName = readString(data.displayName);
  if (displayName !== undefined) section.displayName = displayName;
  const category = readString(data.category);
  if (category !== undefined) section.category = category;
  const capabilities = readStringArray(data.capabilities);
  if (capabilities !== undefined) section.capabilities = capabilities;
  const defaultPrompt = readStringArray(data.defaultPrompt);
  if (defaultPrompt !== undefined) section.defaultPrompt = defaultPrompt;
  const logo = readString(data.logo);
  if (logo !== undefined) section.logo = logo;
  const screenshots = readStringArray(data.screenshots);
  if (screenshots !== undefined) section.screenshots = screenshots;
  return section;
}

/** 读 AI 配额段：quotaPerHour 可选；段非对象时忽略。 */
function readAiQuota(value: unknown): PluginPermissions['ai'] | undefined {
  const data = readRecord(value);
  if (data === undefined) return undefined;
  const quota = readNumber(data.quotaPerHour);
  return quota === undefined ? {} : { quotaPerHour: quota };
}

/** 取必填字段的窄化值：缺失时上面必然已记 issue；走到这里仍缺失说明校验与窄化不一致。 */
function assertRequired<T>(value: T | undefined, field: string): asserts value is T {
  if (value === undefined) throw new Error(`manifest 必填字段 ${field} 缺失但未记录问题（校验器不一致）`);
}

/** 校验 manifest（来自 JSON.parse 的任意值）。全部问题一次报出。 */
export function validateManifest(raw: unknown): ManifestValidateResult {
  const issues: ManifestIssue[] = [];
  const fail = (path: string, message: string): void => {
    issues.push({ path, message });
  };

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, issues: [{ path: '', message: 'manifest 必须是 JSON 对象' }] };
  }
  const m = raw as Record<string, unknown>;

  // ── 必填字段：校验与窄化一趟完成；失败只记 issue，其余检查继续 ──
  const id = readString(m.id);
  if (id === undefined) fail('id', '缺失且必须是字符串');
  else if (!isReverseDomainId(id)) fail('id', `必须是反向域名（如 com.example.golden3），实际「${id}」`);

  const name = readString(m.name);
  if (name === undefined || name === '') fail('name', '缺失且必须是非空字符串');

  const version = readString(m.version);
  if (version === undefined || !isSemver(version)) fail('version', '必须是语义化版本（x.y.z）');

  const host = readString(m.host);
  if (host === undefined || host === '') fail('host', '缺失：宿主版本区间（如 ^2.0.0）');

  const license = readString(m.license);
  if (license === undefined || license === '') fail('license', '缺失：插件自身许可证');

  // ── 可选字段：窄化结果暂存，issues 为空时按字段重建 manifest ──
  const description = readString(m.description);
  const keywords = readStringArray(m.keywords);

  let contributes: PluginContribution | undefined;
  if (m.contributes !== undefined) {
    const c = readRecord(m.contributes);
    if (c === undefined) {
      fail('contributes', '必须是对象');
    } else {
      for (const [key, value] of Object.entries(c)) {
        if (value !== null && typeof value !== 'object' && !str(value)) {
          fail(`contributes.${key}`, '必须是路径字符串或对象/数组');
        }
      }
      // 目录/文件清单贡献必须是字符串数组（字符串会被逐字符误读为多个路径）。
      const rebuilt: PluginContribution = {};
      for (const key of ['skills', 'types', 'buildProfiles', 'commands', 'ui', 'logic', 'renderers', 'scripts', 'editor', 'formulas'] as const) {
        const value = c[key];
        if (value === undefined) continue;
        const list = readStringArray(value);
        if (list === undefined) fail(`contributes.${key}`, '必须是字符串数组');
        else rebuilt[key] = list;
      }
      const hooks = readString(c.hooks);
      if (hooks !== undefined) rebuilt.hooks = hooks;
      const mcpServers = readMcpServers(c.mcpServers);
      if (mcpServers !== undefined) rebuilt.mcpServers = mcpServers;
      contributes = rebuilt;
    }
  }

  let permissions: PluginPermissions | undefined;
  if (m.permissions !== undefined) {
    const p = readRecord(m.permissions);
    if (p === undefined) {
      fail('permissions', '必须是对象');
    } else {
      const rebuilt: PluginPermissions = {};
      for (const key of ['read', 'write'] as const) {
        const value = p[key];
        if (value === undefined) continue;
        const list = readStringArray(value);
        if (list === undefined) fail(`permissions.${key}`, '必须是字符串数组');
        else rebuilt[key] = list;
      }
      if (p.network !== undefined) {
        if (typeof p.network !== 'boolean') fail('permissions.network', '必须是布尔值');
        else rebuilt.network = p.network;
      }
      const ai = readAiQuota(p.ai);
      if (ai !== undefined) rebuilt.ai = ai;
      permissions = rebuilt;
    }
  }

  const activation =
    m.activation !== undefined && m.activation !== 'onDemand' && m.activation !== 'onStartup'
      ? (fail('activation', '必须是 onDemand 或 onStartup'), undefined)
      : m.activation;

  let dependencies: Record<string, string> | undefined;
  if (m.dependencies !== undefined) {
    const deps = readRecord(m.dependencies);
    if (deps === undefined) {
      fail('dependencies', '必须是 { 插件id: 版本区间 } 对象');
    } else {
      const entries: Record<string, string> = {};
      for (const [depId, range] of Object.entries(deps)) {
        if (!isReverseDomainId(depId)) fail(`dependencies.${depId}`, '依赖 id 必须是反向域名');
        if (!str(range) || !isVersionRange(range)) {
          fail(`dependencies.${depId}`, '版本区间必须是 ^x.y.z / ~x.y.z / x.y.z / *');
          continue;
        }
        entries[depId] = range;
      }
      if (id !== undefined && Object.keys(deps).includes(id)) fail(`dependencies.${id}`, '不能依赖自身');
      dependencies = entries;
    }
  }

  const interfaceSection = readInterfaceSection(m.interface);

  if (issues.length) return { ok: false, issues };
  assertRequired(id, 'id');
  assertRequired(name, 'name');
  assertRequired(version, 'version');
  assertRequired(host, 'host');
  assertRequired(license, 'license');

  // 逐字段重建：只收窄化过的值；settingsSchema 类型为 unknown，原样透传。
  const manifest: PluginManifest = { id, name, version, host, license };
  if (description !== undefined) manifest.description = description;
  if (keywords !== undefined) manifest.keywords = keywords;
  if (dependencies !== undefined) manifest.dependencies = dependencies;
  if (contributes !== undefined) manifest.contributes = contributes;
  if (permissions !== undefined) manifest.permissions = permissions;
  if (activation !== undefined) manifest.activation = activation;
  if ('settingsSchema' in m) manifest.settingsSchema = m.settingsSchema;
  if (interfaceSection !== undefined) manifest.interface = interfaceSection;
  return { ok: true, manifest };
}

// ── 命名空间（§3）────────────────────────────────────────────────────

/** 插件短 id：id 最后一段（com.example.golden3 → golden3）。 */
export function shortId(pluginId: string): string {
  return pluginId.split('.').at(-1) ?? pluginId;
}

export function commandId(pluginId: string, cmd: string): string {
  return `/${shortId(pluginId)}:${cmd}`;
}

export function typeTemplateId(pluginId: string, type: string): string {
  return `${shortId(pluginId)}.${type}`;
}

/** 视图公式 id：`<插件短名>.formula.<声明 id>`，与类型模板同域隔离。 */
export function formulaId(pluginId: string, id: string): string {
  return `${shortId(pluginId)}.formula.${id}`;
}

export function eventDomain(pluginId: string, event: string): string {
  return `plugin.${shortId(pluginId)}.${event}`;
}

export function settingKey(pluginId: string, key: string): string {
  return `plugin.${pluginId}.${key}`;
}

// ── 权限（deny-by-default）───────────────────────────────────────────

export class PermissionDenied extends Error {
  constructor(
    readonly pluginId: string,
    readonly domain: string,
    readonly action: 'read' | 'write',
    readonly causeChain: unknown[] = [],
  ) {
    super(`插件 ${pluginId} 未声明 ${action}:${domain} 权限`);
    this.name = 'PermissionDenied';
    if (causeChain.length) this.cause = causeChain[0];
  }
}

/** 权限检查：未声明即拒绝。 */
export function assertPermission(manifest: PluginManifest, action: 'read' | 'write', domain: string): void {
  const list = manifest.permissions?.[action];
  if (!list?.includes(domain)) {
    throw new PermissionDenied(manifest.id, domain, action);
  }
}
