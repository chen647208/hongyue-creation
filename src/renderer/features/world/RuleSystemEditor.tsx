/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { ArrowDown, ArrowUp, Briefcase, ChevronDown, ChevronUp, Coins, Cpu, Crown, Dumbbell, ListTree, type LucideIcon,Plus, Save, Settings2, Sparkles, Trash2, X } from 'lucide-react';
import React, { useEffect,useState } from 'react';

import { useTranslation } from '@/i18n';
import { dialogService } from '@/shared/services/dialogService';
import { Button } from '@/shared/ui/Button';
import { Checkbox } from '@/shared/ui/Checkbox';
import { Input } from '@/shared/ui/Input';
import { Label } from '@/shared/ui/Label';
import { Textarea } from '@/shared/ui/Textarea';
import { cn } from '@/shared/utils/cn';

import { type Character,type RuleLevel, type RuleSystem, type RuleSystemType } from '../../../shared/types';


interface RuleSystemEditorProps {
  projectId: string;
  ruleSystems: RuleSystem[];
  characters: Character[];
  onSave: (ruleSystems: RuleSystem[]) => void;
  /** 外部导航（一致性检查/智能推荐「跳转到编辑」）时预选中的规则系统 id */
  initialSelectedId?: string | null;
}

/**
 * 规则系统编辑器组件
 * 
 * 功能：
 * - 创建/编辑/删除规则系统
 * - 支持多种类型：修炼、魔法、科技、货币、组织、职业、称号
 * - 等级/层次管理
 * - 角色关联分配
 */
export const RuleSystemEditor: React.FC<RuleSystemEditorProps> = ({
  projectId,
  ruleSystems,
  characters,
  onSave,
  initialSelectedId
}) => {
  const { t } = useTranslation('world');
  const [localRuleSystems, setLocalRuleSystems] = useState<RuleSystem[]>([]);
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // 初始化本地状态
  useEffect(() => {
    setLocalRuleSystems(ruleSystems || []);
  }, [ruleSystems]);

  // 外部导航：id 变化时选中对应规则系统
  useEffect(() => {
    if (initialSelectedId && (ruleSystems || []).some(r => r.id === initialSelectedId)) {
      setSelectedSystemId(initialSelectedId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSelectedId]);

  // 获取规则类型显示名称
  const getRuleTypeLabel = (type: RuleSystemType): string => t(`rule.type.${type}`);

  // 获取规则类型图标
  const getRuleTypeIcon = (type: RuleSystemType): LucideIcon => {
    const icons: Record<RuleSystemType, LucideIcon> = {
      cultivation: Dumbbell,
      magic: Sparkles,
      tech: Cpu,
      currency: Coins,
      organization: ListTree,
      profession: Briefcase,
      title: Crown,
      custom: Settings2
    };
    return icons[type];
  };

  // 获取规则类型颜色（语义色，双主题安全）
  const getRuleTypeColor = (type: RuleSystemType): string => {
    const colors: Record<RuleSystemType, string> = {
      cultivation: 'bg-destructive/10 text-destructive',
      magic: 'bg-chart-4/10 text-chart-4',
      tech: 'bg-chart-8/10 text-chart-8',
      currency: 'bg-chart-2/10 text-chart-2',
      organization: 'bg-chart-1/10 text-chart-1',
      profession: 'bg-chart-5/10 text-chart-5',
      title: 'bg-chart-2/10 text-chart-2',
      custom: 'bg-muted text-foreground/80'
    };
    return colors[type];
  };

  // 添加新规则系统
  const addRuleSystem = (type: RuleSystemType) => {
    const newSystem: RuleSystem = {
      id: `rulesystem_${Date.now()}`,
      projectId,
      type,
      name: t('rule.newName', { type: getRuleTypeLabel(type) }),
      description: '',
      levels: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    setLocalRuleSystems([...localRuleSystems, newSystem]);
    setSelectedSystemId(newSystem.id);
    setHasChanges(true);
  };

  // 更新规则系统
  const updateSystem = (id: string, updates: Partial<RuleSystem>) => {
    setLocalRuleSystems(prev => prev.map(sys => 
      sys.id === id 
        ? { ...sys, ...updates, updatedAt: Date.now() }
        : sys
    ));
    setHasChanges(true);
  };

  // 删除规则系统
  const deleteSystem = async (id: string) => {
    if (await dialogService.confirm({ message: t('rule.deleteConfirm'), danger: true })) {
      setLocalRuleSystems(prev => prev.filter(sys => sys.id !== id));
      if (selectedSystemId === id) {
        setSelectedSystemId(null);
      }
      setHasChanges(true);
    }
  };

  // 添加等级
  const addLevel = (systemId: string) => {
    const system = localRuleSystems.find(s => s.id === systemId);
    if (!system) return;

    const newLevel: RuleLevel = {
      name: t('rule.defaultLevelName', { num: system.levels.length + 1 }),
      description: '',
      order: system.levels.length
    };
    updateSystem(systemId, {
      levels: [...system.levels, newLevel]
    });
  };

  // 更新等级
  const updateLevel = (systemId: string, index: number, updates: Partial<RuleLevel>) => {
    const system = localRuleSystems.find(s => s.id === systemId);
    if (!system) return;

    const newLevels = [...system.levels];
    const current = newLevels[index];
    if (!current) return;
    newLevels[index] = { ...current, ...updates };
    updateSystem(systemId, { levels: newLevels });
  };

  // 删除等级
  const removeLevel = (systemId: string, index: number) => {
    const system = localRuleSystems.find(s => s.id === systemId);
    if (!system) return;

    const newLevels = system.levels.filter((_, i) => i !== index);
    // 重新排序
    newLevels.forEach((level, i) => level.order = i);
    updateSystem(systemId, { levels: newLevels });
  };

  // 移动等级
  const moveLevel = (systemId: string, index: number, direction: 'up' | 'down') => {
    const system = localRuleSystems.find(s => s.id === systemId);
    if (!system) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= system.levels.length) return;

    const newLevels = [...system.levels];
    const moved = newLevels[index];
    const target = newLevels[newIndex];
    if (!moved || !target) return;
    [newLevels[index], newLevels[newIndex]] = [target, moved];
    // 重新排序
    newLevels.forEach((level, i) => level.order = i);
    updateSystem(systemId, { levels: newLevels });
  };

  // 切换角色关联
  const toggleCharacter = (systemId: string, characterId: string) => {
    const system = localRuleSystems.find(s => s.id === systemId);
    if (!system) return;

    const currentIds = system.appliedToCharacterIds || [];
    const newIds = currentIds.includes(characterId)
      ? currentIds.filter(id => id !== characterId)
      : [...currentIds, characterId];

    updateSystem(systemId, { appliedToCharacterIds: newIds });
  };

  // 保存所有更改
  const handleSave = () => {
    onSave(localRuleSystems);
    setHasChanges(false);
  };

  return (
    <div className="space-y-4">
      {/* 添加新规则系统 */}
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <h4 className="mb-3 text-sm font-medium">{t('rule.addTitle')}</h4>
        <div className="grid grid-cols-4 gap-2">
          {(['cultivation', 'magic', 'tech', 'currency', 'organization', 'profession', 'title', 'custom'] as RuleSystemType[]).map(type => {
            const TypeIcon = getRuleTypeIcon(type);
            return (
            <button
              key={type}
              onClick={() => addRuleSystem(type)}
              className={cn('rounded-lg border border-transparent p-3 text-center transition-colors hover:border-border', getRuleTypeColor(type))}
            >
              <TypeIcon className="mx-auto mb-1 block size-5" />
              <span className="text-xs font-medium">{getRuleTypeLabel(type)}</span>
            </button>
            );
          })}
        </div>
      </div>

      {/* 规则系统列表 */}
      {localRuleSystems.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          <Settings2 className="mx-auto mb-2 size-10 opacity-30" strokeWidth={1.5} />
          <p className="text-sm">{t('rule.empty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {localRuleSystems.map(system => (
            <div
              key={system.id}
              className={cn(
                'overflow-hidden rounded-lg border bg-card transition-colors',
                selectedSystemId === system.id ? 'border-primary/40' : 'border-border hover:border-muted-foreground/40'
              )}
            >
              {/* 系统头部 */}
              <div
                onClick={() => setSelectedSystemId(selectedSystemId === system.id ? null : system.id)}
                className="flex cursor-pointer items-center justify-between p-4"
              >
                <div className="flex items-center gap-3">
                  <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', getRuleTypeColor(system.type))}>
                    {(() => { const TypeIcon = getRuleTypeIcon(system.type); return <TypeIcon className="size-5" />; })()}
                  </div>
                  <div>
                    <h4 className="font-serif text-sm font-medium">{system.name}</h4>
                    <p className="text-xs text-muted-foreground">
                      {t('rule.levelsCount', { count: system.levels.length })}
                      {(system.appliedToCharacterIds?.length ?? 0) > 0 && ` · ${t('rule.charactersCount', { count: system.appliedToCharacterIds?.length ?? 0 })}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      void deleteSystem(system.id);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                  {selectedSystemId === system.id ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
                </div>
              </div>

              {/* 系统详情编辑 */}
              {selectedSystemId === system.id && (
                <div className="border-t border-border p-4">
                  {/* 基本信息 */}
                  <div className="mb-4 space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">{t('rule.nameLabel')}</Label>
                      <Input
                        type="text"
                        value={system.name}
                        onChange={(e) => updateSystem(system.id, { name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">{t('rule.descLabel')}</Label>
                      <Textarea
                        value={system.description}
                        onChange={(e) => updateSystem(system.id, { description: e.target.value })}
                        placeholder={t('rule.descPlaceholder')}
                        rows={2}
                      />
                    </div>
                  </div>

                  {/* 等级管理 */}
                  <div className="border-t border-border pt-3">
                    <div className="mb-3 flex items-center justify-between">
                      <h5 className="text-sm font-medium">{t('rule.levelsTitle')}</h5>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-primary hover:text-primary"
                        onClick={() => addLevel(system.id)}
                      >
                        <Plus className="size-4" /> {t('rule.addLevel')}
                      </Button>
                    </div>

                    {system.levels.length === 0 ? (
                      <p className="text-xs italic text-muted-foreground">{t('rule.noLevels')}</p>
                    ) : (
                      <div className="max-h-[300px] space-y-2 overflow-y-auto">
                        {system.levels.map((level, index) => (
                          <div key={index} className="rounded-lg border border-border bg-muted/30 p-3">
                            <div className="mb-2 flex items-center gap-2">
                              <span className="w-8 text-xs font-medium tabular-nums text-muted-foreground">#{index + 1}</span>
                              <Input
                                type="text"
                                value={level.name}
                                onChange={(e) => updateLevel(system.id, index, { name: e.target.value })}
                                placeholder={t('rule.levelNamePlaceholder')}
                                className="h-8 flex-1 text-sm"
                              />
                              <div className="flex items-center gap-0.5">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-muted-foreground"
                                  onClick={() => moveLevel(system.id, index, 'up')}
                                  disabled={index === 0}
                                >
                                  <ArrowUp className="size-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-muted-foreground"
                                  onClick={() => moveLevel(system.id, index, 'down')}
                                  disabled={index === system.levels.length - 1}
                                >
                                  <ArrowDown className="size-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-muted-foreground hover:text-destructive"
                                  onClick={() => removeLevel(system.id, index)}
                                >
                                  <X className="size-4" />
                                </Button>
                              </div>
                            </div>
                            <div className="ml-8 grid grid-cols-2 gap-2">
                              <Textarea
                                value={level.description}
                                onChange={(e) => updateLevel(system.id, index, { description: e.target.value })}
                                placeholder={t('rule.levelDescPlaceholder')}
                                rows={2}
                                className="text-xs"
                              />
                              <div className="space-y-1">
                                <Input
                                  type="text"
                                  value={level.requirements || ''}
                                  onChange={(e) => updateLevel(system.id, index, { requirements: e.target.value })}
                                  placeholder={t('rule.levelReqPlaceholder')}
                                  className="h-7 text-xs"
                                />
                                <Input
                                  type="text"
                                  value={level.abilities || ''}
                                  onChange={(e) => updateLevel(system.id, index, { abilities: e.target.value })}
                                  placeholder={t('rule.levelAbilitiesPlaceholder')}
                                  className="h-7 text-xs"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 角色关联 */}
                  <div className="mt-3 border-t border-border pt-3">
                    <h5 className="mb-2 text-sm font-medium">{t('rule.charactersTitle')}</h5>
                    {characters.length === 0 ? (
                      <p className="text-xs italic text-muted-foreground">{t('rule.noCharacters')}</p>
                    ) : (
                      <div className="grid max-h-32 grid-cols-3 gap-2 overflow-y-auto">
                        {characters.map(character => (
                          <label
                            key={character.id}
                            className={cn(
                              'flex cursor-pointer items-center gap-2 rounded-md border p-2 transition-colors',
                              system.appliedToCharacterIds?.includes(character.id)
                                ? 'border-primary/40 bg-primary/5'
                                : 'border-transparent bg-muted/30 hover:bg-muted'
                            )}
                          >
                            <Checkbox
                              checked={system.appliedToCharacterIds?.includes(character.id) || false}
                              onChange={() => toggleCharacter(system.id, character.id)}
                              className="size-3.5 accent-primary"
                            />
                            <span className="truncate text-xs">{character.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 保存按钮 */}
      {hasChanges && (
        <div className="flex justify-end border-t border-border pt-4">
          <Button onClick={handleSave}>
            <Save className="size-4" />
            {t('rule.save')}
          </Button>
        </div>
      )}
    </div>
  );
};

export default RuleSystemEditor;



