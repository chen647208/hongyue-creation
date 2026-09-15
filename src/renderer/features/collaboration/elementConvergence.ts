/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 协作元素状态的确定性收敛契约（docs/design/47 §6）。
 *
 * 运行时收敛由 Yjs 提供：版本号对应 Yjs 状态时钟，决胜对应客户端 id 的确定比较，
 * 删除对应删除集的墓碑语义，排序对应可复算的分数。此模块把这些不变量抽成纯函数，
 * 供视图/画布等元素级状态复用与单测；不替代 Yjs，也不引入第二份真相。
 *
 * 合并规则（交换、结合、幂等）：
 * 1. 版本高者胜；
 * 2. 版本相同：墓碑胜更新；
 * 3. 版本相同且墓碑状态相同：clientId 字典序大者胜（随机决胜，结果确定）；
 * 4. 仍相同则取 updatedAt 较新者。
 */

/** 单个协作元素的状态快照。 */
export interface ElementState {
  id: string;
  /** 单调递增的元素版本号。 */
  version: number;
  /** 排序分数：越大越靠前。 */
  score: number;
  /** 墓碑：true 表示已删除，但仍保留状态以阻止旧更新复活。 */
  deleted: boolean;
  updatedAt: number;
  /** 写入方随机 id：版本相同时按字典序决胜。 */
  clientId: string;
  data?: Record<string, unknown>;
}

/**
 * 合并同一元素的两份状态，返回胜者。交换律与幂等由分支覆盖。
 * 输入不被修改（返回入参之一）。
 */
export function resolveElement(current: ElementState | undefined, incoming: ElementState): ElementState {
  if (!current) return incoming;
  if (incoming.version !== current.version) {
    return incoming.version > current.version ? incoming : current;
  }
  if (incoming.deleted !== current.deleted) {
    return incoming.deleted ? incoming : current;
  }
  if (incoming.clientId !== current.clientId) {
    return incoming.clientId > current.clientId ? incoming : current;
  }
  if (incoming.updatedAt !== current.updatedAt) {
    return incoming.updatedAt > current.updatedAt ? incoming : current;
  }
  return current;
}

/** 对一组元素状态做两两合并；用于验证交换律与结合律。 */
export function mergeElementStates(states: readonly ElementState[]): ElementState[] {
  const merged = new Map<string, ElementState>();
  for (const state of states) {
    merged.set(state.id, resolveElement(merged.get(state.id), state));
  }
  return [...merged.values()];
}

/**
 * 可见元素的稳定排序：墓碑不参与，分数降序，同分按 id 升序，保证多端一致。
 */
export function orderVisibleElements(states: readonly ElementState[]): ElementState[] {
  return states
    .filter((state) => !state.deleted)
    .sort((left, right) => right.score - left.score || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}
