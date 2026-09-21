/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 单书工作台视图：导航栏 + 顶栏 + 分区内容路由（灵感/世界/角色/结构/写作）。
 * 从 App.tsx 收编而来；写作分区为全屏沉浸模式，隐藏导航栏与顶栏。
 * Step 页直读双 store，WorkspaceSection 只做守卫与路由，不再透传模型/提示词。
 */

import { BookHeart, Plug } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { useViewportTier } from '@/shared/hooks/useViewportTier';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import Slot from '@/shared/ui/Slot';
import { Spinner } from '@/shared/ui/Spinner';
import { cn } from '@/shared/utils/cn';
import { resolveWorkspaceChrome } from '@/shared/utils/layout';

import { type AppTheme, type ModelConfig, type Project, type PromptTemplate } from '../../../shared/types';
import { ErrorBoundary } from '../../shared/components/ErrorBoundary';
import { isModelUsable } from '../../shared/utils/modelReadiness';
import type { SectionId } from '../sections';
import WorkspaceNav from './WorkspaceNav';
import WorkspaceTopbar from './WorkspaceTopbar';

// 分区组件按需加载：进入某分区才拉取其代码，减小首屏主包
const StepInspiration = React.lazy(() => import('../../features/inspiration/StepInspiration'));
const StepKnowledgeEnhanced = React.lazy(() => import('../../features/knowledge/StepKnowledgeEnhanced'));
const StepCharacters = React.lazy(() => import('../../features/characters/StepCharacters'));
const StructureSection = React.lazy(() => import('./StructureSection'));
const WritingEditor = React.lazy(() => import('../../features/writing/WritingEditor'));

const SectionFallback: React.FC = () => (
  <div className="flex h-full items-center justify-center">
    <Spinner />
  </div>
);

export interface WorkspaceViewProps {
  section: SectionId;
  structureSub?: 'outline' | 'chapters';
  activeProject: Project | null;
  activeModel: ModelConfig | undefined;
  prompts: PromptTemplate[];
  resetKey: number;
  theme: AppTheme | undefined;
  focusCharacterId: string | null;
  editingChapterId: string | null;
  assistantOpen?: boolean;
  onToggleAssistant?: () => void;
  onSectionChange: (next: SectionId, sub?: 'outline' | 'chapters') => void;
  onOpenBookshelf: () => void;
  onOpenSettings: () => void;
  onDeleteProject: () => void;
  onOpenHistory: () => void;
  onOpenVersionCheck: () => void;
  onThemeChange: (theme: AppTheme) => void;
  onUpdateProject: (updates: Partial<Project>) => void;
  onRenameBook: (bookId: string, newTitle: string) => void;
  onNavigateToCharacter: (id: string) => void;
  onNavigateToChapter: (id: string) => void;
  handwriteBypass: boolean;
  onHandwriteBypass: () => void;
}

const WorkspaceSection: React.FC<WorkspaceViewProps> = ({
  section, structureSub, activeProject, activeModel, focusCharacterId, editingChapterId,
  onSectionChange, onOpenBookshelf, onOpenSettings,
  onNavigateToCharacter, onNavigateToChapter,
  handwriteBypass, onHandwriteBypass,
}) => {
  const { t } = useTranslation(['app', 'common']);
  // 手写党 bypass（状态在 App 层：重挂、切分区不丢失，仅重置时清除）：
  // 没模型也允许进工作台手写，AI 按钮会各自报未配置；默认仍全屏引导去设置

  if (!activeProject) {
    return (
      <EmptyState
        className="h-full"
        icon={BookHeart}
        title={t('empty.noProject')}
        action={<Button onClick={onOpenBookshelf}>{t('empty.goCreate')}</Button>}
      />
    );
  }

  const modelBlocked = !activeModel || !isModelUsable(activeModel);
  if (modelBlocked && !handwriteBypass) {
    return (
      <EmptyState
        className="h-full"
        icon={Plug}
        title={activeModel ? t('model.notConfiguredKey') : t('model.noneConfigured')}
        description={t('model.handwriteHint', '也可以先手写，配好模型后再用 AI')}
        action={
          <div className="flex items-center gap-2">
            <Button onClick={onOpenSettings}>{t('model.goSettings')}</Button>
            <Button variant="ghost" onClick={onHandwriteBypass}>
              {t('model.handwriteFirst', '先手写看看')}
            </Button>
          </div>
        }
      />
    );
  }
  const bannerBlocked = modelBlocked && handwriteBypass;

  let content: React.ReactNode;
  switch (section) {
    case 'inspiration':
      content = (
        <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8">
          <StepInspiration project={activeProject} onGoSection={onSectionChange} />
        </div>
      );
      break;
    case 'world':
      content = (
        <StepKnowledgeEnhanced
          project={activeProject}
          onNavigateToCharacter={onNavigateToCharacter}
          onNavigateToChapter={onNavigateToChapter}
          onGoSection={onSectionChange}
        />
      );
      break;
    case 'characters':
      content = (
        <StepCharacters
          project={activeProject}
          onOpenSettings={onOpenSettings}
          focusCharacterId={focusCharacterId}
          onFocusHandled={() => onNavigateToCharacter('')}
          onGoSection={onSectionChange}
          onNavigateToChapter={onNavigateToChapter}
        />
      );
      break;
    case 'structure':
      content = (
        <StructureSection
          project={activeProject}
          initialSub={structureSub}
          onGoSection={onSectionChange}
          onEnterWriting={(id) => onNavigateToChapter(id)}
        />
      );
      break;
    case 'writing':
      content = (
        <WritingEditor
          project={activeProject}
          initialChapterId={editingChapterId}
          onBack={() => onSectionChange('structure', 'chapters')}
          onNavigateToCharacters={() => onSectionChange('characters')}
          onOpenSettings={onOpenSettings}
        />
      );
      break;
    default:
      content = null;
  }
  return (
    <div className="flex h-full flex-col">
      {bannerBlocked && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-warning/30 bg-warning/5 px-4 py-2 text-xs">
          <span className="flex items-center gap-2 text-foreground">
            <Plug className="size-3.5 text-warning" />
            {t('model.bannerHandwrite', '未配置可用模型，AI 已停用，可继续手写')}
          </span>
          <Button size="sm" variant="outline" onClick={onOpenSettings}>{t('model.goSettings')}</Button>
        </div>
      )}
      <div className="min-h-0 flex-1">
        <ErrorBoundary scope={section}>
          <React.Suspense fallback={<SectionFallback />}>{content}</React.Suspense>
        </ErrorBoundary>
      </div>
      <div className="flex h-6 shrink-0 items-center justify-end gap-3 border-t border-border bg-muted/20 px-3">
        <Slot id="status-bar" />
      </div>
    </div>
  );
};

const WorkspaceView: React.FC<WorkspaceViewProps> = (props) => {
  const {
    section, activeProject, activeModel, resetKey, theme,
    assistantOpen, onToggleAssistant,
    onSectionChange, onOpenBookshelf, onOpenSettings,
    onDeleteProject, onOpenHistory, onOpenVersionCheck,
    onThemeChange, onRenameBook,
  } = props;
  const chrome = resolveWorkspaceChrome(useViewportTier());
  // 写作分区为全屏沉浸（无底部导航），其余分区在手机档留出底栏高度
  const reserveBottomNav = chrome.bottomNav && section !== 'writing';

  return (
    <>
      {/* 写作分区为全屏沉浸模式，隐藏导航栏与顶栏 */}
      {section !== 'writing' && (
        <WorkspaceNav
          activeSection={section}
          onSectionChange={onSectionChange}
          onOpenBookshelf={onOpenBookshelf}
          onOpenSettings={onOpenSettings}
          project={activeProject}
        />
      )}

      <main className={cn('flex min-w-0 flex-1 flex-col', reserveBottomNav && 'pb-16')}>
        {section !== 'writing' && (
          <WorkspaceTopbar
            project={activeProject}
            activeModel={activeModel}
            theme={theme}
            section={section}
            assistantOpen={assistantOpen}
            onToggleAssistant={onToggleAssistant}
            onSectionChange={onSectionChange}
            onRenameBook={onRenameBook}
            onThemeChange={onThemeChange}
            onOpenBookshelf={onOpenBookshelf}
            onOpenSettings={onOpenSettings}
            onDeleteProject={onDeleteProject}
            onOpenHistory={onOpenHistory}
            onOpenVersionCheck={onOpenVersionCheck}
          />
        )}

        <div className="relative min-h-0 flex-1 overflow-hidden bg-background" key={resetKey}>
          <WorkspaceSection {...props} />
        </div>
      </main>
    </>
  );
};

export default WorkspaceView;
