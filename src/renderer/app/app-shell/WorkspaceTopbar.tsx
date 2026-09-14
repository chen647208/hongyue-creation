/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import {
  ChevronRight,
  Compass,
  Cpu,
  History,
  Moon,
  PanelRight,
  Pencil,
  RefreshCw,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import React, { useState } from 'react';

import { useFeatureEnabled } from '@/app/useFeatureToggles';
import AssistantTasksIndicator from '@/features/assistant/components/AssistantTasksIndicator';
import { useTranslation } from '@/i18n';
import { resolveTheme } from '@/shared/services/themeService';
import { Button } from '@/shared/ui/Button';
import { IconButton } from '@/shared/ui/IconButton';
import { Input } from '@/shared/ui/Input';
import Slot from '@/shared/ui/Slot';
import { isModelUsable } from '@/shared/utils/modelReadiness';

import type { AppTheme, ModelConfig, Project } from '../../../shared/types';
import { suggestNextSection } from '../guidedFlow';
import { type SectionId,WORKSPACE_SECTIONS } from '../sections';
import ProtectedSessionDialog from './ProtectedSessionDialog';
import SyncDialog from './SyncDialog';

interface WorkspaceTopbarProps {
  project: Project | null;
  activeModel: ModelConfig | undefined;
  theme: AppTheme | undefined;
  section: SectionId;
  assistantOpen?: boolean;
  onToggleAssistant?: () => void;
  onSectionChange: (next: SectionId, sub?: 'outline' | 'chapters') => void;
  onRenameBook: (bookId: string, newTitle: string) => void;
  onThemeChange: (theme: AppTheme) => void;
  onOpenBookshelf: () => void;
  onOpenSettings: () => void;
  onDeleteProject: () => void;
  onOpenHistory: () => void;
  onOpenVersionCheck: () => void;
}

/** 单书工作台顶栏：书名面包屑（可就地改名）+ 引导下一步建议 + 删除 + 主题/版本/历史/模型入口。 */
const WorkspaceTopbar: React.FC<WorkspaceTopbarProps> = ({
  project,
  activeModel,
  theme,
  section,
  assistantOpen,
  onToggleAssistant,
  onSectionChange,
  onRenameBook,
  onThemeChange,
  onOpenBookshelf,
  onOpenSettings,
  onDeleteProject,
  onOpenHistory,
  onOpenVersionCheck,
}) => {
  const { t } = useTranslation(['app', 'nav']);
  const isDark = resolveTheme(theme) === 'dark';
  const assistantEnabled = useFeatureEnabled('panel.assistant');
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [hintDismissed, setHintDismissed] = useState(false);

  const startRename = () => {
    if (!project) return;
    setDraftTitle(project.title);
    setEditingTitle(true);
  };
  const commitRename = () => {
    if (project) {
      const next = draftTitle.trim();
      if (next && next !== project.title) onRenameBook(project.id, next);
    }
    setEditingTitle(false);
  };

  // 引导建议：第一个未填充的分区；进结构页时深链到缺的那一段（缺大纲→大纲，否则细纲）
  const suggested = project ? suggestNextSection(project) : null;
  const showHint = !!project && !hintDismissed && suggested && suggested !== section;
  const suggestedSub = suggested === 'structure' && project && !project.outline?.trim() ? 'outline' as const : 'chapters' as const;
  const suggestedLabel = suggested
    ? t(`nav:${WORKSPACE_SECTIONS.find((s) => s.id === suggested)?.labelKey ?? 'steps.writing'}`) +
      (suggested === 'structure' ? `·${t(`nav:structureTabs.${suggestedSub}`)}` : '')
    : '';
  const sectionLabel = t(`nav:${WORKSPACE_SECTIONS.find((s) => s.id === section)?.labelKey ?? 'steps.writing'}`);

  const hasHistory =
    !!project &&
    (project.chapters.some(c => (c.history?.length ?? 0) > 0) ||
      (project.virtualChapters ?? []).some(c => (c.history?.length ?? 0) > 0));

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-4">
      {/* 面包屑：书籍库 / 当前分区 / 书名 */}
      <div className="flex min-w-0 items-center gap-1">
        <Button
          variant="ghost"
          onClick={onOpenBookshelf}
          className="h-auto shrink-0 px-2 py-1 text-sm font-normal text-muted-foreground hover:text-foreground"
        >
          {t('nav:bookshelf')}
        </Button>
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />
        <span className="shrink-0 text-sm text-muted-foreground">{sectionLabel}</span>
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />
        {editingTitle ? (
          <Input
            autoFocus
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
              else if (e.key === 'Escape') { setEditingTitle(false); }
            }}
            className="h-7 max-w-[16rem] font-serif text-base"
            aria-label={t('app:topbar.renameTitle')}
          />
        ) : (
          <Button
            variant="ghost"
            onClick={startRename}
            disabled={!project}
            title={project ? t('app:topbar.renameTip') : undefined}
            className="group h-auto min-w-0 gap-1 rounded-md px-1 py-0.5 text-left font-normal"
          >
            <h2 className="truncate font-serif text-base font-medium text-foreground">
              {project?.title || t('app:topbar.noBookSelected')}
            </h2>
            {project && <Pencil className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />}
          </Button>
        )}
        {showHint && suggested && (
          <div className="ml-2 hidden shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/5 py-0.5 pl-2 pr-0.5 text-xs md:flex">
            <Compass className="size-3 text-primary" />
            <Button
              variant="link"
              onClick={() => onSectionChange(suggested, suggested === 'structure' ? suggestedSub : undefined)}
              className="h-auto p-0 text-xs text-primary"
              title={t('app:topbar.guidedGoTip')}
            >
              {t('app:topbar.guidedNext', { step: suggestedLabel })}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setHintDismissed(true)}
              aria-label={t('app:topbar.guidedDismiss')}
              className="size-4 rounded-full text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </Button>
          </div>
        )}
        {project && (
          <div className="ml-1 flex shrink-0 items-center">
            <Button
              variant="ghost"
              size="icon"
              onClick={onDeleteProject}
              title={t('app:topbar.deleteProjectTip')}
              className="size-7 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* 右侧工具区：窄视口只保留助手/主题/设置，其余次要入口收进设置面板 */}
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        {assistantEnabled && onToggleAssistant && (
          <IconButton
            tone="muted"
            active={assistantOpen}
            label={t('app:topbar.toggleAssistantTip')}
            onClick={onToggleAssistant}
          >
            <PanelRight className="size-4" />
          </IconButton>
        )}
        <div className="hidden items-center md:flex">
          <AssistantTasksIndicator />
        </div>
        <div className="hidden items-center md:flex">
          <SyncDialog project={project} />
        </div>
        <div className="hidden items-center md:flex">
          <ProtectedSessionDialog />
        </div>

        <IconButton
          tone="muted"
          label={isDark ? t('app:topbar.themeToLight') : t('app:topbar.themeToDark')}
          onClick={() => onThemeChange(isDark ? 'light' : 'dark')}
        >
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </IconButton>

        <div className="hidden items-center gap-1 md:flex">
          <Slot id="topbar.actions" />
          <IconButton
            tone="muted"
            className="size-6"
            label={t('app:topbar.checkUpdateTip')}
            onClick={onOpenVersionCheck}
          >
            <RefreshCw className="size-3.5" />
          </IconButton>
        </div>

        {hasHistory && (
          <Button variant="outline" size="sm" onClick={onOpenHistory} title={t('app:topbar.viewHistoryTip')} className="hidden md:inline-flex">
            <History className="size-3.5" />
            {t('app:topbar.history')}
          </Button>
        )}

        <Button
          variant="secondary"
          size="sm"
          onClick={onOpenSettings}
          title={!isModelUsable(activeModel) ? t('app:model.bannerHandwrite') : undefined}
          className={!isModelUsable(activeModel) ? 'border-warning/40 text-warning hover:text-warning' : undefined}
        >
          <Cpu className="size-3.5" />
          <span className="hidden max-w-32 truncate sm:inline">{isModelUsable(activeModel) ? activeModel.name : t('app:model.noneSelected')}</span>
        </Button>
      </div>
    </header>
  );
};

export default WorkspaceTopbar;
