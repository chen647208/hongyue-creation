/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '@/shared/utils/cn';

interface MarkdownViewProps {
  /** Markdown 源文本（AI 生成内容或用户输入） */
  content: string;
  className?: string;
}

/**
 * 令牌化 Markdown 渲染组件。
 *
 * AI 生成的大纲、灵感、助手回复等长文本普遍带 Markdown 结构（标题/加粗/列表/分隔线），
 * Markdown 符号若以裸 textarea/pre-wrap 展示会原样暴露。这里用 react-markdown 直接渲染为
 * React 元素（无 innerHTML 注入），样式全部走设计令牌，标题用衬线呼应文学排版。
 */
const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mb-3 mt-6 font-serif text-xl font-semibold leading-snug text-foreground first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2.5 mt-5 font-serif text-lg font-semibold leading-snug text-foreground first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-4 font-serif text-base font-medium leading-snug text-foreground first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-1.5 mt-3 text-sm font-semibold text-foreground first:mt-0">{children}</h4>
  ),
  h5: ({ children }) => (
    <h5 className="mb-1 mt-3 text-sm font-medium text-foreground first:mt-0">{children}</h5>
  ),
  h6: ({ children }) => (
    <h6 className="mb-1 mt-3 text-xs font-medium uppercase tracking-wider text-muted-foreground first:mt-0">{children}</h6>
  ),
  p: ({ children }) => <p className="my-2 leading-loose first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 marker:text-muted-foreground">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-muted-foreground">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed pl-1">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  hr: () => <hr className="my-5 border-border" />,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-primary/40 pl-4 italic text-muted-foreground">{children}</blockquote>
  ),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-link underline underline-offset-2">
      {children}
    </a>
  ),
  code: ({ className, children, ...props }) => {
    // react-markdown 不给行内代码加 language-* 类；块级代码由 pre 包裹
    const isBlock = /language-/.test(String(className ?? ''));
    if (isBlock) {
      return (
        <code className={cn('block overflow-x-auto whitespace-pre font-mono text-xs', className)} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground" {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => <CodeBlockHeader>{children}</CodeBlockHeader>,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/40">{children}</thead>,
  th: ({ children }) => (
    <th className="border border-border px-2.5 py-1.5 text-left font-medium text-foreground">{children}</th>
  ),
  td: ({ children }) => <td className="border border-border px-2.5 py-1.5 align-top">{children}</td>,
};

/** 代码块头：语言标签 + 复制按钮（子 code 元素的类名与纯文本）。 */
const CodeBlockHeader: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { t, i18n } = useTranslation();
  const [copied, setCopied] = useState(false);
  let language = '';
  let codeText = '';
  React.Children.forEach(children, (child) => {
    if (React.isValidElement<{ className?: string; children?: React.ReactNode }>(child)) {
      const cls = String(child.props.className ?? '');
      const m = cls.match(/language-([\w+-]+)/);
      if (m?.[1]) language = m[1];
      const collect = (node: React.ReactNode): void => {
        if (typeof node === 'string' || typeof node === 'number') codeText += String(node);
        else if (Array.isArray(node)) node.forEach(collect);
        else if (React.isValidElement<{ children?: React.ReactNode }>(node)) collect(node.props.children);
      };
      collect(child.props.children);
    }
  });
  return (
    <div className="my-3 overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between bg-muted/60 px-3 py-1.5">
        <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
          {language || (i18n.language.startsWith('en') ? 'code' : '代码')}
        </span>
        <button
          type="button"
          className="text-2xs text-muted-foreground transition-colors hover:text-foreground"
          title={t('common:copy', '复制')}
          onClick={() => {
            void navigator.clipboard?.writeText(codeText).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              },
              () => {},
            );
          }}
        >
          {copied ? t('common:copied', '已复制') : t('common:copy', '复制')}
        </button>
      </div>
      <pre className="overflow-x-auto bg-muted/50 p-3">{children}</pre>
    </div>
  );
};

export const MarkdownView: React.FC<MarkdownViewProps> = ({ content, className }) => (
  <div className={cn('text-sm text-foreground/90', className)}>
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {content}
    </ReactMarkdown>
  </div>
);

export default MarkdownView;
