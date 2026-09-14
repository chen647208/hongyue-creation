/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 工具参数 JSON Schema 校验器（docs/design/05 §2）。
 *
 * 有意识地只覆盖工具 schema 用到的 JSON Schema 子集，而不是引入完整 JSON Schema 引擎：
 * type（object/array/string/number/integer/boolean/null，支持字符串数组形式）、
 * required、properties、enum、items（单 schema 与元组）、additionalProperties。
 * 纯函数、零依赖，渲染端与主进程可共用。
 *
 * 返回值是结构化错误清单（字段路径 + 原因 + 命中的关键字），调用方据此拒绝工具调用，
 * 不进入执行；未知字段默认放行，schema 声明 additionalProperties:false 时拒绝。
 */

/** 工具参数 schema（JSON Schema 子集，对象类型）。 */
export type JsonSchema = Record<string, unknown>;

/** 一条校验失败：path 为出问题的字段路径（顶层属性为 'name'，嵌套 'profile.name'，数组 'tags[0]'）。 */
export interface SchemaValidationIssue {
  path: string;
  keyword: 'type' | 'required' | 'enum' | 'items' | 'additionalProperties';
  /** 面向调用方/模型的原因说明（不含工具 id）。 */
  message: string;
  /** keyword=type 时的期望类型。 */
  expected?: string;
  /** keyword=enum 时的允许取值。 */
  allowed?: unknown[];
}

export interface SchemaValidationOptions {
  /** 未知字段策略：默认 'allow'；'reject' 等价于 additionalProperties:false。 */
  unknownProperties?: 'allow' | 'reject';
}

const TYPE_NAMES = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function typeMatches(value: unknown, type: string): boolean {
  switch (type) {
    case 'object':
      return isPlainObject(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    default:
      // 未识别的类型名不做约束（schema 允许携带注解类关键字）
      return true;
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    return aKeys.length === bKeys.length && aKeys.every((key) => deepEqual(a[key], b[key]));
  }
  return false;
}

function joinPath(path: string, key: string): string {
  return path ? `${path}.${key}` : key;
}

function childPath(path: string, index: number): string {
  return `${path}[${index}]`;
}

function declaredTypes(schema: JsonSchema): string[] {
  const type = schema.type;
  if (typeof type === 'string') return [type];
  if (Array.isArray(type)) return type.filter((t): t is string => typeof t === 'string');
  return [];
}

function checkValue(
  value: unknown,
  schema: JsonSchema,
  options: SchemaValidationOptions,
  path: string,
  issues: SchemaValidationIssue[],
): void {
  const types = declaredTypes(schema).filter((t) => (TYPE_NAMES as readonly string[]).includes(t));
  if (types.length > 0 && !types.some((t) => typeMatches(value, t))) {
    const expected = types.join(' | ');
    issues.push({
      path,
      keyword: 'type',
      expected,
      message: path ? `参数 "${path}" 类型应为 ${expected}` : `参数类型应为 ${expected}`,
    });
    // 类型已不符，跳过依赖该类型的后续约束
    return;
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => deepEqual(candidate, value))) {
    const allowed = schema.enum;
    issues.push({
      path,
      keyword: 'enum',
      allowed,
      message: path
        ? `参数 "${path}" 值不在允许范围：${allowed.map((v) => JSON.stringify(v)).join(' / ')}`
        : `参数值不在允许范围：${allowed.map((v) => JSON.stringify(v)).join(' / ')}`,
    });
  }

  if (Array.isArray(value) && schema.items !== undefined) {
    const items = schema.items;
    if (Array.isArray(items)) {
      value.forEach((item, index) => {
        const sub = items[index];
        if (isPlainObject(sub)) checkValue(item, sub, options, childPath(path, index), issues);
      });
    } else if (isPlainObject(items)) {
      value.forEach((item, index) => checkValue(item, items, options, childPath(path, index), issues));
    }
  }

  if (isPlainObject(value)) {
    const properties = isPlainObject(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of required) {
      if (typeof key === 'string' && value[key] === undefined) {
        issues.push({
          path: joinPath(path, key),
          keyword: 'required',
          message: `缺少必填参数 "${joinPath(path, key)}"`,
        });
      }
    }

    for (const [key, rawSub] of Object.entries(properties)) {
      if (value[key] === undefined || !isPlainObject(rawSub)) continue;
      checkValue(value[key], rawSub, options, joinPath(path, key), issues);
    }

    const additional = schema.additionalProperties;
    const rejectUnknown = options.unknownProperties === 'reject' || additional === false;
    for (const key of Object.keys(value)) {
      if (key in properties) continue;
      if (isPlainObject(additional)) {
        checkValue(value[key], additional, options, joinPath(path, key), issues);
      } else if (rejectUnknown) {
        issues.push({
          path: joinPath(path, key),
          keyword: 'additionalProperties',
          message: `参数 "${joinPath(path, key)}" 不是允许的字段`,
        });
      }
    }
  }
}

/**
 * 按 schema 校验 value，返回全部问题（空数组表示通过）。
 * schema 不是普通对象时视为无约束，直接通过。
 */
export function validateSchemaValue(
  value: unknown,
  schema: unknown,
  options: SchemaValidationOptions = {},
): SchemaValidationIssue[] {
  if (!isPlainObject(schema)) return [];
  const issues: SchemaValidationIssue[] = [];
  checkValue(value, schema, options, '', issues);
  return issues;
}

/** 把单条问题格式化为单行文本（调用方拼上工具 id 作为最终错误）。 */
export function formatSchemaIssue(issue: SchemaValidationIssue): string {
  return issue.message;
}
