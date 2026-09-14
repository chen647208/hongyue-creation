/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import React from 'react';

import AIHistoryViewer from '../AIHistoryViewer';
import type { WritingEditorOverlayLayerProps } from '../types';
import ChapterGenerationModal from './ChapterGenerationModal';
import ChapterHistoryModal from './ChapterHistoryModal';
import ExportChapterModal from './ExportChapterModal';
import WritingEditModal from './WritingEditModal';
import WritingSelectionMenu from './WritingSelectionMenu';

const WritingEditorOverlayLayer: React.FC<WritingEditorOverlayLayerProps> = ({
  genModal,
  setGenModal,
  modalContextInfo,
  useOutline,
  setUseOutline,
  project,
  selectedCharacterIds,
  toggleCharacter,
  selectAllCharacters,
  clearAllCharacters,
  selectedChapterSummaryIds,
  toggleChapterSummary,
  selectAllChapterSummaries,
  clearAllChapterSummaries,
  editableSummary,
  setEditableSummary,
  selectedKnowledgeIds,
  toggleKnowledge,
  selectAllKnowledge,
  clearAllKnowledge,
  writingPrompts,
  selectedGenPromptId,
  setSelectedGenPromptId,
  targetWordCount,
  setTargetWordCount,
  batchMode,
  setBatchMode,
  isBatchGenerating,
  batchProgress,
  activeModel,
  outputMode,
  setOutputMode,
  isStreaming,
  streamingTokens,
  traditionalTokens,
  isGenerating,
  handleEnterEditor,
  handleModalGenerate,
  onOpenSettings,
  stopBatchGeneration,
  editModalOpen,
  selectedText,
  editPrompts,
  selectedEditPromptId,
  customEditPrompt,
  onCloseEditModal,
  onSelectedEditPromptChange,
  onCustomEditPromptChange,
  onEditSubmit,
  exportModalOpen,
  selectedExportChapterIds,
  exportFormat,
  exportProfileId,
  onExportProfileChange,
  exportProfile,
  exportCompile,
  onExportCompileChange,
  exportUserProfiles,
  onSaveExportProfile,
  onDeleteExportProfile,
  exportError,
  onCloseExportModal,
  onToggleAllExport,
  onToggleExportChapter,
  onExportFormatChange,
  onConfirmExport,
  menuPos,
  hasModel,
  onOpenEditModal,
  onAddAnnotation,
  onClearSelection,
  isHistoryViewerOpen,
  activeChapter,
  onCloseHistoryViewer,
  onApplyHistoryContent,
  onClearChapterHistory,
  isGlobalHistorySidebarOpen,
  onCloseGlobalHistorySidebar,
  onUpdate,
  onUpdateChapter,
}) => {
  return (
    <>
      <ChapterGenerationModal
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
        selectAllChapterSummaries={selectAllChapterSummaries}
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
        batchMode={batchMode}
        setBatchMode={setBatchMode}
        isBatchGenerating={isBatchGenerating}
        batchProgress={batchProgress}
        activeModel={activeModel}
        outputMode={outputMode}
        setOutputMode={setOutputMode}
        isStreaming={isStreaming}
        streamingTokens={streamingTokens}
        traditionalTokens={traditionalTokens}
        isGenerating={isGenerating}
        handleEnterEditor={handleEnterEditor}
        handleModalGenerate={handleModalGenerate}
        stopBatchGeneration={stopBatchGeneration}
        onOpenSettings={onOpenSettings}
      />

      <WritingEditModal
        isOpen={editModalOpen}
        selectedText={selectedText}
        editPrompts={editPrompts}
        selectedEditPromptId={selectedEditPromptId}
        customEditPrompt={customEditPrompt}
        outputMode={outputMode}
        activeModel={activeModel}
        isStreaming={isStreaming}
        isGenerating={isGenerating}
        streamingTokens={streamingTokens}
        traditionalTokens={traditionalTokens}
        onClose={onCloseEditModal}
        onSelectedEditPromptChange={onSelectedEditPromptChange}
        onCustomEditPromptChange={onCustomEditPromptChange}
        onOutputModeChange={setOutputMode}
        onSubmit={onEditSubmit}
      />

      <ExportChapterModal
        isOpen={exportModalOpen}
        project={project}
        chapters={project.chapters}
        selectedChapterIds={selectedExportChapterIds}
        format={exportFormat}
        exportProfileId={exportProfileId}
        onExportProfileChange={onExportProfileChange}
        exportProfile={exportProfile}
        exportCompile={exportCompile}
        onExportCompileChange={onExportCompileChange}
        exportUserProfiles={exportUserProfiles}
        onSaveExportProfile={onSaveExportProfile}
        onDeleteExportProfile={onDeleteExportProfile}
        exportError={exportError}
        onClose={onCloseExportModal}
        onToggleAll={onToggleAllExport}
        onToggleChapter={onToggleExportChapter}
        onFormatChange={onExportFormatChange}
        onConfirm={onConfirmExport}
      />

      <WritingSelectionMenu
        menuPos={menuPos}
        isEditModalOpen={editModalOpen}
        hasModel={hasModel}
        onOpenEditModal={onOpenEditModal}
        onAddAnnotation={onAddAnnotation}
        onClearSelection={onClearSelection}
      />

      <ChapterHistoryModal
        isOpen={isHistoryViewerOpen}
        chapter={activeChapter}
        onClose={onCloseHistoryViewer}
        onApplyContent={onApplyHistoryContent}
        onClearHistory={onClearChapterHistory}
        onUpdateChapter={onUpdateChapter}
      />

      {isGlobalHistorySidebarOpen && (
        <AIHistoryViewer
          project={project}
          onUpdate={onUpdate}
          onClose={onCloseGlobalHistorySidebar}
          mode="sidebar"
        />
      )}
    </>
  );
};

export default WritingEditorOverlayLayer;
