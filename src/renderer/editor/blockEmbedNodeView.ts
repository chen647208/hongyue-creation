/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 块嵌入投影视图（docs/design/45 §4）：把 `blockEmbed` 节点渲染成被引块的实时内容。
 *
 * 节点只存 id，不存内容（设计 45 §6「嵌入不复制内容」）。视图从 resolver 取当前文本，
 * 目标缺失时显示失链并允许点击跳转修复。项目数据变化后由宿主调用 refreshBlockEmbedViews
 * 让所有已挂载视图重新投影。
 */

import type { Node as PmNode } from '@tiptap/pm/model';
import type { NodeView } from '@tiptap/pm/view';

export interface BlockProjection {
  /** 被引块的可读文本。 */
  text: string;
  /** 目标块是否存在（false 为失链）。 */
  exists: boolean;
  /** 目标块所在章节 id；用于跨章跳转。 */
  chapterId: string | null;
}

/** 按块 id 解析投影；返回 null 等同失链。 */
export type BlockEmbedResolver = (id: string) => BlockProjection | null;

interface RegisteredView {
  refresh: () => void;
}

const registry = new Set<RegisteredView>();

/** 重新投影所有已挂载的嵌入视图（项目正文变化时由宿主调用）。 */
export function refreshBlockEmbedViews(): void {
  for (const view of registry) view.refresh();
}

/** 创建 blockEmbed 的 ProseMirror NodeView。 */
export function createBlockEmbedView(
  initial: PmNode,
  resolve: BlockEmbedResolver,
  onOpenSource: (id: string) => void,
): NodeView {
  let id = String(initial.attrs?.id ?? '');
  const dom = document.createElement('div');
  dom.className = 'novel-block-embed';
  dom.setAttribute('data-block-embed', id);
  dom.contentEditable = 'false';

  const render = () => {
    dom.replaceChildren();
    dom.setAttribute('data-block-embed', id);
    const projection = resolve(id);
    if (!projection || !projection.exists) {
      const broken = document.createElement('span');
      broken.className = 'novel-block-embed-broken';
      broken.textContent = `失链：${id}`;
      broken.title = '目标块不存在，点击查看可跳转的引用';
      dom.appendChild(broken);
      return;
    }
    const body = document.createElement('div');
    body.className = 'novel-block-embed-body';
    body.textContent = projection.text;
    dom.appendChild(body);
  };

  const view: NodeView & RegisteredView = {
    dom,
    refresh: render,
    update(next) {
      if (next.type.name !== 'blockEmbed') return false;
      id = String(next.attrs?.id ?? '');
      render();
      return true;
    },
    destroy() {
      registry.delete(view);
    },
    stopEvent: () => false,
  };

  dom.addEventListener('mousedown', (event) => {
    event.preventDefault();
    onOpenSource(id);
  });

  registry.add(view);
  render();
  return view;
}
