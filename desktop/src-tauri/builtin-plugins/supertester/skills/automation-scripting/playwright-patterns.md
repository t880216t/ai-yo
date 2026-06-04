# Playwright 最佳实践参考

## 页面对象模式 (Page Object Model)

```typescript
// pages/login.page.ts
import { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('[data-testid="email-input"]');
    this.passwordInput = page.locator('[data-testid="password-input"]');
    this.loginButton = page.locator('[data-testid="login-btn"]');
    this.errorMessage = page.locator('[data-testid="error-msg"]');
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }
}
```

## 选择器策略

### 推荐优先级

```typescript
// 1. data-testid (最稳定)
page.locator('[data-testid="submit-btn"]');

// 2. ARIA role (语义化)
page.getByRole('button', { name: 'Submit' });

// 3. Text content (用户可见)
page.getByText('Submit');

// 4. Label (表单元素)
page.getByLabel('Email');

// 5. Placeholder
page.getByPlaceholder('Enter email');

// 6. CSS selector (最后选择，标记为不稳定)
// WARNING: Fragile selector - consider adding data-testid
page.locator('.btn-primary');
```

### 避免的选择器
```typescript
// BAD: 依赖实现细节
page.locator('#app > div:nth-child(2) > button');
page.locator('.css-1a2b3c'); // CSS module hash

// BAD: 依赖文本内容（可能被国际化）
page.locator('text=Submit'); // Use getByRole instead
```

## 等待策略

```typescript
// GOOD: 使用自动等待
await expect(page.locator('[data-testid="result"]')).toBeVisible();

// GOOD: 等待特定条件
await page.waitForResponse(resp =>
  resp.url().includes('/api/data') && resp.status() === 200
);

// GOOD: 等待导航完成
await Promise.all([
  page.waitForNavigation(),
  page.click('[data-testid="link"]'),
]);

// BAD: 硬编码等待
await page.waitForTimeout(3000); // Never do this
```

## 断言模式

```typescript
// 页面 URL
await expect(page).toHaveURL('/dashboard');
await expect(page).toHaveURL(/\/dashboard$/);

// 元素可见性
await expect(locator).toBeVisible();
await expect(locator).toBeHidden();

// 文本内容
await expect(locator).toContainText('Welcome');
await expect(locator).toHaveText('Welcome back, User!');

// 属性
await expect(locator).toHaveAttribute('disabled', '');
await expect(locator).toHaveClass(/active/);

// 计数
await expect(page.locator('.item')).toHaveCount(5);

// 输入值
await expect(locator).toHaveValue('test@example.com');
```

## 测试数据管理

```typescript
// 使用 test fixtures
test.describe('shopping cart', () => {
  test.beforeEach(async ({ page }) => {
    // Setup: login and navigate
    await page.goto('/login');
    await page.fill('[data-testid="email"]', 'test@example.com');
    await page.fill('[data-testid="password"]', 'password');
    await page.click('[data-testid="login-btn"]');
  });

  test('should add item to cart', async ({ page }) => {
    // Test starts with logged-in user
  });
});
```

## 网络拦截

```typescript
// Mock API response
await page.route('**/api/users', route =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ users: [] }),
  })
);

// Wait for specific request
const responsePromise = page.waitForResponse('**/api/submit');
await page.click('[data-testid="submit"]');
const response = await responsePromise;
expect(response.status()).toBe(200);
```

## 文件上传/下载

```typescript
// Upload
await page.locator('[data-testid="file-input"]')
  .setInputFiles('path/to/file.pdf');

// Download
const downloadPromise = page.waitForEvent('download');
await page.click('[data-testid="download-btn"]');
const download = await downloadPromise;
expect(download.suggestedFilename()).toBe('report.pdf');
```

## 多标签页/弹窗

```typescript
// New tab
const pagePromise = page.context().waitForEvent('page');
await page.click('[data-testid="new-tab-link"]');
const newPage = await pagePromise;
await expect(newPage).toHaveURL(/external/);

// Dialog
page.on('dialog', dialog => dialog.accept());
await page.click('[data-testid="delete-btn"]');
```

## 响应式测试

```typescript
// Set viewport
await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE

// Test mobile navigation
await expect(page.locator('[data-testid="mobile-menu"]')).toBeVisible();
```
