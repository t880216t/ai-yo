# Supertester - 软件测试智能体插件设计规格说明书

## 概述

**插件名称：** `supertester`
**类型：** Superpowers 风格的纯 Markdown 技能插件（零代码依赖）
**架构融合：**

- **Superpowers** — Skill 行为塑造模式（Iron Law / Hard Gate / Red Flags / 验证循环）
- **planning-with-files** — 3 文件持久化 + Hooks 注意力操控 + 会话恢复
- **测试领域知识** — 需求解析、用例生成、自动化脚本、测试分析

**核心功能：** AI 驱动的软件测试助手，覆盖完整测试生命周期：需求解析、需求关联分析、功能测试用例生成、自动化脚本生成和测试报告。
**目标用户：** 使用 Playwright 进行 Web E2E 测试的 JavaScript/TypeScript 开发者。

***

## 核心设计原则

### 原则一：需求优先

> **在生成任何测试之前，必须先理解需求。**

大型需求文档（markdown 文件、PRD、规范说明）在任何测试生成之前必须被解析和分析。模糊或不清晰的需求会触发澄清对话。

### 原则二：文件即记忆

> **上下文窗口 = 内存（易失、有限），文件系统 = 磁盘（持久、无限）。**

借鉴 planning-with-files 的核心哲学：所有重要信息必须写入磁盘文件。每个阶段的输入和输出都落盘为本地 Markdown 文件，保持全程可追溯。Agent 不依赖上下文记忆，而是依赖持久化文件作为工作记忆。

### 原则三：两阶段测试生成

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────────────┐
│  功能测试用例    │ ──▶ │      确认环节         │ ──▶ │     自动化脚本           │
│  (人工可读)      │     │    (用户确认)         │     │  (自动化 + 人工标记)     │
└─────────────────┘     └──────────────────────┘     └─────────────────────────┘
```

**阶段一：功能测试用例（人工用例）**

- 从需求生成人工可读的测试用例
- 不涉及自动化，仅包含测试步骤和预期结果
- 重点关注完整性：测试什么，而非如何自动化

**阶段二：自动化脚本**

- 仅在功能测试用例确认后开始
- 生成 Playwright E2E 测试代码
- **为每个测试用例标记：**
  - `automatable` - 可完全自动化
  - `partial` - 部分可自动化，需人工介入
  - `manual` - 需人工执行

### 原则四：独立审查，不自证清白

> **每个阶段的产出必须经过独立的 test-reviewer agent 审查，而非由生成 skill 自己验证自己。**

生成器负责"创造"，审查器负责"质检"。这两个角色必须分离。

### 原则五：人工介入门禁

```
需求 → 解析 → [发现模糊?] → 澄清 ─┐
                                  │
         ┌────────────────────────┘
         ▼
关联分析 ──▶ 用户确认 ──▶ 功能用例 ──▶ 审查 ──▶ 用户确认
                                                    │
                                                    ▼
                                  自动化脚本 ──▶ 带标记的输出
```

***

## 插件架构

### 架构总览

```
supertester/
├── .claude-plugin/                    # Claude Code 插件元数据
│   ├── plugin.json                    # 插件清单
│   └── marketplace.json               # marketplace 发布配置
│
├── hooks/                             # Hooks 注意力操控系统
│   ├── hooks.json                     # 5 个 hook 配置
│   ├── session-start                  # 注入 using-supertester + 恢复上下文
│   ├── user-prompt-submit             # 每次消息注入当前阶段上下文
│   ├── pre-tool-use                   # Write/Edit 前重温目标
│   ├── post-tool-use                  # Write/Edit 后提醒更新进度
│   ├── stop                           # 验证所有阶段完成度
│   └── run-hook.cmd                   # Windows 兼容脚本
│
├── skills/                            # 7 个 Skill（核心测试工作流）
│   ├── using-supertester/
│   │   └── SKILL.md                   # 入口 skill：触发规则 + 3 文件模式 + skill 索引
│   ├── requirement-analysis/
│   │   ├── SKILL.md                   # 需求解析 + 澄清（含暂停/恢复）
│   │   └── clarification-patterns.md  # 模糊需求识别模式参考
│   ├── requirement-association/
│   │   └── SKILL.md                   # 模块依赖 + 隐含需求 + 跨模块场景
│   ├── test-case-generation/
│   │   ├── SKILL.md                   # 智能编排 + 8 子生成器 + 去重
│   │   └── generator-reference.md     # 子生成器详细参考
│   ├── automation-analysis/
│   │   └── SKILL.md                   # 自动化可行性分析 + 标记
│   ├── automation-scripting/
│   │   ├── SKILL.md                   # Playwright 代码生成
│   │   └── playwright-patterns.md     # Playwright 最佳实践参考
│   └── test-reporting/
│       ├── SKILL.md                   # 报告生成
│       └── report-template.md         # 报告模板
│
├── agents/                            # 独立审查 Agent
│   └── test-reviewer.md              # 测试用例/脚本审查 agent
│
├── templates/                         # 3 文件持久化模板
│   ├── test_plan.md                   # 测试计划模板（含 6 阶段）
│   ├── findings.md                    # 发现记录模板
│   └── progress.md                    # 进度日志模板
│
├── scripts/                           # 辅助脚本
│   ├── init-session.sh                # 初始化 .supertester/ 目录
│   ├── init-session.ps1               # Windows 版本
│   └── session-catchup.py             # 会话恢复（跨 session 续接）
│
├── CLAUDE.md                          # 插件级说明
├── AGENTS.md                          # Agent 说明
├── package.json                       # 零依赖
└── README.md                          # 使用文档
```

### 技术选型理由

| 决策    | 选择                               | 理由                                              |
| ----- | -------------------------------- | ----------------------------------------------- |
| 插件模式  | Superpowers 风格（纯 Markdown Skill） | 零依赖、面向 Claude Code、开发快                          |
| 持久化模式 | planning-with-files 3 文件模式       | 经过 96.7% pass rate 验证、会话恢复可靠、防目标漂移              |
| 行为控制  | Iron Law + Hard Gate + Red Flags | Superpowers 验证过的 prompt 级行为塑造，无需代码              |
| 质量保证  | 独立 test-reviewer agent           | 生成与审查分离，避免"自证清白"                                |
| 自动化框架 | Playwright                       | 目标用户为 Web E2E 测试的 JS/TS 开发者                     |

***

## 文件持久化体系

### 核心哲学

借鉴 Manus/planning-with-files 的上下文工程原则：

```
上下文窗口 = 内存 (volatile, limited)
文件系统    = 磁盘 (persistent, unlimited)
→ 任何重要信息必须写入磁盘
```

### 3 文件工作记忆

在项目目录下创建 `.supertester/` 目录，包含 3 个核心文件 + 阶段输出文件：

#### 文件一：`test_plan.md` — 阶段追踪与决策记录

**用途：** 测试工作的路线图和进度追踪器。

**关键内容：**

- 目标：一句话描述最终状态
- 当前阶段：哪个阶段正在进行
- 6 个阶段的状态：`pending` → `in_progress` → `complete`
- 关键决策：每个技术/设计选择及其理由
- 错误记录：每个错误及其尝试次数和解决方案

**更新时机：**

- 开始任务时（首先创建此文件）
- 完成每个阶段时（更新状态）
- 做出重要决策时（记录 Decision）
- 遇到错误时（记录 Error + 尝试次数）

#### 文件二：`findings.md` — 研究发现与知识库

**用途：** 分析过程中的外部记忆，记录所有发现。

**关键内容：**

- 需求分析发现：从需求文档中提取的关键信息
- 模块关联发现：模块依赖、隐含需求
- 用例生成发现：子生成器选择理由、去重决策
- 技术决策：架构和实现选择

**关键规则 — 2-Action Rule：**

> 每执行 2 个分析/搜索/浏览操作后，**必须**立即更新 findings.md。这防止了多模态信息在上下文重置时丢失。

**安全边界：** 仅将外部/不可信内容写入 findings.md，不写入 test\_plan.md。

#### 文件三：`progress.md` — 会话日志与测试结果

**用途：** 按时间线记录做了什么。

**关键内容：**

- 会话元数据（日期、时间戳）
- 每个阶段的详细操作日志
- 创建/修改的文件列表
- 审查结果记录
- 错误日志（带时间戳）

**5 问题重启测试：** 如果能回答以下 5 个问题，说明上下文管理到位：

```
1. 我在哪里？      → test_plan.md 中的当前阶段
2. 我要去哪里？    → 剩余阶段
3. 目标是什么？    → test_plan.md 中的目标声明
4. 我发现了什么？  → findings.md
5. 我做了什么？    → progress.md
```

### 阶段输出文件

除 3 个核心文件外，每个阶段的产出也持久化为独立文件：

```
项目目录/
├── .supertester/                           # 测试工作流持久化目录
│   ├── test_plan.md                        # [核心] 阶段追踪 + 决策 + 错误
│   ├── findings.md                         # [核心] 研究发现 + 知识库
│   ├── progress.md                         # [核心] 会话日志 + 审查结果
│   │
│   ├── requirements/                       # Phase 1-2 输出
│   │   ├── parsed-requirements.md          # 结构化需求树
│   │   ├── clarifications.json             # 澄清会话状态（支持暂停/恢复）
│   │   ├── module-dependencies.md          # 模块依赖图
│   │   ├── implicit-requirements.md        # 隐含需求列表
│   │   └── cross-module-scenarios.md       # 跨模块场景
│   │
│   ├── test-cases/                         # Phase 3-4 输出
│   │   ├── functional-cases.md             # 功能测试用例（人工可读）
│   │   ├── automation-analysis.md          # 自动化可行性标记
│   │   └── deduplication-report.md         # 去重报告
│   │
│   ├── scripts/                            # Phase 5 输出
│   │   ├── *.spec.ts                       # Playwright 自动化脚本
│   │   └── manual-cases.md                 # 仅人工执行的用例
│   │
│   ├── reviews/                            # test-reviewer 审查记录
│   │   └── review-<phase>-<timestamp>.md   # 每次审查的详细记录
│   │
│   └── reports/                            # Phase 6 输出
│       └── YYYY-MM-DD-<module>.md          # 最终测试报告
```

### 阶段间可追溯链

每个产物都携带上游溯源 ID，形成完整追溯链：

```
需求文档 (requirements/*.md)
    │  来源: 用户提供的原始文档
    │  记录到: findings.md
    ▼
parsed-requirements.md (需求ID: F-001, F-002...)
    │  来源: 需求文档行号
    │  记录到: test_plan.md Phase 1 decisions
    ▼
clarifications.json (澄清ID: CL-001, CL-002...)
    │  来源: F-xxx 的模糊项
    │  记录到: progress.md 澄清日志
    ▼
cross-module-scenarios.md (场景ID: CMS-001...)
    │  来源: F-xxx 的模块依赖分析
    │  记录到: findings.md 关联发现
    │  审查: test-reviewer → reviews/review-association-*.md
    ▼
functional-cases.md (用例ID: TC-001, 溯源: F-001 行45-48)
    │  来源: F-xxx + CMS-xxx + IR-xxx
    │  记录到: test_plan.md Phase 3 decisions
    │  审查: test-reviewer → reviews/review-testcases-*.md
    ▼
automation-analysis.md (TC-001 → automatable)
    │  来源: TC-xxx 的可行性分析
    │  记录到: progress.md 分析日志
    ▼
*.spec.ts (代码注释: // TC-001 | F-001)
    │  来源: TC-xxx + 自动化标记
    │  审查: test-reviewer → reviews/review-scripts-*.md
    ▼
report.md (完整追溯链: 需求 → 用例 → 脚本)
```

***

## Hooks 注意力操控系统

### 设计哲学

借鉴 planning-with-files 的核心洞察：**通过 hooks 在关键时刻将目标文件重新注入 agent 的注意力窗口，防止在大量工具调用后发生目标漂移。**

### Hook 配置

```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "startup|clear|compact",
      "hooks": [{
        "type": "command",
        "command": "session-start",
        "timeout": 10000,
        "async": false
      }]
    }],
    "UserPromptSubmit": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "user-prompt-submit",
        "timeout": 5000,
        "async": false
      }]
    }],
    "PreToolUse": [{
      "matcher": "Write|Edit|Bash",
      "hooks": [{
        "type": "command",
        "command": "pre-tool-use",
        "timeout": 5000,
        "async": false
      }]
    }],
    "PostToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{
        "type": "command",
        "command": "post-tool-use",
        "timeout": 5000,
        "async": false
      }]
    }],
    "Stop": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "stop",
        "timeout": 10000,
        "async": false
      }]
    }]
  }
}
```

### Hook 行为详情

| Hook                 | 触发时机                | 文件操作         | 注入内容                                                              | 目的             |
| -------------------- | ------------------- | ------------ | ----------------------------------------------------------------- | -------------- |
| **SessionStart**     | 会话开始/clear/compact  | Read         | using-supertester skill + test\_plan.md 前 50 行 + progress.md 最近记录 | 恢复上下文、注入 skill |
| **UserPromptSubmit** | 每次用户发送消息            | Read         | test\_plan.md 当前阶段 + 当前阶段的 Iron Law                               | 防止目标漂移         |
| **PreToolUse**       | Write/Edit/Bash 执行前 | Read         | test\_plan.md 前 30 行（目标 + 当前阶段）                                   | 决策前重温目标        |
| **PostToolUse**      | Write/Edit 执行后      | Display      | "记得更新 progress.md 和阶段输出文件"                                        | 保持进度同步         |
| **Stop**             | Agent 尝试停止          | Read + Check | 检查 test\_plan.md 中所有阶段的 Status                                    | 防止过早退出         |

### Stop Hook 逻辑

```bash
# 读取 test_plan.md，计算阶段完成度
TOTAL=$(grep -c "### Phase" .supertester/test_plan.md)
COMPLETE=$(grep -cF "**Status:** complete" .supertester/test_plan.md)

if [ "$TOTAL" -eq "$COMPLETE" ]; then
  echo "All phases complete. Safe to stop."
else
  echo "WARNING: Only $COMPLETE/$TOTAL phases complete."
  echo "Incomplete phases found. Continue working or ask user to confirm early stop."
fi
```

***

## Skill 体系设计

### Skill 总览

| # | Skill                   | Iron Law       | 输入                                           | 输出文件                                                                        | 审查点           |
| - | ----------------------- | -------------- | -------------------------------------------- | --------------------------------------------------------------------------- | ------------- |
| 0 | using-supertester       | —              | 用户触发                                         | 初始化 .supertester/ 3 文件                                                      | —             |
| 1 | requirement-analysis    | 不理解需求不准测试      | 需求文档                                         | parsed-requirements.md, clarifications.json                                 | —             |
| 2 | requirement-association | 不分析关联不准生成用例    | parsed-requirements.md                       | module-dependencies.md, implicit-requirements.md, cross-module-scenarios.md | test-reviewer |
| 3 | test-case-generation    | 按特征选生成器，不盲目全调用 | 上述所有需求文件                                     | functional-cases.md, deduplication-report.md                                | test-reviewer |
| 4 | automation-analysis     | 未确认用例不准分析      | functional-cases.md（已确认）                     | automation-analysis.md                                                      | —             |
| 5 | automation-scripting    | 只为确认用例生成脚本     | functional-cases.md + automation-analysis.md | \*.spec.ts, manual-cases.md                                                 | test-reviewer |
| 6 | test-reporting          | —              | 全部阶段输出                                       | reports/YYYY-MM-DD-\*.md                                                    | —             |

### Skill 0：using-supertester（入口）

**触发条件：** SessionStart hook 自动注入

**职责：**

1. 检查 `.supertester/` 目录是否存在
   - 不存在 → 从 templates/ 初始化 3 个核心文件
   - 已存在 → 读取 test\_plan.md 恢复当前阶段
2. 根据用户意图路由到对应 skill
3. 告知用户可用的 skill 和触发方式

**意图路由：**

| 用户意图     | 触发 Skill                 | 示例                            |
| -------- | ------------------------ | ----------------------------- |
| 解析需求文档   | requirement-analysis     | "分析 requirements/auth-prd.md" |
| 继续澄清     | requirement-analysis（恢复） | "继续澄清"、"恢复 CL-002"            |
| 分析模块关联   | requirement-association  | "分析模块依赖"                      |
| 生成功能用例   | test-case-generation     | "生成登录模块的测试用例"                 |
| 分析自动化可行性 | automation-analysis      | "分析哪些可以自动化"                   |
| 生成自动化脚本  | automation-scripting     | "生成 Playwright 脚本"            |
| 生成报告     | test-reporting           | "生成测试报告"                      |
| 查询/问答    | 直接回答                     | "checkout 模块需要哪些测试？"          |

### Skill 1：requirement-analysis（需求解析与澄清）

**Iron Law：**

> **不理解需求，就不准生成任何测试。**
> 如果你还没有完成需求解析和澄清，你不能调用 test-case-generation skill。

**Hard Gate：**

```
<HARD-GATE>
在所有模糊项澄清完毕之前，不准进入 requirement-association 阶段。
这适用于所有需求文档，无论看起来多清晰。
</HARD-GATE>
```

**流程：**

```
需求文档
    │
    ▼
解析 Markdown → 提取模块/功能/验收标准/边界条件
    │
    ▼
检测模糊项 → [有模糊项?]
    │                │
    │ 无             │ 有
    ▼                ▼
写入 parsed-      发起澄清对话（一次一问，多选优先）
requirements.md       │
    │                │
    │                ▼ 每次交互后自动保存状态到 clarifications.json
    │                │
    │           [支持暂停/恢复]
    │                │
    │                ▼ 所有项澄清完毕
    │                │
    └────────────────┘
    │
    ▼
更新 test_plan.md Phase 1 → complete
更新 findings.md 需求发现
更新 progress.md 操作日志
```

**2-Action Rule 落地：**

- 解析了 2 个模块 → 立即写入 parsed-requirements.md
- 完成了 2 轮澄清 → 立即更新 clarifications.json

**澄清会话状态（clarifications.json）：**

```json
{
  "sessionId": "clarify-session-20260407-001",
  "requirementDoc": "requirements/auth-prd.md",
  "status": "in_progress",
  "createdAt": "2026-04-07T10:00:00Z",
  "updatedAt": "2026-04-07T14:30:00Z",
  "completedClarifications": [
    {
      "id": "CL-001",
      "relatedFeature": "F-001",
      "question": "最大登录尝试次数是多少？",
      "answer": "5次",
      "answeredAt": "2026-04-07T11:00:00Z"
    }
  ],
  "pendingClarifications": [
    {
      "id": "CL-002",
      "relatedFeature": "F-001",
      "question": "密码过期策略是什么？",
      "status": "pending",
      "options": ["90天", "180天", "永不过期"]
    }
  ],
  "pauseReason": "需要与后端团队确认密码过期策略"
}
```

**恢复机制：**

| 触发方式           | 行为                                                                     |
| -------------- | ---------------------------------------------------------------------- |
| 用户说"继续澄清"      | 读取最近的 clarifications.json，从 pendingClarifications 继续                   |
| 用户说"恢复 CL-002" | 恢复指定澄清项                                                                |
| 新会话启动          | SessionStart hook 检测到 clarifications.json 存在且 status != completed，提示用户 |

**Red Flags：**

| 如果你在想...      | 现实是...                   |
| ------------- | ------------------------ |
| "需求看起来很清楚"    | 每个需求都有隐藏的模糊项，做完检测才知道     |
| "跳过澄清直接生成"    | 违反 Iron Law，模糊需求生成的用例是浪费 |
| "用户催得急，先生成再说" | 返工成本远高于澄清成本              |
| "这个模糊项不影响测试"  | 你不是产品经理，让用户决定            |

**输出格式（parsed-requirements.md）：**

```markdown
# 需求解析结果

## 来源文档
- requirements/auth-prd.md (解析时间: 2026-04-07T10:00:00Z)

## 模块清单

### 模块：用户认证

#### F-001: 邮箱登录
- **描述：** 用户使用邮箱和密码登录系统
- **验收标准：**
  - 有效邮箱重定向到仪表板
  - 无效邮箱显示错误
- **边界条件：** 空邮箱, 格式无效, 密码错误
- **依赖：** 用户服务, 令牌服务
- **来源：** `requirements/auth-prd.md` 行 45-48

## 统计
- 总模块: 4
- 总功能: 12
- 总验收标准: 28
- 模糊项: 3 (已全部澄清)
```

### Skill 2：requirement-association（需求关联分析）

**Iron Law：**

> **不分析关联，就不准生成用例。**
> 单模块测试无法覆盖模块间的交互问题。必须先完成关联分析。

**Hard Gate：**

```
<HARD-GATE>
在用户确认关联分析结果之前，不准进入 test-case-generation 阶段。
</HARD-GATE>
```

**前置条件：** Phase 1 (requirement-analysis) 状态为 complete

**流程：**

```
parsed-requirements.md
    │
    ▼
模块依赖分析 → module-dependencies.md
    │  (显式依赖 + 隐式依赖 + 共享资源依赖)
    │
    ▼
隐含需求挖掘 → implicit-requirements.md
    │  (前置条件隐含 + 后置结果隐含 + 数据一致性隐含
    │   + 边界情况隐含 + 异常传导隐含)
    │
    ▼
跨模块场景生成 → cross-module-scenarios.md
    │  (关键路径 + 模块边界 + 错误传导 + 并发 + 数据同步)
    │
    ▼
→ test-reviewer agent 审查 → reviews/review-association-*.md
    │
    ▼
→ 用户确认
    │
    ▼
更新 test_plan.md Phase 2 → complete
```

**模块依赖输出格式（module-dependencies.md）：**

```markdown
# 模块依赖分析

## 依赖图

| 模块 | 类型 | 依赖 | 依赖类型 |
|------|------|------|---------|
| 用户认证 | core | 邮件服务, 令牌服务 | direct |
| 购物车 | core | 用户认证, 商品目录, 库存服务 | direct |
| 支付 | core | 购物车, 订单服务, 第三方支付 | workflow |

## 关键路径
1. 用户认证 → 商品目录 → 购物车 → 支付 → 订单
2. 用户认证 → 购物车 → 支付 → 通知
```

**隐含需求输出格式（implicit-requirements.md）：**

```markdown
# 隐含需求

| ID | 推断来源 | 隐含需求 | 类型 | 严重性 |
|----|---------|---------|------|--------|
| IR-001 | F-001: "登录后显示仪表板" | 未登录访问 /dashboard 应重定向到登录页 | security | high |
| IR-002 | F-005: "为保证订单完成" | 支付失败时订单保持待支付状态，允许重试 | error_handling | critical |
```

**跨模块场景输出格式（cross-module-scenarios.md）：**

```markdown
# 跨模块测试场景

## CMS-001: 完整购买流程（关键路径）

**场景类型：** critical_path
**涉及模块：** 用户认证, 商品目录, 购物车, 支付, 订单, 通知
**入口条件：** 用户已注册，有有效商品
**退出条件：** 订单完成，用户收到确认通知

| 步骤 | 模块 | 操作 | 预期结果 |
|------|------|------|---------|
| 1 | 用户认证 | 用户登录系统 | 获取有效会话 |
| 2 | 商品目录 | 浏览并搜索商品 | 返回商品列表 |
| 3 | 购物车 | 添加商品到购物车 | 购物车计数+1 |
| 4 | 支付 | 发起支付流程 | 跳转支付网关 |
| 5 | 订单 | 订单状态变更 | 状态变为已支付 |
| 6 | 通知 | 发送订单确认 | 邮件/短信通知 |

**溯源：** F-001, F-003, F-005, F-008
```

**Red Flags：**

| 如果你在想...   | 现实是...                  |
| ---------- | ----------------------- |
| "单模块够了"    | 80% 的生产 bug 发生在模块交互边界   |
| "不需要跨模块测试" | 用户流程天然跨模块，不测就是盲区        |
| "关联分析太慢了"  | 发现隐含需求比事后修 bug 便宜 100 倍 |

### Skill 3：test-case-generation（功能用例生成）

**Iron Law：**

> **按需求特征选择生成器，不盲目全部调用。**
> 每个需求先分析特征，再决定调用哪些子生成器。

**Hard Gate：**

```
<HARD-GATE>
在用户确认功能用例之前，不准进入 automation-analysis 阶段。
用例未经 test-reviewer 审查之前，不准提交给用户确认。
</HARD-GATE>
```

**前置条件：** Phase 2 (requirement-association) 状态为 complete

**核心流程：**

```
已确认的需求 + 关联分析结果
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                   需求特性分析器                            │
│         (分析需求类型 → 决定调用哪些生成器)                   │
└────────────────────────────┬────────────────────────────────┘
                             │
         ┌───────────────────┴───────────────────┐
         │         按需调用合适的生成器            │
         ▼                    ▼                    ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  仅 API/函数    │ │  有状态机特征   │ │  复杂业务规则   │
│  → 等价类+边界值 │ │  → 状态转换    │ │  → 决策表       │
│                 │ │    + 场景流    │ │    + 等价类     │
└─────────────────┘ └─────────────────┘ └─────────────────┘
         │                    │                    │
         └────────────────────┴────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │     去重引擎    │
                    └─────────────────┘
                              │
                              ▼
              → test-reviewer agent 审查
                              │
                              ▼
                    → 用户确认
```

**需求类型 → 生成器映射：**

| 需求类型     | 必需生成器    | 可选生成器    |
| -------- | -------- | -------- |
| API/函数   | 等价类、边界值  | 异常场景     |
| 工作流/业务流程 | 场景流、异常场景 | 等价类、边界值  |
| 状态机模块    | 状态转换、场景流 | 边界值、异常场景 |
| 复杂业务规则   | 决策表、等价类  | 边界值、安全测试 |
| 安全敏感模块   | 安全测试、等价类 | 异常场景、边界值 |
| 性能关键模块   | 性能测试、场景流 | 边界值      |

**8 个子生成器：**

| # | 生成器     | 适用场景            | 输出类型                              |
| - | ------- | --------------- | --------------------------------- |
| 1 | 等价类生成器  | 输入验证、参数校验       | positive/negative 分区              |
| 2 | 边界值生成器  | 数值/字符串/集合边界     | 边界值用例                             |
| 3 | 异常场景生成器 | 网络/系统/数据/安全错误   | 异常流程用例                            |
| 4 | 状态转换生成器 | 有限状态机模块         | 状态转换用例                            |
| 5 | 场景流生成器  | 单模块内的端到端流程      | happy/alternative/error\_recovery |
| 6 | 决策表生成器  | 复杂业务规则、多条件组合    | 条件组合用例                            |
| 7 | 安全测试生成器 | 注入、认证、会话、API 安全 | OWASP 分类用例                        |
| 8 | 性能测试生成器 | 负载、压力、持久性、峰值    | 性能指标用例                            |

**去重引擎：**

```
去重策略:
- exact_duplicate: 相同输入、相同预期
- subset_duplicate: 一个用例完全覆盖另一个
- redundant_boundary: 边界值与等价类冗余
- overlapping_state: 状态转换已被场景流覆盖

合并规则:
- 边界值 + 等价类冗余 → 保留边界值
- 异常场景覆盖正常场景 → 保留异常场景
```

**用例输出格式（functional-cases.md）：**

```markdown
# 功能测试用例

## 生成统计
- 原始用例数: 45
- 去重后: 28
- 去重详情见: deduplication-report.md

---

## TC-001: 有效邮箱登录
**模块：** 用户认证
**功能：** F-001 邮箱登录
**生成器：** 等价类（正向）

### 前置条件
- 用户已注册邮箱 test@example.com
- 用户知道正确密码

### 测试步骤
1. 导航到 /login
2. 在邮箱字段输入 "test@example.com"
3. 在密码字段输入 "CorrectPassword123"
4. 点击"登录"按钮

### 预期结果
- 用户重定向到 /dashboard
- 显示"欢迎回来！"消息

### 需求溯源
| 来源文件 | 行号 | 原始需求文本 |
|----------|------|-------------|
| `requirements/auth-prd.md` | 45-48 | "用户应能使用邮箱和密码登录系统" |
```

**Red Flags：**

| 如果你在想...       | 现实是...                           |
| -------------- | -------------------------------- |
| "先生成再说"        | 不分析特征就全调用所有生成器 = 大量冗余用例          |
| "全部调用所有生成器最安全" | 违反 Iron Law，浪费用户审核时间             |
| "去重不重要"        | 重复用例降低用户信任度                      |
| "跳过审查直接给用户"    | 违反 Hard Gate，test-reviewer 必须先审查 |

### Skill 4：automation-analysis（自动化可行性分析）

**Iron Law：**

> **未经用户确认的用例不准分析自动化可行性。**

**前置条件：** Phase 3 (test-case-generation) 状态为 complete，且用户已确认用例

**自动化等级判断标准：**

| 等级            | 标准                   | 示例               |
| ------------- | -------------------- | ---------------- |
| `automatable` | 所有步骤可自动化，无需视觉/人工验证   | API 调用、表单提交、页面跳转 |
| `partial`     | 核心步骤可自动化，但需人工设置或最终验证 | 需要视觉验证的 UI 元素    |
| `manual`      | 需人工观察、物理设备或复杂设置      | 邮件内容验证、物理设备交互    |

**输出格式（automation-analysis.md）：**

```markdown
# 自动化可行性分析

## 统计
- 总用例: 28
- automatable: 18 (64%)
- partial: 7 (25%)
- manual: 3 (11%)

## 详细分析

| 用例ID | 名称 | 等级 | 理由 | 可自动化部分 | 需人工部分 |
|--------|------|------|------|-------------|-----------|
| TC-001 | 有效邮箱登录 | automatable | 全部步骤可通过 Playwright 模拟 | 步骤 1-4 | — |
| TC-015 | 视觉元素验证 | partial | 页面跳转可自动化，视觉验证需人工 | 步骤 1-3 | 步骤 4: 视觉验证 |
| TC-020 | 邮件通知验证 | manual | 需要实际收到邮件并验证内容 | — | 全部 |
```

### Skill 5：automation-scripting（自动化脚本生成）

**Iron Law：**

> **只为已确认且标记为 automatable/partial 的用例生成脚本。**

**Hard Gate：**

```
<HARD-GATE>
manual 用例不生成代码，只生成文档化的执行步骤到 manual-cases.md。
生成的脚本必须经过 test-reviewer 审查后才能输出给用户。
</HARD-GATE>
```

**前置条件：** Phase 4 (automation-analysis) 状态为 complete

**生成规则：**

1. `automatable` 用例 → 完整 Playwright 测试代码
2. `partial` 用例 → 自动化部分代码 + `// HUMAN VERIFICATION NEEDED` 注释
3. `manual` 用例 → manual-cases.md 中的详细执行步骤

**代码规范：**

- 每个测试文件对应一个模块
- 使用 Page Object 模式
- 每个 test 注释标记溯源：`// TC-001 | F-001 | auth-prd.md:45-48`
- Arrange-Act-Assert 结构
- 合理使用 data-testid 选择器

**Playwright 脚本示例：**

```typescript
// auth.e2e.spec.ts
// 模块: 用户认证
// 生成时间: 2026-04-07
// 来源: functional-cases.md

import { test, expect } from '@playwright/test';

// TC-001 | F-001 | auth-prd.md:45-48
test('should login with valid email', async ({ page }) => {
  // Arrange
  await page.goto('/login');

  // Act
  await page.fill('[data-testid="email-input"]', 'test@example.com');
  await page.fill('[data-testid="password-input"]', 'CorrectPassword123');
  await page.click('[data-testid="login-btn"]');

  // Assert
  await expect(page).toHaveURL('/dashboard');
  await expect(page.locator('[data-testid="welcome-msg"]')).toContainText('欢迎回来');
});

// TC-015 | F-001 | auth-prd.md:52
test('should display welcome elements after login', async ({ page }) => {
  // Automated part
  await page.goto('/login');
  await page.fill('[data-testid="email-input"]', 'test@example.com');
  await page.fill('[data-testid="password-input"]', 'password123');
  await page.click('[data-testid="login-btn"]');
  await expect(page).toHaveURL('/dashboard');

  // HUMAN VERIFICATION NEEDED:
  // - Verify "Welcome back, User!" message styling is correct
  // - Check dashboard layout renders without visual glitches
  // - Confirm notification bell icon appears in correct position
});
```

### Skill 6：test-reporting（测试报告生成）

**前置条件：** Phase 5 (automation-scripting) 状态为 complete

**报告内容结构：**

```markdown
# 测试报告: [模块名]

## 执行摘要
- 生成日期: YYYY-MM-DD
- 需求文档: requirements/xxx.md
- 总用例数: N
- 自动化率: X%

## 需求覆盖
| 需求ID | 名称 | 关联用例数 | 覆盖状态 |
|--------|------|-----------|---------|
| F-001 | 邮箱登录 | 5 | 完整覆盖 |

## 功能测试用例摘要
[按模块分组的用例列表]

## 自动化分析
| 等级 | 数量 | 占比 |
|------|------|------|
| automatable | N | X% |
| partial | N | X% |
| manual | N | X% |

## 跨模块场景
[跨模块测试场景列表]

## 自动化脚本
[脚本文件列表及对应用例映射]

## 人工测试用例
[仅人工执行的用例列表]

## 追溯矩阵
[需求 → 用例 → 脚本 的完整映射]
```

**输出位置：** `.supertester/reports/YYYY-MM-DD-<module>.md`

***

## test-reviewer Agent

### 设计理念

> **生成器负责"创造"，审查器负责"质检"。两个角色必须分离。**

test-reviewer 是一个独立的审查 agent，不依赖任何生成 skill，从审查者的角度独立评估产出物质量。

### 审查触发点

| 阶段      | 审查对象   | 审查文件                                                | 审查记录                             |
| ------- | ------ | --------------------------------------------------- | -------------------------------- |
| Phase 2 | 需求关联分析 | cross-module-scenarios.md, implicit-requirements.md | reviews/review-association-\*.md |
| Phase 3 | 功能测试用例 | functional-cases.md                                 | reviews/review-testcases-\*.md   |
| Phase 5 | 自动化脚本  | \*.spec.ts                                          | reviews/review-scripts-\*.md     |

### 审查协议

```markdown
# test-reviewer 审查协议

## 输入
- 被审查的阶段输出文件
- parsed-requirements.md（作为需求基准）
- test_plan.md（了解上下文和决策）

## 审查维度

### 1. 需求覆盖审查（Phase 2, 3）
- 每个需求(F-xxx)是否都有对应的测试用例?
- 隐含需求(IR-xxx)是否被覆盖?
- 跨模块场景(CMS-xxx)是否完整?

### 2. 用例质量审查（Phase 3）
- 前置条件是否明确可执行?
- 测试步骤是否清晰无歧义?
- 预期结果是否可验证?
- 需求溯源是否准确?
- 子生成器选择是否合理?
- 去重是否彻底?

### 3. 脚本质量审查（Phase 5）
- 代码是否可运行（无语法错误）?
- 是否遵循 Playwright 最佳实践?
- 选择器策略是否稳定 (data-testid > CSS)?
- Arrange-Act-Assert 结构是否清晰?
- 溯源注释是否完整（TC-xxx | F-xxx）?
- partial 用例的 HUMAN VERIFICATION 标记是否准确?

## 输出格式

### 审查结果分类
- CRITICAL: 必须修复，阻塞进入下一阶段
- HIGH: 应该修复，影响质量
- MEDIUM: 建议修复，改善体验
- LOW: 可选优化

### 审查记录格式
见 reviews/review-<phase>-<timestamp>.md
```

### 审查验证循环

```
生成 skill 输出产物
    │
    ▼
test-reviewer 审查
    │
    ├── CRITICAL issues found?
    │       │
    │       ├── YES → 生成 skill 修复 → 重新审查 (循环)
    │       │
    │       └── NO → 继续
    │
    ├── HIGH issues found?
    │       │
    │       ├── YES → 生成 skill 修复 → 重新审查 (循环)
    │       │
    │       └── NO → 继续
    │
    ▼
审查通过 → 提交给用户确认
```

**3-Strike 升级协议：**

```
审查修复循环:
  第 1 次: 修复 CRITICAL/HIGH issues，重新审查
  第 2 次: 换用不同方法修复，重新审查
  第 3 次: 停止，将问题和所有尝试记录到 test_plan.md Errors 表
          → 请用户介入决策

→ 所有尝试记录到 test_plan.md 的 Errors 表
→ 所有审查记录保存到 reviews/ 目录
```

***

## 错误处理与恢复

### 3-Strike Error Protocol

```
ATTEMPT 1: 诊断 & 修复
  → 仔细阅读错误，识别根因，应用针对性修复

ATTEMPT 2: 换方法
  → 同样的错误？尝试不同的方法/工具/策略
  → 绝不重复完全相同的失败操作

ATTEMPT 3: 更广泛地反思
  → 质疑假设，搜索解决方案，更新计划

3 次失败后: 升级
  → 解释尝试了什么，分享错误，请求用户指导
```

### Never Repeat Failures

```
if action_failed:
    next_action != same_action
    record_attempt_in(test_plan.md)
```

### 错误场景处理

| 错误场景       | 处理方式                                       |
| ---------- | ------------------------------------------ |
| 需求文档未找到    | 提示用户提供正确路径，记录到 progress.md                 |
| 未找到可测试项    | 报告并建议改进文档格式，记录到 findings.md                |
| 模糊项过多（>10） | 按模块分组，分批澄清，每批 ≤3 问                         |
| 未检测到测试框架   | 提示用户指定或通过 package.json 自动检测                |
| 生成质量不达标    | 进入审查修复循环（3-Strike）                         |
| 会话中断       | session-catchup.py 自动恢复，从 test\_plan.md 续接 |
| 配置无效       | 使用默认值，警告用户                                 |

***

## 用户交互模式

### 模式一：完整流程（需求到报告）

```
用户: 分析 requirements/auth-prd.md 并生成测试
  → [Skill 0] 初始化 .supertester/
  → [Skill 1] 解析需求 → 澄清模糊项 → parsed-requirements.md
  → [Skill 2] 关联分析 → test-reviewer 审查 → 用户确认
  → [Skill 3] 生成用例 → test-reviewer 审查 → 用户确认
  → [Skill 4] 自动化分析 → automation-analysis.md → 用户确认
  → [Skill 5] 生成脚本 → test-reviewer 审查 → *.spec.ts
  → [Skill 6] 生成报告 → reports/2026-04-07-auth.md
```

### 模式二：从中间阶段开始

```
用户: 为已有的功能用例生成自动化脚本
  → [Skill 0] 检测 .supertester/test-cases/functional-cases.md 存在
  → [Skill 4] 自动化分析
  → [Skill 5] 生成脚本
```

### 模式三：恢复中断的会话

```
用户: (新会话)
  → [SessionStart Hook] 检测到 .supertester/ 存在
  → 读取 test_plan.md：Phase 2 in_progress
  → 提示: "检测到未完成的测试任务，当前在 Phase 2（需求关联分析）。继续？"
  → 用户: 继续
  → [Skill 2] 从断点恢复
```

### 模式四：问答查询

```
用户: checkout 模块需要哪些测试？
  → 直接回答，参考 .supertester/ 中已有的分析结果
  → 不触发完整流程
```

***

## 功能需求

### FR-1: 需求解析

| ID     | 需求                                   | 优先级 |
| ------ | ------------------------------------ | --- |
| FR-1.1 | 解析包含多个模块的大型 markdown 文件              | 必须  |
| FR-1.2 | 提取功能、验收标准、边界条件                       | 必须  |
| FR-1.3 | 构建结构化需求树并持久化到 parsed-requirements.md | 必须  |
| FR-1.4 | 识别不清晰/模糊的项                           | 必须  |
| FR-1.5 | 支持多种需求格式                             | 应该  |

### FR-2: 需求澄清

| ID     | 需求                          | 优先级 |
| ------ | --------------------------- | --- |
| FR-2.1 | 检测模糊需求                      | 必须  |
| FR-2.2 | 生成有针对性的澄清问题                 | 必须  |
| FR-2.3 | 尽可能支持多选答案                   | 应该  |
| FR-2.4 | 记录澄清内容到 clarifications.json | 必须  |
| FR-2.5 | 支持澄清会话暂停与恢复                 | 必须  |

### FR-3: 需求关联分析

| ID     | 需求                                         | 优先级 |
| ------ | ------------------------------------------ | --- |
| FR-3.1 | 分析模块间的依赖关系，持久化到 module-dependencies.md     | 必须  |
| FR-3.2 | 从需求文本中挖掘隐含需求，持久化到 implicit-requirements.md | 必须  |
| FR-3.3 | 生成跨模块场景，持久化到 cross-module-scenarios.md     | 必须  |
| FR-3.4 | 经过 test-reviewer 审查                        | 必须  |
| FR-3.5 | 用户确认后才能进入下一阶段                              | 必须  |

### FR-4: 功能测试用例生成

| ID     | 需求                       | 优先级 |
| ------ | ------------------------ | --- |
| FR-4.1 | 生成人工可读的测试用例              | 必须  |
| FR-4.2 | 包含前置条件、步骤、预期结果           | 必须  |
| FR-4.3 | 按需求特征智能选择子生成器            | 必须  |
| FR-4.4 | 支持 8 种子生成器               | 必须  |
| FR-4.5 | 对生成的测试用例去重               | 必须  |
| FR-4.6 | 每个用例包含需求溯源（文件+行号）        | 必须  |
| FR-4.7 | 经过 test-reviewer 审查      | 必须  |
| FR-4.8 | 持久化到 functional-cases.md | 必须  |

### FR-5: 自动化可行性分析

| ID     | 需求                             | 优先级 |
| ------ | ------------------------------ | --- |
| FR-5.1 | 分析每个测试用例的自动化潜力                 | 必须  |
| FR-5.2 | 分类为 automatable/partial/manual | 必须  |
| FR-5.3 | 解释分类原因                         | 必须  |
| FR-5.4 | 持久化到 automation-analysis.md    | 必须  |

### FR-6: 自动化脚本生成

| ID     | 需求                            | 优先级 |
| ------ | ----------------------------- | --- |
| FR-6.1 | 生成 Playwright 代码（Web E2E）     | 必须  |
| FR-6.2 | 遵循项目约定的模式和规范                  | 必须  |
| FR-6.3 | 应用 Page Object 模式             | 必须  |
| FR-6.4 | 在代码注释中标记溯源（TC-xxx \| F-xxx）   | 必须  |
| FR-6.5 | 分离 manual 用例到 manual-cases.md | 必须  |
| FR-6.6 | 经过 test-reviewer 审查           | 必须  |

### FR-7: 报告生成

| ID     | 需求               | 优先级 |
| ------ | ---------------- | --- |
| FR-7.1 | 生成 Markdown 报告文件 | 必须  |
| FR-7.2 | 包含完整追溯矩阵         | 必须  |
| FR-7.3 | 包含所有阶段的统计摘要      | 必须  |
| FR-7.4 | 持久化到 reports/ 目录 | 必须  |

### FR-8: 文件持久化与会话恢复

| ID     | 需求                             | 优先级 |
| ------ | ------------------------------ | --- |
| FR-8.1 | 自动创建 .supertester/ 目录和 3 个核心文件 | 必须  |
| FR-8.2 | 每个阶段的输出持久化到对应文件                | 必须  |
| FR-8.3 | 遵守 2-Action Rule               | 必须  |
| FR-8.4 | 支持跨会话恢复                        | 必须  |
| FR-8.5 | Stop hook 防止过早退出               | 必须  |

### FR-9: 独立审查

| ID     | 需求                                 | 优先级 |
| ------ | ---------------------------------- | --- |
| FR-9.1 | test-reviewer 独立审查 Phase 2/3/5 的产出 | 必须  |
| FR-9.2 | 审查结果分类为 CRITICAL/HIGH/MEDIUM/LOW   | 必须  |
| FR-9.3 | CRITICAL/HIGH 必须修复后重新审查            | 必须  |
| FR-9.4 | 审查记录持久化到 reviews/ 目录               | 必须  |
| FR-9.5 | 3-Strike 升级到用户                     | 必须  |

***

## 非功能需求

| ID    | 需求                 | 说明                                           |
| ----- | ------------------ | -------------------------------------------- |
| NFR-1 | 处理长达 10,000 行的需求文档 | 全面解析大型文档                                     |
| NFR-2 | 支持 monorepo 项目结构   | 多个 package.json 位置                           |
| NFR-3 | 零代码依赖              | 纯 Markdown skill + Bash 脚本                   |
| NFR-4 | 仅 Claude Code           | 单平台目标，无跨平台兼容负担                                  |
| NFR-5 | 所有阶段产出持久化到本地文件     | 可追溯、可审计                                      |
| NFR-6 | 对话状态持久化            | 支持会话中断和恢复                                    |
| NFR-7 | 会话恢复后从断点继续         | 不丢失任何已完成的工作                                  |
| NFR-8 | Hooks 自动注入上下文      | 防止 agent 目标漂移                                |

***

## Phase 1 范围外

- 测试执行编排 — 不执行测试，只生成用例和脚本
- CI/CD 集成 — 不做 CI/CD 集成
- 快照测试 — 不生成快照测试
- Mock 文件生成 — 不自动生成 mock 文件
- 代码覆盖率分析 — 独立功能，未来增强
- MCP Server — Phase 1 使用纯 prompt 控制，未来可加 MCP 做程序化校验

***

## 未来增强

- FR-10: MCP Server 增强（程序化阶段校验、覆盖率阈值检查）
- FR-11: 测试执行与失败分析
- FR-12: 性能分析（慢测试检测）
- FR-13: 变异测试集成
- FR-14: 属性测试（模糊测试）
- FR-15: 现有代码覆盖率缺口分析
- FR-16: 更多自动化框架支持（Cypress, Selenium）

***

## 附录

### A. 参考项目

| 项目                                                                      | 借鉴内容                                              |
| ----------------------------------------------------------------------- | ------------------------------------------------- |
| [Superpowers](https://github.com/obra/superpowers)                      | Skill 行为塑造模式：Iron Law, Hard Gate, Red Flags, 验证循环 |
| [planning-with-files](https://github.com/nickarino/planning-with-files) | 3 文件持久化, Hooks 注意力操控, 2-Action Rule, 会话恢复         |
| [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent)      | 架构参考（未采用，但指导了技术选型决策）                              |

### B. 参考技能

- `brainstorming` — 澄清优先方法、用户确认环节
- `systematic-debugging` — 3-Strike Error Protocol, 结构化分析方法
- `test-driven-development` — 测试用例质量标准, RED-GREEN 验证门
- `verification-before-completion` — 验证后才能声明完成
- `subagent-driven-development` — 两阶段审查循环（spec + quality）

