/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { LucideIcon } from 'lucide-react';
import { ChevronDown, ChevronUp, Clapperboard, Clock, Flag, MapPinned, Network, ScrollText, Shield, Table2, WandSparkles } from 'lucide-react';
import React from 'react';

import { useFeatureEnabled } from '@/app/useFeatureToggles';
import { useTranslation } from '@/i18n';
import { cn } from '@/shared/utils/cn';

import type { DiagramType, Project } from '../../../../shared/types';
import type { TimelineView } from './KnowledgeFeatureEditors';

interface KnowledgeFeaturePanelsProps {
  project: Project;
  showLocationEditor: boolean;
  setShowLocationEditor: React.Dispatch<React.SetStateAction<boolean>>;
  showFactionEditor: boolean;
  setShowFactionEditor: React.Dispatch<React.SetStateAction<boolean>>;
  timelineView: TimelineView | null;
  setTimelineView: (view: TimelineView | null) => void;
  showRuleSystemEditor: boolean;
  setShowRuleSystemEditor: React.Dispatch<React.SetStateAction<boolean>>;
  showConsistencyChecker: boolean;
  setShowConsistencyChecker: React.Dispatch<React.SetStateAction<boolean>>;
  showSmartRecommender: boolean;
  setShowSmartRecommender: React.Dispatch<React.SetStateAction<boolean>>;
  showDataViews: boolean;
  setShowDataViews: React.Dispatch<React.SetStateAction<boolean>>;
  showScreenplay: boolean;
  setShowScreenplay: React.Dispatch<React.SetStateAction<boolean>>;
  setShowWorldViewGraph: React.Dispatch<React.SetStateAction<boolean>>;
  setGraphInitialType: React.Dispatch<React.SetStateAction<DiagramType>>;
}

/** 世界要素卡：主入口，带要素数量与展开箭头。 */
function FeatureCard({
  icon: Icon,
  title,
  hint,
  active,
  hasData,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  active: boolean;
  hasData: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className={cn(
        'motion-hover flex items-start gap-3 rounded-lg border p-4 text-left',
        active ? 'border-primary/40 bg-primary/5' : 'border-border bg-card hover:border-primary/30 hover:bg-accent/40',
      )}
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg',
          hasData ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="size-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium leading-tight">{title}</span>
          {active ? (
            <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          )}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}

/** 视图与检查工具：常驻一行的小号开关，避免与要素编辑卡争夺主次。 */
function ToolChip({
  icon: Icon,
  title,
  active,
  hasData,
  expandable = true,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  active: boolean;
  hasData: boolean;
  expandable?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expandable ? active : undefined}
      className={cn(
        'touch-target inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'border-primary/40 bg-primary/5 text-primary'
          : 'border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground',
      )}
    >
      <Icon className={cn('size-3.5', hasData && !active && 'text-primary')} />
      {title}
    </button>
  );
}

function SectionLabel({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="text-xs font-medium text-muted-foreground">
      {children}
    </h3>
  );
}

const KnowledgeFeaturePanels: React.FC<KnowledgeFeaturePanelsProps> = ({
  project,
  showLocationEditor,
  setShowLocationEditor,
  showFactionEditor,
  setShowFactionEditor,
  timelineView,
  setTimelineView,
  showRuleSystemEditor,
  setShowRuleSystemEditor,
  showConsistencyChecker,
  setShowConsistencyChecker,
  showSmartRecommender,
  setShowSmartRecommender,
  showDataViews,
  setShowDataViews,
  showScreenplay,
  setShowScreenplay,
  setShowWorldViewGraph,
  setGraphInitialType,
}) => {
  const { t } = useTranslation('knowledge');

  const graphEnabled = useFeatureEnabled('panel.worldGraph');
  const consistencyEnabled = useFeatureEnabled('panel.consistency');
  const recommenderEnabled = useFeatureEnabled('panel.smartRecommender');
  const dataViewsEnabled = useFeatureEnabled('panel.dataViews');
  const screenplayEnabled = useFeatureEnabled('panel.screenplay');

  const closeOtherEditors = (keep: 'location' | 'faction' | 'timeline' | 'rule') => {
    if (keep !== 'location') setShowLocationEditor(false);
    if (keep !== 'faction') setShowFactionEditor(false);
    if (keep !== 'timeline') setTimelineView(null);
    if (keep !== 'rule') setShowRuleSystemEditor(false);
  };

  return (
    <div className="space-y-4">
      <section aria-labelledby="world-entities-heading" className="space-y-2">
        <SectionLabel id="world-entities-heading">{t('panel.sectionEntities')}</SectionLabel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <FeatureCard
            icon={MapPinned}
            title={t('panel.locationTitle')}
            hint={project.locations?.length ? t('panel.locationDefined', { count: project.locations.length }) : t('panel.locationHint')}
            active={showLocationEditor}
            hasData={!!project.locations?.length}
            onClick={() => {
              closeOtherEditors('location');
              setShowLocationEditor(!showLocationEditor);
            }}
          />
          <FeatureCard
            icon={Flag}
            title={t('panel.factionTitle')}
            hint={project.factions?.length ? t('panel.factionDefined', { count: project.factions.length }) : t('panel.factionHint')}
            active={showFactionEditor}
            hasData={!!project.factions?.length}
            onClick={() => {
              closeOtherEditors('faction');
              setShowFactionEditor(!showFactionEditor);
            }}
          />
          <FeatureCard
            icon={Clock}
            title={t('panel.timelineTitle')}
            hint={
              project.timeline?.events?.length
                ? t('panel.timelineDefined', { count: project.timeline.events.length })
                : t('panel.timelineHint')
            }
            active={timelineView !== null}
            hasData={!!project.timeline?.events?.length}
            onClick={() => {
              closeOtherEditors('timeline');
              setTimelineView(timelineView ? null : 'events');
            }}
          />
          <FeatureCard
            icon={ScrollText}
            title={t('panel.ruleTitle')}
            hint={project.ruleSystems?.length ? t('panel.ruleDefined', { count: project.ruleSystems.length }) : t('panel.ruleHint')}
            active={showRuleSystemEditor}
            hasData={!!project.ruleSystems?.length}
            onClick={() => {
              closeOtherEditors('rule');
              setShowRuleSystemEditor(!showRuleSystemEditor);
            }}
          />
        </div>
      </section>

      <section aria-labelledby="world-tools-heading" className="space-y-2">
        <SectionLabel id="world-tools-heading">{t('panel.sectionTools')}</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {graphEnabled && (
            <ToolChip
              icon={Network}
              title={t('panel.graphTitle')}
              active={false}
              hasData={!!(project.characters?.length || project.factions?.length || project.locations?.length)}
              expandable={false}
              onClick={() => {
                setGraphInitialType('mixed');
                setShowWorldViewGraph(true);
              }}
            />
          )}
          {consistencyEnabled && (
            <ToolChip
              icon={Shield}
              title={t('panel.consistencyTitle')}
              active={showConsistencyChecker}
              hasData={showConsistencyChecker}
              onClick={() => setShowConsistencyChecker(!showConsistencyChecker)}
            />
          )}
          {recommenderEnabled && (
            <ToolChip
              icon={WandSparkles}
              title={t('panel.recommenderTitle')}
              active={showSmartRecommender}
              hasData={showSmartRecommender}
              onClick={() => setShowSmartRecommender(!showSmartRecommender)}
            />
          )}
          {dataViewsEnabled && (
            <ToolChip
              icon={Table2}
              title={t('panel.dataViewsTitle')}
              active={showDataViews}
              hasData={!!(project.characters?.length || project.locations?.length || project.factions?.length || project.timeline?.events?.length)}
              onClick={() => setShowDataViews(!showDataViews)}
            />
          )}
          {screenplayEnabled && (
            <ToolChip
              icon={Clapperboard}
              title={t('panel.screenplayTitle')}
              active={showScreenplay}
              hasData={!!project.chapters?.length}
              onClick={() => setShowScreenplay(!showScreenplay)}
            />
          )}
        </div>
      </section>
    </div>
  );
};

export default KnowledgeFeaturePanels;
