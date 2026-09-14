/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 块锚（docs/design/45 §3）：把编辑器块级稳定标识写入 DSL 正文，重载/切章后仍可回指。
 *
 * 语法：整行 `^<id>`（前后允许空白）。id 取值 `[A-Za-z0-9][A-Za-z0-9_-]*`，
 * 覆盖 uuidv7 的十六进制与连字符。锚行是其后块的元数据：解析时写入块节点的
 * `blockId` 属性，并从可见文本中剥离；无标识的块不写锚，既有正文零改动。
 *
 * 选型：块级前缀行，而非行尾内联锚。理由：
 *   - 行类型判定（`#{1,3}` 标题、`# @role:` 关键字、`***` 场景分隔）保持原样，
 *     锚不参与这些正则，无需为每种块改判定；
 *   - 与既有「整行冲突转义」机制同构：段落某行恰为锚形时前置 `\` 即可，
 *     不必新增行内转义；
 *   - 整行锚可按行剥离，编译/导出/字数统计前删行即零残留。
 *
 * 避让规则：段落某行去掉首尾空白后恰为锚形时，序列化前置 `\`（见 serialization.ts
 * 的 isBlockCollision），解析时该行按字面文本还原。含 `^` 但不成锚形的行（如 `x^2`）
 * 不受影响。
 */

/** 锚行完整匹配：`^` + id；前后允许空白。 */
const BLOCK_ANCHOR_LINE = /^\s*\^([A-Za-z0-9][A-Za-z0-9_-]*)\s*$/;

/** id 是否可作为锚写入；与解析使用同一字符集，保证写出的锚必可读回。 */
export function isBlockAnchorId(id: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id);
}

/** 该行是否是一条完整锚行（`^<id>`）。 */
export function isBlockAnchorLine(line: string): boolean {
  return BLOCK_ANCHOR_LINE.test(line);
}

/** 块标识 → 锚行文本。 */
export function formatBlockAnchor(id: string): string {
  return `^${id}`;
}

/** 锚行 → 块标识；非锚行返回 null。 */
export function parseBlockAnchor(line: string): string | null {
  return line.match(BLOCK_ANCHOR_LINE)?.[1] ?? null;
}

/** 剥离正文中的全部锚行；结果与从未写入锚时的口径一致。 */
export function stripBlockAnchors(body: string): string {
  if (!body.includes('^')) return body;
  return body
    .split('\n')
    .filter((line) => !isBlockAnchorLine(line))
    .join('\n');
}
