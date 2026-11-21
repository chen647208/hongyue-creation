/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import React, { useEffect, useRef,useState } from 'react';

import { type CommitOptions,useProjectStore } from '@/app/stores/projectStore';
import { useUsableModel } from '@/app/stores/settingsStore';
import { useTranslation } from '@/i18n';
import { dialogService } from '@/shared/services/dialogService';
import { embeddingModelService } from '@/shared/services/embeddingModelService';
import { searchKnowledge } from '@/shared/services/knowledge/knowledgeSearch';
import { vectorIntegrationService } from '@/shared/services/knowledge/vectorIntegrationService';
import { Button } from '@/shared/ui/Button';

import { type ConsistencyCheckConfig,type ConsistencyCheckPromptTemplate, type DiagramType, type EmbeddingModelConfig, type HybridSearchResult, type KnowledgeCategory, type KnowledgeItem, type ModelConfig, type Project } from '../../../shared/types';
import { repository } from '../../shared/services/repository';
import { logger } from '../../shared/utils/logger';
import { KnowledgeDetailPanel } from './components/KnowledgeDetailPanel';
import { KnowledgeFeatureEditors,type TimelineView } from './components/KnowledgeFeatureEditors';
import KnowledgeFeaturePanels from './components/KnowledgeFeaturePanels';
import { KnowledgeListPanel } from './components/KnowledgeListPanel';
import { KnowledgeSearchBar, type KnowledgeSearchMode } from './components/KnowledgeSearchBar';
import { KnowledgeSearchResults } from './components/KnowledgeSearchResults';
import { useKnowledgeIndex } from './hooks/useKnowledgeIndex';

interface StepKnowledgeEnhancedProps {
  project: Project;
  /** 跳转到角色区并聚焦指定角色（跨分区导航由 App 提供） */
  onNavigateToCharacter?: (id: string) => void;
  /** 跳转到写作区并打开指定章节（跨分区导航由 App 提供） */
  onNavigateToChapter?: (id: string) => void;
  /** 空态接力：去结构页（跨分区导航由 App 提供） */
  onGoSection?: (next: 'structure') => void;
}

const StepKnowledgeEnhanced: React.FC<StepKnowledgeEnhancedProps> = ({
  project,
  onNavigateToCharacter,
  onNavigateToChapter,
  onGoSection,
}) => {
  const { t } = useTranslation('knowledge');
  const [viewingItem, setViewingItem] = useState<KnowledgeItem | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<KnowledgeCategory | 'all'>('all');

  const [editContent, setEditContent] = useState('');
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<KnowledgeCategory>('writing');
  const [isDirty, setIsDirty] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<HybridSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMode, setSearchMode] = useState<KnowledgeSearchMode>('hybrid');
  const [showSearchResults, setShowSearchResults] = useState(false);

  const [showLocationEditor, setShowLocationEditor] = useState(false);
  const [showFactionEditor, setShowFactionEditor] = useState(false);
  const [timelineView, setTimelineView] = useState<TimelineView | null>(null);
  const [showRuleSystemEditor, setShowRuleSystemEditor] = useState(false);

  const [showWorldViewGraph, setShowWorldViewGraph] = useState(false);
  const [graphInitialType, setGraphInitialType] = useState<DiagramType>('mixed');

  const [showConsistencyChecker, setShowConsistencyChecker] = useState(false);
  const [showSmartRecommender, setShowSmartRecommender] = useState(false);
  const [showDataViews, setShowDataViews] = useState(false);
  const [showScreenplay, setShowScreenplay] = useState(false);
  const [consistencyPrompts, setConsistencyPrompts] = useState<ConsistencyCheckPromptTemplate[]>([]);
  const [consistencyConfig, setConsistencyConfig] = useState<ConsistencyCheckConfig | null>(null);
  
  const updateActiveProject = useProjectStore((s) => s.updateActiveProject);
  const onUpdate = (updates: Partial<Project>, opts?: CommitOptions) => updateActiveProject(updates, opts);
  const storeModel = useUsableModel();
  const [activeModel, setActiveModel] = useState<ModelConfig | null>(storeModel ?? null);
  const [activeEmbeddingConfig, setActiveEmbeddingConfig] = useState<EmbeddingModelConfig | null>(null);

  // 外部导航目标（一致性检查/智能推荐「跳转到编辑」）：type 决定打开哪个面板，id 为实体 id。
  // 面板关闭时清空，避免下次手动打开仍残留上次跳转的选中项。
  const [navTarget, setNavTarget] = useState<{ type: string; id: string } | null>(null);

  // 处理来自一致性检查器 / 智能推荐 / 增强时间线的实体导航
  const handleNavigateToItem = (type: string, id: string) => {
    if (!id) return;
    switch (type) {
      case 'location':
        setShowFactionEditor(false);
        setShowRuleSystemEditor(false);
        setTimelineView(null);
        setNavTarget({ type: 'location', id });
        setShowLocationEditor(true);
        break;
      case 'faction':
        setShowLocationEditor(false);
        setShowRuleSystemEditor(false);
        setTimelineView(null);
        setNavTarget({ type: 'faction', id });
        setShowFactionEditor(true);
        break;
      case 'rule':
        setShowLocationEditor(false);
        setShowFactionEditor(false);
        setTimelineView(null);
        setNavTarget({ type: 'rule', id });
        setShowRuleSystemEditor(true);
        break;
      case 'timeline':
      case 'event':
        setShowLocationEditor(false);
        setShowFactionEditor(false);
        setShowRuleSystemEditor(false);
        setNavTarget({ type: 'timeline', id });
        setTimelineView('enhanced');
        break;
      case 'character':
        onNavigateToCharacter?.(id);
        break;
      case 'chapter':
        onNavigateToChapter?.(id);
        break;
      default:
        logger.debug('未知导航类型:', type, id);
    }
  };

  // 面板关闭时清除对应导航目标（仅当当前 navTarget 属于该面板）
  const clearNavTargetFor = (type: string) => {
    setNavTarget(prev => (prev && prev.type === type ? null : prev));
  };

  // 时间线三种视图共用一个面板：离开增强视图（选中事件所在处）即清空跳转目标
  const changeTimelineView = (view: TimelineView | null) => {
    setTimelineView(view);
    if (view !== 'enhanced') clearNavTargetFor('timeline');
  };

  useEffect(() => {
    // 模型清空/全停用时同步清空本地残留，避免旧模型继续发起调用
    setActiveModel(storeModel ?? null);
  }, [storeModel]);

  useEffect(() => {
    const loadConfigs = async () => {
      try {
        const prompts = await repository.loadConsistencyPrompts();
        const config = await repository.loadConsistencyCheckConfig();
        
        if (prompts) setConsistencyPrompts(prompts);
        if (config) setConsistencyConfig(config);
        
        const embeddingConfig = await embeddingModelService.getActiveConfig();
        if (embeddingConfig) {
          setActiveEmbeddingConfig(embeddingConfig);
        }
      } catch (error) {
        logger.error('Failed to load configs:', error);
      }
    };
    
    void loadConfigs();
  }, []);

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (viewingItem) {
      setEditContent(viewingItem.content);
      setEditName(viewingItem.name);
      setEditCategory(viewingItem.category);
      setIsDirty(false);
    }
  }, [viewingItem]);


  // 上传与向量索引状态/动作统一见 useKnowledgeIndex
  const { vectorStats, setVectorStats, isIndexing, setIsIndexing, indexProgress, indexKnowledgeItems, handleFiles } = useKnowledgeIndex({
    project, onUpdate, selectedCategory, t,
  });

  const getFilteredKnowledge = (): KnowledgeItem[] => {
    const knowledge = project.knowledge || [];
    if (selectedCategory === 'all') {
      return knowledge;
    }
    return knowledge.filter(item => item.category === selectedCategory);
  };

  const handleSemanticSearch = async (query: string) => {
    if (!query.trim() || !project.id) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    setIsSearching(true);
    setShowSearchResults(true);
    try {
      setSearchResults(await searchKnowledge({
        projectId: project.id,
        query,
        mode: searchMode,
        categoryItems: getFilteredKnowledge(),
        search: (q, o) => repository.search(q, o),
      }));
    } catch (error) {
      logger.error('搜索失败:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    if (query.trim()) {
      searchTimeoutRef.current = setTimeout(() => {
        void handleSemanticSearch(query);
      }, 500);
    } else {
      setSearchResults([]);
      setShowSearchResults(false);
    }
  };

  const handleDeleteClick = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!(await dialogService.confirm({ message: t('center.confirmDelete'), danger: true }))) return;
    const newList = (project.knowledge || []).filter(k => k.id !== id);
    onUpdate({ knowledge: newList });
    if (viewingItem?.id === id) setViewingItem(null);

    try {
      await vectorIntegrationService.cleanupProject(project.id);
      if (newList.length > 0) {
        await indexKnowledgeItems(newList);
      }
    } catch (error) {
      logger.error('从向量数据库删除失败:', error);
    }
  };

  const handleSave = async () => {
    if (!viewingItem) return;
    
    const updatedList = (project.knowledge || []).map(item => {
      if (item.id === viewingItem.id) {
        return { 
          ...item, 
          content: editContent, 
          name: editName,
          category: editCategory,
          size: new Blob([editContent]).size
        };
      }
      return item;
    });
    
    onUpdate({ knowledge: updatedList });
    
    setViewingItem(prev => prev ? ({ ...prev, content: editContent, name: editName, category: editCategory }) : null);
    setIsDirty(false);

    try {
      const updatedItem = updatedList.find(item => item.id === viewingItem.id);
      if (updatedItem) {
        await vectorIntegrationService.batchUpdateKnowledge(project.id, [{
          action: 'update',
          item: updatedItem
        }]);
        
        const stats = await vectorIntegrationService.getVectorStats(project.id);
        setVectorStats(stats);
      }
    } catch (error) {
      logger.error('更新向量数据库失败:', error);
    }
  };

  // 一键重建索引：先清本项目向量，再全量重索（换嵌入模型/维度后修复不一致）
  const handleRebuildIndex = async (): Promise<void> => {
    const items = project.knowledge || [];
    if (items.length === 0) {
      dialogService.alert(t('center.rebuildEmpty'));
      return;
    }
    const ok = await dialogService.confirm({ message: t('center.rebuildConfirm', { count: items.length }), danger: false });
    if (!ok) return;
    setIsIndexing(true);
    try {
      await vectorIntegrationService.cleanupProject(project.id);
      await indexKnowledgeItems(items);
    } catch (error) {
      logger.error('重建索引失败:', error);
      dialogService.alert(t('center.indexError', { error: error instanceof Error ? error.message : String(error) }));
    } finally {
      setIsIndexing(false);
    }
  };

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col">
      <div className="flex-none p-8 pb-4">
        <div className="flex items-end justify-between border-b border-border pb-6">
          <div>
            <h2 className="font-serif text-2xl font-semibold tracking-tight">{t('center.title')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('center.subtitle')}</p>
          </div>

          {vectorStats && (
            <div className="flex items-center gap-2">
              <span className="rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs tabular-nums text-muted-foreground">
                <span className="font-medium text-foreground">{vectorStats.count}</span> {t('center.vectorDocs')}
              </span>
              <span className="rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs tabular-nums text-muted-foreground">
                <span className="font-medium text-foreground">{vectorStats.dimensions}</span> {t('center.dimUnit')}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={isIndexing}
                title={t('center.rebuildTitle')}
                onClick={() => void handleRebuildIndex()}
              >
                {t('center.rebuildIndex')}
              </Button>
            </div>
          )}
        </div>

        <KnowledgeSearchBar
          value={searchQuery}
          onChange={handleSearchChange}
          onSearch={() => void handleSemanticSearch(searchQuery)}
          isSearching={isSearching}
          mode={searchMode}
          onModeChange={setSearchMode}
        />
      </div>{/* 固定头部区域结束 */}

      <div className="flex-1 overflow-y-auto px-8 pb-8 space-y-6">

      {showSearchResults && searchResults.length > 0 && (
        <KnowledgeSearchResults
          results={searchResults}
          mode={searchMode}
          onOpen={(knowledgeItemId) => {
            const item = project.knowledge?.find(k => k.id === knowledgeItemId);
            if (item) {
              setViewingItem(item);
              setShowSearchResults(false);
            }
          }}
          onClose={() => setShowSearchResults(false)}
        />
      )}

      <KnowledgeFeaturePanels
        project={project}
        showLocationEditor={showLocationEditor}
        setShowLocationEditor={(v) => { setShowLocationEditor(v); if (v === false) clearNavTargetFor('location'); }}
        showFactionEditor={showFactionEditor}
        setShowFactionEditor={(v) => { setShowFactionEditor(v); if (v === false) clearNavTargetFor('faction'); }}
        timelineView={timelineView}
        setTimelineView={changeTimelineView}
        showRuleSystemEditor={showRuleSystemEditor}
        setShowRuleSystemEditor={(v) => { setShowRuleSystemEditor(v); if (v === false) clearNavTargetFor('rule'); }}
        showConsistencyChecker={showConsistencyChecker}
        setShowConsistencyChecker={setShowConsistencyChecker}
        showSmartRecommender={showSmartRecommender}
        setShowSmartRecommender={setShowSmartRecommender}
        showDataViews={showDataViews}
        setShowDataViews={setShowDataViews}
        showScreenplay={showScreenplay}
        setShowScreenplay={setShowScreenplay}
        setShowWorldViewGraph={setShowWorldViewGraph}
        setGraphInitialType={setGraphInitialType}
      />

      <KnowledgeFeatureEditors
        project={project}
        navTarget={navTarget}
        onUpdate={onUpdate}
        activeModel={activeModel}
        activeEmbeddingConfig={activeEmbeddingConfig}
        consistencyPrompts={consistencyPrompts}
        consistencyConfig={consistencyConfig}
        graphInitialType={graphInitialType}
        showLocationEditor={showLocationEditor}
        showFactionEditor={showFactionEditor}
        timelineView={timelineView}
        onTimelineViewChange={changeTimelineView}
        showRuleSystemEditor={showRuleSystemEditor}
        showConsistencyChecker={showConsistencyChecker}
        showSmartRecommender={showSmartRecommender}
        showWorldViewGraph={showWorldViewGraph}
        showDataViews={showDataViews}
        showScreenplay={showScreenplay}
        onCloseWorldViewGraph={() => setShowWorldViewGraph(false)}
        onNavigateToChapter={onNavigateToChapter}
        onNavigateToItem={handleNavigateToItem}
      />

      <div className="grid flex-1 grid-cols-3 gap-6 overflow-hidden">
        <KnowledgeListPanel
          items={getFilteredKnowledge()}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          activeId={viewingItem?.id ?? null}
          onSelect={setViewingItem}
          onDelete={handleDeleteClick}
          onFiles={handleFiles}
          isIndexing={isIndexing}
          indexProgress={indexProgress}
          onGoSection={onGoSection}
        />

        <KnowledgeDetailPanel
          viewingItem={viewingItem}
          editName={editName}
          editContent={editContent}
          editCategory={editCategory}
          isDirty={isDirty}
          onNameChange={(v) => { setEditName(v); setIsDirty(true); }}
          onContentChange={(v) => { setEditContent(v); setIsDirty(true); }}
          onCategoryChange={(v) => { setEditCategory(v); setIsDirty(true); }}
          onSave={handleSave}
        />
      </div>
      </div>{/* 可滚动内容区域结束 */}
    </div>
  );
};

export default StepKnowledgeEnhanced;



