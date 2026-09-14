/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 章节行内批注写回（docs/design/38 §2.2）：批注存在 Chapter.annotations 侧车字段，
 * 经既有投影桥以 JSON 属性落库，不改 SQL schema；沿用章节写回单一路径 onUpdate。
 * 批注不写入正文 DSL，因此不进入字数与导出。
 */
import { useMemo, useRef } from 'react';

import type { AnnotationAnchor, ChapterAnnotation, Project } from '../../../../shared/types';
import {
  addAnnotationReply,
  createAnnotation,
  createReply,
  deleteAnnotation,
  reopenAnnotationThread,
  resolveAnnotationThread,
  updateAnnotationBody,
} from '../../../editor/annotations';

interface UseChapterAnnotationsArgs {
  project: Project;
  activeChapterId: string | null;
  onUpdate: (updates: Partial<Project>) => void;
  /** 批注作者标识（单人本地场景固定 'user'）。 */
  author?: string;
}

export interface ChapterAnnotationsController {
  annotations: readonly ChapterAnnotation[];
  addAnnotation: (anchor: AnnotationAnchor, body: string) => void;
  reply: (annotationId: string, body: string) => void;
  updateBody: (annotationId: string, body: string) => void;
  resolve: (annotationId: string) => void;
  reopen: (annotationId: string) => void;
  remove: (annotationId: string) => void;
}

export function useChapterAnnotations({
  project,
  activeChapterId,
  onUpdate,
  author = 'user',
}: UseChapterAnnotationsArgs): ChapterAnnotationsController {
  const projectRef = useRef(project);
  projectRef.current = project;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const annotations = useMemo(() => {
    const chapter = project.chapters.find((c) => c.id === activeChapterId);
    return chapter?.annotations ?? [];
  }, [project, activeChapterId]);

  const write = (next: ChapterAnnotation[]) => {
    const id = activeChapterId;
    if (!id) return;
    onUpdateRef.current({
      chapters: projectRef.current.chapters.map((c) => (c.id === id ? { ...c, annotations: next } : c)),
    });
  };

  const current = (): ChapterAnnotation[] => {
    const chapter = projectRef.current.chapters.find((c) => c.id === activeChapterId);
    return [...(chapter?.annotations ?? [])];
  };

  return {
    annotations,
    addAnnotation: (anchor, body) => {
      if (!body.trim()) return;
      write([...current(), createAnnotation({ anchor, body: body.trim(), author })]);
    },
    reply: (annotationId, body) => {
      if (!body.trim()) return;
      write(addAnnotationReply(current(), annotationId, createReply({ body: body.trim(), author })));
    },
    updateBody: (annotationId, body) => {
      if (!body.trim()) return;
      write(updateAnnotationBody(current(), annotationId, body.trim()));
    },
    resolve: (annotationId) => write(resolveAnnotationThread(current(), annotationId)),
    reopen: (annotationId) => write(reopenAnnotationThread(current(), annotationId)),
    remove: (annotationId) => write(deleteAnnotation(current(), annotationId)),
  };
}
