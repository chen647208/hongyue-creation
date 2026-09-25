/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { i18n } from '@/i18n';

import { type AICardCommand, type AICardCommandResult } from '../../../../shared/types';

/**
 * AI卡片命令解析服务
 * 负责解析用户输入，检测是否为卡片创建命令
 */
export class AICardCommandService {
  // 命令前缀映射表
  private static commandMap: Record<string, AICardCommand> = {
    '/角色': 'character',
    '/character': 'character',
    '/人物': 'character',
    '/地点': 'location',
    '/location': 'location',
    '/地图': 'location',
    '/势力': 'faction',
    '/faction': 'faction',
    '/组织': 'faction',
    '/时间线': 'timeline',
    '/timeline': 'timeline',
    '/时间': 'timeline',
    '/规则': 'rule',
    '/rule': 'rule',
    '/等级': 'rule',
    '/体系': 'rule',
    '/事件': 'event',
    '/event': 'event',
    '/剧情': 'event',
    '/魔法体系': 'magic',
    '/魔法': 'magic',
    '/magic': 'magic',
    '/修炼': 'magic',
    '/科技水平': 'tech',
    '/科技': 'tech',
    '/tech': 'tech',
    '/technology': 'tech',
    '/历史背景': 'history',
    '/历史': 'history',
    '/history': 'history',
  };

  /**
   * 解析用户输入，检测是否为卡片创建命令
   * @param input 用户输入的文本
   * @returns 如果是命令返回解析结果，否则返回 null
   */
  static parseCommand(input: string): AICardCommandResult | null {
    const trimmed = input.trim();
    
    // 检查是否以 / 开头
    if (!trimmed.startsWith('/')) return null;
    
    // 提取命令和描述
    const spaceIndex = trimmed.indexOf(' ');
    const cmd = spaceIndex > 0 ? trimmed.substring(0, spaceIndex) : trimmed;
    const description = spaceIndex > 0 ? trimmed.substring(spaceIndex + 1).trim() : '';
    
    const command = this.commandMap[cmd];
    if (!command) return null;
    
    return {
      command,
      rawInput: trimmed,
      description,
    };
  }

  /**
   * 检查输入是否为有效的卡片创建命令
   * @param input 用户输入的文本
   * @returns 是否为有效命令
   */
  static isValidCommand(input: string): boolean {
    return this.parseCommand(input) !== null;
  }

  /**
   * 获取命令的显示名称（随界面语言翻译；命令前缀本身是数据，见 commandMap）
   * @param command 命令类型
   * @returns 显示名称
   */
  static getCommandDisplayName(command: AICardCommand): string {
    const displayKeys: Record<AICardCommand, `cards:commandType.${AICardCommand}`> = {
      character: 'cards:commandType.character',
      location: 'cards:commandType.location',
      faction: 'cards:commandType.faction',
      timeline: 'cards:commandType.timeline',
      rule: 'cards:commandType.rule',
      event: 'cards:commandType.event',
      magic: 'cards:commandType.magic',
      tech: 'cards:commandType.tech',
      history: 'cards:commandType.history',
    };
    return i18n.t(displayKeys[command]);
  }
}





