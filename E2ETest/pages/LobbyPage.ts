import { Page, expect } from "@playwright/test";
import { SEL } from "../fixtures/selectors";

/**
 * Page Object for the Lobby — multi-step flow:
 *  Step 1 (name): name input + "다음" submit
 *  Step 2 (brandMemory): BrandMemoryForm + "다음"
 *  Step 3 (agenda): textarea + "입장하기"
 */
export class LobbyPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto("/");
    await this.page.waitForLoadState("networkidle");
  }

  // ── Step 1: Name ───────────────────────────────────

  async fillName(name: string) {
    const input = this.page.locator(SEL.lobby.nameInput).first();
    await input.waitFor({ state: "visible", timeout: 10_000 });
    await input.fill(name);
  }

  /** Click submit on step 1 → goes to brand memory step (create mode) */
  async submitName() {
    const btn = this.page.locator(SEL.lobby.nextButton).first();
    await btn.waitFor({ state: "visible", timeout: 5_000 });
    await btn.click();
    // Wait for step transition
    await this.page.waitForTimeout(500);
  }

  async selectCreateTab() {
    const tab = this.page.locator(SEL.lobby.createTab).first();
    if (await tab.isVisible()) await tab.click();
  }

  async selectJoinTab() {
    const tab = this.page.locator(SEL.lobby.joinTab).first();
    if (await tab.isVisible()) await tab.click();
  }

  async fillJoinCode(code: string) {
    const input = this.page.locator(SEL.lobby.joinCodeInput).first();
    await input.waitFor({ state: "visible", timeout: 5_000 });
    await input.fill(code);
  }

  // ── Step 2: Brand Memory ───────────────────────────

  /** Apply demo preset to fill all required brand memory fields */
  async applyBrandPreset() {
    await this.page.waitForTimeout(300);
    const btn = this.page.locator(SEL.lobby.brandMemory.presetButton).first();
    if (await btn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await btn.click();
      await this.page.waitForTimeout(500); // Wait for form to fill
    }
  }

  /** Fill brand memory manually using getByLabel */
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

  /** Click "다음" on brand memory form → goes to agenda step */
  async submitBrandMemory() {
    const btn = this.page.locator(SEL.lobby.brandMemory.nextButton).first();
    await btn.waitFor({ state: "visible", timeout: 5_000 });
    await btn.click();
    await this.page.waitForTimeout(300);
  }

  /** Click "건너뛰기" to skip brand memory */
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

  async fillAgenda(agenda: string) {
    const input = this.page.locator(SEL.lobby.agendaInput).first();
    await input.waitFor({ state: "visible", timeout: 5_000 });
    await input.fill(agenda);
  }

  /** Click "입장하기" → enters the meeting room */
  async submitAgenda() {
    const btn = this.page.locator(SEL.lobby.enterRoomButton).first();
    await btn.waitFor({ state: "visible", timeout: 5_000 });
    await btn.click();
  }

  // ── Full flows ─────────────────────────────────────

  /** Complete create-room flow: name → brand memory → agenda → enter */
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

  /** Assert lobby page loaded */
  async assertLoaded() {
    await expect(this.page).toHaveURL(/\//);
    await expect(this.page.locator("body")).not.toBeEmpty();
  }
}
