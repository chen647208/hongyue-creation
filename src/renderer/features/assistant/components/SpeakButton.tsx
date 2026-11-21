/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { Square,Volume2 } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { useSettingsStore } from '@/app/stores/settingsStore';
import { useSpeechPlayback } from '@/shared/hooks/useSpeechPlayback';
import { Button } from '@/shared/ui/Button';

interface SpeakButtonProps {
  text: string;
  /** 内容语言（系统语音按语言挑音色；云端引擎由配置决定）。 */
  lang?: string;
}

/** 朗读按钮：跟随设置里的合成引擎；环境不可用时渲染为空。 */
const SpeakButton: React.FC<SpeakButtonProps> = ({ text }) => {
  const { t } = useTranslation('assistant');
  const tts = useSettingsStore((s) => s.tts);
  const { supported, speaking, toggle } = useSpeechPlayback(tts);

  if (!supported || !text.trim()) return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-6 text-muted-foreground hover:text-foreground"
      title={t(speaking ? 'chat.speakStopTitle' : 'chat.speakTitle')}
      aria-pressed={speaking}
      onClick={() => toggle(text)}
    >
      {speaking ? <Square className="size-3.5" /> : <Volume2 className="size-3.5" />}
    </Button>
  );
};

export default SpeakButton;
