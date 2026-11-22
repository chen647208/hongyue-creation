/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */
import { describe, expect, it } from 'vitest';

import { readPluginCommands } from '../commands.js';
import type { PluginManifest } from '../manifest.js';

function manifest(commands: string[] = ['./commands.json']): PluginManifest {
  return {
    id: 'com.example.golden3',
    name: 'golden3',
    version: '1.0.0',
    host: '^2.0.0',
    license: 'MIT',
    contributes: { commands },
  };
}

describe('readPluginCommands', () => {
  it('合法声明：命名空间化 id，保留 title/keywords/function', () => {
    const result = readPluginCommands(manifest(), {
      'commands.json': JSON.stringify([
        { id: '写作.黄金三章', title: '黄金三章', keywords: '开篇 三章', function: 'runGolden' },
      ]),
    });

    expect(result.issues).toEqual([]);
    expect(result.commands).toEqual([
      {
        id: '/golden3:写作.黄金三章',
        declaredId: '写作.黄金三章',
        title: '黄金三章',
        keywords: '开篇 三章',
        fn: 'runGolden',
      },
    ]);
  });

  it('同一插件内重复 id：只收第一条，后续记问题', () => {
    const result = readPluginCommands(manifest(), {
      'commands.json': JSON.stringify([
        { id: 'dup', title: '甲', function: 'runA' },
        { id: 'dup', title: '乙', function: 'runB' },
      ]),
    });

    expect(result.commands.map((command) => command.title)).toEqual(['甲']);
    expect(result.issues.some((issue) => issue.includes('重复'))).toBe(true);
  });

  it('缺 title 或 title 为空：跳过该条', () => {
    const result = readPluginCommands(manifest(), {
      'commands.json': JSON.stringify([
        { id: 'no-title', function: 'runA' },
        { id: 'empty-title', title: '   ', function: 'runB' },
      ]),
    });

    expect(result.commands).toEqual([]);
    expect(result.issues.filter((issue) => issue.includes('title'))).toHaveLength(2);
  });

  it('路径越界：拒绝该声明文件', () => {
    const result = readPluginCommands(manifest(['../secrets/commands.json']), {
      '../secrets/commands.json': JSON.stringify([{ id: 'evil', title: '越界', function: 'run' }]),
    });

    expect(result.commands).toEqual([]);
    expect(result.issues[0]).toContain('路径被拒');
  });

  it('非 JSON 文件路径：拒绝', () => {
    const result = readPluginCommands(manifest(['commands.txt']), {
      'commands.txt': '[]',
    });

    expect(result.commands).toEqual([]);
    expect(result.issues[0]).toContain('必须是 .json');
  });

  it('JSON 损坏：跳过该文件', () => {
    const result = readPluginCommands(manifest(), {
      'commands.json': '[{',
    });

    expect(result.commands).toEqual([]);
    expect(result.issues[0]).toContain('JSON 解析失败');
  });

  it('文件不是数组：跳过该文件', () => {
    const result = readPluginCommands(manifest(), {
      'commands.json': JSON.stringify({ id: 'x', title: '甲' }),
    });

    expect(result.commands).toEqual([]);
    expect(result.issues[0]).toContain('必须是数组');
  });

  it('文件未被装载：记问题且不产出命令', () => {
    const result = readPluginCommands(manifest(), {});

    expect(result.commands).toEqual([]);
    expect(result.issues[0]).toContain('不存在或未装载');
  });

  it('function 不是合法标识符：跳过该条', () => {
    const result = readPluginCommands(manifest(), {
      'commands.json': JSON.stringify([{ id: 'bad-fn', title: '坏函数', function: 'run(); alert(1)' }]),
    });

    expect(result.commands).toEqual([]);
    expect(result.issues[0]).toContain('function');
  });

  it('无 function：仍作为合法声明返回，由装配器决定是否注册', () => {
    const result = readPluginCommands(manifest(), {
      'commands.json': JSON.stringify([{ id: 'no-action', title: '空动作' }]),
    });

    expect(result.issues).toEqual([]);
    expect(result.commands).toEqual([
      { id: '/golden3:no-action', declaredId: 'no-action', title: '空动作', keywords: undefined, fn: undefined },
    ]);
  });
});
