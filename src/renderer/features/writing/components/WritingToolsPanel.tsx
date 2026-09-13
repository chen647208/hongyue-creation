/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 写作工具：一键排版、规则纠错、快捷词、多平台预览。 */
import type { Chapter, Project } from '@shared/types';
import { Plus, Trash2 } from 'lucide-react';
import React, { useMemo, useState } from 'react';

import { useTranslation } from '@/i18n';
import { Button } from '@/shared/ui/Button';
import { Checkbox } from '@/shared/ui/Checkbox';
import { Input } from '@/shared/ui/Input';
import { TabBar } from '@/shared/ui/TabBar';

import { createSnippet, readSnippets, saveSnippets, type Snippet } from '../services/snippetStore';
import { findProofreadIssues, type ProofreadIssue } from '../services/writingToolsService';
import ReaderPreview from './ReaderPreview';

type ToolsTab = 'format' | 'proofread' | 'snippets' | 'preview';

interface WritingToolsPanelProps {
  project: Project;
  chapter: Chapter | null;
  onFormatChapter: (chapterId: string, indent: boolean) => void;
  onFormatAll: (indent: boolean) => void;
  onApplyProofread: (chapterId: string, issues: ProofreadIssue[]) => void;
  onInsertSnippet: (text: string) => void;
  screenplayFormat: boolean;
  onToggleScreenplayFormat: (value: boolean) => void;
}

const WritingToolsPanel: React.FC<WritingToolsPanelProps> = ({
  project,
  chapter,
  onFormatChapter,
  onFormatAll,
  onApplyProofread,
  onInsertSnippet,
  screenplayFormat,
  onToggleScreenplayFormat,
}) => {
  const { t } = useTranslation('writing');
  const [tab, setTab] = useState<ToolsTab>('format');
  const [indent, setIndent] = useState(false);
  const [snippets, setSnippets] = useState<Snippet[]>(() => readSnippets());
  const [newLabel, setNewLabel] = useState('');
  const [newText, setNewText] = useState('');

  const issues = useMemo(() => findProofreadIssues(chapter?.content ?? ''), [chapter?.content]);

  const updateSnippets = (next: Snippet[]) => {
    setSnippets(next);
    saveSnippets(next);
  };

  return (
    <div className="space-y-4">
      <TabBar<ToolsTab>
        value={tab}
        onChange={setTab}
        variant="underline"
        items={[
          { id: 'format', label: t('tools.tabs.format') },
          { id: 'proofread', label: t('tools.tabs.proofread') },
          { id: 'snippets', label: t('tools.tabs.snippets') },
          { id: 'preview', label: t('tools.tabs.preview') },
        ]}
      />

      {tab === 'format' && (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={indent} onChange={(event) => setIndent(event.target.checked)} />
            {t('tools.format.indent')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={screenplayFormat} onChange={(event) => onToggleScreenplayFormat(event.target.checked)} />
            {t('tools.format.screenplay')}
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={!chapter} onClick={() => chapter && onFormatChapter(chapter.id, indent)}>
              {t('tools.format.current')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => onFormatAll(indent)}>
              {t('tools.format.all')}
            </Button>
          </div>
        </div>
      )}

      {tab === 'proofread' && (
        <div className="space-y-3">
          {issues.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('tools.proofread.empty')}</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">{t('tools.proofread.count', { count: issues.length })}</p>
              <ul className="max-h-64 space-y-1 overflow-y-auto text-xs">
                {issues.map((issue, index) => (
                  <li key={`${issue.index}-${index}`} className="flex items-center gap-2 rounded border border-border px-2 py-1">
                    <span className="font-medium">{issue.original}</span>
                    <span className="text-muted-foreground">→ {issue.suggestion}</span>
                  </li>
                ))}
              </ul>
              <Button size="sm" disabled={!chapter} onClick={() => chapter && onApplyProofread(chapter.id, issues)}>
                {t('tools.proofread.applyAll')}
              </Button>
            </>
          )}
        </div>
      )}

      {tab === 'snippets' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <Input value={newLabel} onChange={(event) => setNewLabel(event.target.value)} placeholder={t('tools.snippets.labelPlaceholder')} className="h-8 max-w-40 text-xs" />
            <Input value={newText} onChange={(event) => setNewText(event.target.value)} placeholder={t('tools.snippets.textPlaceholder')} className="h-8 max-w-64 text-xs" />
            <Button
              size="sm"
              variant="outline"
              disabled={!newLabel.trim() || !newText.trim()}
              onClick={() => {
                updateSnippets([...snippets, createSnippet(newLabel.trim(), newText.trim())]);
                setNewLabel('');
                setNewText('');
              }}
            >
              <Plus className="size-3.5" />
              {t('tools.snippets.add')}
            </Button>
          </div>
          {snippets.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('tools.snippets.empty')}</p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {snippets.map((snippet) => (
                <li key={snippet.id} className="flex items-center gap-2 rounded border border-border px-2 py-1 text-xs">
                  <span className="w-24 shrink-0 truncate font-medium">{snippet.label}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{snippet.text}</span>
                  <Button size="sm" variant="ghost" onClick={() => onInsertSnippet(snippet.text)}>{t('tools.snippets.insert')}</Button>
                  <Button size="sm" variant="ghost" aria-label={t('tools.snippets.delete')} onClick={() => updateSnippets(snippets.filter((item) => item.id !== snippet.id))}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'preview' && <ReaderPreview project={project} chapter={chapter} />}
    </div>
  );
};

export default WritingToolsPanel;
