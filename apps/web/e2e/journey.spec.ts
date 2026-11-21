import { expect, test } from '@playwright/test';

test('public event journey and auth views', async ({ page, request }) => {
  const health = await request.get('http://localhost:4000/health');
  expect(health.ok()).toBeTruthy();

  await page.goto('/');
  await expect(page).toHaveURL(/localhost:3000/);
  await expect(page.getByText('EventPass')).toBeVisible();

  await page.goto('/register');
  await expect(page.getByRole('heading', { name: 'Create Account' })).toBeVisible();

  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
});
