/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 修订差异（纯函数，docs/design/38 §2.1）：选定版本（基线）与当前正文的字符级差异。
 *
 * 选型：两级 LCS，无第三方 diff 依赖。
 *   - 先按「行 + 行尾换行」做 LCS 对齐，只在发生增删的行区间内继续做字符级 LCS，
 *     避免整章字符级二次复杂度；
 *   - 每级先裁剪公共前后缀，超过规模上限（MAX_DP_CELLS，防止大章爆内存）的区间
 *     退化为单块替换；
 *   - 相邻的删除与插入归并为一处替换，得到可逐处处理的 RevisionHunk。
 *
 * 语义：基线是「选定的版本」，当前是「正在编辑的正文」。接受采用基线文本（写回正文），
 * 拒绝保留当前文本。全部拒绝的结果与当前正文逐字一致，全部接受的结果与基线逐字一致。
 *
 * 结果 id 按顺序取 `h0`、`h1`…，便于测试确定性与 React key 稳定。
 */

/** 差异块类型：未变 / 当前新增 / 基线删除 / 替换。 */
export type RevisionHunkType = 'equal' | 'insert' | 'delete' | 'replace';

/** 逐处处理决定：接受=采用基线该段；拒绝=保留当前该段。 */
export type RevisionDecision = 'accept' | 'reject';

/** 一处字符级差异（equal 为上下文，其余为可处理改动）。 */
export interface RevisionHunk {
  id: string;
  type: RevisionHunkType;
  /** 基线（选定版本）在该段的文本；insert 为空串。 */
  baselineText: string;
  /** 当前正文在该段的文本；delete 为空串。 */
  currentText: string;
}

interface RawOp {
  type: RevisionHunkType;
  baselineText: string;
  currentText: string;
}

/** LCS 动态规划单元格上限（行级与字符级共用），超过即退化处理。 */
export const MAX_DP_CELLS = 1_000_000;

/** 行 token 化：每行连同行尾换行；拼接结果与原文逐字一致。 */
function tokenizeLines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

/** 通用 LCS：token 数组 → same/delete/insert 序列；先裁前后缀再限制规模。 */
function lcsOps(a: readonly string[], b: readonly string[]): RawOp[] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const ops: RawOp[] = [];
  for (let i = 0; i < start; i++) ops.push({ type: 'equal', baselineText: a[i] ?? '', currentText: a[i] ?? '' });

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  if (midA.length * midB.length <= MAX_DP_CELLS) {
    ops.push(...lcsMiddle(midA, midB));
  } else {
    for (const token of midA) ops.push({ type: 'delete', baselineText: token, currentText: '' });
    for (const token of midB) ops.push({ type: 'insert', baselineText: '', currentText: token });
  }

  for (let i = endA; i < a.length; i++) ops.push({ type: 'equal', baselineText: a[i] ?? '', currentText: a[i] ?? '' });
  return ops;
}

function lcsMiddle(a: readonly string[], b: readonly string[]): RawOp[] {
  const n = a.length;
  const m = b.length;
  if (n === 0) return b.map((text) => ({ type: 'insert', baselineText: '', currentText: text }));
  if (m === 0) return a.map((text) => ({ type: 'delete', baselineText: text, currentText: '' }));

  const w = m + 1;
  const dp = new Int32Array((n + 1) * w);
  const at = (r: number, c: number): number => dp[r * w + c] ?? 0;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }

  const ops: RawOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'equal', baselineText: a[i] ?? '', currentText: a[i] ?? '' });
      i++;
      j++;
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      ops.push({ type: 'delete', baselineText: a[i] ?? '', currentText: '' });
      i++;
    } else {
      ops.push({ type: 'insert', baselineText: '', currentText: b[j] ?? '' });
      j++;
    }
  }
  while (i < n) ops.push({ type: 'delete', baselineText: a[i++] ?? '', currentText: '' });
  while (j < m) ops.push({ type: 'insert', baselineText: '', currentText: b[j++] ?? '' });
  return ops;
}

/** 归并相邻改动：同向合并，删除与插入相邻合并为替换。 */
function normalize(raw: RawOp[]): RevisionHunk[] {
  const merged: RawOp[] = [];
  for (const op of raw) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push({ ...op });
      continue;
    }
    if (last.type === op.type) {
      last.baselineText += op.baselineText;
      last.currentText += op.currentText;
      continue;
    }
    if (last.type !== 'equal' && op.type !== 'equal') {
      last.type = 'replace';
      last.baselineText += op.baselineText;
      last.currentText += op.currentText;
      continue;
    }
    merged.push({ ...op });
  }
  return merged.map((op, index) => ({
    id: `h${index}`,
    type: op.type,
    baselineText: op.baselineText,
    currentText: op.currentText,
  }));
}

/** 行内字符级差异：把两侧区间文本拆成单字符后走同一 LCS。 */
function charDiff(baselineText: string, currentText: string): RevisionHunk[] {
  if (baselineText === currentText) {
    return baselineText === '' ? [] : [{ id: '', type: 'equal', baselineText, currentText }];
  }
  const ops = lcsOps([...baselineText], [...currentText]);
  return normalize(ops);
}

/**
 * 计算基线 → 当前的字符级差异。
 * 两侧完全相同时返回单个 equal 块；空文本对返回空数组。
 */
export function diffChars(baseline: string, current: string): RevisionHunk[] {
  const baselineText = baseline ?? '';
  const currentText = current ?? '';
  if (baselineText === currentText) {
    return baselineText === '' ? [] : [{ id: 'h0', type: 'equal', baselineText, currentText }];
  }

  const lineOps = lcsOps(tokenizeLines(baselineText), tokenizeLines(currentText));
  const out: RevisionHunk[] = [];
  let run: RawOp[] = [];

  const flushRun = () => {
    if (run.length === 0) return;
    const runBaseline = run.filter((op) => op.type !== 'insert').map((op) => op.baselineText).join('');
    const runCurrent = run.filter((op) => op.type !== 'delete').map((op) => op.currentText).join('');
    const hunks = charDiff(runBaseline, runCurrent);
    // 区间内字符级结果可能为空（两侧其实相同），此时无改动可展示。
    out.push(...hunks);
    run = [];
  };

  for (const op of lineOps) {
    if (op.type === 'equal') {
      flushRun();
      out.push({ id: '', type: 'equal', baselineText: op.baselineText, currentText: op.currentText });
    } else {
      run.push(op);
    }
  }
  flushRun();

  return out.map((hunk, index) => ({ ...hunk, id: `h${index}` }));
}

/** 取全部改动块（过滤掉 equal 上下文）。 */
export function changeHunks(hunks: readonly RevisionHunk[]): RevisionHunk[] {
  return hunks.filter((hunk) => hunk.type !== 'equal');
}

/** 合并决定后的结果文本（默认为拒绝，即保留当前正文）。 */
export function mergeRevisionDecisions(
  hunks: readonly RevisionHunk[],
  decisions: ReadonlyMap<string, RevisionDecision> | Record<string, RevisionDecision> = {},
): string {
  const record = decisions instanceof Map ? null : (decisions as Record<string, RevisionDecision>);
  const decide = (id: string): RevisionDecision => {
    if (record === null) return (decisions as ReadonlyMap<string, RevisionDecision>).get(id) ?? 'reject';
    return record[id] ?? 'reject';
  };
  let out = '';
  for (const hunk of hunks) {
    if (hunk.type === 'equal') out += hunk.baselineText;
    else out += decide(hunk.id) === 'accept' ? hunk.baselineText : hunk.currentText;
  }
  return out;
}

/** 全部接受或全部拒绝的决定表。 */
export function uniformDecisions(
  hunks: readonly RevisionHunk[],
  decision: RevisionDecision,
): Map<string, RevisionDecision> {
  const map = new Map<string, RevisionDecision>();
  for (const hunk of hunks) if (hunk.type !== 'equal') map.set(hunk.id, decision);
  return map;
}

/** 改动处计数（供 UI 展示）。 */
export function countChanges(hunks: readonly RevisionHunk[]): number {
  return changeHunks(hunks).length;
}
