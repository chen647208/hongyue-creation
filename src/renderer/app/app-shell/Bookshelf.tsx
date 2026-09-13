/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import {
  BookHeart,
  BookOpen,
  BookUp,
  CheckSquare,
  Copy,
  Download,
  FolderOpen,
  Image as ImageIcon,
  LayoutGrid,
  List,
  ListOrdered,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Square,
  Tag,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { type BookTemplate } from '@/app/bookFactory';
import { useFeatureEnabled } from '@/app/useFeatureToggles';
import { collectAllTags, filterBooksByTags, normalizeTagInput } from '@/features/books/bookTags';
import NewBookModal from '@/features/books/NewBookModal';
import { useTranslation } from '@/i18n';
import { useViewPreference } from '@/shared/hooks/useViewPreference';
import { dialogService } from '@/shared/services/dialogService';
import { listTrash, type TrashEntry } from '@/shared/services/trashService';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/DropdownMenu';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Input } from '@/shared/ui/Input';
import { PageIntro } from '@/shared/ui/PageHeader';
import { ViewModeToggle } from '@/shared/ui/ViewModeToggle';
import { logger } from '@/shared/utils/logger';

import type { Project } from '../../../shared/types';

interface BookshelfProps {
  books: Project[];
  activeBookId: string | null;
  onOpenBook: (bookId: string) => void;
  onCreateBook: (title: string, description?: string, templateType?: BookTemplate, sourceBookId?: string) => void;
  /** 先建后改：一键建空白书直接进工作区（默认路径，不开模态）。 */
  onCreateQuickBook: () => void;
  onRenameBook: (bookId: string, newTitle: string) => void;
  onTagBook: (bookId: string, tags: string[]) => void;
  onDeleteBook: (bookId: string) => void;
  /** 批量删除：一次确认，逐本进回收站。 */
  onDeleteBooks: (bookIds: string[]) => void;
  onDuplicateBook: (bookId: string) => void;
  onExportBook: (book: Project) => void;
  /** 导出封面图（PNG，失败退回 SVG）。 */
  onExportCover: (book: Project) => void;
  onImportBook: () => void;
  onImportAll: () => Promise<void>;
  onRestoreTrash: (bookId: string) => Promise<void>;
  onPurgeTrash: (bookId: string) => Promise<void>;
  /** 打开跨书全文检索弹窗。 */
  onOpenSearch: () => void;
}

/** 统计全书正文字数（CJK 按字符计）。 */
function wordCount(book: Project): number {
  return book.chapters.reduce((sum, c) => sum + (c.content?.length ?? 0), 0);
}

/** 依据界面语言格式化"最后编辑"时间。 */
function formatLastEdited(ts: number, locale: string): string {
  const d = new Date(ts);
  const now = new Date();
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === now.getFullYear()
      ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { year: 'numeric', month: 'short', day: 'numeric' };
  try {
    return new Intl.DateTimeFormat(locale, opts).format(d);
  } catch {
    return d.toLocaleString();
  }
}

const Bookshelf: React.FC<BookshelfProps> = ({
  books,
  activeBookId,
  onOpenBook,
  onCreateBook,
  onCreateQuickBook,
  onRenameBook,
  onTagBook,
  onDeleteBook,
  onDeleteBooks,
  onDuplicateBook,
  onExportBook,
  onExportCover,
  onImportBook,
  onImportAll,
  onRestoreTrash,
  onPurgeTrash,
  onOpenSearch,
}) => {
  const { t, i18n } = useTranslation(['app', 'books', 'common']);
  const searchEnabled = useFeatureEnabled('panel.globalSearch');
  const [query, setQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isNewBookOpen, setIsNewBookOpen] = useState(false);
  const [view, setView] = useViewPreference<'grid' | 'list'>('bookshelf.view', 'grid');
  const [trash, setTrash] = useState<TrashEntry[]>([]);
  const [trashOpen, setTrashOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const reloadTrash = useCallback(() => {
    void listTrash().then(setTrash).catch(() => setTrash([]));
  }, []);
  // 书籍增删与挂载时刷新回收站
  useEffect(() => {
    reloadTrash();
  }, [books.length, reloadTrash]);

  const allTags = useMemo(() => collectAllTags(books), [books]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...books].sort((a, b) => b.lastModified - a.lastModified);
    // 全文搜索：标题 + 简介/灵感 + 章节标题，再按标签过滤
    const matched = !q ? sorted : sorted.filter((b) =>
      b.title.toLowerCase().includes(q) ||
      (b.intro || '').toLowerCase().includes(q) ||
      (b.inspiration || '').toLowerCase().includes(q) ||
      (b.chapters || []).some((c) => (c.title || '').toLowerCase().includes(q)),
    );
    return filterBooksByTags(matched, selectedTags);
  }, [books, query, selectedTags]);

  const [visibleCount, setVisibleCount] = useState(60);
  useEffect(() => {
    setVisibleCount(60);
  }, [query, selectedTags]);
  const visibleBooks = filtered.slice(0, visibleCount);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]));
  }, []);

  const handleRename = async (book: Project) => {
    const newTitle = await dialogService.prompt({
      title: t('app:bookshelf.renameTitle'),
      message: t('app:bookshelf.renameMessage'),
      defaultValue: book.title,
    });
    if (newTitle && newTitle.trim() && newTitle.trim() !== book.title) {
      onRenameBook(book.id, newTitle.trim());
    }
  };

  const handleTag = async (book: Project) => {
    const input = await dialogService.prompt({
      title: t('app:bookshelf.tagTitle'),
      message: t('app:bookshelf.tagMessage'),
      defaultValue: (book.tags ?? []).join('，'),
    });
    if (input === null) return;
    onTagBook(book.id, normalizeTagInput(input));
  };

  const exitSelect = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((bookId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(bookId)) next.delete(bookId);
      else next.add(bookId);
      return next;
    });
  }, []);

  const handleBulkTag = async () => {
    const input = await dialogService.prompt({
      title: t('app:bookshelf.tagTitle'),
      message: t('app:bookshelf.batchTagMessage'),
      defaultValue: '',
    });
    if (input === null) return;
    const tags = normalizeTagInput(input);
    if (tags.length === 0) return;
    for (const id of selectedIds) {
      const book = books.find((b) => b.id === id);
      if (!book) continue;
      onTagBook(id, Array.from(new Set([...(book.tags ?? []), ...tags])));
    }
    exitSelect();
  };

  const handleBulkDelete = () => {
    onDeleteBooks(Array.from(selectedIds));
    exitSelect();
  };

  const handleImportAll = async () => {
    try {
      await onImportAll();
    } catch (error) {
      logger.error('导入全部数据失败:', error);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-6xl px-8 py-10">
        <PageIntro
          className="mb-6"
          title={<span className="font-serif">{t('app:bookshelf.title')}</span>}
          description={t('app:bookshelf.subtitle')}
          actions={
            <>
              {searchEnabled && (
                <Button variant="outline" size="sm" onClick={onOpenSearch}>
                  <Search className="size-4" />
                  {t('app:search.open')}
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Upload className="size-4" />
                    {t('app:bookshelf.import')}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={onImportBook}>
                    <BookUp className="size-4" />
                    {t('app:bookshelf.importBook')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={handleImportAll}>
                    <Upload className="size-4" />
                    {t('app:bookshelf.importAll')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button size="sm" onClick={() => setIsNewBookOpen(true)}>
                <Plus className="size-4" />
                {t('app:bookshelf.newBook')}
              </Button>
            </>
          }
        />

        {books.length > 0 && (
          <div className="relative mb-6 flex max-w-md items-center gap-2">
            <div className="relative max-w-xs flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={t('app:bookshelf.search')}
                className="pl-8"
              />
            </div>
            <ViewModeToggle
              value={view}
              onChange={setView}
              options={[
                { value: 'grid', icon: LayoutGrid, title: t('books:view.grid') },
                { value: 'list', icon: List, title: t('books:view.list') },
              ]}
            />
            <Button
              variant={selectMode ? 'default' : 'outline'}
              size="sm"
              aria-pressed={selectMode}
              onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
            >
              <CheckSquare className="size-4" />
              {selectMode ? t('app:bookshelf.batchExit') : t('app:bookshelf.batchSelect')}
            </Button>
          </div>
        )}

        {allTags.length > 0 && (
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <Tag className="size-3.5 text-muted-foreground" />
            <button
              type="button"
              onClick={() => setSelectedTags([])}
              className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${selectedTags.length === 0 ? 'border-primary bg-accent text-foreground' : 'border-input text-muted-foreground hover:bg-accent/60'}`}
            >
              {t('app:bookshelf.tagAll')}
            </button>
            {allTags.map((tag) => {
              const active = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  aria-pressed={active}
                  className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${active ? 'border-primary bg-accent text-foreground' : 'border-input text-muted-foreground hover:bg-accent/60'}`}
                >
                  {tag}
                </button>
              );
            })}
            {selectedTags.length > 0 && (
              <button
                type="button"
                onClick={() => { setSelectedTags([]); setQuery(''); }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {t('app:bookshelf.clearFilter')}
              </button>
            )}
          </div>
        )}

        {books.length === 0 ? (
          <EmptyState
            className="mt-24"
            icon={BookHeart}
            title={t('app:bookshelf.empty.title')}
            description={t('app:bookshelf.empty.desc')}
            action={
              <>
                <Button onClick={onCreateQuickBook}>
                  <Plus className="size-4" />
                  {t('app:bookshelf.newBook')}
                </Button>
                <Button variant="outline" onClick={onImportBook}>
                  <BookUp className="size-4" />
                  {t('app:bookshelf.importBook')}
                </Button>
              </>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title={t('app:bookshelf.noResults')}
            action={
              <Button variant="outline" onClick={() => setQuery('')}>
                {t('app:bookshelf.clearSearch')}
              </Button>
            }
          />
        ) : view === 'list' ? (
          <div className="overflow-hidden rounded-lg border border-border">
            {visibleBooks.map((book, idx) => (
              <div
                key={book.id}
                role="button"
                tabIndex={0}
                onClick={() => (selectMode ? toggleSelect(book.id) : onOpenBook(book.id))}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (selectMode) toggleSelect(book.id);
                    else onOpenBook(book.id);
                  }
                }}
                className={`group flex cursor-pointer items-center gap-4 px-4 py-3 transition-colors hover:bg-accent/40 ${idx > 0 ? 'border-t border-border' : ''} ${selectedIds.has(book.id) ? 'bg-accent/60' : ''}`}
              >
                {selectMode && (
                  <span className="shrink-0 text-primary" aria-hidden="true">
                    {selectedIds.has(book.id) ? <CheckSquare className="size-4" /> : <Square className="size-4 text-muted-foreground" />}
                  </span>
                )}
                <h3 className="w-48 shrink-0 truncate font-serif text-base font-medium text-foreground">
                  {book.title}
                </h3>
                <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                  {book.intro || book.inspiration || t('app:bookshelf.noContent')}
                </p>
                <span className="hidden shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground sm:flex" title={t('app:bookshelf.words')}>
                  <BookOpen className="size-3.5" />
                  {wordCount(book).toLocaleString(i18n.language)}
                </span>
                <span className="hidden shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground md:flex" title={t('app:bookshelf.chapters')}>
                  <ListOrdered className="size-3.5" />
                  {book.chapters.length}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatLastEdited(book.lastModified, i18n.language)}</span>
                {book.id === activeBookId && (
                  <Badge variant="secondary" className="shrink-0">
                    {t('app:bookshelf.current')}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleBooks.map(book => (
              <Card
                key={book.id}
                role="button"
                tabIndex={0}
                onClick={() => (selectMode ? toggleSelect(book.id) : onOpenBook(book.id))}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (selectMode) toggleSelect(book.id);
                    else onOpenBook(book.id);
                  }
                }}
                className={`group flex cursor-pointer flex-col gap-3 p-5 transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedIds.has(book.id) ? 'border-primary ring-1 ring-primary' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {selectMode && (
                      <span className="shrink-0 text-primary" aria-hidden="true">
                        {selectedIds.has(book.id) ? <CheckSquare className="size-4" /> : <Square className="size-4 text-muted-foreground" />}
                      </span>
                    )}
                    <h3 className="line-clamp-1 font-serif text-lg font-medium text-foreground">
                      {book.title}
                    </h3>
                  </div>
                  {book.id === activeBookId && (
                    <Badge variant="secondary" className="shrink-0">
                      {t('app:bookshelf.current')}
                    </Badge>
                  )}
                </div>

                <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
                  {book.intro || book.inspiration || t('app:bookshelf.noContent')}
                </p>

                {(book.tags ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {(book.tags ?? []).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-2xs font-normal">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="mt-auto flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1" title={t('app:bookshelf.words')}>
                      <BookOpen className="size-3.5" />
                      {wordCount(book).toLocaleString(i18n.language)}
                    </span>
                    <span className="flex items-center gap-1" title={t('app:bookshelf.chapters')}>
                      <ListOrdered className="size-3.5" />
                      {book.chapters.length}
                    </span>
                    <span className="flex items-center gap-1" title={t('app:bookshelf.characters')}>
                      <Users className="size-3.5" />
                      {book.characters.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="tabular-nums">{formatLastEdited(book.lastModified, i18n.language)}</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                           className="size-6 opacity-100 transition-opacity focus-visible:opacity-100 data-[state=open]:opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100"
                          onClick={e => e.stopPropagation()}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                        <DropdownMenuItem onSelect={() => onOpenBook(book.id)}>
                          <FolderOpen className="size-4" />
                          {t('app:bookshelf.open')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleRename(book)}>
                          <Pencil className="size-4" />
                          {t('common:rename')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleTag(book)}>
                          <Tag className="size-4" />
                          {t('app:bookshelf.tagBook')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onDuplicateBook(book.id)}>
                          <Copy className="size-4" />
                          {t('app:bookshelf.duplicate')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onExportBook(book)}>
                          <Download className="size-4" />
                          {t('common:export')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onExportCover(book)}>
                          <ImageIcon className="size-4" />
                          {t('app:cover.action')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => onDeleteBook(book.id)}>
                          <Trash2 className="size-4" />
                          {t('common:delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {filtered.length > visibleCount && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={() => setVisibleCount((count) => count + 60)}>
            {t('app:bookshelf.loadMore')}
          </Button>
        </div>
      )}

      {selectMode && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 shadow-lg">
            <span className="px-1 text-sm tabular-nums text-foreground">
              {t('app:bookshelf.batchSelected', { count: selectedIds.size })}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set(filtered.map((b) => b.id)))}>
              {t('app:bookshelf.selectAll')}
            </Button>
            <Button variant="ghost" size="sm" disabled={selectedIds.size === 0} onClick={() => setSelectedIds(new Set())}>
              {t('app:bookshelf.clearSelection')}
            </Button>
            <Button variant="outline" size="sm" disabled={selectedIds.size === 0} onClick={handleBulkTag}>
              <Tag className="size-4" />
              {t('app:bookshelf.batchTag')}
            </Button>
            <Button variant="destructive" size="sm" disabled={selectedIds.size === 0} onClick={handleBulkDelete}>
              <Trash2 className="size-4" />
              {t('common:delete')}
            </Button>
            <Button variant="ghost" size="icon" className="size-8" aria-label={t('app:bookshelf.batchExit')} onClick={exitSelect}>
              <X className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <NewBookModal
        isOpen={isNewBookOpen}
        onClose={() => setIsNewBookOpen(false)}
        onCreate={(title, description, templateType, sourceBookId) => {
          onCreateBook(title, description, templateType, sourceBookId);
          setIsNewBookOpen(false);
        }}
        existingBooks={books.map(b => ({ id: b.id, title: b.title }))}
      />

      {/* 回收站：删除的书 30 天内可恢复 */}
      <div className="mx-auto max-w-6xl px-8 pb-10">
        <button
          type="button"
          onClick={() => setTrashOpen((v) => !v)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <Trash2 className="size-4" />
          {t('app:book.trashTitle')} ({trash.length})
        </button>
        {trashOpen && (
          <div className="mt-3 space-y-2">
            {trash.length === 0 && (
              <p className="text-xs italic text-muted-foreground">{t('app:book.trashEmpty')}</p>
            )}
            {trash.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-2.5">
                <div className="min-w-0">
                  <div className="truncate font-serif text-sm font-medium text-foreground">{entry.title}</div>
                  <div className="text-2xs tabular-nums text-muted-foreground">
                    {formatLastEdited(entry.deletedAt, i18n.language)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => onRestoreTrash(entry.id).then(reloadTrash)}>
                    {t('app:book.trashRestore')}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => onPurgeTrash(entry.id).then(reloadTrash)}>
                    {t('app:book.trashDelete')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Bookshelf;
