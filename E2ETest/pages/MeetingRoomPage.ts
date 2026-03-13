import { Page, expect } from "@playwright/test";
import { SEL } from "../fixtures/selectors";

/** Page Object for the 3D Meeting Room */
export class MeetingRoomPage {
  constructor(private page: Page) {}

  /** Wait for meeting room to be visible (3D canvas loaded) */
  async waitForLoad(timeout = 30_000) {
    // Wait for canvas (Three.js) or main meeting container
    await this.page.waitForSelector(SEL.meeting.canvas3d, {
      state: "visible",
      timeout,
    });
  }

  /** Click the meeting start button */
  async clickStartMeeting() {
    const btn = this.page.locator(SEL.meeting.startButton).first();
    await btn.waitFor({ state: "visible", timeout: 10_000 });
    await btn.click();
  }

  /** Get current meeting phase from UI */
  async getPhase(): Promise<string> {
    const el = this.page.locator(SEL.meeting.phaseIndicator).first();
    if (await el.isVisible()) {
      return (await el.textContent()) ?? "unknown";
    }
    return "unknown";
  }

  // ── Mode controls ──────────────────────────────────

  async switchToLive() {
    const btn = this.page.locator(SEL.mode.liveButton).first();
    if (await btn.isVisible()) await btn.click();
  }

  async switchToDm() {
    const btn = this.page.locator(SEL.mode.dmButton).first();
    if (await btn.isVisible()) await btn.click();
  }

  async switchToAuto() {
    const btn = this.page.locator(SEL.mode.autoButton).first();
    if (await btn.isVisible()) await btn.click();
  }

  async selectDmAgent(agentName: string) {
    const picker = this.page.locator(SEL.mode.dmPicker);
    await picker.waitFor({ state: "visible", timeout: 5_000 });
    const agent = picker.locator(`text=${agentName}`).first();
    await agent.click();
  }

  // ── BigScreen / Sophia ─────────────────────────────

  async isBigScreenVisible(): Promise<boolean> {
    return this.page.locator(SEL.bigScreen.root).isVisible();
  }

  async clickBigScreenNext() {
    const btn = this.page.locator(SEL.bigScreen.nextButton).first();
    if (await btn.isVisible()) await btn.click();
  }

  async clickBigScreenPrev() {
    const btn = this.page.locator(SEL.bigScreen.prevButton).first();
    if (await btn.isVisible()) await btn.click();
  }

  async isSophiaBlobVisible(): Promise<boolean> {
    return this.page.locator(SEL.sophia.blob).isVisible();
  }

  // ── Chairman controls ──────────────────────────────

  async clickAiOpinion() {
    const btn = this.page.locator(SEL.chairman.aiOpinionButton).first();
    if (await btn.isVisible()) await btn.click();
  }

  async clickNextAgenda() {
    const btn = this.page.locator(SEL.chairman.nextAgendaButton).first();
    if (await btn.isVisible()) await btn.click();
  }

  // ── Assertions ─────────────────────────────────────

  async assertCanvasRendered() {
    const canvas = this.page.locator(SEL.meeting.canvas3d).first();
    await expect(canvas).toBeVisible();
  }

  async assertMeetingStarted() {
    // After meeting start, chat area or opening message should appear
    await this.page.waitForSelector(SEL.chat.messageBubble, {
      state: "visible",
      timeout: 30_000,
    });
  }
}
