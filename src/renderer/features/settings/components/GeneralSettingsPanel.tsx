/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { AppLanguage, AppTheme } from '@shared/types';
import { Download, Keyboard, Languages, Monitor, Moon, Sun, Trash2, Type, Upload } from 'lucide-react';
import React, { useRef, useState } from 'react';

import { useSettingsStore } from '@/app/stores/settingsStore';
import { SUPPORTED_LANGUAGES,useTranslation } from '@/i18n';
import { Button } from '@/shared/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/Card';
import { Label } from '@/shared/ui/Label';
import { Select } from '@/shared/ui/Select';
import { cn } from '@/shared/utils/cn';

import { DEFAULT_EDITOR_FONT, DEFAULT_UI_FONT, fontPresets, resolveFontStack } from '../../../constants/fonts';
import { importCustomFont, removeCustomFont } from '../services/customFontService';
import type { GeneralSettingsPanelProps } from '../types';
import CollaborationPanel from './CollaborationPanel';
import EntityTypesPanel from './EntityTypesPanel';
import FeatureTogglesPanel from './FeatureTogglesPanel';
import ProxyPanel from './ProxyPanel';
import ShortcutRecorder from './ShortcutRecorder';
import SystemPanel from './SystemPanel';

const THEME_OPTIONS: {
  value: AppTheme;
  icon: typeof Sun;
  labelKey: 'general.theme.light' | 'general.theme.dark' | 'general.theme.system';
}[] = [
  { value: 'light', icon: Sun, labelKey: 'general.theme.light' },
  { value: 'dark', icon: Moon, labelKey: 'general.theme.dark' },
  { value: 'system', icon: Monitor, labelKey: 'general.theme.system' },
];

const GeneralSettingsPanel: React.FC<GeneralSettingsPanelProps> = ({
  language,
  onLanguageChange,
  theme,
  onThemeChange,
}) => {
  const { t, i18n } = useTranslation('settings');
  const lang = i18n.language.startsWith('en') ? 'en' : 'zh';
  // 字体即时生效（同语言/主题），直写 store 走持久化桥
  const uiFont = useSettingsStore((s) => s.uiFont ?? DEFAULT_UI_FONT);
  const editorFont = useSettingsStore((s) => s.editorFont ?? DEFAULT_EDITOR_FONT);
  const customFonts = useSettingsStore((s) => s.customFonts);
  const uiFontSize = useSettingsStore((s) => s.uiFontSize ?? 14);
  const editorFontSize = useSettingsStore((s) => s.editorFontSize ?? 18);
  const editorLineHeight = useSettingsStore((s) => s.editorLineHeight ?? 1.9);
  const store = useSettingsStore.getState();
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    setImportError(null);
    try {
      await importCustomFont(file);
    } catch (error) {
      setImportError(t('general.importFailed', { message: error instanceof Error ? error.message : String(error) }));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Languages className="size-4 text-muted-foreground" />
            {t('general.title')}
          </CardTitle>
          <CardDescription>{t('general.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="max-w-xs space-y-2">
            <Label htmlFor="app-language">{t('general.languageLabel')}</Label>
            <Select
              id="app-language"
              value={language}
              onChange={(e) => onLanguageChange(e.target.value as AppLanguage)}
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {t(`general.language.${lang}`)}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">{t('general.languageHint')}</p>
          </div>

          <div className="max-w-xs space-y-2">
            <Label>{t('general.themeLabel')}</Label>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('general.themeLabel')}>
              {THEME_OPTIONS.map(({ value, icon: Icon, labelKey }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={theme === value}
                  onClick={() => onThemeChange(value)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-lg border px-3 py-2.5 text-xs font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                    theme === value
                      ? 'border-primary bg-accent text-foreground'
                      : 'border-input text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                  )}
                >
                  <Icon className="size-4" />
                  {t(labelKey)}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t('general.themeHint')}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Type className="size-4 text-muted-foreground" />
            {t('general.fontTitle')}
          </CardTitle>
          <CardDescription>{t('general.fontHint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid max-w-2xl grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="settings-ui-font">{t('general.uiFontLabel')}</Label>
              <Select id="settings-ui-font" value={uiFont} onChange={(e) => store.setUiFont(e.target.value)}>
                {fontPresets.map((p) => (
                  <option key={p.id} value={p.id}>{p.name[lang]} · {p.license[lang]}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-editor-font">{t('general.editorFontLabel')}</Label>
              <Select id="settings-editor-font" value={editorFont} onChange={(e) => store.setEditorFont(e.target.value)}>
                {fontPresets.map((p) => (
                  <option key={p.id} value={p.id}>{p.name[lang]} · {p.license[lang]}</option>
                ))}
                {customFonts.map((c) => (
                  <option key={`custom:${c.id}`} value={`custom:${c.id}`}>{c.name} · {t('general.customBadge')}</option>
                ))}
              </Select>
            </div>
          </div>

          <p
            className="rounded-lg border border-border bg-muted/30 p-4 text-base leading-relaxed"
            style={{ fontFamily: resolveFontStack(editorFont, DEFAULT_EDITOR_FONT, customFonts) }}
          >
            {t('general.previewText')}
          </p>

          <div className="grid max-w-2xl grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="settings-ui-font-size">{t('general.uiFontSizeLabel', { size: uiFontSize })}</Label>
              <input
                id="settings-ui-font-size"
                type="range"
                min={11}
                max={20}
                step={1}
                value={uiFontSize}
                onChange={(e) => store.setUiFontSize(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-editor-font-size">{t('general.editorFontSizeLabel', { size: editorFontSize })}</Label>
              <input
                id="settings-editor-font-size"
                type="range"
                min={13}
                max={26}
                step={1}
                value={editorFontSize}
                onChange={(e) => store.setEditorFontSize(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-editor-line-height">{t('general.lineHeightLabel', { height: editorLineHeight.toFixed(1) })}</Label>
              <input
                id="settings-editor-line-height"
                type="range"
                min={1.4}
                max={2.6}
                step={0.1}
                value={editorLineHeight}
                onChange={(e) => store.setEditorLineHeight(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={importing}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="size-3.5" />
                {importing ? t('general.importingFont') : t('general.importFont')}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".ttf,.otf,.woff,.woff2"
                className="hidden"
                onChange={(e) => void handleImportFile(e.target.files?.[0])}
              />
              {importError && <span className="text-xs text-destructive">{importError}</span>}
            </div>
            {customFonts.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {customFonts.map((c) => (
                  <span key={c.id} className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs">
                    <span className="max-w-40 truncate" style={{ fontFamily: `"${c.name}", serif` }}>{c.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => void removeCustomFont(c.id)}
                      title={t('general.removeFontTitle')}
                      className="size-5 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </span>
                ))}
              </div>
            )}
            <div className="space-y-1 pt-1">
              {fontPresets.filter((p) => p.downloadUrl).map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Download className="size-3.5" />
                  <span style={{ fontFamily: p.stack }}>{p.name[lang]}</span>
                  <span>· {p.license[lang]}</span>
                  <a href={p.downloadUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
                    {t('general.getFont')}
                  </a>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Keyboard className="size-4 text-muted-foreground" />
            {t('general.shortcutsTitle')}
          </CardTitle>
          <CardDescription>{t('general.shortcutsHint')}</CardDescription>
        </CardHeader>
        <CardContent>
          <ShortcutRecorder />
        </CardContent>
      </Card>

      <SystemPanel />

      <FeatureTogglesPanel />

      <EntityTypesPanel />

      <CollaborationPanel />

      <ProxyPanel />
    </div>
  );
};

export default GeneralSettingsPanel;
