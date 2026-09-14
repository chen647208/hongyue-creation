/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { WandSparkles } from 'lucide-react';
import React from 'react';

import { templateDisplayName,useTranslation } from '@/i18n';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { Select } from '@/shared/ui/Select';
import { Textarea } from '@/shared/ui/Textarea';

import type { PromptTemplate } from '../../../../shared/types';
import type { PromptTemplatesPanelProps } from '../types';

const PromptTemplatesPanel: React.FC<PromptTemplatesPanelProps> = ({
  localPrompts,
  setLocalPrompts,
  updatePrompt,
  addPrompt,
}) => {
  const { t } = useTranslation('settings');
  return (
    <div className="grid grid-cols-1 gap-4">
      {localPrompts.map(prompt => (
        <div key={prompt.id} className="rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/30">
          <div className="mb-4 flex items-center justify-between gap-4">
            <Input
              className="border-none bg-transparent p-0 font-serif text-lg font-medium shadow-none focus-visible:ring-0"
              value={templateDisplayName(prompt)}
              onChange={(e) => updatePrompt(prompt.id, { name: e.target.value, nameKey: undefined })}
              placeholder={t('prompts.namePlaceholder')}
            />
            <Select
              className="h-8 w-auto shrink-0 text-xs"
              value={prompt.category}
              onChange={(e) => updatePrompt(prompt.id, { category: e.target.value as PromptTemplate['category'] })}
              aria-label={t('prompts.categoryLabel')}
            >
              <option value="inspiration">{t('prompts.category.inspiration')}</option>
              <option value="character">{t('prompts.category.character')}</option>
              <option value="outline">{t('prompts.category.outline')}</option>
              <option value="chapter">{t('prompts.category.chapter')}</option>
              <option value="writing">{t('prompts.category.writing')}</option>
              <option value="edit">{t('prompts.category.edit')}</option>
              <option value="summary">{t('prompts.category.summary')}</option>
            </Select>
          </div>

          <Textarea
            className="min-h-[160px] bg-muted/40 font-mono text-sm"
            value={prompt.content}
            onChange={(e) => updatePrompt(prompt.id, { content: e.target.value })}
            placeholder={t('prompts.contentPlaceholder')}
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">{t('prompts.availablePlaceholders')}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-xs text-muted-foreground hover:bg-transparent hover:text-destructive"
              onClick={() => setLocalPrompts(localPrompts.filter(p => p.id !== prompt.id))}
            >
              {t('prompts.deleteTemplate')}
            </Button>
          </div>
        </div>
      ))}
      <button
        onClick={addPrompt}
        className="group flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border py-8 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/30 hover:text-primary"
      >
        <WandSparkles className="size-5 transition-transform group-hover:rotate-12" />
        <span>{t('prompts.addTemplate')}</span>
      </button>
    </div>
  );
};

export default PromptTemplatesPanel;
