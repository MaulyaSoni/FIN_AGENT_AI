import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Play, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend } from "recharts";
import { useSession } from "@/context/SessionContext";
import { runAgent, isPaused } from "@/lib/agent";
import { judgeReport } from "@/lib/agent.functions";
import type { StepResult } from "@/lib/types";

type Challenge = {
  id: number;
  level: "Easy" | "Medium" | "Hard" | "Expert";
  query: string;
  expectedTickers: string[];
  expectedTools: string[];
};

const CHALLENGES: Challenge[] = [
  { id: 1, level: "Easy", query: "Get the current price and P/E of AAPL.", expectedTickers: ["AAPL"], expectedTools: ["quote"] },
  { id: 2, level: "Easy", query: "Show recent news sentiment for MSFT.", expectedTickers: ["MSFT"], expectedTools: ["news"] },
  { id: 3, level: "Medium", query: "Analyze TSLA price action and risk over 90 days.", expectedTickers: ["TSLA"], expectedTools: ["history"] },
  { id: 4, level: "Medium", query: "Compare NVDA and AMD on fundamentals and 30-day return.", expectedTickers: ["NVDA", "AMD"], expectedTools: ["compare"] },
  { id: 5, level: "Hard", query: "Pull GOOGL recent SEC 10-K and 10-Q filings.", expectedTickers: ["GOOGL"], expectedTools: ["filings"] },
  { id: 6, level: "Hard", query: "Build a tech portfolio of AAPL, MSFT, GOOGL — show correlation and portfolio vol.", expectedTickers: ["AAPL", "MSFT", "GOOGL"], expectedTools: ["portfolio"] },
  { id: 7, level: "Expert", query: "Comprehensive AMZN research: fundamentals, risk, recent news, SEC filings, insider activity.", expectedTickers: ["AMZN"], expectedTools: ["quote", "history", "news", "filings", "insider"] },
  { id: 8, level: "Expert", query: "Analyze US macro: latest CPI, unemployment, and 10y treasury — connect to NVDA outlook.", expectedTickers: ["NVDA"], expectedTools: ["macro", "quote"] },
];

type JudgeAxes = {
  insightDensity: number;
  crossSourceSynthesis: number;
  logicalFlow: number;
  internalConsistency: number;
  executiveSummaryQuality: number;
};

type Score = {
  id: number;
  ok: boolean;
  latencyMs: number;
  stepCount: number;
  errorCount: number;
  toolsCovered: number;
  expectedToolsCovered: number;
  tickersCovered: number;
  synthesisLen: number;
  hasDisclaimer: boolean;
  reportGenerated: boolean;
  qualityScore: number;     // composite 0–100
  judgeScore?: JudgeAxes;   // 1–5 per axis (LLM judge)
  rubric700: number;        // out of 700
  notes: string;
};

function scoreRun(c: Challenge, steps: StepResult[], synthesis: string, reportMd: string, latencyMs: number, ok: boolean, judge?: JudgeAxes): Score {
  const errorCount = steps.filter((s) => "error" in s && s.error).length;
  const toolKinds = new Set(steps.map((s) => s.kind));
  const expectedCovered = c.expectedTools.filter((t) => toolKinds.has(t as StepResult["kind"])).length;
  const tickerHits = new Set<string>();
  steps.forEach((s) => {
    if ("ticker" in s && s.ticker) tickerHits.add(s.ticker.toUpperCase());
    if (s.kind === "compare") s.quotes.forEach((q) => tickerHits.add(q.ticker.toUpperCase()));
    if (s.kind === "portfolio") s.tickers.forEach((t) => tickerHits.add(t.toUpperCase()));
  });
  const tickersCovered = c.expectedTickers.filter((t) => tickerHits.has(t)).length;
  const hasSynth = synthesis.length > 100;
  const hasDisc = /disclaimer/i.test(synthesis);
  const hasNums = /\d/.test(synthesis);
  const reportGen = reportMd.length > 200;

  let q = 0;
  q += (expectedCovered / Math.max(1, c.expectedTools.length)) * 30;
  q += (tickersCovered / Math.max(1, c.expectedTickers.length)) * 20;
  q += hasSynth ? 15 : 0;
  q += hasDisc ? 5 : 0;
  q += hasNums ? 10 : 0;
  q += reportGen ? 10 : 0;
  q += errorCount === 0 ? 10 : Math.max(0, 10 - errorCount * 3);

  // Rubric out of 700 (7 dimensions × 100 each)
  const dim = (n: number) => Math.round((n / 5) * 100);
  const rubric700 = judge
    ? dim(judge.insightDensity) + dim(judge.crossSourceSynthesis) + dim(judge.logicalFlow) +
      dim(judge.internalConsistency) + dim(judge.executiveSummaryQuality) +
      Math.round((expectedCovered / Math.max(1, c.expectedTools.length)) * 100) +
      Math.round((tickersCovered / Math.max(1, c.expectedTickers.length)) * 100)
    : Math.round(q * 7);

  return {
    id: c.id, ok, latencyMs,
    stepCount: steps.length, errorCount,
    toolsCovered: toolKinds.size,
    expectedToolsCovered: expectedCovered,
    tickersCovered,
    synthesisLen: synthesis.length, hasDisclaimer: hasDisc,
    reportGenerated: reportGen,
    qualityScore: Math.round(q),
    judgeScore: judge,
    rubric700,
    notes: errorCount > 0 ? `${errorCount} step error(s)` : "ok",
  };
}

const EVAL_KEY = "ara1_eval_runs";

function loadEvals(): Record<number, Score> {
  try {
    if (typeof window === "undefined") return {};
    const raw = localStorage.getItem(EVAL_KEY);
    return raw ? (JSON.parse(raw) as Record<number, Score>) : {};
  } catch { return {}; }
}
function saveEvals(s: Record<number, Score>) {
  try { if (typeof window !== "undefined") localStorage.setItem(EVAL_KEY, JSON.stringify(s)); } catch { /* */ }
}

function EvalsPage() {
  const { reports } = useSession();
  const [scores, setScores] = useState<Record<number, Score | "running">>(() => loadEvals());
  const [bulkRunning, setBulkRunning] = useState(false);

  const persist = (next: Record<number, Score | "running">) => {
    const onlyDone: Record<number, Score> = {};
    Object.entries(next).forEach(([k, v]) => { if (typeof v === "object") onlyDone[Number(k)] = v; });
    saveEvals(onlyDone);
  };

  const runOne = async (c: Challenge) => {
    setScores((p) => { const n = { ...p, [c.id]: "running" as const }; return n; });
    const t0 = performance.now();
    let synthesis = "";
    let reportMd = "";
    let finalSteps: StepResult[] = [];
    let ok = true;
    try {
      const ghost = { id: "eval", role: "assistant" as const, content: "", createdAt: Date.now() } as import("@/lib/types").ChatMessage;
      const r = await runAgent({
        query: c.query, history: [], reports,
        update: (mut) => { mut(ghost); },
        skipDisambiguation: true,
      });
      if (!isPaused(r)) {
        synthesis = r.synthesis;
        reportMd = r.reportMarkdown;
        finalSteps = r.steps;
      }
    } catch (e) {
      ok = false;
      console.error(e);
    }
    const latency = performance.now() - t0;
    let judge: JudgeAxes | undefined;
    if (reportMd.length > 200) {
      try {
        const jr = await judgeReport({ data: { report: reportMd.slice(0, 12000), query: c.query } });
        if (jr.data) judge = jr.data;
      } catch (e) { console.warn("judge failed", e); }
    }
    const sc = scoreRun(c, finalSteps, synthesis, reportMd, latency, ok, judge);
    setScores((p) => { const n = { ...p, [c.id]: sc }; persist(n); return n; });
  };

  const runAll = async () => {
    setBulkRunning(true);
    for (const c of CHALLENGES) await runOne(c);
    setBulkRunning(false);
  };

  const overall = Object.values(scores).filter((s): s is Score => typeof s === "object");
  const avgQ = overall.length ? Math.round(overall.reduce((a, s) => a + s.qualityScore, 0) / overall.length) : 0;
  const avgRubric = overall.length ? Math.round(overall.reduce((a, s) => a + s.rubric700, 0) / overall.length) : 0;

  // Radar chart data (averaged across runs that have judge scores)
  const judged = overall.filter((s) => s.judgeScore);
  const radarData = judged.length > 0 ? [
    { axis: "Insight density", value: judged.reduce((a, s) => a + (s.judgeScore!.insightDensity), 0) / judged.length },
    { axis: "Cross-source synth", value: judged.reduce((a, s) => a + (s.judgeScore!.crossSourceSynthesis), 0) / judged.length },
    { axis: "Logical flow", value: judged.reduce((a, s) => a + (s.judgeScore!.logicalFlow), 0) / judged.length },
    { axis: "Consistency", value: judged.reduce((a, s) => a + (s.judgeScore!.internalConsistency), 0) / judged.length },
    { axis: "Exec summary", value: judged.reduce((a, s) => a + (s.judgeScore!.executiveSummaryQuality), 0) / judged.length },
    { axis: "Tool coverage", value: overall.reduce((a, s) => a + (s.expectedToolsCovered / 5) * 5, 0) / overall.length },
    { axis: "Ticker coverage", value: overall.reduce((a, s) => a + (s.tickersCovered / 2) * 5, 0) / overall.length },
  ] : [];

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Evaluation harness</h1>
            <p className="text-sm text-muted-foreground mt-1">
              8 progressive challenges scored across composite quality + LLM-judged 700-point rubric (7 dimensions × 100).
            </p>
          </div>
          <button onClick={runAll} disabled={bulkRunning}
            className="inline-flex items-center gap-2 rounded-md bg-gradient-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-elegant hover:opacity-90 disabled:opacity-50">
            {bulkRunning ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Run all 8
          </button>
        </div>

        {overall.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="text-xs text-muted-foreground">Composite quality</div>
              <div className="text-4xl font-semibold text-gradient">{avgQ}<span className="text-base text-muted-foreground">/100</span></div>
              <div className="text-xs text-muted-foreground mt-1">{overall.length} of {CHALLENGES.length} done</div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="text-xs text-muted-foreground">Rubric score</div>
              <div className="text-4xl font-semibold text-gradient">{avgRubric}<span className="text-base text-muted-foreground">/700</span></div>
              <div className="text-xs text-muted-foreground mt-1">7 dimensions × 100</div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="text-xs text-muted-foreground">LLM-judged runs</div>
              <div className="text-4xl font-semibold text-gradient">{judged.length}</div>
              <div className="text-xs text-muted-foreground mt-1">via judgeReport</div>
            </div>
          </div>
        )}

        {radarData.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="font-semibold text-sm mb-2">Quality radar (avg, 0–5)</div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis dataKey="axis" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                  <PolarRadiusAxis domain={[0, 5]} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
                  <Radar name="ARA-1" dataKey="value" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.35} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="p-3">#</th><th className="p-3">Level</th><th className="p-3">Challenge</th>
                <th className="p-3 text-right">Steps</th><th className="p-3 text-right">Tools</th>
                <th className="p-3 text-right">Errors</th><th className="p-3 text-right">Latency</th>
                <th className="p-3 text-right">Quality</th><th className="p-3 text-right">Rubric/700</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {CHALLENGES.map((c) => {
                const s = scores[c.id];
                const isRunning = s === "running";
                const r = typeof s === "object" ? s : null;
                return (
                  <tr key={c.id} className="border-t border-border">
                    <td className="p-3 font-mono">{c.id}</td>
                    <td className="p-3"><span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${c.level === "Easy" ? "bg-[color:var(--bullish)]/15 text-[color:var(--bullish)]" : c.level === "Medium" ? "bg-accent text-accent-foreground" : c.level === "Hard" ? "bg-[color:var(--warning)]/15 text-[color:var(--warning)]" : "bg-destructive/15 text-destructive"}`}>{c.level}</span></td>
                    <td className="p-3 max-w-md truncate" title={c.query}>{c.query}</td>
                    <td className="p-3 text-right font-mono">{r?.stepCount ?? "—"}</td>
                    <td className="p-3 text-right font-mono">{r ? `${r.expectedToolsCovered}/${c.expectedTools.length}` : "—"}</td>
                    <td className="p-3 text-right font-mono">{r?.errorCount ?? "—"}</td>
                    <td className="p-3 text-right font-mono">{r ? `${(r.latencyMs / 1000).toFixed(1)}s` : "—"}</td>
                    <td className="p-3 text-right">
                      {r ? (
                        <span className={`font-mono font-semibold ${r.qualityScore >= 75 ? "num-pos" : r.qualityScore >= 50 ? "" : "num-neg"}`}>{r.qualityScore}</span>
                      ) : "—"}
                      {r?.ok === false && <XCircle className="inline ml-1 size-3 text-destructive" />}
                      {r?.ok && <CheckCircle2 className="inline ml-1 size-3 text-[color:var(--bullish)]" />}
                    </td>
                    <td className="p-3 text-right font-mono">{r ? r.rubric700 : "—"}</td>
                    <td className="p-3">
                      <button onClick={() => runOne(c)} disabled={isRunning || bulkRunning}
                        className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50">
                        {isRunning ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
                        Run
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-border bg-card/50 p-4 text-xs text-muted-foreground">
          <div className="font-semibold text-foreground mb-1">Rubric dimensions (700 total)</div>
          Insight density · Cross-source synthesis · Logical flow · Internal consistency · Executive summary quality
          · Tool coverage · Ticker coverage. LLM judge axes are scored 1–5 then scaled to 100 each.
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/evals")({
  head: () => ({
    meta: [
      { title: "ARA-1 — Evals" },
      { name: "description", content: "Run the 8 progressive challenges and score ARA-1 on a 700-point rubric with LLM-as-judge." },
    ],
  }),
  component: EvalsPage,
});
