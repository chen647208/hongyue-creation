/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { isEncryptedEnvelope } from '@core/crypto';
import React, { useCallback,useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useChapterCollab } from '@/app/collaboration/collaborationService';
import { type CommitOptions,useProjectStore } from '@/app/stores/projectStore';
import { useSettingsStore, useUsableModel } from '@/app/stores/settingsStore';
import { buildBlockTextMap, resolveAnnotation } from '@/editor/annotations';
import { buildBlockRefIndex, resolveBlockProjection } from '@/editor/blockRefs';
import { useViewportTier } from '@/shared/hooks/useViewportTier';
import { dialogService } from '@/shared/services/dialogService';
import { resetEditorContext, setEditorContext } from '@/shared/services/editorContextService';
import { onEditorOps } from '@/shared/services/editorOps';
import { openForeshadows, overdueForeshadows } from '@/shared/services/foreshadowService';
import { emitPluginEvent } from '@/shared/services/pluginEventBus';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { FeaturePanel } from '@/shared/ui/FeaturePanel';
import { Slot } from '@/shared/ui/Slot';
import { resolveWorkspaceChrome } from '@/shared/utils/layout';
import { logger } from '@/shared/utils/logger';
import { isModelUsable } from '@/shared/utils/modelReadiness';

import { type Chapter, type Project, type PromptTemplate } from '../../../shared/types';
import EncryptedChapterView from './components/EncryptedChapterView';
import FindBar from './components/FindBar';
import WritingEditorCanvas from './components/WritingEditorCanvas';
import WritingEditorOverlayLayer from './components/WritingEditorOverlayLayer';
import WritingEditorToolbar from './components/WritingEditorToolbar';
import WritingSidebar from './components/WritingSidebar';
import {
  DEFAULT_OUTPUT_MODE,
  DEFAULT_TARGET_WORD_COUNT,
  INITIAL_GENERATION_MODAL_STATE,
} from './constants';
import { useChapterAnnotations } from './hooks/useChapterAnnotations';
import { useChapterExport } from './hooks/useChapterExport';
import { useChapterGeneration } from './hooks/useChapterGeneration';
import { useChapterMutations } from './hooks/useChapterMutations';
import { useChapterOperations } from './hooks/useChapterOperations';
import { useChapterSnapshots } from './hooks/useChapterSnapshots';
import { useFindReplace } from './hooks/useFindReplace';
import { useGenerationSelections } from './hooks/useGenerationSelections';
import { useSelectionMenu } from './hooks/useSelectionMenu';
import { useWritingViewMode } from './hooks/useWritingViewMode';
import { extractChapterSummary } from './services/summaryExtractionService';
import { computeBookStats, computeChapterStats } from './services/writingStatsService';
import { applyProofreadFixes, autoFormatContent, type ProofreadIssue } from './services/writingToolsService';
import type {
  GenerationModalState,
  NovelEditorHandle,
  WritingEditorProps,
} from './types';
import {
  getChapterContext,
} from './utils';

const WritingEditor: React.FC<WritingEditorProps> = ({ project, initialChapterId, onBack, onNavigateToCharacters, onOpenSettings }) => {
  const { t } = useTranslation(['writing', 'steps']);
  // 窄视口侧栏改抽屉覆盖层：默认收起，避免挤压正文（docs/design/35 §2）
  const isMobile = resolveWorkspaceChrome(useViewportTier()).writingSidebarOverlay;
  // 直读 store：模型/提示词/更新动作不再经 App→View 层层透传
  const prompts = useSettingsStore((s) => s.prompts);
  // 手写 bypass 下可能为 undefined，未填凭证的默认模型也不可用：AI 入口各自守卫，调用前收窄
  const activeModel = useUsableModel();
  const updateActiveProject = useProjectStore((s) => s.updateActiveProject);
  const onUpdate = useCallback(
    (updates: Partial<Project>, opts?: CommitOptions) => updateActiveProject(updates, opts),
    [updateActiveProject],
  );

  // AI 落笔归因：模板回写正文时标注 agentId + 模板 cause，手写路径不经此函数
  const commitAIChapters = (chapters: Chapter[], template: PromptTemplate) =>
    onUpdate({ chapters }, {
      agentId: template.category === 'edit' ? 'ai:edit' : 'ai:writing',
      cause: template.id,
    });
  const [activeChapterId, setActiveChapterId] = useState<string | null>(initialChapterId || null);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => !isMobile);
  const [lastSaved, setLastSaved] = useState<number>(Date.now());
  const [saveDirty, setSaveDirty] = useState(false);
  // 编辑器视觉态：专注模式 / 打字机 / 纸张 / 剧本格式，统一见 useWritingViewMode
  const viewMode = useWritingViewMode();
  const { typewriter, isFocusMode, paper, screenplayFormat } = viewMode;
  const [outputMode, setOutputMode] = useState(DEFAULT_OUTPUT_MODE);
  

  const [genModal, setGenModal] = useState<GenerationModalState>(INITIAL_GENERATION_MODAL_STATE);
  const [targetWordCount, setTargetWordCountState] = useState<number>(project.wordTarget ?? DEFAULT_TARGET_WORD_COUNT);
  const [selectedGenPromptId, setSelectedGenPromptId] = useState<string>('');
  const [spellcheckOn, setSpellcheckOn] = useState(false);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedEditPromptId, setSelectedEditPromptId] = useState<string>('');
  const [customEditPrompt, setCustomEditPrompt] = useState<string>(''); // 自定义提示词

  // 历史查看器与全局历史侧栏的开关：单一对象 state
  const [historyPanels, setHistoryPanels] = useState<{ viewerOpen: boolean; sidebarOpen: boolean }>({
    viewerOpen: false,
    sidebarOpen: false,
  });
  const isHistoryViewerOpen = historyPanels.viewerOpen;
  const isGlobalHistorySidebarOpen = historyPanels.sidebarOpen;
  const setHistoryViewerOpen = (open: boolean) => setHistoryPanels((panels) => ({ ...panels, viewerOpen: open }));
  const setGlobalHistorySidebarOpen = (open: boolean) => setHistoryPanels((panels) => ({ ...panels, sidebarOpen: open }));

  // 摘要提取进行中标志与所选提示词：单一对象 state
  const [summaryState, setSummaryState] = useState<{ extracting: boolean; promptId: string }>({
    extracting: false,
    promptId: '',
  });
  const isExtractingSummary = summaryState.extracting;
  const selectedSummaryPromptId = summaryState.promptId;
  const setExtractingSummary = (extracting: boolean) => setSummaryState((state) => ({ ...state, extracting }));
  const setSummaryPromptId = (promptId: string) => setSummaryState((state) => ({ ...state, promptId }));

  const [useOutline, setUseOutline] = useState<boolean>(true);
  const [editableSummary, setEditableSummary] = useState<string>("");

  // 字数目标持久化：随书保存（缺席旧书用默认，不迁移）
  const setTargetWordCount = (count: number) => {
    setTargetWordCountState(count);
    if (project.wordTarget !== count) onUpdate({ wordTarget: count });
  };

  const toggleSpellcheck = () => {
    const next = !spellcheckOn;
    setSpellcheckOn(next);
    editorRef.current?.setSpellcheck(next);
  };

  const editPrompts = useMemo(() => prompts.filter(p => p.category === 'edit'), [prompts]);
  const writingPrompts = useMemo(() => prompts.filter(p => p.category === 'writing'), [prompts]);
  const summaryPrompts = useMemo(() => prompts.filter(p => p.category === 'summary'), [prompts]);

  const activeChapter = project.chapters.find(c => c.id === activeChapterId);
  const collaboration = useChapterCollab(project.id, activeChapterId);
  const chapterStats = useMemo(() => computeChapterStats(activeChapter?.content || ''), [activeChapter?.content]);
  // 全书统计含 runBuild 全稿管线，逐键重算代价高：降为低优先级，打字不卡顿。
  const deferredProject = useDeferredValue(project);
  const bookStats = useMemo(() => computeBookStats(deferredProject), [deferredProject]);
  const openForeshadowCount = useMemo(() => openForeshadows(project).length, [project]);
  const overdueForeshadowCount = useMemo(
    () => overdueForeshadows(project, activeChapter?.order ?? 0).length,
    [project, activeChapter?.order],
  );
  const editorRef = useRef<NovelEditorHandle>(null);

  // 块引用图（docs/design/45 §4）：全书正反查 + 失链 + 嵌入边，随项目数据重算。
  const blockRefIndex = useMemo(
    () => buildBlockRefIndex(deferredProject.chapters.map((c) => ({ id: c.id, title: c.title, body: c.content }))),
    [deferredProject],
  );
  const blockRefIndexRef = useRef(blockRefIndex);
  blockRefIndexRef.current = blockRefIndex;
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const pendingBlockJumpRef = useRef<string | null>(null);
  const resolveBlock = useCallback((id: string) => resolveBlockProjection(blockRefIndexRef.current, id), []);

  // 跨章跳转：目标不在当前章时先切章，待跳请求等编辑器就绪回调再消费。
  const handleJumpToBlock = useCallback((id: string) => {
    const location = blockRefIndexRef.current.blocks.get(id);
    if (location && location.chapterId !== activeChapterId) {
      pendingBlockJumpRef.current = id;
      setActiveChapterId(location.chapterId);
      return;
    }
    editorRef.current?.jumpToBlock(id);
  }, [activeChapterId]);

  // 活动章经 ref 供就绪回调读取：回调只订阅一次，切章不重订。
  const activeChapterIdRef = useRef(activeChapterId);
  activeChapterIdRef.current = activeChapterId;

  // 待跳队列消费者：编辑器就绪（目标章正文已进入文档）时定位。
  // 就绪信号来自其它章时继续等待；定位失败（协作正文晚到）时保留请求，等下一次信号重试。
  const consumePendingBlockJump = useCallback(() => {
    const pending = pendingBlockJumpRef.current;
    if (!pending) return;
    const location = blockRefIndexRef.current.blocks.get(pending);
    // 目标块已不在索引（正文被改过）：丢弃，不再重试。
    if (!location) {
      pendingBlockJumpRef.current = null;
      return;
    }
    if (location.chapterId !== activeChapterIdRef.current) return;
    if (editorRef.current?.jumpToBlock(pending)) pendingBlockJumpRef.current = null;
  }, []);

  // 就绪订阅按活动章重订：协作模式切章会重建编辑器（订阅集合随画布存活，重订幂等），
  // 画布重挂（无章/加密章切换）后也能把订阅补回来。
  useEffect(() => {
    const handle = editorRef.current;
    if (!handle) return;
    return handle.onEditorReady(consumePendingBlockJump);
  }, [activeChapterId, consumePendingBlockJump]);

  // 正文变化后重新投影嵌入内容（源块可能在其它章节）。
  useEffect(() => { editorRef.current?.refreshEmbeds(); }, [blockRefIndex]);

  const handleInsertBlockRef = useCallback((id: string) => { editorRef.current?.insertBlockRef(id); }, []);
  const handleInsertBlockEmbed = useCallback((id: string) => { editorRef.current?.insertBlockEmbed(id); }, []);

  // ===== 行内批注（docs/design/38 §2.2）：侧车数据 + 编辑器装饰 =====
  const annotationController = useChapterAnnotations({ project, activeChapterId, onUpdate });
  // 锚点解析用完整块文本（blockRefIndex 的摘要会截断，不能用于偏移定位）。
  const annotationBlockTexts = useMemo(
    () => buildBlockTextMap(activeChapter?.content ?? ''),
    [activeChapter?.content],
  );
  const annotationInputs = useMemo(() => {
    if (!activeChapter) return [];
    return (activeChapter.annotations ?? [])
      .filter((a) => !a.resolved)
      .map((a) => resolveAnnotation(a, annotationBlockTexts))
      .filter((r) => r.status === 'anchored')
      .map((r) => ({ annotationId: r.annotationId, blockId: r.blockId, start: r.start, end: r.end }));
  }, [activeChapter, annotationBlockTexts]);

  // 正文批注高亮点击：高亮左栏对应线程并确保面板可见（窄视口为抽屉）。
  const handleAnnotationClick = useCallback((annotationId: string) => {
    setActiveAnnotationId(annotationId);
    setIsSidebarOpen(true);
  }, []);

  // 换章后定位高亮失效
  useEffect(() => {
    setActiveAnnotationId(null);
  }, [activeChapterId]);

  const handleAddAnnotation = () => {
    const anchor = editorRef.current?.getSelectionAnchor();
    if (!anchor) {
      dialogService.alert(t('annotations.addHint'));
      return;
    }
    void dialogService
      .prompt({ title: t('selectionMenu.addAnnotation'), message: t('annotations.commentLabel'), placeholder: t('annotations.replyPlaceholder') })
      .then((body) => {
        if (body && body.trim()) annotationController.addAnnotation(anchor, body);
      });
  };

  useEffect(() => {
    if (writingPrompts.length > 0 && !selectedGenPromptId) {
      setSelectedGenPromptId(writingPrompts[0]?.id ?? '');
    }
    if (editPrompts.length > 0 && !selectedEditPromptId) {
      setSelectedEditPromptId(editPrompts[0]?.id ?? '');
    }
  }, [writingPrompts, editPrompts, selectedGenPromptId, selectedEditPromptId]);

  useEffect(() => {
    if (initialChapterId) {
      setActiveChapterId(initialChapterId);
    }
  }, [initialChapterId]);

  // 左栏直达写作时没有活动章：有章则默认选中第一章，无章则画布显示建章 CTA
  useEffect(() => {
    if (!activeChapterId && project.chapters.length > 0) {
      const first = [...project.chapters].sort((a, b) => a.order - b.order)[0];
      if (first) setActiveChapterId(first.id);
    }
  }, [activeChapterId, project.chapters]);

  // onUpdate 通过 ref 持有最新引用，避免定时器 effect 依赖回调身份
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const saveDirtyRef = useRef(false);
  saveDirtyRef.current = saveDirty;

  useEffect(() => {
    const timer = setInterval(() => {
      if (!saveDirtyRef.current) return;
      onUpdateRef.current({});
      setLastSaved(Date.now());
      setSaveDirty(false);
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // ===== 手动编辑快照：定时捕获，防误删/误覆盖（调度见 useChapterSnapshots） =====
  const projectRef = useRef(project);
  projectRef.current = project;

  // 打开章节：切换活动章时派发 chapter.open（异步非阻塞，无脚本订阅时零开销）。
  useEffect(() => {
    if (!activeChapterId) return;
    const chapter = projectRef.current.chapters.find((c) => c.id === activeChapterId);
    if (!chapter) return;
    emitPluginEvent('chapter.open', { bookId: projectRef.current.id, chapterId: chapter.id, title: chapter.title });
  }, [activeChapterId, project.id]);

  const { handleManualSnapshot, snapshotChapterIfDue } = useChapterSnapshots({
    project,
    activeChapterId,
    onUpdate: (updates) => onUpdateRef.current(updates),
  });

  const [isForeshadowOpen, setIsForeshadowOpen] = useState(false);
  const [isToolsOpen, setIsToolsOpen] = useState(false);

  // 章节字段写回统一见 useChapterMutations
  const { handleUpdateChapter, updateChapterContent, updateChapterSummary, updateChapterContentSummary, updateActiveChapterTitle } = useChapterMutations({
    project, activeChapterId, onUpdate, setSaveDirty,
  });

  const handleFormatChapter = (chapterId: string, indent: boolean) => {
    onUpdate({ chapters: project.chapters.map((c) => (c.id === chapterId ? { ...c, content: autoFormatContent(c.content, { indentParagraphs: indent }) } : c)) });
    setSaveDirty(true);
  };

  const handleFormatAll = (indent: boolean) => {
    onUpdate({ chapters: project.chapters.map((c) => ({ ...c, content: autoFormatContent(c.content, { indentParagraphs: indent }) })) });
    setSaveDirty(true);
  };

  const handleApplyProofread = (chapterId: string, issues: ProofreadIssue[]) => {
    onUpdate({ chapters: project.chapters.map((c) => (c.id === chapterId ? { ...c, content: applyProofreadFixes(c.content, issues) } : c)) });
    setSaveDirty(true);
  };

  // 章节导出：选择/格式/预设/落盘统一见 useChapterExport
  const exporter = useChapterExport({ project, t });

  // 查找替换：状态/快捷键/匹配跳转统一见 useFindReplace
  const find = useFindReplace({
    editorRef,
    activeChapterId,
    content: activeChapter?.content ?? '',
    shortcutBlocked: genModal.isOpen || editModalOpen || exporter.open || isHistoryViewerOpen || isForeshadowOpen,
  });

  useEffect(() => {
    if (genModal.isOpen && genModal.chapter) {
      setEditableSummary(genModal.chapter.summary || "");
    }
  }, [genModal.isOpen, genModal.chapter]);

  const {
    handleNewChapter,
    handleClearContent,
    handleSplitChapter,
    handleMergeNextChapter,
    handleDeleteChapter,
    handleChaptersChange,
    handleBatchDeleteChapter,
    handleClearChapterHistory,
  } = useChapterOperations({
    projectRef,
    onUpdate,
    t,
    activeChapterId,
    setActiveChapterId,
    editorRef,
    onHistoryCleared: () => setHistoryViewerOpen(false),
  });

  const {
    selectedKnowledgeIds,
    selectedCharacterIds,
    selectedChapterSummaryIds,
    toggleKnowledge,
    selectAllKnowledge,
    clearAllKnowledge,
    toggleCharacter,
    selectAllCharacters,
    clearAllCharacters,
    toggleChapterSummary,
    selectAllChapterSummaries,
    clearAllChapterSummaries,
  } = useGenerationSelections(project, genModal.isOpen);

  const selectionBlocked = editModalOpen || genModal.isOpen || exporter.open;
  const {
    menuPos,
    setMenuPos,
    selectedText,
    setSelectedText,
    selectionRange,
    setSelectionRange,
    clearSelectionMenu,
    handleMouseSelect,
    handleKeySelect,
    handleMouseMove,
  } = useSelectionMenu(editorRef, selectionBlocked);

  // 向助手暴露当前活动章节与选中文本（上下文注入按真实状态装配，不靠任务文本反推）
  useEffect(() => {
    setEditorContext({
      chapterId: activeChapterId ?? undefined,
      selectionText: selectedText || undefined,
    });
    return () => resetEditorContext();
  }, [activeChapterId, selectedText]);

  // 插件编辑器扩展请求的受控操作（design/22 §4）：应用到编辑器
  useEffect(() => onEditorOps((ops) => {
    const handle = editorRef.current;
    if (!handle) return;
    for (const op of ops) {
      const sel = handle.getSelection();
      if (sel) handle.replaceRange(sel.range.start, sel.range.end, op.text);
    }
  }), []);

  const handleChapterClick = (chapter: Chapter) => { setGenModal({ isOpen: true, chapter }); };
  const handleEnterEditor = () => {
    if (genModal.chapter) { setActiveChapterId(genModal.chapter.id); setGenModal({ isOpen: false, chapter: null }); }
  };

  const gen = useChapterGeneration({
    project,
    activeChapter,
    genModal,
    setGenModal,
    setActiveChapterId,
    setMenuPos,
    setEditModalOpen,
    selectedText,
    selectionRange,
    setSelectionRange,
    setSelectedText,
    selectedKnowledgeIds,
    selectedCharacterIds,
    selectedChapterSummaryIds,
    useOutline,
    editableSummary,
    targetWordCount,
    outputMode,
    activeModel,
    prompts,
    selectedGenPromptId,
    snapshotChapterIfDue,
    commitAIChapters,
    updateChapterContent,
    onUpdate,
    t,
  });

  const handleEditGenerate = () => {
    if (customEditPrompt && customEditPrompt.trim() !== '') {
      const customTemplate: PromptTemplate = {
        id: 'custom-prompt-' + Date.now(),
        category: 'edit',
        name: t('editor.customPromptName'),
        content: customEditPrompt.trim()
      };
      void gen.runAITemplate(customTemplate);
    } else {
      const template = prompts.find(p => p.id === selectedEditPromptId);
      if (template) void gen.runAITemplate(template);
    }
  };
  const openEditModal = () => { 
    setMenuPos(null); 
    setEditModalOpen(true); 
    setCustomEditPrompt('');
  };

  const handleExtractSummary = async () => {
    if (!isModelUsable(activeModel)) {
      dialogService.alert(t('steps:common.noModel'));
      return;
    }
    setExtractingSummary(true);
    try {
      await extractChapterSummary({
        activeChapter,
        summaryPrompts,
        selectedSummaryPromptId,
        prompts,
        project,
        activeModel,
        onUpdate,
      });
    } catch (err) {
      logger.error(err);
      dialogService.alert(t('editor.extractSummaryFailed'));
    } finally {
      setExtractingSummary(false);
    }
  };
  const modalContextInfo = genModal.chapter ? getChapterContext(project.chapters, genModal.chapter) : { prevChapter: null, prevContextText: "", nextChapter: null, nextSummary: "" };

  const sidebarNode = (
    <WritingSidebar
      project={project}
      activeChapter={activeChapter}
      activeChapterId={activeChapterId}
      chapters={project.chapters}
      summaryPrompts={summaryPrompts}
      selectedSummaryPromptId={selectedSummaryPromptId}
      isExtractingSummary={isExtractingSummary}
      hasModel={isModelUsable(activeModel)}
      onClose={() => setIsSidebarOpen(false)}
      onChapterSummaryChange={updateChapterSummary}
      onContentSummaryChange={updateChapterContentSummary}
      onSummaryPromptChange={setSummaryPromptId}
      onExtractSummary={handleExtractSummary}
      onChapterClick={handleChapterClick}
      onNavigateToCharacters={onNavigateToCharacters}
      onDeleteChapter={handleDeleteChapter}
      onChaptersChange={handleChaptersChange}
      onBatchDeleteChapter={handleBatchDeleteChapter}
      onInsertEntity={(name: string) => {
        editorRef.current?.insertText(name);
      }}
      blockRefs={{
        index: blockRefIndex,
        activeBlockId,
        onInsertRef: handleInsertBlockRef,
        onInsertEmbed: handleInsertBlockEmbed,
        onJump: handleJumpToBlock,
      }}
      annotationPanel={{
        activeChapterId,
        annotations: annotationController.annotations,
        blockTexts: annotationBlockTexts,
        activeAnnotationId,
        onJump: handleJumpToBlock,
        onAddFromSelection: handleAddAnnotation,
        onReply: annotationController.reply,
        onUpdateBody: annotationController.updateBody,
        onResolve: annotationController.resolve,
        onReopen: annotationController.reopen,
        onDelete: annotationController.remove,
      }}
    />
  );

  return (
    <div className="relative flex h-full overflow-hidden bg-background">
      
      <WritingEditorOverlayLayer
        genModal={genModal}
        setGenModal={setGenModal}
        modalContextInfo={modalContextInfo}
        useOutline={useOutline}
        setUseOutline={setUseOutline}
        project={project}
        selectedCharacterIds={selectedCharacterIds}
        toggleCharacter={toggleCharacter}
        selectAllCharacters={selectAllCharacters}
        clearAllCharacters={clearAllCharacters}
        selectedChapterSummaryIds={selectedChapterSummaryIds}
        toggleChapterSummary={toggleChapterSummary}
        selectAllChapterSummaries={() => selectAllChapterSummaries(genModal.chapter || activeChapter)}
        clearAllChapterSummaries={clearAllChapterSummaries}
        editableSummary={editableSummary}
        setEditableSummary={setEditableSummary}
        selectedKnowledgeIds={selectedKnowledgeIds}
        toggleKnowledge={toggleKnowledge}
        selectAllKnowledge={selectAllKnowledge}
        clearAllKnowledge={clearAllKnowledge}
        writingPrompts={writingPrompts}
        selectedGenPromptId={selectedGenPromptId}
        setSelectedGenPromptId={setSelectedGenPromptId}
        targetWordCount={targetWordCount}
        setTargetWordCount={setTargetWordCount}
        batchMode={gen.batchMode}
        setBatchMode={gen.setBatchMode}
        isBatchGenerating={gen.isBatchGenerating}
        batchProgress={gen.batchProgress}
        activeModel={activeModel}
        outputMode={outputMode}
        setOutputMode={setOutputMode}
        isStreaming={gen.isStreaming}
        streamingTokens={gen.streamingTokens}
        traditionalTokens={gen.traditionalTokens}
        isGenerating={gen.isGenerating}
        handleEnterEditor={handleEnterEditor}
        handleModalGenerate={gen.handleModalGenerate}
        stopBatchGeneration={gen.stopBatchGeneration}
        editModalOpen={editModalOpen}
        selectedText={selectedText}
        editPrompts={editPrompts}
        selectedEditPromptId={selectedEditPromptId}
        customEditPrompt={customEditPrompt}
        onCloseEditModal={() => setEditModalOpen(false)}
        onSelectedEditPromptChange={setSelectedEditPromptId}
        onCustomEditPromptChange={setCustomEditPrompt}
        onEditSubmit={handleEditGenerate}
        exportModalOpen={exporter.open}
        selectedExportChapterIds={exporter.selectedIds}
        exportFormat={exporter.format}
        exportProfileId={exporter.profileId}
        onExportProfileChange={exporter.setProfileId}
        exportProfile={exporter.effectiveProfile}
        exportCompile={exporter.compile}
        onExportCompileChange={exporter.patchCompile}
        exportUserProfiles={exporter.userProfiles}
        onSaveExportProfile={exporter.saveProfileAs}
        onDeleteExportProfile={exporter.removeProfile}
        exportError={exporter.error}
        onCloseExportModal={() => exporter.setOpen(false)}
        onToggleAllExport={exporter.toggleAll}
        onToggleExportChapter={exporter.toggle}
        onExportFormatChange={exporter.setFormat}
        onConfirmExport={exporter.execute}
        menuPos={menuPos}
        hasModel={isModelUsable(activeModel)}
        onOpenEditModal={openEditModal}
        onAddAnnotation={handleAddAnnotation}
        onClearSelection={clearSelectionMenu}
        isHistoryViewerOpen={isHistoryViewerOpen}
        activeChapter={activeChapter}
        onCloseHistoryViewer={() => setHistoryViewerOpen(false)}
        onApplyHistoryContent={updateChapterContent}
        onClearChapterHistory={handleClearChapterHistory}
        isGlobalHistorySidebarOpen={isGlobalHistorySidebarOpen}
        onCloseGlobalHistorySidebar={() => setGlobalHistorySidebarOpen(false)}
        onUpdate={onUpdate}
        onUpdateChapter={handleUpdateChapter}
        onOpenSettings={onOpenSettings}
      />

      {/* Sidebar & Editor Areas：手机档侧栏改抽屉覆盖层，桌面档保持并排分栏 */}
      {isSidebarOpen && !isFocusMode && (
        isMobile ? (
          <div className="fixed inset-0 z-overlay" role="dialog" aria-modal="true" aria-label={t('sidebar.title')}>
            <button
              type="button"
              aria-label={t('sidebar.close')}
              className="absolute inset-0 bg-foreground/40"
              onClick={() => setIsSidebarOpen(false)}
            />
            <div className="absolute inset-y-0 left-0 max-w-[85vw] shadow-xl">{sidebarNode}</div>
          </div>
        ) : (
          sidebarNode
        )
      )}

      <div className="relative flex h-full min-w-0 flex-1 flex-col bg-muted/30">
      {find.open && project.chapters.length > 0 && (
        <FindBar
          query={find.query}
          onQueryChange={find.setQuery}
          replacement={find.replacement}
          onReplacementChange={find.setReplacement}
          caseSensitive={find.caseSensitive}
          onToggleCaseSensitive={find.toggleCaseSensitive}
          matchIndex={find.matchIndex}
          matchCount={find.matchCount}
          onPrev={find.prev}
          onNext={find.next}
          onReplace={find.replaceOne}
          onReplaceAll={find.replaceAll}
          onClose={() => find.setOpen(false)}
          />
        )}
        <WritingEditorToolbar
          activeChapterId={activeChapterId}
          activeChapterTitle={activeChapter?.title || ""}
          hasProjectChapters={project.chapters.length > 0}
          hasActiveChapterHistory={Boolean(activeChapter?.history && activeChapter.history.length > 0)}
          isSidebarOpen={isSidebarOpen}
          isGlobalHistorySidebarOpen={isGlobalHistorySidebarOpen}
          chapterStats={chapterStats}
          bookStats={bookStats}
          snapshotCount={activeChapter?.snapshots?.length ?? 0}
          openForeshadowCount={openForeshadowCount}
          overdueForeshadowCount={overdueForeshadowCount}
          isFocusMode={isFocusMode}
          lastSaved={lastSaved}
          targetWordCount={targetWordCount}
          typewriter={typewriter}
          saveDirty={saveDirty}
          canUndo={editorRef.current?.canUndo() ?? false}
          canRedo={editorRef.current?.canRedo() ?? false}
          onBack={onBack}
          onTitleChange={updateActiveChapterTitle}
          onOpenExport={exporter.openModal}
          onOpenForeshadow={() => setIsForeshadowOpen(true)}
          onClearContent={handleClearContent}
          onToggleGlobalHistory={() => setGlobalHistorySidebarOpen(!isGlobalHistorySidebarOpen)}
          onOpenChapterHistory={() => setHistoryViewerOpen(true)}
          onOpenSidebar={() => setIsSidebarOpen(true)}
          onToggleFocusMode={() => viewMode.setFocusMode((v) => !v)}
          onToggleTypewriter={viewMode.toggleTypewriter}
          onUndo={() => editorRef.current?.undo()}
          onRedo={() => editorRef.current?.redo()}
          onManualSnapshot={handleManualSnapshot}
          canRetryAI={gen.canRetryAI}
          onRetryAI={gen.handleRetryAI}
          spellcheckOn={spellcheckOn}
          onToggleSpellcheck={toggleSpellcheck}
          onToggleFind={() => find.setOpen((v) => !v)}
          canSplitChapter={!!activeChapterId && (activeChapter?.content.trim().length ?? 0) > 0}
          canMergeChapter={project.chapters.findIndex(c => c.id === activeChapterId) >= 0 && project.chapters.findIndex(c => c.id === activeChapterId) < project.chapters.length - 1}
          onSplitChapter={handleSplitChapter}
          onMergeChapter={() => void handleMergeNextChapter()}
          chapterFinal={activeChapter?.status === 'final'}
          onToggleFinal={() => {
            if (!activeChapter) return;
            handleUpdateChapter({ ...activeChapter, status: activeChapter.status === 'final' ? 'draft' : 'final' });
          }}
          onOpenTools={() => setIsToolsOpen(true)}
        />

        <Slot id="plugin.editor" />

        {project.chapters.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              title={t('canvas.emptyBookTitle')}
              description={t('canvas.emptyBookHint')}
              action={
                <div className="flex items-center gap-2">
                  <Button onClick={handleNewChapter}>{t('canvas.createFirstChapter')}</Button>
                  <Button variant="ghost" onClick={onBack}>{t('canvas.backToStructure')}</Button>
                </div>
              }
            />
          </div>
        ) : activeChapter && isEncryptedEnvelope(activeChapter.content) ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <EncryptedChapterView content={activeChapter.content} />
          </div>
        ) : (
        <WritingEditorCanvas
          editorRef={editorRef}
          activeChapterId={activeChapterId}
          content={gen.isStreaming ? gen.streamingContent : (activeChapter?.content || "")}
          locked={activeChapter?.status === 'final'}
          collaboration={collaboration}
          screenplayFormat={screenplayFormat}
          paper={paper}
          isFocusMode={isFocusMode}
          typewriter={typewriter}
          isGenerating={gen.isGenerating}
          isStreaming={gen.isStreaming}
          isBatchGenerating={gen.isBatchGenerating}
          targetWordCount={targetWordCount}
          selectedKnowledgeCount={selectedKnowledgeIds.size}
          streamingContentLength={gen.streamingContent.length}
          batchProgress={gen.batchProgress}
          onMouseUp={handleMouseSelect}
          onKeyUp={handleKeySelect}
          onMouseMove={handleMouseMove}
          onContentChange={updateChapterContent}
          onNewChapter={handleNewChapter}
          resolveBlock={resolveBlock}
          onOpenSource={handleJumpToBlock}
          onActiveBlockChange={setActiveBlockId}
          annotations={annotationInputs}
          onAnnotationClick={handleAnnotationClick}
          onStopStreaming={gen.stopStreaming}
          onStopBatchGeneration={gen.stopBatchGeneration}
          streamingTokens={gen.streamingTokens}
          traditionalTokens={gen.traditionalTokens}
          stoppedPartialLength={gen.stoppedPartial?.length ?? 0}
          onKeepStoppedPartial={gen.keepStoppedPartial}
          onDiscardStoppedPartial={gen.discardStoppedPartial}
        />
        )}
      </div>

      <FeaturePanel
        id="foreshadowing.panel"
        isOpen={isForeshadowOpen}
        project={project}
        activeModel={activeModel}
        activeChapter={activeChapter ? { id: activeChapter.id, title: activeChapter.title, order: activeChapter.order, content: activeChapter.content } : null}
        onUpdate={onUpdate}
        onClose={() => setIsForeshadowOpen(false)}
      />

      <FeaturePanel
        id="writing.tools"
        isOpen={isToolsOpen}
        project={project}
        chapter={activeChapter ?? null}
        onFormatChapter={handleFormatChapter}
        onFormatAll={handleFormatAll}
        onApplyProofread={handleApplyProofread}
        onInsertSnippet={(text: string) => {
          editorRef.current?.insertText(text);
        }}
        screenplayFormat={screenplayFormat}
        onToggleScreenplayFormat={viewMode.setScreenplayFormat}
        paper={paper}
        onPaperChange={viewMode.setPaper}
        onClose={() => setIsToolsOpen(false)}
      />
    </div>
  );
};

export default WritingEditor;


