/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { uuidv7 } from '@core/entities';

import { i18n } from '@/i18n';
import { AIService } from '@/shared/services/ai/aiService';
import { normalizeGenderId, normalizeImpactId, normalizeRoleId } from '@/shared/utils/characterKinds';

import { 
  type AICardCommand, 
  type CardCreationResult, 
  type CardPromptTemplate,
  type Character, 
  type CreatedCard,
  type Faction, 
  type HistoryDate,
  type HistoryEvent,
  type Location, 
  type MagicSystem,
  type ModelConfig,
  type Project, 
  type RuleLevel,
  type RuleSystem,
  type TechnologyLevel,
  type TimelineEvent,
  type WorldHistory} from '../../../../shared/types';
import { logger } from '../../utils/logger';
import { asNum, asRecord, asRecords,asStr, asStrArr, type LooseRecord } from '../../utils/loose';
import { AICardCommandService } from './aiCardCommandService';
import { AICardPromptService } from './aiCardPromptService';
import { generateFieldReport,validateAndCompleteCardData } from './cardFieldValidator';

/**
 * AI卡片创建服务
 * 整合命令解析、Prompt构建、AI调用和卡片创建的完整流程
 */
export class AICardCreationService {
  
  /**
   * 处理用户输入，检测命令并创建卡片
   * @param input 用户输入的文本
   * @param project 当前项目
   * @param modelConfig AI模型配置
   * @returns 卡片创建结果，如果不是命令返回 null
   */
  static async processInput(
    input: string, 
    project: Project,
    modelConfig?: ModelConfig,
    customTemplate?: CardPromptTemplate
  ): Promise<CardCreationResult | null> {
    // 1. 解析命令
    const command = AICardCommandService.parseCommand(input);
    if (!command) return null;  // 不是卡片创建命令
    
    // 验证描述不为空
    if (!command.description.trim()) {
      return {
        success: false,
        command: command.command,
        data: null,
        message: i18n.t('cards:create.noDescription', {
          command: AICardCommandService.getCommandDisplayName(command.command),
          example: i18n.t('cards:create.noDescriptionExample'),
        }),
      };
    }
    
    // 2. 构建Prompt（支持自定义模板）
    const prompt = AICardPromptService.buildPrompt(
      command.command, 
      command.description,
      AICardPromptService.extractContextFromProject(project),
      customTemplate
    );
    
    // 3. 调用AI
    try {
      // 检查模型配置
      if (!modelConfig?.modelName) {
        return {
          success: false,
          command: command.command,
          data: null,
          message: i18n.t('cards:create.noModel'),
        };
      }
      
      logger.debug('调用AI模型:', modelConfig.modelName, '提供商:', modelConfig.provider);
      const aiResponse = await AIService.call(modelConfig, prompt);
      
      // 检查AI返回是否有错误
      if (aiResponse.error) {
        logger.error('AI返回错误:', aiResponse.error);
        return {
          success: false,
          command: command.command,
          data: null,
          message: i18n.t('cards:create.aiCallFailed', { error: aiResponse.error }),
        };
      }
      
      // 检查返回内容是否为空
      if (!aiResponse.content || aiResponse.content.trim() === '') {
        return {
          success: false,
          command: command.command,
          data: null,
          message: i18n.t('cards:create.emptyResponse'),
        };
      }
      
      // 4. 解析AI返回的JSON
      const cardData = this.parseAIResponse(aiResponse.content);
      
      // 5. 字段完整性校验和补全
      const validationResult = validateAndCompleteCardData(command.command, cardData, project.id);
      
      if (!validationResult.isValid) {
        logger.warn('AI返回数据字段不完整，已自动填充:', validationResult.missingFields);
      }
      
      if (validationResult.defaultedFields.length > 0) {
        logger.debug('使用默认值的字段:', validationResult.defaultedFields);
      }
      
      // 6. 创建卡片数据（使用补全后的数据）
      const result = this.createCard(command.command, validationResult.completedData, project);
      
      // 7. 构建成功消息（包含字段完整性信息）
      const fieldReport = generateFieldReport(validationResult);
      const successMessage = this.buildSuccessMessage(command.command, validationResult.completedData);
      
      return {
        success: true,
        command: command.command,
        data: result,
        message: `${successMessage}\n\n${fieldReport}`,
      };
      
    } catch (error) {
      logger.error('AI卡片创建失败:', error);
      return {
        success: false,
        command: command.command,
        data: null,
        message: i18n.t('cards:create.creationFailed', {
          error: error instanceof Error ? error.message : i18n.t('cards:create.unknownError'),
        }),
      };
    }
  }

  /**
   * 解析AI返回的内容，提取JSON
   * @param content AI返回的原始内容
   * @returns 解析后的JSON对象
   */
  private static parseAIResponse(content: string): LooseRecord {
    logger.debug('AI原始返回:', content);
    
    // 尝试多种方式提取JSON
    let jsonStr: string;
    
    // 方式1: 提取 ```json 代码块
    const jsonCodeBlockMatch = content.match(/```json\s*([\s\S]*?)```/);
    if (jsonCodeBlockMatch) {
      jsonStr = jsonCodeBlockMatch[1]?.trim() ?? '';
    }
    // 方式2: 提取 ``` 代码块
    else {
      const codeBlockMatch = content.match(/```\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1]?.trim() ?? '';
      }
      // 方式3: 查找第一个大括号到最后一个大括号的内容
      else {
        const braceMatch = content.match(/(\{[\s\S]*\})/);
        if (braceMatch) {
          jsonStr = braceMatch[1]?.trim() ?? '';
        }
        // 方式4: 直接使用内容
        else {
          jsonStr = content.trim();
        }
      }
    }
    
    // 清理可能的前后字符
    jsonStr = jsonStr
      .replace(/^\s*```\w*\s*/, '')  // 移除开头的代码块标记
      .replace(/\s*```\s*$/, '')     // 移除结尾的代码块标记
      .trim();
    
    logger.debug('提取的JSON字符串:', jsonStr);
    
    try {
      return asRecord(JSON.parse(jsonStr));
    } catch (e) {
      logger.error('JSON解析失败:', jsonStr, e);
      throw new Error(i18n.t('cards:create.invalidFormat'), { cause: e });
    }
  }

  /**
   * 根据命令类型创建对应的卡片数据
   * @param command 命令类型
   * @param data AI返回的数据
   * @param project 当前项目
   * @returns 创建的卡片数据
   */
  private static createCard(
    command: AICardCommand, 
    data: LooseRecord, 
    project: Project
  ): CreatedCard {
    const timestamp = Date.now();
    
    switch (command) {
      case 'character':
        return this.createCharacter(data, timestamp);
      case 'location':
        return this.createLocation(data, project, timestamp);
      case 'faction':
        return this.createFaction(data, project, timestamp);
      case 'timeline':
        return this.createTimelineEvent(data, timestamp);
      case 'rule':
        return this.createRuleSystem(data, project, timestamp);
      case 'event':
        return this.createEvent(data, timestamp);
      case 'magic':
        return this.createMagicSystem(data);
      case 'tech':
        return this.createTechLevel(data);
      case 'history':
        return this.createHistory(data);
      default:
        throw new Error(i18n.t('cards:create.unsupportedCommand', { command }));
    }
  }

  /**
   * 创建角色卡片
   */
  private static createCharacter(data: LooseRecord, timestamp: number): Character {
    const id = `char_${timestamp}_${uuidv7()}`;
    
    const character: Character = {
      id,
      name: asStr(data.name, '未命名角色'),
      role: normalizeRoleId(asStr(data.role)),
      gender: normalizeGenderId(asStr(data.gender)),
      age: asStr(data.age, '未知'),
      personality: asStr(data.personality),
      appearance: asStr(data.appearance),
      background: asStr(data.background),
      relationships: asStr(data.relationships),
      distinctiveFeatures: asStr(data.distinctiveFeatures),
      occupation: asStr(data.occupation),
      motivation: asStr(data.motivation) || asStr(data.goals),
      strengths: asStr(data.strengths) || asStr(data.abilities),
      weaknesses: asStr(data.weaknesses),
      characterArc: asStr(data.characterArc),
    };
    
    return character;
  }

  /**
   * 创建地点卡片
   */
  private static createLocation(data: LooseRecord, project: Project, timestamp: number): Location {
    const id = `loc_${timestamp}_${uuidv7()}`;
    
    // 将AI返回的字段映射到实际的Location类型
    const locationType = this.normalizeLocationType(asStr(data.type));
    const features = asStr(data.features);
    const atmosphere = asStr(data.atmosphere);
    
    const location: Location = {
      id,
      projectId: project.id,
      name: asStr(data.name, '未命名地点'),
      type: locationType,
      description: asStr(data.description),
      tags: features ? [features] : undefined,
      geography: atmosphere ? {
        terrain: atmosphere,
        climate: ''
      } : undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    
    return location;
  }

  /**
   * 标准化地点类型
   */
  private static normalizeLocationType(type: string): Location['type'] {
    if (!type) return 'other';
    const normalized = type.toLowerCase();
    if (normalized.includes('城市') || normalized.includes('city')) return 'city';
    if (normalized.includes('区域') || normalized.includes('region')) return 'region';
    if (normalized.includes('建筑') || normalized.includes('building')) return 'building';
    if (normalized.includes('地标') || normalized.includes('landmark')) return 'landmark';
    if (normalized.includes('地下') || normalized.includes('dungeon')) return 'dungeon';
    if (normalized.includes('荒野') || normalized.includes('wilderness')) return 'wilderness';
    return 'other';
  }

  /**
   * 创建势力卡片
   */
  private static createFaction(data: LooseRecord, project: Project, timestamp: number): Faction {
    const id = `faction_${timestamp}_${uuidv7()}`;
    
    const faction: Faction = {
      id,
      projectId: project.id,
      name: asStr(data.name, '未命名势力'),
      type: this.normalizeFactionType(asStr(data.type)),
      description: asStr(data.description),
      ideology: asStr(data.values) || asStr(data.goals),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    
    return faction;
  }
  
  /**
   * 标准化势力类型
   */
  private static normalizeFactionType(type: string): Faction['type'] {
    if (!type) return 'other';
    const normalized = type.toLowerCase();
    if (normalized.includes('王国') || normalized.includes('kingdom')) return 'kingdom';
    if (normalized.includes('帝国') || normalized.includes('empire')) return 'empire';
    if (normalized.includes('宗门') || normalized.includes('sect')) return 'sect';
    if (normalized.includes('行会') || normalized.includes('商会') || normalized.includes('guild')) return 'guild';
    if (normalized.includes('家族') || normalized.includes('family')) return 'family';
    if (normalized.includes('部落') || normalized.includes('tribe')) return 'tribe';
    if (normalized.includes('组织') || normalized.includes('organization')) return 'organization';
    if (normalized.includes('联盟') || normalized.includes('alliance')) return 'alliance';
    return 'other';
  }

  /**
   * 创建时间线事件
   */
  private static createTimelineEvent(data: LooseRecord, timestamp: number): TimelineEvent {
    const id = `event_${timestamp}_${uuidv7()}`;
    
    const rawDate = asRecord(data.date);
    const year = asNum(rawDate.year);
    const date: HistoryDate = {
      year,
      month: typeof rawDate.month === 'number' ? rawDate.month : undefined,
      day: typeof rawDate.day === 'number' ? rawDate.day : undefined,
      display: asStr(rawDate.display) || `${year}`,
    };
    
    const impact = asStr(data.impact);
    const event: TimelineEvent = {
      id,
      title: asStr(data.title, '未命名事件'),
      description: asStr(data.description),
      date,
      type: this.normalizeEventType(asStr(data.type)),
      impact,
      significance: normalizeImpactId(impact),
      relatedCharacterIds: asStrArr(data.relatedCharacters),
      relatedLocationIds: asStrArr(data.relatedLocations),
    };
    
    return event;
  }

  /**
   * 标准化事件类型
   */
  private static normalizeEventType(type: string): 'plot' | 'character' | 'world' | 'faction' {
    if (!type) return 'plot';
    const normalized = type.toLowerCase();
    if (normalized.includes('character') || normalized.includes('角色')) return 'character';
    if (normalized.includes('world') || normalized.includes('世界')) return 'world';
    if (normalized.includes('faction') || normalized.includes('势力')) return 'faction';
    return 'plot';
  }

  /**
   * 创建规则系统
   */
  private static createRuleSystem(data: LooseRecord, project: Project, timestamp: number): RuleSystem {
    const id = `rule_${timestamp}_${uuidv7()}`;
    
    const levels: RuleLevel[] = asRecords(data.levels).map((level, index) => ({
      name: asStr(level.name, `等级${index + 1}`),
      description: asStr(level.description),
      requirements: asStr(level.requirements),
      benefits: asStr(level.benefits),
      order: asNum(level.order) || index + 1,
    }));
    
    const ruleSystem: RuleSystem = {
      id,
      projectId: project.id,
      name: asStr(data.name, '未命名规则系统'),
      type: this.normalizeRuleType(asStr(data.type)),
      description: asStr(data.description),
      levels,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    
    return ruleSystem;
  }

  /**
   * 标准化规则类型
   */
  private static normalizeRuleType(type: string): RuleSystem['type'] {
    if (!type) return 'cultivation';
    const normalized = type.toLowerCase();
    if (normalized.includes('cultivation') || normalized.includes('修炼')) return 'cultivation';
    if (normalized.includes('magic') || normalized.includes('魔法')) return 'magic';
    if (normalized.includes('tech') || normalized.includes('科技')) return 'tech';
    if (normalized.includes('currency') || normalized.includes('货币')) return 'currency';
    if (normalized.includes('organization') || normalized.includes('组织')) return 'organization';
    return 'cultivation';
  }

  /**
   * 创建剧情事件（结构与时间线事件类似）
   */
  private static createEvent(data: LooseRecord, timestamp: number): TimelineEvent {
    // 事件类型与时间线事件共用数据结构
    const event = this.createTimelineEvent(data, timestamp);
    event.type = 'plot';
    return event;
  }

  /**
   * 构建成功消息
   */
  private static buildSuccessMessage(command: AICardCommand, data: LooseRecord): string {
    const name = asStr(data.name) || asStr(data.title) || asStr(data.era) || i18n.t('cards:create.unnamed');
    const typeName = AICardCommandService.getCommandDisplayName(command);

    return i18n.t('cards:create.success', { typeName, name });
  }

  /**
   * 创建魔法体系
   */
  private static createMagicSystem(data: LooseRecord): MagicSystem {
    return {
      name: asStr(data.name, '未命名魔法体系'),
      description: asStr(data.description),
      rules: asStrArr(data.rules),
      limitations: asStr(data.limitations),
      castingMethod: asStr(data.castingMethod),
    };
  }

  /**
   * 创建科技水平
   */
  private static createTechLevel(data: LooseRecord): TechnologyLevel {
    return {
      era: asStr(data.era, '未命名时代'),
      description: asStr(data.description),
      keyTechnologies: asStrArr(data.keyTechnologies),
      limitations: asStr(data.limitations),
    };
  }

  /**
   * 创建历史背景
   */
  private static createHistory(data: LooseRecord): WorldHistory {
    const timestamp = Date.now();
    return {
      overview: asStr(data.overview),
      keyEvents: asRecords(data.keyEvents).map((event, index): HistoryEvent => ({
        id: `hist_${timestamp}_${index}`,
        date: this.toHistoryDate(event.date),
        title: asStr(event.title),
        description: asStr(event.description),
        impact: asStr(event.impact),
      })),
    };
  }

  /** 历史事件日期：兼容字符串与 {year, month, day, display} 对象两种 AI 返回形态 */
  private static toHistoryDate(value: unknown): HistoryDate {
    if (typeof value === 'string') return { year: 0, display: value };
    const rec = asRecord(value);
    const year = asNum(rec.year);
    return {
      year,
      month: typeof rec.month === 'number' ? rec.month : undefined,
      day: typeof rec.day === 'number' ? rec.day : undefined,
      display: asStr(rec.display) || (year ? `${year}` : undefined),
    };
  }
}








