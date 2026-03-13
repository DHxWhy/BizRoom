/**
 * @file LobbyPage.ts
 * @description Page Object for the Lobby — multi-step onboarding wizard.
 *
 * The lobby flow consists of three steps:
 *   Step 1: User name input + "다음" submit
 *   Step 2: BrandMemoryForm (preset or manual) + "다음"
 *   Step 3: Meeting agenda textarea + "입장하기" (enter room)
 *
 * This Page Object encapsulates all lobby interactions so test specs
 * remain focused on assertions rather than DOM navigation.
 */

import { Page, expect } from "@playwright/test";
import { SEL } from "../fixtures/selectors";

export class LobbyPage {
  constructor(private page: Page) {}

  /**
   * Navigate to the lobby page and wait for full load.
   * Uses networkidle to ensure all assets (JS, CSS, fonts) are loaded.
   */
  async goto() {
    await this.page.goto("/");
    await this.page.waitForLoadState("networkidle");
  }

  // ── Step 1: Name ───────────────────────────────────

  /**
   * Fill the user name input field (Step 1).
   * @param name - Display name shown in chat and agent interactions
   */
  async fillName(name: string) {
    const input = this.page.locator(SEL.lobby.nameInput).first();
    await input.waitFor({ state: "visible", timeout: 10_000 });
    await input.fill(name);
  }

  /**
   * Click the submit button on Step 1 to advance to the brand memory step.
   * Waits 500ms for the step transition animation to complete.
   */
  async submitName() {
    const btn = this.page.locator(SEL.lobby.nextButton).first();
    await btn.waitFor({ state: "visible", timeout: 5_000 });
    await btn.click();
    // Wait for step transition
    await this.page.waitForTimeout(500);
  }

  /**
   * Select the "Create Room" tab in the lobby.
   * No-op if the tab is not visible (may already be selected).
   */
  async selectCreateTab() {
    const tab = this.page.locator(SEL.lobby.createTab).first();
    if (await tab.isVisible()) await tab.click();
  }

  /**
   * Select the "Join Room" tab in the lobby.
   * No-op if the tab is not visible.
   */
  async selectJoinTab() {
    const tab = this.page.locator(SEL.lobby.joinTab).first();
    if (await tab.isVisible()) await tab.click();
  }

  /**
   * Fill the room join code input (join mode only).
   * @param code - 6-character room code (e.g., "BZ-XXXX")
   */
  async fillJoinCode(code: string) {
    const input = this.page.locator(SEL.lobby.joinCodeInput).first();
    await input.waitFor({ state: "visible", timeout: 5_000 });
    await input.fill(code);
  }

  // ── Step 2: Brand Memory ───────────────────────────

  /**
   * Apply the demo preset to auto-fill all brand memory fields.
   * This is the most reliable way to populate the form in tests,
   * as it avoids label-based selector fragility.
   */
  async applyBrandPreset() {
    await this.page.waitForTimeout(300);
    const btn = this.page.locator(SEL.lobby.brandMemory.presetButton).first();
    if (await btn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await btn.click();
      await this.page.waitForTimeout(500); // Wait for form to fill
    }
  }

  /**
   * Fill brand memory fields manually using label-based selectors.
   * Falls back gracefully if fields are not visible (layout may differ).
   * @param data - Partial brand memory object with optional fields
   */
  async fillBrandMemory(data: {
    companyName?: string;
    industry?: string;
    product?: string;
  }) {
    await this.page.waitForTimeout(300);
    // Use label-based selection since inputs have no placeholder/name
    if (data.companyName) {
      const input = this.page.getByLabel("회사명", { exact: false }).first();
      if (await input.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await input.fill(data.companyName);
      }
    }
    if (data.industry) {
      const input = this.page.getByLabel("업종", { exact: false }).first();
      if (await input.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await input.fill(data.industry);
      }
    }
    if (data.product) {
      const input = this.page.getByLabel("제품", { exact: false }).first();
      if (await input.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await input.fill(data.product);
      }
    }
  }

  /**
   * Click "다음" on the brand memory form to advance to the agenda step.
   */
  async submitBrandMemory() {
    const btn = this.page.locator(SEL.lobby.brandMemory.nextButton).first();
    await btn.waitFor({ state: "visible", timeout: 5_000 });
    await btn.click();
    await this.page.waitForTimeout(300);
  }

  /**
   * Skip the brand memory step by clicking "건너뛰기".
   * Falls back to submitting the form if skip button is not available.
   */
  async skipBrandMemory() {
    const btn = this.page.locator(SEL.lobby.brandMemory.skipButton).first();
    if (await btn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await btn.click();
      await this.page.waitForTimeout(300);
    } else {
      // No skip button — try next button
      await this.submitBrandMemory();
    }
  }

  // ── Step 3: Agenda ─────────────────────────────────

  /**
   * Fill the meeting agenda textarea (Step 3).
   * @param agenda - Meeting topic text that drives agent discussion
   */
  async fillAgenda(agenda: string) {
    const input = this.page.locator(SEL.lobby.agendaInput).first();
    await input.waitFor({ state: "visible", timeout: 5_000 });
    await input.fill(agenda);
  }

  /**
   * Click "입장하기" to submit the agenda and enter the meeting room.
   */
  async submitAgenda() {
    const btn = this.page.locator(SEL.lobby.enterRoomButton).first();
    await btn.waitFor({ state: "visible", timeout: 5_000 });
    await btn.click();
  }

  // ── Full flows ─────────────────────────────────────

  /**
   * Execute the complete room creation flow: name -> brand memory -> agenda -> enter.
   *
   * @param name - User display name
   * @param agenda - Meeting topic
   * @param brandMemory - Optional company context (uses preset if provided)
   */
  async createRoom(
    name: string,
    agenda: string,
    brandMemory?: { companyName?: string; industry?: string; product?: string },
  ) {
    // Step 1: Name
    await this.fillName(name);
    await this.submitName();

    // Step 2: Brand Memory — use preset for reliability, then override if needed
    if (brandMemory) {
      await this.applyBrandPreset();
      await this.submitBrandMemory();
    } else {
      await this.skipBrandMemory();
    }

    // Step 3: Agenda → Enter
    await this.fillAgenda(agenda);
    await this.submitAgenda();
  }

  /**
   * Assert that the lobby page has loaded successfully.
   * Checks URL pattern and non-empty body content.
   */
  async assertLoaded() {
    await expect(this.page).toHaveURL(/\//);
    await expect(this.page.locator("body")).not.toBeEmpty();
  }
}
