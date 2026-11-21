# 16 新功能补齐：封面导出、人物卡导出、文档附件、语音

## what

1. **人物卡导出**（已实现）：角色编辑弹窗「导出人物卡」→ Markdown
   （标题 + 书名 + 非空字段），桌面端另存为 `.md`，网页端回退下载。
   构建纯函数 `features/characters/characterCard.ts`，标签随界面语言。
2. **封面导出**（已实现）：`core/build/cover.ts` 由书名/简介生成竖版 SVG，
   渲染端 `shared/services/coverService.ts` 光栅化为 PNG 另存（无 canvas 时退回 SVG）；
3. **文档附件**（已实现）：助手聊天除图片外支持 PDF/纯文本文档，
   主进程 `main/app/documents.ts`（unpdf）提取文本后并入提示词参考资料（不直接塞二进制给模型）。
   适配器已支持图片形态（`AIMessageImage`），文档走文本提取路径。
4. **语音**（已实现）：助手消息与写作区朗读，可中止、按段显示进度。
   引擎可选系统语音（离线）或云端 TTS（OpenAI 兼容 / Azure / ElevenLabs），
   配置见设置「朗读」；不做听写。

## why

- 对标 Scrivener（人物卡/封面）、Cherry Studio（文档附件）、
  ChatGPT 桌面（语音）的形态：四项能力各落一处模块，均不走核心数据模型改动。

## 验收标准

1. 人物卡导出：Markdown 含书名与全部非空字段；空字段不落；中英标签随语言。
   （单测 `characterCard.test.ts` 已覆盖）
2. 封面导出：指定书名/作者导出 PNG，尺寸与主题可配；ePub 打包可引用。
3. 文档附件：上传 PDF 后提问，模型能引用其内容；超限/解析失败给明确提示。
4. 语音：朗读可中止并显示分段进度；系统与云端引擎按设置切换；不可用时不显示入口。
5. 不回归：`verify` 全绿；未配置相关能力时行为不变。
