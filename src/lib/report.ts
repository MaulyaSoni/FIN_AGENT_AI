import type { HistoryData, Report, StepResult } from "./types";

export function fmtPct(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

export function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function fmtMoney(n: number | null | undefined, currency = "USD"): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1e12) return `${currency} ${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9) return `${currency} ${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${currency} ${(n / 1e6).toFixed(2)}M`;
  return `${currency} ${n.toLocaleString()}`;
}

export function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = a.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const mb = b.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? 0 : num / den;
}

export function correlationMatrix(returnSets: number[][]): number[][] {
  return returnSets.map((a) => returnSets.map((b) => correlation(a, b)));
}

function stepDataLines(steps: StepResult[]): string[] {
  const out: string[] = [];
  for (const s of steps) {
    if (s.kind === "quote" && s.data) {
      const q = s.data;
      out.push(`- **${q.ticker}** — ${q.name}: price ${fmtNum(q.price)} ${q.currency} (${q.changePercent ?? "—"}%), P/E ${fmtNum(q.peRatio)}, EPS ${fmtNum(q.eps)}, MCap ${fmtMoney(q.marketCap, q.currency)}, Beta ${fmtNum(q.beta)}.`);
    } else if (s.kind === "history" && s.data) {
      out.push(`- **${s.data.ticker} risk**: 30d ${fmtPct(s.data.return30d)}, ann.vol ${fmtPct(s.data.annualVolatility)}, max DD ${fmtPct(s.data.maxDrawdown)}, 95% 1d VaR ${fmtPct(s.data.var95OneDay)}.`);
    } else if (s.kind === "news" && s.articles) {
      const counts = { Bullish: 0, Neutral: 0, Bearish: 0 } as Record<string, number>;
      (s.sentiments ?? []).forEach((x) => { counts[x.sentiment] = (counts[x.sentiment] || 0) + 1; });
      out.push(`- **${s.ticker} news**: ${s.articles.length} headlines (Bull ${counts.Bullish} / Neu ${counts.Neutral} / Bear ${counts.Bearish}).`);
    } else if (s.kind === "filings" && s.filings) {
      out.push(`- **${s.ticker} filings**: ${s.filings.slice(0, 5).map((f) => `${f.form} ${f.date}`).join(", ")}.`);
    } else if (s.kind === "insider" && s.trades) {
      out.push(`- **${s.ticker} insider**: ${s.trades.length} Form 3/4/5 filings.`);
    } else if (s.kind === "macro" && s.latest) {
      out.push(`- **Macro ${s.indicator}**: ${s.latest.value} on ${s.latest.date}.`);
    } else if (s.kind === "profile" && s.data) {
      out.push(`- **${s.data.ticker} profile**: ${s.data.sector} / ${s.data.industry}${s.data.country ? `, ${s.data.country}` : ""}.`);
    } else if (s.kind === "peers" && s.peers) {
      out.push(`- **${s.ticker} peers**: ${s.peers.map((p) => p.ticker).join(", ")}.`);
    } else if (s.kind === "portfolio") {
      out.push(`- **Portfolio** ${s.tickers.join(", ")}: equal-weight ann.vol ${fmtPct(s.portfolioVol)}.`);
    } else if (s.kind === "factcheck" && s.data) {
      out.push(`- **Fact check** "${s.data.claim}": ${s.data.verdict} (${(s.data.confidence * 100).toFixed(0)}% confidence).`);
    }
  }
  return out;
}

function extractSection(synthesis: string, name: string): string {
  const re = new RegExp(`(?:^|\\n)\\s*(?:#+\\s*|\\*\\*)?\\d?\\.?\\s*${name}[\\s\\S]*?(?=\\n\\s*(?:#+\\s*|\\*\\*)?\\d\\.|$)`, "i");
  const m = synthesis.match(re);
  return m ? m[0].trim() : "";
}

export function buildReportMarkdown(input: {
  query: string;
  tickers: string[];
  steps: StepResult[];
  synthesis: string;
  conflictReport?: string;
  assumptions?: string[];
  sessionId?: string;
  durationMs?: number;
  toolsUsed?: string[];
}): string {
  const date = new Date().toLocaleString();
  const title = input.tickers.length > 0
    ? `Investment Research Report: ${input.tickers.join(", ")}`
    : `ARA-1 Research Report`;
  const lines: string[] = [];
  lines.push(`# ${title}`, ``);
  lines.push(`**Date:** ${date}  `);
  lines.push(`**Query:** ${input.query}  `);
  if (input.toolsUsed?.length) lines.push(`**Tools used:** ${input.toolsUsed.join(", ")}  `);
  if (input.durationMs != null) lines.push(`**Duration:** ${(input.durationMs / 1000).toFixed(1)}s  `);
  lines.push(``, `---`, ``);

  // 1. Executive Summary
  lines.push(`## 1. Executive Summary`, ``);
  const exec = extractSection(input.synthesis, "Executive Summary");
  lines.push(exec ? exec.replace(/^#+.*\n?/, "").trim() : (input.synthesis.split("\n\n")[0] || "_Pending._"), ``);

  // 2. Company Snapshot
  lines.push(`## 2. Company Snapshot`, ``);
  const snap = extractSection(input.synthesis, "Company Snapshot");
  if (snap) lines.push(snap.replace(/^#+.*\n?/, "").trim(), ``);
  const profileStep = input.steps.find((s) => s.kind === "profile") as Extract<StepResult, { kind: "profile" }> | undefined;
  if (profileStep?.data) {
    lines.push(`- ${profileStep.data.name} (${profileStep.data.ticker}) — ${profileStep.data.sector || "—"} / ${profileStep.data.industry || "—"}`);
    if (profileStep.data.description) lines.push(`- ${profileStep.data.description.slice(0, 400)}`);
    lines.push(``);
  }
  const quoteLines = stepDataLines(input.steps.filter((s) => s.kind === "quote" || s.kind === "peers" || s.kind === "profile" || s.kind === "filings"));
  if (quoteLines.length) lines.push(...quoteLines, ``);

  // 3. Market & Sentiment
  lines.push(`## 3. Market & Sentiment`, ``);
  const market = extractSection(input.synthesis, "Market & Sentiment") || extractSection(input.synthesis, "News & Sentiment");
  if (market) lines.push(market.replace(/^#+.*\n?/, "").trim(), ``);
  const marketLines = stepDataLines(input.steps.filter((s) => s.kind === "news" || s.kind === "macro"));
  if (marketLines.length) lines.push(...marketLines, ``);

  // 4. Risk Profile
  lines.push(`## 4. Risk Profile`, ``);
  const risk = extractSection(input.synthesis, "Risk Profile") || extractSection(input.synthesis, "Risk & Volatility");
  if (risk) lines.push(risk.replace(/^#+.*\n?/, "").trim(), ``);
  const riskLines = stepDataLines(input.steps.filter((s) => s.kind === "history" || s.kind === "portfolio"));
  if (riskLines.length) lines.push(...riskLines, ``);

  // 5. Data Discrepancies (only when present)
  if (input.conflictReport && input.conflictReport.trim()) {
    lines.push(`## 5. Data Discrepancies`, ``);
    lines.push(`The following metrics had conflicting values across sources; resolved via source-tier priority:`, ``);
    lines.push(input.conflictReport, ``);
  }

  // 6. Research Assumptions (only when present)
  if (input.assumptions && input.assumptions.length) {
    lines.push(`## 6. Research Assumptions`, ``);
    input.assumptions.forEach((a) => lines.push(`- ${a}`));
    lines.push(``);
  }

  // 7. Methodology & Sources
  lines.push(`## 7. Methodology & Sources`, ``);
  const method = extractSection(input.synthesis, "Methodology");
  if (method) lines.push(method.replace(/^#+.*\n?/, "").trim(), ``);
  if (input.toolsUsed?.length) lines.push(`- Tools invoked: ${input.toolsUsed.join(", ")}`);
  const sourceLinks: string[] = [];
  for (const s of input.steps) {
    if (s.kind === "filings" && s.filings) s.filings.slice(0, 3).forEach((f) => sourceLinks.push(`- SEC ${f.form} (${f.date}) — ${f.url}`));
    if (s.kind === "websearch" && s.results) s.results.slice(0, 3).forEach((r) => sourceLinks.push(`- ${r.title} — ${r.url}`));
    if (s.kind === "news" && s.articles) s.articles.slice(0, 3).forEach((a) => sourceLinks.push(`- ${a.source}: ${a.title} — ${a.url}`));
  }
  if (sourceLinks.length) lines.push(`- Sources cited:`, ...sourceLinks);
  lines.push(``);

  // Analyst synthesis (full text)
  lines.push(`---`, ``, `## Full Analyst Synthesis`, ``);
  lines.push(input.synthesis || "_No synthesis available._", ``);

  // Watermark footer
  lines.push(`---`, ``);
  lines.push(`_Generated by **ARA-1** (Autonomous Research Agent) · Session \`${input.sessionId || "—"}\` · ${date}_`);
  lines.push(`_Disclaimer: educational only, not investment advice._`);
  return lines.join("\n");
}

export function downloadReport(report: Report) {
  const blob = new Blob([report.markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safe = report.title.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 80);
  a.download = `ara1_${safe}_${report.id.slice(0, 8)}.md`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export function annualizedPortfolioVol(history: HistoryData[]): number {
  if (history.length === 0) return 0;
  const minLen = Math.min(...history.map((h) => h.dailyReturns.length));
  if (minLen < 2) return 0;
  const w = 1 / history.length;
  const port: number[] = [];
  for (let i = 0; i < minLen; i++) {
    let r = 0;
    for (const h of history) r += w * h.dailyReturns[h.dailyReturns.length - minLen + i];
    port.push(r);
  }
  const mean = port.reduce((s, v) => s + v, 0) / port.length;
  const variance = port.reduce((s, v) => s + (v - mean) ** 2, 0) / port.length;
  return Math.sqrt(variance) * Math.sqrt(252);
}
