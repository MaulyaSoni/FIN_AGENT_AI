// Episodic memory — per-session log of which tools worked & which didn't,
// stored in localStorage so future runs can prioritize accordingly.

import type { EpisodicEntry, TraceAnnotation } from "./types";

const EPI_KEY = "ara1_episodic_log";
const ANNO_KEY = "ara1_trace_annotations";

function safeLoad<T>(k: string, fallback: T): T {
  try {
    if (typeof window === "undefined") return fallback;
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

function safeSave<T>(k: string, v: T) {
  try { if (typeof window !== "undefined") localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ }
}

export function loadEpisodic(): EpisodicEntry[] { return safeLoad<EpisodicEntry[]>(EPI_KEY, []); }
export function saveEpisodic(entries: EpisodicEntry[]) { safeSave(EPI_KEY, entries.slice(-100)); }

export function appendEpisodic(entry: EpisodicEntry) {
  const all = loadEpisodic();
  all.push(entry);
  saveEpisodic(all);
}

export function classifyQuery(q: string): string {
  const s = q.toLowerCase();
  if (/earnings|transcript|call|guidance/.test(s)) return "earnings";
  if (/risk|volatility|drawdown|var/.test(s)) return "risk";
  if (/compare|versus|vs\.|vs /.test(s)) return "comparison";
  if (/portfolio|correlation|diversif/.test(s)) return "portfolio";
  if (/macro|cpi|gdp|fed|inflation|unemploy/.test(s)) return "macro";
  if (/10-k|10-q|filing|sec/.test(s)) return "filings";
  if (/insider|form 4/.test(s)) return "insider";
  if (/news|sentiment|headline/.test(s)) return "news";
  if (/peer|competitor/.test(s)) return "peers";
  return "general";
}

export function buildEpisodicHint(queryType: string, k = 3): string {
  const all = loadEpisodic().filter((e) => e.queryType === queryType).slice(-k);
  if (all.length === 0) return "";
  const successfulTools = new Set<string>();
  const failedTools = new Set<string>();
  all.forEach((e) => {
    e.successfulTools.forEach((t) => successfulTools.add(t));
    e.failedTools.forEach((t) => failedTools.add(t));
  });
  const parts: string[] = [];
  if (successfulTools.size > 0) parts.push(`worked well: ${[...successfulTools].join(", ")}`);
  if (failedTools.size > 0) parts.push(`previously failed: ${[...failedTools].join(", ")}`);
  return parts.length ? `Past research for ${queryType} — ${parts.join("; ")}.` : "";
}

export function memoryStats() {
  const epi = loadEpisodic();
  return {
    episodicCount: epi.length,
    bySessions: new Set(epi.map((e) => e.sessionId)).size,
    byType: epi.reduce<Record<string, number>>((acc, e) => { acc[e.queryType] = (acc[e.queryType] || 0) + 1; return acc; }, {}),
  };
}

export function clearAllMemory() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(EPI_KEY);
    localStorage.removeItem(ANNO_KEY);
    localStorage.removeItem("finagent:sessions:v1");
    localStorage.removeItem("finagent:reports:v1");
    localStorage.removeItem("finagent:current:v1");
  } catch { /* ignore */ }
}

// Trace annotations (for /traces page)
export function loadAnnotations(): TraceAnnotation[] { return safeLoad<TraceAnnotation[]>(ANNO_KEY, []); }
export function saveAnnotation(reportId: string, note: string) {
  const all = loadAnnotations().filter((a) => a.reportId !== reportId);
  all.push({ reportId, note, updatedAt: Date.now() });
  safeSave(ANNO_KEY, all);
}
export function getAnnotation(reportId: string): string {
  return loadAnnotations().find((a) => a.reportId === reportId)?.note ?? "";
}
