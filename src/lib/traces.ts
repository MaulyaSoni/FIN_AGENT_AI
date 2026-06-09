// ReAct trace persistence — every tool execution is logged with
// thought, action, observation, success, fallback, and timing.
// Powers the /traces gallery + per-step accordion in chat.

import type { ReActTrace } from "./types";

const TRACES_KEY = "ara1_traces";
const ANNO_KEY = "ara1_trace_annotations";
const MAX_TRACES = 300;

export type StoredTrace = ReActTrace & {
  stepId: string;
  sessionId: string;
  query?: string;
  queryType?: string;
  ticker?: string;
  fallbackUsed?: boolean;
};

export type StoredAnnotation = { well: string; improve: string; updatedAt: number };

function safeLoad<T>(k: string, fb: T): T {
  try {
    if (typeof window === "undefined") return fb;
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : fb;
  } catch { return fb; }
}
function safeSave<T>(k: string, v: T) {
  try { if (typeof window !== "undefined") localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ }
}

export function appendTrace(t: StoredTrace) {
  const all = safeLoad<StoredTrace[]>(TRACES_KEY, []);
  all.push(t);
  if (all.length > MAX_TRACES) all.splice(0, all.length - MAX_TRACES);
  safeSave(TRACES_KEY, all);
}

export function getAllTraces(): StoredTrace[] { return safeLoad<StoredTrace[]>(TRACES_KEY, []); }
export function getTracesBySession(sessionId: string): StoredTrace[] {
  return getAllTraces().filter((t) => t.sessionId === sessionId);
}
export function clearTraces() { safeSave(TRACES_KEY, []); }

export function loadAnnotations(): Record<string, StoredAnnotation> {
  return safeLoad<Record<string, StoredAnnotation>>(ANNO_KEY, {});
}
export function saveAnnotation(stepId: string, field: "well" | "improve", value: string) {
  const all = loadAnnotations();
  all[stepId] = { ...(all[stepId] ?? { well: "", improve: "", updatedAt: 0 }), [field]: value, updatedAt: Date.now() };
  safeSave(ANNO_KEY, all);
}
