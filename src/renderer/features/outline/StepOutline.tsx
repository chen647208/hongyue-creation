/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { Check, CheckCheck, Eye, ListTree, Pause, Pencil, PenLine, Play, Square, Users, XCircle } from 'lucide-react';
import React, { useMemo, useRef,useState } from 'react';

import { type CommitOptions,useProjectStore } from '@/app/stores/projectStore';
import { useSettingsStore, useUsableModel } from '@/app/stores/settingsStore';
import { DslEditor } from '@/editor/cm6/DslEditor';
import { collectProjectTags } from '@/editor/cm6/projectTags';
import { templateDisplayName,useTranslation } from '@/i18n';
import { AIService } from '@/shared/services/ai/aiService';
import { dialogService } from '@/shared/services/dialogService';
import { resolveTheme } from '@/shared/services/themeService';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { MarkdownView } from '@/shared/ui/Markdown';
import { Select } from '@/shared/ui/Select';
import { Spinner } from '@/shared/ui/Spinner';
import { cn } from '@/shared/utils/cn';
import { roleLabel } from '@/shared/utils/displayLabels';
import { isModelUsable } from '@/shared/utils/modelReadiness';

import { KNOWLEDGE_SNIPPET_TRUNCATE,VIRTUAL_CHAPTER_ORDER } from '../../../shared/constants/chapters';
import { type OutputMode,type Project, type StreamingAIResponse } from '../../../shared/types';

interface StepOutlineProps {
  project: Project;
}

const StepOutline: React.FC<StepOutlineProps> = ({ project }) => {
  const { t } = useTranslation(['steps', 'common']);
  // 直读 store：死掉的 onOpenSettings 透传一并删除
  const prompts = useSettingsStore((s) => s.prompts);
  const activeModel = useUsableModel();
  const updateActiveProject = useProjectStore((s) => s.updateActiveProject);
  const onUpdate = (updates: Partial<Project>, opts?: CommitOptions) => updateActiveProject(updates, opts);
  const [loading, setLoading] = useState(false);
  const outlinePrompts = useMemo(() => prompts.filter(p => p.category === 'outline'), [prompts]);
  const [selectedPromptId, setSelectedPromptId] = useState(outlinePrompts[0]?.id || '');
  
  // 输出模式状态
  const [outputMode, setOutputMode] = useState<OutputMode>('streaming');
  
  // 流式输出状态
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingTokens, setStreamingTokens] = useState({ prompt: 0, completion: 0, total: 0 });
  const [isComplete, setIsComplete] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // 传统输出token状态
  const [traditionalTokens, setTraditionalTokens] = useState({ prompt: 0, completion: 0, total: 0 });
  
  // Knowledge Base Selection State
  const [selectedKnowledgeIds, setSelectedKnowledgeIds] = useState<Set<string>>(new Set());
  
  // 直接读取结果或使用流式内容
  const outlineContent = isStreaming ? streamingContent : (project.outline || '');
  // 预览（Markdown 渲染）⇄ 编辑（textarea）切换；有内容时默认预览
  const [outlineEditing, setOutlineEditing] = useState(false);
  // 大纲 DSL 编辑器的合法标签集（人物/地点/势力名），驱动 @tag 校验与 [[链接]] 补全
  const outlineTags = useMemo(() => collectProjectTags(project), [project]);
  const theme = useSettingsStore((s) => s.theme);
  const isDark = resolveTheme(theme) === 'dark';

  // 流式回调处理函数
  const handleStreamingChunk = (response: StreamingAIResponse, finalPrompt?: string) => {
    // 无模型时不该进到这里（generateOutline 已拦截）：中途停用则复位转圈态，避免常亮卡死
    if (!isModelUsable(activeModel)) {
      setIsStreaming(false);
      setLoading(false);
      return;
    }
    // 契约：response.content 为累计全文，直接替换（旧实现按增量累加导致内容重复）
    if (response.content) {
      setStreamingContent(response.content);
    }
    if (response.tokens) {
      setStreamingTokens(response.tokens);
    }
    if (response.isComplete) {
      setIsComplete(true);
      setIsStreaming(false);
      setLoading(false);

      // 出错时不写入项目数据，避免用空/残缺内容覆盖已有大纲
      if (response.error) {
        dialogService.alert(t('steps:common.generateFailed', { error: response.error }));
        return;
      }
      
      // 流式完成后更新项目数据
      const finalContent = response.content || streamingContent;
      onUpdate({ outline: finalContent }, { agentId: 'ai:outline', cause: selectedPromptId });
      
      // 创建AI历史记录（流式输出模式）
      if (finalPrompt) {
        const historyRecord = AIService.buildHistoryRecordData(
          'outline-virtual-chapter', // 虚拟章节ID
          finalPrompt,
          finalContent,
          activeModel,
          response,
          {
            templateName: templateDisplayName(prompts.find(p => p.id === selectedPromptId) ?? { name: t('steps:outline.defaultTemplateName') }),
            batchGeneration: false,
            chapterTitle: t('steps:outline.chapterTitle')
          }
        );
        
        // 将历史记录添加到虚拟章节
        const updatedVirtualChapters = project.virtualChapters || [];
        const outlineChapter = updatedVirtualChapters.find(c => c.id === 'outline-virtual-chapter') || {
          id: 'outline-virtual-chapter',
          title: t('steps:outline.chapterTitle'),
          summary: t('steps:outline.historySummary'),
          content: '',
          order: VIRTUAL_CHAPTER_ORDER, // 特殊顺序，使其不在章节列表中显示
          history: []
        };
        
        const existingHistory = outlineChapter.history || [];
        const updatedOutlineChapter = {
          ...outlineChapter,
          history: [...existingHistory, historyRecord]
        };
        
        // 更新虚拟章节列表
        const finalVirtualChapters = updatedVirtualChapters.filter(c => c.id !== 'outline-virtual-chapter');
        finalVirtualChapters.unshift(updatedOutlineChapter);
        
        // 更新项目数据，包含更新后的虚拟章节
        onUpdate({
          outline: finalContent,
          virtualChapters: finalVirtualChapters
        }, { agentId: 'ai:outline', cause: selectedPromptId });
      }
    }
  };

  // 暂停/继续流式输出
  const togglePauseStreaming = () => {
    setIsPaused(!isPaused);
  };

  // 停止流式输出
  const stopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setIsComplete(false);
    setLoading(false);
  };

  const generateOutline = async () => {
    if (!isModelUsable(activeModel)) {
      dialogService.alert(t('steps:common.noModel'));
      return;
    }
    // 重置状态 - 先重置传统模式token，但保留流式状态直到流式开始
    setTraditionalTokens({ prompt: 0, completion: 0, total: 0 });
    setIsPaused(false);
    // 生成时切回预览，流式内容以 Markdown 格式化实时呈现
    setOutlineEditing(false);
    
    setLoading(true);
    const template = prompts.find(p => p.id === selectedPromptId)?.content || '';
    
    // Build a richer character context
    const charDetails = project.characters.map(c =>
      t('steps:prompt.charDetail', { name: c.name, role: roleLabel(c.role), personality: c.personality, background: c.background, relationships: c.relationships })
    ).join('\n\n');

    let finalPrompt = template
      .replace('{title}', project.title)
      .replace('{intro}', project.intro)
      .replace('{characters}', charDetails);

    // Inject Knowledge
    if (selectedKnowledgeIds.size > 0) {
       const kContent = project.knowledge
         .filter(k => selectedKnowledgeIds.has(k.id))
         .map(k => t('steps:prompt.knowledgeRef', { name: k.name, content: k.content.substring(0, KNOWLEDGE_SNIPPET_TRUNCATE) }))
         .join('\n\n');
       if (kContent) finalPrompt += t('steps:prompt.knowledgeHeader', { content: kContent });
    }

    // 根据用户选择的输出模式决定调用方式
    if (outputMode === 'streaming' && activeModel.supportsStreaming !== false) {
      // 使用流式输出 - 先重置流式状态，然后开始流式
      setStreamingContent('');
      setStreamingTokens({ prompt: 0, completion: 0, total: 0 });
      setIsComplete(false);
      setIsStreaming(true);
      
      // 创建AbortController用于取消请求
      abortControllerRef.current = new AbortController();
      
      try {
        await AIService.callStreaming(activeModel, finalPrompt, (response) => handleStreamingChunk(response, finalPrompt), { signal: abortControllerRef.current.signal });
      } catch (error) {
        if (!(error instanceof Error && error.name === 'AbortError')) {
          dialogService.alert(t('steps:outline.streamGenerateFailed', { error: error instanceof Error ? error.message : t('steps:common.unknownError') }));
          setIsStreaming(false);
          setLoading(false);
        }
      }
    } else {
      // 使用传统输出或模型不支持流式时回退
      const result = await AIService.call(activeModel, finalPrompt);
      if (result.error) {
        dialogService.alert(t('steps:common.generateFailed', { error: result.error }));
        setLoading(false);
        return;
      }
      
      // 保存传统输出模式的token信息
      if (result.tokens) {
        setTraditionalTokens(result.tokens);
      }
      
      // 创建AI历史记录
      const historyRecord = AIService.buildHistoryRecordData(
        'outline-virtual-chapter', // 虚拟章节ID
        finalPrompt,
        result.content,
        activeModel,
        result,
        {
          templateName: templateDisplayName(prompts.find(p => p.id === selectedPromptId) ?? { name: t('steps:outline.defaultTemplateName') }),
          batchGeneration: false,
          chapterTitle: t('steps:outline.chapterTitle')
        }
      );
      
      // 将历史记录添加到虚拟章节
      const updatedVirtualChapters = project.virtualChapters || [];
      const outlineChapter = updatedVirtualChapters.find(c => c.id === 'outline-virtual-chapter') || {
        id: 'outline-virtual-chapter',
        title: t('steps:outline.chapterTitle'),
        summary: t('steps:outline.historySummary'),
        content: '',
        order: VIRTUAL_CHAPTER_ORDER, // 特殊顺序，使其不在章节列表中显示
        history: []
      };
      
      const existingHistory = outlineChapter.history || [];
      const updatedOutlineChapter = {
        ...outlineChapter,
        history: [...existingHistory, historyRecord]
      };
      
      // 更新虚拟章节列表
      const finalVirtualChapters = updatedVirtualChapters.filter(c => c.id !== 'outline-virtual-chapter');
      finalVirtualChapters.unshift(updatedOutlineChapter);
      
      // 更新项目数据
      onUpdate({
        outline: result.content,
        virtualChapters: finalVirtualChapters
      }, { agentId: 'ai:outline', cause: selectedPromptId });
      
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-7xl flex-col gap-6 overflow-hidden p-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <h2 className="font-serif text-2xl font-semibold tracking-tight">{t('steps:outline.title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('steps:outline.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={selectedPromptId}
            onChange={(e) => setSelectedPromptId(e.target.value)}
            className="h-9 w-auto"
            aria-label={t('steps:common.promptTemplate')}
          >
            {outlinePrompts.map(p => <option key={p.id} value={p.id}>{templateDisplayName(p)}</option>)}
          </Select>

          {/* 输出模式选择器 */}
          <Select
            value={outputMode}
            onChange={(e) => setOutputMode(e.target.value as OutputMode)}
            className="h-9 w-auto"
            aria-label={t('steps:common.outputMode')}
          >
            <option value="streaming">{t('steps:common.streaming')}</option>
            <option value="traditional">{t('steps:common.traditional')}</option>
          </Select>

          {/* 流式控制按钮组 */}
          {isStreaming ? (
            <>
              <Button variant="outline" onClick={togglePauseStreaming}>
                {isPaused ? <Play className="size-4" /> : <Pause className="size-4" />}
                {isPaused ? t('steps:outline.resumeGen') : t('steps:outline.pauseGen')}
              </Button>
              <Button variant="destructive" onClick={stopStreaming}>
                <Square className="size-4" />
                {t('steps:outline.stopGen')}
              </Button>
            </>
          ) : (
            <Button onClick={generateOutline} disabled={loading || !isModelUsable(activeModel)} title={!isModelUsable(activeModel) ? t('steps:common.noModel') : undefined}>
              {loading ? <Spinner className="size-4" /> : <ListTree className="size-4" />}
              {loading ? t('steps:outline.generating') : t('steps:outline.generateBtn')}
            </Button>
          )}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-hidden lg:grid-cols-12">
        {/* Left: Character & Story Reference */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- 滚动容器需键盘可聚焦，满足 axe scrollable-region-focusable */}
        <div className="space-y-4 overflow-y-auto pr-1 lg:col-span-4" role="region" tabIndex={0} aria-label={t('steps:outline.contextTitle')}>
          <Card className="p-5">
            <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('steps:outline.contextTitle')}</h4>
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted/40 p-3">
                <span className="mb-0.5 block text-2xs uppercase tracking-wider text-muted-foreground">{t('steps:outline.workTitle')}</span>
                <p className="font-serif text-sm font-medium">{project.title}</p>
              </div>
              <div className="rounded-md border border-border bg-muted/40 p-3">
                <span className="mb-0.5 block text-2xs uppercase tracking-wider text-muted-foreground">{t('steps:outline.storyCore')}</span>
                <p className="line-clamp-6 text-xs leading-relaxed text-muted-foreground">{project.intro}</p>
              </div>
            </div>
          </Card>

          {/* Knowledge Base Selection Card */}
          <Card className="p-5">
             <div className="mb-3 flex items-center justify-between">
                <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('steps:outline.knowledgeTitle')}</h4>
                {(project.knowledge || []).filter(k => k.category === 'outline').length > 0 && (
                   <div className="flex gap-1">
                      <Button
                         variant="ghost"
                         size="sm"
                         className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                         onClick={() => {
                            const allIds = (project.knowledge || [])
                              .filter(k => k.category === 'outline')
                              .map(k => k.id);
                            setSelectedKnowledgeIds(new Set(allIds));
                         }}
                         title={t('steps:common.selectAllTitle')}
                      >
                         <CheckCheck className="size-3" /> {t('steps:common.selectAll')}
                      </Button>
                      <Button
                         variant="ghost"
                         size="sm"
                         className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                         onClick={() => setSelectedKnowledgeIds(new Set())}
                         title={t('steps:common.clearTitle')}
                      >
                         <XCircle className="size-3" /> {t('steps:common.clear')}
                      </Button>
                   </div>
                )}
             </div>
             <div className="max-h-48 space-y-1.5 overflow-y-auto">
                {(project.knowledge || []).filter(k => k.category === 'outline').length === 0 ? <p className="text-xs italic text-muted-foreground">{t('steps:common.noMaterial')}</p> :
                  project.knowledge.filter(k => k.category === 'outline').map(k => (
                     <div
                        key={k.id}
                        onClick={() => {
                           const newSet = new Set(selectedKnowledgeIds);
                           if (newSet.has(k.id)) newSet.delete(k.id); else newSet.add(k.id);
                           setSelectedKnowledgeIds(newSet);
                        }}
                        className={cn(
                          'flex cursor-pointer items-center gap-2.5 rounded-md border p-2.5 transition-colors',
                          selectedKnowledgeIds.has(k.id)
                            ? 'border-primary/40 bg-primary/5'
                            : 'border-border hover:bg-muted'
                        )}
                     >
                        <span className={cn(
                          'flex size-4 shrink-0 items-center justify-center rounded border',
                          selectedKnowledgeIds.has(k.id) ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'
                        )}>
                           {selectedKnowledgeIds.has(k.id) && <Check className="size-3" />}
                        </span>
                        <span className={cn('truncate text-xs', selectedKnowledgeIds.has(k.id) ? 'font-medium text-foreground' : 'text-muted-foreground')}>{k.name}</span>
                     </div>
                  ))
                }
             </div>
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('steps:outline.charactersTitle', { count: project.characters.length })}</h4>
              <Users className="size-4 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              {project.characters.length === 0 ? (
                <p className="text-xs italic text-muted-foreground">{t('steps:outline.noCharactersHint')}</p>
              ) : (
                project.characters.map(c => (
                  <div key={c.id} className="rounded-md border border-border bg-muted/40 p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-serif text-sm font-medium">{c.name}</span>
                      <Badge variant="outline">{roleLabel(c.role)}</Badge>
                    </div>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{c.personality}</p>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Right: Outline Editor */}
        <div className="flex min-h-0 flex-col overflow-hidden lg:col-span-8">
          <Card className="flex h-full flex-col overflow-hidden rounded-lg">
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/30 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <PenLine className="size-3.5 text-muted-foreground" />
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('steps:outline.editorTitle')}</span>
              </div>
              <div className="flex items-center gap-4">
                {/* Token信息显示 */}
                {(isStreaming || isComplete || (outputMode === 'traditional' && traditionalTokens.total > 0)) && (
                  <div className="flex items-center gap-3 text-xs tabular-nums">
                    <span className="text-muted-foreground">{t('steps:common.input')} <span className="font-medium text-foreground">{isStreaming || isComplete ? streamingTokens.prompt : traditionalTokens.prompt}</span></span>
                    <span className="text-muted-foreground">{t('steps:common.output')} <span className="font-medium text-foreground">{isStreaming || isComplete ? streamingTokens.completion : traditionalTokens.completion}</span></span>
                    <span className="text-muted-foreground">{t('steps:common.total')} <span className="font-medium text-foreground">{isStreaming || isComplete ? streamingTokens.total : traditionalTokens.total}</span></span>
                    {isStreaming && <span className="size-1.5 animate-pulse rounded-full bg-success" />}
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-2 text-xs text-muted-foreground"
                  onClick={() => setOutlineEditing(v => !v)}
                  disabled={!outlineContent}
                  title={outlineEditing ? t('steps:common.preview') : t('steps:common.edit')}
                >
                  {outlineEditing ? <Eye className="size-3.5" /> : <Pencil className="size-3.5" />}
                  {outlineEditing ? t('steps:common.preview') : t('steps:common.edit')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => onUpdate({ outline: '' })}
                >
                  {t('steps:outline.reset')}
                </Button>
              </div>
            </div>
            {outlineEditing || !outlineContent ? (
              <div className="flex-1 min-h-0 p-4">
                <DslEditor
                  value={outlineContent}
                  onChange={(v) => onUpdate({ outline: v })}
                  validTags={outlineTags}
                  placeholder={t('steps:outline.editorPlaceholder')}
                  ariaLabel={t('steps:outline.editorPlaceholder')}
                  dark={isDark}
                  height="100%"
                  className="novel-dsl-editor h-full"
                />
              </div>
            ) : (
              <div className=" flex-1 overflow-y-auto p-8">
                <MarkdownView content={outlineContent} className="font-serif text-base" />
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

export default StepOutline;

