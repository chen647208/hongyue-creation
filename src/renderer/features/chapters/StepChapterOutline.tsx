/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */
import { BookOpen, BookOpenText, Check, CheckCheck, ChevronDown, ChevronRight, Clock, FastForward, FileOutput, FileSearch, Flag, Globe2, Layers, LayoutGrid, LayoutList, ListOrdered, MapPin, WandSparkles, XCircle } from 'lucide-react';
import React, { useMemo,useState } from 'react';

import { type CommitOptions,useProjectStore } from '@/app/stores/projectStore';
import { useSettingsStore, useUsableModel } from '@/app/stores/settingsStore';
import { i18n, templateDisplayName,useTranslation } from '@/i18n';
import { useViewPreference } from '@/shared/hooks/useViewPreference';
import { dialogService } from '@/shared/services/dialogService';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { Checkbox } from '@/shared/ui/Checkbox';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Input } from '@/shared/ui/Input';
import { Label } from '@/shared/ui/Label';
import { MarkdownView } from '@/shared/ui/Markdown';
import { Select } from '@/shared/ui/Select';
import { Spinner } from '@/shared/ui/Spinner';
import { ViewModeToggle } from '@/shared/ui/ViewModeToggle';
import { cn } from '@/shared/utils/cn';
import { formatDateTime } from '@/shared/utils/format';
import { logger } from '@/shared/utils/logger';
import { isModelUsable } from '@/shared/utils/modelReadiness';

import { isVirtualChapter } from '../../../shared/constants/chapters';
import { type Chapter,type Project } from '../../../shared/types';
import { ChapterOutlineDraftPanel } from './components/ChapterOutlineDraftPanel';
import { ChapterOutlineList } from './components/ChapterOutlineList';
import { useChapterOutlineExtraction } from './hooks/useChapterOutlineExtraction';
import { useChapterOutlineGeneration } from './hooks/useChapterOutlineGeneration';

interface StepChapterOutlineProps {
  project: Project;
  onEnterWriting: (chapterId: string) => void;
  /** 跨页接力：缺大纲时去大纲子页，由工作台注入 */
  onGoSection?: (next: 'structure', sub?: 'outline' | 'chapters') => void;
}

const StepChapterOutline: React.FC<StepChapterOutlineProps> = ({ project, onEnterWriting, onGoSection }) => {
  const { t } = useTranslation(['steps', 'common']);
  // 直读 store：死掉的 onOpenSettings 透传一并删除
  const prompts = useSettingsStore((s) => s.prompts);
  const activeModel = useUsableModel();
  const updateActiveProject = useProjectStore((s) => s.updateActiveProject);
  const onUpdate = (updates: Partial<Project>, opts?: CommitOptions) => updateActiveProject(updates, opts);
  
  // 传统输出token状态
  
  const chapterPrompts = useMemo(() => prompts.filter(p => p.category === 'chapter'), [prompts]);
  const [selectedPromptId, setSelectedPromptId] = useState(chapterPrompts[0]?.id || '');
  const [chapterView, setChapterView] = useViewPreference<'cards' | 'table'>('chapters.view', 'cards');
  // HTML5 拖拽排序（无新依赖）：拖起行/卡片 → 悬停行定点 → 放下重排 order
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const moveChapterTo = (id: string, toIndex: number) => {
    const sorted = [...project.chapters].sort((a, b) => a.order - b.order);
    const from = sorted.findIndex((c) => c.id === id);
    if (from < 0) return;
    const clamped = Math.max(0, Math.min(sorted.length - 1, toIndex));
    if (clamped === from) return;
    const [moved] = sorted.splice(from, 1);
    if (!moved) return;
    sorted.splice(clamped, 0, moved);
    const orderById = new Map(sorted.map((c, i) => [c.id, i] as const));
    onUpdate({ chapters: project.chapters.map((c) => ({ ...c, order: orderById.get(c.id) ?? c.order })) });
  };

  const moveChapter = (id: string, dir: -1 | 1) => {
    const sorted = [...project.chapters].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((c) => c.id === id);
    if (idx < 0) return;
    moveChapterTo(id, idx + dir);
  };

  const clearDragState = () => { setDragId(null); setDropIndex(null); };
  
  // Knowledge Base Selection State
  const [selectedKnowledgeIds, setSelectedKnowledgeIds] = useState<Set<string>>(new Set());
  const [showKnowledgeSelector, setShowKnowledgeSelector] = useState(false);

  const exportChaptersToTxt = async () => {
    if (project.chapters.length === 0) {
      dialogService.alert(t('steps:chapters.noChaptersExport'));
      return;
    }

    try {
      // 生成文件内容
      let content = t('steps:chapters.exportHeader', { title: project.title || t('steps:chapters.unnamedProject') }) + '\n';
      content += `${'='.repeat(50)}\n\n`;
      content += `${t('steps:chapters.exportTime', { time: formatDateTime(Date.now(), i18n.language) })}\n`;
      content += `${t('steps:chapters.exportCount', { count: project.chapters.length })}\n\n`;
      content += `${'='.repeat(50)}\n\n`;

      project.chapters.sort((a, b) => a.order - b.order).forEach((chap, idx) => {
        content += `${t('steps:chapters.exportChapter', { num: idx + 1, title: chap.title })}\n`;
        content += `${'-'.repeat(30)}\n`;
        content += `${t('steps:chapters.exportSummary')}\n${chap.summary || t('steps:chapters.exportNoSummary')}\n\n`;
      });

      // 调用 Electron 保存对话框
      const defaultFileName = `${project.title || t('steps:chapters.exportFileName')}_${new Date().toISOString().slice(0, 10)}.txt`;
      const api = window.electronAPI;
      if (!api) {
        throw new Error(t('steps:chapters.electronUnavailable'));
      }
      const result = await api.saveFileDialog({
        title: t('steps:chapters.saveDialogTitle'),
        defaultPath: defaultFileName,
        filters: [
          { name: t('steps:chapters.filterText'), extensions: ['txt'] },
          { name: t('steps:chapters.filterAll'), extensions: ['*'] }
        ]
      });

      if (!result.canceled && result.filePath) {
        // 写入文件
        await api.writeFile(result.filePath, content);
        dialogService.alert(t('steps:chapters.exportSuccess'));
      }
    } catch (error) {
      logger.error('导出失败:', error);
      dialogService.alert(t('steps:chapters.exportFailed', { error: error instanceof Error ? error.message : t('steps:common.unknownError') }));
    }
  };

  // 细纲生成：全量/续写统一见 useChapterOutlineGeneration
  const { loading, continueLoading, traditionalTokens, generateChapters } = useChapterOutlineGeneration({
    project, prompts, selectedPromptId, selectedKnowledgeIds, activeModel, onUpdate, t,
  });

  // 从既有正文提取细纲草稿（与「大纲→细纲」方向互补，确认后才写入）
  const {
    extracting,
    draft,
    tokens: extractTokens,
    batchProgress: extractBatchProgress,
    hasRemaining,
    extract,
    extractRemaining,
    applyDraft,
    discardDraft,
  } = useChapterOutlineExtraction({ project, activeModel, onUpdate, t });

  return (
    <div className="mx-auto flex h-full w-full max-w-7xl flex-col gap-5 overflow-hidden p-8">
      <Card className="z-20 flex shrink-0 flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-4">
          <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <ListOrdered className="size-5" />
          </div>
          <div>
            <h2 className="font-serif text-xl font-medium tracking-tight">{t('steps:chapters.title')}</h2>
            <p className="text-xs text-muted-foreground">{t('steps:chapters.subtitle')}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
           {/* Knowledge Selector Toggle */}
           <div className="relative">
              <Button
                 variant={selectedKnowledgeIds.size > 0 ? 'secondary' : 'outline'}
                 size="icon"
                 onClick={() => setShowKnowledgeSelector(!showKnowledgeSelector)}
                 title={t('steps:chapters.knowledgeToggleTitle')}
              >
                 <BookOpenText className="size-4" />
                 {selectedKnowledgeIds.size > 0 && (
                   <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-2xs font-medium text-primary-foreground">
                     {selectedKnowledgeIds.size}
                   </span>
                 )}
              </Button>

              {showKnowledgeSelector && (
                 <div className="absolute right-0 top-11 z-50 w-72 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg">
                    <div className="mb-2 flex items-center justify-between">
                       <h5 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('steps:chapters.knowledgeSelectTitle')}</h5>
                       <div className="flex gap-1">
                          <Button
                             variant="ghost"
                             size="sm"
                             className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                             onClick={() => {
                                const allIds = (project.knowledge || [])
                                  .filter(k => k.category === 'chapter')
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
                    </div>
                    <div className="max-h-60 space-y-1 overflow-y-auto">
                       {(project.knowledge || []).filter(k => k.category === 'chapter').length === 0 ? <p className="text-xs italic text-muted-foreground">{t('steps:common.noMaterial')}</p> :
                          project.knowledge.filter(k => k.category === 'chapter').map(k => (
                             <div
                                key={k.id}
                                onClick={() => {
                                   const newSet = new Set(selectedKnowledgeIds);
                                   if (newSet.has(k.id)) newSet.delete(k.id); else newSet.add(k.id);
                                   setSelectedKnowledgeIds(newSet);
                                }}
                                className={cn(
                                  'flex cursor-pointer items-center gap-2 rounded-md border p-2 transition-colors',
                                  selectedKnowledgeIds.has(k.id) ? 'border-primary/40 bg-primary/5' : 'border-transparent hover:bg-muted'
                                )}
                             >
                                <span className={cn(
                                  'flex size-3.5 shrink-0 items-center justify-center rounded border',
                                  selectedKnowledgeIds.has(k.id) ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'
                                )}>
                                   {selectedKnowledgeIds.has(k.id) && <Check className="size-2.5" />}
                                </span>
                                <span className={cn('flex-1 truncate text-left text-xs', selectedKnowledgeIds.has(k.id) ? 'font-medium text-foreground' : 'text-muted-foreground')}>{k.name}</span>
                             </div>
                          ))
                       }
                    </div>
                 </div>
              )}
           </div>

          <Select
            value={selectedPromptId}
            onChange={(e) => setSelectedPromptId(e.target.value)}
            className="h-10 w-auto"
            aria-label={t('steps:common.promptTemplate')}
          >
            {chapterPrompts.map(p => <option key={p.id} value={p.id}>{templateDisplayName(p)}</option>)}
          </Select>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => extract(project.chapters)}
              disabled={extracting || loading || continueLoading || !isModelUsable(activeModel)}
              title={!isModelUsable(activeModel) ? t('steps:common.noModel') : undefined}
            >
              {extracting ? <Spinner className="size-4" /> : <FileSearch className="size-4" />}
              {extracting ? t('steps:chapters.extracting') : t('steps:chapters.extractFromText')}
            </Button>
            <Button onClick={() => generateChapters(false)} disabled={loading || continueLoading || !isModelUsable(activeModel)} title={!isModelUsable(activeModel) ? t('steps:common.noModel') : undefined}>
              {loading ? <Spinner className="size-4" /> : <WandSparkles className="size-4" />}
              {loading ? t('steps:chapters.generating') : t('steps:chapters.regenerate')}
            </Button>

            {project.chapters.length > 0 && (
              <Button variant="outline" onClick={() => generateChapters(true)} disabled={loading || continueLoading || !isModelUsable(activeModel)} title={!isModelUsable(activeModel) ? t('steps:common.noModel') : undefined}>
                {continueLoading ? <Spinner className="size-4" /> : <FastForward className="size-4" />}
                {continueLoading ? t('steps:chapters.continuing') : t('steps:chapters.continueBtn')}
              </Button>
            )}
          </div>

        </div>
      </Card>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-hidden lg:grid-cols-4">
        <Card className="flex min-h-0 flex-col overflow-hidden p-5 lg:col-span-1">
          <h4 className="mb-3 flex shrink-0 items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <BookOpen className="size-3.5" /> {t('steps:chapters.outlineRefTitle')}
          </h4>
          <div className=" flex-1 overflow-y-auto pr-1 text-xs text-muted-foreground">
            {project.outline ? (
              <MarkdownView content={project.outline} className="text-xs [&_*]:text-current" />
            ) : (
              <div className="space-y-2">
                <p>{t('steps:chapters.outlineEmpty')}</p>
                {onGoSection && (
                  <Button variant="ghost" size="sm" onClick={() => onGoSection('structure', 'outline')}>
                    {t('steps:chapters.goOutline')}
                  </Button>
                )}
              </div>
            )}
          </div>
        </Card>

        <Card className="flex min-h-0 flex-col overflow-hidden rounded-lg p-0 lg:col-span-3">
          <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
            <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <LayoutList className="size-3.5" /> {t('steps:chapters.chapterListPreview', { count: project.chapters.length })}
            </span>
            <div className="flex items-center gap-2">
              <ViewModeToggle
                value={chapterView}
                onChange={setChapterView}
                options={[
                  { value: 'cards', icon: LayoutGrid, title: t('steps:chapters.viewGrid') },
                  { value: 'table', icon: LayoutList, title: t('steps:chapters.viewList') },
                ]}
              />
              {/* Token消耗显示 */}
              {traditionalTokens.total > 0 && (
                <div className="flex items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs tabular-nums">
                  <span className="text-muted-foreground">{t('steps:chapters.inputToken')} <span className="font-medium text-foreground">{traditionalTokens.prompt}</span></span>
                  <span className="text-muted-foreground">{t('steps:chapters.outputToken')} <span className="font-medium text-foreground">{traditionalTokens.completion}</span></span>
                  <span className="text-muted-foreground">{t('steps:chapters.totalLabel')} <span className="font-medium text-foreground">{traditionalTokens.total}</span></span>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => onUpdate({ chapters: [...project.chapters, { id: Date.now().toString(), title: t('steps:chapters.defaultNewChapter', { num: project.chapters.length + 1 }), summary: '', content: '', order: project.chapters.length }] })}
              >
                {t('steps:chapters.manualAdd')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportChaptersToTxt}
                disabled={project.chapters.length === 0}
              >
                <FileOutput className="size-3.5" />
                {t('steps:chapters.exportTxt')}
              </Button>
            </div>
          </div>

          {draft && (
            <div className="shrink-0 px-5 pt-5">
              <ChapterOutlineDraftPanel
                drafts={draft}
                chapters={project.chapters}
                tokens={extractTokens}
                batchProgress={extractBatchProgress}
                onApply={applyDraft}
                onDiscard={discardDraft}
                onContinue={hasRemaining ? () => void extractRemaining() : undefined}
                continueDisabled={extracting || !isModelUsable(activeModel)}
              />
            </div>
          )}

          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {(() => {
              // 过滤掉虚拟章节（order < 0的章节）
              const regularChapters = project.chapters.filter(chapter => !isVirtualChapter(chapter));
              const sortedChapters = regularChapters.sort((a,b) => a.order - b.order);

              if (sortedChapters.length === 0) {
                return (
                  <EmptyState
                    className="h-full"
                    icon={Layers}
                    title={t('steps:chapters.emptyTitle')}
                    description={t('steps:chapters.emptyHint')}
                    action={
                      project.outline?.trim() ? (
                        <Button onClick={() => generateChapters(false)} disabled={loading || !isModelUsable(activeModel)}>
                          {t('steps:chapters.generateNow')}
                        </Button>
                      ) : undefined
                    }
                  />
                );
              }

              return (
                <ChapterOutlineList
                  chapters={sortedChapters}
                  view={chapterView}
                  dragId={dragId}
                  dropIndex={dropIndex}
                  setDragId={setDragId}
                  setDropIndex={setDropIndex}
                  clearDragState={clearDragState}
                  moveChapter={moveChapter}
                  moveChapterTo={moveChapterTo}
                  onEnterWriting={onEnterWriting}
                  project={project}
                  onUpdate={onUpdate}
                  onExtractOutline={(chap) => extract([chap])}
                  extractOutlineDisabled={extracting || loading || continueLoading || !isModelUsable(activeModel)}
                  renderRelationEditor={(chap) => (
                    <ChapterWorldRelationEditor
                      chapter={chap}
                      project={project}
                      onUpdate={(updates) => {
                        onUpdate({ chapters: project.chapters.map(c => c.id === chap.id ? { ...c, ...updates } : c) });
                      }}
                    />
                  )}
                />
              );
            })()}
          </div>
        </Card>
      </div>
    </div>
  );
};

/**
 * 章节世界关联信息编辑器
 * 用于编辑章节与世界观数据的关联
 */
interface ChapterWorldRelationEditorProps {
  chapter: Chapter;
  project: Project;
  onUpdate: (updates: Partial<Chapter>) => void;
}

const ChapterWorldRelationEditor: React.FC<ChapterWorldRelationEditorProps> = ({
  chapter,
  project,
  onUpdate
}) => {
  const { t } = useTranslation(['steps', 'common']);
  const [isExpanded, setIsExpanded] = useState(false);
  
  const locations = project.locations || [];
  const factions = project.factions || [];
  const timeline = project.timeline;
  
  // 获取当前选中的地点
  const mainLocation = locations.find(l => l.id === chapter.mainLocationId);
  
  // 获取当前选中的势力
  const involvedFactions = factions.filter(f => 
    chapter.involvedFactionIds?.includes(f.id)
  );
  
  // 切换势力选择
  const toggleFaction = (factionId: string) => {
    const currentIds = chapter.involvedFactionIds || [];
    const newIds = currentIds.includes(factionId)
      ? currentIds.filter(id => id !== factionId)
      : [...currentIds, factionId];
    onUpdate({ involvedFactionIds: newIds });
  };

  return (
    <div className="mt-3 border-t border-border pt-3">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <span className="flex items-center gap-1.5">
          <Globe2 className="size-3.5" />
          {t('steps:chapters.worldRelation')}
          {(mainLocation || involvedFactions.length > 0) && (
            <span className="text-foreground">
              ({[mainLocation?.name, involvedFactions.length > 0 && t('steps:chapters.factionsCount', { count: involvedFactions.length })].filter(Boolean).join(', ')})
            </span>
          )}
        </span>
      </button>

      {isExpanded && (
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* 主要发生地点 */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="size-3.5" />
              {t('steps:chapters.mainLocation')}
            </Label>
            <Select
              value={chapter.mainLocationId || ''}
              onChange={(e) => onUpdate({ mainLocationId: e.target.value || undefined })}
              className="h-8 text-xs"
              aria-label={t('steps:chapters.mainLocation')}
            >
              <option value="">{t('steps:chapters.noneOption')}</option>
              {locations.map(location => (
                <option key={location.id} value={location.id}>
                  {location.name} ({location.type})
                </option>
              ))}
            </Select>
            {mainLocation && (
              <div className="rounded border border-border bg-muted/40 p-2 text-xs">
                <div className="font-medium">{mainLocation.name}</div>
                <div className="truncate text-muted-foreground">{mainLocation.description?.substring(0, 40)}...</div>
              </div>
            )}
          </div>

          {/* 涉及势力 */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Flag className="size-3.5" />
              {t('steps:chapters.involvedFactions')}
            </Label>
            <div className="max-h-32 space-y-0.5 overflow-y-auto rounded-md border border-border bg-muted/30 p-1.5">
              {factions.length === 0 ? (
                <span className="text-xs italic text-muted-foreground">{t('steps:chapters.noFactions')}</span>
              ) : (
                factions.map(faction => (
                  <label
                    key={faction.id}
                    className="flex cursor-pointer items-center gap-2 rounded p-1.5 text-xs transition-colors hover:bg-muted"
                  >
                    <Checkbox
                      checked={chapter.involvedFactionIds?.includes(faction.id) || false}
                      onChange={() => toggleFaction(faction.id)}
                      className="size-3.5 accent-primary"
                    />
                    <span className="truncate">{faction.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* 故事时间点 */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="size-3.5" />
              {t('steps:chapters.storyTime')}
              {timeline && <span className="font-normal text-foreground/70">({timeline.config.calendarSystem})</span>}
            </Label>

            {timeline ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="mb-1 block text-2xs text-muted-foreground">{t('steps:chapters.yearLabel')}</Label>
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      value={chapter.storyDate?.year || ''}
                      onChange={(e) => onUpdate({
                        storyDate: {
                          ...chapter.storyDate,
                          year: parseInt(e.target.value) || 0
                        }
                      })}
                      placeholder={timeline.config.startYear?.toString() || '0'}
                    />
                  </div>
                  <div>
                    <Label className="mb-1 block text-2xs text-muted-foreground">{t('steps:chapters.displayLabel')}</Label>
                    <Input
                      type="text"
                      className="h-8 text-xs"
                      value={chapter.storyDate?.display || ''}
                      onChange={(e) => onUpdate({
                        storyDate: {
                          ...chapter.storyDate,
                          year: chapter.storyDate?.year ?? timeline.config.startYear ?? 0,
                          display: e.target.value
                        }
                      })}
                      placeholder={t('steps:chapters.displayPlaceholder')}
                    />
                  </div>
                </div>

                {/* 关联时间线事件 */}
                {timeline.events?.length > 0 && (
                  <div>
                    <Label className="mb-1 block text-2xs text-muted-foreground">{t('steps:chapters.linkedEvent')}</Label>
                    <Select
                      value={chapter.timelineEventId || ''}
                      onChange={(e) => onUpdate({ timelineEventId: e.target.value || undefined })}
                      className="h-8 text-xs"
                      aria-label={t('steps:chapters.linkedEvent')}
                    >
                      <option value="">{t('steps:chapters.noneOption')}</option>
                      {timeline.events.map(event => (
                        <option key={event.id} value={event.id}>
                          {event.title} ({event.date?.display || event.date?.year})
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-md border border-border bg-muted/30 p-2.5 text-xs italic text-muted-foreground">
                {t('steps:chapters.noTimeline')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default StepChapterOutline;

