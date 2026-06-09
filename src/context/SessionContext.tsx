import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ChatMessage, ChatSession, Report } from "@/lib/types";

const SESS_KEY = "finagent:sessions:v1";
const REPS_KEY = "finagent:reports:v1";
const CUR_KEY = "finagent:current:v1";

type Ctx = {
  sessions: ChatSession[];
  currentId: string;
  current: ChatSession;
  reports: Report[];
  newSession: () => void;
  selectSession: (id: string) => void;
  appendMessage: (msg: ChatMessage) => void;
  updateMessage: (id: string, mut: (m: ChatMessage) => void) => void;
  addReport: (r: Report) => void;
  renameSessionFromQuery: (q: string) => void;
};

const SessionContext = createContext<Ctx | null>(null);

function makeSession(): ChatSession {
  return { id: crypto.randomUUID(), title: "New session", createdAt: Date.now(), messages: [] };
}

function load<T>(k: string, fallback: T): T {
  try {
    if (typeof window === "undefined") return fallback;
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [currentId, setCurrentId] = useState<string>("");

  useEffect(() => {
    const loadedSessions = load<ChatSession[]>(SESS_KEY, []);
    const loadedReports = load<Report[]>(REPS_KEY, []);
    const loadedCur = load<string>(CUR_KEY, "");
    if (loadedSessions.length === 0) {
      const s = makeSession();
      setSessions([s]);
      setCurrentId(s.id);
    } else {
      setSessions(loadedSessions);
      setCurrentId(loadedSessions.find((s) => s.id === loadedCur)?.id ?? loadedSessions[0].id);
    }
    setReports(loadedReports);
    setHydrated(true);
  }, []);

  useEffect(() => { if (hydrated) localStorage.setItem(SESS_KEY, JSON.stringify(sessions)); }, [sessions, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem(REPS_KEY, JSON.stringify(reports)); }, [reports, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem(CUR_KEY, JSON.stringify(currentId)); }, [currentId, hydrated]);

  const current = useMemo(
    () => sessions.find((s) => s.id === currentId) ?? sessions[0] ?? makeSession(),
    [sessions, currentId]
  );

  const value: Ctx = {
    sessions,
    currentId,
    current,
    reports,
    newSession: () => {
      const s = makeSession();
      setSessions((prev) => [s, ...prev]);
      setCurrentId(s.id);
    },
    selectSession: (id) => setCurrentId(id),
    appendMessage: (msg) =>
      setSessions((prev) => prev.map((s) => (s.id === currentId ? { ...s, messages: [...s.messages, msg] } : s))),
    updateMessage: (id, mut) =>
      setSessions((prev) =>
        prev.map((s) =>
          s.id === currentId
            ? {
                ...s,
                messages: s.messages.map((m) => {
                  if (m.id !== id) return m;
                  const copy = { ...m };
                  mut(copy);
                  return copy;
                }),
              }
            : s
        )
      ),
    addReport: (r) => setReports((prev) => [r, ...prev]),
    renameSessionFromQuery: (q) =>
      setSessions((prev) =>
        prev.map((s) => (s.id === currentId && s.title === "New session" ? { ...s, title: q.slice(0, 60) } : s))
      ),
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
