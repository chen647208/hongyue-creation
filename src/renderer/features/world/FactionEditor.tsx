/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { BarChart3, Crown, Flag, MapPin, Plus, Save, Search, Trash2, Users, X } from 'lucide-react';
import React, { useEffect,useState } from 'react';

import { useTranslation } from '@/i18n';
import { dialogService } from '@/shared/services/dialogService';
import { Button } from '@/shared/ui/Button';
import { Checkbox } from '@/shared/ui/Checkbox';
import { Input } from '@/shared/ui/Input';
import { Label } from '@/shared/ui/Label';
import { Select } from '@/shared/ui/Select';
import { Textarea } from '@/shared/ui/Textarea';
import { cn } from '@/shared/utils/cn';

import { type Character,type Faction, type Location } from '../../../shared/types';

interface FactionEditorProps {
  projectId: string;
  factions: Faction[];
  locations: Location[];
  characters: Character[];
  onSave: (factions: Faction[]) => void;
  /** 外部导航（一致性检查/智能推荐「跳转到编辑」）时预选中的势力 id */
  initialSelectedId?: string | null;
}

/**
 * 势力编辑器组件
 * 
 * 功能：
 * - 创建/编辑/删除势力
 * - 势力类型选择（王国、门派、公会等）
 * - 实力评估（军事、经济、影响力）
 * - 势力关系网（同盟、敌对、从属等）
 * - 成员和领地管理
 */
export const FactionEditor: React.FC<FactionEditorProps> = ({
  projectId,
  factions,
  locations,
  characters,
  onSave,
  initialSelectedId
}) => {
  const { t } = useTranslation('world');
  const [localFactions, setLocalFactions] = useState<Faction[]>([]);
  const [selectedFactionId, setSelectedFactionId] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // 初始化本地状态
  useEffect(() => {
    setLocalFactions(factions || []);
  }, [factions]);

  // 外部导航：id 变化时选中对应势力
  useEffect(() => {
    if (initialSelectedId && (factions || []).some(f => f.id === initialSelectedId)) {
      setSelectedFactionId(initialSelectedId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSelectedId]);

  // 获取选中的势力
  const selectedFaction = localFactions.find(f => f.id === selectedFactionId);

  // 添加新势力
  const addFaction = () => {
    const newFaction: Faction = {
      id: `faction_${Date.now()}`,
      projectId,
      name: t('faction.defaultName'),
      type: 'organization',
      description: '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    setLocalFactions([...localFactions, newFaction]);
    setSelectedFactionId(newFaction.id);
    setHasChanges(true);
  };

  // 更新势力
  const updateFaction = (id: string, updates: Partial<Faction>) => {
    setLocalFactions(prev => prev.map(faction => 
      faction.id === id 
        ? { ...faction, ...updates, updatedAt: Date.now() }
        : faction
    ));
    setHasChanges(true);
  };

  // 删除势力
  const deleteFaction = async (id: string) => {
    if (await dialogService.confirm({ message: t('faction.deleteConfirm'), danger: true })) {
      // 删除势力时，同时清除其他势力对该势力的引用
      setLocalFactions(prev => prev
        .filter(f => f.id !== id)
        .map(f => ({
          ...f,
          relations: f.relations?.filter(r => r.factionId !== id)
        }))
      );
      // 同时清除地点对该势力的引用
      // 注意：这里只更新本地状态，实际地点数据需要在父组件中处理
      if (selectedFactionId === id) {
        setSelectedFactionId(null);
      }
      setHasChanges(true);
    }
  };

  // 添加势力关系
  const addRelation = (factionId: string) => {
    const faction = localFactions.find(f => f.id === factionId);
    if (!faction) return;

    const availableFactions = localFactions.filter(f => f.id !== factionId);
    if (availableFactions.length === 0) {
      dialogService.alert(t('faction.noOtherFactions'));
      return;
    }

    const newRelation = {
      factionId: availableFactions[0]?.id ?? '',
      type: 'neutral' as const,
      description: ''
    };

    updateFaction(factionId, {
      relations: [...(faction.relations || []), newRelation]
    });
  };

  // 更新势力关系
  const updateRelation = (factionId: string, index: number, updates: Partial<NonNullable<Faction['relations']>[0]>) => {
    const faction = localFactions.find(f => f.id === factionId);
    if (!faction?.relations) return;

    const newRelations = [...faction.relations];
    const current = newRelations[index];
    if (!current) return;
    newRelations[index] = { ...current, ...updates };
    updateFaction(factionId, { relations: newRelations });
  };

  // 删除势力关系
  const removeRelation = (factionId: string, index: number) => {
    const faction = localFactions.find(f => f.id === factionId);
    if (!faction?.relations) return;

    const newRelations = faction.relations.filter((_, i) => i !== index);
    updateFaction(factionId, { relations: newRelations });
  };

  // 切换地点控制
  const toggleLocationControl = (factionId: string, locationId: string) => {
    const faction = localFactions.find(f => f.id === factionId);
    if (!faction) return;

    const currentLocations = faction.controlledLocationIds || [];
    const newLocations = currentLocations.includes(locationId)
      ? currentLocations.filter(id => id !== locationId)
      : [...currentLocations, locationId];

    updateFaction(factionId, { controlledLocationIds: newLocations });
  };

  // 切换成员
  const toggleMember = (factionId: string, characterId: string) => {
    const faction = localFactions.find(f => f.id === factionId);
    if (!faction) return;

    const currentMembers = faction.memberCharacterIds || [];
    const newMembers = currentMembers.includes(characterId)
      ? currentMembers.filter(id => id !== characterId)
      : [...currentMembers, characterId];

    updateFaction(factionId, { memberCharacterIds: newMembers });
  };

  // 保存所有更改
  const handleSave = () => {
    onSave(localFactions);
    setHasChanges(false);
  };

  // 过滤势力列表
  const filteredFactions = localFactions.filter(faction =>
    faction.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    faction.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 获取势力类型显示名称
  const getFactionTypeLabel = (type: Faction['type']) => t(`faction.type.${type}`);

  // 获取关系类型颜色（语义色，双主题安全）
  const getRelationTypeColor = (type: NonNullable<Faction['relations']>[0]['type']) => {
    const colors = {
      ally: 'bg-chart-1/10 text-chart-1',
      enemy: 'bg-destructive/10 text-destructive',
      neutral: 'bg-muted text-foreground/80',
      vassal: 'bg-chart-4/10 text-chart-4',
      suzerain: 'bg-chart-2/10 text-chart-2',
      rival: 'bg-chart-6/10 text-chart-6',
      trade: 'bg-chart-5/10 text-chart-5'
    };
    return (colors as Record<string, string>)[type] || 'bg-muted text-foreground/80';
  };

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('faction.searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <Button onClick={addFaction}>
          <Plus className="size-4" />
          {t('faction.add')}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* 势力列表 */}
        <div className="col-span-1 overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border bg-muted/30 p-3">
            <h4 className="text-sm font-medium">
              {t('faction.listTitle', { count: filteredFactions.length })}
            </h4>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {filteredFactions.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {searchQuery ? t('faction.noMatch') : t('faction.empty')}
              </div>
            ) : (
              filteredFactions.map(faction => (
                <div
                  key={faction.id}
                  onClick={() => setSelectedFactionId(faction.id)}
                  className={cn(
                    'cursor-pointer border-b border-border p-3 transition-colors last:border-0',
                    selectedFactionId === faction.id
                      ? 'border-l-4 border-l-primary bg-primary/5'
                      : 'border-l-4 border-l-transparent hover:bg-accent/40'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate font-serif text-sm font-medium">
                      {faction.name}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-xs text-muted-foreground">
                      {getFactionTypeLabel(faction.type)}
                    </span>
                    {faction.leaderId && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Crown className="size-3.5" />
                        {characters.find(c => c.id === faction.leaderId)?.name || t('faction.unknownLeader')}
                      </span>
                    )}
                  </div>
                  {((faction.controlledLocationIds?.length ?? 0) > 0 || (faction.memberCharacterIds?.length ?? 0) > 0) && (
                    <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
                      {(faction.controlledLocationIds?.length ?? 0) > 0 && (
                        <span className="flex items-center gap-1"><MapPin className="size-3.5" />{t('faction.territoriesCount', { count: faction.controlledLocationIds?.length ?? 0 })}</span>
                      )}
                      {(faction.memberCharacterIds?.length ?? 0) > 0 && (
                        <span className="flex items-center gap-1"><Users className="size-3.5" />{t('faction.membersCount', { count: faction.memberCharacterIds?.length ?? 0 })}</span>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* 势力详情编辑 */}
        <div className="col-span-2 max-h-[400px] overflow-y-auto">
          {selectedFaction ? (
            <div className="space-y-4 rounded-lg border border-border bg-card p-4">
              {/* 头部 */}
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h4 className="text-sm font-medium">{t('faction.detailsTitle')}</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => deleteFaction(selectedFaction.id)}
                >
                  <Trash2 className="size-4" />
                  {t('faction.delete')}
                </Button>
              </div>

              {/* 基本信息 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t('faction.nameLabel')}</Label>
                  <Input
                    type="text"
                    value={selectedFaction.name}
                    onChange={(e) => updateFaction(selectedFaction.id, { name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t('faction.typeLabel')}</Label>
                  <Select
                    value={selectedFaction.type}
                    onChange={(e) => updateFaction(selectedFaction.id, { type: e.target.value as Faction['type'] })}
                  >
                    {(['kingdom', 'empire', 'sect', 'guild', 'family', 'tribe', 'organization', 'alliance', 'other'] as Faction['type'][]).map(ty => (
                      <option key={ty} value={ty}>{t(`faction.type.${ty}`)}</option>
                    ))}
                  </Select>
                </div>
              </div>

              {/* 描述 */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t('faction.descLabel')}</Label>
                <Textarea
                  value={selectedFaction.description}
                  onChange={(e) => updateFaction(selectedFaction.id, { description: e.target.value })}
                  placeholder={t('faction.descPlaceholder')}
                  rows={3}
                />
              </div>

              {/* 理念 */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t('faction.ideologyLabel')}</Label>
                <Input
                  type="text"
                  value={selectedFaction.ideology || ''}
                  onChange={(e) => updateFaction(selectedFaction.id, { ideology: e.target.value })}
                  placeholder={t('faction.ideologyPlaceholder')}
                />
              </div>

              {/* 标志 */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t('faction.emblemLabel')}</Label>
                <Input
                  type="text"
                  value={selectedFaction.emblem || ''}
                  onChange={(e) => updateFaction(selectedFaction.id, { emblem: e.target.value })}
                  placeholder={t('faction.emblemPlaceholder')}
                />
              </div>

              {/* 创立时间 */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t('faction.foundedLabel')}</Label>
                <Input
                  type="text"
                  value={selectedFaction.foundedDate || ''}
                  onChange={(e) => updateFaction(selectedFaction.id, { foundedDate: e.target.value })}
                  placeholder={t('faction.foundedPlaceholder')}
                />
              </div>

              {/* 实力评估 */}
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <h5 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <BarChart3 className="size-3.5" />
                  {t('faction.strengthTitle')}
                </h5>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t('faction.militaryLabel')}</Label>
                    <Input
                      type="text"
                      value={selectedFaction.strength?.military || ''}
                      onChange={(e) => updateFaction(selectedFaction.id, {
                        strength: { ...selectedFaction.strength, military: e.target.value, overall: selectedFaction.strength?.overall || '' }
                      })}
                      placeholder={t('faction.militaryPlaceholder')}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t('faction.economicLabel')}</Label>
                    <Input
                      type="text"
                      value={selectedFaction.strength?.economic || ''}
                      onChange={(e) => updateFaction(selectedFaction.id, {
                        strength: { ...selectedFaction.strength, economic: e.target.value, overall: selectedFaction.strength?.overall || '' }
                      })}
                      placeholder={t('faction.economicPlaceholder')}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t('faction.influenceLabel')}</Label>
                    <Input
                      type="text"
                      value={selectedFaction.strength?.influence || ''}
                      onChange={(e) => updateFaction(selectedFaction.id, {
                        strength: { ...selectedFaction.strength, influence: e.target.value, overall: selectedFaction.strength?.overall || '' }
                      })}
                      placeholder={t('faction.influencePlaceholder')}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t('faction.overallLabel')}</Label>
                    <Input
                      type="text"
                      value={selectedFaction.strength?.overall || ''}
                      onChange={(e) => updateFaction(selectedFaction.id, {
                        strength: { ...selectedFaction.strength, overall: e.target.value }
                      })}
                      placeholder={t('faction.overallPlaceholder')}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* 势力领袖 */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t('faction.leaderLabel')}</Label>
                <Select
                  value={selectedFaction.leaderId || ''}
                  onChange={(e) => updateFaction(selectedFaction.id, { leaderId: e.target.value || undefined })}
                >
                  <option value="">{t('faction.leaderUnset')}</option>
                  {characters.map(char => (
                    <option key={char.id} value={char.id}>{char.name}</option>
                  ))}
                </Select>
              </div>

              {/* 势力关系 */}
              <div className="border-t border-border pt-3">
                <div className="mb-2 flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">{t('faction.relationsLabel')}</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-primary hover:text-primary"
                    onClick={() => addRelation(selectedFaction.id)}
                  >
                    <Plus className="size-4" /> {t('faction.addRelation')}
                  </Button>
                </div>

                {!selectedFaction.relations || selectedFaction.relations.length === 0 ? (
                  <p className="text-xs italic text-muted-foreground">{t('faction.noRelations')}</p>
                ) : (
                  <div className="space-y-2">
                    {selectedFaction.relations.map((relation, index) => (
                      <div key={index} className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-2">
                        <span className="shrink-0 text-xs text-muted-foreground">{t('faction.relationWith')}</span>
                        <Select
                          value={relation.factionId}
                          onChange={(e) => updateRelation(selectedFaction.id, index, { factionId: e.target.value })}
                          className="h-8 flex-1 text-sm"
                        >
                          {localFactions
                            .filter(f => f.id !== selectedFaction.id)
                            .map(f => (
                              <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                        </Select>
                        <select
                          value={relation.type}
                          onChange={(e) => updateRelation(selectedFaction.id, index, { type: e.target.value as NonNullable<Faction['relations']>[0]['type'] })}
                          className={cn('h-8 rounded-md border-0 px-2 text-xs font-medium', getRelationTypeColor(relation.type))}
                        >
                          {(['ally', 'enemy', 'neutral', 'vassal', 'suzerain', 'rival', 'trade'] as NonNullable<Faction['relations']>[0]['type'][]).map(rt => (
                            <option key={rt} value={rt}>{t(`faction.relationType.${rt}`)}</option>
                          ))}
                        </select>
                        <Input
                          type="text"
                          value={relation.description || ''}
                          onChange={(e) => updateRelation(selectedFaction.id, index, { description: e.target.value })}
                          placeholder={t('faction.relationDescPlaceholder')}
                          className="h-8 flex-1 text-xs"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeRelation(selectedFaction.id, index)}
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 控制领地 */}
              <div className="border-t border-border pt-3">
                <Label className="mb-2 block text-xs text-muted-foreground">{t('faction.territoryLabel')}</Label>
                {locations.length === 0 ? (
                  <p className="text-xs italic text-muted-foreground">{t('faction.noLocations')}</p>
                ) : (
                  <div className="grid max-h-32 grid-cols-2 gap-2 overflow-y-auto">
                    {locations.map(location => (
                      <label
                        key={location.id}
                        className={cn(
                          'flex cursor-pointer items-center gap-2 rounded-md border p-2 transition-colors',
                          selectedFaction.controlledLocationIds?.includes(location.id)
                            ? 'border-primary/40 bg-primary/5'
                            : 'border-transparent bg-muted/30 hover:bg-muted'
                        )}
                      >
                        <Checkbox
                          checked={selectedFaction.controlledLocationIds?.includes(location.id) || false}
                          onChange={() => toggleLocationControl(selectedFaction.id, location.id)}
                          className="size-3.5 accent-primary"
                        />
                        <span className="truncate text-xs">{location.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* 成员列表 */}
              <div className="border-t border-border pt-3">
                <Label className="mb-2 block text-xs text-muted-foreground">{t('faction.membersLabel')}</Label>
                {characters.length === 0 ? (
                  <p className="text-xs italic text-muted-foreground">{t('faction.noCharacters')}</p>
                ) : (
                  <div className="grid max-h-32 grid-cols-2 gap-2 overflow-y-auto">
                    {characters.map(character => (
                      <label
                        key={character.id}
                        className={cn(
                          'flex cursor-pointer items-center gap-2 rounded-md border p-2 transition-colors',
                          selectedFaction.memberCharacterIds?.includes(character.id)
                            ? 'border-primary/40 bg-primary/5'
                            : 'border-transparent bg-muted/30 hover:bg-muted'
                        )}
                      >
                        <Checkbox
                          checked={selectedFaction.memberCharacterIds?.includes(character.id) || false}
                          onChange={() => toggleMember(selectedFaction.id, character.id)}
                          className="size-3.5 accent-primary"
                        />
                        <span className="truncate text-xs">{character.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Flag className="mx-auto mb-2 size-10 opacity-30" strokeWidth={1.5} />
                <p className="text-sm">{t('faction.selectHint')}</p>
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
            {t('faction.save')}
          </Button>
        </div>
      )}
    </div>
  );
};

export default FactionEditor;



