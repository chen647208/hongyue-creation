/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect, it } from 'vitest';

import type { ScriptDescriptor } from '../descriptors.js';
import { HOST_SCRIPT_EVENTS, isHostScriptEvent, type ScriptExecutionPort } from '../execution.js';
import type { PluginManifest, PluginPermissions } from '../manifest.js';
import { ScriptRegistry } from '../registries.js';
import { PluginHost, type ScriptEventFailure } from '../runtime.js';
import type { SandboxRunRequest } from '../sandbox/types.js';

const PLUGIN_ID = 'com.example.plugin';

const FILES: Record<string, string> = {
  'scripts/open.js': 'export function onOpen() { return "open"; }',
  'scripts/two.js': 'export function onTwo() { return "BOOM"; }',
  'scripts/save.js': 'export function onSave() { return "save"; }',
};

const OPEN: ScriptDescriptor = {
  id: 'on-open',
  entry: 'scripts/open.js',
  export: 'onOpen',
  purity: 'effectful',
  mode: 'async',
  on: 'chapter.open',
  capabilities: ['write:cards'],
  output: { type: 'string' },
};

const SAVE: ScriptDescriptor = {
  id: 'on-save',
  entry: 'scripts/save.js',
  export: 'onSave',
  purity: 'effectful',
  mode: 'async',
  on: 'chapter.save',
  capabilities: ['write:cards'],
  output: { type: 'string' },
};

function manifest(permissions: PluginPermissions): PluginManifest {
  return {
    id: PLUGIN_ID,
    name: 'plugin',
    version: '1.0.0',
    host: '^2.0.0',
    license: 'MIT',
    permissions,
    contributes: { scripts: ['./scripts/'] },
  };
}

interface HostOptions {
  scripts?: ScriptDescriptor[];
  permissions?: PluginPermissions;
  execution?: ScriptExecutionPort;
  onError?: (failure: ScriptEventFailure) => void;
}

function makeHost(options: HostOptions = {}): PluginHost {
  const scripts = new ScriptRegistry();
  for (const script of options.scripts ?? [OPEN, SAVE]) scripts.register(PLUGIN_ID, script);
  const host = new PluginHost(
    { hostVersion: '2.0.0', scripts, scriptExecution: options.execution, onScriptEventError: options.onError },
    () => [],
  );
  host.loadRaw(PLUGIN_ID, manifest(options.permissions ?? { write: ['cards'] }), FILES, true);
  return host;
}

function recordingPort(sink: SandboxRunRequest[]): ScriptExecutionPort {
  return (request) => {
    sink.push(request);
    return Promise.resolve({ ok: true, output: 'ok' });
  };
}

/** 等待 emit 派发的异步执行链完成（假端口只做微任务，宏任务一次即可）。 */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const OPEN_PAYLOAD = { bookId: 'b1', chapterId: 'c1', title: '第一章' };

describe('宿主脚本事件集合', () => {
  it('事件名封闭：只认 project.open / chapter.open / chapter.save', () => {
    expect(HOST_SCRIPT_EVENTS).toEqual(['project.open', 'chapter.open', 'chapter.save']);
    expect(isHostScriptEvent('chapter.open')).toBe(true);
    expect(isHostScriptEvent('chapter.close')).toBe(false);
  });
});

describe('PluginHost.emit 事件分发', () => {
  it('匹配事件触发：只执行 on 对齐的脚本，载荷交执行端口', async () => {
    const calls: SandboxRunRequest[] = [];
    const host = makeHost({ execution: recordingPort(calls) });
    host.activate(PLUGIN_ID);

    expect(host.hasEventSubscribers('chapter.open')).toBe(true);
    host.emit('chapter.open', OPEN_PAYLOAD);
    await flush();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.code).toContain('onOpen');
    expect(calls[0]?.input).toEqual(OPEN_PAYLOAD);
  });

  it('非激活插件零执行：未激活不触发', async () => {
    const calls: SandboxRunRequest[] = [];
    const host = makeHost({ execution: recordingPort(calls) });

    expect(host.hasEventSubscribers('chapter.open')).toBe(false);
    host.emit('chapter.open', OPEN_PAYLOAD);
    await flush();

    expect(calls).toHaveLength(0);
  });

  it('禁用后零执行：disable 即从订阅集合消失', async () => {
    const calls: SandboxRunRequest[] = [];
    const host = makeHost({ execution: recordingPort(calls) });
    host.activate(PLUGIN_ID);
    host.disable(PLUGIN_ID);

    expect(host.hasEventSubscribers('chapter.open')).toBe(false);
    host.emit('chapter.open', OPEN_PAYLOAD);
    await flush();

    expect(calls).toHaveLength(0);
  });

  it('越权拒绝：能力未在 manifest 声明即不进执行端口，失败记回执', async () => {
    const calls: SandboxRunRequest[] = [];
    const failures: ScriptEventFailure[] = [];
    const host = makeHost({
      scripts: [{ ...OPEN, capabilities: ['read:secret'] }],
      permissions: { write: ['cards'] },
      execution: recordingPort(calls),
      onError: (failure) => failures.push(failure),
    });
    host.activate(PLUGIN_ID);

    host.emit('chapter.open', OPEN_PAYLOAD);
    await flush();

    expect(calls).toHaveLength(0);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.message).toContain('read:secret');
  });

  it('单脚本失败不阻断：同事件其余脚本照常执行', async () => {
    const calls: SandboxRunRequest[] = [];
    const failures: ScriptEventFailure[] = [];
    const second: ScriptDescriptor = {
      ...OPEN,
      id: 'on-open-two',
      entry: 'scripts/two.js',
      export: 'onTwo',
    };
    const execution: ScriptExecutionPort = (request) => {
      calls.push(request);
      if (request.code.includes('BOOM')) {
        return Promise.resolve({ ok: false, error: { kind: 'runtime', message: '脚本爆炸' } });
      }
      return Promise.resolve({ ok: true, output: 'ok' });
    };
    const host = makeHost({
      scripts: [OPEN, second],
      execution,
      onError: (failure) => failures.push(failure),
    });
    host.activate(PLUGIN_ID);

    host.emit('chapter.open', OPEN_PAYLOAD);
    await flush();

    expect(calls).toHaveLength(2);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.message).toContain('脚本爆炸');
    expect(failures[0]?.scriptId).toContain('on-open-two');
  });

  it('未知事件不触发：声明在宿主未导出挂点上的脚本不被执行', async () => {
    const calls: SandboxRunRequest[] = [];
    const host = makeHost({
      scripts: [{ ...OPEN, id: 'on-close', on: 'chapter.close' }],
      execution: recordingPort(calls),
    });
    host.activate(PLUGIN_ID);

    expect(host.hasEventSubscribers('chapter.close')).toBe(false);
    host.emit('chapter.close', OPEN_PAYLOAD);
    await flush();

    expect(calls).toHaveLength(0);
  });

  it('无执行端口 fail-closed：不抛错，失败经回执上报', async () => {
    const failures: ScriptEventFailure[] = [];
    const host = makeHost({ onError: (failure) => failures.push(failure) });
    host.activate(PLUGIN_ID);

    expect(() => host.emit('chapter.open', OPEN_PAYLOAD)).not.toThrow();
    await flush();

    expect(failures).toHaveLength(1);
    expect(failures[0]?.message).toContain('执行端口');
  });
});
