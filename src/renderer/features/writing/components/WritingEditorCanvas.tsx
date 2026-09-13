/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import React from 'react';

import { cn } from '@/shared/utils/cn';

import type { WritingEditorCanvasProps } from '../types';
import TipTapCanvas from './TipTapCanvas';
import WritingEditorStatusOverlay from './WritingEditorStatusOverlay';

const WritingEditorCanvas: React.FC<WritingEditorCanvasProps> = ({
  editorRef,
  activeChapterId,
  content,
  locked,
  collaboration,
  screenplayFormat,
  isFocusMode,
  typewriter,
  isGenerating,
  isStreaming,
  isBatchGenerating,
  targetWordCount,
  selectedKnowledgeCount,
  streamingContentLength,
  batchProgress,
  onMouseUp,
  onKeyUp,
  onMouseMove,
  onContentChange,
  onNewChapter,
  onStopStreaming,
  onStopBatchGeneration,
  streamingTokens,
  traditionalTokens,
  stoppedPartialLength,
  onKeepStoppedPartial,
  onDiscardStoppedPartial,
}) => {
  return (
    <div className={cn(' flex flex-1 justify-center overflow-y-auto p-10 transition-colors', isFocusMode ? 'bg-background' : 'bg-muted/30')}>
      <TipTapCanvas
        ref={editorRef}
        activeChapterId={activeChapterId}
        content={content}
        locked={locked}
        collaboration={collaboration}
        screenplayFormat={screenplayFormat}
        isFocusMode={isFocusMode}
        isGenerating={isGenerating}
        isStreaming={isStreaming}
        typewriter={typewriter}
        onNewChapter={onNewChapter}
        onContentChange={onContentChange}
        onMouseUp={onMouseUp}
        onKeyUp={onKeyUp}
        onMouseMove={onMouseMove}
      />
      <WritingEditorStatusOverlay
        isGenerating={isGenerating}
        isStreaming={isStreaming}
        isBatchGenerating={isBatchGenerating}
        targetWordCount={targetWordCount}
        selectedKnowledgeCount={selectedKnowledgeCount}
        streamingContentLength={streamingContentLength}
        batchProgress={batchProgress}
        streamingTokens={streamingTokens}
        traditionalTokens={traditionalTokens}
        stoppedPartialLength={stoppedPartialLength}
        onStopStreaming={onStopStreaming}
        onStopBatchGeneration={onStopBatchGeneration}
        onKeepStoppedPartial={onKeepStoppedPartial}
        onDiscardStoppedPartial={onDiscardStoppedPartial}
      />
    </div>
  );
};

export default WritingEditorCanvas;
