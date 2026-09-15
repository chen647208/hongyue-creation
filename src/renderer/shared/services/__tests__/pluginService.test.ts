/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { SkillCatalog } from '@core/ai';
import { BuildProfileRegistry, EventBus, FormulaRegistry } from '@core/plugin';
import { afterEach,beforeEach, describe, expect, it, vi } from 'vitest';

const files: Record<string, string> = {
  '/data/plugins/com.example.golden3/plugin.json': JSON.stringify({
    id: 'com.example.golden3',
    name: 'golden3',
    version: '1.0.0',
    host: '^2.0.0',
    license: 'MIT',
    contributes: { skills: ['./skills/'] },
  }),
  '/data/plugins/com.example.golden3/skills/extra.md': `---
name: golden3-extra
description: 社区黄金三章扩展写法。触发词：社区开篇
---
# 扩展方法论
正文内容。
`,
  '/data/plugins/com.example.golden3/skills/handler.js': 'function run(input) { return { output: input }; }',
};

vi.mock('@/shared/services/repository', () => ({}));

import { bootstrapPlugins, readPluginCatalog, runPluginLogic,setTrustedPluginKeys } from '../pluginService';
import { uiSlotRegistry } from '../uiSlots';

describe('pluginService（磁盘发现 + 技能贡献装配）', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      electronAPI: {
        getAppDataPath: async () => '/data',
        listDirectory: async (dir: string) => {
          if (dir === '/data/plugins') {
            return [{ name: 'com.example.golden3', type: 'directory' }];
          }
          return [];
        },
        pluginListDirectory: async (rootDir: string, rel: string) => {
          if (`${rootDir}/${rel}` === '/data/plugins/com.example.golden3/skills') {
            return [
              { name: 'extra.md', type: 'file' },
              { name: 'handler.js', type: 'file' },
            ];
          }
          return [];
        },
        pluginReadFile: async (rootDir: string, rel: string) => {
          const raw = files[`${rootDir}/${rel}`];
          if (raw === undefined) throw new Error(`not found: ${rootDir}/${rel}`);
          return raw;
        },
        pluginReadBinary: async (rootDir: string, rel: string) => {
          const raw = files[`${rootDir}/${rel}`];
          if (raw === undefined) throw new Error(`not found: ${rootDir}/${rel}`);
          return raw;
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setTrustedPluginKeys([]);
  });

  it('发现→装载→自动激活：技能贡献进入目录；禁用后卸载', async () => {
    const catalog = new SkillCatalog();
    const host = await bootstrapPlugins({ skillCatalog: catalog, buildProfiles: new BuildProfileRegistry(), events: new EventBus(), formulas: new FormulaRegistry() }, '2.0.0', []);

    const status = host.list().find((s) => s.id === 'com.example.golden3');
    // bootstrap 即激活（否则贡献点永不生效）
    expect(status?.state).toBe('active');
    expect(catalog.get('golden3-extra')?.body).toContain('扩展方法论');
    expect(catalog.get('golden3-extra')?.handler?.code).toContain('function run');

    host.disable('com.example.golden3');
    expect(catalog.get('golden3-extra')).toBeUndefined();
    expect(status!.state).toBe('disabled');
  });

  it('配置级禁用：装载即 disabled，技能不注册', async () => {
    const catalog = new SkillCatalog();
    const host = await bootstrapPlugins({ skillCatalog: catalog, buildProfiles: new BuildProfileRegistry(), events: new EventBus(), formulas: new FormulaRegistry() }, '2.0.0', ['com.example.golden3']);
    host.activate('com.example.golden3');
    expect(host.list()[0]!.state).toBe('disabled');
    expect(catalog.get('golden3-extra')).toBeUndefined();
  });

  it('无文件系统（预览环境）：静默跳过磁盘发现', async () => {
    vi.stubGlobal('window', { electronAPI: undefined });
    const catalog = new SkillCatalog();
    const host = await bootstrapPlugins({ skillCatalog: catalog, buildProfiles: new BuildProfileRegistry(), events: new EventBus(), formulas: new FormulaRegistry() }, '2.0.0', []);
    expect(host.list()).toEqual([]);
  });

  it('贡献路径越界：插件 failed，不读取越界文件（§11.2 路径门）', async () => {
    vi.stubGlobal('window', {
      electronAPI: {
        getAppDataPath: async () => '/data',
        listDirectory: async (dir: string) =>
          dir === '/data/plugins' ? [{ name: 'com.bad.escape', type: 'directory' }] : [],
        pluginListDirectory: async () => [],
        pluginReadBinary: async () => '',
        pluginReadFile: async (rootDir: string, rel: string) => {
          const path = `${rootDir}/${rel}`;
          if (path === '/data/plugins/com.bad.escape/plugin.json') {
            return JSON.stringify({
              id: 'com.bad.escape',
              name: 'bad',
              version: '1.0.0',
              host: '^2.0.0',
              license: 'MIT',
              contributes: { skills: ['../secrets/'] },
            });
          }
          throw new Error(`不应读取越界文件：${path}`);
        },
      },
    });
    const catalog = new SkillCatalog();
    const host = await bootstrapPlugins({ skillCatalog: catalog, buildProfiles: new BuildProfileRegistry(), events: new EventBus(), formulas: new FormulaRegistry() }, '2.0.0', []);
    const status = host.list().find((s) => s.id === 'com.bad.escape');
    expect(status?.state).toBe('failed');
    expect(status?.error?.cause.some((c) => String(c).includes('越界'))).toBe(true);
    expect(catalog.list()).toEqual([]);
  });

  it('签名包无信任键：fail closed（S4）', async () => {
    vi.stubGlobal('window', {
      electronAPI: {
        getAppDataPath: async () => '/data',
        listDirectory: async (dir: string) =>
          dir === '/data/plugins' ? [{ name: 'com.signed.p', type: 'directory' }] : [],
        pluginListDirectory: async () => [],
        pluginReadBinary: async () => '',
        pluginReadFile: async (_root: string, rel: string) => {
          if (rel === 'plugin.json') {
            return JSON.stringify({ id: 'com.signed.p', name: 'p', version: '1.0.0', host: '^2.0.0', license: 'MIT' });
          }
          if (rel === 'plugin.sig') {
            return JSON.stringify({ algorithm: 'ed25519', signature: 's', publicKey: 'k' });
          }
          throw new Error('missing');
        },
        pluginVerifySignature: async () => true,
      },
    });
    const catalog = new SkillCatalog();
    const host = await bootstrapPlugins(
      { skillCatalog: catalog, buildProfiles: new BuildProfileRegistry(), events: new EventBus(), formulas: new FormulaRegistry() },
      '2.0.0',
      [],
    );
    const status = host.list().find((s) => s.id === 'com.signed.p');
    expect(status?.state).toBe('failed');
    expect(status?.error?.message).toContain('信任清单');
  });

  it('信任键命中且校验通过：签名包放行（S4）', async () => {
    setTrustedPluginKeys(['k']);
    vi.stubGlobal('window', {
      electronAPI: {
        getAppDataPath: async () => '/data',
        listDirectory: async (dir: string) =>
          dir === '/data/plugins' ? [{ name: 'com.signed.ok', type: 'directory' }] : [],
        pluginListDirectory: async () => [],
        pluginReadBinary: async () => '',
        pluginReadFile: async (_root: string, rel: string) => {
          if (rel === 'plugin.json') {
            return JSON.stringify({ id: 'com.signed.ok', name: 'p', version: '1.0.0', host: '^2.0.0', license: 'MIT' });
          }
          if (rel === 'plugin.sig') {
            return JSON.stringify({ algorithm: 'ed25519', signature: 's', publicKey: 'k' });
          }
          throw new Error('missing');
        },
        pluginVerifySignature: async () => true,
      },
    });
    const catalog = new SkillCatalog();
    const host = await bootstrapPlugins(
      { skillCatalog: catalog, buildProfiles: new BuildProfileRegistry(), events: new EventBus(), formulas: new FormulaRegistry() },
      '2.0.0',
      [],
    );
    expect(host.list().find((s) => s.id === 'com.signed.ok')?.state).toBe('active');
  });

  it('UI 贡献渲染进 plugin.panel 槽位，禁用后移除（S3）', async () => {
    vi.stubGlobal('window', {
      electronAPI: {
        getAppDataPath: async () => '/data',
        listDirectory: async (dir: string) =>
          dir === '/data/plugins' ? [{ name: 'com.ui.p', type: 'directory' }] : [],
        pluginListDirectory: async (root: string, rel: string) =>
          `${root}/${rel}` === '/data/plugins/com.ui.p/panel' ? [{ name: 'index.html', type: 'file' }] : [],
        pluginReadBinary: async () => '',
        pluginReadFile: async (root: string, rel: string) => {
          const full = `${root}/${rel}`;
          if (full === '/data/plugins/com.ui.p/plugin.json') {
            return JSON.stringify({
              id: 'com.ui.p',
              name: 'ui-p',
              version: '1.0.0',
              host: '^2.0.0',
              license: 'MIT',
              contributes: { ui: ['./panel/'] },
            });
          }
          if (full === '/data/plugins/com.ui.p/panel/index.html') return '<p>hello</p>';
          throw new Error('missing');
        },
      },
    });
    const host = await bootstrapPlugins(
      { skillCatalog: new SkillCatalog(), buildProfiles: new BuildProfileRegistry(), events: new EventBus(), formulas: new FormulaRegistry() },
      '2.0.0',
      [],
    );
    expect(uiSlotRegistry.getSnapshot('plugin.panel')).toHaveLength(1);
    host.disable('com.ui.p');
    expect(uiSlotRegistry.getSnapshot('plugin.panel')).toHaveLength(0);
  });

  it('编辑器扩展：装配进 plugin.editor 槽位，禁用后释放无残留（design/22 §4）', async () => {
    vi.stubGlobal('window', {
      electronAPI: {
        getAppDataPath: async () => '/data',
        listDirectory: async (dir: string) =>
          dir === '/data/plugins' ? [{ name: 'com.editor.p', type: 'directory' }] : [],
        pluginListDirectory: async (root: string, rel: string) =>
          `${root}/${rel}` === '/data/plugins/com.editor.p/editor' ? [{ name: 'index.html', type: 'file' }] : [],
        pluginReadBinary: async () => '',
        pluginReadFile: async (root: string, rel: string) => {
          const full = `${root}/${rel}`;
          if (full === '/data/plugins/com.editor.p/plugin.json') {
            return JSON.stringify({
              id: 'com.editor.p',
              name: 'editor-p',
              version: '1.0.0',
              host: '^2.0.0',
              license: 'MIT',
              contributes: { editor: ['./editor/'] },
            });
          }
          if (full === '/data/plugins/com.editor.p/editor/index.html') return '<div>ext</div>';
          if (full === '/data/plugins/com.editor.p/plugin.sig') {
            return JSON.stringify({ algorithm: 'ed25519', signature: 'sig', publicKey: 'test-key' });
          }
          throw new Error('missing');
        },
        pluginVerifySignature: async () => true,
      },
    });
    setTrustedPluginKeys(['test-key']);
    const host = await bootstrapPlugins(
      { skillCatalog: new SkillCatalog(), buildProfiles: new BuildProfileRegistry(), events: new EventBus(), formulas: new FormulaRegistry() },
      '2.0.0',
      [],
    );
    expect(host.list().find((s) => s.id === 'com.editor.p')?.state).toBe('active');
    expect(uiSlotRegistry.getSnapshot('plugin.editor')).toHaveLength(1);

    host.disable('com.editor.p');
    expect(uiSlotRegistry.getSnapshot('plugin.editor')).toHaveLength(0);
  });

  it('逻辑贡献：收集 .js 并经沙箱执行（design/22）', async () => {
    vi.stubGlobal('window', {
      electronAPI: {
        getAppDataPath: async () => '/data',
        listDirectory: async (dir: string) =>
          dir === '/data/plugins' ? [{ name: 'com.logic.p', type: 'directory' }] : [],
        pluginListDirectory: async (root: string, rel: string) =>
          `${root}/${rel}` === '/data/plugins/com.logic.p/logic' ? [{ name: 'handler.js', type: 'file' }] : [],
        pluginReadBinary: async () => '',
        pluginReadFile: async (root: string, rel: string) => {
          const full = `${root}/${rel}`;
          if (full === '/data/plugins/com.logic.p/plugin.json') {
            return JSON.stringify({
              id: 'com.logic.p',
              name: 'p',
              version: '1.0.0',
              host: '^2.0.0',
              license: 'MIT',
              contributes: { logic: ['./logic/'] },
              permissions: { read: ['project'], write: ['ai'] },
            });
          }
          if (full === '/data/plugins/com.logic.p/logic/handler.js') {
            return 'function greet(input){ return input; }';
          }
          if (full === '/data/plugins/com.logic.p/plugin.sig') {
            return JSON.stringify({ algorithm: 'ed25519', signature: 'sig', publicKey: 'test-key' });
          }
          throw new Error('missing');
        },
        pluginVerifySignature: async () => true,
        pluginSandboxRun: async (request: unknown) => ({
          ok: true,
          output: { echoed: (request as { input?: unknown }).input },
        }),
      },
    });
    setTrustedPluginKeys(['test-key']);
    const host = await bootstrapPlugins(
      { skillCatalog: new SkillCatalog(), buildProfiles: new BuildProfileRegistry(), events: new EventBus(), formulas: new FormulaRegistry() },
      '2.0.0',
      [],
    );
    expect(host.list().find((s) => s.id === 'com.logic.p')?.state).toBe('active');
    const result = await runPluginLogic('com.logic.p', 'greet', 'hi');
    expect(result.ok).toBe(true);
    expect(result.output).toEqual({ echoed: 'hi' });

    host.disable('com.logic.p');
    const afterDisable = await runPluginLogic('com.logic.p', 'greet', 'hi');
    expect(afterDisable.ok).toBe(false);
    expect(afterDisable.error?.kind).toBe('permission');
  });

  it('未激活/无宿主的逻辑执行：deny-by-default 返回 permission（权限门）', async () => {
    const result = await runPluginLogic('com.absent.p', 'greet', 'hi');
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('permission');
  });

  it('未声明 write:ai 的逻辑插件：执行返回 permission 错误（权限边界）', async () => {
    vi.stubGlobal('window', {
      electronAPI: {
        getAppDataPath: async () => '/data',
        listDirectory: async (dir: string) =>
          dir === '/data/plugins' ? [{ name: 'com.noperm.p', type: 'directory' }] : [],
        pluginListDirectory: async (root: string, rel: string) =>
          `${root}/${rel}` === '/data/plugins/com.noperm.p/logic' ? [{ name: 'handler.js', type: 'file' }] : [],
        pluginReadBinary: async () => '',
        pluginReadFile: async (root: string, rel: string) => {
          const full = `${root}/${rel}`;
          if (full === '/data/plugins/com.noperm.p/plugin.json') {
            return JSON.stringify({
              id: 'com.noperm.p', name: 'p', version: '1.0.0', host: '^2.0.0', license: 'MIT',
              contributes: { logic: ['./logic/'] },
            });
          }
          if (full === '/data/plugins/com.noperm.p/logic/handler.js') {
            return 'function greet(input){ return input; }';
          }
          if (full === '/data/plugins/com.noperm.p/plugin.sig') {
            return JSON.stringify({ algorithm: 'ed25519', signature: 'sig', publicKey: 'test-key' });
          }
          throw new Error('missing');
        },
        pluginVerifySignature: async () => true,
        pluginSandboxRun: async () => ({ ok: true, output: { ran: true } }),
      },
    });
    setTrustedPluginKeys(['test-key']);
    const host = await bootstrapPlugins(
      { skillCatalog: new SkillCatalog(), buildProfiles: new BuildProfileRegistry(), events: new EventBus(), formulas: new FormulaRegistry() },
      '2.0.0',
      [],
    );
    expect(host.list().find((s) => s.id === 'com.noperm.p')?.state).toBe('active');
    const result = await runPluginLogic('com.noperm.p', 'greet', 'hi');
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('permission');
  });

  it('未签名插件：逻辑贡献不放行（fail-closed）', async () => {    vi.stubGlobal('window', {
      electronAPI: {
        getAppDataPath: async () => '/data',
        listDirectory: async (dir: string) =>
          dir === '/data/plugins' ? [{ name: 'com.unsigned.p', type: 'directory' }] : [],
        pluginListDirectory: async (root: string, rel: string) =>
          `${root}/${rel}` === '/data/plugins/com.unsigned.p/logic' ? [{ name: 'handler.js', type: 'file' }] : [],
        pluginReadBinary: async () => '',
        pluginReadFile: async (root: string, rel: string) => {
          const full = `${root}/${rel}`;
          if (full === '/data/plugins/com.unsigned.p/plugin.json') {
            return JSON.stringify({
              id: 'com.unsigned.p', name: 'p', version: '1.0.0', host: '^2.0.0', license: 'MIT',
              contributes: { logic: ['./logic/'] },
            });
          }
          if (full === '/data/plugins/com.unsigned.p/logic/handler.js') {
            return 'function greet(input){ return input; }';
          }
          throw new Error('missing');
        },
      },
    });
    const host = await bootstrapPlugins(
      { skillCatalog: new SkillCatalog(), buildProfiles: new BuildProfileRegistry(), events: new EventBus(), formulas: new FormulaRegistry() },
      '2.0.0',
      [],
    );
    expect(host.list().find((s) => s.id === 'com.unsigned.p')?.state).toBe('active');
    expect((await runPluginLogic('com.unsigned.p', 'greet', 'hi')).ok).toBe(false);
  });
});

describe('readPluginCatalog（目录索引 detached 签名）', () => {
  const INDEX_PATH = '/data/catalog.json';
  const SIG_PATH = '/data/catalog.sig';
  const catalog = {
    schema: 1,
    entries: [
      { id: 'com.example.search', name: 'search', version: '1.2.0', host: '^2.0.0', license: 'MIT', source: 'https://example.com', path: 'search' },
    ],
  };
  const envelope = JSON.stringify({ algorithm: 'ed25519', signature: 'sig', publicKey: 'pem' });

  function stub(readFile: (path: string) => Promise<string>, verify: () => Promise<boolean>): void {
    vi.stubGlobal('window', {
      electronAPI: {
        readFile,
        pluginVerifySignature: verify,
      },
    });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('签名有效：返回目录条目', async () => {
    stub(
      async (path) => {
        if (path === INDEX_PATH) return JSON.stringify(catalog);
        if (path === SIG_PATH) return envelope;
        throw new Error('missing');
      },
      async () => true,
    );
    const result = await readPluginCatalog(INDEX_PATH);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.catalog.entries).toHaveLength(1);
  });

  it('验签失败：拒绝使用该索引', async () => {
    stub(
      async (path) => {
        if (path === INDEX_PATH) return JSON.stringify(catalog);
        if (path === SIG_PATH) return envelope;
        throw new Error('missing');
      },
      async () => false,
    );
    const result = await readPluginCatalog(INDEX_PATH);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.path).toBe('signature');
  });

  it('缺少 catalog.sig：fail-closed 拒绝', async () => {
    stub(
      async (path) => {
        if (path === INDEX_PATH) return JSON.stringify(catalog);
        throw new Error('missing');
      },
      async () => true,
    );
    const result = await readPluginCatalog(INDEX_PATH);
    expect(result.ok).toBe(false);
  });
});
