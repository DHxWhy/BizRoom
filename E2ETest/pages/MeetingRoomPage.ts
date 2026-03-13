/**
 * @file MeetingRoomPage.ts
 * @description Page Object for the 3D Meeting Room.
 *
 * Encapsulates interactions with:
 *   - Three.js/R3F canvas (3D scene)
 *   - Meeting start button
 *   - Phase indicator (SnippetManager)
 *   - Mode selector (Live/DM/Auto)
 *   - BigScreen pagination
 *   - Sophia blob visibility
 *   - Chairman controls
 */

import { Page, expect } from "@playwright/test";
import { SEL } from "../fixtures/selectors";

export class MeetingRoomPage {
  constructor(private page: Page) {}

  /**
   * Wait for the meeting room to fully load (3D canvas visible).
   * @param timeout - Maximum wait time in milliseconds
   */
  async waitForLoad(timeout = 30_000) {
    await this.page.waitForSelector(SEL.meeting.canvas3d, {
      state: "visible",
      timeout,
    });
  }

  /**
   * Click the "Start Meeting" button to initiate the orchestration pipeline.
   * This triggers TurnManager, SignalR connection, and COO agent invocation.
   */
  async clickStartMeeting() {
    const btn = this.page.locator(SEL.meeting.startButton).first();
    await btn.waitFor({ state: "visible", timeout: 10_000 });
    await btn.click();
  }

  /**
   * Read the current meeting phase from the UI indicator.
   * @returns Phase text (e.g., "opening", "discussing") or "unknown" if not visible
   */
  async getPhase(): Promise<string> {
    const el = this.page.locator(SEL.meeting.phaseIndicator).first();
    if (await el.isVisible()) {
      return (await el.textContent()) ?? "unknown";
    }
    return "unknown";
  }

  // ── Mode controls ──────────────────────────────────

  /**
   * Switch to Live mode (default multi-agent participation).
   * No-op if the button is not visible (may already be in Live mode).
   */
  async switchToLive() {
    const btn = this.page.locator(SEL.mode.liveButton).first();
    if (await btn.isVisible()) await btn.click();
  }

  /**
   * Switch to DM mode (1:1 conversation with selected agent).
   * No-op if the button is not visible.
   */
  async switchToDm() {
    const btn = this.page.locator(SEL.mode.dmButton).first();
    if (await btn.isVisible()) await btn.click();
  }

  /**
   * Switch to Auto mode (autonomous agent discussion).
   * No-op if the button is not visible.
   */
  async switchToAuto() {
    const btn = this.page.locator(SEL.mode.autoButton).first();
    if (await btn.isVisible()) await btn.click();
  }

  /**
   * Select a specific agent in the DM picker dropdown.
   * @param agentName - Agent display name (e.g., "Amelia", "Hudson")
   */
  async selectDmAgent(agentName: string) {
    const picker = this.page.locator(SEL.mode.dmPicker);
    await picker.waitFor({ state: "visible", timeout: 5_000 });
    const agent = picker.locator(`text=${agentName}`).first();
    await agent.click();
  }

  // ── BigScreen / Sophia ─────────────────────────────

  /**
   * Check if the BigScreen visualization area is currently visible.
   * @returns true if the BigScreen root element is visible
   */
  async isBigScreenVisible(): Promise<boolean> {
    return this.page.locator(SEL.bigScreen.root).isVisible();
  }

  /**
   * Click the "Next" button to advance to the next BigScreen visualization.
   * No-op if the button is not visible (no history or feature not wired).
   */
  async clickBigScreenNext() {
    const btn = this.page.locator(SEL.bigScreen.nextButton).first();
    if (await btn.isVisible()) await btn.click();
  }

  /**
   * Click the "Prev" button to go back to the previous BigScreen visualization.
   * No-op if the button is not visible.
   */
  async clickBigScreenPrev() {
    const btn = this.page.locator(SEL.bigScreen.prevButton).first();
    if (await btn.isVisible()) await btn.click();
  }

  /**
   * Check if the SophiaBlob3D element is visible in the 3D scene.
   * @returns true if the Sophia blob element is visible
   */
  async isSophiaBlobVisible(): Promise<boolean> {
    return this.page.locator(SEL.sophia.blob).isVisible();
  }

  // ── Chairman controls ──────────────────────────────

  /**
   * Click the "AI Opinion" button to request agent insights on current topic.
   * No-op if the button is not visible.
   */
  async clickAiOpinion() {
    const btn = this.page.locator(SEL.chairman.aiOpinionButton).first();
    if (await btn.isVisible()) await btn.click();
  }

  /**
   * Click the "Next Agenda" button to advance to the next meeting topic.
   * No-op if the button is not visible.
   */
  async clickNextAgenda() {
    const btn = this.page.locator(SEL.chairman.nextAgendaButton).first();
    if (await btn.isVisible()) await btn.click();
  }

  // ── Assertions ─────────────────────────────────────

  /**
   * Assert that the Three.js canvas is visible (3D scene rendered).
   * This is the fundamental check that the meeting room loaded correctly.
   */
  async assertCanvasRendered() {
    const canvas = this.page.locator(SEL.meeting.canvas3d).first();
    await expect(canvas).toBeVisible();
  }

  /**
   * Assert that the meeting has started by waiting for the first message bubble.
   * The COO's opening message is the primary signal that the meeting is active.
   */
  async assertMeetingStarted() {
    await this.page.waitForSelector(SEL.chat.messageBubble, {
      state: "visible",
      timeout: 30_000,
    });
  }
}
