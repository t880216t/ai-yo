---
name: automation-analysis
description: Use when analyzing test case automation feasibility - classifies each test case as automatable, partial, or manual based on Playwright capabilities
---

# Skill 4: 自动化可行性分析

## Iron Law

> **未经用户确认的用例不准分析自动化可行性。**

## 前置条件

- Phase 3 (test-case-generation) Status: **complete**
- 用户已确认功能测试用例

## 流程

```
functional-cases.yaml (已确认)
    |
    v
解析每个 case，按 type 分流：
  - type: single        → 每个叶子 step 打 automation 标签（可整体继承）
  - type: matrix        → 每个 children 叶子 step 单独打 automation 标签（可继承父级）
  - type: scenario_chain → 整体打标（无 branches；分支已是独立用例）
    |
    v
标记: automatable / partial / manual
    |
    v
生成 automation-analysis.yaml + automation-analysis.md (统计视图)
    |
    v
更新 test_plan.md Phase 4 -> complete
```

## 自动化等级判断标准

| 等级 | 标准 | Playwright 可行性 | 示例 |
|------|------|------------------|------|
| `automatable` | 所有步骤可通过 Playwright API 完成，无需视觉/人工验证 | 完全可行 | 表单提交、页面跳转、API 调用、DOM 断言 |
| `partial` | 核心步骤可自动化，但某些验证需人工 | 部分可行 | UI 视觉验证、布局检查、复杂交互反馈 |
| `manual` | 无法通过 Playwright 完成，需人工观察或物理设备 | 不可行 | 邮件内容、短信验证、物理设备、主观体验 |

## matrix 用例的 children 叶子 step 级判定

`type: matrix` 用例（含 `group: true` 分组 step）不允许只在父级打一个 automation 标签后就结束分析。**必须逐个评估每个 children 叶子 step 的 automation**，原因：同一矩阵下不同分组的叶子 step 可行性差异可能很大（如"IP 归属 → 默认区号"分组需 IP 模拟工具，标 partial；"长度 × 区号"分组纯 DOM 操作，标 automatable）。

判定规则：
1. **叶子 step 级显式标记优先**：YAML 中 `steps[].children[].automation` 显式声明 → 直接采用
2. **缺省继承父级**：未显式声明 → 继承 case 的 `automation`
3. **父级与叶子 step 冲突时**：以叶子 step 为准，并在分析报告中标注冲突，提示 Phase 5 按叶子 step 编译
4. **聚合回写**：分析完所有叶子 step 后回写 case 级 `automation`：全部 automatable → `automatable`；存在 partial 且无 manual → `partial`；存在 manual → `partial`（manual 不污染父级，但需在报告中说明）

## verbatim 叶子 step 的特殊判定

`steps[].children[].verbatim: true` 的叶子 step 一律标 `automatable`（除非该叶子 step 还涉及非 UI 文本断言），但 Phase 5 自动化脚本必须使用精确字符串断言（`toHaveText` / `toContainText` with exact string），**不允许参数化或局部匹配**。

## 判断指南

### automatable 信号
- 页面导航和 URL 验证
- 表单填写和提交
- DOM 元素存在/内容验证
- HTTP 状态码检查
- Cookie/LocalStorage 验证
- 文件下载（验证触发）
- 数据库状态（通过 API）

### partial 信号
- 需要视觉验证（样式、布局、动画）
- 需要验证 PDF/图片内容
- 需要验证第三方嵌入内容
- 需要验证音频/视频播放
- 拖拽交互的精确位置验证

### manual 信号
- 接收实际邮件/短信
- 物理设备交互（扫码、NFC）
- 主观用户体验评估
- 跨浏览器视觉一致性
- 无障碍辅助工具交互
- 需要第三方系统的人工操作

## 输出格式

输出两份文件：
- `.supertester/test-cases/automation-analysis.yaml` —— 机器可读，供 automation-scripting 直接消费
- `.supertester/test-cases/automation-analysis.md` —— 人审视图，含统计和理由说明

### automation-analysis.yaml

```yaml
meta:
  total_cases: N
  total_rows: M
  case_stats:
    automatable: X
    partial: Y
    manual: Z
  step_stats:          # 叶子 step（含 children）展开后的执行点统计
    automatable: X'
    partial: Y'
    manual: Z'
  # level_distribution 与 level_step_distribution 直接透传自 functional-cases.yaml 的 meta，
  # 不在本阶段重新分配；automation 与 level 是正交维度

cases:
  - id: TC-001
    type: single
    case_level: P0               # 透传 meta.level_distribution（叶子 step 最高档），不得修改
    automation: automatable
    rationale: 全部步骤为 DOM 操作 + URL 断言
    auto_steps: all
    manual_steps: []

  - id: TC-043
    type: matrix
    case_level: P1               # 透传（叶子 step 最高档）
    automation: partial           # 父级聚合后结果
    rationale: IP 模拟分组需 partial；其余叶子 step 可自动化
    children:
      - group: IP 归属 → 默认区号
        index: 0
        level: P2                # 透传该叶子 step 的 level（若上游有）
        automation: partial
        rationale: 需 IP 归属地模拟工具
      - group: 长度 × 区号
        index: 1
        automation: automatable
        rationale: 纯 DOM 输入 + 文本断言
      - group: 必填
        index: 0
        automation: automatable
        verbatim_assertion: true   # 标记给 Phase 5 用

  - id: TC-020
    type: single
    case_level: P1
    automation: manual
    rationale: 需接收实际邮件并验证内容
    auto_steps: []
    manual_steps: all
```

**优先级透传规则**：
- 本阶段**不重新分配 level**，只忠实透传 functional-cases.yaml 的字段（叶子 step 的 `level`，以及 case 有效 level = 叶子 step 最高档）
- 如果上游叶子 step 的 `level` 缺失，应停止分析并要求 Phase 3 补齐，而不是在本阶段补默认值
- automation 与 level 是**正交维度**：含 P0 叶子 step 的用例完全可能是 manual（如人工视觉验收），P2 叶子 step 也可能是 automatable；不允许因为 level=P0 就强行把 manual 改为 automatable，反之亦然

### automation-analysis.md（人审视图）

```markdown
# 自动化可行性分析

## 统计
- 总用例 (case): N
- 总执行点 (row + step): M
- case 级 automatable: X (Y%)
- case 级 partial: X (Y%)
- case 级 manual: X (Y%)
- row 级 automatable: X' / M
- row 级 partial: Y' / M
- row 级 manual: Z' / M

## 详细分析（按模块分组）
[每个用例的等级、理由、可自动化范围；matrix 展开到 row 级]

## 输出指引
- automatable / partial 用例 → automation-scripting 编译为 Playwright
- manual 用例 → 写入 manual-cases.md
- matrix 用例中混合 manual row → 父用例标 partial，manual row 单独导出到 manual-cases.md
```

## 2-Action Rule 落地

- 分析了 2 个用例 -> 立即追加到 automation-analysis.yaml 和 automation-analysis.md
- 分析完一条 matrix 用例的所有 row -> 立即回写父级聚合结果

## Red Flags

| 如果你在想... | 现实是... |
|--------------|------------|
| "全部标记为 automatable" | 不诚实的标记会导致脚本生成后无法运行 |
| "跳过分析直接生成脚本" | 没有分析就无法正确处理 partial 和 manual |
| "partial 太麻烦，算 manual" | partial 的自动化部分仍有价值 |
| "matrix 用例只标父级就够了" | 必须 row 级评估，否则 Phase 5 不知道哪个 row 该跳过、哪个能编译 |
| "verbatim row 跟普通 row 一样处理" | verbatim 需要精确字符串断言，标记会传给 Phase 5 强制 toHaveText 而非 toContainText |
