/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */
import type { Citation } from '@core/ai';
import { BookOpenText, Bot, CircleStop, Layers, ListChecks, PenLine, RotateCcw, Trash2, X } from 'lucide-react';
import React, { useEffect, useMemo,useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useProjectStore } from '@/app/stores/projectStore';
import { AIService } from '@/shared/services/ai/aiService';
import { dialogService } from '@/shared/services/dialogService';
import { saveAttachmentFile } from '@/shared/services/documentAttachmentService';
import { Button } from '@/shared/ui/Button';
import { Select } from '@/shared/ui/Select';
import { normalizeGenderId, normalizeRoleId } from '@/shared/utils/characterKinds';
import { cn } from '@/shared/utils/cn';
import { logger } from '@/shared/utils/logger';
import { isModelUsable } from '@/shared/utils/modelReadiness';

import { type Character, type KnowledgeItem, type OutputMode, type Project } from '../../../shared/types';
import { asRecord, asStr,type LooseRecord } from '../../shared/utils/loose';
import AssistantChatWorkspace from './components/AssistantChatWorkspace';
import AssistantContextPanel from './components/AssistantContextPanel';
import AssistantConversationBar from './components/AssistantConversationBar';
import AssistantEditPanel from './components/AssistantEditPanel';
import AssistantInjectionPanel from './components/AssistantInjectionPanel';
import TrialSnapshotButton from './components/TrialSnapshotButton';
import { useAssistantCards } from './hooks/useAssistantCards';
import { useAssistantChat } from './hooks/useAssistantChat';
import { useModelSelection } from './hooks/useModelSelection';
import { buildContextContent } from './services/assistantContextContent';
import { parseSingleCharacterFromText } from './services/characterParsing';
import { collectChatAttachments } from './services/chatAttachments';
import { loadInjectionPreference, saveInjectionPreference, subscribeInjectionPreference } from './services/injectionPreferenceService';
import { type AssistantCategory, type AssistantEditCategory, type EditingData,type GlobalAssistantProps, type SyncStatus } from './types';


const GlobalAssistant: React.FC<GlobalAssistantProps> = ({ models, activeModelId, project, prompts, onUpdate, width = 380, onClose, onWidthChange }) => {
  const { t, i18n } = useTranslation('assistant');
  const resizeRef = useRef<HTMLDivElement>(null);

  const updateActiveProject = useProjectStore((s) => s.updateActiveProject);
  // 模型选择（单源写回 settingsStore）见 useModelSelection
  const { usableModel, hasModel, handleModelChange } = useModelSelection({ models, activeModelId });
  // 卡片落库（AI 归因 + 未知命令提示）见 useAssistantCards
  const { commitAICard, addCardToProject } = useAssistantCards({ project, updateActiveProject, t });

  // 自动上下文注入（design/37）：整体开关 + 单条取消按书持久化（重启保留），最近一次结果见 lastInjection。
  // 偏好单源在 injectionPreferenceService（10 篇自协调）：这里订阅重读，不持镜像副本。
  const [injectionPanelOpen, setInjectionPanelOpen] = useState(false);
  const [injectionPreference, setInjectionPreference] = useState(() => loadInjectionPreference(project?.id));

  useEffect(() => {
    setInjectionPreference(loadInjectionPreference(project?.id));
    return subscribeInjectionPreference(setInjectionPreference);
  }, [project?.id]);

  const handleInjectionEnabledChange = (enabled: boolean): void => {
    saveInjectionPreference(project?.id, { enabled, disabledIds: injectionPreference.disabledIds });
  };

  const toggleInjectionEntry = (id: string) => {
    const disabledIds = injectionPreference.disabledIds.includes(id)
      ? injectionPreference.disabledIds.filter((x) => x !== id)
      : [...injectionPreference.disabledIds, id];
    saveInjectionPreference(project?.id, { enabled: injectionPreference.enabled, disabledIds });
  };

  // 聊天编排（消息/发送/停止/会话记忆/卡片模板）见 useAssistantChat
  const chat = useAssistantChat({
    project,
    usableModel,
    models,
    hasModel,
    addCardToProject,
    t,
    language: i18n.language,
    injectionEnabled: injectionPreference.enabled,
    disabledInjectionIds: injectionPreference.disabledIds,
  });
  const {
    messages, setMessages, input, setInput, isLoading, planMode, setPlanMode,
    pendingImages, setPendingImages, pendingFiles, setPendingFiles, lastToolChain,
    streamingMessageId, cardPromptTemplates, selectedCardTemplateId, setSelectedCardTemplateId,
    sendMessageInternal, handleSendMessage, handleStopStreaming, handleRetry, handleClearChat, lastUserText,
    lastInjection, conversations, activeConversationId, handleSelectConversation, handleNewConversation,
    handleDeleteConversation, handleRestoreConversation,
  } = chat;

  const [outputMode, setOutputMode] = useState<OutputMode>('streaming');
  // 文档附件库刷新信号：保存新附件后递增，触发出现在附件下拉中
  const [attachmentsRefreshKey, setAttachmentsRefreshKey] = useState(0);

  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<AssistantCategory>('inspiration');
  const [subSelectionId, setSubSelectionId] = useState<string>('all');
  const [analysisPromptId, setAnalysisPromptId] = useState<string>('');

  const [editPanelOpen, setEditPanelOpen] = useState(false);
  const [editCategory, setEditCategory] = useState<AssistantEditCategory>('inspiration');
  const [editingData, setEditingData] = useState<EditingData>({});
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [characterGenerationPrompt, setCharacterGenerationPrompt] = useState<string>('');
  const [isGeneratingCharacter, setIsGeneratingCharacter] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, contextPanelOpen]);

  const getContextContent = useMemo(
    () => buildContextContent(project, activeCategory, subSelectionId),
    [project, activeCategory, subSelectionId],
  );

  useEffect(() => {
    const relevant = prompts.find(p => {
       if (activeCategory === 'inspiration') return p.category === 'inspiration';
       if (activeCategory === 'characters') return p.category === 'character';
       if (activeCategory === 'outline') return p.category === 'outline';
       if (activeCategory === 'chapters') return p.category === 'chapter';
       return p.category === 'edit';
    });
    setAnalysisPromptId(relevant?.id || prompts[0]?.id || '');
  }, [activeCategory, prompts]);

  const handleContextAnalyze = () => {
     if (!project) return;
     if (!hasModel) {
       dialogService.alert(t('dialog.noModel'));
       return;
     }
     const content = getContextContent;
     // 空上下文不发送（该分区暂无内容时保持静默，由空态引导用户先填）
     if (!content.trim()) return;
     const promptTemplate = prompts.find(p => p.id === analysisPromptId);
     const instruction = promptTemplate ? promptTemplate.content : t('generation.defaultInstruction');
     
     // 附件归类跟随当前分析分区（知识库无独立归类，回落 writing；原硬编码全标 writing）
     const attachmentCategory = activeCategory === 'inspiration' ? 'inspiration'
       : activeCategory === 'characters' ? 'character'
       : activeCategory === 'outline' ? 'outline'
       : activeCategory === 'chapters' ? 'chapter'
       : 'writing' as const;
     const attachment: KnowledgeItem = {
        id: 'ctx-' + Date.now(),
        name: t('chat.contextAttachmentName', { category: activeCategory }),
        content: content,
        type: 'context',
        size: content.length,
        addedAt: Date.now(),
        category: attachmentCategory
     };
     
     let finalInstruction = instruction;
     if (promptTemplate) {
        finalInstruction = instruction
          .replace('{inspiration}', project.inspiration)
          .replace('{title}', project.title)
          .replace('{intro}', project.intro)
          .replace('{content}', t('generation.seeAttachment')); // 提示 AI 查看附件
     }

     setContextPanelOpen(false);
     void sendMessageInternal(finalInstruction, [attachment]);
  };

  const handleOpenSource = (citation: Citation) => {
    // 出处可点跳：章节引用落到「章节」分类并选中该章，知识库引用落到「知识库」分类
    setActiveCategory(citation.sourceKind === 'knowledge' ? 'knowledge' : 'chapters');
    setSubSelectionId(citation.refId);
    setInjectionPanelOpen(false);
    setEditPanelOpen(false);
    setContextPanelOpen(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const picked = Array.from(e.target.files);
    const electronApi = window.electronAPI;
    const { images, items } = await collectChatAttachments(picked, {
      visionAvailable: usableModel?.supportsVision !== false,
      readDataUrl: (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ''));
          reader.onerror = () => reject(new Error('read failed'));
          reader.readAsDataURL(file);
        }),
      readText: (file) => file.text(),
      extractPdfText: electronApi
        ? (base64) => electronApi.extractPdfText(base64)
        : undefined,
      // 附件的告警键是运行期字符串：t 的键为类型化字面量，入参退化为 never 后返回值变成
      // TFunctionDetailedResult<never, never>，与 string 无交集，单段断言不成立，只能双段收敛到 string。
      alert: (key, params) => dialogService.alert(t(key as never, params as never) as unknown as string),
      logError: (message, name, error) => logger.error(message, name, error),
      now: () => Date.now(),
      makeId: (prefix, index) => `${prefix}-${Date.now()}-${index}`,
    });
    if (images.length > 0) setPendingImages((prev) => [...prev, ...images]);
    if (items.length > 0) setPendingFiles((prev) => [...prev, ...items]);
    // 文档（非图片）按书持久化为附件，之后可在附件库直接重新引用
    if (project) {
      const docs = picked.filter((file) => !file.type.startsWith('image/'));
      if (docs.length > 0) {
        void Promise.all(docs.map((file) => saveAttachmentFile(project.id, file))).then((saved) => {
          if (saved.some((entry) => entry !== null)) setAttachmentsRefreshKey((key) => key + 1);
        });
      }
    }
    e.target.value = '';
  };

  const handleOpenEditPanel = (category: AssistantEditCategory) => {
    setEditCategory(category);
    setEditPanelOpen(true);
    // 打开瞬间快照：保存时比对，面板外并发修改先确认再覆盖，防静默丢数据
    editSnapshotRef.current = project ? JSON.stringify(project) : null;
    
    if (project) {
      switch (category) {
        case 'inspiration':
          setEditingData({ inspiration: project.inspiration, intro: project.intro });
          break;
        case 'knowledge':
          setEditingData({ knowledge: [...(project.knowledge || [])] });
          break;
        case 'characters':
          setEditingData({ characters: [...project.characters] });
          break;
        case 'outline':
          setEditingData({ outline: project.outline });
          break;
        case 'chapters':
          setEditingData({ chapters: [...project.chapters] });
          break;
        case 'content':
          setEditingData({ chapters: [...(project.chapters || [])] });
          break;
      }
    }
  };

  const syncResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editSnapshotRef = useRef<string | null>(null);
  useEffect(() => () => {
    if (syncResetTimer.current) clearTimeout(syncResetTimer.current);
  }, []);

  const handleSaveEdit = () => {
    if (Object.keys(editingData).length === 0 || !onUpdate) return;
    
    setSyncStatus('saving');
    try {
      // 并发保护：只比对本次回写的字段；面板打开后这些字段在外被改过，先确认再覆盖
      void (async () => {
        const snap = editSnapshotRef.current ? (JSON.parse(editSnapshotRef.current) as Partial<Project>) : null;
        const conflicted = snap && project
          ? (Object.keys(editingData) as Array<keyof Project>).filter(
              (k) => JSON.stringify(snap[k]) !== JSON.stringify(project[k]),
            )
          : [];
        if (conflicted.length > 0) {
          const ok = await dialogService.confirm({
            message: t('edit.concurrentConfirm', { fields: conflicted.join('、') }),
            danger: true,
          });
          if (!ok) {
            setSyncStatus('idle');
            return;
          }
        }
        onUpdate(editingData);
        setSyncStatus('saved');
        setEditingData({});
        editSnapshotRef.current = null;
      })();
      
      if (syncResetTimer.current) clearTimeout(syncResetTimer.current);
      syncResetTimer.current = setTimeout(() => setSyncStatus('idle'), 3000);
    } catch (error) {
      logger.error('Failed to save data:', error);
      setSyncStatus('error');
    }
  };

  const handleGenerateCharacter = async () => {
    if (!project || !characterGenerationPrompt.trim()) return;
    
    setIsGeneratingCharacter(true);
    try {
      const activeModel = usableModel;
      if (!isModelUsable(activeModel)) {
        dialogService.alert(t('dialog.noModel'));
        return;
      }
      
      const prompt = t('generation.characterPrompt', {
        title: project.title,
        intro: project.intro,
        request: characterGenerationPrompt,
      });
      
      const response = await AIService.call(activeModel, prompt);
      
      const extractJSONFromResponse = (text: string): string => {
        if (!text) return text;
        
        try {
          JSON.parse(text);
          return text;
        } catch {
          /* 非纯 JSON，继续尝试提取 */
        }
        
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return jsonMatch[0];
        }
        
        const arrayMatch = text.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          return arrayMatch[0];
        }
        
        return text;
      };
      
      let characterData: LooseRecord | null = null;
      let parseError: unknown = null;
      let degradedFromRegex = false;
      let extractedJSON = '';
      
      try {
        const parsed: unknown = JSON.parse(response.content);
        characterData = parsed === null ? null : asRecord(parsed);
      } catch (error1) {
        parseError = error1;
        
        extractedJSON = extractJSONFromResponse(response.content);
        if (extractedJSON !== response.content) {
          try {
            const reparsed: unknown = JSON.parse(extractedJSON);
            characterData = reparsed === null ? null : asRecord(reparsed);
            parseError = null;
          } catch (error2) {
            parseError = error2;
          }
        }
      }
      
      if (!characterData) {
        const parsedCharacter = parseSingleCharacterFromText(response.content);
        if (parsedCharacter) {
          characterData = { ...parsedCharacter };
          parseError = null;
        }
      }
      
      if (!characterData) {
        const nameMatch = response.content.match(/(?:姓名|名字|角色名)[:：\s]*([^\n,，。]+)/i);
        const genderMatch = response.content.match(/(?:性别)[:：\s]*([^\n,，。]+)/i);
        const ageMatch = response.content.match(/(?:年龄)[:：\s]*([^\n,，。]+)/i);
        
        if (nameMatch) {
          // 降级路径：仅姓名可辨，其余字段记空，落库时明确告知用户补全
          degradedFromRegex = true;
          characterData = {
            name: nameMatch[1]?.trim() ?? '',
            gender: genderMatch ? genderMatch[1]?.trim() ?? '' : 'unknown',
            age: ageMatch ? ageMatch[1]?.trim() ?? '' : t('fallback.unknown'),
            role: 'supporting',
            personality: '',
            background: '',
            appearance: '',
            distinctiveFeatures: '',
            occupation: '',
            motivation: '',
            strengths: '',
            weaknesses: '',
            characterArc: ''
          };
        }
      }
      
      if (characterData) {
        const newCharacter: Character = {
          id: Date.now().toString(),
          name: asStr(characterData.name, t('fallback.unnamedCharacter')),
          gender: normalizeGenderId(asStr(characterData.gender)),
          age: asStr(characterData.age, t('fallback.unknown')),
          role: normalizeRoleId(asStr(characterData.role), 'supporting'),
          personality: asStr(characterData.personality, t('fallback.noDescription')),
          background: asStr(characterData.background, t('fallback.noBackground')),
          relationships: asStr(characterData.relationships),
          appearance: asStr(characterData.appearance, t('fallback.noDescription')),
          distinctiveFeatures: asStr(characterData.distinctiveFeatures, t('fallback.noFeatures')),
          occupation: asStr(characterData.occupation, t('fallback.none')),
          motivation: asStr(characterData.motivation, t('fallback.none')),
          strengths: asStr(characterData.strengths, t('fallback.none')),
          weaknesses: asStr(characterData.weaknesses, t('fallback.none')),
          characterArc: asStr(characterData.characterArc, t('fallback.none'))
        };
        
        const updatedCharacters = [...(project.characters || []), newCharacter];
        if (onUpdate) {
          commitAICard({ characters: updatedCharacters });
        }
        
        setCharacterGenerationPrompt('');
        if (degradedFromRegex) {
          const missing = ['personality', 'background', 'appearance', 'occupation', 'motivation']
            .filter((k) => !asStr(characterData[k]).trim());
          dialogService.alert(t('dialog.characterGeneratedPartial', {
            fields: missing.map((k) => t(`edit.charGenField.${k}`, k)).join('、'),
          }));
        } else {
          dialogService.alert(t('dialog.characterGenerated'));
        }
      } else {
        logger.error('Failed to parse character response:', parseError);
        logger.error('Original response:', response.content);
        logger.error('Extracted JSON:', extractedJSON);
        
        dialogService.alert(t('dialog.characterParseFailed', {
          preview: response.content.substring(0, 500),
          ellipsis: response.content.length > 500 ? '...' : '',
        }));
      }
    } catch (error) {
      logger.error('Failed to generate character:', error);
      dialogService.alert(t('dialog.characterGenerateFailed'));
    } finally {
      setIsGeneratingCharacter(false);
    }
  };

  const getChapterContent = (chapterId: string) => {
    if (!project) return '';
    
    if (editingData.chapters && editingData.chapters.length > 0) {
      const editedChapter = editingData.chapters.find(c => c.id === chapterId);
      if (editedChapter && editedChapter.content !== undefined) {
        return editedChapter.content;
      }
    }
    
    const chapter = project.chapters.find(c => c.id === chapterId);
    return chapter?.content || '';
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!onWidthChange) return;
    const startX = e.clientX;
    const startW = width;
    const handleResize = (moveEvent: MouseEvent) => {
      onWidthChange(Math.min(560, Math.max(300, startW + (startX - moveEvent.clientX))));
    };
    const stopResize = () => {
      window.removeEventListener('mousemove', handleResize);
      window.removeEventListener('mouseup', stopResize);
    };
    window.addEventListener('mousemove', handleResize);
    window.addEventListener('mouseup', stopResize);
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-card">
      <div
        ref={resizeRef}
        onMouseDown={handleResizeStart}
        className="absolute inset-y-0 left-0 z-10 w-1 cursor-col-resize transition-colors hover:bg-primary/40"
        title={t('window.resizeSidebarTitle')}
      />
      <div
        className="flex shrink-0 items-center justify-between border-b border-border bg-muted/40 px-4 py-2.5"
      >
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-primary" />
          <span className="text-sm font-medium text-foreground">{t('window.title')}</span>
        </div>
        <div className="flex items-center gap-1">
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="size-11 text-muted-foreground hover:text-foreground sm:size-6"
              title={t('window.closeSidebar')}
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      <AssistantConversationBar
        conversations={conversations}
        activeId={activeConversationId}
        onSelect={handleSelectConversation}
        onNew={handleNewConversation}
        onDelete={handleDeleteConversation}
        onRestore={handleRestoreConversation}
        bookId={project?.id ?? null}
      />

      <>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/20 px-4 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              className="h-7 w-auto max-w-[140px] text-xs"
              aria-label={t('chat.modelSelect')}
              value={usableModel?.id ?? ''}
              onChange={(e) => handleModelChange(e.target.value)}
            >
              {!hasModel && <option value="">{t('model.noModelOption')}</option>}
              {models.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name}{m.isEnabled === false ? t('model.disabledSuffix') : !isModelUsable(m) ? t('model.unconfiguredSuffix') : ''}
                </option>
              ))}
            </Select>
            <Select
              className="h-7 w-auto max-w-[120px] text-xs"
              aria-label={t('chat.outputModeSelect')}
              value={outputMode}
              onChange={(e) => setOutputMode(e.target.value as OutputMode)}
            >
              <option value="streaming">{t('output.streaming')}</option>
              <option value="traditional">{t('output.traditional')}</option>
            </Select>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditPanelOpen(!editPanelOpen)}
              className={cn('size-11 text-muted-foreground hover:text-foreground sm:size-7', editPanelOpen && 'bg-primary/10 text-primary')}
              title={t('window.editDataTitle')}
            >
              <PenLine className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => { setContextPanelOpen(!contextPanelOpen); setInjectionPanelOpen(false); }}
              className={cn('size-11 text-muted-foreground hover:text-foreground sm:size-7', contextPanelOpen && 'bg-primary/10 text-primary')}
              title={t('window.contextTitle')}
            >
              <BookOpenText className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => { setInjectionPanelOpen(!injectionPanelOpen); setContextPanelOpen(false); setEditPanelOpen(false); }}
              className={cn('size-11 text-muted-foreground hover:text-foreground sm:size-7', injectionPanelOpen && 'bg-primary/10 text-primary')}
              title={t('window.injectionTitle')}
            >
              <Layers className="size-4" />
            </Button>
            {streamingMessageId && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleStopStreaming}
                className="size-11 text-destructive hover:text-destructive sm:size-7"
                title={t('window.stopStreamTitle')}
              >
                <CircleStop className="size-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPlanMode((v) => !v)}
              className={cn('size-11 text-muted-foreground hover:text-foreground sm:size-7', planMode && 'bg-primary/10 text-primary')}
              title={t('window.planModeTitle')}
            >
              <ListChecks className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRetry}
              disabled={isLoading || !hasModel || !lastUserText.current.trim()}
              className="size-11 text-muted-foreground hover:text-foreground sm:size-7 disabled:opacity-40"
              title={t('chat.retryTitle')}
            >
              <RotateCcw className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClearChat}
              className="size-11 text-muted-foreground hover:text-destructive sm:size-7"
              title={t('window.clearChatTitle')}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>

          {editPanelOpen && (
            <AssistantEditPanel
              project={project}
              editCategory={editCategory}
              editingData={editingData}
              syncStatus={syncStatus}
              characterGenerationPrompt={characterGenerationPrompt}
              isGeneratingCharacter={isGeneratingCharacter}
              hasModel={hasModel}
              setEditingData={setEditingData}
              setEditCategory={setEditCategory}
              setSyncStatus={setSyncStatus}
              setEditPanelOpen={setEditPanelOpen}
              setCharacterGenerationPrompt={setCharacterGenerationPrompt}
              handleOpenEditPanel={handleOpenEditPanel}
              handleSaveEdit={handleSaveEdit}
              handleGenerateCharacter={handleGenerateCharacter}
              getChapterContent={getChapterContent}
            />
          )}

          {contextPanelOpen && (
            <AssistantContextPanel
              project={project}
              activeCategory={activeCategory}
              subSelectionId={subSelectionId}
              analysisPromptId={analysisPromptId}
              prompts={prompts}
              contextContent={getContextContent}
              isLoading={isLoading}
              hasModel={hasModel}
              onCategoryChange={setActiveCategory}
              onSubSelectionChange={setSubSelectionId}
              onPromptChange={setAnalysisPromptId}
              onAnalyze={handleContextAnalyze}
            />
          )}

          {injectionPanelOpen && (
            <AssistantInjectionPanel
              injection={lastInjection}
              enabled={injectionPreference.enabled}
              onEnabledChange={handleInjectionEnabledChange}
              disabledIds={injectionPreference.disabledIds}
              onToggleEntry={toggleInjectionEntry}
              onClose={() => setInjectionPanelOpen(false)}
            />
          )}

          {onUpdate ? <TrialSnapshotButton projectId={project?.id} onUpdate={onUpdate} /> : null}

          <AssistantChatWorkspace
            chatContainerRef={chatContainerRef}
            contextPanelOpen={contextPanelOpen}
            editPanelOpen={editPanelOpen}
            messages={messages}
            isLoading={isLoading}
            streamingMessageId={streamingMessageId}
            pendingFiles={pendingFiles}
            setPendingFiles={setPendingFiles}
            pendingImages={pendingImages}
            setPendingImages={setPendingImages}
            input={input}
            setInput={setInput}
            hasModel={hasModel}
            handleSendMessage={handleSendMessage}
            onStopGeneration={handleStopStreaming}
            onDeleteMessage={(id) => setMessages((prev) => prev.filter((m) => m.id !== id))}
            lastToolChain={lastToolChain}
            handleFileUpload={handleFileUpload}
            cardPromptTemplates={cardPromptTemplates}
            selectedCardTemplateId={selectedCardTemplateId}
            setSelectedCardTemplateId={setSelectedCardTemplateId}
            bookId={project?.id ?? null}
            attachmentsRefreshKey={attachmentsRefreshKey}
            onOpenSource={handleOpenSource}
          />
        </>
    </div>
  );
};

export default GlobalAssistant;

