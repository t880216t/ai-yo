# Supertester Skill 自动迭代优化系统设计

## 1. 概述

### 1.1 问题

Supertester 插件的 skill 规则需要持续优化，当前流程是手动循环：用插件生成测试用例 → 对比人工参考用例 → 找到不足 → 修改 skill 规则 → 再次生成比较。每轮需要多次手动确认和下达指令，效率低。

### 1.2 目标

构建一个 Python 编排器，自动化"生成 → 对比打分 → 分析差距 → 修改 skill → 重新生成"的循环，直到生成结果在多维度评分上达到收敛阈值。用户只需审阅最终版本的 skill 文件和收敛报告。

### 1.3 核心约束

- **通用性**: skill 修改必须是"特性模式级"而非"业务实例级"，换成任何其他产品仍然适用
- **模块级迭代**: 按模块拆分迭代，而非整体，加快收敛速度并降低 token 消耗
- **三阶段全验证**: Phase 1 (需求解析)、Phase 2 (需求关联)、Phase 3 (用例生成) 都参与迭代验证，而非只迭代 Phase 3
- **双基准评分**: 同时参照人工参考用例(实践基准)和通用测试方法论(理论基准)评分
- **脚本驱动多会话**: 每个 Claude 调用是独立会话 (`claude -p`)，通过文件传递上下文，不受单会话 context 限制

### 1.4 输入

| 输入 | 路径 | 说明 |
|------|------|------|
| PRD | `E:/workspace/aise/geo-sass-re/requirements/VisiGEO-PRD.md` | 需求文档 |
| 人工参考用例 | `E:/workspace/aise/data/GEO_LV_2026.01_cases0326.json` | 65 cases, ~652 steps |
| 待优化 skills | `E:/workspace/aise/TestingAgent/skills/` | requirement-analysis, requirement-association, test-case-generation |
| 待优化 agent | `E:/workspace/aise/TestingAgent/agents/test-reviewer.md` | test-reviewer |

### 1.5 输出

- 优化后的 skill 文件 (原地修改 + 快照可回滚)
- `output/final-report.md` — 收敛报告，含每阶段/模块的迭代轨迹和最终评分
- `output/iteration-state.json` — 完整迭代日志

---

## 2. 架构

### 2.1 目录结构

```
E:/workspace/aise/TestingAgent/
├── scripts/
│   └── auto-iterate/
│       ├── orchestrator.py          # 主编排器
│       ├── config.py                # 配置：路径、阈值、维度权重
│       ├── splitter.py              # Phase 0: 按模块拆分 PRD + 参考用例
│       ├── scorer.py                # 调用 Claude 做结构化对比打分
│       ├── analyzer.py              # 调用 Claude 分析差距 + 输出 skill patch
│       ├── patcher.py               # 应用/回滚 skill 文件修改
│       ├── prompts/
│       │   ├── extract-baseline.md  # Phase 0: 反向提取验证基准
│       │   ├── generate-phase1.md   # Phase 1: 需求解析
│       │   ├── generate-phase2.md   # Phase 2: 需求关联
│       │   ├── generate-phase3.md   # Phase 3: 用例生成 (按模块)
│       │   ├── score.md             # 对比打分 (双基准，各阶段共用，维度参数化)
│       │   ├── analyze-and-patch.md # 差距分析 + patch 生成
│       │   ├── review-patch.md      # Patch 通用性审查
│       │   └── revise-patch.md      # Patch 修订 (审查未通过时)
│       └── output/
│           ├── modules/             # 按模块拆分后的输入
│           │   └── {module}/
│           │       ├── prd-slice.md
│           │       └── reference-cases.json
│           ├── baselines/           # Phase 0 提取的验证基准
│           │   ├── phase1-baseline.json
│           │   ├── phase2-baseline.json
│           │   └── phase3-baseline.json
│           ├── iterations/          # 每轮迭代产物
│           │   └── {phase-or-module}/
│           │       └── iter-{N}/
│           │           ├── ai-output.md
│           │           ├── score.json
│           │           ├── gaps.md
│           │           ├── patch.json
│           │           └── review.json
│           ├── skill-snapshots/     # 每次修改前的 skill 快照
│           ├── iteration-state.json # 全局状态 (支持断点恢复)
│           └── final-report.md      # 最终收敛报告
```

### 2.2 执行流程

```
orchestrator.py
  │
  ├─ Phase 0: 预处理 (一次性)
  │   ├─ splitter: PRD 按模块拆分
  │   ├─ splitter: 参考用例按 module_path 分组
  │   └─ claude -p extract-baseline.md: 反向提取三阶段验证基准
  │
  ├─ Phase 1 迭代: 需求解析
  │   for iter in range(max_iterations):
  │       ① claude -p "解析 PRD" → parsed-requirements.md
  │       ② claude -p score.md (phase1 维度) → score.json
  │       ③ if converged: break
  │       ④ claude -p analyze-and-patch.md → patch.json
  │       ④.5 claude -p review-patch.md → review.json
  │       ⑤ patcher: snapshot + apply
  │
  ├─ Phase 2 迭代: 需求关联
  │   (同 Phase 1 结构，评分维度不同，修改 requirement-association skill)
  │
  ├─ Phase 3 迭代: 按模块用例生成
  │   for module in modules:
  │       for iter in range(max_iterations):
  │           ① claude -p generate.md → ai-cases.md
  │           ② claude -p score.md (phase3 维度, 双基准) → score.json
  │           ③ if converged: break
  │           ④ claude -p analyze-and-patch.md → patch.json
  │           ④.5 claude -p review-patch.md → review.json
  │           ⑤ patcher: snapshot + apply
  │
  └─ Final: 全量生成 + 全量打分 + final-report.md
```

### 2.3 Claude CLI 调用方式

每个步骤通过 `claude -p` 调用独立会话:

```python
def claude_call(prompt, output, parse_json=False, model="sonnet", timeout=300):
    cmd = ["claude", "-p", "--model", model, "--output-format", "text", "--max-turns", "1"]
    result = subprocess.run(cmd, input=prompt, capture_output=True, text=True,
                            timeout=timeout, encoding='utf-8')
    response = result.stdout.strip()
    write_file(output, response)
    return extract_json(response) if parse_json else response
```

- prompt 通过 stdin 传入，避免命令行长度限制
- `--max-turns 1` 确保单轮执行
- 输出同时写入文件，支持断点恢复时跳过已完成步骤

---

## 3. 双基准评分模型

### 3.1 设计原则

单纯拟合人工用例会导致 skill 过度专业化。评分模型同时使用两个基准:

- **基准 A (实践基准)**: 人工参考用例 — AI 是否覆盖了人工写出的验证点
- **基准 B (理论基准)**: 通用测试方法论 — AI 是否运用了需求特性所要求的测试设计方法

基准 A 确保不遗漏业务深度，基准 B 确保方法论完备性。AI 覆盖了但人工没覆盖的验证点，在基准 B 中算正向得分。

### 3.2 Phase 1 评分维度 (需求解析)

| 维度 | 权重 | 基准 | 满分条件 |
|------|------|------|---------|
| 模块/功能点识别率 | 20% | A | 参考用例涉及的所有 module_path 在 parsed-requirements 中有对应 F-xxx |
| 内容资产提取率 | 15% | A | 参考用例中出现的文案/提示语/模板在资产清单中被标记 |
| 规则/枚举资产完整性 | 15% | A | 参考用例中的完整列表被完整保留而非截断 |
| 状态/数据资产识别率 | 10% | A | 涉及 DB 断言/额度变化/状态流转的被识别 |
| 证据类型标记率 | 10% | A | 每个 F-xxx 标记了正确的证据类型 |
| 特性标签覆盖率 | 10% | A | 6 类特性标签被正确标记 |
| 输入约束识别完整性 | 10% | B | 每个输入字段识别了类型/范围/格式/必填等约束 |
| 状态机识别率 | 10% | B | 涉及生命周期/流程的功能被标记为状态机类需求 |

### 3.3 Phase 2 评分维度 (需求关联)

| 维度 | 权重 | 基准 | 满分条件 |
|------|------|------|---------|
| 功能依赖覆盖率 | 15% | A | 参考用例中隐含的跨模块依赖被识别 |
| 中断恢复场景覆盖率 | 20% | A+B | 刷新/切换/重试场景在关联分析中出现 |
| 历史/列表交互覆盖率 | 15% | A+B | 排序/分页/空状态被识别为关联场景 |
| 隐含需求挖掘率 | 15% | A | PRD 未明确写出但参考用例覆盖的需求被发现 |
| PRD外业务识别率 | 10% | A | 运营逻辑等被标记为待澄清项 |
| 错误传播路径 | 15% | B | 模块 A 失败时对模块 B 的影响链被识别 |
| 并发/竞态风险 | 10% | B | 共享资源的并发访问风险被识别 |

### 3.4 Phase 3 评分维度 (用例生成，按模块)

| 维度 | 权重 | 基准 | 满分条件 |
|------|------|------|---------|
| 步骤级覆盖率 | 20% | A | 参考用例的每个 step 都能在 AI 用例中找到对应覆盖 |
| 内容保真度 | 15% | A | 需逐字段校验的地方写了具体内容而非"内容正确" |
| 过程态覆盖 | 10% | A+B | loading/进度/中间状态被独立测试 |
| 中断恢复覆盖 | 10% | A+B | 刷新/切换/退出等中断场景有对应用例 |
| 视觉资产标记 | 5% | A | 图片/Logo/样式类测试点标记为 manual/partial |
| 合约内容验证 | 10% | A+B | prompt/schema/模板作为合约逐项校验 |
| 等价类/边界值覆盖 | 10% | B | 输入类需求运用了等价类划分和边界值分析 |
| 异常/负向场景覆盖 | 10% | B | 覆盖了错误处理/异常路径/权限越界 |
| 状态转换完整性 | 5% | B | 涉及状态机的模块覆盖了合法+非法转换 |
| 测试设计方法适配度 | 5% | B | 为需求特性选择了正确的生成器/设计方法 |

### 3.5 维度内综合逻辑

```
对于同时有 A 和 B 基准的维度:
  dimension_score = max(A_score, B_score)  # 取高，鼓励 AI 超越人工

对于仅有 A 或仅有 B 的维度:
  dimension_score = 该基准的得分

总分 = sum(dimension_score × weight)
```

### 3.6 收敛标准

```python
CONVERGENCE = {
    "phase1": {
        "min_total_score": 0.80,
        "min_dimension_score": 0.60,
        "max_iterations": 4,
    },
    "phase2": {
        "min_total_score": 0.75,
        "min_dimension_score": 0.55,
        "max_iterations": 4,
    },
    "phase3": {
        "min_total_score": 0.85,
        "min_dimension_score": 0.65,
        "max_iterations": 5,
    },
}
```

达到 max_iterations 仍未收敛时: 停止该阶段/模块，记录未收敛维度和最高分，最终报告中标记为需人工介入。

---

## 4. 通用性防护机制

### 4.1 问题

参考用例来自 GEO SaaS 单一产品，但 skill 修改必须适用于任何业务。必须防止 patch 中出现过拟合的业务特定规则。

### 4.2 三层防护

#### 防护 1: Patch 生成 prompt 硬约束

在 `analyze-and-patch.md` 中写死:

```
## 通用性硬约束 (Iron Law)

你正在修改的是通用测试插件的 skill 规则，不是为当前产品写专用逻辑。

MUST:
- 规则必须是"特性模式级"，不能是"业务实例级"
- 正确: "当需求描述包含阶段性进度反馈时，必须为每个阶段生成独立验证步骤"
- 错误: "GEO检测的loading有5个阶段，需要逐一验证"

MUST NOT:
- 不得引用当前产品的业务术语 (GEO、VisiGEO、早鸟限免等)
- 不得硬编码具体数值、字段名、页面路径
- 不得添加只对当前需求有效的特殊分支

检验: "换成电商/社交/金融产品，这条规则还适用吗？"
```

#### 防护 2: Patch 自动审查

每次 patch 在 apply 前经过独立审查:

```
生成 patch → claude -p review-patch.md → verdict: PASS / REVISE
  如果 REVISE → claude -p revise-patch.md → 修订后的 patch (最多重试 2 次)
  如果仍 REVISE → 跳过本次 patch，记录到日志，继续下一轮迭代
```

审查清单:
1. 是否包含特定产品术语
2. 是否硬编码了具体数值/字段名/页面路径
3. 换一个完全不同的产品是否仍然成立
4. 是否与已有规则重复或矛盾
5. 修改粒度是否合适 (太细=过拟合，太粗=无效)

#### 防护 3: 抽象层级映射表

```python
ABSTRACTION_MAP = {
    "loading阶段文案未逐项验证": "process_feedback — 阶段性进度反馈需逐阶段验证",
    "运营模式未覆盖": "business_outside_prd — PRD外运营策略需主动澄清",
    "Logo/图片未测": "visual_asset — 视觉资产需标记为 manual/partial",
    "prompt模板未逐字段校验": "contract_content — 内容模板需作为合约逐项验证",
    "处理中刷新未测": "interruption_recovery — 处理中状态需测试中断恢复",
    "列表排序未测": "history_interaction — 列表需覆盖排序/分页/滚动/空状态",
}
```

此表引导 patch 生成将具体差距抽象到正确层级。表本身随迭代可补充，但始终保持"具体→通用"方向。

---

## 5. 差距分类

patch 生成时，差距分为三类，决定不同的处理方式:

| 类型 | 定义 | 处理 |
|------|------|------|
| 类型 1: 人工覆盖但 AI 遗漏 | 基准 A 差距 | 补强 skill 的触发→生成机制 |
| 类型 2: 方法论要求但 AI 遗漏 | 基准 B 差距 | 补强生成器选择策略或检查清单 |
| 类型 3: AI 覆盖但人工遗漏 | AI 增量价值 | 记录但不修改，作为 AI 优势项 |

修改优先级: 类型 1 > 类型 2。类型 3 不触发修改。

---

## 6. 状态管理与断点恢复

### 6.1 状态文件

```json
// output/iteration-state.json
{
    "started_at": "2026-04-12T10:00:00",

    "phase0_complete": true,

    "phase1_converged": true,
    "phase1_iterations": 2,
    "phase1_final_score": {"total": 0.83, "dimensions": {}},

    "phase2_converged": true,
    "phase2_iterations": 3,
    "phase2_final_score": {"total": 0.78, "dimensions": {}},

    "converged_modules": ["URL通用校验", "系统级异常提示"],
    "unconverged_modules": [],
    "current_module": "欧盟隐私政策弹窗",
    "current_iteration": 2,

    "history": {
        "phase1": [
            {"iter": 1, "score": 0.65, "patches_applied": 1},
            {"iter": 2, "score": 0.83, "patches_applied": 1}
        ],
        "URL通用校验": [
            {"iter": 1, "score": 0.62, "patches_applied": 1},
            {"iter": 2, "score": 0.87, "patches_applied": 1}
        ]
    }
}
```

### 6.2 恢复逻辑

`orchestrator.py` 启动时:
1. 检查 `output/iteration-state.json` 是否存在
2. 如果存在，加载状态，跳过已收敛的阶段/模块
3. 从 `current_module` + `current_iteration` 继续
4. 如果不存在，从 Phase 0 开始

### 6.3 Skill 快照与回滚

每次 apply patch 前，将当前 skills 目录完整快照到 `output/skill-snapshots/`:

```python
def snapshot(skill_dir, snapshot_dir):
    shutil.copytree(skill_dir, snapshot_dir, dirs_exist_ok=True)

def rollback(skill_dir, snapshot_dir):
    shutil.copytree(snapshot_dir, skill_dir, dirs_exist_ok=True)
```

---

## 7. Prompt 模板设计

### 7.1 `extract-baseline.md` — 基准提取

从人工参考用例反向提取三阶段验证基准。

输入: 参考用例 JSON + PRD

**注意: 参考用例文件约 95k tokens，可能超出单次 context 限制。**
处理策略: 按 module_path 分批调用，每批提取该模块的基准，最后合并为完整基准文件。

输出: `phase1-baseline.json`, `phase2-baseline.json`, `phase3-baseline.json`

Phase 1 基准提取:
- 从每个测试步骤中识别内容资产、规则/枚举资产、状态/数据资产、合约资产
- 识别应标记的特性标签

Phase 2 基准提取:
- 识别跨模块依赖、中断恢复场景、历史列表交互、隐含需求

Phase 3 基准提取:
- 按模块分组，每个模块的必须覆盖验证点清单
- 标记需要内容保真、过程态、视觉资产的验证点

### 7.2 Phase 1/2/3 各自的生成 prompt

Phase 1/2/3 迭代时各使用专用的生成 prompt:

**`generate-phase1.md`** — 需求解析
- 输入: PRD 全文 + 当前 requirement-analysis skill 规则
- 任务: 严格按 skill 规则解析 PRD，提取模块/功能点/8类测试资产/特性标签
- 输出: parsed-requirements.md

**`generate-phase2.md`** — 需求关联
- 输入: parsed-requirements.md + 当前 requirement-association skill 规则
- 任务: 严格按 skill 规则分析依赖/隐含需求/跨模块场景
- 输出: module-dependencies.md + implicit-requirements.md + cross-module-scenarios.md

**`generate-phase3.md`** — 用例生成 (按模块)
- 输入: 模块 PRD 片段 + parsed-requirements + associations + 当前 test-case-generation skill 规则
- 任务: 严格按 skill 规则为指定模块生成功能测试用例
- 输出: Markdown 格式测试用例文档

Phase 1/2 的产物在各自迭代收敛后固定下来，供 Phase 3 使用。

**重要: 产物一致性保证**
Phase 1 skill 修改收敛后，必须用最终版 skill 重新生成一次 parsed-requirements.md 作为定稿。
Phase 2 同理 — 收敛后用最终版 skill 基于定稿的 parsed-requirements 重新生成一次关联产物。
这确保 Phase 3 使用的输入始终与最终版 skill 一致。

### 7.3 `score.md` — 双基准打分

输入: AI 生成用例 + 对应基准 + 评分维度定义

基准 A 评估: 逐验证点检查 AI 是否覆盖人工用例
基准 B 评估: 检查是否运用了需求特性所要求的测试设计方法:
- 输入框/参数 → 等价类划分 + 边界值分析
- 业务流程 → 正向/替代/异常路径
- 状态变化 → 状态转换覆盖合法+非法
- 复杂规则 → 决策表/因果图
- 安全操作 → 安全测试用例
- AI/LLM 调用 → prompt 回归测试
- 列表/分页 → 排序/分页/空状态/大数据量
- 异步操作 → 超时/重试/取消

每个验证点判定: covered / partial / missing
输出: 结构化 JSON (维度得分 + 明细 + 加权总分 + 是否收敛)

### 7.4 `analyze-and-patch.md` — 差距分析 + Patch 生成

输入: 评分结果 + 当前 skill + 历史迭代记录 + 抽象映射表

差距分为三类:
- 类型 1 (人工覆盖 AI 遗漏) → 补强触发机制
- 类型 2 (方法论要求 AI 遗漏) → 补强生成器策略
- 类型 3 (AI 覆盖人工遗漏) → 记录不改

通用性硬约束: 不得包含业务术语/具体数值/特定路径
修改策略: 优先增强已有规则触发条件；已收敛维度不改；历史已尝试相同修改则换策略

输出: 分析 + unified diff 格式的 patches

### 7.5 `review-patch.md` — Patch 通用性审查

输入: patch + skill 全文
审查: 产品术语/硬编码数值/跨产品适用性/规则冲突/粒度
输出: PASS / REVISE + 具体 issues

### 7.6 `revise-patch.md` — Patch 修订

输入: 原始 patch + 审查 issues
任务: 根据审查意见修订 patch，保留修改意图但消除通用性问题
输出: 修订后的 patches

---

## 8. 实现组件

### 8.1 `config.py`

```python
from dataclasses import dataclass, field

@dataclass
class Config:
    # 输入路径
    prd_path: str = "E:/workspace/aise/geo-sass-re/requirements/VisiGEO-PRD.md"
    reference_path: str = "E:/workspace/aise/data/GEO_LV_2026.01_cases0326.json"
    skill_dir: str = "E:/workspace/aise/TestingAgent/skills"
    agent_dir: str = "E:/workspace/aise/TestingAgent/agents"
    output_dir: str = "E:/workspace/aise/TestingAgent/scripts/auto-iterate/output"
    prompt_dir: str = "E:/workspace/aise/TestingAgent/scripts/auto-iterate/prompts"

    # Claude CLI
    model: str = "sonnet"
    timeout: int = 300

    # 收敛标准
    convergence: dict = field(default_factory=lambda: {
        "phase1": {"min_total_score": 0.80, "min_dimension_score": 0.60, "max_iterations": 4},
        "phase2": {"min_total_score": 0.75, "min_dimension_score": 0.55, "max_iterations": 4},
        "phase3": {"min_total_score": 0.85, "min_dimension_score": 0.65, "max_iterations": 5},
    })

    # 抽象映射表
    abstraction_map: dict = field(default_factory=lambda: {
        "loading阶段文案未逐项验证": "process_feedback — 阶段性进度反馈需逐阶段验证",
        "运营模式未覆盖": "business_outside_prd — PRD外运营策略需主动澄清",
        "Logo/图片未测": "visual_asset — 视觉资产需标记为 manual/partial",
        "prompt模板未逐字段校验": "contract_content — 内容模板需作为合约逐项验证",
        "处理中刷新未测": "interruption_recovery — 处理中状态需测试中断恢复",
        "列表排序未测": "history_interaction — 列表需覆盖排序/分页/滚动/空状态",
    })
```

### 8.2 `splitter.py`

- `split_prd(prd_path) -> list[Module]`: 按 `##` 标题拆分 PRD 为模块片段
- `split_reference(ref_path) -> dict[str, list]`: 按 `module_path` 分组参考用例
- `match_modules(prd_modules, ref_groups) -> list[MatchedModule]`: 将 PRD 模块与参考用例模块对齐

### 8.3 `scorer.py`

- `score(phase, ai_output, baseline, dimensions, config) -> ScoreResult`: 调用 `claude -p score.md`，返回结构化评分
- `is_converged(score, convergence_config) -> bool`: 检查是否满足收敛条件

### 8.4 `analyzer.py`

- `analyze_and_patch(score, skill_content, history, config) -> PatchResult`: 调用 `claude -p analyze-and-patch.md`
- `review_patch(patch, skill_content, config) -> ReviewResult`: 调用 `claude -p review-patch.md`
- `revise_patch(patch, review, config) -> PatchResult`: 调用 `claude -p revise-patch.md`

### 8.5 `patcher.py`

- `snapshot(skill_dir, snapshot_dir)`: 整目录快照
- `apply(patches, skill_dir)`: 应用 unified diff 补丁
- `rollback(skill_dir, snapshot_dir)`: 从快照恢复

### 8.6 `orchestrator.py`

- `main()`: 读取配置 → 检查断点 → Phase 0 → Phase 1 迭代 → Phase 2 迭代 → Phase 3 按模块迭代 → 全量验证
- `iterate_phase(phase, config, state, baseline) -> State`: 单阶段迭代循环
- `iterate_phase3_module(module, config, state, baseline) -> State`: 单模块迭代循环
- `final_validation(config, state)`: 全量生成 + 全量打分 + 报告

---

## 9. 环境与运行方式

### 9.1 依赖

```
# scripts/auto-iterate/requirements.txt
unidiff>=0.7.5     # 应用 unified diff 补丁
jinja2>=3.1.0      # prompt 模板渲染
```

stdlib 已满足其余需求 (json, pathlib, subprocess, shutil, argparse, dataclasses)。

### 9.2 虚拟环境设置 (Windows)

```bash
cd E:/workspace/aise/TestingAgent/scripts/auto-iterate

# 创建 venv (首次)
py -m venv .venv

# 激活 venv
.venv/Scripts/activate      # Git Bash
# 或 .venv\Scripts\activate.bat    # CMD
# 或 .venv\Scripts\Activate.ps1    # PowerShell

# 安装依赖
pip install -r requirements.txt
```

### 9.3 运行

```bash
# 前置: 已激活 venv
cd E:/workspace/aise/TestingAgent/scripts/auto-iterate

# 首次运行 (从 Phase 0 开始)
python orchestrator.py

# 中断后恢复 (自动检测断点)
python orchestrator.py

# 只跑某个模块 (调试用)
python orchestrator.py --module "URL通用校验"

# 只跑某个阶段
python orchestrator.py --phase 3

# 查看当前进度
python orchestrator.py --status
```

### 9.4 .gitignore

脚本目录下需忽略:

```
.venv/
output/
__pycache__/
*.pyc
```

skill-snapshots 属于 output 子目录，一并被忽略。

---

## 10. 最终报告结构

```markdown
# Supertester Skill 自动迭代优化报告

## 执行摘要
- 总迭代轮次: X
- Phase 1: Y 轮收敛, 最终分 Z
- Phase 2: Y 轮收敛, 最终分 Z
- Phase 3: N 个模块, M 个收敛, K 个需人工介入

## Phase 1 迭代轨迹
| 轮次 | 总分 | 各维度分 | 修改摘要 |

## Phase 2 迭代轨迹
| 轮次 | 总分 | 各维度分 | 修改摘要 |

## Phase 3 各模块迭代轨迹
### 模块: URL通用校验
| 轮次 | 总分 | 各维度分 | 修改摘要 |

## Skill 修改总结
| 文件 | 修改次数 | 关键变更 |

## 未收敛项 (需人工介入)
| 阶段/模块 | 最高分 | 短板维度 | 建议 |

## AI 优势项 (类型 3 差距)
| 模块 | AI 额外覆盖 | 对应测试方法 |
```
