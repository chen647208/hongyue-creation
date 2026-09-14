/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 一致性检查提示词模板管理组件
 */

import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Copy, Download, FileText, FlaskConical, Plus, Trash2, Undo2, Upload } from 'lucide-react';
import React, { useMemo,useState } from 'react';

import { dt,templateDisplayName, useTranslation } from '@/i18n';
import { ConsistencyCheckPromptService } from '@/shared/services/consistencyCheckPromptService';
import { dialogService } from '@/shared/services/dialogService';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Input } from '@/shared/ui/Input';
import { Label } from '@/shared/ui/Label';
import { ModalShell } from '@/shared/ui/ModalShell';
import { Select } from '@/shared/ui/Select';
import { Textarea } from '@/shared/ui/Textarea';
import { cn } from '@/shared/utils/cn';

import { type ConsistencyCheckPromptCategory,type ConsistencyCheckPromptTemplate } from '../../../shared/types';
import { getDefaultConsistencyPrompts } from '../../constants/consistencyCheck';


interface ConsistencyPromptManagerProps {
  templates: ConsistencyCheckPromptTemplate[];
  onTemplatesChange: (templates: ConsistencyCheckPromptTemplate[]) => void;
}

const ConsistencyPromptManager: React.FC<ConsistencyPromptManagerProps> = ({
  templates,
  onTemplatesChange
}) => {
  const { t } = useTranslation(['consistency', 'common']);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ templateId: string; isValid: boolean; errors: string[] } | null>(null);
  const [importExportOpen, setImportExportOpen] = useState(false);
  const [importExportMode, setImportExportMode] = useState<'import' | 'export'>('export');
  const [importText, setImportText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ConsistencyCheckPromptCategory | 'all'>('all');

  // 过滤后的模板
  const filteredTemplates = useMemo(() => {
    if (selectedCategory === 'all') return templates;
    return templates.filter(t => t.category === selectedCategory);
  }, [templates, selectedCategory]);

  // 添加新模板
  const addTemplate = () => {
    const newTemplate: ConsistencyCheckPromptTemplate = {
      id: Date.now().toString(),
      category: 'semantic_character',
      name: t('consistency:pm.defaultTemplateName'),
      content: '请检查以下内容的语义一致性：\n\n【项目】{projectTitle}\n【世界观】{worldView}\n\n【待检查内容】\n{targetData}\n\n请检查是否存在矛盾或不一致之处。',
      variables: ['projectTitle', 'worldView', 'targetData'],
      isDefault: false,
      applicableModes: ['ai'],
      tags: []
    };
    onTemplatesChange([...templates, newTemplate]);
    setEditingId(newTemplate.id);
  };

  // 删除模板
  const removeTemplate = (id: string) => {
    const template = templates.find(t => t.id === id);
    if (template?.isDefault) {
      dialogService.alert(t('consistency:pm.defaultNoDelete'));
      return;
    }
    onTemplatesChange(templates.filter(t => t.id !== id));
    if (editingId === id) setEditingId(null);
  };

  // 更新模板
  const updateTemplate = (id: string, updates: Partial<ConsistencyCheckPromptTemplate>) => {
    onTemplatesChange(templates.map(t => t.id === id ? { ...t, ...updates } : t));
    if (testResult?.templateId === id) setTestResult(null);
  };

  // 复制模板
  const duplicateTemplate = (id: string) => {
    const template = templates.find(t => t.id === id);
    if (!template) return;

    const newTemplate: ConsistencyCheckPromptTemplate = {
      ...template,
      id: Date.now().toString(),
      // 副本转为自定义模板：烘焙当前语言显示名，清除内置键
      name: t('consistency:pm.duplicateSuffix', { name: templateDisplayName(template) }),
      nameKey: undefined,
      description: template.descriptionKey ? dt(template.descriptionKey) : template.description,
      descriptionKey: undefined,
      isDefault: false
    };
    onTemplatesChange([...templates, newTemplate]);
    setEditingId(newTemplate.id);
  };

  // 测试模板
  const testTemplate = (template: ConsistencyCheckPromptTemplate) => {
    const result = ConsistencyCheckPromptService.validateTemplate(template);
    setTestResult({
      templateId: template.id,
      isValid: result.isValid,
      errors: result.errors
    });
    return result.isValid;
  };

  // 导出模板
  const exportTemplates = () => {
    return ConsistencyCheckPromptService.exportTemplates(templates);
  };

  // 导入模板
  const importTemplates = (jsonString: string) => {
    const result = ConsistencyCheckPromptService.importTemplates(jsonString);
    if (result.success && result.templates) {
      onTemplatesChange([...templates, ...result.templates]);
      return { success: true, count: result.templates.length };
    }
    return { success: false, error: result.error || t('consistency:pm.importFailed') };
  };

  // 重置为默认
  const resetToDefault = async () => {
    if (await dialogService.confirm({ message: t('consistency:pm.resetConfirm'), danger: true })) {
      onTemplatesChange(getDefaultConsistencyPrompts());
      setEditingId(null);
      setTestResult(null);
    }
  };

  // 获取分类显示名
  const getCategoryName = (cat: ConsistencyCheckPromptCategory | 'all') => {
    if (cat === 'all') return t('consistency:pm.all');
    return t(`consistency:promptCategory.${cat}`);
  };

  const categories: (ConsistencyCheckPromptCategory | 'all')[] = [
    'all', 'semantic_character', 'semantic_faction', 'semantic_location',
    'semantic_timeline', 'semantic_cross', 'similarity_detection'
  ];

  const closeImportExport = () => {
    setImportExportOpen(false);
    setImportText('');
  };

  return (
    <div className="space-y-5">
      {/* 标题和操作栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg font-medium text-foreground">{t('consistency:pm.title')}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('consistency:pm.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => { setImportExportMode('export'); setImportExportOpen(true); }}>
            <Download className="size-3.5" />{t('common:export')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => { setImportExportMode('import'); setImportExportOpen(true); }}>
            <Upload className="size-3.5" />{t('common:import')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={resetToDefault}
          >
            <Undo2 className="size-3.5" />{t('common:reset')}
          </Button>
          <Button size="sm" onClick={addTemplate}>
            <Plus className="size-3.5" />{t('consistency:pm.newTemplate')}
          </Button>
        </div>
      </div>

      {/* 分类筛选 */}
      <div className="flex flex-wrap gap-2">
        {categories.map(cat => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelectedCategory(cat)}
            className={cn(
              'rounded-md border px-3 py-1 text-xs transition-colors',
              selectedCategory === cat
                ? 'border-primary/40 bg-primary/5 text-primary'
                : 'border-border text-muted-foreground hover:bg-accent/40'
            )}
          >
            {getCategoryName(cat)}
          </button>
        ))}
      </div>

      {/* 模板列表 */}
      <div className=" max-h-[500px] space-y-3 overflow-y-auto">
        {filteredTemplates.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={t('consistency:pm.empty')}
          />
        ) : (
          filteredTemplates.map(template => (
            <div
              key={template.id}
              className={cn(
                'rounded-lg border bg-card p-5 transition-colors',
                editingId === template.id ? 'border-primary/40' : 'border-border hover:border-primary/30'
              )}
            >
              {/* 模板头部 */}
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  {template.isDefault && (
                    <span className="shrink-0 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-2xs uppercase tracking-wider text-muted-foreground">{t('consistency:pm.defaultBadge')}</span>
                  )}
                  <input
                    className="w-48 border-none bg-transparent p-0 font-serif text-base font-medium text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-default"
                    value={templateDisplayName(template)}
                    onChange={(e) => updateTemplate(template.id, { name: e.target.value, nameKey: undefined })}
                    placeholder={t('consistency:pm.namePlaceholder')}
                    disabled={template.isDefault}
                  />
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" className="size-8" onClick={() => duplicateTemplate(template.id)} title={t('consistency:pm.duplicateTitle')}>
                    <Copy className="size-4" />
                  </Button>
                  {!template.isDefault && (
                    <Button variant="ghost" size="icon" className="size-8 hover:bg-destructive/10 hover:text-destructive" onClick={() => removeTemplate(template.id)} title={t('consistency:pm.deleteTitle')}>
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="size-8" onClick={() => setEditingId(editingId === template.id ? null : template.id)} title={t('consistency:pm.toggleTitle')} aria-label={t('consistency:pm.toggleTitle')}>
                    {editingId === template.id ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                  </Button>
                </div>
              </div>

              {/* 模板基本信息 */}
              <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <Label className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('consistency:pm.categoryLabel')}</Label>
                  <Select
                    className="h-8 w-full text-xs"
                    value={template.category}
                    onChange={(e) => updateTemplate(template.id, { category: e.target.value as ConsistencyCheckPromptCategory })}
                    disabled={template.isDefault}
                    aria-label={t('consistency:pm.categoryLabel')}
                  >
                    {(['semantic_character', 'semantic_faction', 'semantic_location', 'semantic_timeline', 'semantic_cross', 'similarity_detection'] as ConsistencyCheckPromptCategory[]).map(cat => (
                      <option key={cat} value={cat}>{t(`consistency:promptCategory.${cat}`)}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('consistency:pm.modesLabel')}</Label>
                  <div className="py-1.5 text-sm text-foreground">
                    {template.applicableModes.includes('ai') && `${t('consistency:pm.modeAi')} `}
                    {template.applicableModes.includes('vector') && t('consistency:pm.modeVector')}
                  </div>
                </div>
                <div>
                  <Label className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('consistency:pm.variablesLabel')}</Label>
                  <div className="py-1.5 text-sm tabular-nums text-foreground">{t('consistency:pm.variablesCount', { count: template.variables?.length || 0 })}</div>
                </div>
              </div>

              {/* 展开编辑区域 */}
              {editingId === template.id && (
                <div className="mt-4 space-y-4 border-t border-border pt-4">
                  {/* 描述 */}
                  <div>
                    <Label className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('consistency:pm.descLabel')}</Label>
                    <Input
                      value={template.descriptionKey ? dt(template.descriptionKey) : (template.description || '')}
                      onChange={(e) => updateTemplate(template.id, { description: e.target.value, descriptionKey: undefined })}
                      placeholder={t('consistency:pm.descPlaceholder')}
                      disabled={template.isDefault}
                    />
                  </div>

                  {/* 提示词内容 */}
                  <div>
                    <Label className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('consistency:pm.contentLabel')}</Label>
                    <Textarea
                      className="min-h-[192px] bg-muted/40 font-mono text-xs"
                      value={template.content}
                      onChange={(e) => updateTemplate(template.id, { content: e.target.value })}
                      placeholder={t('consistency:pm.contentPlaceholder')}
                      disabled={template.isDefault}
                    />
                  </div>

                  {/* 可用变量提示 */}
                  <div>
                    <Label className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('consistency:pm.definedVarsLabel')}</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {template.variables?.map(v => (
                        <span key={v} className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary">
                          {'{' + v + '}'}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* 测试按钮和结果 */}
                  {!template.isDefault && (
                    <div className="flex items-center justify-between gap-3">
                      <Button variant="secondary" size="sm" onClick={() => testTemplate(template)}>
                        <FlaskConical className="size-3.5" />{t('consistency:pm.validateBtn')}
                      </Button>
                      {testResult?.templateId === template.id && (
                        <div className={cn('flex items-center gap-1 text-xs', testResult.isValid ? 'text-success' : 'text-destructive')}>
                          {testResult.isValid ? (
                            <><CheckCircle2 className="size-3.5" />{t('consistency:pm.validResult')}</>
                          ) : (
                            <><AlertCircle className="size-3.5 shrink-0" />{testResult.errors.join(', ')}</>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* 导入/导出模态框 */}
      <ModalShell open={importExportOpen} onOpenChange={(open) => { if (!open) closeImportExport(); }} bare contentClassName="flex max-h-[85vh] w-[92vw] max-w-2xl flex-col gap-0 overflow-hidden p-0">
          <div className="border-b border-border bg-muted/30 px-6 py-4">
            <h3 className="font-serif text-lg font-medium text-foreground">
              {importExportMode === 'import' ? t('consistency:pm.importTitle') : t('consistency:pm.exportTitle')}
            </h3>
          </div>
          <div className=" flex-1 overflow-y-auto p-6">
            {importExportMode === 'export' ? (
              <div>
                <p className="mb-3 text-sm text-muted-foreground">{t('consistency:pm.exportHint')}</p>
                <Textarea
                  className="min-h-[256px] bg-muted/40 font-mono text-xs"
                  value={exportTemplates()}
                  readOnly
                />
                <Button className="mt-4 w-full" onClick={() => { void navigator.clipboard.writeText(exportTemplates()); dialogService.alert(t('consistency:pm.copied')); }}>
                  <Copy className="size-4" />{t('consistency:pm.copyBtn')}
                </Button>
              </div>
            ) : (
              <div>
                <p className="mb-3 text-sm text-muted-foreground">{t('consistency:pm.importHint')}</p>
                <Textarea
                  className="min-h-[256px] font-mono text-xs"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder={t('consistency:pm.importPlaceholder')}
                />
                <Button
                  className="mt-4 w-full"
                  onClick={() => {
                    const result = importTemplates(importText);
                    if (result.success) {
                      dialogService.alert(t('consistency:pm.importSuccess', { count: result.count ?? 0 }));
                      closeImportExport();
                    } else {
                      dialogService.alert(result.error ?? t('consistency:pm.importFailed'));
                    }
                  }}
                  disabled={!importText.trim()}
                >
                  <Upload className="size-4" />{t('consistency:pm.importBtn')}
                </Button>
              </div>
            )}
          </div>
    </ModalShell>
    </div>
  );
};

export default ConsistencyPromptManager;
