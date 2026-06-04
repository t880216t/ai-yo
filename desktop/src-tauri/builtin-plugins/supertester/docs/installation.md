# Supertester 安装指南

Supertester 是面向 Claude Code 的 AI 测试工作流插件，仅支持 Claude Code。

## 前置要求

- Claude Code CLI 已安装

## 安装方式

Claude Code 通过插件市场或直接从 git 仓库安装。

### 方式一：插件市场（推荐）

在 Claude Code 中先注册 marketplace：

```bash
/plugin marketplace add supertester-ai/supertester
```

然后从该 marketplace 安装插件：

```bash
/plugin install supertester@supertester
```

### 方式二：直接从 git 仓库安装

```bash
/plugin add https://github.com/supertester-ai/supertester.git
```

## 验证安装

```bash
/plugin list
```

确认 `supertester` 插件在列表中且已启用。

新开一个 Claude Code 会话，使用 supertester 工作流时会自动注入 `using-supertester` 上下文。

## 更新

```bash
/plugin update supertester
```

## 卸载

```bash
/plugin uninstall supertester
```

## 故障排除

**插件未显示**

```bash
/plugin update
/plugin list
```

**Hooks 没有触发**

1. 检查插件是否启用：`/plugin list`
2. 检查 Bash 是否可用（hook 脚本依赖 bash）
3. 重启 Claude Code

**找不到 `test-reviewer` agent**

通常表示插件没有完整安装。从 marketplace 重新安装，确保 `agents/` 被加载。

## 技能列表

| 技能名称 | 触发条件 | 用途 |
|---------|---------|------|
| `using-supertester` | 会话启动自动加载 | 入口 skill，初始化工作流 |
| `requirement-analysis` | 分析需求文档 | 解析需求 + 澄清模糊项 |
| `requirement-association` | 分析模块依赖 | 模块依赖 + 跨模块场景 |
| `test-case-generation` | 生成测试用例 | 功能测试用例生成 |
| `automation-analysis` | 分析自动化可行性 | 分类为 automatable/partial/manual |
| `automation-scripting` | 生成自动化脚本 | Playwright E2E 脚本生成 |
| `test-reporting` | 生成报告 | 聚合所有阶段输出 |

## 工作流程

```
需求文档
    │
    ▼
[Phase 1] requirement-analysis
    │  解析需求 → 澄清模糊项
    ▼
[Phase 2] requirement-association
    │  模块依赖 + 隐含需求 + 跨模块场景
    │  → test-reviewer 审查 → 用户确认
    ▼
[Phase 3] test-case-generation
    │  生成功能用例 → test-reviewer 审查 → 用户确认
    ▼
[Phase 4] automation-analysis
    │  分析自动化可行性 → 用户确认
    ▼
[Phase 5] automation-scripting
    │  生成 Playwright 脚本 → test-reviewer 审查
    ▼
[Phase 6] test-reporting
       生成最终测试报告
```

## 文件结构

Supertester 在项目目录下创建 `.supertester/` 目录：

```
.supertester/
├── test_plan.md              # 阶段追踪 + 决策 + 错误
├── findings.md              # 研究发现 + 知识库
├── progress.md              # 会话日志 + 时间戳
├── requirements/            # Phase 1-2 输出
│   ├── parsed-requirements.md
│   ├── clarifications.json
│   ├── module-dependencies.md
│   ├── implicit-requirements.md
│   └── cross-module-scenarios.md
├── test-cases/              # Phase 3-4 输出
│   ├── functional-cases.md
│   ├── automation-analysis.md
│   └── deduplication-report.md
├── scripts/                 # Phase 5 输出
│   ├── *.spec.ts
│   └── manual-cases.md
├── reviews/                 # 审查记录
│   └── review-*.md
└── reports/                # Phase 6 输出
    └── *.md
```

## 获取帮助

- 报告问题：https://github.com/supertester-ai/supertester/issues
- 主文档：https://github.com/supertester-ai/supertester
- Claude Code 文档：https://docs.anthropic.com/
