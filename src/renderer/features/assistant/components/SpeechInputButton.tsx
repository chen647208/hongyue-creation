/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { Mic, Square } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createDictation, type DictationController,isDictationSupported } from '@/shared/services/speechService';
import { Button } from '@/shared/ui/Button';
import { logger } from '@/shared/utils/logger';

interface SpeechInputButtonProps {
  onTranscript: (text: string) => void;
  lang?: string;
  disabled?: boolean;
}

/** 听写按钮：定型的识别片段回调给输入框；环境不支持时渲染为空。 */
const SpeechInputButton: React.FC<SpeechInputButtonProps> = ({ onTranscript, lang, disabled }) => {
  const { t } = useTranslation('assistant');
  const [listening, setListening] = useState(false);
  const controllerRef = useRef<DictationController | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(() => () => controllerRef.current?.abort(), []);

  if (!isDictationSupported()) return null;

  const toggle = () => {
    if (listening) {
      controllerRef.current?.stop();
      return;
    }
    try {
      const controller = createDictation({
        lang,
        onResult: (text, isFinal) => {
          if (isFinal && text.trim()) onTranscriptRef.current(text.trim());
        },
        onError: (code) => {
          logger.warn('dictation error:', code);
          setListening(false);
        },
        onEnd: () => setListening(false),
      });
      controllerRef.current = controller;
      setListening(true);
      controller.start();
    } catch (err) {
      logger.error('dictation start failed', err);
      setListening(false);
    }
  };

  return (
    <Button
      type="button"
      variant={listening ? 'destructive' : 'ghost'}
      size="icon"
      className="size-9 shrink-0"
      title={t(listening ? 'chat.dictateStop' : 'chat.dictateStart')}
      aria-pressed={listening}
      disabled={disabled}
      onClick={toggle}
    >
      {listening ? <Square className="size-4" /> : <Mic className="size-5" />}
    </Button>
  );
};

export default SpeechInputButton;
