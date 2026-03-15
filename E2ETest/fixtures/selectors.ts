/**
 * @file selectors.ts
 * @description Centralized CSS and aria selectors for all Page Objects.
 *
 * All selectors are defined here as a single source of truth. Page Objects
 * reference these via `SEL.section.element` to ensure consistency and make
 * selector updates a single-file change.
 *
 * Selector strategy:
 *   - Primary: `[data-testid='...']` — stable, decoupled from styling
 *   - Fallback: `.class-name` — for components without data-testid
 *   - Last resort: `button:has-text('...')` — for text-based matching
 *   - Multiple selectors joined with `, ` — accommodates different builds
 */

export const SEL = {
  // ═══════════════════════════════════════════════════════════════════════
  // Lobby — multi-step flow: name -> brandMemory -> agenda -> enter
  // ═══════════════════════════════════════════════════════════════════════
  lobby: {
    /** Lobby page root container */
    root: "[data-testid='lobby-page'], .lobby-page, main",

    /** Step 1: Name input field */
    nameInput: "#lobby-name-input, input[placeholder*='김대표'], input[type='text']",

    /** Step 1: Submit / "다음" button (create mode) */
    nextButton: "button[type='submit']",

    /** Tab: Create new room */
    createTab: "button:has-text('만들기')",

    /** Tab: Join existing room */
    joinTab: "button:has-text('참가하기')",

    /** Join mode: Room code input */
    joinCodeInput: "#lobby-room-input, input[placeholder*='BZ-']",

    /** Step 3: Agenda textarea */
    agendaInput: "textarea",

    /** Step 3: Enter room button */
    enterRoomButton: "button:has-text('입장하기')",

    /** Step 2: Brand Memory sub-selectors */
    brandMemory: {
      /** Auto-fill with demo data */
      presetButton: "button:has-text('프리셋 적용'), button:has-text('데모 프리셋')",
      /** Next button (not the agenda next) */
      nextButton: "button:has-text('다음'):not(:has-text('안건'))",
      /** Skip brand memory step */
      skipButton: "button:has-text('건너뛰기')",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Meeting Room — 3D scene, start button, phase indicator
  // ═══════════════════════════════════════════════════════════════════════
  meeting: {
    /** Meeting room root container */
    root: "[data-testid='meeting-room'], .meeting-room, main",

    /** Three.js / R3F canvas element */
    canvas3d: "canvas",

    /** Start meeting call-to-action button */
    startButton: "button:has-text('시작'), button:has-text('Start')",

    /** Meeting status banner */
    banner: "[data-testid='meeting-banner'], .meeting-banner",

    /** SnippetManager phase indicator (Open/Discuss/Decide/Act) */
    phaseIndicator: "[data-testid='phase'], .phase-indicator",
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Chat Panel — messages, typing indicator, streaming
  // ═══════════════════════════════════════════════════════════════════════
  chat: {
    /** Chat panel root container — ChatRoom uses role="log" */
    root: "[data-testid='chat-room'], [role='log'], .chat-room, .chat-panel",

    /** Message list scrollable container */
    messageList: "[data-testid='message-list'], [role='log'], .message-list, .chat-messages",

    /** Individual message bubble (agent or human) — MessageBubble uses role="article" */
    messageBubble: "[role='article'], [data-testid='message-bubble'], .message-bubble, .chat-message",

    /** Agent-sent message bubbles — match aria-label containing known agent names */
    agentMessage: "[role='article'][aria-label*='Hudson'], [role='article'][aria-label*='Amelia'], [role='article'][aria-label*='Yusef'], [role='article'][aria-label*='Kelvin'], [role='article'][aria-label*='Jonas'], [role='article'][aria-label*='Bradley']",

    /** Human-sent message bubbles — article elements NOT matching any agent name */
    humanMessage: "[role='article']:not([aria-label*='Hudson']):not([aria-label*='Amelia']):not([aria-label*='Yusef']):not([aria-label*='Kelvin']):not([aria-label*='Jonas']):not([aria-label*='Bradley'])",

    /** Typing indicator (shown while agent is processing) */
    typingIndicator: "[data-testid='typing-indicator'], .typing-indicator",

    /** Currently streaming message (in-progress response) */
    streamingMessage: "[data-streaming='true'], .streaming",
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Input Area — text input, send button, microphone
  // ═══════════════════════════════════════════════════════════════════════
  input: {
    /** Input area root container */
    root: "[data-testid='input-area'], .input-area",

    /** Text input (textarea or input field) */
    textInput: "textarea, input[type='text']",

    /** Send message button */
    sendButton: "button[type='submit'], button:has-text('전송'), button:has-text('Send')",

    /** Push-to-Talk microphone toggle */
    micButton: "[data-testid='mic-toggle'], button:has-text('🎤'), .mic-button",
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Mode Selector — Live / DM / Auto toggle buttons
  // ═══════════════════════════════════════════════════════════════════════
  mode: {
    /** Mode selector root container */
    root: "[data-testid='mode-selector'], .mode-selector",

    /** Live mode button (default, multi-agent) */
    liveButton: "button:has-text('Live'), button:has-text('라이브')",

    /** DM mode button (1:1 conversation) */
    dmButton: "button:has-text('DM')",

    /** Auto mode button (autonomous agent discussion) */
    autoButton: "button:has-text('Auto'), button:has-text('자동')",

    /** DM agent picker dropdown/panel */
    dmPicker: "[data-testid='dm-picker'], .dm-picker",

    /** Individual agent option in DM picker */
    dmAgentOption: "[data-testid='dm-agent'], .dm-agent-option",
  },

  // ═══════════════════════════════════════════════════════════════════════
  // BigScreen and Sophia — visualization pipeline UI
  // ═══════════════════════════════════════════════════════════════════════
  bigScreen: {
    /** BigScreen root element (in-scene projection screen) */
    root: "[data-testid='big-screen'], .big-screen, .artifact-screen",

    /** Previous visualization button */
    prevButton: "button:has-text('Prev'), button:has-text('이전')",

    /** Next visualization button */
    nextButton: "button:has-text('Next'), button:has-text('다음')",
  },
  sophia: {
    /** SophiaBlob3D element (animated AI assistant in 3D scene) */
    blob: "[data-testid='sophia-blob'], .sophia-blob",

    /** Sophia chat message (visualization description) */
    message: "[data-testid='sophia-message'], .sophia-message",
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Artifacts — preview cards and download buttons
  // ═══════════════════════════════════════════════════════════════════════
  artifact: {
    /** Artifact preview card in chat */
    preview: "[data-testid='artifact-preview'], .artifact-preview",

    /** Artifact download button */
    downloadButton: "button:has-text('다운로드'), button:has-text('Download')",
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Chairman Controls — meeting moderation actions
  // ═══════════════════════════════════════════════════════════════════════
  chairman: {
    /** Chairman controls root container */
    root: "[data-testid='chairman-controls'], .chairman-controls",

    /** Request AI opinion on current topic */
    aiOpinionButton: "button:has-text('AI 의견')",

    /** Advance to next agenda item */
    nextAgendaButton: "button:has-text('다음 안건')",

    /** Pause/resume meeting */
    pauseButton: "button:has-text('일시정지'), button:has-text('Pause')",
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Connection — SignalR status indicators
  // ═══════════════════════════════════════════════════════════════════════
  connection: {
    /** Connection status badge (shows SignalR state) */
    badge: "[data-testid='connection-badge'], .connection-badge",
  },
} as const;
