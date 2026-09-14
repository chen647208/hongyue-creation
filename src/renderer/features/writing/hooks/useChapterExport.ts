/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 章节导出编排（从 WritingEditor 抽出）：选择章节/格式/编译档案/覆盖项并执行落盘。
 * 编译覆盖项叠加在所选档案之上，预览与落盘共用同一生效档案（所见即导出）。
 */
import { type BuildProfile, clampHeadingLevel, COMPILE_DEFAULTS, validateProfile } from '@core/build';
import type { TFunction } from 'i18next';
import { useMemo, useState } from 'react';

import {
  buildProfileRegistry,
  deleteUserProfile,
  listUserProfiles,
  saveUserProfile,
} from '@/shared/services/buildProfiles';
import { dialogService } from '@/shared/services/dialogService';

import type { Project } from '../../../../shared/types';
import type { ExportCompileOptions,ExportFormat } from '../types';
import {
  applyExportCompileOptions,
  buildExportContent,
  buildExportFilename,
  buildExportPackage,
  buildQuickExportProfile,
  saveExportFile,
  savePackageFile,
} from '../utils';

interface UseChapterExportOptions {
  project: Project;
  t: TFunction<['writing', 'steps']>;
}

/** 从档案读取对话框覆盖项；缺省档案按快速导出默认。 */
function optionsFromProfile(profile: BuildProfile | undefined): ExportCompileOptions {
  return {
    materialPolicy: profile?.selection.materialPolicy ?? 'exclude',
    tocEnabled: profile?.compile?.toc?.enabled ?? false,
    tocDepth: profile?.compile?.toc?.maxDepth ?? COMPILE_DEFAULTS.tocMaxDepth,
    headingLevel: clampHeadingLevel(profile?.transform.headings.level),
    rangeFrom: profile?.selection.range?.from ?? null,
    rangeTo: profile?.selection.range?.to ?? null,
    volumeIds: profile?.compile?.volumeIds ?? [],
    frontMatterIds: profile?.compile?.frontMatter ?? [],
    backMatterIds: profile?.compile?.backMatter ?? [],
  };
}

export function useChapterExport({ project, t }: UseChapterExportOptions) {
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<ExportFormat>('txt');
  const [profileId, setProfileIdState] = useState('');
  const [compile, setCompile] = useState<ExportCompileOptions>(() => optionsFromProfile(undefined));
  const [userProfiles, setUserProfiles] = useState<BuildProfile[]>(() => listUserProfiles());
  const [error, setError] = useState<string | null>(null);

  const baseProfile = useMemo(
    () => (profileId ? buildProfileRegistry.get(profileId) : undefined) ?? buildQuickExportProfile(format),
    [profileId, format],
  );
  // 生效档案：预设缺省 + 对话框覆盖项；预览与落盘共用，保证同源。
  const effectiveProfile = useMemo(() => applyExportCompileOptions(baseProfile, compile), [baseProfile, compile]);

  const openModal = () => {
    setSelectedIds(new Set(project.chapters.map((c) => c.id)));
    setError(null);
    setOpen(true);
  };

  const toggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const toggleAll = () => {
    if (selectedIds.size === project.chapters.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(project.chapters.map((c) => c.id)));
  };

  /** 切换导出档案：同步该档案的编译覆盖项，清空上一次错误。 */
  const setProfileId = (id: string) => {
    setProfileIdState(id);
    setError(null);
    setCompile(optionsFromProfile(id ? buildProfileRegistry.get(id) : undefined));
  };

  const patchCompile = (patch: Partial<ExportCompileOptions>) => {
    setError(null);
    setCompile((prev) => ({ ...prev, ...patch }));
  };

  /** 保存当前设置为命名档案，写入本机并在后续导出中可复用。 */
  const saveProfileAs = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      const message = t('export.profileNameRequired');
      setError(message);
      dialogService.alert(message);
      return;
    }
    const profile: BuildProfile = { ...effectiveProfile, id: `user.${Date.now()}`, name: trimmed };
    const errors = validateProfile(profile);
    if (errors.length > 0) {
      const message = t('export.configError', { errors: errors.join('；') });
      setError(message);
      dialogService.alert(message);
      return;
    }
    saveUserProfile(profile);
    setUserProfiles(listUserProfiles());
    setProfileIdState(profile.id ?? trimmed);
    setError(null);
  };

  const removeProfile = (id: string) => {
    deleteUserProfile(id);
    setUserProfiles(listUserProfiles());
    if (profileId === id) setProfileId('');
  };

  const execute = async () => {
    if (selectedIds.size === 0) {
      dialogService.alert(t('editor.selectAtLeastOne'));
      return;
    }
    const errors = validateProfile(effectiveProfile);
    if (errors.length > 0) {
      const message = t('export.configError', { errors: errors.join('；') });
      setError(message);
      dialogService.alert(message);
      return;
    }
    setError(null);
    const filename = buildExportFilename(project.title, format);
    try {
      if (format === 'epub' || format === 'docx' || format === 'odt') {
        const files = buildExportPackage(project, selectedIds, format, effectiveProfile);
        const fallbackHtml = buildExportContent(project, selectedIds, 'html', effectiveProfile);
        await savePackageFile(filename, files, format, fallbackHtml);
      } else {
        const fileContent = buildExportContent(project, selectedIds, format, effectiveProfile);
        await saveExportFile(filename, fileContent, format);
      }
      setOpen(false);
    } catch (err) {
      const message = t('editor.exportFailed', { error: err instanceof Error ? err.message : t('editor.unknownError') });
      setError(message);
      dialogService.alert(message);
    }
  };

  return {
    open,
    setOpen,
    selectedIds,
    format,
    setFormat,
    profileId,
    userProfiles,
    compile,
    error,
    effectiveProfile,
    openModal,
    toggle,
    toggleAll,
    setProfileId,
    patchCompile,
    saveProfileAs,
    removeProfile,
    execute,
  };
}
