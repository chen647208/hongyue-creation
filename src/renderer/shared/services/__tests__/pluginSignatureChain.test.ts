/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 真实 Ed25519 签名链路（签名工具信封格式 → 主进程安装门 → 渲染端发现与激活）。
 *
 * 与既有用例的分工：
 * - `main/app/__tests__/pluginStore.test.ts`：主进程安装门的签名拒绝；
 * - `main/app/__tests__/signedExamplePlugin.test.ts`：`scripts/sign-plugin.mjs` 产出的包；
 * - 本文件：整条链路只把 electronAPI（IPC 边界）换成直连实现，验签仍调真实
 *   `verifyEd25519`（node:crypto），信任清单仍由主进程侧查询供给。
 *
 * 密钥对与插件目录都在临时目录现生成，测试结束删除；私钥不落版本库。
 */
import { generateKeyPairSync, type KeyObject, sign } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SkillCatalog } from '@core/ai';
import {
  BuildProfileRegistry,
  EventBus,
  FormulaRegistry,
  type PluginHost,
  RendererRegistry,
  ScriptRegistry,
} from '@core/plugin';
import { hasDeniedPluginSegment, isUnsafePluginRel } from '@shared/constants/pluginPaths';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runQuickJS } from '../../../../main/app/pluginSandbox/quickjsRunner.js';
import { verifyEd25519 } from '../../../../main/app/pluginSignature.js';
import { installPluginFromDirectory } from '../../../../main/app/pluginStore.js';
import { commandRegistry } from '../commandRegistry';
import { bootstrapPlugins, runPluginLogic } from '../pluginService';

const HOST = '2.0.0';
const PLUGIN_ID = 'com.realsig.chain';
const COMMAND_ID = '/chain:写作.黄金三章';

interface Keys {
  publicKeyPem: string;
  privateKey: KeyObject;
}

function generateKeys(): Keys {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKey,
  };
}

function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: PLUGIN_ID,
    name: 'chain',
    version: '1.0.0',
    host: '^2.0.0',
    license: 'MIT',
    source: 'https://example.com/chain',
    contributes: {
      commands: ['./commands.json'],
      logic: ['./logic/'],
    },
    permissions: { write: ['ai'] },
    ...overrides,
  };
}

/** 按 `scripts/sign-plugin.mjs` 的信封格式，对 plugin.json 的 UTF-8 文本做 detached 签名。 */
function signPackage(dir: string, keys: Keys): void {
  const manifestPath = join(dir, 'plugin.json');
  const manifestText = readFileSync(manifestPath, 'utf-8');
  const signature = sign(null, Buffer.from(manifestText, 'utf-8'), keys.privateKey).toString('base64');
  const envelope = JSON.stringify({ algorithm: 'ed25519', signature, publicKey: keys.publicKeyPem }, null, 2);
  writeFileSync(join(dir, 'plugin.sig'), `${envelope}\n`, 'utf-8');
}

/** 写一个带可执行贡献（logic + commands）的最小插件目录并签名。 */
function writePackage(
  dir: string,
  keys: Keys,
  overrides: Record<string, unknown> = {},
  logicSource = 'function runGolden(input) { return { ok: true, input }; }',
): void {
  mkdirSync(join(dir, 'logic'), { recursive: true });
  writeFileSync(join(dir, 'plugin.json'), JSON.stringify(manifest(overrides), null, 2), 'utf-8');
  writeFileSync(
    join(dir, 'commands.json'),
    JSON.stringify([{ id: '写作.黄金三章', title: '黄金三章', keywords: '开篇 三章', function: 'runGolden' }]),
    'utf-8',
  );
  writeFileSync(join(dir, 'logic', 'handler.js'), logicSource, 'utf-8');
  signPackage(dir, keys);
}

/** 渲染端可用的最小 electronAPI：文件来自真实磁盘，验签调真实 verifyEd25519。 */
function electronApi(
  userData: string,
  trustedKeys: readonly string[],
  onSandboxRequest?: (request: Parameters<typeof runQuickJS>[0]) => void,
) {
  const readWithin = (rootDir: string, rel: string): string => {
    if (isUnsafePluginRel(rel) || hasDeniedPluginSegment(rel)) throw new Error(`拒绝路径：${rel}`);
    return readFileSync(join(rootDir, rel), 'utf-8');
  };
  const listWithin = (dir: string) =>
    readdirSync(dir, { withFileTypes: true }).map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? ('directory' as const) : ('file' as const),
    }));

  return {
    getAppDataPath: async (): Promise<string> => userData,
    listDirectory: async (dir: string) => listWithin(dir),
    pluginListDirectory: async (rootDir: string, rel: string) => listWithin(join(rootDir, rel)),
    pluginReadFile: async (rootDir: string, rel: string) => readWithin(rootDir, rel),
    pluginReadBinary: async (rootDir: string, rel: string) => readFileSync(join(rootDir, rel)).toString('base64'),
    pluginVerifySignature: async (contentBase64: string, signatureBase64: string, publicKeyPem: string) =>
      trustedKeys.includes(publicKeyPem)
      && verifyEd25519(Buffer.from(contentBase64, 'base64'), signatureBase64, publicKeyPem),
    pluginTrustedKeysList: async () => [...trustedKeys],
    // IPC 边界替身：沙箱换成本进程 QuickJS 真实执行器，其余门与装配保持真实。
    pluginSandboxRun: (request: Parameters<typeof runQuickJS>[0]) => {
      onSandboxRequest?.(request);
      return runQuickJS(request);
    },
  };
}

async function bootstrapped(
  userData: string,
  trustedKeys: readonly string[],
  onSandboxRequest?: (request: Parameters<typeof runQuickJS>[0]) => void,
): Promise<PluginHost> {
  vi.stubGlobal('window', { electronAPI: electronApi(userData, trustedKeys, onSandboxRequest) });
  return bootstrapPlugins(
    {
      skillCatalog: new SkillCatalog(),
      buildProfiles: new BuildProfileRegistry(),
      events: new EventBus(),
      formulas: new FormulaRegistry(),
      renderers: new RendererRegistry(),
      scripts: new ScriptRegistry(),
    },
    HOST,
    [],
  );
}

describe('插件真实签名链路（Ed25519 数学验签不是替身）', () => {
  let root: string;
  let userData: string;
  let pluginsRoot: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'hy-signature-chain-'));
    userData = join(root, 'user-data');
    pluginsRoot = join(userData, 'plugins');
    mkdirSync(pluginsRoot, { recursive: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    commandRegistry.list().filter((command) => command.id.startsWith('/chain:')).forEach((command) => commandRegistry.unregister(command.id));
    rmSync(root, { recursive: true, force: true });
  });

  function storeOptions(trustedKey: string | null) {
    return {
      pluginsRoot,
      isTrustedKey: (key: string): boolean => key === trustedKey,
    };
  }

  it('签名有效：装入磁盘 → 发现 → 激活，命令与 logic 贡献登记', async () => {
    const keys = generateKeys();
    const source = join(root, 'source');
    writePackage(source, keys);

    const installed = await installPluginFromDirectory(storeOptions(keys.publicKeyPem), source, {
      hostVersion: HOST,
      allowAnySource: true,
    });
    expect(installed).toMatchObject({ ok: true, action: 'install', pluginId: PLUGIN_ID });
    expect(existsSync(join(pluginsRoot, PLUGIN_ID, 'plugin.sig'))).toBe(true);
    expect(existsSync(join(pluginsRoot, PLUGIN_ID, 'logic', 'handler.js'))).toBe(true);

    const host = await bootstrapped(userData, [keys.publicKeyPem]);
    try {
      const status = host.list().find((entry) => entry.id === PLUGIN_ID);
      expect(status?.state, JSON.stringify(status?.error)).toBe('active');
      expect(host.get(PLUGIN_ID)?.signed).toBe(true);
      const command = commandRegistry.get(COMMAND_ID);
      expect(command?.title).toBe('黄金三章');
      expect(command?.keywords).toBe('开篇 三章');
    } finally {
      host.disable(PLUGIN_ID);
    }
    expect(commandRegistry.get(COMMAND_ID)).toBeUndefined();
  });

  it('命令点击：真实 QuickJS 执行签名插件登记的 logic 函数', async () => {
    const keys = generateKeys();
    const source = join(root, 'source-click');
    writePackage(
      source,
      keys,
      {},
      'function runGolden(input) { return { title: "黄金三章", received: input }; }',
    );

    const installed = await installPluginFromDirectory(storeOptions(keys.publicKeyPem), source, {
      hostVersion: HOST,
      allowAnySource: true,
    });
    expect(installed.ok).toBe(true);

    let sandboxCalls = 0;
    const host = await bootstrapped(userData, [keys.publicKeyPem], () => {
      sandboxCalls += 1;
    });
    try {
      expect(host.list().find((entry) => entry.id === PLUGIN_ID)?.state).toBe('active');
      // 直接走渲染端逻辑执行入口：权限门 → 沙箱 → 能力裁决全程真实。
      const direct = await runPluginLogic(PLUGIN_ID, 'runGolden', { volume: 1 });
      expect(direct).toMatchObject({
        ok: true,
        output: { title: '黄金三章', received: { volume: 1 } },
      });
      // 命令面板点击走同一入口：注册的 run 再执行一次沙箱。
      commandRegistry.get(COMMAND_ID)?.run();
      await vi.waitFor(() => expect(sandboxCalls).toBe(2), { timeout: 5_000 });
    } finally {
      host.disable(PLUGIN_ID);
    }
  });

  it('签名后改动 plugin.json 一个字节：主进程拒装且不落盘', async () => {
    const keys = generateKeys();
    const source = join(root, 'tampered');
    writePackage(source, keys);
    const manifestPath = join(source, 'plugin.json');
    const signedText = readFileSync(manifestPath, 'utf-8');
    const tamperedText = signedText.replace('"name": "chain"', '"name": "Chain"');
    expect(tamperedText).not.toBe(signedText);
    expect(tamperedText.length).toBe(signedText.length);
    writeFileSync(manifestPath, tamperedText, 'utf-8');

    const result = await installPluginFromDirectory(storeOptions(keys.publicKeyPem), source, {
      hostVersion: HOST,
      allowAnySource: true,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('签名');
    expect(existsSync(join(pluginsRoot, PLUGIN_ID))).toBe(false);
  });

  it('换一把未被信任的公钥：主进程拒装并给出原因', async () => {
    const trusted = generateKeys();
    const stranger = generateKeys();
    const source = join(root, 'untrusted');
    writePackage(source, stranger);

    const result = await installPluginFromDirectory(storeOptions(trusted.publicKeyPem), source, {
      hostVersion: HOST,
      allowAnySource: true,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('签名');
    expect(existsSync(join(pluginsRoot, PLUGIN_ID))).toBe(false);
  });

  it('磁盘直放未受信公钥签名：渲染端发现失败，命令不登记', async () => {
    const trusted = generateKeys();
    const stranger = generateKeys();
    const placed = join(pluginsRoot, PLUGIN_ID);
    mkdirSync(placed, { recursive: true });
    writePackage(placed, stranger);

    const host = await bootstrapped(userData, [trusted.publicKeyPem]);
    const status = host.list().find((entry) => entry.id === PLUGIN_ID);
    expect(status?.state).toBe('failed');
    expect(status?.error?.message).toContain('信任清单');
    expect(commandRegistry.get(COMMAND_ID)).toBeUndefined();
  });

  it('磁盘直放受信公钥但 manifest 被改：真实验签失败，命令不登记', async () => {
    const keys = generateKeys();
    const placed = join(pluginsRoot, PLUGIN_ID);
    mkdirSync(placed, { recursive: true });
    writePackage(placed, keys);
    writeFileSync(join(placed, 'plugin.json'), JSON.stringify(manifest({ name: 'evil' }), null, 2), 'utf-8');

    const host = await bootstrapped(userData, [keys.publicKeyPem]);
    const status = host.list().find((entry) => entry.id === PLUGIN_ID);
    expect(status?.state).toBe('failed');
    expect(status?.error?.message).toContain('签名校验失败');
    expect(commandRegistry.get(COMMAND_ID)).toBeUndefined();
  });

  it('同一把受信公钥、私人密钥不匹配：处于信任清单也验签失败', async () => {
    const keys = generateKeys();
    const otherSigner = generateKeys();
    const source = join(root, 'mismatch');
    writePackage(source, keys);
    // 信封写受信公钥，但签名来自另一把私钥：信任命中，数学验签必须失败。
    const manifestText = readFileSync(join(source, 'plugin.json'), 'utf-8');
    const forgedSignature = sign(null, Buffer.from(manifestText, 'utf-8'), otherSigner.privateKey).toString('base64');
    writeFileSync(
      join(source, 'plugin.sig'),
      `${JSON.stringify({ algorithm: 'ed25519', signature: forgedSignature, publicKey: keys.publicKeyPem }, null, 2)}\n`,
      'utf-8',
    );

    const result = await installPluginFromDirectory(storeOptions(keys.publicKeyPem), source, {
      hostVersion: HOST,
      allowAnySource: true,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('签名校验失败');
    expect(existsSync(join(pluginsRoot, PLUGIN_ID))).toBe(false);
  });
});
