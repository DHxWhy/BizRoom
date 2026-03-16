---
version: "1.0.0"
created: "2026-03-16 00:00"
updated: "2026-03-16 00:00"
---

# BizRoom.ai — 2-Minute Demo Script

**Total runtime**: 2:00
**Format**: Screen recording with voiceover
**Resolution**: 1920×1080, 60fps

---

## Scene 1 — The Problem (0:00 – 0:20)

### What to Say
> "Every business decision needs multiple expert perspectives — finance, marketing,
> legal, operations. But solo founders and small teams can't afford a full C-Suite.
> BizRoom.ai solves this: a virtual boardroom where six AI executives are always
> ready to meet — by voice, right now."

### What to Show
- Title card: **"BizRoom.ai — Your AI Executive Team"**
- Cut to the 3D meeting room loading: six agent avatars seated around the table
- Camera slowly orbits the room, avatars glow with their role colors
  - Hudson (COO, blue), Amelia (CFO, green), Yusef (CMO, orange)
  - Kelvin (CTO, cyan), Jonas (CDO, pink), Bradley (CLO, lime)
- Sophia orb pulses softly in the corner

### Timing
| Beat                          | Second |
| ----------------------------- | ------ |
| Title card appears            | 0:00   |
| 3D room loads, camera orbits  | 0:06   |
| All 6 avatars visible         | 0:14   |
| Scene ends                    | 0:20   |

---

## Scene 2 — Voice Meeting in Action (0:20 – 0:50)

### What to Say
> "Hold Spacebar to talk — Push-to-Talk. I'll ask about our Q2 marketing budget."
>
> *[Press Spacebar, speak into mic]*
> "Team, should we increase the digital marketing budget for Q2?"
>
> "The TurnManager routes my question to the most relevant agents. Watch Hudson
> coordinate, then Amelia and Yusef respond in sequence — exactly like a real
> executive meeting."

### What to Show
- PTT button highlights when Spacebar is held
- Web Speech API transcribes speech; text appears in chat panel in real time
- HTTP POST fires to `/api/message`
- Hudson's avatar animates (mouth/glow) and speaks:
  *"Let's hear from Amelia on the budget impact, then Yusef on channel strategy."*
- 500ms gap — Amelia's avatar activates:
  *"Current Q1 run rate is $42K. A 20% increase is within safe leverage ratio."*
- A2A mention chain — Yusef activates:
  *"I recommend shifting 60% to performance channels — CAC dropped 18% last quarter."*
- HoloMonitor beside each avatar shows their key points

### Timing
| Beat                          | Second |
| ----------------------------- | ------ |
| Spacebar held, mic activates  | 0:20   |
| Transcript appears            | 0:23   |
| Hudson responds               | 0:27   |
| Amelia responds               | 0:35   |
| Yusef responds                | 0:42   |
| Scene ends                    | 0:50   |

---

## Scene 3 — Sophia Real-Time Visualization (0:50 – 1:15)

### What to Say
> "While agents talk, Sophia — our Supporting Analysis Agent — is listening.
> She detects the discussion topic and instantly renders a chart on the BigScreen
> behind the table. No commands needed. The board room is always in sync."

### What to Show
- Agent response contains `visual_hint` JSON embedded in structured output
- Sophia's orb brightens — FIFO queue processing begins
- BigScreen (rear projection behind avatars) fades in with a **bar chart**:
  *"Q2 Marketing Budget — Proposed Allocation by Channel"*
  - Bars: SEO $8K · Paid Search $15K · Social $12K · Content $7K
- Cut to: user asks a follow-up question — "What's the CAC trend?"
- BigScreen transitions to a **line chart**: CAC trend over 6 quarters, declining
- Sophia message bubble appears in chat:
  *"I've updated the BigScreen with CAC trend data from Yusef's analysis."*

### Timing
| Beat                                    | Second |
| --------------------------------------- | ------ |
| Sophia orb brightens                    | 0:50   |
| BigScreen bar chart fades in            | 0:55   |
| Follow-up question about CAC            | 1:03   |
| BigScreen transitions to line chart     | 1:08   |
| Sophia message in chat panel            | 1:12   |
| Scene ends                              | 1:15   |

---

## Scene 4 — Artifact Generation (1:15 – 1:45)

### What to Say
> "At the end of the meeting, BizRoom automatically generates deliverables.
> Hudson closes the session — Sophia generates a full meeting minutes report,
> a PowerPoint deck, and an Excel budget model. Files go straight to OneDrive.
> Action items are pushed to Microsoft Planner. Zero manual work."

### What to Show
- Click "End Meeting" button in the meeting banner
- Hudson speaks closing remarks (avatar animates)
- Progress indicators appear: "Generating minutes…", "Building PPT…", "Creating Excel…"
- Three artifact cards appear: PDF minutes, `.pptx`, `.xlsx` — each with download button
- Screen share: OneDrive folder with the files already uploaded
- Microsoft Planner: two action items auto-created from Hudson's summary
- Brief preview of the PPT slide deck (title slide + agenda slide)

### Timing
| Beat                              | Second |
| --------------------------------- | ------ |
| "End Meeting" clicked             | 1:15   |
| Hudson closing remarks            | 1:18   |
| Artifact generation progress      | 1:25   |
| Three artifact cards appear       | 1:32   |
| OneDrive + Planner shown          | 1:38   |
| Scene ends                        | 1:45   |

---

## Scene 5 — Hero Technologies + CTA (1:45 – 2:00)

### What to Say
> "BizRoom is built on four Microsoft hero technologies:
> Azure AI Foundry Model Router, Microsoft Agent Framework,
> Azure MCP, and GitHub Copilot Agent Mode.
> Try it at bizroom.ai — your AI C-Suite is waiting."

### What to Show
- Split-screen: four tech badge cards animate in
  1. **Azure AI Foundry Model Router** — intelligent multi-model routing
  2. **Microsoft Agent Framework** — TurnManager P0–P4 priority queue
  3. **Azure MCP** — JSON-RPC 2.0 tool server (3 tools)
  4. **GitHub Copilot Agent Mode** — TDD full-stack development
- Final frame: BizRoom.ai logo + URL + tagline
  *"Your AI Executive Team — Always in Session"*
- Subtle Azure + GitHub logos watermark bottom right

### Timing
| Beat                          | Second |
| ----------------------------- | ------ |
| 4 tech badge cards appear     | 1:45   |
| Logo + URL full screen        | 1:53   |
| Fade to black                 | 2:00   |

---

## Production Notes

| Item                     | Detail                                                          |
| ------------------------ | --------------------------------------------------------------- |
| Voice                    | Presenter mic, no background noise                             |
| Screen                   | Chrome fullscreen, DevTools closed, no personal tabs visible   |
| Avatar audio             | GPT Realtime 1.5 WebRTC — use real voices, not pre-recorded    |
| BigScreen                | Must show real-time chart render from Sophia (not a screenshot) |
| Planner integration      | Log in to Microsoft 365 demo tenant before recording           |
| Captions                 | Add English subtitles for accessibility (auto-generated is OK) |
