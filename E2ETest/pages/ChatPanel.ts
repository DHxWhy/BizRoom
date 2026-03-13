/**
 * @file ChatPanel.ts
 * @description Page Object for the Chat Panel — messaging, streaming, and artifacts.
 *
 * Encapsulates interactions with:
 *   - Text input and send button
 *   - Message bubble reading and counting
 *   - Streaming indicator monitoring
 *   - Typing indicator monitoring
 *   - Artifact preview and download
 *   - Agent response assertions
 */

import { Page, expect, Locator } from "@playwright/test";
import { SEL } from "../fixtures/selectors";

export class ChatPanel {
  constructor(private page: Page) {}

  // ── Input ──────────────────────────────────────────

  /**
   * Type text into the chat input field.
   * @param text - Message text to type
   */
  async typeMessage(text: string) {
    const input = this.page.locator(SEL.input.textInput).first();
    await input.waitFor({ state: "visible", timeout: 10_000 });
    await input.fill(text);
  }

  /**
   * Click the send button to submit the typed message.
   */
  async clickSend() {
    const btn = this.page.locator(SEL.input.sendButton).first();
    await btn.waitFor({ state: "visible", timeout: 5_000 });
    await btn.click();
  }

  /**
   * Type a message and click send in one action.
   * @param text - Message text to send
   */
  async sendMessage(text: string) {
    await this.typeMessage(text);
    await this.clickSend();
  }

  /**
   * Send a message by pressing Enter instead of clicking the send button.
   * @param text - Message text to send
   */
  async sendMessageWithEnter(text: string) {
    const input = this.page.locator(SEL.input.textInput).first();
    await input.fill(text);
    await input.press("Enter");
  }

  // ── Messages ───────────────────────────────────────

  /**
   * Get a Locator for all message bubbles currently in the chat.
   * @returns Playwright Locator matching all message bubble elements
   */
  getMessages(): Locator {
    return this.page.locator(SEL.chat.messageBubble);
  }

  /**
   * Get the count of all message bubbles currently visible in the chat.
   * @returns Number of message bubbles
   */
  async getMessageCount(): Promise<number> {
    return this.getMessages().count();
  }

  /**
   * Wait until exactly N messages are visible in the chat.
   * @param count - Expected number of messages
   * @param timeout - Maximum wait time in milliseconds
   */
  async waitForMessageCount(count: number, timeout = 60_000) {
    await expect(this.getMessages()).toHaveCount(count, { timeout });
  }

  /**
   * Wait for the message count to exceed a known baseline.
   * Uses polling with progressive backoff intervals.
   * @param baselineCount - Message count before the expected new message
   * @param timeout - Maximum wait time in milliseconds
   */
  async waitForNewMessage(baselineCount: number, timeout = 60_000) {
    await expect(async () => {
      const current = await this.getMessageCount();
      expect(current).toBeGreaterThan(baselineCount);
    }).toPass({ timeout, intervals: [500, 1000, 2000] });
  }

  /**
   * Get the text content of the most recent message bubble.
   * @returns Text content of the last message, or empty string if no messages
   */
  async getLastMessageText(): Promise<string> {
    const messages = this.getMessages();
    const count = await messages.count();
    if (count === 0) return "";
    return (await messages.nth(count - 1).textContent()) ?? "";
  }

  /**
   * Get text content of all agent-sent messages.
   * @returns Array of agent message text strings
   */
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

  /**
   * Check if any message is currently in streaming state.
   * @returns true if a streaming indicator is visible
   */
  async isStreaming(): Promise<boolean> {
    return this.page.locator(SEL.chat.streamingMessage).isVisible();
  }

  /**
   * Wait for all streaming to finish (no streaming indicators remain).
   * Safe to call even if streaming never started — it will pass immediately.
   * @param timeout - Maximum wait time in milliseconds
   */
  async waitForStreamingDone(timeout = 60_000) {
    await expect(async () => {
      const streaming = await this.page
        .locator(SEL.chat.streamingMessage)
        .count();
      expect(streaming).toBe(0);
    }).toPass({ timeout, intervals: [1000, 2000] });
  }

  // ── Typing indicator ──────────────────────────────

  /**
   * Check if the typing indicator is currently visible.
   * @returns true if the typing indicator is shown
   */
  async isTypingVisible(): Promise<boolean> {
    return this.page.locator(SEL.chat.typingIndicator).isVisible();
  }

  /**
   * Wait for the typing indicator to appear.
   * @param timeout - Maximum wait time in milliseconds
   */
  async waitForTypingAppear(timeout = 15_000) {
    await this.page.waitForSelector(SEL.chat.typingIndicator, {
      state: "visible",
      timeout,
    });
  }

  /**
   * Wait for the typing indicator to disappear.
   * @param timeout - Maximum wait time in milliseconds
   */
  async waitForTypingDisappear(timeout = 60_000) {
    await this.page.waitForSelector(SEL.chat.typingIndicator, {
      state: "hidden",
      timeout,
    });
  }

  // ── Artifacts ──────────────────────────────────────

  /**
   * Get a Locator for all artifact preview elements in the chat.
   * @returns Playwright Locator matching artifact preview cards
   */
  async getArtifactPreviews(): Promise<Locator> {
    return this.page.locator(SEL.artifact.preview);
  }

  /**
   * Click the first visible artifact download button.
   * No-op if no download button is visible.
   */
  async clickDownloadArtifact() {
    const btn = this.page.locator(SEL.artifact.downloadButton).first();
    if (await btn.isVisible()) await btn.click();
  }

  // ── Assertions ─────────────────────────────────────

  /**
   * Assert that a human message with the given text appears in the chat.
   * @param text - Expected text content of the human message bubble
   */
  async assertHumanMessageSent(text: string) {
    await expect(
      this.page.locator(SEL.chat.messageBubble, { hasText: text }),
    ).toBeVisible({ timeout: 5_000 });
  }

  /**
   * Assert that an agent with the given name has responded in the chat.
   * Waits for a message bubble containing the agent's name to appear.
   * @param agentName - Agent display name (e.g., "Hudson", "Amelia", "Yusef")
   * @param timeout - Maximum wait time in milliseconds
   */
  async assertAgentResponded(agentName: string, timeout = 60_000) {
    await expect(
      this.page.locator(SEL.chat.messageBubble, { hasText: agentName }),
    ).toBeVisible({ timeout });
  }
}
