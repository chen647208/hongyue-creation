/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { isEncryptedEnvelope } from '@core/crypto';
import { STORAGE_KEYS } from '@shared/constants/storageKeys';
import React, { useCallback,useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useChapterCollab } from '@/app/collaboration/collaborationService';
import { type CommitOptions,useProjectStore } from '@/app/stores/projectStore';
import { useSettingsStore, useUsableModel } from '@/app/stores/settingsStore';
import { dialogService } from '@/shared/services/dialogService';
import { onEditorOps } from '@/shared/services/editorOps';
import { openForeshadows, overdueForeshadows } from '@/shared/services/foreshadowService';
import { localStore } from '@/shared/services/localStore';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { FeaturePanel } from '@/shared/ui/FeaturePanel';
import { Slot } from '@/shared/ui/Slot';
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
import { useChapterExport } from './hooks/useChapterExport';
import { useChapterGeneration } from './hooks/useChapterGeneration';
import { useChapterMutations } from './hooks/useChapterMutations';
import { useChapterOperations } from './hooks/useChapterOperations';
import { useChapterSnapshots } from './hooks/useChapterSnapshots';
import { useFindReplace } from './hooks/useFindReplace';
import { useGenerationSelections } from './hooks/useGenerationSelections';
import { useSelectionMenu } from './hooks/useSelectionMenu';
import { extractChapterSummary } from './services/summaryExtractionService';
import { computeBookStats, computeChapterStats } from './services/writingStatsService';
import { applyProofreadFixes, autoFormatContent, isScreenplayFormatEnabled, type ProofreadIssue,readPaperStyle, setScreenplayFormatEnabled, writePaperStyle } from './services/writingToolsService';
import type {
  GenerationModalState,
  NovelEditorHandle,
  PaperStyle,
  WritingEditorProps,
} from './types';
import {
  getChapterContext,
} from './utils';

const WritingEditor: React.FC<WritingEditorProps> = ({ project, initialChapterId, onBack, onNavigateToCharacters, onOpenSettings }) => {
  const { t } = useTranslation(['writing', 'steps']);
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [lastSaved, setLastSaved] = useState<number>(Date.now());
  const [saveDirty, setSaveDirty] = useState(false);
  const [typewriter, setTypewriter] = useState<boolean>(() => {
    try {
      return localStore.getItem(STORAGE_KEYS.editorTypewriter) === '1';
    } catch {
      return false;
    }
  });
  const toggleTypewriter = () => {
    setTypewriter((v) => {
      try {
        localStore.setItem(STORAGE_KEYS.editorTypewriter, v ? '0' : '1');
      } catch {
        // 忽略
      }
      return !v;
    });
  };
  const [outputMode, setOutputMode] = useState(DEFAULT_OUTPUT_MODE);
  

  const [genModal, setGenModal] = useState<GenerationModalState>(INITIAL_GENERATION_MODAL_STATE);
  const [targetWordCount, setTargetWordCountState] = useState<number>(project.wordTarget ?? DEFAULT_TARGET_WORD_COUNT);
  const [selectedGenPromptId, setSelectedGenPromptId] = useState<string>('');
  const [spellcheckOn, setSpellcheckOn] = useState(false);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedEditPromptId, setSelectedEditPromptId] = useState<string>('');
  const [customEditPrompt, setCustomEditPrompt] = useState<string>(''); // 自定义提示词

  const [isHistoryViewerOpen, setIsHistoryViewerOpen] = useState(false);
  const [isGlobalHistorySidebarOpen, setIsGlobalHistorySidebarOpen] = useState(false);

  const [isExtractingSummary, setIsExtractingSummary] = useState(false);
  const [selectedSummaryPromptId, setSelectedSummaryPromptId] = useState<string>('');

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

  const { handleManualSnapshot, snapshotChapterIfDue } = useChapterSnapshots({
    project,
    activeChapterId,
    onUpdate: (updates) => onUpdateRef.current(updates),
  });

  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isForeshadowOpen, setIsForeshadowOpen] = useState(false);
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [screenplayFormat, setScreenplayFormat] = useState(() => isScreenplayFormatEnabled());
  const [paper, setPaper] = useState(() => readPaperStyle());

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

  // 专注模式下 Esc 退出
  useEffect(() => {
    if (!isFocusMode) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsFocusMode(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isFocusMode]);

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
    onHistoryCleared: () => setIsHistoryViewerOpen(false),
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
    setIsExtractingSummary(true);
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
      setIsExtractingSummary(false);
    }
  };
  const modalContextInfo = genModal.chapter ? getChapterContext(project.chapters, genModal.chapter) : { prevChapter: null, prevContextText: "", nextChapter: null, nextSummary: "" };

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
        onCloseExportModal={() => exporter.setOpen(false)}
        onToggleAllExport={exporter.toggleAll}
        onToggleExportChapter={exporter.toggle}
        onExportFormatChange={exporter.setFormat}
        onConfirmExport={exporter.execute}
        menuPos={menuPos}
        hasModel={isModelUsable(activeModel)}
        onOpenEditModal={openEditModal}
        onClearSelection={clearSelectionMenu}
        isHistoryViewerOpen={isHistoryViewerOpen}
        activeChapter={activeChapter}
        onCloseHistoryViewer={() => setIsHistoryViewerOpen(false)}
        onApplyHistoryContent={updateChapterContent}
        onClearChapterHistory={handleClearChapterHistory}
        isGlobalHistorySidebarOpen={isGlobalHistorySidebarOpen}
        onCloseGlobalHistorySidebar={() => setIsGlobalHistorySidebarOpen(false)}
        onUpdate={onUpdate}
        onUpdateChapter={handleUpdateChapter}
        onOpenSettings={onOpenSettings}
      />

      {/* Sidebar & Editor Areas */}
      {isSidebarOpen && !isFocusMode && (
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
          onSummaryPromptChange={setSelectedSummaryPromptId}
          onExtractSummary={handleExtractSummary}
          onChapterClick={handleChapterClick}
          onNavigateToCharacters={onNavigateToCharacters}
          onDeleteChapter={handleDeleteChapter}
          onChaptersChange={handleChaptersChange}
          onBatchDeleteChapter={handleBatchDeleteChapter}
          onInsertEntity={(name: string) => {
            editorRef.current?.insertText(name);
          }}
        />
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
          onToggleGlobalHistory={() => setIsGlobalHistorySidebarOpen(!isGlobalHistorySidebarOpen)}
          onOpenChapterHistory={() => setIsHistoryViewerOpen(true)}
          onOpenSidebar={() => setIsSidebarOpen(true)}
          onToggleFocusMode={() => setIsFocusMode((v) => !v)}
          onToggleTypewriter={toggleTypewriter}
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
        onToggleScreenplayFormat={(value: boolean) => {
          setScreenplayFormatEnabled(value);
          setScreenplayFormat(value);
        }}
        paper={paper}
        onPaperChange={(value: PaperStyle) => {
          writePaperStyle(value);
          setPaper(value);
        }}
        onClose={() => setIsToolsOpen(false)}
      />
    </div>
  );
};

export default WritingEditor;


