/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { AlertCircle, BookOpen, Calculator, Check, Clock, Copy, Cpu, FileText, Flag, Keyboard, Landmark, MapPin, MessagesSquare, Paperclip, Pencil, Reply, Send, Settings2, Square, Trash2, User, X, Zap } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { templateDisplayName } from '@/i18n';
import { speechLocale } from '@/shared/services/speechService';
import { Button } from '@/shared/ui/Button';
import { MarkdownView } from '@/shared/ui/Markdown';
import { Select } from '@/shared/ui/Select';
import { Spinner } from '@/shared/ui/Spinner';
import { Textarea } from '@/shared/ui/Textarea';
import { cn } from '@/shared/utils/cn';

import type { CardPromptTemplate, KnowledgeItem } from '../../../../shared/types';
import type { ChatMessage } from '../types';
import SavedAttachmentsButton from './SavedAttachmentsButton';
import SpeakButton from './SpeakButton';
import SpeechInputButton from './SpeechInputButton';


interface AssistantChatWorkspaceProps {
  chatContainerRef: React.RefObject<HTMLDivElement | null>;
  contextPanelOpen: boolean;
  editPanelOpen: boolean;
  messages: ChatMessage[];
  isLoading: boolean;
  streamingMessageId: string | null;
  pendingFiles: KnowledgeItem[];
  setPendingFiles: React.Dispatch<React.SetStateAction<KnowledgeItem[]>>;
  pendingImages: Array<{ id: string; name: string; mime: string; dataUrl: string }>;
  setPendingImages: React.Dispatch<React.SetStateAction<Array<{ id: string; name: string; mime: string; dataUrl: string }>>>;
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  hasModel: boolean;
  handleSendMessage: () => void;
  onStopGeneration: () => void;
  onDeleteMessage: (id: string) => void;
  lastToolChain: Array<{ toolId: string; ok: boolean }>;
  handleFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  cardPromptTemplates: CardPromptTemplate[];
  selectedCardTemplateId: string | null;
  setSelectedCardTemplateId: React.Dispatch<React.SetStateAction<string | null>>;
  /** 当前书 id（文档附件按书存储）；无书时不显示附件库。 */
  bookId: string | null;
  /** 保存新附件后递增，触发附件库刷新。 */
  attachmentsRefreshKey?: number;
}

// cmd 前缀是数据（aiCardCommandService 对中英别名都接受），故按语言在渲染期取用；
// filterTemplatesByInput 同时匹配两语言前缀。
const quickCommands = [
  { zh: '/角色', en: '/character', icon: User, category: 'card-character' },
  { zh: '/地点', en: '/location', icon: MapPin, category: 'card-location' },
  { zh: '/势力', en: '/faction', icon: Flag, category: 'card-faction' },
  { zh: '/时间线', en: '/timeline', icon: Clock, category: 'card-timeline' },
  { zh: '/规则', en: '/rule', icon: Settings2, category: 'card-rule' },
  { zh: '/魔法体系', en: '/magic', icon: Zap, category: 'card-magic' },
  { zh: '/科技水平', en: '/technology', icon: Cpu, category: 'card-tech' },
  { zh: '/历史背景', en: '/history', icon: Landmark, category: 'card-history' },
] as const;

const filterTemplatesByInput = (templates: CardPromptTemplate[], input: string) => {
  return templates.filter((template) =>
    input.includes('/角色') || input.includes('/character') ? template.category === 'card-character'
      : input.includes('/地点') || input.includes('/location') ? template.category === 'card-location'
      : input.includes('/势力') || input.includes('/faction') ? template.category === 'card-faction'
      : input.includes('/时间线') || input.includes('/事件') || input.includes('/timeline') || input.includes('/event') ? template.category === 'card-timeline'
      : input.includes('/规则') || input.includes('/体系') || input.includes('/rule') ? template.category === 'card-rule'
      : input.includes('/魔法') || input.includes('/修炼') || input.includes('/magic') ? template.category === 'card-magic'
      : input.includes('/科技') || input.includes('/tech') || input.includes('/technology') ? template.category === 'card-tech'
      : input.includes('/历史') || input.includes('/history') ? template.category === 'card-history'
      : true,
  );
};

const AssistantChatWorkspace: React.FC<AssistantChatWorkspaceProps> = ({
  chatContainerRef,
  contextPanelOpen,
  editPanelOpen,
  messages,
  isLoading,
  streamingMessageId,
  pendingFiles,
  setPendingFiles,
  pendingImages,
  setPendingImages,
  input,
  setInput,
  hasModel,
  handleSendMessage,
  onStopGeneration,
  onDeleteMessage,
  lastToolChain,
  handleFileUpload,
  cardPromptTemplates,
  selectedCardTemplateId,
  setSelectedCardTemplateId,
  bookId,
  attachmentsRefreshKey,
}) => {
  const { t, i18n } = useTranslation('assistant');
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const copyTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  const copyMessage = async (id: string, content: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      // 剪贴板不可用时静默：至少不抛错打断阅读
      return;
    }
    setCopiedId(id);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopiedId(null), 1500);
  };

  // 输入框自增高：随内容（含两行占位符）撑开，上限 max-h-32。
  React.useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [input]);
  return (
    <>
      <div
        ref={chatContainerRef}
        className=" flex-1 space-y-4 overflow-y-auto bg-muted/20 p-4"
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        style={{ display: (contextPanelOpen || editPanelOpen) ? 'none' : 'block' }}
      >
        {messages.length === 0 && (
          <div className="mt-20 text-center text-muted-foreground">
            <MessagesSquare className="mx-auto mb-3 size-10 opacity-40" />
            <p className="mb-3 text-xs">{t('chat.empty')}</p>
            <div className="mx-auto flex max-w-[260px] flex-col gap-1.5">
              {[t('chat.tryAsk1'), t('chat.tryAsk2'), t('chat.tryAsk3')].map((example) => (
                <Button
                  key={example}
                  variant="outline"
                  size="sm"
                  className="h-auto whitespace-normal py-1.5 text-xs font-normal"
                  onClick={() => setInput(example)}
                >
                  {example}
                </Button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn(
              'max-w-[85%] rounded-xl p-3 text-sm leading-relaxed',
              msg.role === 'user' && 'whitespace-pre-wrap',
              msg.role === 'user'
                ? 'rounded-br-sm bg-primary text-primary-foreground'
                : 'rounded-bl-sm border border-border bg-card text-foreground shadow-sm'
            )}>
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="mb-2 space-y-1">
                  {msg.attachments.map((file, index) => (
                    <div key={index} className={cn('flex items-center gap-2 rounded px-2 py-1 text-xs', msg.role === 'user' ? 'bg-black/10' : 'bg-muted/60')}>
                      {file.type === 'context' ? <BookOpen className="size-4" /> : <Paperclip className="size-4" />}
                      <span className="max-w-[150px] truncate">{file.name}</span>
                    </div>
                  ))}
                  <hr className={cn('my-2 border-white/20', msg.role !== 'user' && 'border-border')} />
                </div>
              )}
              <div className="relative">
                {msg.role === 'user'
                  ? msg.content
                  : <MarkdownView content={msg.content} className="text-sm [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0" />}
                {msg.isStreaming && <span className="ml-1 inline-block h-4 w-2 animate-pulse bg-primary align-middle"></span>}
              </div>
              {/* 单条操作：复制 / 删除；用户消息可回填改后重发 */}
              <div className="mt-2 flex items-center gap-1 border-t border-border pt-1.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 text-muted-foreground hover:text-foreground"
                  title={t('chat.copyTitle')}
                  onClick={() => void copyMessage(msg.id, msg.content)}
                >
                  {copiedId === msg.id ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                </Button>
                {msg.role !== 'user' && <SpeakButton text={msg.content} lang={speechLocale(i18n.language)} />}
                {msg.role === 'user' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 text-muted-foreground hover:text-foreground"
                    title={t('chat.editResendTitle')}
                    onClick={() => setInput(msg.content)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 text-muted-foreground hover:text-destructive"
                  title={t('chat.deleteTitle')}
                  onClick={() => onDeleteMessage(msg.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              {(msg.tokens || msg.model || msg.finishReason) && (
                <div className="mt-2 space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
                  {msg.model && (
                    <div className="flex items-center gap-1">
                      <Cpu className="size-4" />
                      <span>{t('chat.modelPrefix')}{msg.model}</span>
                    </div>
                  )}
                  {msg.tokens && (
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1"><Keyboard className="size-4" /><span className="tabular-nums">{t('chat.inputPrefix')}{msg.tokens.prompt}</span></div>
                      <div className="flex items-center gap-1"><Reply className="size-4" /><span className="tabular-nums">{t('chat.outputPrefix')}{msg.tokens.completion}</span></div>
                      <div className="flex items-center gap-1"><Calculator className="size-4" /><span className="tabular-nums">{t('chat.totalPrefix')}{msg.tokens.total}</span></div>
                    </div>
                  )}
                  {msg.finishReason && (
                      <div className="flex items-center gap-1"><Flag className="size-4" /><span>{t('chat.finishReasonPrefix')}{msg.finishReason}</span></div>
                  )}
                  {msg.error && (
                      <div className="flex items-center gap-1 text-destructive"><AlertCircle className="size-4" /><span>{t('chat.errorPrefix')}{msg.error}</span></div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {lastToolChain.length > 0 && !isLoading && (
          <div className="flex justify-start">
            <details className="max-w-[85%] rounded-xl rounded-bl-sm border border-border bg-card px-3 py-2 text-xs text-muted-foreground shadow-sm">
              <summary className="cursor-pointer select-none">
                {t('chat.toolChainTitle', { count: lastToolChain.length })}
              </summary>
              <div className="mt-1.5 space-y-1 font-mono">
                {lastToolChain.map((s) => (
                  <div key={s.toolId} className={s.ok ? '' : 'text-destructive'}>
                    {s.ok ? '✓' : '✗'} {s.toolId}
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}
        {isLoading && !streamingMessageId && (
          <div className="flex justify-start">
            <div className="rounded-xl rounded-bl-sm border border-border bg-card p-3 shadow-sm">
              <Spinner className="size-3.5 text-primary" />
            </div>
          </div>
        )}
      </div>

      {(pendingFiles.length > 0 || pendingImages.length > 0) && (
        <div className="flex shrink-0 gap-2 overflow-x-auto border-t border-border bg-primary/5 px-4 py-2 ">
          {pendingFiles.map((file, index) => (
            <div key={index} className="flex items-center gap-1 whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 text-2xs text-foreground">
              <FileText className="size-3.5" />
              <span className="max-w-[80px] truncate">{file.name}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== index))}
                className="ml-1 size-5 text-muted-foreground hover:text-destructive"
              ><X className="size-3.5" /></Button>
            </div>
          ))}
          {pendingImages.map((img) => (
            <div key={img.id} className="flex items-center gap-1 whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 text-2xs text-foreground">
              <img src={img.dataUrl} alt={img.name} className="size-6 rounded object-cover" />
              <span className="max-w-[80px] truncate">{img.name}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setPendingImages((prev) => prev.filter((p) => p.id !== img.id))}
                className="ml-1 size-5 text-muted-foreground hover:text-destructive"
              ><X className="size-3.5" /></Button>
            </div>
          ))}
        </div>
      )}

      {/* 输入区：上下文/编辑面板打开时被其全屏遮层盖住（鼠标不可达），此处不再重复隐藏 */}
      {
        <div className="shrink-0 border-t border-border bg-card p-3">
          {!contextPanelOpen && (
          <>
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="py-1 text-2xs uppercase tracking-wider text-muted-foreground">{t('chat.quickCreateLabel')}</span>
            {quickCommands.map((item) => {
              const cmd = `${i18n.language === 'en' ? item.en : item.zh} `;
              return (
                <Button
                  key={cmd}
                  variant="outline"
                  onClick={() => {
                    setInput(cmd);
                    const defaultTemplate = cardPromptTemplates.find((template) => template.category === item.category);
                    if (defaultTemplate) {
                      setSelectedCardTemplateId(defaultTemplate.id);
                    }
                  }}
                  className="h-auto gap-1 px-2 py-1 text-2xs font-normal text-muted-foreground hover:border-primary/40 hover:text-primary"
                  title={t('chat.commandTitle', { cmd: cmd.trim() })}
                >
                  <item.icon className="size-3" />
                  {cmd.trim()}
                </Button>
              );
            })}
          </div>

          {input.startsWith('/') && cardPromptTemplates.length > 0 && (
            <div className="mb-2 flex items-center gap-2 px-1">
              <span className="text-2xs uppercase tracking-wider text-muted-foreground">{t('chat.templateLabel')}</span>
              <Select
                className="h-7 flex-1 text-xs"
                value={selectedCardTemplateId || ''}
                onChange={(event) => setSelectedCardTemplateId(event.target.value || null)}
              >
                <option value="">{t('chat.defaultTemplateOption')}</option>
                {filterTemplatesByInput(cardPromptTemplates, input).map((template) => (
                  <option key={template.id} value={template.id}>{templateDisplayName(template)}</option>
                ))}
              </Select>
              {selectedCardTemplateId && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedCardTemplateId(null)}
                  className="size-7 text-muted-foreground hover:text-destructive"
                  title={t('chat.resetTemplateTitle')}
                >
                  <X className="size-4" />
                </Button>
              )}
            </div>
          )}
          </>
          )}

          <div className="flex items-end gap-2">
            <label className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <Paperclip className="size-5" />
              <input type="file" multiple className="hidden" onChange={handleFileUpload} accept=".txt,.md,.json,.js,.ts,.csv,.pdf,.png,.jpg,.jpeg,.webp" />
            </label>
            <SavedAttachmentsButton
              bookId={bookId}
              refreshKey={attachmentsRefreshKey}
              onAttach={(item) => setPendingFiles((prev) => [...prev, item])}
            />
            <SpeechInputButton
              onTranscript={(text) => setInput((prev) => (prev ? `${prev} ${text}` : text))}
              lang={speechLocale(i18n.language)}
              disabled={contextPanelOpen || editPanelOpen}
            />
            <Textarea
              ref={inputRef}
              className="max-h-32 min-h-[58px] flex-1"
              rows={2}
              placeholder={t('chat.inputPlaceholder')}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                // 上下文/编辑面板打开时输入区被全屏遮层盖住：鼠标点不到，
                // 键盘同样拦截，避免 Tab 聚焦后回车误发
                if (contextPanelOpen || editPanelOpen) return;
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  handleSendMessage();
                }
              }}
            />
            {isLoading && streamingMessageId && (
              <Button
                variant="outline"
                size="icon"
                onClick={onStopGeneration}
                title={t('chat.stopTitle')}
                className="shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Square className="size-4" />
              </Button>
            )}
            <Button
              size="icon"
              onClick={handleSendMessage}
              disabled={!hasModel || (!input.trim() && pendingFiles.length === 0 && pendingImages.length === 0)}
              title={!hasModel ? t('dialog.noModel') : t('chat.sendTitle')}
              className="shrink-0"
            >
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      }

    </>
  );
};

export default AssistantChatWorkspace;
