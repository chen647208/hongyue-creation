/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { LucideIcon } from 'lucide-react';
import { ChevronDown, ChevronUp, Clapperboard, Clock, Film, Flag, LayoutList, MapPinned, Network, ScrollText, Shield, Table2, WandSparkles } from 'lucide-react';
import React from 'react';

import { useFeatureEnabled } from '@/app/useFeatureToggles';
import { useTranslation } from '@/i18n';
import { cn } from '@/shared/utils/cn';

import type { DiagramType, Project } from '../../../../shared/types';

interface KnowledgeFeaturePanelsProps {
  project: Project;
  showLocationEditor: boolean;
  setShowLocationEditor: React.Dispatch<React.SetStateAction<boolean>>;
  showFactionEditor: boolean;
  setShowFactionEditor: React.Dispatch<React.SetStateAction<boolean>>;
  showTimelineEditor: boolean;
  setShowTimelineEditor: React.Dispatch<React.SetStateAction<boolean>>;
  showRuleSystemEditor: boolean;
  setShowRuleSystemEditor: React.Dispatch<React.SetStateAction<boolean>>;
  showEnhancedTimeline: boolean;
  setShowEnhancedTimeline: React.Dispatch<React.SetStateAction<boolean>>;
  showConsistencyChecker: boolean;
  setShowConsistencyChecker: React.Dispatch<React.SetStateAction<boolean>>;
  showSmartRecommender: boolean;
  setShowSmartRecommender: React.Dispatch<React.SetStateAction<boolean>>;
  showDataViews: boolean;
  setShowDataViews: React.Dispatch<React.SetStateAction<boolean>>;
  showDualTimeline: boolean;
  setShowDualTimeline: React.Dispatch<React.SetStateAction<boolean>>;
  showScreenplay: boolean;
  setShowScreenplay: React.Dispatch<React.SetStateAction<boolean>>;
  setShowWorldViewGraph: React.Dispatch<React.SetStateAction<boolean>>;
  setGraphInitialType: React.Dispatch<React.SetStateAction<DiagramType>>;
}

interface PanelToggleProps {
  icon: LucideIcon;
  title: string;
  hint: string;
  active: boolean;
  hasData: boolean;
  expandable?: boolean;
  onClick: () => void;
}

/** 知识库功能分区开关卡：统一令牌样式，激活态用单一强调色。 */
function PanelToggle({ icon: Icon, title, hint, active, hasData, expandable = true, onClick }: PanelToggleProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'motion-hover rounded-lg border p-4 text-left',
        active ? 'border-primary/40 bg-primary/5' : 'border-border bg-card hover:border-primary/30 hover:bg-accent/40'
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-lg',
              hasData ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            )}
          >
            <Icon className="size-4.5" />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-medium leading-tight">{title}</h4>
            <p className="truncate text-xs text-muted-foreground">{hint}</p>
          </div>
        </div>
        {expandable &&
          (active ? <ChevronUp className="size-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="size-4 shrink-0 text-muted-foreground" />)}
      </div>
    </button>
  );
}

const KnowledgeFeaturePanels: React.FC<KnowledgeFeaturePanelsProps> = ({
  project,
  showLocationEditor,
  setShowLocationEditor,
  showFactionEditor,
  setShowFactionEditor,
  showTimelineEditor,
  setShowTimelineEditor,
  showRuleSystemEditor,
  setShowRuleSystemEditor,
  showEnhancedTimeline,
  setShowEnhancedTimeline,
  showConsistencyChecker,
  setShowConsistencyChecker,
  showSmartRecommender,
  setShowSmartRecommender,
  showDataViews,
  setShowDataViews,
  showDualTimeline,
  setShowDualTimeline,
  showScreenplay,
  setShowScreenplay,
  setShowWorldViewGraph,
  setGraphInitialType,
}) => {
  const { t } = useTranslation('knowledge');

  const graphEnabled = useFeatureEnabled('panel.worldGraph');
  const consistencyEnabled = useFeatureEnabled('panel.consistency');
  const recommenderEnabled = useFeatureEnabled('panel.smartRecommender');
  const enhancedTimelineEnabled = useFeatureEnabled('panel.enhancedTimeline');
  const dataViewsEnabled = useFeatureEnabled('panel.dataViews');
  const dualTimelineEnabled = useFeatureEnabled('panel.dualTimeline');
  const screenplayEnabled = useFeatureEnabled('panel.screenplay');

  const closeAllEditors = () => {
    setShowLocationEditor(false);
    setShowFactionEditor(false);
    setShowTimelineEditor(false);
    setShowRuleSystemEditor(false);
  };

  return (
    <>
      <div className="grid grid-cols-4 gap-3">
        <PanelToggle
          icon={MapPinned}
          title={t('panel.locationTitle')}
          hint={project.locations?.length ? t('panel.locationDefined', { count: project.locations.length }) : t('panel.locationHint')}
          active={showLocationEditor}
          hasData={!!project.locations?.length}
          onClick={() => {
            closeAllEditors();
            setShowLocationEditor(!showLocationEditor);
          }}
        />
        <PanelToggle
          icon={Flag}
          title={t('panel.factionTitle')}
          hint={project.factions?.length ? t('panel.factionDefined', { count: project.factions.length }) : t('panel.factionHint')}
          active={showFactionEditor}
          hasData={!!project.factions?.length}
          onClick={() => {
            closeAllEditors();
            setShowFactionEditor(!showFactionEditor);
          }}
        />
        <PanelToggle
          icon={Clock}
          title={t('panel.timelineTitle')}
          hint={project.timeline?.events?.length ? t('panel.timelineDefined', { count: project.timeline.events.length }) : t('panel.timelineHint')}
          active={showTimelineEditor}
          hasData={!!project.timeline?.events?.length}
          onClick={() => {
            closeAllEditors();
            setShowTimelineEditor(!showTimelineEditor);
          }}
        />
        <PanelToggle
          icon={ScrollText}
          title={t('panel.ruleTitle')}
          hint={project.ruleSystems?.length ? t('panel.ruleDefined', { count: project.ruleSystems.length }) : t('panel.ruleHint')}
          active={showRuleSystemEditor}
          hasData={!!project.ruleSystems?.length}
          onClick={() => {
            closeAllEditors();
            setShowRuleSystemEditor(!showRuleSystemEditor);
          }}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {graphEnabled && (
          <PanelToggle
            icon={Network}
            title={t('panel.graphTitle')}
            hint={t('panel.graphHint')}
            active={false}
            hasData={!!(project.characters?.length || project.factions?.length || project.locations?.length)}
            expandable={false}
            onClick={() => {
              setGraphInitialType('mixed');
              setShowWorldViewGraph(true);
            }}
          />
        )}
        {enhancedTimelineEnabled && (
          <PanelToggle
            icon={LayoutList}
            title={t('panel.enhancedTimelineTitle')}
            hint={t('panel.enhancedTimelineHint')}
            active={showEnhancedTimeline}
            hasData={showEnhancedTimeline}
            onClick={() => setShowEnhancedTimeline(!showEnhancedTimeline)}
          />
        )}
        {consistencyEnabled && (
          <PanelToggle
            icon={Shield}
            title={t('panel.consistencyTitle')}
            hint={t('panel.consistencyHint')}
            active={showConsistencyChecker}
            hasData={showConsistencyChecker}
            onClick={() => setShowConsistencyChecker(!showConsistencyChecker)}
          />
        )}
        {dataViewsEnabled && (
          <PanelToggle
            icon={Table2}
            title={t('panel.dataViewsTitle')}
            hint={t('panel.dataViewsHint')}
            active={showDataViews}
            hasData={!!(project.characters?.length || project.locations?.length || project.factions?.length || project.timeline?.events?.length)}
            onClick={() => setShowDataViews(!showDataViews)}
          />
        )}
        {dualTimelineEnabled && (
          <PanelToggle
            icon={Film}
            title={t('panel.dualTimelineTitle')}
            hint={t('panel.dualTimelineHint')}
            active={showDualTimeline}
            hasData={!!(project.chapters?.length || project.timeline?.events?.length)}
            onClick={() => setShowDualTimeline(!showDualTimeline)}
          />
        )}
        {screenplayEnabled && (
          <PanelToggle
            icon={Clapperboard}
            title={t('panel.screenplayTitle')}
            hint={t('panel.screenplayHint')}
            active={showScreenplay}
            hasData={!!project.chapters?.length}
            onClick={() => setShowScreenplay(!showScreenplay)}
          />
        )}
      </div>

      {recommenderEnabled && (
        <PanelToggle
          icon={WandSparkles}
          title={t('panel.recommenderTitle')}
          hint={t('panel.recommenderHint')}
          active={showSmartRecommender}
          hasData={showSmartRecommender}
          onClick={() => setShowSmartRecommender(!showSmartRecommender)}
        />
      )}
    </>
  );
};

export default KnowledgeFeaturePanels;
