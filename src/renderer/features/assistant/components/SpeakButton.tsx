/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { Square,Volume2 } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isSpeechSynthesisSupported, speak, type SpeechHandle } from '@/shared/services/speechService';
import { Button } from '@/shared/ui/Button';
import { logger } from '@/shared/utils/logger';

interface SpeakButtonProps {
  text: string;
  lang?: string;
}

/** 朗读按钮：朗读消息并在结束时复位；环境不支持时渲染为空。 */
const SpeakButton: React.FC<SpeakButtonProps> = ({ text, lang }) => {
  const { t } = useTranslation('assistant');
  const [speaking, setSpeaking] = useState(false);
  const handleRef = useRef<SpeechHandle | null>(null);
  const timerRef = useRef<number | null>(null);

  const stop = () => {
    handleRef.current?.cancel();
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setSpeaking(false);
  };

  useEffect(() => () => {
    handleRef.current?.cancel();
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
  }, []);

  if (!isSpeechSynthesisSupported()) return null;

  const toggle = () => {
    if (speaking) {
      stop();
      return;
    }
    try {
      handleRef.current = speak(text, lang);
      setSpeaking(true);
      timerRef.current = window.setInterval(() => {
        if (!window.speechSynthesis.speaking) stop();
      }, 300);
    } catch (err) {
      logger.error('speak failed', err);
      setSpeaking(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-6 text-muted-foreground hover:text-foreground"
      title={t(speaking ? 'chat.speakStopTitle' : 'chat.speakTitle')}
      aria-pressed={speaking}
      onClick={toggle}
    >
      {speaking ? <Square className="size-3.5" /> : <Volume2 className="size-3.5" />}
    </Button>
  );
};

export default SpeakButton;
