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

import { useSettingsStore } from '@/app/stores/settingsStore';
import { useTranslation } from '@/i18n';
import { useSpeechPlayback } from '@/shared/hooks/useSpeechPlayback';
import { Button } from '@/shared/ui/Button';
import { Checkbox } from '@/shared/ui/Checkbox';
import { Input } from '@/shared/ui/Input';
import { Select } from '@/shared/ui/Select';
import SidePanel from '@/shared/ui/SidePanel';
import { TabBar } from '@/shared/ui/TabBar';
import { Textarea } from '@/shared/ui/Textarea';

import { createSnippet, readSnippets, saveSnippets, type Snippet } from '../services/snippetStore';
import { findProofreadIssues, parseSensitiveWords, type ProofreadIssue,readSensitiveWordsRaw, writeSensitiveWords } from '../services/writingToolsService';
import type { PaperStyle } from '../types';
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
  paper: PaperStyle;
  onPaperChange: (value: PaperStyle) => void;
  /** 宽屏：面板自带外框（标题栏 + 关闭 + 拖宽）；窄视口抽屉里由调用方给外框。 */
  width?: number;
  onWidthChange?: (width: number) => void;
  onClose: () => void;
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
  paper,
  onPaperChange,
  width,
  onWidthChange,
  onClose,
}) => {
  const { t } = useTranslation('writing');
  const [tab, setTab] = useState<ToolsTab>('format');
  const [indent, setIndent] = useState(false);
  const [snippets, setSnippets] = useState<Snippet[]>(() => readSnippets());
  const [newLabel, setNewLabel] = useState('');
  const [newText, setNewText] = useState('');

  const [sensitiveRaw, setSensitiveRaw] = useState(() => readSensitiveWordsRaw());
  const sensitiveWords = useMemo(() => parseSensitiveWords(sensitiveRaw), [sensitiveRaw]);
  const issues = useMemo(() => findProofreadIssues(chapter?.content ?? '', sensitiveWords), [chapter?.content, sensitiveWords]);

  const tts = useSettingsStore((s) => s.tts);
  const speech = useSpeechPlayback(tts);

  const updateSnippets = (next: Snippet[]) => {
    setSnippets(next);
    saveSnippets(next);
  };

  const body = (
    <div className="space-y-4">
      <TabBar<ToolsTab>
        value={tab}
        onChange={setTab}
        variant="block"
        items={[
          { id: 'format', label: t('tools.tabs.format') },
          { id: 'proofread', label: t('tools.tabs.proofread') },
          { id: 'snippets', label: t('tools.tabs.snippets') },
          { id: 'preview', label: t('tools.tabs.preview') },
        ]}
      />

      {tab === 'format' && (
        <div className="space-y-4">
          <section className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground">{t('tools.format.applyTitle')}</h4>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox className="mt-0.5" checked={indent} onChange={(event) => setIndent(event.target.checked)} />
              <span>{t('tools.format.indent')}</span>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={!chapter} onClick={() => chapter && onFormatChapter(chapter.id, indent)}>
                {t('tools.format.current')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => onFormatAll(indent)}>
                {t('tools.format.all')}
              </Button>
            </div>
          </section>

          <section className="space-y-2 border-t border-border pt-4">
            <h4 className="text-xs font-medium text-muted-foreground">{t('tools.format.pageTitle')}</h4>
            <div className="flex items-center gap-2">
              <span className="sr-only">{t('tools.format.paper')}</span>
              <Select value={paper} onChange={(event) => onPaperChange(event.target.value as PaperStyle)} className="h-8 flex-1 text-xs" aria-label={t('tools.format.paper')}>
                <option value="plain">{t('tools.format.paperPlain')}</option>
                <option value="grid">{t('tools.format.paperGrid')}</option>
                <option value="lined">{t('tools.format.paperLined')}</option>
                <option value="sepia">{t('tools.format.paperSepia')}</option>
              </Select>
              {speech.supported &&
                (speech.speaking ? (
                  <Button size="sm" variant="outline" onClick={speech.stop}>
                    {t('tools.format.stopRead')}
                    {speech.progress && <span className="tabular-nums text-muted-foreground">{speech.progress.index}/{speech.progress.total}</span>}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled={!chapter?.content.trim()} onClick={() => chapter && speech.start(chapter.content)}>
                    {t('tools.format.readAloud')}
                  </Button>
                ))}
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox className="mt-0.5" checked={screenplayFormat} onChange={(event) => onToggleScreenplayFormat(event.target.checked)} />
              <span>{t('tools.format.screenplay')}</span>
            </label>
          </section>
        </div>
      )}

      {tab === 'proofread' && (
        <div className="space-y-3">
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">{t('tools.proofread.sensitiveLabel')}</summary>
            <Textarea
              value={sensitiveRaw}
              onChange={(event) => {
                setSensitiveRaw(event.target.value);
                writeSensitiveWords(event.target.value);
              }}
              placeholder={t('tools.proofread.sensitivePlaceholder')}
              rows={3}
              className="mt-1 text-xs"
            />
          </details>
          {issues.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('tools.proofread.empty')}</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">{t('tools.proofread.count', { count: issues.length })}</p>
              <ul className="max-h-64 space-y-1 overflow-y-auto text-xs">
                {issues.map((issue, index) => (
                  <li key={`${issue.index}-${index}`} className="flex items-center gap-2 rounded border border-border px-2 py-1">
                    <span className="font-medium">{issue.original}</span>
                    {issue.rule === 'sensitive' ? (
                      <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-2xs text-destructive">{t('tools.proofread.sensitive')}</span>
                    ) : (
                      <span className="text-muted-foreground">→ {issue.suggestion}</span>
                    )}
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
                  <Button size="sm" variant="ghost" iconOnly aria-label={t('tools.snippets.delete')} onClick={() => updateSnippets(snippets.filter((item) => item.id !== snippet.id))}>
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

  // 窄视口抽屉由调用方提供外框与关闭按钮；宽屏面板自带外框。
  if (width === undefined || !onWidthChange) return body;

  return (
    <SidePanel
      title={t('toolbar.toolsTitle')}
      side="right"
      width={width}
      onWidthChange={onWidthChange}
      onClose={onClose}
      closeLabel={t('sidebar.close')}
      resizeLabel={t('sidebar.resize')}
    >
      {body}
    </SidePanel>
  );
};

export default WritingToolsPanel;
