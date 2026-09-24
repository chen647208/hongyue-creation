/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect,it } from 'vitest';

import { NAMESPACES, SUPPORTED_LANGUAGES } from '../../../shared/i18n/catalog';
import { resources } from '../../../shared/i18n/resources';

/** 把嵌套字典扁平化为「点号键 → 字符串值」。 */
function flatten(obj: unknown, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (o: unknown, p: string): void => {
    if (o && typeof o === 'object' && !Array.isArray(o)) {
      for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
        walk(v, p ? `${p}.${k}` : k);
      }
    } else {
      out.set(p, typeof o === 'string' ? o : JSON.stringify(o));
    }
  };
  walk(obj, prefix);
  return out;
}

/** 提取 {{param}} 占位符名集合（复数变体归并到同名）。 */
function paramTokens(s: string): string[] {
  return [...s.matchAll(/\{\{\s*(\w+)/g)].map((m) => m[1]!).sort();
}

describe('中英字典一致性', () => {
  it('每种语言的命名空间集合与 NAMESPACES 完全一致（零缺失零多余）', () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(Object.keys(resources[lang]).sort()).toEqual([...NAMESPACES].sort());
    }
  });

  for (const ns of NAMESPACES) {
    const zh = resources.zh[ns];
    const en = resources.en[ns];

    it(`${ns}: zh 与 en 键集完全一致`, () => {
      expect([...flatten(en).keys()].sort()).toEqual([...flatten(zh).keys()].sort());
    });

    it(`${ns}: 无空值`, () => {
      for (const [k, v] of flatten(zh)) expect(v.trim(), `${ns}.${k} (zh) 为空`).not.toBe('');
      for (const [k, v] of flatten(en)) expect(v.trim(), `${ns}.${k} (en) 为空`).not.toBe('');
    });

    it(`${ns}: 同名键的占位符集合一致`, () => {
      const z = flatten(zh);
      const e = flatten(en);
      for (const k of z.keys()) {
        expect(paramTokens(e.get(k) ?? ''), `${ns}.${k} 占位符不匹配`).toEqual(paramTokens(z.get(k) ?? ''));
      }
    });
  }
});
