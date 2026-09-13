/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 读者预览视图：按设备宽度以正文排版渲染条目。 */
import React from 'react';

import { useTranslation } from '@/i18n';
import { SegmentedControl } from '@/shared/ui/ViewModeToggle';

import type { ViewRow } from './types';

type ReaderDevice = 'desktop' | 'tablet' | 'phone';

const WIDTHS: Record<ReaderDevice, number> = { desktop: 680, tablet: 520, phone: 360 };

interface ViewReaderProps {
  rows: ViewRow[];
  device: ReaderDevice;
  emptyText: string;
  onDeviceChange: (device: ReaderDevice) => void;
}

const ViewReader: React.FC<ViewReaderProps> = ({ rows, device, emptyText, onDeviceChange }) => {
  const { t } = useTranslation('world');

  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div className="space-y-3">
      <SegmentedControl<ReaderDevice>
        value={device}
        onChange={onDeviceChange}
        options={[
          { value: 'desktop', label: t('views.reader.desktop') },
          { value: 'tablet', label: t('views.reader.tablet') },
          { value: 'phone', label: t('views.reader.phone') },
        ]}
      />
      <div className="max-h-[440px] overflow-y-auto rounded-lg border border-border bg-white p-4">
        <div className="mx-auto space-y-6" style={{ maxWidth: WIDTHS[device] }}>
          {rows.map((row) => (
            <article key={row.id} className="space-y-1">
              <h3 className="font-serif text-lg font-medium text-neutral-900">{row.title}</h3>
              {row.cells.summary && <p className="text-sm text-neutral-500">{row.cells.summary}</p>}
              {row.cells.detail && <p className="font-serif text-sm leading-relaxed text-neutral-800">{row.cells.detail}</p>}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ViewReader;
