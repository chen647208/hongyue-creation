/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 插件服务（渲染端）：磁盘发现 + 装配进运行时。
 *
 * 插件布局：userData/plugins/<pluginId>/plugin.json（+ 贡献点文件）。
 * v0 开放资源型贡献点：skills（SKILL.md 写法技能）→ SkillCatalog；
 * types → 内置类型注册表（强制命名空间前缀），buildProfiles → 构建档注册表，
 * hooks → 事件总线声明式策略。逻辑型 JS/WASM 不执行（无沙箱）。
 * 禁用清单持久化在设置域（配置级 disabled，不碰插件文件）。
 */
import { parseSkillMd, type SkillCatalog } from '@core/ai';
import type {
  BuildProfileRegistry,
  CatalogParseResult,
  CatalogSignatureVerifier,
  ContributionInstaller,
  EventBus,
  FormulaRegistry,
  PluginHostOptions,
  PluginStatus,
} from '@core/plugin';
import { formulaId, installExecutableDescriptors, installFormulas, installHooks, installTypeTemplates, loadPluginCatalog, PermissionDenied, PluginHost, type RendererRegistry, type ScriptExecutionPort, type ScriptRegistry, typeTemplateId } from '@core/plugin';
import { adjudicateHandlerResult, checkPluginFileName, checkPluginRelPath, type SandboxRunResult } from '@core/plugin';
import { builtinRegistry } from '@core/types-registry';
import { STORAGE_KEYS } from '@shared/constants/storageKeys';
import { parseSignatureEnvelope } from '@shared/pluginSignature';
import type { PluginInstallRequest, PluginInstallResult, PluginUninstallResult } from '@shared/types';
import * as React from 'react';

import { PluginEditorFrame } from '@/shared/ui/PluginEditorFrame';
import { PluginFrame } from '@/shared/ui/PluginFrame';

import { logger } from '../utils/logger';
import { setBuildRendererHost } from './buildRendererPort';
import { localStore } from './localStore';
import { type CapabilityHostBindings, createPluginToolProposalPort } from './pluginCapabilityPort';
import { bindPluginEventHost } from './pluginEventBus';
import { createRendererExecutionPort } from './rendererExecutionPort';
import { uiSlotRegistry } from './uiSlots';

function electron(): NonNullable<Window['electronAPI']> {
  if (!window.electronAPI) {
    throw new Error('插件发现需要文件系统（预览环境不可用）');
  }
  return window.electronAPI;
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

let trustedPluginKeys: readonly string[] = [];
/** 允许的插件来源标识（manifest.source）；空清单 = 不限制来源，仅校验签名。 */
let allowedPluginSources: readonly string[] = [];
/** 最近一次装配的宿主：生产数据边界（逻辑执行）据此做权限代理。 */
let activeHost: PluginHost | null = null;

/** 逻辑贡献源码：`<pluginId>:<file>` → 代码（调用时才进沙箱）。 */
const logicHandlers = new Map<string, string>();

function logicKey(pluginId: string, file: string): string {
  return `${pluginId}:${file}`;
}

/** 执行插件逻辑贡献的具名函数（design/22 §3）：沙箱内运行，返回值经能力裁决。 */
export async function runPluginLogic(pluginId: string, fn: string, input: unknown): Promise<SandboxRunResult> {
  if (!/^[A-Za-z_$][\w$]*$/.test(fn)) {
    return { ok: false, error: { kind: 'runtime', message: `非法函数名：${fn}` } };
  }
  // 权限边界：逻辑贡献在 ai 接缝执行。deny-by-default——插件未激活或未声明 write:ai 一律拒绝，不进沙箱。
  const host = activeHost;
  if (!host || !host.isActive(pluginId)) {
    logger.warn(`插件 ${pluginId} 逻辑执行被拒：插件未激活`);
    return { ok: false, error: { kind: 'permission', message: `插件 ${pluginId} 未激活，拒绝执行逻辑贡献` } };
  }
  try {
    host.assertCan(pluginId, 'write', 'ai');
  } catch (error) {
    logger.warn(`插件 ${pluginId} 逻辑执行被拒：未声明 write:ai 权限`);
    return { ok: false, error: { kind: 'permission', message: error instanceof Error ? error.message : String(error) } };
  }
  // 合并该插件全部逻辑文件：具名函数可能定义在任一文件中，避免只取首个文件而遮蔽。
  const sources = [...logicHandlers.entries()]
    .filter(([key]) => key.startsWith(`${pluginId}:`))
    .map(([, code]) => code);
  if (sources.length === 0) {
    return { ok: false, error: { kind: 'runtime', message: `插件 ${pluginId} 无逻辑贡献` } };
  }
  const api = typeof window === 'undefined' ? undefined : window.electronAPI;
  if (!api?.pluginSandboxRun) {
    return { ok: false, error: { kind: 'runtime', message: '当前环境不支持插件沙箱' } };
  }
  const code = `${sources.join('\n;\n')}\n;globalThis.run = typeof ${fn} === 'function' ? ${fn} : undefined;`;
  const result = await api.pluginSandboxRun({ code, input, allowedTools: [] });
  if (!result.ok) return result;
  return adjudicateHandlerResult(result.output, []);
}

/** 配置受信任的插件签名公钥（PEM）。空清单 = 任何签名包一律拒载（fail closed）。 */
export function setTrustedPluginKeys(keys: readonly string[]): void {
  trustedPluginKeys = keys;
}

function readTrustedPluginKeys(): string[] | undefined {
  return readStringArraySetting(STORAGE_KEYS.trustedPluginKeys);
}

/** 保存信任公钥并立即生效（设置面板调用）。 */
export function saveTrustedPluginKeys(keys: readonly string[]): void {
  localStore.setItem(STORAGE_KEYS.trustedPluginKeys, JSON.stringify(keys));
  setTrustedPluginKeys(keys);
  void window.electronAPI?.pluginTrustedKeysSync?.([...keys]);
}

/** 配置允许的插件来源白名单；空清单表示不限制来源。 */
export function setAllowedPluginSources(sources: readonly string[]): void {
  allowedPluginSources = sources;
}

function readAllowedPluginSources(): string[] | undefined {
  return readStringArraySetting(STORAGE_KEYS.allowedPluginSources);
}

/** 保存来源白名单并立即生效（设置面板调用）。 */
export function saveAllowedPluginSources(sources: readonly string[]): void {
  localStore.setItem(STORAGE_KEYS.allowedPluginSources, JSON.stringify(sources));
  setAllowedPluginSources(sources);
}

/** 是否显式放行任意来源；缺省 false（空白名单即拒绝安装未认证来源）。 */
export function readAllowAnyPluginSource(): boolean {
  return localStore.getItem(STORAGE_KEYS.allowAnyPluginSource) === 'true';
}

/** 保存"允许任意来源"开关。 */
export function saveAllowAnyPluginSource(allow: boolean): void {
  localStore.setItem(STORAGE_KEYS.allowAnyPluginSource, allow ? 'true' : 'false');
}

function readStringArraySetting(key: string): string[] | undefined {
  const raw = localStore.getItem(key);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : undefined;
  } catch {
    return undefined;
  }
}

/** 从 userData/plugins/ 发现插件并装载进宿主。读取/校验失败按 failed 登记，面板可见。 */
export async function discoverAndLoad(host: PluginHost): Promise<void> {
  const api = electron();
  const base = await api.getAppDataPath();
  const root = `${base}/plugins`;
  const entries = await api.listDirectory(root).catch(() => []);
  for (const dir of entries.filter((e) => e.type === 'directory')) {
    const pluginId = dir.name;
    try {
      const pluginRoot = `${root}/${pluginId}`;
      const manifestText = await api.pluginReadFile(pluginRoot, 'plugin.json');
      const manifestJson = JSON.parse(manifestText) as unknown;

      // 来源白名单（design/21 §4）：配置非空时，manifest.source 必须在清单内
      const source = typeof (manifestJson as { source?: unknown }).source === 'string' ? (manifestJson as { source: string }).source : undefined;
      if (allowedPluginSources.length > 0 && (!source || !allowedPluginSources.includes(source))) {
        host.markFailed(pluginId, 'discover', new Error(`插件来源不在白名单：${source ?? '未声明 source'}`));
        continue;
      }

      // 签名（S4/S5）：可执行贡献（logic/editor）必须带来源认证签名；未签名一律不放行（fail-closed）
      // - ed25519：信任键白名单内公钥的 detached 签名
      // - cosign：外部 cosign 校验证书签名（工具链缺失即拒绝）
      // - sha256：仅完整性，通过后仍不放开可执行贡献
      let signed = false;
      const sigText = await api.pluginReadFile(pluginRoot, 'plugin.sig').catch(() => undefined);
      if (sigText !== undefined) {
        const envelope = parseSignatureEnvelope(sigText);
        const fail = (reason: string): never => {
          throw new Error(reason);
        };
        if (!envelope) fail('插件签名格式非法');
        else if (envelope.algorithm === 'ed25519') {
          const trusted = trustedPluginKeys.includes(envelope.publicKey);
          const verified =
            trusted && typeof api.pluginVerifySignature === 'function'
              ? await api.pluginVerifySignature(toBase64(manifestText), envelope.signature, envelope.publicKey)
              : false;
          if (!verified) fail(trusted ? '插件签名校验失败' : '插件签名公钥不在信任清单');
          else signed = true;
        } else if (envelope.algorithm === 'cosign') {
          const verified =
            typeof api.pluginCosignVerify === 'function'
              ? await api.pluginCosignVerify(toBase64(manifestText), {
                  bundle: envelope.bundle,
                  publicKey: envelope.publicKey,
                  certificateIdentity: envelope.certificateIdentity,
                  certificateOidcIssuer: envelope.certificateOidcIssuer,
                })
              : false;
          if (!verified) fail('cosign 校验失败（需安装 cosign 且证书/公钥有效）');
          else signed = true;
        } else {
          const ok =
            typeof api.pluginDigestMatches === 'function'
              ? await api.pluginDigestMatches(toBase64(manifestText), envelope.digest)
              : false;
          if (!ok) fail('插件摘要不匹配');
          // 摘要通过仅代表未被篡改，不放行可执行贡献
        }
      }
      const files: Record<string, string> = {};
      // 浅层收集贡献点文件（skills/types/buildProfiles 目录下的文件）
      const contributes = (manifestJson as { contributes?: Record<string, string[]> }).contributes;
      // 路径门（§11.2）：词法两道门在渲染侧前置，realpath 包含由主进程 fs 代理（pluginReadFile/pluginListDirectory）强制
      let denied = false;
      for (const dirKey of ['skills', 'types', 'buildProfiles', 'formulas', 'ui', 'editor', 'logic', 'renderers', 'scripts'] as const) {
        // 未签名插件不加载可执行贡献（logic/editor/renderers/scripts）：资源型仍可用
        if ((dirKey === 'logic' || dirKey === 'editor' || dirKey === 'renderers' || dirKey === 'scripts') && !signed) {
          logger.warn(`未签名插件 ${pluginId}：跳过可执行贡献 ${dirKey}`);
          continue;
        }
        for (const rel of contributes?.[dirKey] ?? []) {
          const dirCheck = checkPluginRelPath(rel);
          if (!dirCheck.ok) {
            host.markFailed(pluginId, 'discover', new PermissionDenied(pluginId, `fs:${dirKey}`, 'read', [dirCheck.reason]));
            denied = true;
            break;
          }
          const cleanRel = dirCheck.rel;
          for (const f of await api.pluginListDirectory(pluginRoot, cleanRel).catch(() => [])) {
            if (f.type !== 'file') continue;
            const nameCheck = checkPluginFileName(f.name);
            if (!nameCheck.ok) {
              host.markFailed(pluginId, 'discover', new PermissionDenied(pluginId, `fs:${dirKey}`, 'read', [nameCheck.reason]));
              denied = true;
              break;
            }
            const key = `${cleanRel}/${nameCheck.rel}`;
            files[key] = nameCheck.rel.endsWith('.wasm')
              ? await api.pluginReadBinary(pluginRoot, key)
              : await api.pluginReadFile(pluginRoot, key);
          }
          if (denied) break;
        }
        if (denied) break;
      }
      if (denied) continue;
      host.loadRaw(pluginId, manifestJson, files, signed);
    } catch (error) {
      host.markFailed(pluginId, 'discover', error);
    }
  }
}

export interface PluginDeps {
  skillCatalog: SkillCatalog;
  buildProfiles: BuildProfileRegistry;
  events: EventBus;
  formulas: FormulaRegistry;
  /** 导出渲染器描述符注册表（design/49 里程碑②）：装配器写入，宿主经只读句柄查询。 */
  renderers: RendererRegistry;
  /** 脚本描述符注册表（design/49 里程碑②）：装配器写入，宿主经只读句柄查询。 */
  scripts: ScriptRegistry;
}

/** 贡献装配器：把资源型贡献注册进各注册表（经 sink 交回 Disposable 供 unwind）。 */
export function createContributionInstaller(deps: PluginDeps): ContributionInstaller {
  return (plugin, sink) => {
    const manifest = plugin.manifest;

    for (const rel of manifest.contributes?.skills ?? []) {
      const prefix = `${rel.replace(/^\.\//, '').replace(/\/+$/, '')}/`;
      for (const [file, content] of Object.entries(plugin.files)) {
        if (!file.startsWith(prefix) || !file.endsWith('.md')) continue;
        const parsed = parseSkillMd(content, 'plugin', `${manifest.id}/${file}`);
        if (!parsed.skill) continue;
        // 双轨技能：同目录 handler.js/handler.mjs（JS 轨）或 handler.wasm（WASM 轨）
        const dir = file.slice(0, file.lastIndexOf('/'));
        let handlerKey: string | undefined;
        let handlerMode: 'js' | 'wasm' = 'js';
        for (const handlerName of ['handler.js', 'handler.mjs', 'handler.wasm']) {
          const candidate = `${dir}/${handlerName}`;
          if (plugin.files[candidate] !== undefined) {
            handlerKey = candidate;
            handlerMode = handlerName.endsWith('.wasm') ? 'wasm' : 'js';
            break;
          }
        }
        const handlerCode = handlerKey ? plugin.files[handlerKey] : undefined;
        // 内容未变不重载：正文与 handler 均未变则跳过重注册
        const existing = deps.skillCatalog.get(parsed.skill.name);
        if (existing && existing.body === parsed.skill.body && existing.handler?.code === handlerCode) {
          continue;
        }
        deps.skillCatalog.register(parsed.skill);
        const name = parsed.skill.name;
        if (handlerKey && handlerCode !== undefined) {
          deps.skillCatalog.setHandler(name, {
            code: handlerCode,
            sourceFile: `${manifest.id}/${handlerKey}`,
            mode: handlerMode,
          });
        }
        sink.add({ dispose: () => deps.skillCatalog.unregister(name) });
      }
    }

    // 类型模板：强制命名空间前缀（验收 4），宿主内置注册表共享
    for (const rel of manifest.contributes?.types ?? []) {
      const prefix = `${rel.replace(/^\.\//, '').replace(/\/+$/, '')}/`;
      for (const [file, content] of Object.entries(plugin.files)) {
        if (!file.startsWith(prefix) || !file.endsWith('.json')) continue;
        try {
          const templates = JSON.parse(content) as Array<Record<string, unknown>>;
          for (const d of installTypeTemplates(manifest.id, templates, builtinRegistry, typeTemplateId)) sink.add(d);
        } catch {
          // 单文件损坏跳过（状态面板可经 markFailed 观测装载期错误）
        }
      }
    }

    // Build Profile（07 篇导出构建消费）
    for (const rel of manifest.contributes?.buildProfiles ?? []) {
      const prefix = `${rel.replace(/^\.\//, '').replace(/\/+$/, '')}/`;
      for (const [file, content] of Object.entries(plugin.files)) {
        if (!file.startsWith(prefix) || !file.endsWith('.json')) continue;
        try {
          const profile = JSON.parse(content) as Parameters<BuildProfileRegistry['register']>[0];
          sink.add(deps.buildProfiles.register(profile));
        } catch {
          // 同上：损坏档案跳过
        }
      }
    }

    // 视图公式（可序列化派生字段）：JSON 数组，经白名单校验后注册
    for (const rel of manifest.contributes?.formulas ?? []) {
      const prefix = `${rel.replace(/^\.\//, '').replace(/\/+$/, '')}/`;
      for (const [file, content] of Object.entries(plugin.files)) {
        if (!file.startsWith(prefix) || !file.endsWith('.json')) continue;
        try {
          const formulas = JSON.parse(content) as unknown;
          for (const d of installFormulas(manifest.id, formulas, deps.formulas, formulaId)) sink.add(d);
        } catch {
          // 单文件损坏跳过（状态面板可经 markFailed 观测装载期错误）
        }
      }
    }

    // UI 槽位（S3）：贡献目录下的 .html 经 PluginFrame 渲染进 plugin.panel
    for (const rel of manifest.contributes?.ui ?? []) {
      const prefix = `${rel.replace(/^\.\//, '').replace(/\/+$/, '')}/`;
      for (const [file, content] of Object.entries(plugin.files)) {
        if (!file.startsWith(prefix) || !file.endsWith('.html')) continue;
        sink.add({
          dispose: uiSlotRegistry.register({
            id: `plugin.${manifest.id}.${file}`,
            slot: 'plugin.panel',
            order: 100,
            render: () => React.createElement(PluginFrame, { html: content, title: manifest.name }),
          }),
        });
      }
    }

        // 编辑器扩展（design/22 §4）：贡献目录下的 .html 经 iframe 运行，只能请求受控编辑器操作
    for (const rel of manifest.contributes?.editor ?? []) {
      const prefix = `${rel.replace(/^\.\//, '').replace(/\/+$/, '')}/`;
      for (const [file, content] of Object.entries(plugin.files)) {
        if (!file.startsWith(prefix) || !file.endsWith('.html')) continue;
        sink.add({
          dispose: uiSlotRegistry.register({
            id: `plugin.${manifest.id}.editor.${file}`,
            slot: 'plugin.editor',
            order: 100,
            render: () => React.createElement(PluginEditorFrame, { html: content, title: manifest.name, allowNetwork: manifest.permissions?.network === true }),
          }),
        });
      }
    }

    // 逻辑贡献（design/22 §3）：收集 .js，调用时才进沙箱
    for (const rel of manifest.contributes?.logic ?? []) {
      const prefix = `${rel.replace(/^\.\//, '').replace(/\/+$/, '')}/`;
      for (const [file, content] of Object.entries(plugin.files)) {
        if (!file.startsWith(prefix) || !file.endsWith('.js')) continue;
        const key = logicKey(manifest.id, file);
        logicHandlers.set(key, content);
        sink.add({ dispose: () => logicHandlers.delete(key) });
      }
    }

    // 可执行描述符（design/49 里程碑②）：只登记描述符，不加载、不执行代码。
    // 未签名或缺能力权限时 installExecutableDescriptors 整体拒绝（fail-closed）；
    // 上抛让本插件置 failed，宿主逆序回滚已装项，不留半装。
    const executables = installExecutableDescriptors(
      { manifest, files: plugin.files },
      deps.renderers,
      deps.scripts,
      { signed: plugin.signed === true },
    );
    if (!executables.ok) {
      throw new Error(executables.reason ?? '可执行贡献安装失败');
    }
    for (const disposable of executables.disposables) sink.add(disposable);

    // hooks（能力接缝，JSON 声明式策略）
    const hooksFile = manifest.contributes?.hooks;    if (hooksFile) {
      const key = hooksFile.replace(/^\.\//, '');
      const raw = plugin.files[key];
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { hooks?: unknown } | unknown[];
          const list = Array.isArray(parsed) ? parsed : ((parsed.hooks ?? []) as unknown[]);
          for (const d of installHooks(list as never[], deps.events, manifest.id, manifest)) sink.add(d);
        } catch (error) {
          logger.warn(`插件 ${manifest.id} hooks 声明未生效：${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  };
}

/** 脚本执行端口：把宿主门控后的请求转交主进程既有插件沙箱（design/49 沙箱执行）。 */
const scriptExecutionPort: ScriptExecutionPort = (request) => {
  const api = typeof window === 'undefined' ? undefined : window.electronAPI;
  if (!api?.pluginSandboxRun) {
    return Promise.resolve({ ok: false, error: { kind: 'runtime', message: '当前环境不支持插件沙箱' } });
  }
  return api.pluginSandboxRun(request);
};

/** 渲染器同步执行端口（design/49 §4 选型 B）：渲染进程内预热 + 同步调用，QuickJS 懒加载。 */
const rendererExecutionPort = createRendererExecutionPort();

/**
 * 创建宿主并完成一次完整发现-装载-激活循环（预览环境无文件系统时跳过磁盘发现）。
 *
 * 端口单源在本模块装配：脚本走主进程沙箱、渲染器走渲染进程同步 QuickJS、能力调用走
 * 白名单派发。助手层契约（审批 broker / 提案执行器 / 当前模型）经 `capabilityBindings`
 * 由应用层装配处注入；任一端口或注入项缺省即拒绝（fail-closed），未声明描述符的插件行为不变。
 */
export async function bootstrapPlugins(
  deps: PluginDeps,
  hostVersion: string,
  disabled: string[],
  capabilityBindings: CapabilityHostBindings = {},
): Promise<PluginHost> {
  const host = new PluginHost(
    {
      hostVersion,
      disabled,
      renderers: deps.renderers,
      scripts: deps.scripts,
      scriptExecution: scriptExecutionPort,
      rendererExecution: rendererExecutionPort,
      toolProposal: createPluginToolProposalPort(capabilityBindings),
      onScriptEventError: (failure) => {
        logger.warn(`插件事件 ${failure.event} 脚本 ${failure.scriptId}（${failure.pluginId}）执行失败：${failure.message}`);
      },
    },
    createContributionInstaller(deps),
  );
  activeHost = host;
  bindPluginEventHost(host);
  // 构建管线消费插件渲染器：把宿主门控后的同步执行装配为 core/build 端口（缺省即无）。
  setBuildRendererHost(host);
  try {
    const storedKeys = readTrustedPluginKeys();
    if (storedKeys) setTrustedPluginKeys(storedKeys);
    // 信任清单同步到主进程：签名校验以主进程清单为准。
    const trustApi = typeof window === 'undefined' ? undefined : window.electronAPI;
    if (trustApi?.pluginTrustedKeysList) {
      const mainKeys = await trustApi.pluginTrustedKeysList();
      if (mainKeys.length > 0) {
        setTrustedPluginKeys(mainKeys);
        localStore.setItem(STORAGE_KEYS.trustedPluginKeys, JSON.stringify(mainKeys));
      } else if (storedKeys && trustApi.pluginTrustedKeysSync) {
        await trustApi.pluginTrustedKeysSync([...storedKeys]);
      }
    }
    const storedSources = readAllowedPluginSources();
    if (storedSources) setAllowedPluginSources(storedSources);
    await discoverAndLoad(host);
    // 发现后立即激活全部（含依赖拓扑）：否则插件停在 discovered，贡献点永不生效
    host.activateAll();
  } catch {
    // 无 electronAPI：运行时仍可用于内置流程
  }
  return host;
}

/** 清理插件的本地配置键（`plugin.<id>.settings[.corrupt]`），卸载时无残留。 */
export function clearPluginSettings(pluginId: string): void {
  localStore.removeItem(`plugin.${pluginId}.settings`);
  localStore.removeItem(`plugin.${pluginId}.settings.corrupt`);
}

/**
 * 读取并校验目录索引：结构校验后校验整份 payload 的 detached 签名（同级 `catalog.sig`，
 * ed25519/cosign，主进程按信任清单验签）；验签失败拒绝使用该索引，不返回任何条目。
 */
export async function readPluginCatalog(catalogPath: string): Promise<CatalogParseResult> {
  const api = electron();
  const payloadText = await api.readFile(catalogPath);
  const dir = catalogPath.replace(/[\\/][^\\/]*$/, '');
  const sigText = await api.readFile(`${dir}/catalog.sig`).catch(() => undefined);
  const signature = sigText === undefined ? undefined : parseSignatureEnvelope(sigText);
  let raw: unknown;
  try {
    raw = JSON.parse(payloadText);
  } catch {
    raw = null;
  }
  return loadPluginCatalog(raw, { payloadText, signature, verifier: catalogSignatureVerifier() });
}

/** 目录索引验签端口：ed25519 走主进程信任键清单，cosign 走主进程外部工具链；其余算法拒绝。 */
function catalogSignatureVerifier(): CatalogSignatureVerifier {
  return {
    async verifyPayload(payloadText, envelope) {
      const api = typeof window === 'undefined' ? undefined : window.electronAPI;
      if (!api) return false;
      if (envelope.algorithm === 'ed25519') {
        return api.pluginVerifySignature(toBase64(payloadText), envelope.signature, envelope.publicKey);
      }
      if (envelope.algorithm === 'cosign') {
        return api.pluginCosignVerify(toBase64(payloadText), {
          bundle: envelope.bundle,
          publicKey: envelope.publicKey,
          certificateIdentity: envelope.certificateIdentity,
          certificateOidcIssuer: envelope.certificateOidcIssuer,
        });
      }
      return false;
    },
  };
}

/** 从已授权目录安装/更新插件（签名与来源由主进程校验）。 */
export async function installPluginFromDirectory(
  request: PluginInstallRequest,
): Promise<PluginInstallResult> {
  const api = typeof window === 'undefined' ? undefined : window.electronAPI;
  if (!api?.pluginStore) {
    return { ok: false, reason: '当前环境不支持插件安装（缺少文件系统）' };
  }
  return api.pluginStore.install(request);
}

/**
 * 卸载插件：删落盘文件 + 清本地配置 + 逆序释放贡献（无残留）。
 * 返回更新后的宿主信息由调用方刷新。
 */
export async function uninstallPlugin(
  host: PluginHost,
  pluginId: string,
): Promise<PluginUninstallResult> {
  clearPluginSettings(pluginId);
  // 先释放宿主内已装配贡献，避免残留注册（技能/类型/公式/事件）
  host.uninstall(pluginId);
  const api = typeof window === 'undefined' ? undefined : window.electronAPI;
  if (!api?.pluginStore) {
    return { ok: true, pluginId };
  }
  const result = await api.pluginStore.uninstall(pluginId);
  if (result.ok) {
    const remaining = (readStringArraySetting(STORAGE_KEYS.pluginsDisabled) ?? []).filter((id) => id !== pluginId);
    localStore.setItem(STORAGE_KEYS.pluginsDisabled, JSON.stringify(remaining));
  }
  return result;
}

/** 重建插件宿主：先逆序释放旧宿主全部贡献，再完整发现-装配一遍（安装/更新后刷新）。 */
export async function reloadPluginHost(
  deps: PluginDeps,
  hostVersion: string,
  previous?: PluginHost | null,
  capabilityBindings: CapabilityHostBindings = {},
): Promise<PluginHost> {
  if (previous) {
    for (const status of previous.list()) previous.uninstall(status.id);
  }
  return bootstrapPlugins(deps, hostVersion, readStringArraySetting(STORAGE_KEYS.pluginsDisabled) ?? [], capabilityBindings);
}

/** 受控网络请求：仅在插件已激活且 manifest 声明 network 权限时放行。 */
export async function fetchAsPlugin(
  pluginId: string,
  request: { url: string; method?: string; headers?: Record<string, string>; body?: string },
): Promise<{ ok: boolean; status?: number; text?: string; error?: string }> {
  const host = activeHost;
  if (!host || !host.isActive(pluginId)) {
    return { ok: false, error: `插件 ${pluginId} 未激活，拒绝网络请求` };
  }
  if (host.manifest(pluginId)?.permissions?.network !== true) {
    return { ok: false, error: `插件 ${pluginId} 未声明 network 权限，拒绝网络请求` };
  }
  const api = typeof window === 'undefined' ? undefined : window.electronAPI;
  if (!api?.pluginNet) return { ok: false, error: '当前环境不支持受控网络门' };
  return api.pluginNet.fetch(request);
}

/** 保存受控网络门白名单并即时生效（主进程执行）。 */
export async function savePluginNetworkHosts(hosts: readonly string[]): Promise<void> {
  const api = typeof window === 'undefined' ? undefined : window.electronAPI;
  await api?.pluginNet?.setPolicy({ allowedHosts: [...hosts] });
}

/** 读取受控网络门白名单。 */
export async function loadPluginNetworkHosts(): Promise<string[]> {
  const api = typeof window === 'undefined' ? undefined : window.electronAPI;
  const policy = await api?.pluginNet?.getPolicy();
  return policy?.allowedHosts ?? [];
}

export type { PluginHostOptions,PluginStatus };