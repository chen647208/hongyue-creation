/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 视图公式脚本的沙箱上限。公式是可序列化的纯函数表达式，
 * 不触达网络与文件；超限即求值失败（返回空串），不抛出、不中断渲染。
 */
export const FORMULA_MAX_NODES = 256;
export const FORMULA_MAX_DEPTH = 16;
export const FORMULA_MAX_ARGS = 16;

/** 画布节点缺省尺寸：JSON Canvas 规范要求 width/height，行投影未指定尺寸时使用。 */
export const CANVAS_NODE_WIDTH = 180;
export const CANVAS_NODE_HEIGHT = 96;

/** 画布行节点的缺省网格排布：原点、列数与间距。 */
export const CANVAS_GRID_ORIGIN_X = 40;
export const CANVAS_GRID_ORIGIN_Y = 40;
export const CANVAS_GRID_COLUMNS = 4;
export const CANVAS_GRID_GAP_X = 40;
export const CANVAS_GRID_GAP_Y = 32;

/** 画布节点键盘移动步长（Shift 放大四倍）。 */
export const CANVAS_KEYBOARD_STEP = 16;

/** 画布内容四周预留的空白（坐标平移与画布尺寸计算用）。 */
export const CANVAS_PADDING = 40;

/** 画布导入解析上限：超出部分丢弃并在 issues 中记录。 */
export const CANVAS_MAX_NODES = 2000;
export const CANVAS_MAX_EDGES = 4000;

/** 视图面板正文区高度（像素）：未配置或未拖拽时的缺省高度。 */
export const VIEW_PANEL_DEFAULT_HEIGHT = 440;
/** 视图面板正文区拖拽的最小高度（像素）。 */
export const VIEW_PANEL_MIN_HEIGHT = 160;
/** 视图面板正文区拖拽的最大高度（像素）。 */
export const VIEW_PANEL_MAX_HEIGHT = 900;
