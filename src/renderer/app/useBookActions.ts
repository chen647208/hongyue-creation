/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */
/**
 * 书籍库动作 hook：建/开/删/复制/重命名/导入导出，全部落 projectStore。
 * App.tsx 只解构使用，不再持有项目 CRUD 细节。
 */
import { useCallback } from 'react';

import { dialogService } from '@/shared/services/dialogService';
import { isFileDialogCanceled } from '@/shared/services/fileDialogError';
import { logger } from '@/shared/utils/logger';

import { type Project } from '../../shared/types';
import { i18n } from '../i18n';
import { repository } from '../shared/services/repository';
import { deleteTrash, moveToTrash, readTrash } from '../shared/services/trashService';
import { blankContents, type BookTemplate,buildExampleProject, buildTemplatedProject, cloneProject, emptyBook } from './bookFactory';
import { normalizeImportedState } from './initialState';
import { checkImportVersion } from './initialState';
import { composeAppState, seedPersistBaseline } from './stores/persistenceBridge';
import { useProjectStore } from './stores/projectStore';
import { hydrateStoresFromState } from './useAppBootstrap';

export interface BookActions {
  openBook: (bookId: string) => void;
  createBook: (title: string, description?: string, templateType?: BookTemplate, sourceBookId?: string) => void;
  /** 先建后改：一键建空白书（默认名，不开模态），直接进工作区。 */
  createQuickBook: () => void;
  renameBook: (bookId: string, newTitle: string) => void;
  /** 打标：标签数组整体替换（空数组即清除）。 */
  tagBook: (bookId: string, tags: string[]) => void;
  deleteBook: (bookId: string) => Promise<void>;
  /** 批量删除：一次确认，逐本进回收站（进站失败的单本跳过）。 */
  deleteBooks: (bookIds: string[]) => Promise<void>;
  /** 从回收站恢复（重名自动加序号，ID 冲突时换新 ID）。 */
  restoreTrashBook: (bookId: string) => Promise<void>;
  /** 彻底删除回收站条目（不可恢复）。 */
  purgeTrashBook: (bookId: string) => Promise<void>;
  duplicateBook: (bookId: string) => void;
  exportBook: (book: Project) => void;
  importBook: () => Promise<void>;
  /** 仅清空当前项目内容（活动书存在时）。 */
  clearCurrentProject: (afterReset: () => void) => Promise<void>;
  /** 删除当前项目并回到书籍库。 */
  deleteCurrentProject: (afterReset: () => void) => Promise<void>;
  /** 全量数据导入：规范化后灌入双 store 并重建差分基线。 */
  importAllData: () => Promise<void>;
}

export function useBookActions(enterWorkspace: () => void): BookActions {
  const openBook = useCallback((bookId: string) => {
    useProjectStore.getState().setActiveProject(bookId);
    enterWorkspace();
  }, [enterWorkspace]);

  const createBook = useCallback((title: string, description?: string, templateType?: BookTemplate, sourceBookId?: string) => {
    const intro = description?.trim() || undefined;
    let newBook: Project;
    if (templateType === 'duplicate' && sourceBookId) {
      const sourceBook = useProjectStore.getState().projects.find(p => p.id === sourceBookId);
      newBook = sourceBook
        ? cloneProject(sourceBook, title, intro ?? sourceBook.intro)
        : emptyBook(title, intro);
    } else if (templateType === 'example') {
      newBook = buildExampleProject(title, intro ?? i18n.t('books:example.intro'));
    } else if (templateType === 'screenplay' || templateType === 'bible' || templateType === 'storyboard' || templateType === 'comic') {
      newBook = buildTemplatedProject(title, intro ?? '', templateType);
    } else {
      newBook = emptyBook(title, intro);
    }
    useProjectStore.getState().upsertProject(newBook);
    enterWorkspace();
  }, [enterWorkspace]);

  const createQuickBook = useCallback(() => {
    const base = i18n.t('app:book.defaultTitle');
    const titles = new Set(useProjectStore.getState().projects.map((p) => p.title));
    let title = base;
    for (let n = 2; titles.has(title); n++) title = `${base} ${n}`;
    useProjectStore.getState().upsertProject(emptyBook(title));
    enterWorkspace();
  }, [enterWorkspace]);

  const renameBook = useCallback((bookId: string, newTitle: string) => {
    useProjectStore.getState().updateProject(bookId, { title: newTitle });
  }, []);

  const tagBook = useCallback((bookId: string, tags: string[]) => {
    useProjectStore.getState().updateProject(bookId, { tags });
  }, []);

  const deleteBook = useCallback(async (bookId: string) => {
    if (!(await dialogService.confirm({ message: i18n.t('app:book.deleteConfirm'), danger: true }))) return;
    const book = useProjectStore.getState().projects.find(p => p.id === bookId);
    if (!book) return;
    // 先进站再删库：进站失败则中止，绝不丢数据
    try {
      await moveToTrash(book);
    } catch (error) {
      logger.error('Failed to move book to trash:', error);
      dialogService.alert(i18n.t('app:book.trashFailed'));
      return;
    }
    const wasActive = useProjectStore.getState().activeProjectId === bookId;
    useProjectStore.getState().removeProject(bookId);
    if (wasActive && useProjectStore.getState().projects.length === 0) {
      // 删除后已无书籍：回到书籍库空态
      useProjectStore.getState().setActiveProject(null);
    }
  }, []);

  const deleteBooks = useCallback(async (bookIds: string[]) => {
    const findBook = (id: string) => useProjectStore.getState().projects.find(p => p.id === id);
    const targets = bookIds.filter((id) => findBook(id));
    if (targets.length === 0) return;
    if (!(await dialogService.confirm({ message: i18n.t('app:bookshelf.batchDeleteConfirm', { count: targets.length }), danger: true }))) return;
    const moved: string[] = [];
    for (const bookId of targets) {
      const book = findBook(bookId);
      if (!book) continue;
      // 先进站再删库：进站失败则跳过该本，绝不丢数据
      try {
        await moveToTrash(book);
        moved.push(bookId);
      } catch (error) {
        logger.error('Failed to move book to trash:', error);
      }
    }
    if (moved.length === 0) {
      dialogService.alert(i18n.t('app:book.trashFailed'));
      return;
    }
    const activeId = useProjectStore.getState().activeProjectId;
    const wasActiveDeleted = activeId !== null && moved.includes(activeId);
    for (const id of moved) useProjectStore.getState().removeProject(id);
    if (wasActiveDeleted && useProjectStore.getState().projects.length === 0) {
      useProjectStore.getState().setActiveProject(null);
    }
  }, []);

  const duplicateBook = useCallback((bookId: string) => {
    const sourceBook = useProjectStore.getState().projects.find(p => p.id === bookId);
    if (!sourceBook) return;
    useProjectStore.getState().upsertProject(
      cloneProject(sourceBook, i18n.t('app:book.duplicateTitle', { title: sourceBook.title })),
    );
    enterWorkspace();
  }, [enterWorkspace]);

  const exportBook = useCallback((book: Project) => {
    void repository.exportBook(book).catch((error: unknown) => {
      logger.error('Failed to export book:', error);
      dialogService.alert(i18n.t('app:book.exportFailed', { message: error instanceof Error ? error.message : String(error) }));
    });
  }, []);

  const importBook = useCallback(async () => {
    try {
      const imported = await repository.importBook();
      const existing = useProjectStore.getState().projects.find(p => p.title === imported.title);
      if (existing) {
        const newTitle = await dialogService.prompt({
          title: i18n.t('app:book.renameImportTitle'),
          message: i18n.t('app:book.renameImportMessage', { title: imported.title }),
          defaultValue: i18n.t('app:book.importedTitle', { title: imported.title }),
        });
        if (newTitle === null) return;
        imported.title = newTitle;
      }
      useProjectStore.getState().upsertProject(imported);
      dialogService.alert(i18n.t('app:book.importSuccess', { title: imported.title }));
    } catch (error) {
      logger.error('Failed to import book:', error);
      if (!isFileDialogCanceled(error)) {
        dialogService.alert(i18n.t('app:book.importFailed', { message: error instanceof Error ? error.message : String(error) }));
      }
    }
  }, []);

  const clearCurrentProject = useCallback(async (afterReset: () => void) => {
    const active = useProjectStore.getState().projects.find(
      p => p.id === useProjectStore.getState().activeProjectId,
    );
    if (!active) return;
    const ok = await dialogService.confirm({ message: i18n.t('app:book.clearConfirm', { title: active.title }), danger: true });
    if (!ok) return;
    useProjectStore.getState().updateActiveProject(blankContents());
    afterReset();
  }, []);

  const deleteCurrentProject = useCallback(async (afterReset: () => void) => {
    const { activeProjectId, projects } = useProjectStore.getState();
    const active = projects.find(p => p.id === activeProjectId);
    if (!active) return;
    const ok = await dialogService.confirm({
      title: i18n.t('app:book.deleteProjectTitle'),
      message: i18n.t('app:book.deleteProjectConfirm', { title: active.title }),
      danger: true,
    });
    if (!ok) return;
    try {
      await moveToTrash(active);
    } catch (error) {
      logger.error('Failed to move book to trash:', error);
      dialogService.alert(i18n.t('app:book.trashFailed'));
      return;
    }
    useProjectStore.getState().removeProject(active.id);
    afterReset();
  }, []);

  const restoreTrashBook = useCallback(async (bookId: string) => {
    const book = await readTrash(bookId);
    if (!book) {
      dialogService.alert(i18n.t('app:book.trashReadFailed'));
      return;
    }
    const state = useProjectStore.getState();
    if (state.projects.some(p => p.id === book.id)) {
      book.id = Date.now().toString();
    }
    if (state.projects.some(p => p.title === book.title)) {
      book.title = i18n.t('app:book.duplicateTitle', { title: book.title });
    }
    state.upsertProject(book);
    await deleteTrash(bookId).catch(() => {});
  }, []);

  const purgeTrashBook = useCallback(async (bookId: string) => {
    const ok = await dialogService.confirm({ message: i18n.t('app:book.purgeConfirm'), danger: true });
    if (!ok) return;
    await deleteTrash(bookId);
  }, []);

  const importAllData = useCallback(async () => {
    const imported = await repository.importAll();
    if (!imported) throw new Error('导入的数据为空');
    // 版本门：新版数据不可降级读，旧版缺字段由 normalize 回退
    if (checkImportVersion(imported) === 'too-new') {
      dialogService.alert(i18n.t('app:importAll.tooNew'));
      return;
    }
    hydrateStoresFromState(normalizeImportedState(imported));
    // 全量落盘：导入是非增量覆盖，必须整库写入后再重建差分基线
    await repository.saveAll(composeAppState());
    seedPersistBaseline(composeAppState());
    dialogService.alert(i18n.t('app:importAll.success'));
  }, []);

  return { openBook, createBook, createQuickBook, renameBook, tagBook, deleteBook, deleteBooks, restoreTrashBook, purgeTrashBook, duplicateBook, exportBook, importBook, clearCurrentProject, deleteCurrentProject, importAllData };
}
