/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { Clock, Flag, MapPin, Plus, Save, Settings, Trash2, User } from 'lucide-react';
import React, { useEffect, useMemo,useState } from 'react';

import { i18n,useTranslation } from '@/i18n';
import { dialogService } from '@/shared/services/dialogService';
import { Button } from '@/shared/ui/Button';
import { Checkbox } from '@/shared/ui/Checkbox';
import { Input } from '@/shared/ui/Input';
import { Label } from '@/shared/ui/Label';
import { Select } from '@/shared/ui/Select';
import { Textarea } from '@/shared/ui/Textarea';
import { cn } from '@/shared/utils/cn';

import { type Chapter,type Character, type Faction, type HistoryDate, type Location, type Timeline, type TimelineEvent } from '../../../shared/types';

interface TimelineEditorProps {
  projectId: string;
  timeline?: Timeline;
  characters: Character[];
  locations: Location[];
  factions: Faction[];
  chapters: Chapter[];
  onSave: (timeline: Timeline) => void;
}

/** 关联对象勾选网格（角色/地点/势力共用）。 */
function RelatedToggleGrid({
  items,
  selectedIds,
  onToggle,
  emptyText,
}: {
  items: Array<{ id: string; name: string }>;
  selectedIds: string[] | undefined;
  onToggle: (id: string) => void;
  emptyText: string;
}) {
  if (items.length === 0) {
    return <p className="text-xs italic text-muted-foreground">{emptyText}</p>;
  }
  return (
    <div className="grid max-h-24 grid-cols-2 gap-2 overflow-y-auto">
      {items.map(item => {
        const checked = selectedIds?.includes(item.id) || false;
        return (
          <label
            key={item.id}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-md border p-2 transition-colors',
              checked ? 'border-primary/40 bg-primary/5' : 'border-transparent bg-muted/30 hover:bg-muted'
            )}
          >
            <Checkbox
              checked={checked}
              onChange={() => onToggle(item.id)}
              className="size-3.5"
            />
            <span className="truncate text-xs">{item.name}</span>
          </label>
        );
      })}
    </div>
  );
}

/**
 * 时间线编辑器组件
 * 
 * 功能：
 * - 创建/编辑时间线事件
 * - 按时间顺序排列事件
 * - 关联角色、地点、势力、章节
 * - 事件类型分类（剧情、角色、世界、势力等）
 * - 可视化时间线展示
 */
export const TimelineEditor: React.FC<TimelineEditorProps> = ({
  projectId,
  timeline,
  characters,
  locations,
  factions,
  chapters,
  onSave
}) => {
  const { t } = useTranslation('timeline');
  const [localTimeline, setLocalTimeline] = useState<Partial<Timeline>>({});
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [filterType, setFilterType] = useState<TimelineEvent['type'] | 'all'>('all');

  // 初始化本地状态
  useEffect(() => {
    if (timeline) {
      setLocalTimeline(timeline);
    } else {
      setLocalTimeline({
        id: `timeline_${Date.now()}`,
        projectId,
        config: {
          calendarSystem: i18n.t('timeline:editor.defaultCalendar'),
          name: i18n.t('timeline:editor.defaultName')
        },
        events: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }
  }, [timeline, projectId]);

  // 获取选中的事件
  const selectedEvent = localTimeline.events?.find(e => e.id === selectedEventId);

  // 排序后的事件列表
  const sortedEvents = useMemo(() => {
    const events = localTimeline.events || [];
    return [...events].sort((a, b) => {
      // 先按年排序
      const yearDiff = (a.date.year || 0) - (b.date.year || 0);
      if (yearDiff !== 0) return yearDiff;
      // 再按月排序
      const monthDiff = (a.date.month || 0) - (b.date.month || 0);
      if (monthDiff !== 0) return monthDiff;
      // 最后按日排序
      return (a.date.day || 0) - (b.date.day || 0);
    });
  }, [localTimeline.events]);

  // 过滤后的事件
  const filteredEvents = useMemo(() => {
    if (filterType === 'all') return sortedEvents;
    return sortedEvents.filter(e => e.type === filterType);
  }, [sortedEvents, filterType]);

  // 更新时间线配置
  const updateConfig = (updates: Partial<Timeline['config']>) => {
    setLocalTimeline(prev => ({
      ...prev,
      config: { ...prev.config, ...updates } as Timeline['config']
    }));
    setHasChanges(true);
  };

  // 添加新事件
  const addEvent = () => {
    const newEvent: TimelineEvent = {
      id: `event_${Date.now()}`,
      date: { year: 0 },
      title: t('editor.defaultEventTitle'),
      description: '',
      type: 'plot'
    };
    setLocalTimeline(prev => ({
      ...prev,
      events: [...(prev.events || []), newEvent]
    }));
    setSelectedEventId(newEvent.id);
    setHasChanges(true);
  };

  // 更新事件
  const updateEvent = (id: string, updates: Partial<TimelineEvent>) => {
    setLocalTimeline(prev => ({
      ...prev,
      events: prev.events?.map(e => 
        e.id === id ? { ...e, ...updates } : e
      )
    }));
    setHasChanges(true);
  };

  // 删除事件
  const deleteEvent = async (id: string) => {
    if (await dialogService.confirm({ message: t('editor.deleteConfirm'), danger: true })) {
      setLocalTimeline(prev => ({
        ...prev,
        events: prev.events?.filter(e => e.id !== id)
      }));
      if (selectedEventId === id) {
        setSelectedEventId(null);
      }
      setHasChanges(true);
    }
  };

  // 保存所有更改
  const handleSave = () => {
    const toSave: Timeline = {
      id: localTimeline.id || `timeline_${Date.now()}`,
      projectId,
      config: localTimeline.config || { calendarSystem: t('editor.defaultCalendar') },
      events: localTimeline.events || [],
      createdAt: localTimeline.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    onSave(toSave);
    setHasChanges(false);
  };

  // 获取事件类型显示名称
  const getEventTypeLabel = (type: TimelineEvent['type']) => {
    return t(`type.${type}`);
  };

  // 获取事件类型颜色（语义色，双主题安全）
  const getEventTypeColor = (type: TimelineEvent['type']) => {
    const colors: Record<TimelineEvent['type'], string> = {
      plot: 'bg-chart-1/10 text-chart-1',
      character: 'bg-chart-5/10 text-chart-5',
      world: 'bg-chart-4/10 text-chart-4',
      faction: 'bg-chart-2/10 text-chart-2',
      battle: 'bg-destructive/10 text-destructive',
      discovery: 'bg-chart-8/10 text-chart-8',
      other: 'bg-muted text-foreground/80'
    };
    return colors[type] || 'bg-muted text-foreground/80';
  };

  // 格式化日期显示
  const formatDate = (date: HistoryDate) => {
    if (date.display) return date.display;
    const parts = [];
    if (date.year !== undefined) parts.push(t('date.year', { year: date.year }));
    if (date.month) parts.push(t('date.month', { month: date.month }));
    if (date.day) parts.push(t('date.day', { day: date.day }));
    return parts.join('') || t('date.unset');
  };

  /** 切换某类关联对象的勾选状态。 */
  const toggleRelation = (key: 'relatedCharacterIds' | 'relatedLocationIds' | 'relatedFactionIds', id: string) => {
    if (!selectedEvent) return;
    const currentIds = selectedEvent[key] || [];
    const newIds = currentIds.includes(id)
      ? currentIds.filter(x => x !== id)
      : [...currentIds, id];
    updateEvent(selectedEvent.id, { [key]: newIds });
  };

  return (
    <div className="space-y-4">
      {/* 时间线配置 */}
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <h4 className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Settings className="size-4 text-muted-foreground" />
          {t('editor.configTitle')}
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('editor.nameLabel')}</Label>
            <Input
              type="text"
              value={localTimeline.config?.name || ''}
              onChange={(e) => updateConfig({ name: e.target.value })}
              placeholder={t('editor.namePlaceholder')}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('editor.calendarLabel')}</Label>
            <Input
              type="text"
              value={localTimeline.config?.calendarSystem || ''}
              onChange={(e) => updateConfig({ calendarSystem: e.target.value })}
              placeholder={t('editor.calendarPlaceholder')}
            />
          </div>
        </div>
      </div>

      {/* 工具栏 */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('editor.filterLabel')}</span>
          <Select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as TimelineEvent['type'] | 'all')}
            className="h-8 w-auto text-sm"
          >
            <option value="all">{t('filter.allTypes')}</option>
            <option value="plot">{t('type.plot')}</option>
            <option value="character">{t('type.character')}</option>
            <option value="world">{t('type.world')}</option>
            <option value="faction">{t('type.faction')}</option>
            <option value="battle">{t('type.battle')}</option>
            <option value="discovery">{t('type.discovery')}</option>
            <option value="other">{t('type.other')}</option>
          </Select>
        </div>
        <Button onClick={addEvent}>
          <Plus className="size-4" />
          {t('editor.addEvent')}
        </Button>
      </div>

      <div className="grid grid-cols-5 gap-4">
        {/* 事件列表 */}
        <div className="col-span-2 overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border bg-muted/30 p-3">
            <h4 className="text-sm font-medium">
              {t('editor.eventList')} ({filteredEvents.length})
            </h4>
            <span className="text-xs text-muted-foreground">
              {t('eventsCount', { count: localTimeline.events?.length || 0 })}
            </span>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {filteredEvents.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {filterType !== 'all' ? t('editor.emptyFiltered') : t('editor.emptyAll')}
              </div>
            ) : (
              <div className="relative">
                {/* 时间线轴线 */}
                <div className="absolute bottom-0 left-4 top-0 w-px bg-border"></div>

                {filteredEvents.map((event) => (
                  <div
                    key={event.id}
                    onClick={() => setSelectedEventId(event.id)}
                    className={cn(
                      'relative cursor-pointer border-b border-border p-3 transition-colors last:border-0',
                      selectedEventId === event.id
                        ? 'bg-primary/5'
                        : 'hover:bg-accent/40'
                    )}
                  >
                    {/* 时间点标记 */}
                    <div className={cn(
                      'absolute left-[13px] top-4 size-3 rounded-full border-2',
                      selectedEventId === event.id
                        ? 'border-primary bg-primary'
                        : 'border-border bg-card'
                    )}></div>

                    <div className="ml-8">
                      <div className="flex items-center gap-2">
                        <span className={cn('rounded px-1.5 py-0.5 text-xs', getEventTypeColor(event.type))}>
                          {getEventTypeLabel(event.type)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(event.date)}
                        </span>
                      </div>
                      <h5 className="mt-1 font-serif text-sm font-medium">
                        {event.title}
                      </h5>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {event.description || t('editor.noDescription')}
                      </p>

                      {/* 关联信息 */}
                      {((event.relatedCharacterIds?.length ?? 0) > 0 || (event.relatedLocationIds?.length ?? 0) > 0 || (event.relatedFactionIds?.length ?? 0) > 0) && (
                        <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
                          {(event.relatedCharacterIds?.length ?? 0) > 0 && (
                            <span className="flex items-center gap-1"><User className="size-3.5" />{event.relatedCharacterIds?.length ?? 0}</span>
                          )}
                          {(event.relatedLocationIds?.length ?? 0) > 0 && (
                            <span className="flex items-center gap-1"><MapPin className="size-3.5" />{event.relatedLocationIds?.length ?? 0}</span>
                          )}
                          {(event.relatedFactionIds?.length ?? 0) > 0 && (
                            <span className="flex items-center gap-1"><Flag className="size-3.5" />{event.relatedFactionIds?.length ?? 0}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 事件详情编辑 */}
        <div className="col-span-3">
          {selectedEvent ? (
            <div className="max-h-[500px] space-y-4 overflow-y-auto rounded-lg border border-border bg-card p-4">
              {/* 头部 */}
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h4 className="text-sm font-medium">{t('editor.detailTitle')}</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => deleteEvent(selectedEvent.id)}
                >
                  <Trash2 className="size-4" />
                  {t('editor.delete')}
                </Button>
              </div>

              {/* 基本信息 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t('editor.titleLabel')}</Label>
                  <Input
                    type="text"
                    value={selectedEvent.title}
                    onChange={(e) => updateEvent(selectedEvent.id, { title: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t('editor.typeLabel')}</Label>
                  <Select
                    value={selectedEvent.type}
                    onChange={(e) => updateEvent(selectedEvent.id, { type: e.target.value as TimelineEvent['type'] })}
                  >
                    <option value="plot">{t('type.plot')}</option>
                    <option value="character">{t('type.character')}</option>
                    <option value="world">{t('type.world')}</option>
                    <option value="faction">{t('type.faction')}</option>
                    <option value="battle">{t('type.battle')}</option>
                    <option value="discovery">{t('type.discovery')}</option>
                    <option value="other">{t('type.other')}</option>
                  </Select>
                </div>
              </div>

              {/* 日期 */}
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <h5 className="mb-2 text-xs font-medium text-muted-foreground">{t('editor.dateTitle')}</h5>
                <div className="grid grid-cols-4 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t('editor.yearLabel')}</Label>
                    <Input
                      type="number"
                      value={selectedEvent.date.year || 0}
                      onChange={(e) => updateEvent(selectedEvent.id, {
                        date: { ...selectedEvent.date, year: parseInt(e.target.value) || 0 }
                      })}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t('editor.monthLabel')}</Label>
                    <Input
                      type="number"
                      value={selectedEvent.date.month || ''}
                      onChange={(e) => updateEvent(selectedEvent.id, {
                        date: { ...selectedEvent.date, month: e.target.value ? parseInt(e.target.value) : undefined }
                      })}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t('editor.dayLabel')}</Label>
                    <Input
                      type="number"
                      value={selectedEvent.date.day || ''}
                      onChange={(e) => updateEvent(selectedEvent.id, {
                        date: { ...selectedEvent.date, day: e.target.value ? parseInt(e.target.value) : undefined }
                      })}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t('editor.displayLabel')}</Label>
                    <Input
                      type="text"
                      value={selectedEvent.date.display || ''}
                      onChange={(e) => updateEvent(selectedEvent.id, {
                        date: { ...selectedEvent.date, display: e.target.value }
                      })}
                      placeholder={t('editor.displayPlaceholder')}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* 描述 */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t('editor.descLabel')}</Label>
                <Textarea
                  value={selectedEvent.description}
                  onChange={(e) => updateEvent(selectedEvent.id, { description: e.target.value })}
                  placeholder={t('editor.descPlaceholder')}
                  rows={3}
                />
              </div>

              {/* 影响 */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t('editor.impactLabel')}</Label>
                <Textarea
                  value={selectedEvent.impact || ''}
                  onChange={(e) => updateEvent(selectedEvent.id, { impact: e.target.value })}
                  placeholder={t('editor.impactPlaceholder')}
                  rows={2}
                />
              </div>

              {/* 重要度（过滤用枚举，与语言无关） */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t('editor.significanceLabel')}</Label>
                <Select
                  value={selectedEvent.significance ?? ''}
                  onChange={(e) => updateEvent(selectedEvent.id, { significance: (e.target.value || undefined) as TimelineEvent['significance'] })}
                >
                  <option value="">{t('editor.noLink')}</option>
                  <option value="major">{t('editor.significanceMajor')}</option>
                  <option value="minor">{t('editor.significanceMinor')}</option>
                </Select>
              </div>

              {/* 关联章节 */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t('editor.relatedChapterLabel')}</Label>
                <Select
                  value={selectedEvent.relatedChapterId || ''}
                  onChange={(e) => updateEvent(selectedEvent.id, { relatedChapterId: e.target.value || undefined })}
                >
                  <option value="">{t('editor.noLink')}</option>
                  {chapters.map(chapter => (
                    <option key={chapter.id} value={chapter.id}>
                      {t('editor.chapterOption', { num: chapter.order + 1, title: chapter.title })}
                    </option>
                  ))}
                </Select>
              </div>

              {/* 关联角色 */}
              <div className="border-t border-border pt-3">
                <Label className="mb-2 block text-xs text-muted-foreground">{t('editor.relatedCharactersLabel')}</Label>
                <RelatedToggleGrid
                  items={characters}
                  selectedIds={selectedEvent.relatedCharacterIds}
                  onToggle={(id) => toggleRelation('relatedCharacterIds', id)}
                  emptyText={t('editor.noCharacters')}
                />
              </div>

              {/* 关联地点 */}
              <div className="border-t border-border pt-3">
                <Label className="mb-2 block text-xs text-muted-foreground">{t('editor.relatedLocationsLabel')}</Label>
                <RelatedToggleGrid
                  items={locations}
                  selectedIds={selectedEvent.relatedLocationIds}
                  onToggle={(id) => toggleRelation('relatedLocationIds', id)}
                  emptyText={t('editor.noLocations')}
                />
              </div>

              {/* 关联势力 */}
              <div className="border-t border-border pt-3">
                <Label className="mb-2 block text-xs text-muted-foreground">{t('editor.relatedFactionsLabel')}</Label>
                <RelatedToggleGrid
                  items={factions}
                  selectedIds={selectedEvent.relatedFactionIds}
                  onToggle={(id) => toggleRelation('relatedFactionIds', id)}
                  emptyText={t('editor.noFactions')}
                />
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Clock className="mx-auto mb-2 size-10 opacity-30" strokeWidth={1.5} />
                <p className="text-sm">{t('editor.selectToEdit')}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 保存按钮 */}
      {hasChanges && (
        <div className="flex justify-end border-t border-border pt-4">
          <Button onClick={handleSave}>
            <Save className="size-4" />
            {t('editor.save')}
          </Button>
        </div>
      )}
    </div>
  );
};

export default TimelineEditor;



