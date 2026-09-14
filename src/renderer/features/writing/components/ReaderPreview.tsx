/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 多平台预览：用编译产出的 HTML 在桌面/平板/手机宽度下渲染当前章节。 */
import type { Chapter, Project } from '@shared/types';
import React, { useMemo, useState } from 'react';

import { useTranslation } from '@/i18n';
import { SegmentedControl } from '@/shared/ui/ViewModeToggle';

import { buildExportContent } from '../utils';

type PreviewDevice = 'desktop' | 'tablet' | 'phone';

const WIDTHS: Record<PreviewDevice, number> = { desktop: 720, tablet: 520, phone: 360 };

interface ReaderPreviewProps {
  project: Project;
  chapter: Chapter | null;
}

const ReaderPreview: React.FC<ReaderPreviewProps> = ({ project, chapter }) => {
  const { t } = useTranslation('writing');
  const [device, setDevice] = useState<PreviewDevice>('desktop');
  const html = useMemo(
    () => (chapter ? buildExportContent(project, new Set([chapter.id]), 'html') : ''),
    [project, chapter],
  );

  return (
    <div className="space-y-3">
      <SegmentedControl<PreviewDevice>
        value={device}
        onChange={setDevice}
        options={[
          { value: 'desktop', label: t('tools.preview.desktop') },
          { value: 'tablet', label: t('tools.preview.tablet') },
          { value: 'phone', label: t('tools.preview.phone') },
        ]}
      />
      {chapter ? (
        <iframe
          title={t('tools.preview.title')}
          srcDoc={html}
          sandbox=""
          className="mx-auto rounded-lg border border-border bg-card"
          style={{ width: WIDTHS[device], maxWidth: '100%', height: 360 }}
        />
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('tools.preview.empty')}</p>
      )}
    </div>
  );
};

export default ReaderPreview;
