/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { Brain, Check, Download, Eye, IdCard, LineChart, ScrollText, Share2, Shield, UserRound } from 'lucide-react';
import React from 'react';

import { useTranslation } from '@/i18n';
import { dialogService } from '@/shared/services/dialogService';
import { Button } from '@/shared/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from '@/shared/ui/Dialog';
import { Input } from '@/shared/ui/Input';
import { Label } from '@/shared/ui/Label';
import { Select } from '@/shared/ui/Select';
import { Textarea } from '@/shared/ui/Textarea';
import { normalizeGenderId, normalizeRoleId } from '@/shared/utils/characterKinds';

import { type Character, type Project } from '../../../shared/types';
import { exportCharacterCard } from './characterCard';
import { BirthInfoEditor } from './components/BirthInfoEditor';
import { WorldRelationEditor } from './components/WorldRelationEditor';
import { generateName } from './services/nameGeneratorService';

interface CharacterModalProps {
  character: Character;
  project: Project;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (updates: Partial<Character>) => void;
}

/** 分区标题：图标 + 大写小标签，中性色。 */
function SectionTitle({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <h3 className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
      <Icon className="size-3.5" />
      {children}
    </h3>
  );
}

const CharacterModal: React.FC<CharacterModalProps> = ({ character, project, isOpen, onClose, onUpdate }) => {
  const { t } = useTranslation('characters');

  return (
    <Dialog open={isOpen} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="flex h-[92dvh] w-[94vw] max-w-5xl flex-col gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">{character.name || t('modal.nameLabel')}</DialogTitle>
        {/* 头部：姓名与基础属性 */}
        <div className="shrink-0 border-b border-border px-6 py-4">
          <div className="flex items-start gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <UserRound className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-3">
                <Label className="mb-1 text-xs text-muted-foreground">{t('modal.nameLabel')}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    className="font-serif text-base"
                    value={character.name}
                    onChange={(e) => onUpdate({ name: e.target.value })}
                    placeholder={t('modal.namePlaceholder')}
                  />
                  <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => onUpdate({ name: generateName(character.gender) })}>
                    {t('modal.randomName')}
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <Label className="mb-1 text-xs text-muted-foreground">{t('modal.roleLabel')}</Label>
                  <Select
                    value={character.role}
                    onChange={(e) => onUpdate({ role: normalizeRoleId(e.target.value) })}
                  >
                    {/* value 存枚举 id，仅展示文案走 i18n */}
                    <option value="protagonist">{t('modal.roleOptions.protagonist')}</option>
                    <option value="antagonist">{t('modal.roleOptions.antagonist')}</option>
                    <option value="supporting">{t('modal.roleOptions.supporting')}</option>
                    <option value="other">{t('modal.roleOptions.other')}</option>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1 text-xs text-muted-foreground">{t('modal.genderLabel')}</Label>
                  <Select
                    value={character.gender}
                    onChange={(e) => onUpdate({ gender: normalizeGenderId(e.target.value) })}
                  >
                    <option value="male">{t('modal.genderOptions.male')}</option>
                    <option value="female">{t('modal.genderOptions.female')}</option>
                    <option value="other">{t('modal.genderOptions.other')}</option>
                    <option value="unknown">{t('modal.genderOptions.unknown')}</option>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1 text-xs text-muted-foreground">{t('modal.ageLabel')}</Label>
                  <Input
                    value={character.age}
                    onChange={(e) => onUpdate({ age: e.target.value })}
                    placeholder={t('modal.agePlaceholder')}
                  />
                </div>
              </div>

              {/* Phase 3: 出生信息（可选） */}
              <BirthInfoEditor character={character} onUpdate={onUpdate} />
            </div>
          </div>
        </div>

        {/* 内容：双列分区 */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">

            {/* 左侧列：基本信息和外观 */}
            <div className="space-y-8">
              <section>
                <SectionTitle icon={IdCard}>{t('modal.basic.title')}</SectionTitle>
                <div className="space-y-3">
                  <div>
                    <Label className="mb-1 text-xs text-muted-foreground">{t('modal.basic.occupation')}</Label>
                    <Input
                      value={character.occupation || ''}
                      onChange={(e) => onUpdate({ occupation: e.target.value })}
                      placeholder={t('modal.basic.occupationPlaceholder')}
                    />
                  </div>
                  <div>
                    <Label className="mb-1 text-xs text-muted-foreground">{t('modal.basic.motivation')}</Label>
                    <Textarea
                      className="min-h-24 resize-none"
                      value={character.motivation || ''}
                      onChange={(e) => onUpdate({ motivation: e.target.value })}
                      placeholder={t('modal.basic.motivationPlaceholder')}
                    />
                  </div>
                </div>
              </section>

              <section>
                <SectionTitle icon={Eye}>{t('modal.appearance.title')}</SectionTitle>
                <div className="space-y-3">
                  <div>
                    <Label className="mb-1 text-xs text-muted-foreground">{t('modal.appearance.description')}</Label>
                    <Textarea
                      className="min-h-32 resize-none"
                      value={character.appearance || ''}
                      onChange={(e) => onUpdate({ appearance: e.target.value })}
                      placeholder={t('modal.appearance.descriptionPlaceholder')}
                    />
                  </div>
                  <div>
                    <Label className="mb-1 text-xs text-muted-foreground">{t('modal.appearance.features')}</Label>
                    <Textarea
                      className="min-h-20 resize-none"
                      value={character.distinctiveFeatures || ''}
                      onChange={(e) => onUpdate({ distinctiveFeatures: e.target.value })}
                      placeholder={t('modal.appearance.featuresPlaceholder')}
                    />
                  </div>
                </div>
              </section>

              <section>
                <SectionTitle icon={Brain}>{t('modal.personality.title')}</SectionTitle>
                <Textarea
                  className="min-h-40 resize-none"
                  value={character.personality || ''}
                  onChange={(e) => onUpdate({ personality: e.target.value })}
                  placeholder={t('modal.personality.placeholder')}
                />
              </section>
            </div>

            {/* 右侧列：背景和能力 */}
            <div className="space-y-8">
              <section>
                <SectionTitle icon={ScrollText}>{t('modal.background.title')}</SectionTitle>
                <Textarea
                  className="min-h-40 resize-none"
                  value={character.background || ''}
                  onChange={(e) => onUpdate({ background: e.target.value })}
                  placeholder={t('modal.background.placeholder')}
                />
              </section>

              <section>
                <SectionTitle icon={Shield}>{t('modal.abilities.title')}</SectionTitle>
                <div className="space-y-3">
                  <div>
                    <Label className="mb-1 text-xs text-muted-foreground">{t('modal.abilities.strengths')}</Label>
                    <Textarea
                      className="min-h-24 resize-none"
                      value={character.strengths || ''}
                      onChange={(e) => onUpdate({ strengths: e.target.value })}
                      placeholder={t('modal.abilities.strengthsPlaceholder')}
                    />
                  </div>
                  <div>
                    <Label className="mb-1 text-xs text-muted-foreground">{t('modal.abilities.weaknesses')}</Label>
                    <Textarea
                      className="min-h-24 resize-none"
                      value={character.weaknesses || ''}
                      onChange={(e) => onUpdate({ weaknesses: e.target.value })}
                      placeholder={t('modal.abilities.weaknessesPlaceholder')}
                    />
                  </div>
                </div>
              </section>

              <section>
                <SectionTitle icon={Share2}>{t('modal.relations.title')}</SectionTitle>
                <Textarea
                  className="min-h-32 resize-none"
                  value={character.relationships || ''}
                  onChange={(e) => onUpdate({ relationships: e.target.value })}
                  placeholder={t('modal.relations.placeholder')}
                />
              </section>

              <section>
                <SectionTitle icon={LineChart}>{t('modal.arc.title')}</SectionTitle>
                <Textarea
                  className="min-h-32 resize-none"
                  value={character.characterArc || ''}
                  onChange={(e) => onUpdate({ characterArc: e.target.value })}
                  placeholder={t('modal.arc.placeholder')}
                />
              </section>

              {/* 世界关联信息 */}
              <WorldRelationEditor
                character={character}
                project={project}
                onUpdate={onUpdate}
              />
            </div>
          </div>
        </div>

        {/* 底部 */}
        <DialogFooter className="shrink-0 border-t border-border px-6 py-4">
          <Button
            variant="outline"
            onClick={() => {
              void exportCharacterCard(character, project.title)
                .then((r) => {
                  if (!r.canceled) dialogService.alert(t('card.exportSaved', { path: r.path ?? '' }));
                })
                .catch(() => dialogService.alert(t('card.exportFailed')));
            }}
          >
            <Download className="size-4" />
            {t('card.export')}
          </Button>
          <Button onClick={onClose}>
            <Check className="size-4" />
            {t('modal.saveAndClose')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CharacterModal;
