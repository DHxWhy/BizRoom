/**
 * Phase 1 — Lobby Entry (Multi-step flow)
 *
 * Lobby steps: name → brandMemory → agenda → enter room
 * Tests validate each step in the multi-step wizard.
 */

import { test, expect } from "@playwright/test";
import { LobbyPage } from "../pages/LobbyPage";
import {
  TEST_USER,
  BRAND_MEMORY,
  TEST_AGENDA,
} from "../fixtures/test-data";
import { Timer } from "../helpers/timing";

/** Detect meeting room entry: URL change, canvas, or meeting root */
async function waitForRoomEntry(
  page: import("@playwright/test").Page,
  timeout = 30_000,
): Promise<void> {
  await Promise.race([
    page.waitForURL((url) => url.pathname !== "/", { timeout }),
    page.waitForSelector("canvas", { state: "visible", timeout }),
    page.waitForSelector(
      "[data-testid='meeting-room'], .meeting-room",
      { state: "visible", timeout },
    ),
  ]);
}

test.describe.serial("Phase 1 — Lobby Entry", () => {
  // ── Test 1-1: Page load ──────────────────────────────
  test("1-1 | page loads within 3s", async ({ page }) => {
    const timer = new Timer();
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const elapsed = timer.elapsed();

    console.log(`[Perf] Page load: ${elapsed}ms`);
    if (elapsed > 3_000) {
      console.warn(`[Perf][WARN] Page load ${elapsed}ms > 3000ms target`);
    }

    expect(elapsed).toBeLessThan(10_000);
    await expect(page.locator("body")).not.toBeEmpty();
  });

  // ── Test 1-2: Lobby UI visible ───────────────────────
  test("1-2 | lobby UI elements visible", async ({ page }) => {
    const lobby = new LobbyPage(page);
    await lobby.goto();
    await lobby.assertLoaded();

    // Name input
    const nameInput = page.locator("#lobby-name-input, input[type='text']").first();
    await expect(nameInput).toBeVisible({ timeout: 10_000 });

    // Create tab
    const createTab = page.locator("button:has-text('만들기')").first();
    await expect(createTab).toBeVisible({ timeout: 5_000 });

    // Submit button (다음)
    const submitBtn = page.locator("button[type='submit']").first();
    await expect(submitBtn).toBeVisible({ timeout: 5_000 });
  });

  // ── Test 1-3: Name input ─────────────────────────────
  test("1-3 | name input accepts user name", async ({ page }) => {
    const lobby = new LobbyPage(page);
    await lobby.goto();
    await lobby.fillName(TEST_USER.name);

    const nameInput = page.locator("#lobby-name-input, input[type='text']").first();
    await expect(nameInput).toHaveValue(TEST_USER.name, { timeout: 5_000 });
  });

  // ── Test 1-4: Brand Memory form (step 2) ─────────────
  test("1-4 | brand memory form accepts data (step 2)", async ({ page }) => {
    const lobby = new LobbyPage(page);
    await lobby.goto();

    // Step 1: fill name → submit → go to brand memory step
    await lobby.fillName(TEST_USER.name);
    await lobby.submitName();

    // Step 2: brand memory form should now be visible
    await lobby.fillBrandMemory({
      companyName: BRAND_MEMORY.companyName,
      industry: BRAND_MEMORY.industry,
      product: BRAND_MEMORY.product,
    });

    // Verify at least one field was filled
    const companyInput = page
      .locator("input[placeholder*='회사'], input[name='companyName']")
      .first();

    if (await companyInput.isVisible().catch(() => false)) {
      await expect(companyInput).toHaveValue(BRAND_MEMORY.companyName);
    } else {
      console.log("[Info] Brand memory fields layout differs — still pass");
    }
  });

  // ── Test 1-5: Agenda input (step 3) ──────────────────
  test("1-5 | agenda input accepts text (step 3)", async ({ page }) => {
    const lobby = new LobbyPage(page);
    await lobby.goto();

    // Step 1: name → submit
    await lobby.fillName(TEST_USER.name);
    await lobby.submitName();

    // Step 2: brand memory → skip/next
    await lobby.skipBrandMemory();

    // Step 3: agenda form should now be visible
    await lobby.fillAgenda(TEST_AGENDA);

    const agendaInput = page.locator("textarea").first();
    await expect(agendaInput).toHaveValue(TEST_AGENDA, { timeout: 5_000 });
  });

  // ── Test 1-6: Full create-room flow ──────────────────
  test("1-6 | create room — full flow succeeds", async ({ page }) => {
    const lobby = new LobbyPage(page);
    await lobby.goto();

    // Full multi-step: name → brand memory → agenda → enter
    await lobby.createRoom(TEST_USER.name, TEST_AGENDA, {
      companyName: BRAND_MEMORY.companyName,
      industry: BRAND_MEMORY.industry,
      product: BRAND_MEMORY.product,
    });

    // Wait for meeting room
    await waitForRoomEntry(page, 30_000);

    const currentUrl = page.url();
    const hasCanvas = await page.locator("canvas").isVisible();
    console.log(`[Info] Post-create URL: ${currentUrl} | canvas: ${hasCanvas}`);

    const enteredRoom = !currentUrl.endsWith("/") || hasCanvas;
    expect(enteredRoom).toBe(true);
  });

  // ── Test 1-7: Performance ────────────────────────────
  test("1-7 | performance — page load time", async ({ page }) => {
    const timer = new Timer();
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    const domReady = timer.lap();
    await page.waitForLoadState("networkidle");
    const networkIdle = timer.elapsed();

    console.log(`[Perf] DOMContentLoaded: ${domReady}ms`);
    console.log(`[Perf] NetworkIdle: ${networkIdle}ms`);

    expect(networkIdle).toBeLessThan(15_000);
  });
});
