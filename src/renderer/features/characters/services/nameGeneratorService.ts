/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 离线取名：姓 + 名库组合；可注入随机源便于测试。 */
import type { CharacterGenderId } from '@shared/types';

const SURNAMES = [
  '李', '王', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴',
  '徐', '孙', '胡', '朱', '高', '林', '何', '郭', '马', '罗',
  '梁', '宋', '郑', '谢', '韩', '唐', '冯', '于', '董', '萧',
  '程', '曹', '袁', '邓', '许', '傅', '沈', '曾', '彭', '吕',
  '苏', '卢', '蒋', '蔡', '贾', '丁', '魏', '薛', '叶', '阎',
  '余', '潘', '杜', '戴', '夏', '钟', '汪', '田', '任', '姜',
] as const;

const GIVEN_MALE = [
  '浩然', '子轩', '宇轩', '俊杰', '皓宇', '一鸣', '承启', '景行', '怀瑾', '修远',
  '子墨', '亦辰', '云舟', '望舒', '长歌', '知白', '砚秋', '闻笛', '敬亭', '山青',
  '澈', '珩', '烨', '骁', '砚', '珩', '衍', '珩', '渊', '澈',
] as const;

const GIVEN_FEMALE = [
  '静姝', '语嫣', '婉清', '若雪', '清欢', '疏影', '知微', '语汐', '锦书', '萝月',
  '如晤', '南枝', '青梧', '望舒', '扶苏', '婉如', '楚辞', '疏桐', '云晚', '清禾',
  '岚', '汐', '瑶', '菱', '荞', '菀', '茉', '蕖', '绾', '珞',
] as const;

export function pickRandom<T>(list: readonly T[], rng: () => number = Math.random): T {
  const index = Math.min(list.length - 1, Math.max(0, Math.floor(rng() * list.length)));
  return list[index] as T;
}

export function generateName(gender: CharacterGenderId = 'unknown', rng: () => number = Math.random): string {
  const surname = pickRandom(SURNAMES, rng);
  const given = gender === 'female' ? GIVEN_FEMALE : gender === 'male' ? GIVEN_MALE : [...GIVEN_MALE, ...GIVEN_FEMALE];
  return `${surname}${pickRandom(given, rng)}`;
}

export function generateNames(count: number, gender: CharacterGenderId = 'unknown', rng: () => number = Math.random): string[] {
  return Array.from({ length: Math.max(0, count) }, () => generateName(gender, rng));
}
