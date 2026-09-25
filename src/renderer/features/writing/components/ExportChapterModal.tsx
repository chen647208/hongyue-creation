/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { BuildProfile } from '@core/build';
import type { PluginHost } from '@core/plugin';
import { AlignLeft, Check, Code, FileDown, FileOutput, FileText, Globe, type LucideIcon,Package, Puzzle, Trash2 } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { assistantRuntime } from '@/shared/services/assistantRuntime';
import { buildProfileRegistry, profileKey } from '@/shared/services/buildProfiles';
import { Button } from '@/shared/ui/Button';
import { Checkbox } from '@/shared/ui/Checkbox';
import { DialogTitle } from '@/shared/ui/Dialog';
import { Input } from '@/shared/ui/Input';
import MarkdownView from '@/shared/ui/Markdown';
import { ModalShell } from '@/shared/ui/ModalShell';
import { Select } from '@/shared/ui/Select';
import { cn } from '@/shared/utils/cn';

import type { Chapter, Project } from '../../../../shared/types';
import { computeChapterStats } from '../services/writingStatsService';
import type { ExportCompileOptions,ExportFormat } from '../types';
import { buildExportContent, listBuildContentTypes, listPluginRendererOptions, setSelectedExportRenderer } from '../utils';

interface ExportChapterModalProps {
  isOpen: boolean;
  project: Project;
  chapters: Chapter[];
  selectedChapterIds: Set<string>;
  format: ExportFormat;
  exportProfileId: string;
  onExportProfileChange: (id: string) => void;
  exportProfile: BuildProfile;
  exportCompile: ExportCompileOptions;
  onExportCompileChange: (patch: Partial<ExportCompileOptions>) => void;
  exportUserProfiles: BuildProfile[];
  onSaveExportProfile: (name: string) => void;
  onDeleteExportProfile: (id: string) => void;
  exportError: string | null;
  onClose: () => void;
  onToggleAll: () => void;
  onToggleChapter: (chapterId: string) => void;
  onFormatChange: (format: ExportFormat) => void;
  onConfirm: () => void;
}

const FORMAT_OPTIONS: Array<{ value: ExportFormat; label: string; icon: LucideIcon }> = [
  { value: 'txt', label: 'TXT', icon: AlignLeft },
  { value: 'md', label: 'Markdown', icon: Code },
  { value: 'html', label: 'HTML', icon: Globe },
  { value: 'rtf', label: 'RTF', icon: FileText },
  { value: 'pdf', label: 'PDF', icon: FileDown },
  { value: 'epub', label: 'ePub', icon: Package },
  { value: 'docx', label: 'DOCX', icon: Package },
  { value: 'odt', label: 'ODT', icon: Package },
];

const MATERIAL_POLICY_OPTIONS = ['exclude', 'include', 'prefer'] as const;

/**
 * 节点多选：把章节指派为分卷/前言/后置角色。
 * 候选项为本次导出选中的章节；点按切换，选中态用主色标记。
 */
const MatterPicker: React.FC<{
  label: string;
  hint: string;
  chapters: Chapter[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}> = ({ label, hint, chapters, selectedIds, onToggle }) => {
  const selected = new Set(selectedIds);
  return (
    <div className="flex items-start gap-2">
      <span className="w-12 shrink-0 pt-0.5 text-xs text-muted-foreground">{label}</span>
      {chapters.length === 0 ? (
        <span className="pt-0.5 text-xs text-muted-foreground">{hint}</span>
      ) : (
        <div className="flex max-h-20 flex-1 flex-wrap gap-1 overflow-y-auto">
          {chapters.map((chapter) => {
            const on = selected.has(chapter.id);
            return (
              <button
                key={chapter.id}
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(chapter.id)}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-2xs transition-colors',
                  on ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-accent/40',
                )}
              >
                {chapter.title}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/** 类型多选：把某一类节点整体指派为分卷标题。 */
const TypePicker: React.FC<{
  label: string;
  hint: string;
  options: Array<{ type: string; label: string }>;
  selectedTypes: string[];
  onToggle: (type: string) => void;
}> = ({ label, hint, options, selectedTypes, onToggle }) => {
  const selected = new Set(selectedTypes);
  return (
    <div className="flex items-start gap-2">
      <span className="w-12 shrink-0 pt-0.5 text-xs text-muted-foreground">{label}</span>
      {options.length === 0 ? (
        <span className="pt-0.5 text-xs text-muted-foreground">{hint}</span>
      ) : (
        <div className="flex max-h-20 flex-1 flex-wrap gap-1 overflow-y-auto">
          {options.map((option) => {
            const on = selected.has(option.type);
            return (
              <button
                key={option.type}
                type="button"
                aria-pressed={on}
                title={option.type}
                onClick={() => onToggle(option.type)}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-2xs transition-colors',
                  on ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-accent/40',
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const toggleId = (ids: string[], id: string): string[] => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

const ExportChapterModal: React.FC<ExportChapterModalProps> = ({
  isOpen,
  project,
  chapters,
  selectedChapterIds,
  format,
  exportProfileId,
  onExportProfileChange,
  exportProfile,
  exportCompile,
  onExportCompileChange,
  exportUserProfiles,
  onSaveExportProfile,
  onDeleteExportProfile,
  exportError,
  onClose,
  onToggleAll,
  onToggleChapter,
  onFormatChange,
  onConfirm,
}) => {
  const { t } = useTranslation('writing');
  const sortedChapters = [...chapters].sort((a, b) => a.order - b.order);
  // 角色选择器候选项限定为本次导出选中的章节（未选中的不会出现在产物里）。
  const selectableChapters = sortedChapters.filter((chapter) => selectedChapterIds.has(chapter.id));
  const volumeTypeOptions = useMemo(() => listBuildContentTypes(project), [project]);
  const [showPreview, setShowPreview] = useState(false);
  const [profileName, setProfileName] = useState('');
  // 显式选中的插件渲染器（null = 用内置渲染器）；关闭对话框时复位。
  const [selectedRendererId, setSelectedRendererId] = useState<string | null>(null);
  // 插件宿主就绪后列出已注册渲染器；未就绪（无插件系统）时格式条只有内置格式。
  const [rendererHost, setRendererHost] = useState<PluginHost | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    const runtime = assistantRuntime();
    if (!runtime) return;
    let alive = true;
    void runtime.pluginHostPromise.then((host) => {
      if (alive) setRendererHost(host);
    });
    return () => {
      alive = false;
    };
  }, [isOpen]);
  const rendererOptions = useMemo(() => listPluginRendererOptions(rendererHost), [rendererHost]);
  const unavailableRenderers = rendererOptions.filter((option) => option.unavailableReason !== null);
  // 落盘执行在 useChapterExport：当前选择经 utils 的显式渲染器 seam 传给 runBuild。
  useEffect(() => {
    setSelectedExportRenderer(selectedRendererId);
  }, [selectedRendererId]);
  // 关闭即回到内置渲染器，避免下次打开误用上次选择的插件渲染器。
  useEffect(() => {
    if (!isOpen) setSelectedRendererId(null);
  }, [isOpen]);

  /** 切换导出格式：选内置格式清空显式渲染器；选插件渲染器记住其 id 并切到目标格式。 */
  const selectFormat = (value: ExportFormat, rendererId: string | null = null) => {
    setSelectedRendererId(rendererId);
    onFormatChange(value);
  };
  const profiles = buildProfileRegistry.list();
  const selectedProfile = profiles.find((p) => profileKey(p) === exportProfileId);
  const isUserProfile = selectedProfile ? exportUserProfiles.some((p) => profileKey(p) === exportProfileId) : false;
  const previewText = useMemo(
    // PDF/ePub/DOCX 预览复用 HTML 渲染（打印即所见）
    () =>
      showPreview
        ? buildExportContent(
            project,
            selectedChapterIds,
            format === 'pdf' || format === 'epub' || format === 'docx' || format === 'odt' ? 'html' : format,
            exportProfile,
          )
        : '',
    [showPreview, project, selectedChapterIds, format, exportProfile],
  );
  const previewStats = useMemo(() => (showPreview ? computeChapterStats(previewText) : null), [showPreview, previewText]);

  const handleSave = () => {
    onSaveExportProfile(profileName);
    setProfileName('');
  };

  return (
    <ModalShell
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }} bare contentClassName="flex max-h-[85vh] w-full max-w-lg flex-col gap-0 overflow-hidden p-0">
        <div className="border-b border-border bg-muted/30 px-6 py-4">
          <DialogTitle className="font-serif text-lg">{t('export.title')}</DialogTitle>
        </div>

        {profiles.length > 0 && (
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-6 py-2">
            <span className="text-xs text-muted-foreground">{t('export.presetLabel')}</span>
            <Select
              value={exportProfileId}
              onChange={(e) => onExportProfileChange(e.target.value)}
              aria-label={t('export.presetLabel')}
              className="h-7 w-auto min-w-[160px] text-xs"
            >
              <option value="">{t('export.presetDefault')}</option>
              {profiles.map((p) => (
                <option key={profileKey(p)} value={profileKey(p)}>{p.name}</option>
              ))}
            </Select>
            {isUserProfile && (
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                className="h-7 px-2 text-muted-foreground"
                onClick={() => onDeleteExportProfile(exportProfileId)}
                title={t('export.deleteProfileTitle')}
                aria-label={t('export.deleteProfileTitle')}
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        )}

        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-6 py-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            {t('export.materialLabel')}
            <Select
              value={exportCompile.materialPolicy}
              onChange={(e) => onExportCompileChange({ materialPolicy: e.target.value as ExportCompileOptions['materialPolicy'] })}
              aria-label={t('export.materialLabel')}
              className="h-7 w-auto min-w-[110px] text-xs"
            >
              {MATERIAL_POLICY_OPTIONS.map((value) => (
                <option key={value} value={value}>{t(`export.material_${value}`)}</option>
              ))}
            </Select>
          </label>
          <Checkbox
            id="export-toc"
            checked={exportCompile.tocEnabled}
            onChange={(e) => onExportCompileChange({ tocEnabled: e.target.checked })}
            label={t('export.tocLabel')}
            className="text-xs"
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            {t('export.tocDepthLabel')}
            <Select
              value={String(exportCompile.tocDepth)}
              onChange={(e) => onExportCompileChange({ tocDepth: Number(e.target.value) })}
              disabled={!exportCompile.tocEnabled}
              aria-label={t('export.tocDepthLabel')}
              className="h-7 w-auto min-w-[56px] text-xs"
            >
              {[1, 2, 3, 4, 5, 6].map((depth) => (
                <option key={depth} value={String(depth)}>{depth}</option>
              ))}
            </Select>
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            {t('export.headingLevelLabel')}
            <Select
              value={String(exportCompile.headingLevel)}
              onChange={(e) => onExportCompileChange({ headingLevel: Number(e.target.value) })}
              aria-label={t('export.headingLevelLabel')}
              className="h-7 w-auto min-w-[64px] text-xs"
            >
              {[1, 2, 3, 4].map((level) => (
                <option key={level} value={String(level)}>{level}</option>
              ))}
            </Select>
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            {t('export.rangeLabel')}
            <Input
              type="number"
              min={1}
              value={exportCompile.rangeFrom ?? ''}
              onChange={(e) => onExportCompileChange({ rangeFrom: e.target.value === '' ? null : Number(e.target.value) })}
              aria-label={t('export.rangeFrom')}
              placeholder={t('export.rangeFrom')}
              className="h-7 w-16 text-xs"
            />
            <span aria-hidden>-</span>
            <Input
              type="number"
              min={1}
              value={exportCompile.rangeTo ?? ''}
              onChange={(e) => onExportCompileChange({ rangeTo: e.target.value === '' ? null : Number(e.target.value) })}
              aria-label={t('export.rangeTo')}
              placeholder={t('export.rangeTo')}
              className="h-7 w-16 text-xs"
            />
          </label>
        </div>

        <div className="shrink-0 space-y-1.5 border-b border-border px-6 py-2">
          <div className="text-xs font-medium text-muted-foreground">{t('export.compileSection')}</div>
          <TypePicker
            label={t('export.volumeTypeLabel')}
            hint={t('export.matterEmpty')}
            options={volumeTypeOptions}
            selectedTypes={exportCompile.volumeTypes}
            onToggle={(type) => onExportCompileChange({ volumeTypes: toggleId(exportCompile.volumeTypes, type) })}
          />
          <MatterPicker
            label={t('export.volumeLabel')}
            hint={t('export.matterEmpty')}
            chapters={selectableChapters}
            selectedIds={exportCompile.volumeIds}
            onToggle={(id) => onExportCompileChange({ volumeIds: toggleId(exportCompile.volumeIds, id) })}
          />
          <MatterPicker
            label={t('export.frontMatterLabel')}
            hint={t('export.matterEmpty')}
            chapters={selectableChapters}
            selectedIds={exportCompile.frontMatterIds}
            onToggle={(id) => onExportCompileChange({ frontMatterIds: toggleId(exportCompile.frontMatterIds, id) })}
          />
          <MatterPicker
            label={t('export.backMatterLabel')}
            hint={t('export.matterEmpty')}
            chapters={selectableChapters}
            selectedIds={exportCompile.backMatterIds}
            onToggle={(id) => onExportCompileChange({ backMatterIds: toggleId(exportCompile.backMatterIds, id) })}
          />
        </div>

        <div className="flex shrink-0 items-center gap-2 border-b border-border px-6 py-2">
          <Input
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            placeholder={t('export.profilePlaceholder')}
            aria-label={t('export.profilePlaceholder')}
            className="h-7 flex-1 text-xs"
          />
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleSave}>
            {t('export.saveProfile')}
          </Button>
        </div>

        {exportError && (
          <div role="alert" className="shrink-0 border-b border-destructive/30 bg-destructive/10 px-6 py-2 text-xs text-destructive">
            {exportError}
          </div>
        )}

        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-6 py-3">
          <div className="text-sm text-muted-foreground">
            {t('export.selectedBefore')}
            <span className="font-medium tabular-nums text-foreground">{selectedChapterIds.size}</span>
            {t('export.selectedAfter', { total: chapters.length })}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-1 rounded-lg bg-muted p-1">
              {FORMAT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => selectFormat(opt.value)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    format === opt.value && selectedRendererId === null ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                  title={t('export.exportAsTitle', { format: opt.label })}
                >
                  <opt.icon className="size-3.5" /> {opt.label}
                </button>
              ))}
              {rendererOptions.map((opt) => {
                const active = selectedRendererId === opt.id;
                const reason = opt.unavailableReason;
                // 提示同时给渲染器标识与原因；不可用时原因就是全部提示内容。
                const hint = reason ? `${opt.id}: ${reason}` : t('export.exportAsTitle', { format: `${opt.id}（${opt.format}）` });
                return (
                  <button
                    key={opt.id}
                    // 插件渲染器可声明内置之外的新格式 id：落盘分支（扩展名/打印/打包）按格式 id 分发
                    onClick={() => selectFormat(opt.format as ExportFormat, opt.id)}
                    disabled={reason !== null}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                      active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                      reason !== null && 'cursor-not-allowed opacity-50 hover:text-muted-foreground'
                    )}
                    title={hint}
                    aria-label={hint}
                  >
                    <Puzzle className="size-3.5" /> {opt.id}
                  </button>
                );
              })}
            </div>
            {unavailableRenderers.length > 0 && (
              <p className="text-2xs text-muted-foreground">
                {t('export.rendererUnavailable', {
                  items: unavailableRenderers
                    .map((opt) => `${opt.id}: ${opt.unavailableReason ?? ''}`)
                    .join('; '),
                })}
              </p>
            )}
          </div>
          <Button variant="link" size="sm" className="h-auto shrink-0 p-0 text-xs whitespace-nowrap" onClick={onToggleAll}>
            {selectedChapterIds.size === chapters.length ? t('export.deselectAll') : t('export.selectAll')}
          </Button>
          <Button variant="link" size="sm" className="h-auto shrink-0 p-0 text-xs whitespace-nowrap" onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? t('export.previewHide') : t('export.previewShow')}
          </Button>
        </div>

        <div className=" flex-1 space-y-2 overflow-y-auto bg-muted/20 p-4">
          {sortedChapters.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">{t('export.noChapters')}</div>
          ) : (
            sortedChapters.map((chapter) => {
              const isSelected = selectedChapterIds.has(chapter.id);
              const wordLength = (chapter.content || '').length;

              return (
                <div
                  key={chapter.id}
                  role="checkbox"
                  aria-checked={isSelected}
                  tabIndex={0}
                  onClick={() => onToggleChapter(chapter.id)}
                  onKeyDown={(event) => {
                    if (event.key === ' ' || event.key === 'Enter') {
                      event.preventDefault();
                      onToggleChapter(chapter.id);
                    }
                  }}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors select-none',
                    isSelected ? 'border-primary/40 bg-primary/5' : 'border-border bg-card hover:bg-accent/40'
                  )}
                >
                  <span
                    className={cn(
                      'flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
                      isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background'
                    )}
                  >
                    {isSelected && <Check className="size-3" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h4 className={cn('flex items-center gap-1.5 truncate text-sm', isSelected ? 'font-medium text-foreground' : 'text-foreground/80')}>
                      <span className="truncate">{t('export.chapterEntry', { num: chapter.order + 1, title: chapter.title })}</span>
                      {chapter.material && (
                        <span className="shrink-0 rounded bg-primary/10 px-1 py-0.5 text-2xs text-primary">{t('navigation.materialBadge')}</span>
                      )}
                    </h4>
                    <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{t('export.wordCountLabel', { count: wordLength })}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {showPreview && (
          <div className="flex min-h-0 flex-1 flex-col border-t border-border">
            <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-2 text-xs text-muted-foreground">
              <span>{t('export.previewTitle')}</span>
              {previewStats && <span className="tabular-nums">{t('export.previewCharCount', { count: previewStats.charCount })}</span>}
            </div>
            <div className=" min-h-0 flex-1 overflow-auto bg-background p-4">
              {format === 'html' ? (
                <iframe title="preview" srcDoc={previewText} className="h-80 w-full rounded-md border border-border bg-doc-preview" />
              ) : format === 'md' ? (
                <MarkdownView content={previewText} />
              ) : (
                <pre className="whitespace-pre-wrap font-sans text-sm leading-7">{previewText}</pre>
              )}
            </div>
          </div>
        )}

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-muted/30 px-6 py-4">
          <Button variant="ghost" onClick={onClose}>{t('export.cancel')}</Button>
          <Button onClick={onConfirm}>
            <FileOutput className="size-4" /> {t('export.confirmExport', { format: format.toUpperCase() })}
          </Button>
        </div>
    </ModalShell>
  );
};

export default ExportChapterModal;
