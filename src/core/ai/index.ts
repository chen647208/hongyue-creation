/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** core/ai 编排层出口（docs/design/05 §1）：prompt 装配器 + 工具注册表 + 内置 sections。 */
export {
  type AgentLoopDeps,
  type AgentTurnResult,
  type AgentTurnToolCall,
  parseAgentReply,
  runAgentSession,
} from './agentLoop.js';
export {
  ApprovalBroker,
  type ApprovalDecision,
  type ApprovalProposal,
  type ApprovalRequest,
  ApprovalRouter,
  type ApprovalVerdict,
  type McpProposalExec,
  type PendingApproval,
} from './approval.js';
export {
  activeSkillSection,
  aiPolicySection,
  bookMetaSection,
  contextInjectionSection,
  historySection,
  identitySection,
  indexDigestSection,
  registerBuiltinSections,
  renderIndexDigest,
  renderWorldDigest,
  toolSchemasSection,
  userTaskSection,
  type WorldDigestOptions,
  worldDigestSection,
} from './builtinSections.js';
export {
  assembleContextInjection,
  composeContextTarget,
  type ContextInjectionInput,
  type ContextInjectionResult,
  type ContextTarget,
  type DroppedInjection,
  type EditorContext,
  inferContextTarget,
  type InjectionEntry,
  type InjectionScope,
  type InjectionSource,
  type InjectionSourceKind,
  planContextInjection,
  renderContextInjection,
} from './contextInjection.js';
export {
  buildCitations,
  type Citation,
  type CitationHitLike,
  type CitationSourceKind,
  describeRetrieval,
  formatNoRetrieval,
  quoteAppearsExactly,
  renderCitations,
  type RetrievalOutcome,
  stripSnippetMarkers,
  toCitation,
} from './grounding.js';
export {
  type InferenceDecisionInput,
  type InferenceTarget,
  inferLocalFlavor,
  type LocalModelInfo,
  localModelsUrl,
  type LocalProbeResult,
  type LocalRuntimeConfig,
  type LocalRuntimeFlavor,
  normalizeLocalEndpoint,
  parseLocalModels,
  probeLocalEndpoint,
  resolveInferenceTarget,
} from './localInference.js';
export {
  type AssembleResult,
  PromptAssembler,
  type PromptContext,
  type PromptSection,
  truncateText,
} from './promptAssembler.js';
export {
  type AiEvent,
  AiSession,
  parseEventLine,
  serializeEvent,
  type SessionOptions,
  type SessionSink,
} from './session.js';
export {
  hashContent,
  type ParsedSkillFile,
  parseSkillMd,
  type Skill,
  SkillCatalog,
  type SkillCatalogOptions,
  type SkillHandler,
  type SkillParseError,
} from './skills.js';
export {
  lintToolSchema,
  type ToolCallRequest,
  type ToolContext,
  type ToolOutput,
  type ToolPermission,
  ToolRegistry,
  type ToolSpec,
} from './tools.js';
export {
  DEFAULT_UNTRUSTED_LIMIT,
  fenceUntrusted,
  isFenced,
  sanitizeUntrusted,
  stripFence,
  UNTRUSTED_BEGIN,
  UNTRUSTED_END,
  type UntrustedMeta,
} from './untrusted.js';
