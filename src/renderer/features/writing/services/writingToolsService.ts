/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 写作工具纯函数：一键排版、规则纠错、快捷词展开。 */
import { STORAGE_KEYS } from '@shared/constants/storageKeys';

import { localStore } from '@/shared/services/localStore';

/** 剧本自动格式化开关（本地持久化）。 */
export function isScreenplayFormatEnabled(): boolean {
  try {
    return localStore.getItem(STORAGE_KEYS.editorScreenplayFormat) === '1';
  } catch {
    return false;
  }
}

export function setScreenplayFormatEnabled(enabled: boolean): void {
  localStore.setItem(STORAGE_KEYS.editorScreenplayFormat, enabled ? '1' : '0');
}

export interface ProofreadIssue {
  index: number;
  length: number;
  original: string;
  suggestion: string;
  rule: string;
}

interface TypoRule {
  pattern: RegExp;
  suggestion: string;
  rule: string;
}

const TYPO_RULES: TypoRule[] = [
  { pattern: /的的/g, suggestion: '的', rule: 'repeat' },
  { pattern: /了了/g, suggestion: '了', rule: 'repeat' },
  { pattern: /是是/g, suggestion: '是', rule: 'repeat' },
  { pattern: /。。/g, suggestion: '。', rule: 'punctuation' },
  { pattern: /，，/g, suggestion: '，', rule: 'punctuation' },
  { pattern: /！！/g, suggestion: '！', rule: 'punctuation' },
  { pattern: /？？/g, suggestion: '？', rule: 'punctuation' },
  { pattern: /登陆/g, suggestion: '登录', rule: 'confusion' },
  { pattern: /做为/g, suggestion: '作为', rule: 'confusion' },
  { pattern: /部置/g, suggestion: '布置', rule: 'confusion' },
  { pattern: /含概/g, suggestion: '涵盖', rule: 'confusion' },
  { pattern: /松驰/g, suggestion: '松弛', rule: 'confusion' },
  { pattern: /既使/g, suggestion: '即使', rule: 'confusion' },
  { pattern: /记较/g, suggestion: '计较', rule: 'confusion' },
  { pattern: /批露/g, suggestion: '披露', rule: 'confusion' },
];

export function findProofreadIssues(text: string): ProofreadIssue[] {
  const issues: ProofreadIssue[] = [];
  for (const rule of TYPO_RULES) {
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags.includes('g') ? rule.pattern.flags : `${rule.pattern.flags}g`);
    let match = regex.exec(text);
    while (match !== null) {
      issues.push({ index: match.index, length: match[0].length, original: match[0], suggestion: rule.suggestion, rule: rule.rule });
      match = regex.exec(text);
    }
  }
  return issues.sort((a, b) => a.index - b.index);
}

/** 从后向前替换，索引不受已替换长度影响。 */
export function applyProofreadFixes(text: string, issues: ProofreadIssue[]): string {
  let result = text;
  for (const issue of [...issues].sort((a, b) => b.index - a.index)) {
    result = result.slice(0, issue.index) + issue.suggestion + result.slice(issue.index + issue.length);
  }
  return result;
}

const SCENE_HEADING = /^(INT\.|EXT\.|INT\/EXT|内景|外景|日|夜)/;

export function autoFormatContent(text: string, options: { indentParagraphs?: boolean } = {}): string {
  let result = text
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, '').replace(/…{3,}/g, '……').replace(/\.{3,}/g, '……').replace(/--+/g, '——'))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');

  if (options.indentParagraphs) {
    result = result
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return '';
        if (trimmed.startsWith('#') || trimmed.startsWith('>') || trimmed.startsWith('[[[') || SCENE_HEADING.test(trimmed)) return line;
        if (trimmed.startsWith('\u3000')) return line;
        return `\u3000\u3000${trimmed}`;
      })
      .join('\n');
  }
  return result;
}
