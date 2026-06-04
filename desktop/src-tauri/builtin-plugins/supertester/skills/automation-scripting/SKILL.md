---
name: automation-scripting
description: Use when generating Playwright E2E test scripts from confirmed test cases - generates code for automatable cases, marks partial cases, documents manual cases
---

# Skill 5: 自动化脚本生成

## Iron Law

> **只为已确认且标记为 automatable/partial 的用例生成脚本。**

<HARD-GATE>
manual 用例不生成代码，只生成文档化的执行步骤到 manual-cases.md。
生成的脚本必须经过 test-reviewer 审查后才能输出给用户。
</HARD-GATE>

## 前置条件

- Phase 4 (automation-analysis) Status: **complete**
- `.supertester/test-cases/automation-analysis.md` 已生成

## 流程

```
functional-cases.yaml + automation-analysis.yaml
    |
    v
按模块分组解析 cases[]
    |
    +---> type: single (automatable/partial) -> 单个 test() 块
    |
    +---> type: matrix -> test.describe + 参数化数据驱动（分组 step → describe，children 叶子 step → test）
    |
    +---> type: scenario_chain -> 单个 test()，按 steps[] 顺序编排（无 branches）
    |
    +---> manual 用例 / matrix 中 manual 的 children 叶子 step -> manual-cases.md
    |
    v
test-reviewer 审查 -> reviews/review-scripts-*.md
    |
    v
更新 test_plan.md Phase 5 -> complete
```

## 生成规则

### type: single - automatable
- 生成完整的 Playwright 测试代码
- 包含完整的 Arrange-Act-Assert
- 每个断言对应测试步骤的预期结果

### type: single - partial
- 自动化部分生成完整代码
- 需人工验证的部分添加注释标记:
  ```typescript
  // HUMAN VERIFICATION NEEDED:
  // - [需要人工验证的内容描述]
  ```

### type: matrix
- 编译为 `test.describe` 包裹的参数化测试，每个分组 step（`group: true`）一个 describe，每个 children 叶子 step 一个 test
- 共享前置条件（`precondition`）用 `test.beforeEach` 实现
- children 叶子 step 数据从 YAML 中提取为 `const rows = [...]` 数组（每项含 `action` / `result` / `source` / `verbatim`），用 `for (const row of rows)` 或 `test.each(rows)` 展开
- **`verbatim: true` 的叶子 step 必须使用 `toHaveText` 精确断言**（非 `toContainText`），且断言字符串不允许变量化
- `automation: manual` 的叶子 step 跳过，仅在 manual-cases.md 中列出（注释引用对应分组 step 组名和叶子 step 索引）
- `automation: partial` 的叶子 step 生成代码 + `HUMAN VERIFICATION NEEDED` 标记

### type: scenario_chain
- 生成单个 `test()` 块，按 `steps[]` 顺序编排（每个叶子 step 的 `action` → 操作，`result` → 断言）
- 替代/错误路径已在 Phase 3 拆为独立用例（不再有 `branches`），各自生成自己的 `test()`

### manual 用例
- 不生成任何代码
- 写入 `.supertester/scripts/manual-cases.md`
- 包含详细的人工执行步骤
- matrix 中 manual 的 children 叶子 step 需注明所属父用例 ID + 分组 step 组名 + 叶子 step 索引

## 代码规范

### 文件组织
- 每个测试文件对应一个模块: `<module-name>.e2e.spec.ts`
- 使用 Page Object 模式组织页面交互
- 文件头部注释包含模块信息和生成时间

### 溯源注释
每个 test 必须标记溯源。对 matrix 用例，**children 叶子 step 级溯源也必须保留**:

```typescript
// TC-001 | F-001 | <source-file>:<line-range>
test('should ...', async ({ page }) => {
  // ...
});

// matrix 用例: children 叶子 step 级溯源放进数据数组
const rows = [
  { action: '...', result: '...', source: 'L35', verbatim: false },
  { action: '...', result: '...', source: 'L41', verbatim: true },
];
```

### 代码结构
```typescript
// Arrange - 准备测试数据和页面状态
await page.goto('/path');

// Act - 执行操作
await page.fill('[data-testid="input"]', 'value');
await page.click('[data-testid="button"]');

// Assert - 验证结果
await expect(page).toHaveURL('/expected');
await expect(page.locator('[data-testid="msg"]')).toContainText('expected');
```

### 选择器策略
优先级从高到低:
1. `data-testid` 属性: `[data-testid="login-btn"]`
2. ARIA role: `getByRole('button', { name: 'Login' })`
3. Text content: `getByText('Submit')`
4. CSS selector: 最后选择，标记为不稳定

### Playwright 最佳实践
详细参考见 @playwright-patterns.md

## 输出示例

### type: single - automatable

```typescript
// auth.e2e.spec.ts
// Module: User Authentication
// Generated: YYYY-MM-DD
// Source: functional-cases.yaml

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
  await expect(page.locator('[data-testid="welcome-msg"]'))
    .toContainText('Welcome');
});
```

### type: single - partial

```typescript
// TC-015 | F-001 | auth-prd.md:52
test('should display welcome elements after login', async ({ page }) => {
  // Arrange & Act (automated)
  await page.goto('/login');
  await page.fill('[data-testid="email-input"]', 'test@example.com');
  await page.fill('[data-testid="password-input"]', 'password123');
  await page.click('[data-testid="login-btn"]');
  await expect(page).toHaveURL('/dashboard');

  // HUMAN VERIFICATION NEEDED:
  // - Verify welcome message styling is correct
  // - Check dashboard layout renders without visual glitches
  // - Confirm notification bell icon appears in correct position
});
```

### type: matrix - 编译为参数化测试

```typescript
// member-confirm.e2e.spec.ts
// TC-043 | F-005 | requirements.md:35-41
test.describe('TC-043 手机号字段校验矩阵', () => {
  test.beforeEach(async ({ page }) => {
    // 共享前置条件 (precondition)
    await page.goto('/member/confirm');
  });

  test.describe('group: 长度 × 区号', () => {
    // verbatim:true 的 row 必须用精确字符串断言 (toHaveText)，不允许变量化
    const rows = [
      { action: '+86, 11 位纯数字', input: '13800001234', region: '+86',
        result: { pass: true }, source: 'L41' },
      { action: '+86, 含字母', input: '1380000abc', region: '+86',
        result: { errorText: '请填写正确的手机号' }, source: 'L41', verbatim: true },
      { action: '+852, 8 位', input: '12345678', region: '+852',
        result: { pass: true }, source: 'L41' },
    ];

    for (const row of rows) {
      test(`${row.action} (source: ${row.source})`, async ({ page }) => {
        await page.locator('[data-testid="region-select"]').selectOption(row.region);
        await page.locator('[data-testid="phone-input"]').fill(row.input);
        await page.locator('[data-testid="submit-btn"]').click();

        if (row.result.pass) {
          await expect(page.locator('[data-testid="phone-error"]')).toBeHidden();
        } else {
          // verbatim: 必须用 toHaveText 精确断言，不允许 toContainText 局部匹配
          await expect(page.locator('[data-testid="phone-error"]'))
            .toHaveText(row.result.errorText!);
        }
      });
    }
  });

  test.describe('group: IP 归属 → 默认区号', () => {
    // HUMAN VERIFICATION NEEDED (row.automation = partial):
    // - 需 IP 归属地模拟工具切换至 中国大陆 / 香港 / 澳门 / 台湾 / 国外 / 失败
    // - 每次模拟后验证 region-select 默认值
    // 见 manual-cases.md TC-043 group="IP 归属 → 默认区号"
  });

  test.describe('group: 必填', () => {
    test('手机号留空提交 (source: L40, verbatim)', async ({ page }) => {
      await page.locator('[data-testid="submit-btn"]').click();
      // verbatim:true → 精确断言
      await expect(page.locator('[data-testid="phone-error"]'))
        .toHaveText('请填写手机号');
    });
  });
});
```

**关键约定：**
- `test.describe(group.name)` 包裹同组 rows
- `for (const row of rows)` 或 `test.each(rows)` 展开
- test 标题中包含 `row.source` 以保证溯源可见
- `verbatim: true` 的 row 必须用 `toHaveText(...)` 精确断言，禁止 `toContainText` 或字符串变量化
- partial / manual row 不生成执行代码，仅以注释列出，并引用 manual-cases.md 中的对应条目

### manual-cases.md

```markdown
# Manual Test Cases

## TC-020: Email Notification Verification
**Module:** Notifications
**Function:** F-010
**Reason:** Requires actual email receipt and content verification

### Execution Steps
1. Trigger password reset for user test@example.com
2. Check email inbox for test@example.com
3. Verify email subject: "Password Reset Request"
4. Verify email body contains reset link
5. Click reset link, verify it opens correct page
6. Verify link expires after 24 hours

### Expected Results
- Email received within 5 minutes
- Subject and body match template
- Reset link functional and expires correctly
```

## test-reviewer 审查维度

- 代码无语法错误
- 遵循 Playwright 最佳实践
- 选择器策略稳定 (data-testid > CSS)
- Arrange-Act-Assert 结构清晰
- 溯源注释完整 (TC-xxx | F-xxx)，matrix 数据数组内含 children 叶子 step 级 source
- partial 用例的 HUMAN VERIFICATION 标记准确
- matrix 用例：每个 group 编译为 `test.describe`，每个 row 编译为独立 `test()`，row 数与 YAML 一致
- `verbatim: true` 的 row 使用 `toHaveText` 精确断言，未被参数化或截断
- matrix 中 manual / partial row 已跳过编译并在 manual-cases.md 留有对应条目

## Red Flags

| 如果你在想... | 现实是... |
|--------------|------------|
| "为 manual 用例也生成代码" | 违反 Hard Gate，manual 只写文档 |
| "选择器用 CSS class 就好" | CSS class 容易变，优先用 data-testid |
| "不需要溯源注释" | 溯源是追溯链的关键环节 |
| "跳过审查" | 脚本必须经 test-reviewer 审查 |
| "matrix 用例合并到一个 test() 里跑" | 失败时无法定位是哪个 row 出错，必须每个 row 独立 test |
| "verbatim 文案用变量插值省事" | 一旦变量化就丢失了文案资产的逐字断言意义 |
