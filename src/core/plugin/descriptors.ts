/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 可执行插件贡献描述符协议（docs/design/49）。
 *
 * 描述符只声明函数引用（入口文件 + 导出名）、纯度/同步性、输入输出 schema 与
 * 可访问的宿主能力，本身不含可执行代码；真正执行由沙箱里程碑接入。
 * 校验 deny-by-default：未声明的权限、路径越界、未知能力、渲染器非纯/非同步一律拒绝。
 *
 * 能力字符串形如 `read:<域>` / `write:<域>` / `net` / `ai` / `tool:propose`，
 * 只能指向宿主契约，插件拿不到裸 fetch/fs/eval。
 */

import { type PluginManifest,shortId } from './manifest.js';
import { checkPluginRelPath } from './pathGate.js';

/** 宿主能力前缀白名单：只开放经宿主契约中转的读写、网络、AI 与工具提议。 */
export const HOST_CAPABILITY_KINDS = ['read', 'write', 'net', 'ai', 'tool'] as const;
export type HostCapabilityKind = (typeof HOST_CAPABILITY_KINDS)[number];

/** tool 能力只开放"提议"，实际执行由宿主在审批管线中完成。 */
export const TOOL_CAPABILITY_ACTIONS = ['propose'] as const;

export type DescriptorPurity = 'pure' | 'effectful';
export type DescriptorMode = 'sync' | 'async';

/** JSON Schema 形状的输入/输出约束；宿主只校验它是对象，schema 本身由执行阶段消费。 */
export interface DescriptorSchema {
  type?: string;
  [key: string]: unknown;
}

interface DescriptorBase {
  /** 插件内局部 id；注册时由宿主加命名空间前缀。 */
  id: string;
  label?: string;
  /** 插件内相对入口文件（`/` 分隔），禁止绝对路径与 `..` 越界。 */
  entry: string;
  /** 入口文件导出的具名函数。 */
  export: string;
  purity: DescriptorPurity;
  mode: DescriptorMode;
  /** 宿主能力白名单条目，见 parseHostCapability。 */
  capabilities?: string[];
  input?: DescriptorSchema;
  output?: DescriptorSchema;
}

/** 导出渲染器：同步契约决定这里只接受纯函数 + 同步。 */
export interface RendererDescriptor extends DescriptorBase {
  purity: 'pure';
  mode: 'sync';
  /** 目标导出格式 id（如 rtf）。 */
  format: string;
}

/** 脚本：管道/循环/子程序/事件触发由脚本运行时承载，描述符声明入口与触发挂点。 */
export interface ScriptDescriptor extends DescriptorBase {
  /** 触发挂点（宿主声明的事件/接缝名）。 */
  on: string;
}

export type DescriptorKind = 'renderer' | 'script';

export interface DescriptorIssue {
  path: string;
  message: string;
}

export type DescriptorValidation<T> =
  | { ok: true; descriptor: T }
  | { ok: false; issues: DescriptorIssue[] };

export type HostCapability =
  | { kind: 'read' | 'write'; domain: string }
  | { kind: 'net' | 'ai' }
  | { kind: 'tool'; action: 'propose' };

export type CapabilityCheck = { ok: true; capability: HostCapability } | { ok: false; reason: string };

const ID_RE = /^[a-z][a-z0-9-]*$/;
const EXPORT_RE = /^[A-Za-z_$][\w$]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 解析一条能力字符串并回查 manifest 权限；未声明权限即拒绝（默认拒绝）。 */
export function parseHostCapability(raw: string, manifest: PluginManifest): CapabilityCheck {
  const parts = raw.split(':');
  if (parts.length > 2) return { ok: false, reason: `能力格式非法：${raw}` };
  const kind = parts[0] ?? '';
  const target = parts[1];
  if (!(HOST_CAPABILITY_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, reason: `未知能力：${raw}` };
  }
  const capabilityKind = kind as HostCapabilityKind;
  switch (capabilityKind) {
    case 'read':
    case 'write': {
      if (!target) return { ok: false, reason: `能力缺少数据域：${raw}` };
      const domains = manifest.permissions?.[capabilityKind] ?? [];
      if (!domains.includes(target)) {
        return { ok: false, reason: `能力 ${raw} 未在 permissions.${capabilityKind} 声明` };
      }
      return { ok: true, capability: { kind: capabilityKind, domain: target } };
    }
    case 'net':
      if (target !== undefined) return { ok: false, reason: `能力 net 不接受参数：${raw}` };
      if (manifest.permissions?.network !== true) {
        return { ok: false, reason: '能力 net 需要 permissions.network=true' };
      }
      return { ok: true, capability: { kind: 'net' } };
    case 'ai':
      if (target !== undefined) return { ok: false, reason: `能力 ai 不接受参数：${raw}` };
      if (!manifest.permissions?.ai) return { ok: false, reason: '能力 ai 需要 permissions.ai' };
      return { ok: true, capability: { kind: 'ai' } };
    case 'tool': {
      if (target === undefined || !(TOOL_CAPABILITY_ACTIONS as readonly string[]).includes(target)) {
        return { ok: false, reason: `未知工具能力：${raw}（只允许 tool:propose）` };
      }
      return { ok: true, capability: { kind: 'tool', action: 'propose' } };
    }
    default:
      return { ok: false, reason: `未知能力：${raw}` };
  }
}

/** 渲染器 id：`<插件短名>.renderer.<声明 id>`。 */
export function rendererId(pluginId: string, id: string): string {
  return `${shortId(pluginId)}.renderer.${id}`;
}

/** 脚本 id：`<插件短名>.script.<声明 id>`，与渲染器同域隔离。 */
export function scriptId(pluginId: string, id: string): string {
  return `${shortId(pluginId)}.script.${id}`;
}

function parseSchemaField(
  path: string,
  value: unknown,
  fail: (path: string, message: string) => void,
): DescriptorSchema | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    fail(path, '必须是 JSON Schema 对象');
    return undefined;
  }
  if (value.type !== undefined && typeof value.type !== 'string') {
    fail(`${path}.type`, 'type 必须是字符串');
  }
  const schema: DescriptorSchema = { ...value };
  return schema;
}

interface ParsedBase {
  id: string;
  label?: string;
  entry: string;
  export: string;
  purity: DescriptorPurity;
  mode: DescriptorMode;
  capabilities?: string[];
  input?: DescriptorSchema;
  output?: DescriptorSchema;
}

function parseBase(raw: unknown, manifest: PluginManifest): { issues: DescriptorIssue[]; base?: ParsedBase } {
  const issues: DescriptorIssue[] = [];
  if (!isRecord(raw)) return { issues: [{ path: '', message: '描述符必须是对象' }] };
  const fail = (path: string, message: string): void => {
    issues.push({ path, message });
  };

  const id = typeof raw.id === 'string' ? raw.id : '';
  if (!ID_RE.test(id)) fail('id', '必须是 kebab-case 局部 id（a-z、0-9、连字符）');

  let entry = '';
  if (typeof raw.entry !== 'string') {
    fail('entry', '必须是字符串');
  } else {
    const check = checkPluginRelPath(raw.entry);
    if (check.ok) entry = check.rel;
    else fail('entry', check.reason);
  }

  const exportName = typeof raw.export === 'string' ? raw.export : '';
  if (!EXPORT_RE.test(exportName)) fail('export', '必须是合法的具名导出函数');

  const purity = raw.purity;
  if (purity !== 'pure' && purity !== 'effectful') fail('purity', '必须是 pure 或 effectful');

  const mode = raw.mode;
  if (mode !== 'sync' && mode !== 'async') fail('mode', '必须是 sync 或 async');

  if (raw.label !== undefined && typeof raw.label !== 'string') fail('label', '必须是字符串');

  let capabilities: string[] | undefined;
  if (raw.capabilities !== undefined) {
    if (!Array.isArray(raw.capabilities) || raw.capabilities.some((item) => typeof item !== 'string')) {
      fail('capabilities', '必须是字符串数组');
    } else {
      capabilities = [];
      raw.capabilities.forEach((capability, index) => {
        const result = parseHostCapability(capability, manifest);
        if (result.ok) capabilities?.push(capability);
        else fail(`capabilities[${index}]`, result.reason);
      });
    }
  }

  const input = parseSchemaField('input', raw.input, fail);
  const output = parseSchemaField('output', raw.output, fail);

  if (issues.length) return { issues };
  return {
    issues,
    base: {
      id,
      label: typeof raw.label === 'string' ? raw.label : undefined,
      entry,
      export: exportName,
      purity: purity === 'pure' ? 'pure' : 'effectful',
      mode: mode === 'sync' ? 'sync' : 'async',
      capabilities,
      input,
      output,
    },
  };
}

/** 校验导出渲染器描述符：只接受纯函数 + 同步。 */
export function validateRendererDescriptor(
  raw: unknown,
  manifest: PluginManifest,
): DescriptorValidation<RendererDescriptor> {
  const { issues, base } = parseBase(raw, manifest);
  if (!base) return { ok: false, issues };
  if (base.purity !== 'pure') issues.push({ path: 'purity', message: '渲染器必须是纯函数（pure）' });
  if (base.mode !== 'sync') issues.push({ path: 'mode', message: '渲染器必须同步（sync）' });
  const format = isRecord(raw) && typeof raw.format === 'string' ? raw.format : '';
  if (!format) issues.push({ path: 'format', message: '必须是非空的导出格式 id' });
  if (issues.length) return { ok: false, issues };
  return { ok: true, descriptor: { ...base, purity: 'pure', mode: 'sync', format } };
}

/** 校验脚本描述符：允许纯/副作用与同步/异步。 */
export function validateScriptDescriptor(
  raw: unknown,
  manifest: PluginManifest,
): DescriptorValidation<ScriptDescriptor> {
  const { issues, base } = parseBase(raw, manifest);
  if (!base) return { ok: false, issues };
  const on = isRecord(raw) && typeof raw.on === 'string' ? raw.on : '';
  if (!on) issues.push({ path: 'on', message: '必须是非空的触发挂点' });
  if (issues.length) return { ok: false, issues };
  return { ok: true, descriptor: { ...base, on } };
}
