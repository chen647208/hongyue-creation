/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 插件命令声明（docs/design/04 §4.1）。
 *
 * `contributes.commands` 列出插件根内的相对 JSON 文件，文件内容是命令声明数组。
 * 本模块只做路径门、结构校验与命名空间化，不注册、不执行；注册与沙箱调用由装配器负责。
 */

import { commandId, type PluginManifest } from './manifest.js';
import { checkPluginRelPath } from './pathGate.js';

/** 一条通过校验的命令声明。 */
export interface PluginCommandDeclaration {
  /** 命名空间化后的命令 id：`/<插件短名>:<声明 id>`。 */
  id: string;
  /** 文件里的原始 id（同一插件内唯一）。 */
  declaredId: string;
  /** 命令面板显示名。 */
  title: string;
  /** 命令面板过滤关键词。 */
  keywords?: string;
  /** logic 贡献里的具名函数；缺省表示没有可执行动作。 */
  fn?: string;
}

/** 解析结果：合法声明与逐条问题（问题写日志，不阻断插件激活）。 */
export interface PluginCommandsReadResult {
  commands: PluginCommandDeclaration[];
  issues: string[];
}

const FUNCTION_RE = /^[A-Za-z_$][\w$]*$/;

function readDeclaration(
  raw: unknown,
  path: string,
  manifest: PluginManifest,
  seen: Set<string>,
  commands: PluginCommandDeclaration[],
  issues: string[],
): void {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    issues.push(`${path}: 声明必须是对象`);
    return;
  }
  const record = raw as Record<string, unknown>;
  const declaredId = typeof record.id === 'string' ? record.id.trim() : '';
  if (!declaredId) {
    issues.push(`${path}.id: 必须是非空字符串`);
    return;
  }
  if (seen.has(declaredId)) {
    issues.push(`${path}.id: 同一插件内重复「${declaredId}」`);
    return;
  }
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  if (!title) {
    issues.push(`${path}.title: 必须是非空字符串`);
    return;
  }
  let keywords: string | undefined;
  if (record.keywords !== undefined) {
    if (typeof record.keywords !== 'string') {
      issues.push(`${path}.keywords: 必须是字符串`);
      return;
    }
    keywords = record.keywords;
  }
  let fn: string | undefined;
  if (record.function !== undefined) {
    if (typeof record.function !== 'string' || !FUNCTION_RE.test(record.function)) {
      issues.push(`${path}.function: 必须是 logic 贡献里的具名函数`);
      return;
    }
    fn = record.function;
  }
  seen.add(declaredId);
  commands.push({
    id: commandId(manifest.id, declaredId),
    declaredId,
    title,
    keywords,
    fn,
  });
}

/**
 * 读取并校验插件的命令声明。
 *
 * 门序：相对路径词法门 → 必须是 `.json` → 文件已在资源集 → JSON 可解析且为数组 →
 * 逐条校验（id 非空且插件内唯一、title 非空、keywords/function 类型）→ 命名空间化。
 * 单个文件或单条声明的错误只进 issues，合法条目照常返回。
 */
export function readPluginCommands(
  manifest: PluginManifest,
  files: Record<string, string>,
): PluginCommandsReadResult {
  const commands: PluginCommandDeclaration[] = [];
  const issues: string[] = [];
  const seen = new Set<string>();

  for (const declaredPath of manifest.contributes?.commands ?? []) {
    const check = checkPluginRelPath(declaredPath);
    if (!check.ok) {
      issues.push(`命令声明路径被拒：${declaredPath}（${check.reason}）`);
      continue;
    }
    const file = check.rel;
    if (!file.endsWith('.json')) {
      issues.push(`命令声明必须是 .json 文件：${file}`);
      continue;
    }
    const text = files[file];
    if (text === undefined) {
      issues.push(`命令声明文件不存在或未装载：${file}`);
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      issues.push(`命令声明 JSON 解析失败：${file}`);
      continue;
    }
    if (!Array.isArray(parsed)) {
      issues.push(`命令声明文件必须是数组：${file}`);
      continue;
    }
    parsed.forEach((entry, index) => {
      readDeclaration(entry, `${file}[${index}]`, manifest, seen, commands, issues);
    });
  }

  return { commands, issues };
}
