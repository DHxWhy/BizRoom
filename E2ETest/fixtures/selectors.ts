/** Centralized CSS/aria selectors for Page Objects */

export const SEL = {
  // Lobby — multi-step flow: name → brandMemory → agenda
  lobby: {
    root: "[data-testid='lobby-page'], .lobby-page, main",
    nameInput: "#lobby-name-input, input[placeholder*='김대표'], input[type='text']",
    // Step 1: "다음" button (create mode) or "입장하기" (join mode)
    nextButton: "button[type='submit']",
    createTab: "button:has-text('만들기')",
    joinTab: "button:has-text('참가하기')",
    joinCodeInput: "#lobby-room-input, input[placeholder*='BZ-']",
    // Step 3: Agenda (separate step)
    agendaInput: "textarea",
    enterRoomButton: "button:has-text('입장하기')",
    brandMemory: {
      presetButton: "button:has-text('프리셋 적용'), button:has-text('데모 프리셋')",
      nextButton: "button:has-text('다음'):not(:has-text('안건'))",
      skipButton: "button:has-text('건너뛰기')",
    },
  },

  // Meeting room
  meeting: {
    root: "[data-testid='meeting-room'], .meeting-room, main",
    canvas3d: "canvas",
    startButton: "button:has-text('시작'), button:has-text('Start')",
    banner: "[data-testid='meeting-banner'], .meeting-banner",
    phaseIndicator: "[data-testid='phase'], .phase-indicator",
  },

  // Chat
  chat: {
    root: "[data-testid='chat-room'], .chat-room, .chat-panel",
    messageList: "[data-testid='message-list'], .message-list, .chat-messages",
    messageBubble: "[data-testid='message-bubble'], .message-bubble, .chat-message",
    agentMessage: ".agent-message, [data-sender-type='agent']",
    humanMessage: ".human-message, [data-sender-type='human']",
    typingIndicator: "[data-testid='typing-indicator'], .typing-indicator",
    streamingMessage: "[data-streaming='true'], .streaming",
  },

  // Input
  input: {
    root: "[data-testid='input-area'], .input-area",
    textInput: "textarea, input[type='text']",
    sendButton: "button[type='submit'], button:has-text('전송'), button:has-text('Send')",
    micButton: "[data-testid='mic-toggle'], button:has-text('🎤'), .mic-button",
  },

  // Mode selector
  mode: {
    root: "[data-testid='mode-selector'], .mode-selector",
    liveButton: "button:has-text('Live'), button:has-text('라이브')",
    dmButton: "button:has-text('DM')",
    autoButton: "button:has-text('Auto'), button:has-text('자동')",
    dmPicker: "[data-testid='dm-picker'], .dm-picker",
    dmAgentOption: "[data-testid='dm-agent'], .dm-agent-option",
  },

  // BigScreen & Sophia
  bigScreen: {
    root: "[data-testid='big-screen'], .big-screen, .artifact-screen",
    prevButton: "button:has-text('Prev'), button:has-text('이전')",
    nextButton: "button:has-text('Next'), button:has-text('다음')",
  },
  sophia: {
    blob: "[data-testid='sophia-blob'], .sophia-blob",
    message: "[data-testid='sophia-message'], .sophia-message",
  },

  // Artifacts
  artifact: {
    preview: "[data-testid='artifact-preview'], .artifact-preview",
    downloadButton: "button:has-text('다운로드'), button:has-text('Download')",
  },

  // Chairman controls
  chairman: {
    root: "[data-testid='chairman-controls'], .chairman-controls",
    aiOpinionButton: "button:has-text('AI 의견')",
    nextAgendaButton: "button:has-text('다음 안건')",
    pauseButton: "button:has-text('일시정지'), button:has-text('Pause')",
  },

  // Connection
  connection: {
    badge: "[data-testid='connection-badge'], .connection-badge",
  },
} as const;
