/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { afterEach, describe, expect, it } from 'vitest';

import { classifyRendererError, createRendererExecutionPort } from '../rendererExecutionPort';

const ENTRIES: string[] = [];

function uniqueEntry(name: string): string {
  const entry = `renderers/${name}-${ENTRIES.length}.js`;
  ENTRIES.push(entry);
  return entry;
}

afterEach(() => {
  // 生产端口单例缓存常驻：逐个释放，避免测试间串味。
  const port = createRendererExecutionPort();
  for (const entry of ENTRIES.splice(0)) port.release?.('p', entry);
});

describe('classifyRendererError', () => {
  it('超时/内存/运行期分类', () => {
    expect(classifyRendererError('boom', true).kind).toBe('timeout');
    expect(classifyRendererError(null, false).kind).toBe('memory');
    expect(classifyRendererError({ message: 'out of memory' }, false).kind).toBe('memory');
    expect(classifyRendererError('boom', false).kind).toBe('runtime');
  });
});

describe('createRendererExecutionPort（渲染进程同步 QuickJS）', () => {
  it('未预热：拒绝同步执行，不加载任何引擎', () => {
    const port = createRendererExecutionPort();
    const result = port.render({ pluginId: 'p', entry: 'renderers/absent.js', export: 'f', source: '', input: null, timeoutMs: 100 });
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('未预热');
  });

  it('预热后同步产出字符串', async () => {
    const port = createRendererExecutionPort();
    const entry = uniqueEntry('pure');
    await port.preheat?.('p', entry, 'globalThis.renderRtf = (input) => `rtf:${input.value}`;');

    const result = port.render({ pluginId: 'p', entry, export: 'renderRtf', source: '', input: { value: 7 }, timeoutMs: 100 });

    expect(result.ok).toBe(true);
    expect(result.text).toBe('rtf:7');
  }, 20_000);

  it('ESM export 入口：从模块命名空间取导出', async () => {
    const port = createRendererExecutionPort();
    const entry = uniqueEntry('esm');
    await port.preheat?.('p', entry, 'export function renderRtf(input) { return `esm:${input.value}`; }');
    const result = port.render({ pluginId: 'p', entry, export: 'renderRtf', source: '', input: { value: 3 }, timeoutMs: 100 });
    expect(result.ok).toBe(true);
    expect(result.text).toBe('esm:3');
  }, 20_000);

  it('未导出声明函数：not-found', async () => {
    const port = createRendererExecutionPort();
    const entry = uniqueEntry('missing');
    await port.preheat?.('p', entry, 'globalThis.other = () => "x";');
    const result = port.render({ pluginId: 'p', entry, export: 'renderRtf', source: '', input: null, timeoutMs: 100 });
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('not-found');
  }, 20_000);

  it('非字符串返回：schema 错误', async () => {
    const port = createRendererExecutionPort();
    const entry = uniqueEntry('nonstring');
    await port.preheat?.('p', entry, 'globalThis.renderRtf = () => ({ nope: true });');
    const result = port.render({ pluginId: 'p', entry, export: 'renderRtf', source: '', input: null, timeoutMs: 100 });
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('schema');
  }, 20_000);

  it('死循环被墙钟超时中断', async () => {
    const port = createRendererExecutionPort();
    const entry = uniqueEntry('loop');
    await port.preheat?.('p', entry, 'globalThis.renderRtf = () => { for (;;) {} };');
    const result = port.render({ pluginId: 'p', entry, export: 'renderRtf', source: '', input: null, timeoutMs: 100 });
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('timeout');
    // 超时后同入口一律拒绝（runtime 已释放）
    const second = port.render({ pluginId: 'p', entry, export: 'renderRtf', source: '', input: null, timeoutMs: 100 });
    expect(second.ok).toBe(false);
    expect(second.error?.kind).toBe('runtime');
  }, 20_000);

  it('输出超上限：limit 错误', async () => {
    const port = createRendererExecutionPort();
    const entry = uniqueEntry('huge');
    await port.preheat?.('p', entry, 'globalThis.renderRtf = () => "x".repeat(300000);');
    const result = port.render({ pluginId: 'p', entry, export: 'renderRtf', source: '', input: null, timeoutMs: 500 });
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('limit');
  }, 20_000);

  it('release 后拒绝执行', async () => {
    const port = createRendererExecutionPort();
    const entry = uniqueEntry('release');
    await port.preheat?.('p', entry, 'globalThis.renderRtf = () => "ok";');
    port.release?.('p', entry);
    const result = port.render({ pluginId: 'p', entry, export: 'renderRtf', source: '', input: null, timeoutMs: 100 });
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('未预热');
  }, 20_000);

  it('编译失败：预热期错误在 render 时返回，不执行', async () => {
    const port = createRendererExecutionPort();
    const entry = uniqueEntry('broken');
    await port.preheat?.('p', entry, 'this is not valid javascript @@@');
    const result = port.render({ pluginId: 'p', entry, export: 'renderRtf', source: '', input: null, timeoutMs: 100 });
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('编译失败');
  }, 20_000);
});
