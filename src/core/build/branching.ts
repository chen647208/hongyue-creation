/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 分支叙事数据模型与校验（docs/design/42 §1–§3）。
 *
 * 场景是节点，选择项是场景上的属性（文案 + 条件 + 目标），跳转是场景间关系；
 * 变量在工作品级声明。本模块只做设计期计算：条件求值、可达性、跳转表与完整性校验，
 * 不做运行时执行与脚本解释（非目标）。纯函数，无 IO。
 */

export type BranchVariableType = 'number' | 'boolean' | 'string';

export interface BranchVariable {
  name: string;
  type?: BranchVariableType;
  /** 初值（number 用 0，boolean 用 0/1）。 */
  initial?: number;
}

export interface BranchChoice {
  /** 选项文案。 */
  text: string;
  /** 目标场景 id；缺失即悬空目标，校验报错。 */
  target: string;
  /** 条件表达式（受限子集）；缺席即恒真。 */
  condition?: string;
}

export interface BranchScene {
  id: string;
  title: string;
  choices?: BranchChoice[];
  /** 结局标记；结局可无出口。 */
  ending?: boolean;
}

export interface JumpEntry {
  fromId: string;
  choiceIndex: number;
  choice: string;
  target: string;
  condition?: string;
}

export type BranchIssueKind = 'orphan' | 'unreachableEnding' | 'noExit' | 'undefinedVariable' | 'cycle' | 'danglingTarget';

export interface BranchIssue {
  kind: BranchIssueKind;
  sceneId: string;
  detail: string;
}

type Value = number | boolean;

const TOKEN = /\s*(==|!=|>=|<=|&&|\|\||[()!<>]|-?\d+(?:\.\d+)?|true|false|[A-Za-z_][\w.]*)/g;

function tokenize(expr: string): string[] {
  const tokens: string[] = [];
  let lastIndex = 0;
  for (const match of expr.matchAll(TOKEN)) {
    if ((match.index ?? 0) > lastIndex && expr.slice(lastIndex, match.index).trim() !== '') {
      throw new Error(`条件表达式含非法字符：${expr.slice(lastIndex, match.index)}`);
    }
    lastIndex = (match.index ?? 0) + match[0].length;
    const token = match[1];
    if (token === undefined) continue;
    tokens.push(token);
  }
  if (expr.slice(lastIndex).trim() !== '') throw new Error(`条件表达式含非法字符：${expr.slice(lastIndex)}`);
  return tokens;
}

/** 抽取表达式中的变量名（排除 true/false）。 */
export function collectConditionVariables(expr: string | undefined): string[] {
  if (!expr) return [];
  const names: string[] = [];
  for (const token of tokenize(expr)) {
    if (/^[A-Za-z_][\w.]*$/.test(token) && token !== 'true' && token !== 'false') {
      if (!names.includes(token)) names.push(token);
    }
  }
  return names;
}

function truthy(value: Value): boolean {
  return typeof value === 'boolean' ? value : value !== 0;
}

function compare(op: string, a: Value, b: Value): boolean {
  switch (op) {
    case '==': return a === b || Number(a) === Number(b);
    case '!=': return !(a === b || Number(a) === Number(b));
    case '>': return Number(a) > Number(b);
    case '>=': return Number(a) >= Number(b);
    case '<': return Number(a) < Number(b);
    case '<=': return Number(a) <= Number(b);
    default: throw new Error(`未知比较符：${op}`);
  }
}

/**
 * 求值受限条件表达式：变量、数字、true/false、`!`、比较符与 `&&`/`||`、括号。
 * 表达式非法或引用未定义变量时抛错（调用方按设计期校验处理）。
 */
export function evalCondition(expr: string | undefined, vars: Readonly<Record<string, number | boolean>>): boolean {
  if (expr === undefined || expr.trim() === '') return true;
  const tokens = tokenize(expr);
  let pos = 0;
  const peek = (): string | undefined => tokens[pos];
  const take = (): string | undefined => tokens[pos++];

  function primary(): Value {
    const token = take();
    if (token === undefined) throw new Error('条件表达式不完整');
    if (token === '(') {
      const value = or();
      if (take() !== ')') throw new Error('条件表达式缺少右括号');
      return value;
    }
    if (token === 'true') return true;
    if (token === 'false') return false;
    if (/^-?\d+(?:\.\d+)?$/.test(token)) return Number(token);
    const value = vars[token];
    if (value === undefined) throw new Error(`未定义变量：${token}`);
    return typeof value === 'boolean' ? value : Number(value);
  }

  function comparison(): Value {
    const left = primary();
    const op = peek();
    if (op !== undefined && ['==', '!=', '>=', '<=', '>', '<'].includes(op)) {
      take();
      const right = primary();
      return compare(op, left, right);
    }
    return left;
  }

  function unary(): Value {
    if (peek() === '!') {
      take();
      return !truthy(unary());
    }
    return comparison();
  }

  function and(): Value {
    let value = unary();
    while (peek() === '&&') {
      take();
      const right = unary();
      value = truthy(value) && truthy(right);
    }
    return value;
  }

  function or(): Value {
    let value = and();
    while (peek() === '||') {
      take();
      const right = and();
      value = truthy(value) || truthy(right);
    }
    return value;
  }

  const result = or();
  if (pos !== tokens.length) throw new Error('条件表达式有多余内容');
  return truthy(result);
}

/** 场景选择项 → 跳转表（设计期参考，供下游引擎或作者使用）。 */
export function buildJumpTable(scenes: readonly BranchScene[]): JumpEntry[] {
  const out: JumpEntry[] = [];
  for (const scene of scenes) {
    (scene.choices ?? []).forEach((choice, index) => {
      const entry: JumpEntry = { fromId: scene.id, choiceIndex: index, choice: choice.text, target: choice.target };
      if (choice.condition) entry.condition = choice.condition;
      out.push(entry);
    });
  }
  return out;
}

/** 从起点沿选择项可达的场景集合（广搜；忽略条件，条件由校验单独检查）。 */
export function reachableScenes(scenes: readonly BranchScene[], startId: string | undefined): Set<string> {
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  const start = startId ?? scenes[0]?.id;
  const visited = new Set<string>();
  if (!start || !byId.has(start)) return visited;
  const queue = [start];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) break;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const choice of byId.get(id)?.choices ?? []) {
      if (byId.has(choice.target) && !visited.has(choice.target)) queue.push(choice.target);
    }
  }
  return visited;
}

/** 能到达任一结局的场景集合：结局集合反向可达。 */
export function canReachEnding(scenes: readonly BranchScene[]): Set<string> {
  const incoming = new Map<string, string[]>();
  for (const scene of scenes) {
    for (const choice of scene.choices ?? []) {
      const list = incoming.get(choice.target) ?? [];
      list.push(scene.id);
      incoming.set(choice.target, list);
    }
  }
  const result = new Set<string>();
  const queue = scenes.filter((scene) => scene.ending).map((scene) => scene.id);
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) break;
    if (result.has(id)) continue;
    result.add(id);
    for (const parent of incoming.get(id) ?? []) {
      if (!result.has(parent)) queue.push(parent);
    }
  }
  return result;
}

/**
 * 完整性校验：孤儿场景、不可达结局、无出口场景、未定义变量、悬空目标、循环无出口。
 * 返回问题清单，调用方按 sceneId 跳转定位。
 */
export function validateBranching(
  scenes: readonly BranchScene[],
  variables: readonly BranchVariable[] = [],
  startId?: string,
): BranchIssue[] {
  const issues: BranchIssue[] = [];
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  const variableNames = new Set(variables.map((variable) => variable.name));
  const start = startId ?? scenes[0]?.id;
  const reachable = reachableScenes(scenes, start);
  const endingReachable = canReachEnding(scenes);

  for (const scene of scenes) {
    const choices = scene.choices ?? [];
    if (!scene.ending && choices.length === 0) {
      issues.push({ kind: 'noExit', sceneId: scene.id, detail: '非结局场景没有任何出口' });
    }
    if (scene.ending && start !== undefined && !reachable.has(scene.id)) {
      issues.push({ kind: 'unreachableEnding', sceneId: scene.id, detail: '结局不可达' });
    }
    if (!scene.ending && scene.id !== start && !reachable.has(scene.id)) {
      issues.push({ kind: 'orphan', sceneId: scene.id, detail: '孤儿场景（从起点不可达）' });
    }
    if (!scene.ending && choices.length > 0 && !endingReachable.has(scene.id) && reachable.has(scene.id)) {
      issues.push({ kind: 'cycle', sceneId: scene.id, detail: '循环无出口（无法到达任何结局）' });
    }
    for (const choice of choices) {
      if (!byId.has(choice.target)) {
        issues.push({ kind: 'danglingTarget', sceneId: scene.id, detail: `选择项指向不存在的场景：${choice.target}` });
      }
      for (const name of collectConditionVariables(choice.condition)) {
        if (!variableNames.has(name)) {
          issues.push({ kind: 'undefinedVariable', sceneId: scene.id, detail: `使用了未声明变量：${name}` });
        }
      }
    }
  }
  return issues;
}

/**
 * 按分支顺序阅读：从起点沿“第一个可用选择”前进到结局，条件满足才走该选择。
 * 返回经过的场景 id 序列；走不动时截断（避免死循环）。
 */
export function firstReadThrough(
  scenes: readonly BranchScene[],
  variables: Readonly<Record<string, number | boolean>> = {},
  startId?: string,
): string[] {
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  let current = startId ?? scenes[0]?.id;
  const path: string[] = [];
  const visited = new Set<string>();
  while (current && byId.has(current) && !visited.has(current)) {
    visited.add(current);
    path.push(current);
    const scene = byId.get(current);
    if (!scene || scene.ending) break;
    const next = (scene.choices ?? []).find((choice) => {
      if (!byId.has(choice.target)) return false;
      try {
        return evalCondition(choice.condition, variables);
      } catch {
        return false;
      }
    });
    current = next?.target;
  }
  return path;
}
