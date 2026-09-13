/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 统计页：码字日历与目标、角色年龄数值表、线索图。 */
import React, { useEffect, useMemo, useState } from 'react';

import { selectActiveProject, useProjectStore } from '@/app/stores/projectStore';
import { useTranslation } from '@/i18n';
import { type DailyWords,loadDailyWords, recentDays } from '@/shared/services/writingLogService';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/Card';

import { buildClues } from './clueService';
import { buildAgeTable } from './storyMathService';

const CALENDAR_DAYS = 91;

const CLUE_STATUS_KEYS = { planted: 'stats.clueStatus.planted', 'paid-off': 'stats.clueStatus.paidOff', abandoned: 'stats.clueStatus.abandoned' } as const;

const StatsPanel: React.FC = () => {
  const { t } = useTranslation('steps');
  const project = useProjectStore(selectActiveProject);
  const [daily, setDaily] = useState<DailyWords[]>([]);

  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    void loadDailyWords(project.id).then((entries) => {
      if (!cancelled) setDaily(entries);
    });
    return () => {
      cancelled = true;
    };
  }, [project]);

  const calendar = useMemo(() => recentDays(daily, CALENDAR_DAYS), [daily]);
  const maxWords = useMemo(() => calendar.reduce((max, entry) => Math.max(max, entry.words), 0), [calendar]);
  const todayWords = calendar[calendar.length - 1]?.words ?? 0;
  const ageTable = useMemo(() => (project ? buildAgeTable(project) : { events: [], rows: [] }), [project]);
  const clues = useMemo(() => (project ? buildClues(project) : []), [project]);
  const chapterCount = project?.chapters.length ?? 0;

  if (!project) return null;

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mx-auto max-w-4xl space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">{t('stats.calendarTitle')}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {t('stats.today', { today: todayWords, target: project.wordTarget ?? 0 })}
            </p>
            <div className="grid grid-flow-col grid-rows-7 gap-1" style={{ gridAutoColumns: '12px' }}>
              {calendar.map((entry) => {
                const intensity = maxWords > 0 ? entry.words / maxWords : 0;
                return (
                  <span
                    key={entry.date}
                    title={`${entry.date}: ${entry.words}`}
                    className="size-3 rounded-sm border border-border"
                    style={{ backgroundColor: entry.words === 0 ? 'transparent' : `rgba(59,130,246,${0.2 + intensity * 0.8})` }}
                  />
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">{t('stats.ageTitle')}</CardTitle></CardHeader>
          <CardContent className="overflow-auto">
            {ageTable.events.length === 0 || ageTable.rows.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('stats.ageEmpty')}</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-3">{t('stats.character')}</th>
                    <th className="py-1 pr-3">{t('stats.birthYear')}</th>
                    {ageTable.events.map((event) => (
                      <th key={event.id} className="py-1 pr-3">{event.title}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ageTable.rows.map((row) => (
                    <tr key={row.characterId} className="border-t border-border">
                      <td className="py-1 pr-3">{row.name}</td>
                      <td className="py-1 pr-3 text-muted-foreground">{row.birthYear ?? '—'}</td>
                      {row.ages.map((age) => (
                        <td key={age.eventId} className="py-1 pr-3">{age.age ?? '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">{t('stats.clueTitle')}</CardTitle></CardHeader>
          <CardContent>
            {clues.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('stats.clueEmpty')}</p>
            ) : (
              <>
                <svg viewBox={`0 0 ${Math.max(chapterCount, 1) * 20 + 40} 120`} className="h-32 w-full">
                  <line x1={20} y1={100} x2={20 + Math.max(chapterCount - 1, 0) * 20} y2={100} stroke="var(--color-border)" strokeWidth={1} />
                  {Array.from({ length: Math.max(chapterCount, 1) }, (_, index) => (
                    <circle key={index} cx={20 + index * 20} cy={100} r={2} fill="var(--color-muted-foreground)" />
                  ))}
                  {clues.map((clue, index) => {
                    if (clue.plantedIndex === null || clue.payoffIndex === null) return null;
                    const x1 = 20 + clue.plantedIndex * 20;
                    const x2 = 20 + clue.payoffIndex * 20;
                    const midY = 100 - (20 + (index % 3) * 20);
                    return (
                      <path key={clue.id} d={`M${x1},100 Q${(x1 + x2) / 2},${midY} ${x2},100`} fill="none" stroke={clue.status === 'paid-off' ? 'var(--color-chart-3)' : 'var(--color-chart-1)'} strokeWidth={1.5}>
                        <title>{clue.title}</title>
                      </path>
                    );
                  })}
                </svg>
                <ul className="mt-2 space-y-1 text-xs">
                  {clues.map((clue) => (
                    <li key={clue.id} className="flex items-center gap-2">
                      <span className="font-medium">{clue.title}</span>
                      <span className="text-muted-foreground">{t(CLUE_STATUS_KEYS[clue.status])}</span>
                      <span className="text-muted-foreground">{clue.span === null ? t('stats.clueUnset') : t('stats.clueSpan', { span: clue.span })}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StatsPanel;
