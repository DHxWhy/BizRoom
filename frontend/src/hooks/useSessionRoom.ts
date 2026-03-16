import { useCallback, useMemo } from "react";
import { useMeetingDispatch, useMeetingState } from "../context/MeetingContext";

const STORAGE_KEY_USER_ID = "bizroom_user_id";
const STORAGE_KEY_USER_NAME = "bizroom_user_name";

/** Generate a memorable room code like "BZ-A3F9" */
function generateRoomId(): string {
  // Exclude ambiguous chars: I/O/0/1
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `BZ-${code}`;
}

/** Get or create a persistent user ID in localStorage */
function getOrCreateUserId(): string {
  let id = localStorage.getItem(STORAGE_KEY_USER_ID);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY_USER_ID, id);
  }
  return id;
}

/** Get saved user name from localStorage */
function getSavedUserName(): string {
  return localStorage.getItem(STORAGE_KEY_USER_NAME) ?? "";
}

/** Save user name to localStorage for next visit */
function saveUserName(name: string): void {
  localStorage.setItem(STORAGE_KEY_USER_NAME, name);
}

/** Read room ID from URL hash: #room=BZ-A3F9 */
export function getRoomIdFromUrl(): string | null {
  const hash = window.location.hash;
  const match = hash.match(/room=([A-Z0-9-]+)/i);
  return match ? match[1].toUpperCase() : null;
}

/** Set room ID in URL hash without triggering navigation */
function setRoomIdInUrl(roomId: string): void {
  window.history.replaceState(null, "", `#room=${roomId}`);
}

/** Clear room ID from URL */
function clearRoomIdFromUrl(): void {
  window.history.replaceState(null, "", window.location.pathname);
}

/**
 * Hook for session-based room management.
 * No backend auth — uses localStorage for user identity, URL hash for room routing.
 */
export function useSessionRoom() {
  const dispatch = useMeetingDispatch();
  const state = useMeetingState();
  const savedUserName = useMemo(() => getSavedUserName(), []);

  /** Initialize user from localStorage (call on mount) */
  const initUser = useCallback(() => {
    const userId = getOrCreateUserId();
    const userName = getSavedUserName();
    dispatch({ type: "SET_USER", payload: { userId, userName } });
    return { userId, userName };
  }, [dispatch]);

  /** Create a new room as CEO (sets user + room, does NOT enter yet) */
  const createRoom = useCallback(
    (userName: string) => {
      const userId = getOrCreateUserId();
      const roomId = generateRoomId();

      saveUserName(userName);
      dispatch({ type: "SET_USER", payload: { userId, userName } });
      dispatch({ type: "SET_ROOM", payload: { roomId, isCeo: true } });

      setRoomIdInUrl(roomId);

      return roomId;
    },
    [dispatch],
  );

  /** Enter the room (call after multi-step setup is complete) */
  const enterRoom = useCallback(() => {
    dispatch({ type: "ENTER_ROOM" });
  }, [dispatch]);

  /** Join an existing room as a team member */
  const joinRoom = useCallback(
    (roomId: string, userName: string) => {
      const userId = getOrCreateUserId();
      saveUserName(userName);
      dispatch({ type: "SET_USER", payload: { userId, userName } });
      dispatch({ type: "SET_ROOM", payload: { roomId: roomId.toUpperCase(), isCeo: false } });
      dispatch({ type: "ENTER_ROOM" });

      setRoomIdInUrl(roomId.toUpperCase());
    },
    [dispatch],
  );

  /** Leave the current room and return to lobby */
  const leaveRoom = useCallback(() => {
    dispatch({ type: "LEAVE_ROOM" });
    clearRoomIdFromUrl();
  }, [dispatch]);

  /** Get the share URL for the current room */
  const getShareUrl = useCallback(() => {
    if (!state.roomId) return "";
    const base = window.location.origin + window.location.pathname;
    return `${base}#room=${state.roomId}`;
  }, [state.roomId]);

  return {
    initUser,
    createRoom,
    enterRoom,
    joinRoom,
    leaveRoom,
    getShareUrl,
    getRoomIdFromUrl,
    savedUserName,
  };
}
