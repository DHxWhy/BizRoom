import { Page, expect, Locator } from "@playwright/test";
import { SEL } from "../fixtures/selectors";

/** Page Object for the Chat panel — messaging, streaming, typing */
export class ChatPanel {
  constructor(private page: Page) {}

  // ── Input ──────────────────────────────────────────

  async typeMessage(text: string) {
    const input = this.page.locator(SEL.input.textInput).first();
    await input.waitFor({ state: "visible", timeout: 10_000 });
    await input.fill(text);
  }

  async clickSend() {
    const btn = this.page.locator(SEL.input.sendButton).first();
    await btn.waitFor({ state: "visible", timeout: 5_000 });
    await btn.click();
  }

  async sendMessage(text: string) {
    await this.typeMessage(text);
    await this.clickSend();
  }

  /** Send message via Enter key */
  async sendMessageWithEnter(text: string) {
    const input = this.page.locator(SEL.input.textInput).first();
    await input.fill(text);
    await input.press("Enter");
  }

  // ── Messages ───────────────────────────────────────

  /** Get all message bubbles */
  getMessages(): Locator {
    return this.page.locator(SEL.chat.messageBubble);
  }

  /** Get count of all messages currently visible */
  async getMessageCount(): Promise<number> {
    return this.getMessages().count();
  }

  /** Wait for at least N messages to appear */
  async waitForMessageCount(count: number, timeout = 60_000) {
    await expect(this.getMessages()).toHaveCount(count, { timeout });
  }

  /** Wait for message count to increase from a known baseline */
  async waitForNewMessage(baselineCount: number, timeout = 60_000) {
    await expect(async () => {
      const current = await this.getMessageCount();
      expect(current).toBeGreaterThan(baselineCount);
    }).toPass({ timeout, intervals: [500, 1000, 2000] });
  }

  /** Get text content of the last message bubble */
  async getLastMessageText(): Promise<string> {
    const messages = this.getMessages();
    const count = await messages.count();
    if (count === 0) return "";
    return (await messages.nth(count - 1).textContent()) ?? "";
  }

  /** Get all agent message texts */
  async getAgentMessages(): Promise<string[]> {
    const agents = this.page.locator(SEL.chat.agentMessage);
    const count = await agents.count();
    const texts: string[] = [];
    for (let i = 0; i < count; i++) {
      texts.push((await agents.nth(i).textContent()) ?? "");
    }
    return texts;
  }

  // ── Streaming ──────────────────────────────────────

  /** Check if any message is currently streaming */
  async isStreaming(): Promise<boolean> {
    return this.page.locator(SEL.chat.streamingMessage).isVisible();
  }

  /** Wait for all streaming to finish (no streaming indicators) */
  async waitForStreamingDone(timeout = 60_000) {
    // Wait until no streaming messages exist
    await expect(async () => {
      const streaming = await this.page
        .locator(SEL.chat.streamingMessage)
        .count();
      expect(streaming).toBe(0);
    }).toPass({ timeout, intervals: [1000, 2000] });
  }

  // ── Typing indicator ──────────────────────────────

  async isTypingVisible(): Promise<boolean> {
    return this.page.locator(SEL.chat.typingIndicator).isVisible();
  }

  async waitForTypingAppear(timeout = 15_000) {
    await this.page.waitForSelector(SEL.chat.typingIndicator, {
      state: "visible",
      timeout,
    });
  }

  async waitForTypingDisappear(timeout = 60_000) {
    await this.page.waitForSelector(SEL.chat.typingIndicator, {
      state: "hidden",
      timeout,
    });
  }

  // ── Artifacts ──────────────────────────────────────

  async getArtifactPreviews(): Promise<Locator> {
    return this.page.locator(SEL.artifact.preview);
  }

  async clickDownloadArtifact() {
    const btn = this.page.locator(SEL.artifact.downloadButton).first();
    if (await btn.isVisible()) await btn.click();
  }

  // ── Assertions ─────────────────────────────────────

  async assertHumanMessageSent(text: string) {
    // After sending, the human message should appear in chat
    await expect(
      this.page.locator(SEL.chat.messageBubble, { hasText: text }),
    ).toBeVisible({ timeout: 5_000 });
  }

  async assertAgentResponded(agentName: string, timeout = 60_000) {
    // Wait for a message containing the agent name
    await expect(
      this.page.locator(SEL.chat.messageBubble, { hasText: agentName }),
    ).toBeVisible({ timeout });
  }
}
