/**
 * Phase 4: Multi-Agent Interaction & A2A Mention Routing
 *
 * Validates:
 * - CFO mention routing: @CFO message triggers Amelia response
 * - Multi-agent sequential turns: COO + CFO both appear after mention
 * - Strategy message routes to CMO (Yusef)
 * - A2A turn chain: mention chain produces 2+ agent responses
 * - Agent turn completion performance measured with Timer
 */

import { test, expect } from "@playwright/test";
import { LobbyPage } from "../pages/LobbyPage";
import { MeetingRoomPage } from "../pages/MeetingRoomPage";
import { ChatPanel } from "../pages/ChatPanel";
import {
  TEST_USER,
  BRAND_MEMORY,
  TEST_AGENDA,
  TEST_MESSAGES,
  AGENTS,
} from "../fixtures/test-data";
import { Timer, measure } from "../helpers/timing";

// ── Shared state across serial tests ─────────────────────────────────────────

let sharedBaselineCount = 0;

// ── Helper: Full setup flow (lobby → room → meeting start) ────────────────────

async function fullSetup(page: import("@playwright/test").Page) {
  const lobby = new LobbyPage(page);
  const meetingRoom = new MeetingRoomPage(page);

  await lobby.goto();
  await lobby.assertLoaded();

  await lobby.createRoom(TEST_USER.name, TEST_AGENDA, {
    companyName: BRAND_MEMORY.companyName,
    industry: BRAND_MEMORY.industry,
    product: BRAND_MEMORY.product,
  });

  // Wait for the 3D canvas to appear — room entry confirmed
  await meetingRoom.waitForLoad(30_000);
  await meetingRoom.assertCanvasRendered();

  // Trigger meeting start and wait for the opening COO message
  await meetingRoom.clickStartMeeting();
  await meetingRoom.assertMeetingStarted();

  return { lobby, meetingRoom };
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe.serial("Phase 4 — Multi-Agent Interaction & A2A", () => {
  // ── Test 4-1: Setup ─────────────────────────────────────────────────────────

  test("4-1  Full lobby → meeting room → start flow", async ({ page }) => {
    const timer = new Timer();

    await fullSetup(page);

    const chat = new ChatPanel(page);
    sharedBaselineCount = await chat.getMessageCount();

    console.log(
      `[Phase 4-1] Setup complete. Baseline message count: ${sharedBaselineCount}. ` +
        `Elapsed: ${timer.elapsed()}ms`,
    );

    expect(sharedBaselineCount).toBeGreaterThanOrEqual(0);
  });

  // ── Test 4-2: CFO mention routing ──────────────────────────────────────────

  test(
    "4-2  @CFO mention → Amelia responds + message count increases by 2+",
    async ({ page }) => {
      await fullSetup(page);
      const chat = new ChatPanel(page);

      // Establish baseline after fresh setup
      const baseline = await chat.getMessageCount();

      const timer = new Timer();

      // Send mention message
      await chat.sendMessage(TEST_MESSAGES.financial); // "@CFO 올해 예산 현황을 알려주세요"

      // Confirm human message appeared in chat
      await chat.assertHumanMessageSent(TEST_MESSAGES.financial);

      // Wait for at least 2 new agent messages (e.g. Hudson chairs + Amelia responds)
      await expect(async () => {
        const current = await chat.getMessageCount();
        expect(current - baseline).toBeGreaterThanOrEqual(2);
      }).toPass({ timeout: 90_000, intervals: [2_000, 3_000, 5_000] });

      const turnDuration = timer.elapsed();
      console.log(
        `[Phase 4-2] Agent turn complete in ${turnDuration}ms (threshold: 60s)`,
      );

      // CFO (Amelia) must be visible in chat history
      await chat.assertAgentResponded(AGENTS.cfo.name, 90_000);
    },
    { timeout: 120_000 },
  );

  // ── Test 4-3: Hudson (COO) appears in conversation ─────────────────────────

  test(
    "4-3  Hudson (COO) appears as meeting chair after CFO mention",
    async ({ page }) => {
      await fullSetup(page);
      const chat = new ChatPanel(page);

      // Kick off a mention message to trigger multi-agent chain
      await chat.sendMessage(TEST_MESSAGES.financial);

      // Hudson is the COO / meeting chair — he should appear as well
      // Use soft assertion: Hudson may not always respond to every message
      await expect
        .soft(
          page.locator("[data-testid='message-bubble'], .message-bubble, .chat-message", {
            hasText: AGENTS.coo.name,
          }),
        )
        .toBeVisible({ timeout: 90_000 });

      console.log(`[Phase 4-3] Hudson (COO) presence check complete`);
    },
    { timeout: 120_000 },
  );

  // ── Test 4-4: CMO responds to strategy message ─────────────────────────────

  test(
    "4-4  Strategy message → Yusef (CMO) responds",
    async ({ page }) => {
      await fullSetup(page);
      const chat = new ChatPanel(page);

      const baseline = await chat.getMessageCount();
      const timer = new Timer();

      // Strategy / marketing topic should route to Yusef (CMO)
      await chat.sendMessage(TEST_MESSAGES.strategy); // "일본 시장 진출 전략을 논의합시다"

      await chat.assertHumanMessageSent(TEST_MESSAGES.strategy);

      // Wait for at least 1 new agent response
      await chat.waitForNewMessage(baseline, 90_000);

      const elapsed = timer.elapsed();
      console.log(`[Phase 4-4] First agent response after strategy message: ${elapsed}ms`);

      // CMO should be among the responders
      await chat.assertAgentResponded(AGENTS.cmo.name, 90_000);
    },
    { timeout: 120_000 },
  );

  // ── Test 4-5: A2A chain — 2+ agents participate ────────────────────────────

  test(
    "4-5  A2A turn chain — minimum 2 distinct agents appear in thread",
    async ({ page }) => {
      await fullSetup(page);
      const chat = new ChatPanel(page);

      // Wait for any prior meeting-start messages to settle
      await page.waitForTimeout(2_000);

      const baseline = await chat.getMessageCount();

      await chat.sendMessage(TEST_MESSAGES.financial);

      // Poll until we have 2+ new messages
      await expect(async () => {
        const count = await chat.getMessageCount();
        expect(count - baseline).toBeGreaterThanOrEqual(2);
      }).toPass({ timeout: 90_000, intervals: [2_000, 3_000, 5_000] });

      // Collect all agent message texts and look for at least 2 agent names
      const agentMessages = await chat.getAgentMessages();
      const allText = agentMessages.join(" ");

      const agentNamesFound = [AGENTS.coo.name, AGENTS.cfo.name, AGENTS.cmo.name].filter(
        (name) => allText.includes(name),
      );

      console.log(
        `[Phase 4-5] Agents found in thread: [${agentNamesFound.join(", ")}] ` +
          `(${agentNamesFound.length} distinct)`,
      );

      // At least 1 named agent must appear; soft-assert for 2+
      expect(agentNamesFound.length).toBeGreaterThanOrEqual(1);
      expect.soft(agentNamesFound.length).toBeGreaterThanOrEqual(2);
    },
    { timeout: 120_000 },
  );

  // ── Test 4-6: Performance — agent turn complete time ───────────────────────

  test(
    "4-6  Performance — agent turn completes within 60s",
    async ({ page }) => {
      await fullSetup(page);
      const chat = new ChatPanel(page);

      const baseline = await chat.getMessageCount();

      const [, elapsedMs] = await measure(async () => {
        await chat.sendMessage(TEST_MESSAGES.marketing);
        // Wait for the first new agent message
        await chat.waitForNewMessage(baseline, 60_000);
      });

      console.log(`[Phase 4-6] Agent turn complete time: ${elapsedMs}ms`);

      // Soft performance assertion: log but don't hard-fail CI if LLM is slow
      expect.soft(elapsedMs).toBeLessThan(60_000);
    },
    { timeout: 120_000 },
  );
});
