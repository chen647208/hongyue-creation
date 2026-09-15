/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 已存文档附件（design/17：attachments/blobs）：列出本书附件，点选重新加入待发送参考。 */
import { FileText, Paperclip, Trash2 } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import { useTranslation } from '@/i18n';
import { attachmentsSupported, attachmentToText, type DocumentAttachment, listAttachments, removeAttachment } from '@/shared/services/documentAttachmentService';
import { Button } from '@/shared/ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/DropdownMenu';
import { logger } from '@/shared/utils/logger';

import type { KnowledgeItem } from '../../../../shared/types';

interface SavedAttachmentsButtonProps {
  bookId: string | null;
  onAttach: (item: KnowledgeItem) => void;
  /** 保存新附件后递增，触发列表刷新。 */
  refreshKey?: number;
}

const SavedAttachmentsButton: React.FC<SavedAttachmentsButtonProps> = ({ bookId, onAttach, refreshKey = 0 }) => {
  const { t } = useTranslation('assistant');
  const [items, setItems] = useState<DocumentAttachment[]>([]);
  const supported = attachmentsSupported();

  const reload = useCallback(() => {
    if (!bookId || !supported) {
      setItems([]);
      return;
    }
    void listAttachments(bookId).then(setItems).catch(() => setItems([]));
  }, [bookId, supported]);

  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  if (!supported || !bookId) return null;

  const handleAttach = async (meta: DocumentAttachment): Promise<void> => {
    try {
      const doc = await attachmentToText(meta);
      if (!doc) return;
      onAttach({
        id: `att-${meta.id}`,
        name: meta.name,
        content: doc.content,
        type: 'file',
        size: meta.size,
        addedAt: Date.now(),
        category: 'writing',
      });
    } catch (error) {
      logger.error('读取文档附件失败:', error);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" title={t('attachments.open')} aria-label={t('attachments.open')}>
          <Paperclip className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>{t('attachments.title')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="px-2 py-3 text-xs text-muted-foreground">{t('attachments.empty')}</div>
        ) : (
          items.map((meta) => (
            <DropdownMenuItem
              key={meta.id}
              className="gap-2"
              onSelect={(event) => {
                event.preventDefault();
                void handleAttach(meta);
              }}
            >
              <FileText className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{meta.name}</span>
              <button
                type="button"
                className="touch-target shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive"
                aria-label={t('attachments.remove')}
                onClick={(event) => {
                  event.stopPropagation();
                  void removeAttachment(meta.id).then(reload);
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default SavedAttachmentsButton;
