/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Copy, Download, FlaskConical, Plus, Trash2, Undo2, Upload } from 'lucide-react';
import React from 'react';

import { templateDisplayName,useTranslation } from '@/i18n';
import { getTemplateVariableDescriptions } from '@/shared/services/cards/cardPromptService';
import { dialogService } from '@/shared/services/dialogService';
import { Button } from '@/shared/ui/Button';
import { DialogTitle } from '@/shared/ui/Dialog';
import { ModalShell } from '@/shared/ui/ModalShell';
import { Select } from '@/shared/ui/Select';
import { Textarea } from '@/shared/ui/Textarea';
import { cn } from '@/shared/utils/cn';

import type { CardPromptCategory } from '../../../../shared/types';
import type { CardPromptSettingsPanelProps } from '../types';

const fieldLabel = 'mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground';

const CardPromptSettingsPanel: React.FC<CardPromptSettingsPanelProps> = ({
  localCardPrompts,
  editingCardPromptId,
  setEditingCardPromptId,
  cardPromptTestResult,
  importExportModalOpen,
  setImportExportModalOpen,
  importExportMode,
  setImportExportMode,
  importText,
  setImportText,
  addCardPrompt,
  removeCardPrompt,
  updateCardPrompt,
  duplicateCardPrompt,
  testCardPrompt,
  exportCardPrompts,
  importCardPrompts,
  resetCardPromptsToDefault,
}) => {
  const { t } = useTranslation(['settings', 'common']);
  const closeImportExport = () => {
    setImportExportModalOpen(false);
    setImportText('');
  };
  return (
    <div className="space-y-5">
      {/* 标题和操作栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-serif text-lg font-medium text-foreground">{t('cardPrompts.title')}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('cardPrompts.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setImportExportMode('export');
              setImportExportModalOpen(true);
            }}
          >
            <Download className="size-4" />
            {t('common:export')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setImportExportMode('import');
              setImportExportModalOpen(true);
            }}
          >
            <Upload className="size-4" />
            {t('common:import')}
          </Button>
          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={resetCardPromptsToDefault}>
            <Undo2 className="size-4" />
            {t('common:reset')}
          </Button>
          <Button variant="default" size="sm" onClick={addCardPrompt}>
            <Plus className="size-4" />
            {t('cardPrompts.newTemplate')}
          </Button>
        </div>
      </div>

      {/* 模板列表 */}
      <div className="space-y-3">
        {localCardPrompts.map(template => (
          <div
            key={template.id}
            className={cn(
              'rounded-lg border bg-card p-5 transition-colors',
              editingCardPromptId === template.id ? 'border-primary/40' : 'border-border hover:border-primary/20'
            )}
          >
            {/* 模板头部 */}
            <div className="mb-4 flex items-start justify-between">
              <div className="flex items-center gap-3">
                {template.isDefault && (
                  <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('cardPrompts.defaultBadge')}
                  </span>
                )}
                <input
                  className="w-48 border-none bg-transparent p-0 font-serif text-base font-medium text-foreground outline-none placeholder:text-muted-foreground/40 disabled:text-muted-foreground"
                  value={templateDisplayName(template)}
                  onChange={(e) => updateCardPrompt(template.id, { name: e.target.value, nameKey: undefined })}
                  placeholder={t('cardPrompts.namePlaceholder')}
                  disabled={template.isDefault}
                />
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-foreground"
                  onClick={() => duplicateCardPrompt(template.id)}
                  title={t('cardPrompts.duplicateTip')}
                >
                  <Copy className="size-4" />
                </Button>
                {!template.isDefault && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => removeCardPrompt(template.id)}
                    title={t('cardPrompts.deleteTip')}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-foreground"
                  onClick={() => setEditingCardPromptId(editingCardPromptId === template.id ? null : template.id)}
                  title={editingCardPromptId === template.id ? t('cardPrompts.collapse') : t('cardPrompts.edit')}
                >
                  {editingCardPromptId === template.id ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                </Button>
              </div>
            </div>

            {/* 模板基本信息 */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={fieldLabel}>{t('cardPrompts.categoryLabel')}</label>
                <Select
                  className="h-8 text-xs"
                  value={template.category}
                  onChange={(e) => updateCardPrompt(template.id, { category: e.target.value as CardPromptCategory })}
                  disabled={template.isDefault}
                  aria-label={t('cardPrompts.categoryLabel')}
                >
                  <option value="card-character">{t('cardPrompts.category.character')}</option>
                  <option value="card-location">{t('cardPrompts.category.location')}</option>
                  <option value="card-faction">{t('cardPrompts.category.faction')}</option>
                  <option value="card-timeline">{t('cardPrompts.category.timeline')}</option>
                  <option value="card-rule">{t('cardPrompts.category.rule')}</option>
                  <option value="card-magic">{t('cardPrompts.category.magic')}</option>
                  <option value="card-tech">{t('cardPrompts.category.tech')}</option>
                  <option value="card-history">{t('cardPrompts.category.history')}</option>
                </Select>
              </div>
              <div>
                <label className={fieldLabel}>{t('cardPrompts.requiredCountLabel')}</label>
                <div className="py-1.5 text-sm text-foreground/80">{t('cardPrompts.fieldsCount', { count: template.requiredFields?.length || 0 })}</div>
              </div>
              <div>
                <label className={fieldLabel}>{t('cardPrompts.variablesLabel')}</label>
                <div className="py-1.5 text-sm text-foreground/80">{t('cardPrompts.variablesCount', { count: template.variables?.length || 0 })}</div>
              </div>
            </div>

            {/* 展开编辑区域 */}
            {editingCardPromptId === template.id && (
              <div className="mt-4 border-t border-border pt-4">
                {/* 提示词内容 */}
                <div className="mb-4">
                  <label className={fieldLabel}>
                    {t('cardPrompts.contentLabel')}
                    <span className="ml-2 font-normal normal-case tracking-normal text-foreground/70">{t('cardPrompts.mustIncludeVar')}</span>
                  </label>
                  <Textarea
                    className=" h-48 resize-none bg-muted/40 font-mono text-sm"
                    value={template.content}
                    onChange={(e) => updateCardPrompt(template.id, { content: e.target.value })}
                    placeholder={t('cardPrompts.contentPlaceholder')}
                    disabled={template.isDefault}
                  />
                </div>

                {/* 必填字段配置 */}
                <div className="mb-4">
                  <label className={fieldLabel}>{t('cardPrompts.requiredFieldsLabel')}</label>
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <div className="mb-2 text-xs text-muted-foreground">
                      {t('cardPrompts.requiredFieldsHint')}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {template.requiredFields?.map((field, idx) => (
                        <span key={idx} className="rounded border border-border bg-background px-1.5 py-0.5 text-xs text-muted-foreground">
                          {field}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 可用变量提示 */}
                <div className="mb-4">
                  <label className={fieldLabel}>{t('cardPrompts.variablesLabel')}</label>
                  <div className="flex flex-wrap gap-1.5">
                    {getTemplateVariableDescriptions().map(v => (
                      <span key={v.variable} className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary" title={v.description}>
                        {v.variable}
                        {v.required && <span className="ml-1 text-destructive">*</span>}
                      </span>
                    ))}
                  </div>
                </div>

                {/* 测试按钮和结果 */}
                {!template.isDefault && (
                  <div className="flex items-center justify-between">
                    <Button variant="secondary" size="sm" onClick={() => testCardPrompt(template)}>
                      <FlaskConical className="size-4" />
                      {t('cardPrompts.validate')}
                    </Button>
                    {cardPromptTestResult?.templateId === template.id && (
                      <div className={cn('text-xs', cardPromptTestResult.isValid ? 'text-success' : 'text-destructive')}>
                        {cardPromptTestResult.isValid ? (
                          <span className="inline-flex items-center gap-1"><CheckCircle2 className="size-4" />{t('cardPrompts.valid')}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1"><AlertCircle className="size-4" />{cardPromptTestResult.errors.join(', ')}</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 导入/导出模态框 */}
      <ModalShell open={importExportModalOpen} onOpenChange={(open) => { if (!open) closeImportExport(); }} bare contentClassName="flex max-h-[80vh] w-full max-w-2xl flex-col gap-0 overflow-hidden p-0">
          <div className="border-b border-border bg-muted/30 px-6 py-4">
            <DialogTitle className="font-serif text-lg">
              {importExportMode === 'import' ? t('cardPrompts.importTitle') : t('cardPrompts.exportTitle')}
            </DialogTitle>
          </div>
          <div className=" flex-1 overflow-y-auto px-6 py-5">
            {importExportMode === 'export' ? (
              <div>
                <p className="mb-3 text-sm text-muted-foreground">{t('cardPrompts.exportHint')}</p>
                <Textarea
                  className="h-64 resize-none bg-muted/40 font-mono text-xs"
                  value={exportCardPrompts()}
                  readOnly
                />
                <Button
                  className="mt-4 w-full"
                  onClick={() => {
                    void navigator.clipboard.writeText(exportCardPrompts());
                    dialogService.alert(t('cardPrompts.copied'));
                  }}
                >
                  <Copy className="size-4" />{t('cardPrompts.copyToClipboard')}
                </Button>
              </div>
            ) : (
              <div>
                <p className="mb-3 text-sm text-muted-foreground">{t('cardPrompts.importHint')}</p>
                <Textarea
                  className="h-64 resize-none bg-muted/40 font-mono text-xs"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder={t('cardPrompts.pastePlaceholder')}
                />
                <Button
                  className="mt-4 w-full"
                  onClick={() => {
                    const result = importCardPrompts(importText);
                    if (result.success) {
                      dialogService.alert(t('cardPrompts.importSuccess', { count: result.count ?? 0 }));
                      closeImportExport();
                    } else {
                      dialogService.alert(result.error ?? t('cardPrompts.importFailed'));
                    }
                  }}
                  disabled={!importText.trim()}
                >
                  <Upload className="size-4" />{t('cardPrompts.importTitle')}
                </Button>
              </div>
            )}
          </div>
    </ModalShell>
    </div>
  );
};

export default CardPromptSettingsPanel;
