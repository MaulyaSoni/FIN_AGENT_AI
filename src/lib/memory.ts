// Long-term semantic memory using Lovable AI embeddings + localStorage cosine search.
// This is the "long-term vector memory" layer of FinAgent's three-tier memory:
//   short-term: current chat session (in-memory)
//   episodic:   reports list (localStorage)
//   long-term:  embedded reports for semantic recall (this file)
import type { Report } from "./types";
import { embedText } from "./agent.functions";

export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}

export async function embedQuery(text: string): Promise<number[] | null> {
  try {
    const r = await embedText({ data: { text } });
    return r.data?.embedding ?? null;
  } catch { return null; }
}

export async function recallMemory(query: string, reports: Report[], k = 3): Promise<{ report: Report; score: number }[]> {
  const indexed = reports.filter((r) => Array.isArray(r.embedding) && r.embedding.length > 0);
  if (indexed.length === 0) return [];
  const qe = await embedQuery(query);
  if (!qe) return [];
  return indexed
    .map((r) => ({ report: r, score: cosine(qe, r.embedding!) }))
    .filter((x) => x.score > 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export function buildMemoryHint(hits: { report: Report; score: number }[]): string {
  if (hits.length === 0) return "";
  return hits
    .map((h) => `- [${(h.score * 100).toFixed(0)}% match] ${h.report.title} (tickers: ${h.report.tickers.join(", ")}) on ${new Date(h.report.createdAt).toLocaleDateString()}`)
    .join("\n");
}
