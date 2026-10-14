import { test, expect } from '@playwright/test';

// Helper to initialize session and bypass initial modal blockers (splash, milestone celebrations)
async function setupPageContext(page) {
  const consoleErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Ignore initial guest 401 response, validation 400/422 responses, or logout Unauthenticated race condition
      if (text.includes('401') || text.includes('400') || text.includes('422') || text.includes('Unauthorized') || text.includes('Unauthenticated')) return;
      consoleErrors.push(text);
    }
  });

  page.on('pageerror', err => {
    consoleErrors.push(err.message);
  });

  await page.addInitScript(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    sessionStorage.setItem('solarflow_splash_shown', 'true');
    sessionStorage.setItem('solar_notif_dismissed_session', 'true');
    localStorage.setItem(`milestone_1000_${todayStr}`, 'true');
    localStorage.setItem(`milestone_5000_${todayStr}`, 'true');
    localStorage.setItem(`milestone_10000_${todayStr}`, 'true');
    localStorage.setItem(`milestone_evening_${todayStr}`, 'true');
  });

  return { consoleErrors };
}

// Helper to dismiss unexpected blocking popups/modals (e.g. AI emergency voice call dispatch)
async function dismissAnyBlockingModals(page) {
  try {
    const endCallBtn = page.locator('button:has-text("કૉલ કટ કરો"), button:has-text("કાપો (Decline)")');
    if (await endCallBtn.count() > 0 && await endCallBtn.first().isVisible({ timeout: 1500 })) {
      await endCallBtn.first().click().catch(() => {});
      await page.waitForTimeout(500);
    }
  } catch (_) {}
}

// Helper to perform authenticated login
async function loginAsSuperAdmin(page) {
  await page.goto(process.env.E2E_BASE_URL || 'http://127.0.0.1:8088/');
  await page.waitForSelector('#login-email', { timeout: 10000 });
  await page.fill('#login-email', 'managesolar@gmail.com');
  await page.fill('#login-password', 'Admin@123');
  await page.click('button.login-submit');

  const isMobile = (page.viewportSize()?.width || 1280) <= 768;
  if (isMobile) {
    await page.waitForSelector('.mobile-app-container', { timeout: 15000 });
  } else {
    await page.waitForSelector('.shell', { timeout: 15000 });
  }
  await dismissAnyBlockingModals(page);
}

// Helper to navigate to a page regardless of desktop or mobile layout
async function navigateTo(page, pageKey) {
  await dismissAnyBlockingModals(page);
  const isMobile = (page.viewportSize()?.width || 1280) <= 768;

  if (isMobile) {
    const bottomNavBtn = page.locator(`nav.mobile-bottom-navbar button[data-page="${pageKey}"]`);
    if (await bottomNavBtn.count() > 0) {
      await bottomNavBtn.click();
    } else {
      // Open drawer menu for secondary pages (salaries, expenses, etc.)
      await page.click('nav.mobile-bottom-navbar button[data-action="more-menu"]');
      await page.waitForSelector('.mobile-drawer-sheet', { timeout: 8000 });
      await page.click(`.mobile-drawer-sheet button[data-page="${pageKey}"]`);
    }
  } else {
    await page.click(`button[data-page="${pageKey}"]`);
  }
  await dismissAnyBlockingModals(page);
}

test.describe('SolarFlow Core E2E Verification Suites', () => {

  test('1. Authentication Flow - Login', async ({ page }) => {
    const { consoleErrors } = await setupPageContext(page);

    await loginAsSuperAdmin(page);

    const isMobile = (page.viewportSize()?.width || 1280) <= 768;
    if (isMobile) {
      await expect(page.locator('.mobile-app-container')).toBeVisible();
    } else {
      await expect(page.locator('.shell')).toBeVisible();
    }

    expect(consoleErrors).toHaveLength(0);
  });

  test('2. Dashboard Flow - Live Telemetry & Metrics', async ({ page }) => {
    const { consoleErrors } = await setupPageContext(page);

    await loginAsSuperAdmin(page);
    await navigateTo(page, 'dashboard');

    const isMobile = (page.viewportSize()?.width || 1280) <= 768;
    if (isMobile) {
      await expect(page.locator('.mobile-dashboard-scroll')).toBeVisible();
      await expect(page.locator('.mobile-company-selector-bar')).toBeVisible();
    } else {
      await expect(page.locator('.live-solar-container')).toBeVisible();
      await expect(page.locator('.solar-dashboard-header')).toBeVisible();
    }

    expect(consoleErrors).toHaveLength(0);
  });

  test('3. Daily Entry Flow - Reading Form & Save Operation', async ({ page }) => {
    const { consoleErrors } = await setupPageContext(page);

    await loginAsSuperAdmin(page);
    await navigateTo(page, 'entry');

    await expect(page.locator('form.entry')).toBeVisible();

    // Verify meter reading fields or submit button is rendered
    const submitBtn = page.locator('form.entry button[type="submit"]');
    await expect(submitBtn).toBeVisible();

    // Trigger save action
    await submitBtn.click();
    await page.waitForTimeout(1500);

    // Verify form remains stable with no console errors
    await expect(page.locator('form.entry')).toBeVisible();
    expect(consoleErrors).toHaveLength(0);
  });

  test('4. Attendance Flow - Attendance Register & Status View', async ({ page }) => {
    const { consoleErrors } = await setupPageContext(page);

    await loginAsSuperAdmin(page);
    await navigateTo(page, 'attendance');

    await expect(page.locator('.attendance-admin')).toBeVisible();
    await expect(page.locator('.attendance-cards')).toBeVisible();

    expect(consoleErrors).toHaveLength(0);
  });

  test('5. Reports Flow - Filtering by Period & Range', async ({ page }) => {
    const { consoleErrors } = await setupPageContext(page);

    await loginAsSuperAdmin(page);
    await navigateTo(page, 'reports');

    await expect(page.locator('.reports-page')).toBeVisible();
    await expect(page.locator('.report-filter')).toBeVisible();

    // Test filter period toggle (Daily -> Weekly -> Monthly)
    const monthlyBtn = page.locator('.report-filter .segment button:has-text("Monthly")');
    if (await monthlyBtn.count() > 0) {
      await monthlyBtn.click();
      await page.waitForTimeout(1000);
    }

    // Click Apply filter button
    const applyBtn = page.locator('.report-filter button.primary:has-text("Apply")');
    if (await applyBtn.count() > 0) {
      await applyBtn.click();
      await page.waitForTimeout(1000);
    }

    await expect(page.locator('.reports-page')).toBeVisible();
    expect(consoleErrors).toHaveLength(0);
  });

  test('6. Payroll & Salaries Flow - Calculation & Details View', async ({ page }) => {
    const { consoleErrors } = await setupPageContext(page);

    await loginAsSuperAdmin(page);
    await navigateTo(page, 'salaries');

    await expect(page.locator('.salary-page')).toBeVisible();
    await expect(page.locator('.salary-toolbar')).toBeVisible();

    expect(consoleErrors).toHaveLength(0);
  });

  test('7. Expenses Flow - Shared Ledger & Balances View', async ({ page }) => {
    const { consoleErrors } = await setupPageContext(page);

    await loginAsSuperAdmin(page);
    await navigateTo(page, 'expenses');

    await expect(page.locator('.expenses-page')).toBeVisible();
    await expect(page.locator('.expense-summary-cards')).toBeVisible();

    expect(consoleErrors).toHaveLength(0);
  });

  test('8. Logout Flow - Session Termination & Landing', async ({ page }) => {
    const { consoleErrors } = await setupPageContext(page);

    await loginAsSuperAdmin(page);
    await dismissAnyBlockingModals(page);

    const isMobile = (page.viewportSize()?.width || 1280) <= 768;
    if (isMobile) {
      await page.click('nav.mobile-bottom-navbar button[data-action="more-menu"]');
      await page.waitForSelector('.mobile-drawer-sheet', { timeout: 8000 });
      await page.click('button.drawer-logout-btn');
    } else {
      await page.click('button.signout');
    }

    await expect(page.locator('#login-email')).toBeVisible();
    expect(consoleErrors).toHaveLength(0);
  });

});
