# Hongyue Creation User Guide

## Write your novel from scratch

### Contents
1. [About & installation](#about--installation)
   - [Overview](#overview)
   - [Install & setup](#install--setup)
2. [Core features](#core-features)
   - [Project management](#project-management)
   - [Creation flow in detail](#creation-flow-in-detail)
3. [Advanced features](#advanced-features)
4. [Tips & best practices](#tips--best-practices)
5. [Troubleshooting](#troubleshooting)
6. [Appendix](#appendix)

---

## About & installation

### Overview

**Hongyue Creation** is a desktop app for fiction writers. It supports DeepSeek, Kimi, GLM, Qwen, MiniMax, Gemini, Claude, GPT, and local Ollama models, covering the full flow from inspiration to finished novel.

#### Highlights:
- **AI-assisted creation**: full flow from inspiration, characters, and outline to chapters
- **Local data storage**: all project data stays on your machine, privacy first
- **Knowledge base**: upload references and cite them while writing
- **Multi-model support**: configure parameters per AI model
- **Streaming output**: watch AI generate in real time
- **History**: full record of every AI generation

#### Who it is for:
- Novelists and writing hobbyists
- Creators who want AI assistance
- Authors who want higher throughput
- Beginners learning fiction craft

### Install & setup

#### System requirements
- **OS**: Windows 10/11 (macOS and Linux also supported)
- **RAM**: 8GB or more recommended
- **Disk**: at least 500MB free
- Note: the release build is a ready-to-run desktop program; you do not need to install Node.js yourself (Node is only needed when building from source).

#### Installation

1. Download the installer for your OS from the releases page
2. Double-click `红月创作.exe` (Windows, filename follows productName) to install and launch

#### First launch

1. **AI model setup** (required before using AI features):
   - Click the model name in the top bar (e.g. "No model selected")
   - Open "Model settings", pick an official channel and fill in the Key (DeepSeek/Kimi etc.)
   - Without a model you can still handwrite; AI buttons explain the missing model

2. **Create your first book**:
   - On first launch a wizard pops up; click "Skip" to create a blank book (stay in the library, click the card to enter; picking a persona also opens model settings)
   - Afterwards, click "New Book" in the library (creates a blank book straight into the workspace)
   - Or "From Template" (blank / duplicate / sample)
   - Type your initial idea in the inspiration section, click "Generate Title & Synopsis"
   - Start your journey

---

## Core features

### Project management

#### Create a book
1. Click "New Book" in the library; you land in the workspace inspiration section
2. Type your initial inspiration in the text box
3. Click "Generate Title & Synopsis"
4. The app creates the book under that title

#### Save & load
- **Autosave**: every change is saved locally automatically
- **Manual save**: not needed, the system handles it
- **Load**: after restart, your last project loads automatically
- **Tags**: tag books from the card menu (comma/space separated), filter by the tag chips on top

#### Import / export
1. **Export**:
   - Export a single book from the library card menu, or export a sync package from the top bar
   - Pick a save location
   - Project data is exported as a JSON file

2. **Import**:
   - Click "Import" in the library
   - Pick a previously exported JSON file
   - Confirm; the project data is restored

#### Backup & reset
- Data location: Windows `%APPDATA%/hongyue-creation/`, macOS `~/Library/Application Support/hongyue-creation/`, Linux `~/.config/hongyue-creation/`
- Upgrading from older versions: first launch auto-migrates the old folder (`novalocal-ai-novelist`) to the new location; the old folder is kept as `.legacy` backup
- Backup advice: use export for important projects regularly
- Factory reset: available in settings

### Creation flow in detail

Hongyue Creation uses five sections guiding you through a complete novel (switch freely via the left icon rail; `Ctrl+1..5` works inside the workspace, top-right shows a next-step suggestion):

#### Section 1: Inspiration

**What it does**: turns scattered ideas into a full novel concept.

**Steps**:
1. **Type inspiration fragments**:
   - Any idea works: genre, keywords, setting
   - Example: "An ordinary student at a magic academy suddenly discovers a special power"

2. **Cite the knowledge base** (optional):
   - Click "Upload material" for reference documents
   - Pick knowledge entries to cite
   - Supported formats: .txt, .md, .json, .csv

3. **Pick output mode**:
   - **Streaming**: watch generation live (recommended)
   - **Traditional**: full result at once

4. **Generate**:
   - Click "Generate Title & Synopsis"
   - Wait for the AI result
   - Pause, resume, or stop anytime

5. **Edit results**:
   - Revise the generated title
   - Edit the AI synopsis
   - Save to the project

**Tips**:
- The more concrete the inspiration, the sharper the result
- Uploading relevant references improves quality
- Streaming lets you steer generation in real time

#### Section 2: World building

**What it does**: manages all references (knowledge base, locations, factions, timelines, rules).

**Steps**:
1. **Upload**:
   - Pick text files (.txt/.md/.json/.csv) in the upload area
   - Content is extracted and categorized automatically

2. **Organize**:
   - Browse all uploads
   - Filter by category
   - Edit entry names and content

3. **Cite**:
   - Cite specific knowledge in later steps
   - The AI generates against cited material

**Tips**:
- Upload character sheets, world docs, and similar references
- Give entries clear names for easy lookup
- Tidy the base regularly, delete what you no longer need

#### Section 3: Characters & factions

**What it does**: builds the novel's cast.

**Steps**:
1. **Create characters**:
   - Click "Add character"
   - Fill basics: name, age, gender, etc.
   - Add background and personality

2. **AI-generated characters**:
   - Auto-generate backstories with AI
   - Generate related characters from the inspiration

3. **Relationships**:
   - Set relationships between characters
   - Visual relationship diagram
   - Adjust character importance

**Tips**:
- Give protagonists detailed dossiers
- Key traits suffice for minor roles
- Use the diagram to keep the network straight

#### Section 4: Structure (outline / chapter plan, one page, two tabs)

**What it does**: builds the novel's skeleton: main plot on the outline tab, chapter breakdown on the chapters tab.

**Steps**:
1. **Generate outline**:
   - Generate from inspiration and characters
   - Pick a template or customize
   - Adjust structure and pacing

2. **Edit outline**:
   - Freely edit the AI outline
   - Pin down key plot points

3. **Generate chapter plan**:
   - Switch to the chapters tab, auto-generate the chapter list from the outline
   - Generate a synopsis per chapter; create, reorder by drag-and-drop manually
   - Bulk generation keeps existing prose and only updates titles and synopses

4. **Enter writing**:
   - Click "Write Chapter" on a chapter: a dialog pops up — "Generate content" writes the chapter from its synopsis (or batch mode writes 5/10 chapters at once); "Enter editor only" skips generation for handwriting
   - Start writing the prose

**Tips**:
- Frame first, detail later
- Add detailed beats to important chapters
- Keep chapter lengths balanced for reading rhythm

#### Section 5: Writing editor

**What it does**: the actual writing environment.

**Steps**:
1. **Interface**:
   - Full-screen writing editor
   - Chapter navigation on the left
   - Writing area on the right

2. **AI-assisted writing**:
   - Select text for the floating polish/expand menu
   - Use the generation dialog to write from synopses or continue paragraphs (single or batch 5/10 chapters)
   - The left sidebar edits synopses, extracts chapter summaries, jumps between chapters
   - The toolbar foreshadow button tracks planted/paid-off threads; AI can scan the chapter and auto-mark payoffs
   - Consistency checking lives in the world section; the right-side AI assistant toggles with `Ctrl+J`

3. **Content management**:
   - Everything autosaves
   - Browse chapter history versions
   - Export chapter content
   - Split/merge chapters: the toolbar scissors splits at the cursor into a new chapter; merge folds the next chapter into this one
   - Find & replace: `Ctrl+F` opens the in-chapter find bar
   - Cross-book full-text search: "Full-text search" at the top of the bookshelf searches every book's text and knowledge base; click to jump there

**Tips**:
- Finish the draft before polishing
- Use AI assistance while keeping your own voice
- Back up regularly

---

## Advanced features

### Global assistant

**What**: on-demand AI writing advice.

**How**:
1. Click the top-bar AI icon or press `Ctrl+J` for the right sidebar
2. Type your question (slash commands like `/character` create cards)
   - Follow-ups work (recent turns travel along); hit Regenerate to rerun the last message
   - Images welcome (png/jpg/webp under 5MB); plan mode plans without executing
3. Write operations enter the approval inbox and only land after approval
4. Copy suggestions into the editor
5. Without a usable model, send/analyze buttons disable with a hint — configure a model in settings first
6. Built-in skills trigger automatically when relevant; history / session event stream shows per-round Token usage

**Good for**:
- Unblocking writer's block
- Specific description advice
- Dialogue polishing
- Plot development ideas

### Foreshadow tracking

**What**: records each thread's planted chapter and flags overdue unrecovered threads.

**How**:
1. Open the panel from the writing editor toolbar foreshadow button
2. Add a thread with summary and detail (auto-linked to the current chapter)
3. "AI Detect Payoffs" scans the prose and auto-marks recoveries
4. Detection needs a configured model; manual mark/abandon/delete always work

### Model settings

**What**: tune AI model behavior.

**Options**:
1. **Channel & keys**:
   - Add official channels with Keys, or OpenAI-compatible gateways / local Ollama models
   - Test connection status

2. **Parameters**:
   - **Temperature**: creativity (0-2.0, default 0.7)
   - **Max tokens**: generation length

3. **Prompt templates**:
   - View and edit each step's prompts
   - Create custom templates

### History

**What**: browse all AI generations.

**Access**:
1. Once history exists, a "History" button appears in the top bar (hidden when empty)
2. Browse records by time, or switch to the session event stream for Agent runs
3. Filter by step or chapter
4. Reuse past generations

**Value**:
- Trace how ideas evolved
- Reuse good generations
- Study AI generation patterns

### Version check

**What**: check for updates.

**How**:
1. Click the refresh button next to the top version number
2. The app checks automatically
3. Update info shows when available; go to the download page to install manually (no background auto-update)
4. Skip versions you don't want; they won't nag again

### Data management

**What**: manage app data and settings.

**Actions**:
1. **Clear current project**:
   - Keep the frame, clear all content
   - Restart from inspiration

2. **Delete current project**:
   - Fully deletes the selected project
   - Irreversible, be careful

3. **Factory reset**:
   - Clears all data including API keys
   - App restarts to initial state

---

## Tips & best practices

### Work the knowledge base

#### 1. Use it well
- **Categorize uploads**: organize references by category
- **Extract essentials**: distill core content before uploading
- **Keep current**: update the base as the book grows

#### 2. Prompt optimization
- **Be concrete**: give background and requirements in detail
- **Step by step**: split complex tasks into smaller ones
- **Show examples**: provide the expected output format

#### 3. Batch generation
- **Chapter planning**: auto-generate all chapter synopses from the outline
- **Prose batch**: in the writing generation dialog, switch to batch mode for 5 or 10 chapters at once
- One batch kind at a time; stopping mid-batch never touches finished chapters

#### 4. Output modes
- **Streaming fits**:
  - Steering generation live
  - Long-form content
  - Watching the AI think

- **Traditional fits**:
  - Quick results
  - Short generations
  - Unstable networks

### Process

#### 1. Iterate
1. Generate a fast first version
2. Edit by hand
3. Improve with AI
4. Repeat until satisfied

#### 2. Quality checklist
- [ ] Character motivations hold up
- [ ] Plot logic is coherent
- [ ] Pacing is controlled
- [ ] Prose voice is consistent
- [ ] Details are sufficient

#### 3. Project hygiene
- **Back up regularly**: export weekly
- **Version milestones**: back up before big changes
- **Track progress**: use chapter completion states

---

## Troubleshooting

### Common issues

#### 1. App won't start
**Possible causes**:
- Corrupt or incomplete installer
- OS version too old
- Security software blocking

**Fixes**:
1. Re-download and reinstall
2. Confirm Windows 10/11 (or a supported macOS/Linux version)
3. Check security software, allow-list and retry

#### 2. AI features unavailable
**Possible causes**:
- API key missing or expired
- Network issues
- Model misconfiguration

**Fixes**:
1. Check the API key in model settings
2. Test the network connection
3. Reconfigure model parameters

#### 3. Save failures
**Possible causes**:
- Disk full
- File permission issues
- Corrupt app data directory

**Fixes**:
1. Check free disk space
2. Run as administrator
3. Clean temp files
4. Reset the app after a manual backup

#### 4. Performance issues
**Possible causes**:
- Oversized project data
- Too many panels open
- Low system resources

**Fixes**:
1. Export and clean old projects
2. Close unneeded panels
3. Restart to free resources
4. Upgrade hardware

### Error messages

#### "Invalid API key"
- Check the key was copied correctly
- Confirm the key has usage permission
- Check whether the key expired

#### "Network failed"
- Check connectivity
- Check firewall settings
- Settings → General → Proxy: enter a proxy address (blank = direct), use "Test connection"

#### "Generation too long"
- Shorten the input
- Adjust max tokens
- Generate in smaller chunks

#### "Disk full"
- Free disk space
- Export and delete old projects
- Move data to another disk

### Getting help

1. **Logs**:
   - DevTools console (F12)
   - Main-process terminal output
   - Log files in the app data directory

2. **Community**:
   - GitHub Issues
   - Developer docs
   - User groups

3. **Contact**:
   - Official feedback channels
   - Detailed error info
   - Screenshots and logs attached

---

## Appendix

### Shortcuts

Default shortcuts (`Ctrl`, `Cmd` on macOS); remap in Settings → General → Shortcuts:

#### Section navigation (inside the workspace)
- `Ctrl+1`: Inspiration
- `Ctrl+2`: World
- `Ctrl+3`: Characters
- `Ctrl+4`: Structure (outline / chapters)
- `Ctrl+5`: Writing

#### Assistant & editor
- `Ctrl+J`: show / hide the AI assistant sidebar
- `Ctrl+F`: toggle the writing-editor find bar
- `Ctrl+Shift+X`: insert placeholder atom in prompt-template editing (not remappable)

### Glossary

#### AI terms
- **Token**: the basic unit of AI text, roughly 0.75 English words
- **Temperature**: creativity control; higher means more creative
- **Streaming**: renders generated content progressively in real time
- **Prompt**: instructions and context given to the AI

#### Craft terms
- **Inspiration fragments**: scattered early ideas
- **Knowledge base**: the reference collection for creation
- **Virtual chapter**: an internal sentinel chapter (negative order or legacy id) invisible in the chapter list, used as AI history / draft slots — nothing to manage
- **Relationship diagram**: visualizes the character network

### Links

#### Official
- Repo: <https://github.com/chen647208/hongyue-creation>
- Latest download: <https://github.com/chen647208/hongyue-creation/releases/latest>
- Online docs: <https://chen647208.github.io/hongyue-creation/>

#### Learning
- Craft and design notes live under the docs site "Features" and "Design" sections.
- Questions and feedback: GitHub Issues <https://github.com/chen647208/hongyue-creation/issues>

### Version history

Version of record is `package.json`; changes are in `CHANGELOG.md`, not duplicated here.

---

## Closing

Hongyue Creation pairs AI capability with human creativity to help you finish novels faster. Experienced or just starting, it has something for you.

Remember: AI assists, the soul of the work is yours. Use the tool to spark ideas and work faster.
