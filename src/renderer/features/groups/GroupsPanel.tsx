/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 分组/卷面板：自由命名分组，章节按分组归属；不预设「卷」语义，卷/幕/单元均可。 */
import { Plus, Trash2 } from 'lucide-react';
import React, { useState } from 'react';

import { selectActiveProject, useProjectStore } from '@/app/stores/projectStore';
import { useTranslation } from '@/i18n';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { Select } from '@/shared/ui/Select';

import { addGroup, assignChapters, removeGroup, renameGroup, splitByGroup } from './groupsService';

const GroupsPanel: React.FC = () => {
  const { t } = useTranslation('steps');
  const project = useProjectStore(selectActiveProject);
  const updateActiveProject = useProjectStore((state) => state.updateActiveProject);
  const [label, setLabel] = useState('');

  if (!project) return null;
  const groups = project.groups ?? [];
  const chapters = project.chapters ?? [];
  const sections = splitByGroup(groups, chapters);

  const add = () => {
    const name = label.trim();
    if (!name) return;
    updateActiveProject({ groups: addGroup(groups, name, `group:${crypto.randomUUID()}`) });
    setLabel('');
  };

  const remove = (id: string) => {
    updateActiveProject({
      groups: removeGroup(groups, id),
      chapters: assignChapters(chapters, undefined, chapters.filter((chapter) => chapter.groupId === id).map((chapter) => chapter.id)),
    });
  };

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="text-xs text-muted-foreground">{t('groups.subtitle')}</p>
        <div className="flex items-center gap-2">
          <Input value={label} onChange={(event) => setLabel(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') add(); }} placeholder={t('groups.addPlaceholder')} className="h-8 max-w-64 text-xs" />
          <Button size="sm" variant="outline" disabled={!label.trim()} onClick={add}><Plus className="size-3.5" />{t('groups.add')}</Button>
        </div>

        {sections.map(({ group, chapters: members }) => (
          <div key={group?.id ?? 'ungrouped'} className="rounded-lg border border-border bg-card p-3">
            <div className="mb-2 flex items-center gap-2">
              {group ? (
                <>
                  <Input
                    value={group.label}
                    onChange={(event) => updateActiveProject({ groups: renameGroup(groups, group.id, event.target.value) })}
                    className="h-7 max-w-48 text-xs font-medium"
                  />
                  <span className="text-2xs text-muted-foreground">{t('groups.count', { count: members.length })}</span>
                  <Button size="icon" variant="ghost" className="ml-auto size-7 text-muted-foreground hover:text-destructive" aria-label={t('groups.remove')} onClick={() => remove(group.id)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-xs font-medium text-muted-foreground">{t('groups.ungrouped')}</span>
                  <span className="text-2xs text-muted-foreground">{t('groups.count', { count: members.length })}</span>
                </>
              )}
            </div>
            {members.length === 0 ? (
              <p className="text-2xs italic text-muted-foreground">{t('groups.empty')}</p>
            ) : (
              <ul className="space-y-1">
                {members.map((chapter) => (
                  <li key={chapter.id} className="flex items-center gap-2 text-xs">
                    <span className="min-w-0 flex-1 truncate">{chapter.title}</span>
                    <Select
                      value={chapter.groupId ?? ''}
                      onChange={(event) => updateActiveProject({ chapters: assignChapters(chapters, event.target.value || undefined, [chapter.id]) })}
                      className="h-6 w-32 text-2xs"
                    >
                      <option value="">{t('groups.ungrouped')}</option>
                      {groups.map((entry) => (
                        <option key={entry.id} value={entry.id}>{entry.label}</option>
                      ))}
                    </Select>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default GroupsPanel;
