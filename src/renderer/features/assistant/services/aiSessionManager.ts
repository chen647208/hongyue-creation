/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 渲染端会话管理器：把 core/ai 的 Agent 循环接到应用真实环境——
 * jsonl 落盘（userData/ai-sessions/<bookId>/）、技能目录、工具注册表、
 * 审批 broker 全部在此装配。UI（GlobalAssistant / 审批面板 / 事件浏览器）
 * 只消费这里暴露的会话与状态。
 */
import type {
  AgentTurnResult,
  AiEvent,
  ApprovalBroker,
  ContextInjectionResult,
  ContextTarget,
  InjectionEntry,
  PromptAssembler,
  SessionSink,
  SkillCatalog,
  ToolRegistry,
} from '@core/ai';
import {
  AiSession,
  ApprovalRouter,
  assembleContextInjection,
  buildCitations,
  inferContextTarget,
  registerBuiltinSections,
  runAgentSession,
} from '@core/ai';
import { uuidv7 } from '@core/entities';
import type { EventBus, SeamPolicy } from '@core/plugin';
import { MAX_RETRIEVAL_INJECTION_ENTRIES } from '@shared/constants/aiContext';
import { MIN_SEARCH_QUERY_LENGTH } from '@shared/constants/search';
import type { AIMessageImage, CardPromptTemplate, ConsistencyCheckPromptTemplate, McpServerConfig, ModelConfig, Project } from '@shared/types';

import { useSettingsStore } from '@/app/stores/settingsStore';
import { aiGatewayClient } from '@/shared/services/ai/gatewayClient.js';
import { syncMcpTools } from '@/shared/services/mcpClient';
import { runPluginLogic } from '@/shared/services/pluginService';

import { aiTrialSnapshots } from './aiTrialSnapshotService';
import { buildHistoryText } from './chatHistory.js';
import { runSkillHandler } from './skillHandlerService';

/** 自举：内置 MCP server 走进程内直连（主进程 clientIpc 特判 `builtin`，不 spawn 子进程）。 */
const BUILTIN_MCP_SERVER: McpServerConfig = { id: 'builtin', name: '内置 MCP', command: 'builtin', args: [], enabled: true };

function electron(): NonNullable<Window['electronAPI']> {
  if (!window.electronAPI) {
    throw new Error('ai-sessions: electronAPI 不可用（预览环境无文件系统）');
  }
  return window.electronAPI;
}

/** 会话事件脱敏：写入前遮蔽常见密钥形态，避免明文密钥落盘。 */
const SESSION_SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***'],
  [/AIza[0-9A-Za-z_-]{20,}/g, 'AIza***'],
  [/(Bearer\s+)[A-Za-z0-9._-]{10,}/gi, '$1***'],
  [/("(?:api_?key|token|secret|password|authorization)"\s*:\s*")[^"]*(")/gi, '$1***$2'],
];

export function redactSessionLine(line: string): string {
  return SESSION_SECRET_PATTERNS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), line);
}

/** jsonl 落盘：每条事件追加一行（O(1) 追加，避免整文件重写）。 */
class FileSessionSink implements SessionSink {
  private lines: string[] = [];
  private readonly path: Promise<string>;

  constructor(sessionId: string, bookId: string | undefined) {
    this.path = electron()
      .getAppDataPath()
      .then((base) => `${base}/ai-sessions/${bookId ?? 'no-book'}/${sessionId}.jsonl`)
      .catch(() => Promise.reject(new Error('ai-sessions: 无法解析数据目录')));
  }

  async append(_sessionId: string, line: string): Promise<void> {
    const safeLine = redactSessionLine(line);
    this.lines.push(safeLine);
    try {
      await electron().appendFile(await this.path, `${safeLine}\n`);
    } catch {
      // 落盘失败不阻断会话：事件仍在内存，UI 可读（end 时会再尝试）
    }
  }

  /** 待写入路径（测试/诊断用）。 */
  get targetPath(): Promise<string> {
    return this.path;
  }

  get bufferedLines(): number {
    return this.lines.length;
  }
}

export interface SessionManagerDeps {
  assembler: PromptAssembler;
  registry: ToolRegistry;
  catalog: SkillCatalog;
  broker: ApprovalBroker;
  /** 能力接缝：ai.request 的 inject 策略在装配时注入系统约束 */
  events: EventBus;
}

export interface RunSessionInput {
  bookId?: string;
  task: string;
  project: Project | null | undefined;
  index?: unknown;
  model: ModelConfig;
  /** 备用模型：主模型调用失败（非取消）时按此重试一次。 */
  fallbackModel?: ModelConfig;
  maxTurns?: number;
  signal?: AbortSignal;
  /** 调用方传入的近期对话（已由宿主压缩/截断到阈值内，此处只做最终文本拼装） */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** 附图（仅首轮携带，不进历史） */
  images?: AIMessageImage[];
  /** 用户在助手中选中的卡片模板（Agent 卡片生成沿用，不再回退默认） */
  cardTemplate?: CardPromptTemplate;
  /** 上下文装配目标（章节/选中实体/视图）；缺席时由任务文本推断。 */
  contextTarget?: ContextTarget;
  /** 自动注入总开关；false 时回到纯手动（不注入任何上下文）。 */
  injectionEnabled?: boolean;
  /** 单条关闭的注入条目 id。 */
  disabledInjectionIds?: string[];
}

export class AiSessionManager {
  private readonly assembler: PromptAssembler;
  private readonly registry: ToolRegistry;
  private readonly catalog: SkillCatalog;
  readonly broker: ApprovalBroker;
  private readonly router: ApprovalRouter;
  private lastSession: AiSession | null = null;
  private lastInjection: ContextInjectionResult | null = null;

  private readonly events: EventBus;

  constructor(deps: SessionManagerDeps) {
    this.assembler = deps.assembler;
    this.registry = deps.registry;
    this.catalog = deps.catalog;
    this.broker = deps.broker;
    this.events = deps.events;
    this.router = new ApprovalRouter(deps.broker, (callId, toolId) => {
      // write:direct 直接生效：留审计事件（Revision 由写工具经单一事务管线落库）
      void this.lastSession?.emit({ t: 'write.direct', callId, toolId, at: Date.now() });
    });
    registerBuiltinSections(this.assembler);
  }

  /** 最近一次会话的事件（事件浏览器/诊断消费）。 */
  getEvents(): AiEvent[] {
    return this.lastSession?.events ?? [];
  }

  /** 最近一次会话实际装配的注入上下文（可读、可核对；未跑过会话为 null）。 */
  getLastInjection(): ContextInjectionResult | null {
    return this.lastInjection;
  }

  /** 审批待审箱数量（角标消费）。 */
  get pendingCount(): number {
    return this.broker.pendingCount();
  }

  /**
   * 运行一次完整会话。技能渐进注入：目录按触发词命中后自动激活，
   * 会话结束自动卸载（不跨会话残留）。
   */
  async run(input: RunSessionInput): Promise<AgentTurnResult> {
    // 发行档策略：ai.request 拦截器可整体否决（minimal 档禁全部 AI，公理 4）
    const gate = this.events.request('ai.request', { task: input.task, bookId: input.bookId });
    if (!gate.allowed) {
      return { ok: false, reply: '', turns: 0, error: gate.reason ?? 'AI 请求被发行档策略拒绝' };
    }
    const sessionId = `sess_${Date.now().toString(36)}_${uuidv7()}`;
    const sink = window.electronAPI ? new FileSessionSink(sessionId, input.bookId) : undefined;

    // 渐进注入：触发词命中即激活全文，会话结束在 finally 中卸载
    const suggested = this.catalog.matchByTrigger(input.task);
    if (suggested) this.catalog.activate(suggested.name);

    const session = new AiSession({
      sessionId,
      bookId: input.bookId,
      task: input.task,
      skill: suggested?.name,
      sections: [],
      sink,
    });
    this.lastSession = session;

    // AI 试错门：会话开始前落一份章节快照，会话内可回滚；不写正式历史
    aiTrialSnapshots.begin({
      sessionId,
      bookId: input.bookId,
      label: input.task,
      chapters: input.project?.chapters ?? [],
    });

    // MCP：自举内置 server（进程内直连）+ 本轮启用的外部 server（失败记事件不进聊天）
    if (typeof window !== 'undefined' && window.electronAPI?.mcpClient) {
      try {
        const userServers = (useSettingsStore.getState().mcpServers ?? []).filter((s) => s.enabled);
        const { errors } = await syncMcpTools(this.registry, [BUILTIN_MCP_SERVER, ...userServers]);
        for (const message of errors) {
          await session.emit({ t: 'mcp.sync', ok: false, error: message, at: Date.now() });
        }
      } catch (err) {
        await session.emit({ t: 'mcp.sync', ok: false, error: err instanceof Error ? err.message : String(err), at: Date.now() });
      }
    }

    // 逻辑 hooks（design/22 §3）：接缝命中时沙箱执行，返回文本注入 system 策略
    const aiPolicies = this.events.policiesFor('ai');
    const logicPolicyTexts: string[] = [];
    for (const policy of aiPolicies) {
      if (policy.do === 'logic') {
        const r = await runPluginLogic(policy.pluginId, policy.fn, { task: input.task });
        if (r.ok && typeof r.output === 'string' && r.output) logicPolicyTexts.push(r.output);
      }
    }

    // 自动上下文注入（design/37）：按目标装配、逐字校验、预算裁剪；关闭时不做任何注入
    const injection = assembleContextInjection({
      project: input.project,
      target: input.contextTarget ?? inferContextTarget(input.project, input.task),
      enabled: input.injectionEnabled !== false,
      disabledIds: input.disabledInjectionIds,
      extraEntries: await this.collectRetrievalEntries(input.project?.id, input.task),
    });
    this.lastInjection = injection;

    try {
      const result = await runAgentSession(
        {
          assembler: this.assembler,
          registry: this.registry,
          router: this.router,
          session,
          model: input.model,
          images: input.images,
          context: () => ({
            project: input.project,
            index: input.index,
            activeSkill: this.catalog.getActive(),
            activeSkillTools: this.catalog.getActive()?.tools,
            // 工具执行上下文：模型配置与宿主服务在此注入（缺失则需模型的工具直接失败）
            modelConfig: input.model,
            services: {
              consistencyTemplates: toConsistencyRecord(useSettingsStore.getState().consistencyPrompts),
              cardTemplate: input.cardTemplate,
              // 全文检索（SQLite FTS5）：延迟加载仓库，测试与预览环境不预付成本；
              // 检索用于装配设定/素材上下文，素材命中优先返回。
              textSearch: async (query: string, limit: number) => {
                const { repository } = await import('@/shared/services/repository/index.js');
                return repository.search(query, { projectId: input.project?.id, limit, preferMaterial: true });
              },
              // 语义检索（向量库 + 嵌入，自动降级）：不可用返回空数组，工具层如实回填
              semanticSearch: async (query: string, limit: number) => {
                const projectId = input.project?.id;
                if (!projectId) throw new Error('当前没有打开的书籍项目');
                const { vectorIntegrationService } = await import(
                  '@/shared/services/knowledge/vectorIntegrationService'
                );
                const hits = await vectorIntegrationService.semanticSearchKnowledge(projectId, query, { limit });
                return hits.map((h) => ({
                  name: h.metadata?.name,
                  category: h.metadata?.category,
                  score: h.score,
                  content: h.content.slice(0, 800),
                }));
              },
              // 技能按名加载（会话内状态变更，不碰数据；激活后白名单对后续轮次生效）
              skillLoad: (name: string) => this.catalog.activate(name),
              // 双轨技能逻辑轨：沙箱执行 + 能力白名单裁决（handler 只能建议工具调用）
              skillRun: (name: string, skillInput: unknown) => {
                const skill = this.catalog.get(name);
                if (!skill) {
                  return Promise.resolve({ ok: false, error: { kind: 'runtime', message: `没有名为“${name}”的技能` } });
                }
                return runSkillHandler(skill, skillInput);
              },
              // 插件逻辑贡献：沙箱执行 + 能力裁决（design/22 §3）
              pluginRun: (pluginId: string, fn: string, pluginInput: unknown) => runPluginLogic(pluginId, fn, pluginInput),
            },
            extra: {
              // 会话历史：宿主截断后的最近 N 轮，经 history section 注入（空即跳过）
              historyText: buildHistoryText(input.history ?? []) || undefined,
              // 自动注入的上下文（contextInjection section 消费；关闭时为空结果）
              injection,
              // 技能清单常驻 prompt（渐进加载：清单一直可见，全文按需 core.skill.load）
              skillManifest: this.catalog.manifest() ?? undefined,
              aiPolicies: [
                ...aiPolicies
                  .filter((p): p is SeamPolicy & { do: 'inject'; where: 'system'; text: string } => p.do === 'inject' && p.where === 'system')
                  .map((p) => p.text),
                ...logicPolicyTexts,
              ],
            },
          }),
      complete: async (model, prompt, retries) => {
        const primary = await aiGatewayClient.complete(model, prompt, { retries, signal: input.signal, images: input.images, feature: 'assistant' });
        // 主模型失败（非取消）且有备用模型且不同款时，按备用模型重试一次
        if (primary.error && !input.signal?.aborted && input.fallbackModel && input.fallbackModel.id !== model.id) {
          const fallback = await aiGatewayClient.complete(input.fallbackModel, prompt, { retries, signal: input.signal, images: input.images, feature: 'assistant' });
          if (!fallback.error) return fallback;
        }
        return primary;
      },
          maxTurns: input.maxTurns,
          signal: input.signal,
          // 首轮预算 24000 字符（约 8–12k token，32k 上下文模型留足工具观察与输出空间）
          charBudget: 24000,
          // session.start 之后补记注入元事件（审计/事件浏览器可见），不打断 start 首事件语义
          onStarted: () => session.emit({
            t: 'context.injection',
            enabled: injection.enabled,
            entries: injection.entries.length,
            dropped: injection.dropped.length,
            totalChars: injection.totalChars,
            budgetChars: injection.budgetChars,
            at: Date.now(),
          }),
        },
        input.task,
      );
      return result;
    } finally {
      this.catalog.deactivate();
    }
  }

  /**
   * 全文检索命中转注入条目：来源即出处（章节/知识库），供装配阶段参与预算与溯源。
   * 检索不可用或查询过短时返回空数组（注入仍可走内置规划）。
   */
  private async collectRetrievalEntries(projectId: string | undefined, task: string): Promise<InjectionEntry[]> {
    const query = task.trim();
    if (!projectId || query.length < MIN_SEARCH_QUERY_LENGTH) return [];
    try {
      const { repository } = await import('@/shared/services/repository/index.js');
      const hits = await repository.search(query, {
        projectId,
        limit: MAX_RETRIEVAL_INJECTION_ENTRIES,
        preferMaterial: true,
      });
      return buildCitations(hits).map((citation) => ({
        id: `search:${citation.anchor}`,
        title: `检索命中：${citation.title}`,
        text: citation.snippet,
        source: { kind: citation.sourceKind, refId: citation.refId, title: citation.title, locator: '全文检索命中' },
        trigger: '全文检索',
        priority: 60,
        scope: 'book' as const,
      }));
    } catch {
      return [];
    }
  }

}

/** 一致性模板数组转工具要的 record（与一致性检查页同口径：按 category 建键）。 */
function toConsistencyRecord(
  prompts: ConsistencyCheckPromptTemplate[],
): Record<string, ConsistencyCheckPromptTemplate> {
  const record: Record<string, ConsistencyCheckPromptTemplate> = {};
  for (const p of prompts) record[p.category] = p;
  return record;
}

/** 装配默认会话管理器（App 启动时创建一次；M3 插件在此续注工具/section/技能）。 */
export function createSessionManager(deps: SessionManagerDeps): AiSessionManager {
  return new AiSessionManager(deps);
}

export type { SkillCatalog, ToolRegistry };
