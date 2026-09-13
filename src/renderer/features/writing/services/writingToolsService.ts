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

import type { PaperStyle } from '../types';

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

/** 敏感词表（用户自备，原始文本）。 */
export function readSensitiveWordsRaw(): string {
  try {
    return localStore.getItem(STORAGE_KEYS.editorSensitiveWords) ?? '';
  } catch {
    return '';
  }
}

export function writeSensitiveWords(raw: string): void {
  localStore.setItem(STORAGE_KEYS.editorSensitiveWords, raw);
}

export function readPaperStyle(): PaperStyle {
  try {
    const value = localStore.getItem(STORAGE_KEYS.editorPaper);
    return value === 'grid' || value === 'lined' || value === 'sepia' ? value : 'plain';
  } catch {
    return 'plain';
  }
}

export function writePaperStyle(style: PaperStyle): void {
  localStore.setItem(STORAGE_KEYS.editorPaper, style);
}

/** 纸张样式对应的编辑器容器样式。 */
export function paperInlineStyle(paper: PaperStyle): { backgroundColor?: string; color?: string; backgroundImage?: string; backgroundSize?: string } {
  switch (paper) {
    case 'grid':
      return {
        backgroundColor: '#fbfbf8',
        backgroundImage:
          'linear-gradient(to right, rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.06) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      };
    case 'lined':
      return {
        backgroundColor: '#fbfbf8',
        backgroundImage: 'repeating-linear-gradient(to bottom, transparent, transparent 31px, rgba(0,0,0,0.08) 31px, rgba(0,0,0,0.08) 32px)',
      };
    case 'sepia':
      return { backgroundColor: '#f6ecd9', color: '#4a3f2f' };
    default:
      return {};
  }
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
  { pattern: /迫不急待/g, suggestion: '迫不及待', rule: 'idiom' },
  { pattern: /按纳/g, suggestion: '按捺', rule: 'idiom' },
  { pattern: /走头无路/g, suggestion: '走投无路', rule: 'idiom' },
  { pattern: /饮鸠止渴/g, suggestion: '饮鸩止渴', rule: 'idiom' },
  { pattern: /病入膏方/g, suggestion: '病入膏肓', rule: 'idiom' },
  { pattern: /出奇不意/g, suggestion: '出其不意', rule: 'idiom' },
  { pattern: /得不尝失/g, suggestion: '得不偿失', rule: 'idiom' },
  { pattern: /既往不究/g, suggestion: '既往不咎', rule: 'idiom' },
  { pattern: /前扑后继/g, suggestion: '前仆后继', rule: 'idiom' },
  { pattern: /谈笑风声/g, suggestion: '谈笑风生', rule: 'idiom' },
  { pattern: /一愁莫展/g, suggestion: '一筹莫展', rule: 'idiom' },
  { pattern: /兴高彩烈/g, suggestion: '兴高采烈', rule: 'idiom' },
  { pattern: /无耐/g, suggestion: '无奈', rule: 'confusion' },
  { pattern: /张慌/g, suggestion: '张皇', rule: 'confusion' },
  { pattern: /良秀不齐/g, suggestion: '良莠不齐', rule: 'idiom' },
  { pattern: /气势凶凶/g, suggestion: '气势汹汹', rule: 'idiom' },
  { pattern: /直接了当/g, suggestion: '直截了当', rule: 'idiom' },
  { pattern: /不可救要/g, suggestion: '不可救药', rule: 'idiom' },
  { pattern: /精神焕散/g, suggestion: '精神涣散', rule: 'idiom' },
  { pattern: /不能自己/g, suggestion: '不能自已', rule: 'idiom' },
  { pattern: /报仇血恨/g, suggestion: '报仇雪恨', rule: 'idiom' },
  { pattern: /迁强/g, suggestion: '牵强', rule: 'confusion' },
  { pattern: /迷天大谎/g, suggestion: '弥天大谎', rule: 'idiom' },
  { pattern: /世外桃园/g, suggestion: '世外桃源', rule: 'idiom' },
  { pattern: /心浮气燥/g, suggestion: '心浮气躁', rule: 'idiom' },
  { pattern: /一诺千斤/g, suggestion: '一诺千金', rule: 'idiom' },
  { pattern: /美仑美奂/g, suggestion: '美轮美奂', rule: 'idiom' },
  { pattern: /迫在眉稍/g, suggestion: '迫在眉睫', rule: 'idiom' },
  { pattern: /巧夺天功/g, suggestion: '巧夺天工', rule: 'idiom' },
  { pattern: /如愿以尝/g, suggestion: '如愿以偿', rule: 'idiom' },
  { pattern: /声名雀起/g, suggestion: '声名鹊起', rule: 'idiom' },
  { pattern: /叹为观之/g, suggestion: '叹为观止', rule: 'idiom' },
  { pattern: /无精打彩/g, suggestion: '无精打采', rule: 'idiom' },
  { pattern: /暇不掩瑜/g, suggestion: '瑕不掩瑜', rule: 'idiom' },
  { pattern: /星罗其布/g, suggestion: '星罗棋布', rule: 'idiom' },
  { pattern: /一如继往/g, suggestion: '一如既往', rule: 'idiom' },
  { pattern: /义气用事/g, suggestion: '意气用事', rule: 'idiom' },
  { pattern: /有条不稳/g, suggestion: '有条不紊', rule: 'idiom' },
  { pattern: /震憾/g, suggestion: '震撼', rule: 'confusion' },
];

/** 把用户输入的敏感词（换行/逗号/分号/顿号分隔）解析为去重列表。 */
export function parseSensitiveWords(raw: string): string[] {
  return [...new Set(raw.split(/[\s,，、;；]+/).map((word) => word.trim()).filter((word) => word.length > 0))];
}

export function findProofreadIssues(text: string, sensitiveWords: string[] = []): ProofreadIssue[] {
  const issues: ProofreadIssue[] = [];
  for (const rule of TYPO_RULES) {
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags.includes('g') ? rule.pattern.flags : `${rule.pattern.flags}g`);
    let match = regex.exec(text);
    while (match !== null) {
      issues.push({ index: match.index, length: match[0].length, original: match[0], suggestion: rule.suggestion, rule: rule.rule });
      match = regex.exec(text);
    }
  }
  for (const word of sensitiveWords) {
    if (!word) continue;
    let index = text.indexOf(word);
    while (index !== -1) {
      issues.push({ index, length: word.length, original: word, suggestion: '', rule: 'sensitive' });
      index = text.indexOf(word, index + word.length);
    }
  }
  return issues.sort((a, b) => a.index - b.index);
}

/** 从后向前替换，索引不受已替换长度影响；空建议（敏感词）不自动替换。 */
export function applyProofreadFixes(text: string, issues: ProofreadIssue[]): string {
  let result = text;
  for (const issue of [...issues].filter((entry) => entry.suggestion !== '').sort((a, b) => b.index - a.index)) {
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
