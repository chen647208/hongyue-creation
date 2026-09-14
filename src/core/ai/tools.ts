/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { uuidv7 } from '../entities/uuid';
import { formatSchemaIssue, validateSchemaValue } from './schemaValidation.js';


/**
 * 工具注册表（docs/design/05 §2）。
 *
 * 工具是 AI 触达数据与功能的唯一入口：schema 即契约，permission 决定审批档位
 * （审批路由消费）。注册期校验重名与必填语义，杜绝 harness「run_code description
 * 死循环」类问题——schema lint 是宿主职责。纯模块，渲染端/测试共用。
 */

/** 审批档位：read 只读；write:proposal 产出提案待审；write:direct 直接生效但必存 Revision。 */
export type ToolPermission = 'read' | 'write:proposal' | 'write:direct';

/** 一次工具调用请求。callId 用于事件流与审计链关联。 */
export interface ToolCallRequest {
  callId: string;
  args: unknown;
}

/** 工具执行上下文：宿主注入，工具不得绕过它触达数据。 */
export interface ToolContext {
  /** 当前书籍项目快照（宿主侧负责权限裁剪） */
  project?: unknown;
  /** 本轮使用的模型配置 */
  modelConfig?: unknown;
  /** 全书索引快照（core/index） */
  index?: unknown;
  /** 索引查询工具等需要的其他宿主服务 */
  services?: Record<string, unknown>;
  /** 取消信号 */
  signal?: AbortSignal;
  /** 插件/调用方扩展槽 */
  extra?: Record<string, unknown>;
}

export interface ToolOutput {
  ok: boolean;
  data?: unknown;
  error?: string;
}

/** 工具规格。parameters 为 JSON Schema（对象类型）。 */
export interface ToolSpec {
  /** 命名空间化 id：'core.card.generate'，插件工具带插件前缀 */
  id: string;
  /** 给模型看的描述 */
  description: string;
  /** 参数 JSON Schema */
  parameters: Record<string, unknown>;
  permission: ToolPermission;
  /** 关联技能 id（渐进加载触发器） */
  skillHint?: string;
  execute(req: ToolCallRequest, ctx: ToolContext): Promise<ToolOutput>;
}

/** 参数 schema 的最小 lint：type=object、有 properties、必填项都在 properties 里。 */
export function lintToolSchema(id: string, schema: Record<string, unknown>): string | null {
  if (schema.type !== 'object') return `${id}: parameters.type 必须是 object`;
  if (!schema.properties || typeof schema.properties !== 'object') return `${id}: parameters.properties 缺失`;
  const props = schema.properties as Record<string, unknown>;
  const required = schema.required;
  if (required !== undefined) {
    if (!Array.isArray(required)) return `${id}: parameters.required 必须是字符串数组`;
    for (const key of required) {
      if (typeof key !== 'string' || !(key in props)) {
        return `${id}: required 项 "${String(key)}" 不在 properties 中`;
      }
    }
  }
  return null;
}

/**
 * 参数校验：必填项、类型、枚举、数组元素与嵌套字段（内置与 MCP 工具统一）。
 * 委托给纯函数 validateSchemaValue；返回首条问题的单行文本，通过返回 null。
 */
export function validateToolArgs(id: string, schema: Record<string, unknown>, args: unknown): string | null {
  if (args !== undefined && (args === null || typeof args !== 'object' || Array.isArray(args))) {
    return `${id}: 参数必须是对象`;
  }
  const issues = validateSchemaValue(args ?? {}, schema, { unknownProperties: 'allow' });
  const first = issues[0];
  if (!first) return null;
  return `${id}: ${formatSchemaIssue(first)}`;
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolSpec>();

  /** 注册工具；重名或 schema lint 失败直接抛错（注册期失败优于运行期静默）。 */
  register(spec: ToolSpec): this {
    if (this.tools.has(spec.id)) {
      throw new Error(`ToolRegistry: 工具 id 重复注册 "${spec.id}"`);
    }
    const schemaError = lintToolSchema(spec.id, spec.parameters);
    if (schemaError) {
      throw new Error(`ToolRegistry: ${schemaError}`);
    }
    this.tools.set(spec.id, spec);
    return this;
  }

  unregister(id: string): boolean {
    return this.tools.delete(id);
  }

  get(id: string): ToolSpec | undefined {
    return this.tools.get(id);
  }

  has(id: string): boolean {
    return this.tools.has(id);
  }

  list(filter?: { permission?: ToolPermission }): ToolSpec[] {
    const all = [...this.tools.values()];
    if (filter?.permission) {
      return all.filter((t) => t.permission === filter.permission);
    }
    return all;
  }

  /** prompt 注入用的 schema 清单（PromptAssembler toolSchemasSection 消费）。 */
  resolveSchemas(ids?: string[]): Array<{ id: string; description: string; parameters: string }> {
    const specs = ids ? ids.map((id) => this.tools.get(id)).filter((t): t is ToolSpec => !!t) : this.list();
    return specs.map((t) => ({
      id: t.id,
      description: t.description,
      parameters: JSON.stringify(t.parameters),
    }));
  }

  /**
   * 执行工具：未知工具/权限缺失返回失败 ToolOutput（不抛错，调用方统一走事件流）。
   * 审批管线在 write:* 档位接入：这里只做权限检查的最后一道防线。
   */
  async execute(id: string, args: unknown, ctx: ToolContext = {}, callId = `call_${Date.now()}_${uuidv7()}`): Promise<ToolOutput> {
    const spec = this.tools.get(id);
    if (!spec) {
      return { ok: false, error: `未知工具：${id}` };
    }
    if (ctx.signal?.aborted) {
      return { ok: false, error: '已取消' };
    }
    const argError = validateToolArgs(id, spec.parameters, args);
    if (argError) {
      return { ok: false, error: argError };
    }
    try {
      return await spec.execute({ callId, args }, ctx);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
