---
version: "1.0.0"
created: "2026-03-12 14:00"
updated: "2026-03-12 14:00"
---

# Session-Based Room System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No-auth session-based room system for hackathon — Landing → Name input → Room creation → URL sharing → Team member join

**Architecture:** Client-side room state management via URL hash routing + localStorage session. No backend auth required. Room ID auto-generated (BZ-XXXX). Team members join via shared URL and get assigned to `HUMAN_EXTRA_SEATS` (max 2 additional).

**Tech Stack:** React 18, React Context, URL hash params, localStorage, existing MeetingContext

---

## File Structure

| Action   | Path                                      | Responsibility                              |
| -------- | ----------------------------------------- | ------------------------------------------- |
| Create   | `src/components/lobby/LobbyPage.tsx`      | Landing page: name input + create/join room |
| Create   | `src/hooks/useSessionRoom.ts`             | Room session management (create/join/leave) |
| Modify   | `src/constants/strings.ts`                | Lobby UI strings                            |
| Modify   | `src/context/MeetingContext.tsx`           | Add SET_ROOM, SET_USER actions              |
| Modify   | `src/App.tsx`                             | Route: lobby vs meeting based on room state |
| Modify   | `src/components/meeting3d/MeetingRoom3D.tsx` | Pass humanParticipants from context      |

---

## Chunk 1: Session Room Infrastructure

### Task 1: Add lobby UI strings to strings.ts

**Files:**
- Modify: `src/constants/strings.ts`

- [ ] **Step 1: Add lobby strings**

Add `lobby` section to `S` constant:
```typescript
lobby: {
  title: "BizRoom",
  subtitle: "AI C-Suite Virtual Office",
  nameLabel: "이름을 입력하세요",
  namePlaceholder: "예: 김대표",
  createRoom: "회의실 만들기",
  joinRoom: "회의실 참가",
  roomIdPlaceholder: "회의실 코드 (예: BZ-A3F9)",
  shareLink: "초대 링크 복사",
  linkCopied: "복사되었습니다!",
  waitingForHost: "호스트를 기다리는 중...",
  roomNotFound: "존재하지 않는 회의실입니다",
  roomFull: "회의실이 가득 찼습니다 (최대 3명)",
  you: "(나)",
},
```

- [ ] **Step 2: Commit**

```
feat(i18n): add lobby UI strings for session room system
```

---

### Task 2: Extend MeetingContext with room/user state

**Files:**
- Modify: `src/context/MeetingContext.tsx`

- [ ] **Step 1: Add user and room fields to state**

Add to `MeetingState`:
```typescript
userId: string;        // UUID, persisted in localStorage
userName: string;      // User-entered display name
isChairman: boolean;   // true = room creator
humanParticipants: { name: string; color?: string }[];
```

Add new actions:
```typescript
| { type: "SET_USER"; payload: { userId: string; userName: string } }
| { type: "SET_ROOM"; payload: { roomId: string; isChairman: boolean } }
| { type: "ADD_HUMAN_PARTICIPANT"; payload: { name: string; color?: string } }
| { type: "REMOVE_HUMAN_PARTICIPANT"; payload: string }  // name
```

- [ ] **Step 2: Implement reducers**

- [ ] **Step 3: Commit**

```
feat(ui): extend MeetingContext with room/user session state
```

---

### Task 3: Create useSessionRoom hook

**Files:**
- Create: `src/hooks/useSessionRoom.ts`

- [ ] **Step 1: Implement hook**

```typescript
// Generates room IDs like "BZ-A3F9"
function generateRoomId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `BZ-${code}`;
}

// Persists userId in localStorage
function getOrCreateUserId(): string {
  const key = "bizroom_user_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export function useSessionRoom() {
  // createRoom(userName) → sets roomId in URL hash, returns roomId
  // joinRoom(roomId, userName) → navigates to room
  // leaveRoom() → clears state, goes back to lobby
  // getRoomIdFromUrl() → reads hash param
}
```

- [ ] **Step 2: Commit**

```
feat(ui): add useSessionRoom hook for room lifecycle management
```

---

### Task 4: Create LobbyPage component

**Files:**
- Create: `src/components/lobby/LobbyPage.tsx`

- [ ] **Step 1: Implement lobby UI**

Two modes:
1. **Create Room**: Name input → "회의실 만들기" button → generates room ID → enters as Chairman
2. **Join Room**: Name input + Room code input → "회의실 참가" → enters as member

Design:
- Full-screen dark background matching meeting room aesthetic
- Centered card with glassmorphism (bg-neutral-950/70 backdrop-blur)
- BizRoom logo + tagline at top
- Tab-like toggle: "만들기" / "참가하기"
- Name input with validation (min 1 char)
- Room code input (join mode only, auto-uppercase)
- Submit button with indigo gradient

- [ ] **Step 2: Add share link feature**

After room creation, show:
- Room code badge (large, copy-able)
- "초대 링크 복사" button → copies full URL to clipboard
- Participant count indicator

- [ ] **Step 3: Commit**

```
feat(ui): add LobbyPage with create/join room flow
```

---

### Task 5: Wire up App.tsx routing

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add lobby/meeting routing**

Logic:
```
1. On mount: check URL hash for roomId (e.g., #room=BZ-A3F9)
2. If no roomId → show LobbyPage
3. If roomId exists but no userName → show LobbyPage (join mode, pre-filled roomId)
4. If roomId + userName → show MeetingRoom (existing flow)
```

- [ ] **Step 2: Pass humanParticipants to MeetingRoom3D**

Read `state.humanParticipants` from MeetingContext, pass to `<MeetingRoom3D humanParticipants={...}>`.

- [ ] **Step 3: Update idle state**

Move the "회의를 시작하겠습니다" button from the overlay into the meeting view (keep as-is), but only show after entering a room.

- [ ] **Step 4: Commit**

```
feat(ui): add lobby-to-meeting routing with session room support
```

---

## Summary

This plan implements a **client-side session room system** optimized for hackathon demos:
- No backend auth required
- Room IDs are memorable 4-char codes (BZ-XXXX)
- Chairman creates room, team members join via URL
- Max 3 human participants (Chairman + 2 members)
- State managed via MeetingContext + localStorage + URL hash
- Ready for SignalR multi-user sync when backend is connected
