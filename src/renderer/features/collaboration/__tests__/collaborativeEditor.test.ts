// @vitest-environment jsdom
/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { Editor } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { createCollaborativeExtensions } from '../../../editor/collaborative';
import { editorContentCodec } from '../editorBinding';

describe('协作编辑器', () => {
  it('协作扩展从 Y.XmlFragment 初始化正文', () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('content');
    editorContentCodec.toFragment('协作初始内容', fragment);
    const element = document.createElement('div');
    document.body.appendChild(element);

    const editor = new Editor({
      element,
      extensions: [...createCollaborativeExtensions(), Collaboration.configure({ fragment })],
      content: undefined,
    });

    expect(editor.getText()).toContain('协作初始内容');
    editor.destroy();
    doc.destroy();
  });
});
