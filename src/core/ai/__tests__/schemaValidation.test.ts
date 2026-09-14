/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect, it } from 'vitest';

import { formatSchemaIssue, type JsonSchema, type SchemaValidationIssue, validateSchemaValue } from '../schemaValidation.js';

/** 断言恰好一条问题并返回它（测试聚焦单点失败）。 */
function only(issues: SchemaValidationIssue[]): SchemaValidationIssue {
  expect(issues).toHaveLength(1);
  return issues[0]!;
}

const schema: JsonSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: { type: 'integer' },
    active: { type: 'boolean' },
    role: { type: 'string', enum: ['hero', 'villain'] },
    tags: { type: 'array', items: { type: 'string' } },
    profile: {
      type: 'object',
      properties: { city: { type: 'string' }, score: { type: 'number' } },
      required: ['city'],
    },
  },
  required: ['name', 'role'],
};

describe('validateSchemaValue', () => {
  it('合法参数通过', () => {
    const issues = validateSchemaValue(
      {
        name: '阿月',
        age: 3,
        active: true,
        role: 'hero',
        tags: ['a', 'b'],
        profile: { city: '长安', score: 9.5 },
      },
      schema,
    );
    expect(issues).toEqual([]);
  });

  it('缺必填项报告 required 与字段路径', () => {
    const issue = only(validateSchemaValue({ role: 'hero' }, schema));
    expect(issue.keyword).toBe('required');
    expect(issue.path).toBe('name');
    expect(formatSchemaIssue(issue)).toContain('缺少必填参数 "name"');
  });

  it('类型错误报告 type 与期望类型', () => {
    const issue = only(validateSchemaValue({ name: 123, role: 'hero' }, schema));
    expect(issue.keyword).toBe('type');
    expect(issue.path).toBe('name');
    expect(issue.expected).toBe('string');
    expect(issue.message).toContain('类型应为 string');
  });

  it('integer 拒绝小数、number 接受整数', () => {
    const bad = validateSchemaValue({ name: 'x', role: 'hero', age: 1.5 }, schema);
    expect(bad.map((i) => i.path)).toEqual(['age']);
    expect(bad[0]?.expected).toBe('integer');

    const good = validateSchemaValue(
      { name: 'x', role: 'hero', age: 2, profile: { city: 'c', score: 3 } },
      schema,
    );
    expect(good).toEqual([]);
  });

  it('枚举越界报告 enum 与允许取值', () => {
    const issue = only(validateSchemaValue({ name: 'x', role: 'narrator' }, schema));
    expect(issue.keyword).toBe('enum');
    expect(issue.path).toBe('role');
    expect(issue.allowed).toEqual(['hero', 'villain']);
    expect(issue.message).toContain('不在允许范围');
  });

  it('数组元素按 items 校验并带下标路径', () => {
    const issue = only(validateSchemaValue({ name: 'x', role: 'hero', tags: ['ok', 7] }, schema));
    expect(issue.path).toBe('tags[1]');
    expect(issue.keyword).toBe('type');
  });

  it('嵌套对象字段报告点分路径', () => {
    const issues = validateSchemaValue({ name: 'x', role: 'hero', profile: { score: '高' } }, schema);
    expect(issues.map((i) => i.path).sort()).toEqual(['profile.city', 'profile.score']);
    expect(issues.find((i) => i.path === 'profile.score')?.message).toContain('类型应为 number');
  });

  it('未知字段默认放行，additionalProperties:false 时拒绝', () => {
    const value = { name: 'x', role: 'hero', extra: 1 };
    expect(validateSchemaValue(value, schema)).toEqual([]);

    const strict: JsonSchema = { ...schema, additionalProperties: false };
    const issue = only(validateSchemaValue(value, strict));
    expect(issue.keyword).toBe('additionalProperties');
    expect(issue.path).toBe('extra');
  });

  it('type 为字符串数组时按联合类型判定', () => {
    const union: JsonSchema = { type: 'object', properties: { id: { type: ['string', 'number'] } } };
    expect(validateSchemaValue({ id: 'a' }, union)).toEqual([]);
    expect(validateSchemaValue({ id: 2 }, union)).toEqual([]);
    const issue = only(validateSchemaValue({ id: true }, union));
    expect(issue.expected).toBe('string | number');
  });

  it('非对象 schema 视为无约束', () => {
    expect(validateSchemaValue({ any: true }, undefined)).toEqual([]);
    expect(validateSchemaValue({ any: true }, 'not-a-schema')).toEqual([]);
  });
});
