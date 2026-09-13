/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import React, { useEffect } from 'react';

import { useTranslation } from '@/i18n';
import { useViewPreference } from '@/shared/hooks/useViewPreference';
import { PageHeader } from '@/shared/ui/PageHeader';
import { SegmentedControl } from '@/shared/ui/ViewModeToggle';

import type { Project } from '../../../shared/types';
import StepChapterOutline from '../../features/chapters/StepChapterOutline';
import GroupsPanel from '../../features/groups/GroupsPanel';
import StepOutline from '../../features/outline/StepOutline';
import WritingPlanPanel from '../../features/plan/WritingPlanPanel';
import StatsPanel from '../../features/stats/StatsPanel';

interface StructureSectionProps {
  project: Project;
  onEnterWriting: (chapterId: string) => void;
  /** 引导深链：外部指定子页（大纲/细纲）时切过去；平时沿用用户偏好 */
  initialSub?: 'outline' | 'chapters';
  /** 跨页接力透传（如细纲缺大纲时去大纲子页） */
  onGoSection?: (next: 'structure', sub?: 'outline' | 'chapters') => void;
}

/**
 * 结构页（一页三段）：大纲 ⇄ 细纲 ⇄ 计划子页签共用一页。
 * StepOutline / StepChapterOutline 已直读 store，这里只负责子页签与进写作跳转。
 */
const StructureSection: React.FC<StructureSectionProps> = ({ project, onEnterWriting, initialSub, onGoSection }) => {
  const { t } = useTranslation('nav');
  const [sub, setSub] = useViewPreference<'outline' | 'chapters' | 'plan' | 'groups' | 'stats'>('structure.subtab', 'outline');

  useEffect(() => {
    if (initialSub) setSub(initialSub);
  }, [initialSub, setSub]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        left={
          <SegmentedControl
            value={sub}
            onChange={setSub}
            options={[
              { value: 'outline', label: t('structureTabs.outline') },
              { value: 'chapters', label: t('structureTabs.chapters') },
              { value: 'plan', label: t('structureTabs.plan') },
              { value: 'groups', label: t('structureTabs.groups') },
              { value: 'stats', label: t('structureTabs.stats') },
            ]}
          />
        }
      />
      <div className="min-h-0 flex-1">
        {sub === 'outline' ? (
          <StepOutline project={project} />
        ) : sub === 'chapters' ? (
          <StepChapterOutline project={project} onEnterWriting={onEnterWriting} onGoSection={onGoSection} />
        ) : sub === 'plan' ? (
          <WritingPlanPanel />
        ) : sub === 'groups' ? (
          <GroupsPanel />
        ) : (
          <StatsPanel />
        )}
      </div>
    </div>
  );
};

export default StructureSection;
