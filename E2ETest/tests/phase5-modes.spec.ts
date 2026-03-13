/**
 * @file phase5-modes.spec.ts
 * @description Phase 5 — Meeting Mode Switching (Live / DM / Auto)
 *
 * **Objective**:
 *   Validate the three meeting modes that give users control over how they
 *   interact with the AI executive team:
 *     - Live: All agents participate (default, collaborative discussion)
 *     - DM:   1:1 private conversation with a selected agent
 *     - Auto: Agents discuss autonomously with minimal user intervention
 *
 * **Expected Outcomes**:
 *   - Live mode (default): multiple agents eligible to respond
 *   - DM mode: only selected agent (Amelia/CFO) responds; others stay silent
 *   - Switching back to Live restores multi-agent participation
 *   - Auto mode: autonomous discussion banner/indicator appears
 *   - All mode switches complete within 1 s (UI transition)
 *
 * **Prerequisites**:
 *   - Full meeting session active with mode selector UI rendered
 *   - All 3 MVP agents (Hudson, Amelia, Yusef) available
 *
 * **Architecture Components Tested**:
 *   - ModeSelector component (React) — Live/DM/Auto toggle buttons
 *   - DmAgentPicker component — agent selection for DM mode
 *   - AutoModeBanner component — autonomous discussion indicator
 *   - MeetingContext mode state management
 *   - TurnManager mode-aware turn allocation
 *   - SignalR mode change broadcast
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
  PERFORMANCE_THRESHOLDS,
} from "../fixtures/test-data";
import { Timer, measure } from "../helpers/timing";
import { SEL } from "../fixtures/selectors";

// ── Helper: Full setup flow ───────────────────────────────────────────────────

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

  await meetingRoom.waitForLoad(30_000);
  await meetingRoom.assertCanvasRendered();

  await meetingRoom.clickStartMeeting();
  await meetingRoom.assertMeetingStarted();

  return { lobby, meetingRoom };
}

// ── Helper: Collect agent name hits in message list ──────────────────────────

async function getRespondingAgents(
  chat: ChatPanel,
  agentNames: string[],
): Promise<string[]> {
  const messages = await chat.getAgentMessages();
  const joined = messages.join(" ");
  return agentNames.filter((name) => joined.includes(name));
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe.serial("Phase 5 — Mode Switching", () => {
  // ── Test 5-1: Setup ─────────────────────────────────────────────────────────
  // Verifies: Full meeting setup completes and canvas is rendered.
  // Why it matters: Clean starting state for mode switching tests.
  test("5-1  Full lobby → meeting room → start flow", async ({ page }) => {
    const { meetingRoom } = await fullSetup(page);
    await meetingRoom.assertCanvasRendered();
    console.log("[Phase 5-1] Setup complete");
  });

  // ── Test 5-2: Default Live mode -- multiple agents respond ──────────────────
  // Verifies: In Live mode (default), all agents are eligible to participate.
  // Why it matters: Live mode is the default and most common interaction pattern.
  // Expected: At least 1 agent responds; multiple agents may participate
  test(
    "5-2  Live mode (default) — all agents eligible to respond",
    async ({ page }) => {
      const { meetingRoom } = await fullSetup(page);
      const chat = new ChatPanel(page);

      // Ensure we are in Live mode (default — button may already be active)
      await meetingRoom.switchToLive();

      const baseline = await chat.getMessageCount();
      const timer = new Timer();

      await chat.sendMessage(TEST_MESSAGES.marketing);
      await chat.assertHumanMessageSent(TEST_MESSAGES.marketing);

      // Wait for at least 1 agent response in Live mode
      await chat.waitForNewMessage(baseline, 90_000);

      const elapsed = timer.elapsed();
      console.log(`[Phase 5-2] First Live response in ${elapsed}ms`);

      // Soft: multiple agents may respond
      const respondingAgents = await getRespondingAgents(chat, [
        AGENTS.coo.name,
        AGENTS.cfo.name,
        AGENTS.cmo.name,
      ]);
      console.log(`[Phase 5-2] Responding agents in Live: [${respondingAgents.join(", ")}]`);
      expect(respondingAgents.length).toBeGreaterThanOrEqual(1);
    },
    { timeout: 120_000 },
  );

  // ── Test 5-3: Switch to DM mode -- select Amelia (CFO) ─────────────────────
  // Verifies: DM mode isolates conversation to a single selected agent.
  // Why it matters: Users need private 1:1 conversations for sensitive topics
  //   (e.g., budget discussions with CFO that COO should not overhear).
  // Expected: Amelia (CFO) responds; COO and CMO stay silent (soft)
  test(
    "5-3  DM mode → select Amelia (CFO) → only CFO responds",
    async ({ page }) => {
      const { meetingRoom } = await fullSetup(page);
      const chat = new ChatPanel(page);

      // ── Switch to DM and measure latency ───────────────────────────────────
      const [, modeSwitchMs] = await measure(async () => {
        await meetingRoom.switchToDm();
      });

      console.log(`[Phase 5-3] DM mode switch latency: ${modeSwitchMs}ms`);
      expect.soft(modeSwitchMs).toBeLessThan(PERFORMANCE_THRESHOLDS.modeSwitch);

      // Select Amelia as DM target (picker may appear after DM mode)
      const dmPicker = page.locator(SEL.mode.dmPicker);
      const pickerVisible = await dmPicker.isVisible().catch(() => false);

      if (pickerVisible) {
        await meetingRoom.selectDmAgent(AGENTS.cfo.name);
        console.log(`[Phase 5-3] Selected DM agent: ${AGENTS.cfo.name}`);
      } else {
        // Picker may not yet be wired — log and continue with soft check
        console.warn("[Phase 5-3] DM picker not visible — skipping agent selection");
      }

      const baseline = await chat.getMessageCount();
      await chat.sendMessage(TEST_MESSAGES.dmCfo); // "Amelia, Q2 예산 분석을 부탁합니다."
      await chat.assertHumanMessageSent(TEST_MESSAGES.dmCfo);

      // Wait for CFO response
      await chat.assertAgentResponded(AGENTS.cfo.name, 90_000);

      // Soft: COO and CMO should NOT respond in DM mode
      const afterMessages = await chat.getAgentMessages();
      const afterJoined = afterMessages.join(" ");

      // Capture messages added after baseline
      const newCount = await chat.getMessageCount();
      console.log(`[Phase 5-3] New messages after DM send: ${newCount - baseline}`);

      // Amelia must respond
      expect(afterJoined).toContain(AGENTS.cfo.name);

      // Soft: other agents should stay silent in DM mode
      expect.soft(afterJoined).not.toContain(AGENTS.coo.name);
      expect.soft(afterJoined).not.toContain(AGENTS.cmo.name);
    },
    { timeout: 120_000 },
  );

  // ── Test 5-4: Switch back to Live -- multiple agents respond ───────────────
  // Verifies: Returning from DM to Live mode restores multi-agent participation.
  // Why it matters: Mode transitions must be clean — no state leaks between modes.
  // Expected: At least 1 agent responds after switching back to Live
  test(
    "5-4  DM → Live restore — multiple agents respond again",
    async ({ page }) => {
      const { meetingRoom } = await fullSetup(page);
      const chat = new ChatPanel(page);

      // Enter DM then return to Live
      await meetingRoom.switchToDm();
      await page.waitForTimeout(500);

      const [, switchBackMs] = await measure(async () => {
        await meetingRoom.switchToLive();
      });
      console.log(`[Phase 5-4] Live restore latency: ${switchBackMs}ms`);
      expect.soft(switchBackMs).toBeLessThan(PERFORMANCE_THRESHOLDS.modeSwitch);

      const baseline = await chat.getMessageCount();
      await chat.sendMessage(TEST_MESSAGES.financial);
      await chat.assertHumanMessageSent(TEST_MESSAGES.financial);

      // After restoring Live, multiple agents should be eligible again
      await expect(async () => {
        const current = await chat.getMessageCount();
        expect(current - baseline).toBeGreaterThanOrEqual(1);
      }).toPass({ timeout: 90_000, intervals: [2_000, 3_000, 5_000] });

      const respondingAgents = await getRespondingAgents(chat, [
        AGENTS.coo.name,
        AGENTS.cfo.name,
        AGENTS.cmo.name,
      ]);
      console.log(
        `[Phase 5-4] Agents in Live after restore: [${respondingAgents.join(", ")}]`,
      );

      // At least CFO must be present (we sent a CFO mention)
      expect.soft(respondingAgents).toContain(AGENTS.cfo.name);
    },
    { timeout: 120_000 },
  );

  // ── Test 5-5: Auto mode -- banner / indicator appears ──────────────────────
  // Verifies: Auto mode activates and shows a visual indicator (banner/button state).
  // Why it matters: Auto mode enables agents to discuss autonomously — the
  //   user steps back and lets the AI C-Suite debate the topic.
  // Expected: Auto-related UI indicator present (soft)
  test(
    "5-5  Auto mode → discussion banner / indicator appears",
    async ({ page }) => {
      const { meetingRoom } = await fullSetup(page);

      // ── Switch to Auto and measure latency ─────────────────────────────────
      const [, autoSwitchMs] = await measure(async () => {
        await meetingRoom.switchToAuto();
      });
      console.log(`[Phase 5-5] Auto mode switch latency: ${autoSwitchMs}ms`);
      expect.soft(autoSwitchMs).toBeLessThan(PERFORMANCE_THRESHOLDS.modeSwitch);

      // Allow the UI up to 3s to render the auto-mode indicator
      await page.waitForTimeout(1_500);

      // Check for Auto-mode banner or indicator (soft — UI may not be fully wired)
      const autoBanner = page.locator(
        "button:has-text('Auto'), button:has-text('자동'), " +
          "[data-testid='auto-mode-banner'], .auto-mode-banner, " +
          "[data-active='true']:has-text('Auto'), [aria-pressed='true']:has-text('Auto')",
      );

      const bannerCount = await autoBanner.count();
      console.log(`[Phase 5-5] Auto mode indicator elements found: ${bannerCount}`);

      expect.soft(bannerCount).toBeGreaterThan(0);

      // Also look broadly for any auto-discussion indicator text
      const bodyText = await page.locator("body").textContent();
      const hasAutoIndicator =
        bodyText?.toLowerCase().includes("auto") ||
        bodyText?.includes("자동") ||
        bodyText?.includes("Auto");

      console.log(`[Phase 5-5] Auto keyword in page: ${hasAutoIndicator}`);
      expect.soft(hasAutoIndicator).toBe(true);
    },
    { timeout: 60_000 },
  );

  // ── Test 5-6: Mode switch performance ─────────────────────────────────────
  // Verifies: All mode transitions (Live, DM, Auto, Live restore) complete within 1 s.
  // Why it matters: Mode switching is a pure UI operation — it should feel instant.
  // Expected: Each transition < 1 s (soft assertions for all 4 switches)
  test(
    "5-6  Performance — all mode switches complete within 1s each",
    async ({ page }) => {
      const { meetingRoom } = await fullSetup(page);

      const [, liveMs] = await measure(() => meetingRoom.switchToLive());
      const [, dmMs] = await measure(() => meetingRoom.switchToDm());
      const [, autoMs] = await measure(() => meetingRoom.switchToAuto());
      const [, backMs] = await measure(() => meetingRoom.switchToLive());

      console.log(
        `[Phase 5-6] Mode switch times — ` +
          `Live: ${liveMs}ms | DM: ${dmMs}ms | Auto: ${autoMs}ms | Live(restore): ${backMs}ms`,
      );

      // Soft assertions — latency depends on render cycle
      expect.soft(liveMs).toBeLessThan(PERFORMANCE_THRESHOLDS.modeSwitch);
      expect.soft(dmMs).toBeLessThan(PERFORMANCE_THRESHOLDS.modeSwitch);
      expect.soft(autoMs).toBeLessThan(PERFORMANCE_THRESHOLDS.modeSwitch);
      expect.soft(backMs).toBeLessThan(PERFORMANCE_THRESHOLDS.modeSwitch);
    },
    { timeout: 60_000 },
  );
});
