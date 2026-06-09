import { toast } from "sonner";
import {
  agentPlan, agentSynthesize, analyzeSentiment, disambiguateQuery,
  getHistory, getNews, getQuote, getFilings, getInsider, webSearch, getMacro, getFx,
  getProfile, getPeers, getTranscript, factCheck,
} from "./agent.functions";
import type {
  AgentToolName, ChatMessage, DisambiguationInfo, HistoryData, ReActTrace, Report, StepResult,
} from "./types";
import { annualizedPortfolioVol, buildReportMarkdown, correlationMatrix, fmtNum, fmtPct, fmtMoney } from "./report";
import { buildMemoryHint, embedQuery, recallMemory } from "./memory";
import { appendEpisodic, buildEpisodicHint, classifyQuery } from "./episodic";
import { isCircuitOpen, recordFailure, recordSuccess, retryWithBackoff } from "./retry";
import { synthesizeMultiSource, type DataPoint, type SourceTier } from "./synthesis";
import { appendTrace } from "./traces";

function notifyStepError(err: string | undefined, seen: Set<string>) {
  if (!err) return;
  if (/rate limit|429|invalid|missing|not configured/i.test(err) && !seen.has(err)) {
    seen.add(err); toast.error(err);
  }
}

type Updater = (mut: (m: ChatMessage) => void) => void;

// Wrap any server-fn call with retry + per-session circuit breaker.
async function protect<T>(sessionId: string, tool: string, fn: () => Promise<T>): Promise<{ ok: boolean; data?: T; error?: string }> {
  if (isCircuitOpen(sessionId, tool)) {
    return { ok: false, error: `${tool} circuit open — skipped after repeated failures` };
  }
  try {
    const data = await retryWithBackoff(fn, { maxRetries: 2, baseMs: 500 });
    recordSuccess(sessionId, tool);
    return { ok: true, data };
  } catch (e) {
    recordFailure(sessionId, tool);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Web-search fallback when a primary tool fails.
async function webFallback(sessionId: string, query: string): Promise<StepResult | null> {
  const r = await protect(sessionId, "websearch:fallback", () => webSearch({ data: { query } }));
  if (!r.ok || !r.data) return null;
  const wr = r.data as { data?: { query: string; answer: string; results: { title: string; url: string; snippet: string }[] }; error: string | null };
  if (wr.error || !wr.data) return null;
  return {
    kind: "websearch", query: wr.data.query,
    answer: `[fallback] ${wr.data.answer || ""}`,
    results: wr.data.results,
  };
}

function classifyTier(source: string): SourceTier {
  const s = source.toLowerCase();
  if (s.includes("sec") || s.includes("filing")) return "SEC_FILING";
  if (s.includes("alpha") || s.includes("fred") || s.includes("api")) return "FINANCIAL_API";
  if (s.includes("transcript") || s.includes("earnings call")) return "EARNINGS_CALL";
  if (s.includes("news")) return "MAJOR_NEWS";
  if (s.includes("web") || s.includes("tavily")) return "WEB_SEARCH";
  return "FINANCIAL_API";
}

// Pull numerical data points out of step results for conflict resolution.
function extractDataPoints(steps: StepResult[]): DataPoint[] {
  const out: DataPoint[] = [];
  for (const s of steps) {
    if (s.kind === "quote" && s.data) {
      if (s.data.peRatio != null) out.push({ metric: `${s.ticker}.pe`, value: s.data.peRatio, source: "Alpha Vantage", tier: "FINANCIAL_API" });
      if (s.data.marketCap != null) out.push({ metric: `${s.ticker}.marketCap`, value: s.data.marketCap, source: "Alpha Vantage", tier: "FINANCIAL_API" });
      if (s.data.price != null) out.push({ metric: `${s.ticker}.price`, value: s.data.price, source: "Alpha Vantage", tier: "FINANCIAL_API" });
    } else if (s.kind === "peers" && s.peers) {
      for (const p of s.peers) {
        if (p.pe != null) out.push({ metric: `${p.ticker}.pe`, value: p.pe, source: "Alpha Vantage Peers", tier: "FINANCIAL_API" });
        if (p.marketCap != null) out.push({ metric: `${p.ticker}.marketCap`, value: p.marketCap, source: "Alpha Vantage Peers", tier: "FINANCIAL_API" });
      }
    }
  }
  return out;
}

function formatConflictReport(steps: StepResult[]): string {
  const points = extractDataPoints(steps);
  if (points.length < 2) return "";
  const resolved = synthesizeMultiSource(points).filter((r) => r.conflict);
  if (resolved.length === 0) return "";
  return resolved.map((r) => {
    const vals = (r.values || []).map((v) => `${v.value} (${v.source}, tier ${classifyTier(v.source)})`).join(" vs ");
    return `- ${r.metric}: ${vals} → resolved ${r.resolvedValue}${r.note ? ` (${r.note})` : ""}`;
  }).join("\n");
}

function summarizeObservation(s: StepResult): string {
  if ("error" in s && s.error) return `ERROR: ${s.error}`;
  if (s.kind === "quote" && s.data) return `${s.ticker} price=${s.data.price} P/E=${s.data.peRatio} MCap=${s.data.marketCap}`;
  if (s.kind === "history" && s.data) return `${s.ticker} 30d=${(s.data.return30d * 100).toFixed(2)}% vol=${(s.data.annualVolatility * 100).toFixed(2)}%`;
  if (s.kind === "news" && s.articles) return `${s.ticker} ${s.articles.length} headlines, ${(s.sentiments ?? []).length} classified`;
  if (s.kind === "filings" && s.filings) return `${s.ticker} ${s.filings.length} filings`;
  if (s.kind === "insider" && s.trades) return `${s.ticker} ${s.trades.length} insider filings`;
  if (s.kind === "macro" && s.latest) return `${s.indicator}=${s.latest.value} on ${s.latest.date}`;
  if (s.kind === "fx" && s.rate) return `${s.from}/${s.to}=${s.rate}`;
  if (s.kind === "profile" && s.data) return `${s.ticker} sector=${s.data.sector} industry=${s.data.industry}`;
  if (s.kind === "peers" && s.peers) return `${s.ticker} ${s.peers.length} peers`;
  if (s.kind === "transcript" && s.data) return `${s.ticker} Q${s.data.quarter}/${s.data.year} transcript${s.data.fallback ? " (web)" : ""}`;
  if (s.kind === "factcheck" && s.data) return `${s.data.verdict} (${(s.data.confidence * 100).toFixed(0)}% confidence)`;
  if (s.kind === "websearch" && s.results) return `${s.results.length} hits${s.answer ? `, answer: ${s.answer.slice(0, 80)}` : ""}`;
  if (s.kind === "portfolio") return `${s.tickers.length} tickers, vol=${(s.portfolioVol * 100).toFixed(2)}%`;
  if (s.kind === "compare") return `${s.quotes.length} compared`;
  return "(empty)";
}

export type AgentResult = {
  tickers: string[];
  reportMarkdown: string;
  synthesis: string;
  steps: StepResult[];
  embedding: number[] | null;
  paused?: false;
};
export type PausedResult = { paused: true; disambiguation: DisambiguationInfo };

export async function runAgent(opts: {
  query: string;
  history: ChatMessage[];
  reports: Report[];
  update: Updater;
  sessionId?: string;
  assumptions?: string[];
  skipDisambiguation?: boolean;
}): Promise<AgentResult | PausedResult> {
  const { query, history, reports, update } = opts;
  const sessionId = opts.sessionId || "default";
  const t0 = performance.now();

  // 0) Disambiguation gate
  if (!opts.skipDisambiguation) {
    const dis = await disambiguateQuery({ data: { query } });
    if (dis.data && dis.data.isAmbiguous) {
      const info: DisambiguationInfo = {
        isAmbiguous: true,
        type: dis.data.type,
        interpretation: dis.data.interpretation,
        assumptions: dis.data.assumptions,
      };
      update((m) => { m.disambiguation = info; m.pending = false; });
      return { paused: true, disambiguation: info };
    }
  }

  // Long-term semantic memory recall
  const memHits = await recallMemory(query, reports, 3);
  const memoryHint = buildMemoryHint(memHits);
  update((m) => { m.memoryHits = memHits.map((h) => ({ title: h.report.title, score: h.score })); });

  // Episodic hint
  const queryType = classifyQuery(query);
  const episodicHint = buildEpisodicHint(queryType);

  // 1) Plan
  const planRes = await agentPlan({
    data: {
      query,
      history: history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
      memory: memoryHint || undefined,
      episodicHint: episodicHint || undefined,
      assumptions: opts.assumptions,
    },
  });
  if (planRes.error || !planRes.data) {
    update((m) => { m.synthesis = `Could not generate plan: ${planRes.error}`; m.pending = false; });
    return { tickers: [], reportMarkdown: "", synthesis: planRes.error ?? "", steps: [], embedding: null };
  }
  const plan = planRes.data;
  update((m) => { m.plan = plan; });

  // 2) Execute steps with retry + circuit + fallback + trace capture
  const steps: StepResult[] = [];
  const traces: ReActTrace[] = [];
  const allTickers = new Set<string>();
  const toastSeen = new Set<string>();
  const successfulTools: string[] = [];
  const failedTools: string[] = [];
  const fallbacksUsed: string[] = [];

  async function recordStep(opts: {
    index: number; tool: AgentToolName; thoughtArg?: string; expected?: string;
    action: string; ticker?: string; result: StepResult; startedAt: number; fallback?: boolean;
  }) {
    const success = !("error" in opts.result && opts.result.error);
    const trace: ReActTrace = {
      index: opts.index,
      tool: opts.tool,
      thought: opts.thoughtArg ?? "",
      action: opts.action,
      observation: summarizeObservation(opts.result),
      success,
      timestamp: opts.startedAt,
      durationMs: performance.now() - opts.startedAt,
    };
    traces.push(trace);
    appendTrace({
      ...trace,
      stepId: `${sessionId}-${opts.index}-${Date.now()}`,
      sessionId,
      query,
      queryType,
      ticker: opts.ticker,
      fallbackUsed: opts.fallback,
    });
    if (success) successfulTools.push(opts.tool);
    else failedTools.push(opts.tool);
    if (opts.fallback) fallbacksUsed.push(opts.tool);
    steps.push(opts.result);
    update((m) => { m.steps = [...steps]; m.traces = [...traces]; });
  }

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    step.tickers.forEach((t) => allTickers.add(t.toUpperCase()));
    const thought = step.thought;
    const expected = step.expectedObservation;

    const handleSingle = async (
      ticker: string,
      toolKey: string,
      action: string,
      runner: () => Promise<{ data: unknown; error: string | null }>,
      buildResult: (data: unknown) => StepResult,
      buildErr: (msg: string) => StepResult,
    ) => {
      const startedAt = performance.now();
      const guarded = await protect(sessionId, toolKey, runner);
      let result: StepResult;
      let fallback = false;
      if (guarded.ok && guarded.data && !(guarded.data as { error?: string }).error) {
        const inner = guarded.data as { data: unknown; error: string | null };
        if (inner.error || !inner.data) {
          // try fallback
          const fb = await webFallback(sessionId, `${ticker} ${toolKey}`);
          if (fb) { result = fb; fallback = true; }
          else result = buildErr(inner.error || "Unknown error");
        } else {
          result = buildResult(inner.data);
        }
      } else {
        const fb = await webFallback(sessionId, `${ticker} ${toolKey}`);
        if (fb) { result = fb; fallback = true; }
        else result = buildErr(guarded.error || "Tool failed");
      }
      notifyStepError("error" in result ? result.error : undefined, toastSeen);
      await recordStep({ index: i, tool: step.tool, thoughtArg: thought, expected, action, ticker, result, startedAt, fallback });
    };

    if (step.tool === "quote") {
      for (const t of step.tickers) {
        await handleSingle(t, "quote", `getQuote(${t})`,
          () => getQuote({ data: { ticker: t } }),
          (d) => ({ kind: "quote", ticker: t, data: d as import("./types").QuoteData }),
          (e) => ({ kind: "quote", ticker: t, error: e }));
      }
    } else if (step.tool === "history") {
      for (const t of step.tickers) {
        await handleSingle(t, "history", `getHistory(${t})`,
          () => getHistory({ data: { ticker: t } }),
          (d) => ({ kind: "history", ticker: t, data: d as HistoryData }),
          (e) => ({ kind: "history", ticker: t, error: e }));
      }
    } else if (step.tool === "news") {
      for (const t of step.tickers) {
        const startedAt = performance.now();
        const guarded = await protect(sessionId, "news", () => getNews({ data: { ticker: t } }));
        let result: StepResult; let fallback = false;
        const inner = guarded.data as { data?: { articles: import("./types").NewsArticle[] }; error: string | null } | undefined;
        if (guarded.ok && inner?.data && !inner.error) {
          const articles = inner.data.articles;
          let sentiments: import("./types").SentimentResult[] | undefined;
          if (articles.length > 0) {
            const s = await analyzeSentiment({ data: { headlines: articles.map((a) => ({ title: a.title, description: a.description })) } });
            if (s.data) sentiments = s.data;
          }
          result = { kind: "news", ticker: t, articles, sentiments };
        } else {
          const fb = await webFallback(sessionId, `${t} latest news`);
          if (fb) { result = fb; fallback = true; }
          else result = { kind: "news", ticker: t, error: inner?.error || guarded.error || "News failed" };
        }
        notifyStepError("error" in result ? result.error : undefined, toastSeen);
        await recordStep({ index: i, tool: step.tool, thoughtArg: thought, expected, action: `getNews(${t})`, ticker: t, result, startedAt, fallback });
      }
    } else if (step.tool === "compare") {
      const startedAt = performance.now();
      const quotes: { ticker: string; quote?: import("./types").QuoteData; history?: HistoryData; error?: string }[] = [];
      for (const t of step.tickers) {
        const [q, h] = await Promise.all([
          protect(sessionId, "quote", () => getQuote({ data: { ticker: t } })),
          protect(sessionId, "history", () => getHistory({ data: { ticker: t } })),
        ]);
        const qi = q.data as { data?: import("./types").QuoteData; error: string | null } | undefined;
        const hi = h.data as { data?: HistoryData; error: string | null } | undefined;
        quotes.push({ ticker: t, quote: qi?.data ?? undefined, history: hi?.data ?? undefined, error: qi?.error ?? hi?.error ?? q.error ?? h.error ?? undefined });
      }
      const result: StepResult = { kind: "compare", quotes };
      await recordStep({ index: i, tool: step.tool, thoughtArg: thought, expected, action: `compare(${step.tickers.join(",")})`, result, startedAt });
    } else if (step.tool === "portfolio") {
      const startedAt = performance.now();
      const histories: { ticker: string; data?: HistoryData; error?: string }[] = [];
      for (const t of step.tickers) {
        const r = await protect(sessionId, "history", () => getHistory({ data: { ticker: t } }));
        const inner = r.data as { data?: HistoryData; error: string | null } | undefined;
        histories.push({ ticker: t, data: inner?.data ?? undefined, error: inner?.error ?? r.error ?? undefined });
      }
      const valid = histories.filter((h): h is { ticker: string; data: HistoryData } => !!h.data);
      const corr = correlationMatrix(valid.map((v) => v.data.dailyReturns));
      const portVol = annualizedPortfolioVol(valid.map((v) => v.data));
      const result: StepResult = { kind: "portfolio", tickers: histories.map((h) => h.ticker), histories, correlation: corr, portfolioVol: portVol };
      await recordStep({ index: i, tool: step.tool, thoughtArg: thought, expected, action: `portfolio(${step.tickers.join(",")})`, result, startedAt });
    } else if (step.tool === "filings") {
      for (const t of step.tickers) {
        await handleSingle(t, "filings", `getFilings(${t})`,
          () => getFilings({ data: { ticker: t } }),
          (d) => { const x = d as { ticker: string; company: string; filings: import("./types").Filing[] }; return { kind: "filings", ticker: t, company: x.company, filings: x.filings }; },
          (e) => ({ kind: "filings", ticker: t, error: e }));
      }
    } else if (step.tool === "insider") {
      for (const t of step.tickers) {
        await handleSingle(t, "insider", `getInsider(${t})`,
          () => getInsider({ data: { ticker: t } }),
          (d) => { const x = d as { trades: import("./types").InsiderTrade[] }; return { kind: "insider", ticker: t, trades: x.trades }; },
          (e) => ({ kind: "insider", ticker: t, error: e }));
      }
    } else if (step.tool === "websearch") {
      const q = step.tickers.join(" ") || step.label || query;
      const startedAt = performance.now();
      const r = await protect(sessionId, "websearch", () => webSearch({ data: { query: q } }));
      const inner = r.data as { data?: { query: string; answer: string; results: import("./types").WebHit[] }; error: string | null } | undefined;
      const result: StepResult = inner?.data && !inner.error
        ? { kind: "websearch", query: inner.data.query, answer: inner.data.answer, results: inner.data.results }
        : { kind: "websearch", query: q, error: inner?.error || r.error || "Web search failed" };
      notifyStepError("error" in result ? result.error : undefined, toastSeen);
      await recordStep({ index: i, tool: step.tool, thoughtArg: thought, expected, action: `webSearch(${q})`, result, startedAt });
    } else if (step.tool === "macro") {
      for (const ind of step.tickers) {
        await handleSingle(ind, "macro", `getMacro(${ind})`,
          () => getMacro({ data: { indicator: ind } }),
          (d) => { const x = d as { indicator: string; latest: import("./types").MacroPoint; series: import("./types").MacroPoint[]; yoyChange: number | null }; return { kind: "macro", indicator: x.indicator, latest: x.latest, series: x.series, yoyChange: x.yoyChange }; },
          (e) => ({ kind: "macro", indicator: ind, error: e }));
      }
    } else if (step.tool === "fx") {
      const [from, to] = step.tickers;
      if (from && to) {
        await handleSingle(`${from}/${to}`, "fx", `getFx(${from}->${to})`,
          () => getFx({ data: { from, to } }),
          (d) => { const x = d as { from: string; to: string; rate: number; updatedAt: string }; return { kind: "fx", from: x.from, to: x.to, rate: x.rate, updatedAt: x.updatedAt }; },
          (e) => ({ kind: "fx", from, to, error: e }));
      }
    } else if (step.tool === "profile") {
      for (const t of step.tickers) {
        await handleSingle(t, "profile", `getProfile(${t})`,
          () => getProfile({ data: { ticker: t } }),
          (d) => ({ kind: "profile", ticker: t, data: d as import("./types").CompanyProfile }),
          (e) => ({ kind: "profile", ticker: t, error: e }));
      }
    } else if (step.tool === "peers") {
      for (const t of step.tickers) {
        await handleSingle(t, "peers", `getPeers(${t})`,
          () => getPeers({ data: { ticker: t } }),
          (d) => { const x = d as { peers: import("./types").PeerRow[] }; return { kind: "peers", ticker: t, peers: x.peers }; },
          (e) => ({ kind: "peers", ticker: t, error: e }));
      }
    } else if (step.tool === "transcript") {
      for (const t of step.tickers) {
        const now = new Date();
        const year = now.getFullYear();
        const quarter = Math.max(1, Math.ceil((now.getMonth() + 1) / 3) - 1) as 1 | 2 | 3 | 4;
        await handleSingle(t, "transcript", `getTranscript(${t} Q${quarter}/${year})`,
          () => getTranscript({ data: { ticker: t, quarter, year } }),
          (d) => ({ kind: "transcript", ticker: t, data: d as import("./types").TranscriptData }),
          (e) => ({ kind: "transcript", ticker: t, error: e }));
      }
    } else if (step.tool === "factcheck") {
      const claim = step.tickers.join(" ") || step.label;
      const startedAt = performance.now();
      const r = await protect(sessionId, "factcheck", () => factCheck({ data: { claim } }));
      const inner = r.data as { data?: import("./types").FactCheckResult; error: string | null } | undefined;
      const result: StepResult = inner?.data && !inner.error
        ? { kind: "factcheck", data: inner.data }
        : { kind: "factcheck", error: inner?.error || r.error || "Fact check failed" };
      notifyStepError("error" in result ? result.error : undefined, toastSeen);
      await recordStep({ index: i, tool: step.tool, thoughtArg: thought, expected, action: `factCheck(${claim.slice(0, 60)})`, result, startedAt });
    } else if (step.tool === "calc") {
      // Calc requires structured inputs; surface as note for now.
      const startedAt = performance.now();
      const result: StepResult = { kind: "calc", error: "Calculation requires structured inputs — invoke via runCalc with explicit parameters." };
      await recordStep({ index: i, tool: step.tool, thoughtArg: thought, expected, action: `calc()`, result, startedAt });
    }
  }

  // 3) Conflict resolution + synthesis context
  const conflictReport = formatConflictReport(steps);
  update((m) => { m.discrepancies = conflictReport ? conflictReport.split("\n") : []; });

  const ctxParts: string[] = [];
  if (memoryHint) ctxParts.push(`Prior research recalled:\n${memoryHint}`);
  if (episodicHint) ctxParts.push(`Episodic insight: ${episodicHint}`);
  for (const s of steps) {
    if (s.kind === "quote" && s.data) {
      const q = s.data;
      ctxParts.push(`${q.ticker} (${q.name}): price=${fmtNum(q.price)} ${q.currency}, change=${q.changePercent ?? "?"}%, P/E=${fmtNum(q.peRatio)}, EPS=${fmtNum(q.eps)}, MCap=${fmtMoney(q.marketCap, q.currency)}, beta=${fmtNum(q.beta)}, 52W=${fmtNum(q.weekLow52)}-${fmtNum(q.weekHigh52)}.`);
    } else if (s.kind === "history" && s.data) {
      const h = s.data;
      ctxParts.push(`${h.ticker} risk: 30d=${fmtPct(h.return30d)}, ann.vol=${fmtPct(h.annualVolatility)}, maxDD=${fmtPct(h.maxDrawdown)}, 1d95%VaR=${fmtPct(h.var95OneDay)}.`);
    } else if (s.kind === "news" && s.articles) {
      const counts = { Bullish: 0, Neutral: 0, Bearish: 0 } as Record<string, number>;
      (s.sentiments ?? []).forEach((x) => { counts[x.sentiment] = (counts[x.sentiment] || 0) + 1; });
      ctxParts.push(`${s.ticker} news (${s.articles.length}): Bull=${counts.Bullish}, Neu=${counts.Neutral}, Bear=${counts.Bearish}. Top: ${s.articles.slice(0, 3).map((a) => a.title).join(" | ")}`);
    } else if (s.kind === "portfolio") {
      ctxParts.push(`Portfolio ${s.tickers.join(",")}: equal-weight ann.vol=${fmtPct(s.portfolioVol)}.`);
    } else if (s.kind === "compare") {
      ctxParts.push(`Compare: ${s.quotes.map((q) => `${q.ticker} P/E=${fmtNum(q.quote?.peRatio)} 30d=${fmtPct(q.history?.return30d)} vol=${fmtPct(q.history?.annualVolatility)}`).join(" | ")}`);
    } else if (s.kind === "filings" && s.filings) {
      ctxParts.push(`SEC filings for ${s.ticker} (${s.company}): ${s.filings.slice(0, 4).map((f) => `${f.form} ${f.date}`).join(", ")}.`);
    } else if (s.kind === "insider" && s.trades) {
      ctxParts.push(`Recent insider activity ${s.ticker}: ${s.trades.length} Form 3/4/5 filings (latest ${s.trades[0]?.date}).`);
    } else if (s.kind === "websearch" && s.results) {
      ctxParts.push(`Web search "${s.query}": ${s.answer ? s.answer + " " : ""}Sources: ${s.results.slice(0, 3).map((r) => r.title).join(" | ")}`);
    } else if (s.kind === "macro" && s.latest) {
      ctxParts.push(`Macro ${s.indicator}: latest ${s.latest.value} on ${s.latest.date}${s.yoyChange != null ? `, YoY ${fmtPct(s.yoyChange)}` : ""}.`);
    } else if (s.kind === "fx" && s.rate) {
      ctxParts.push(`FX ${s.from}/${s.to}: ${s.rate} (${s.updatedAt}).`);
    } else if (s.kind === "profile" && s.data) {
      const p = s.data;
      ctxParts.push(`Profile ${p.ticker} (${p.name}): ${p.sector}/${p.industry}${p.country ? `, ${p.country}` : ""}. ${p.description.slice(0, 400)}`);
    } else if (s.kind === "peers" && s.peers) {
      ctxParts.push(`Peers for ${s.ticker}: ${s.peers.map((p) => `${p.ticker} P/E=${fmtNum(p.pe)} MCap=${fmtMoney(p.marketCap, "USD")}`).join(" | ")}`);
    } else if (s.kind === "transcript" && s.data) {
      ctxParts.push(`Earnings call ${s.data.ticker} Q${s.data.quarter}/${s.data.year}${s.data.fallback ? " (web fallback)" : ""}: ${(s.data.ceoRemarks || "").slice(0, 500)}`);
    } else if (s.kind === "factcheck" && s.data) {
      ctxParts.push(`Fact check "${s.data.claim}": ${s.data.verdict} (conf ${(s.data.confidence * 100).toFixed(0)}%). ${s.data.notes}`);
    }
  }

  const synth = await agentSynthesize({
    data: {
      query, context: ctxParts.join("\n"),
      history: history.slice(-4).map((m) => ({ role: m.role, content: m.content })),
      conflictReport: conflictReport || undefined,
      assumptions: opts.assumptions,
    },
  });
  const synthesis = synth.data ?? synth.error ?? "";
  update((m) => { m.synthesis = synthesis; m.pending = false; });

  const tickers = Array.from(allTickers);
  const durationMs = performance.now() - t0;
  const toolsUsed = Array.from(new Set(steps.map((s) => s.kind)));
  const markdown = buildReportMarkdown({
    query, tickers, steps, synthesis,
    conflictReport, assumptions: opts.assumptions, sessionId, durationMs, toolsUsed,
  });

  // Episodic log
  appendEpisodic({
    sessionId, queryType, tickers,
    successfulTools: Array.from(new Set(successfulTools)),
    failedTools: Array.from(new Set(failedTools)),
    fallbacksUsed: Array.from(new Set(fallbacksUsed)),
    timestamp: Date.now(),
  });

  // Embed for long-term memory
  const embedding = await embedQuery(`${query}\n\n${synthesis.slice(0, 1500)}`);

  return { tickers, reportMarkdown: markdown, synthesis, steps, embedding };
}

// Helper: did a previous runAgent call pause for disambiguation?
export function isPaused(r: AgentResult | PausedResult): r is PausedResult {
  return (r as PausedResult).paused === true;
}
