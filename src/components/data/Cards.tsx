import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart, Legend } from "recharts";
import { ExternalLink, FileText, Users, Globe, Activity, ArrowLeftRight, Building2, GitCompareArrows, Mic, ShieldCheck, ShieldAlert, ShieldQuestion, Calculator } from "lucide-react";
import type { HistoryPoint, QuoteData, HistoryData, NewsArticle, SentimentResult, StepResult, Filing, InsiderTrade, WebHit, MacroPoint, CompanyProfile, PeerRow, TranscriptData, FactCheckResult, CalcResult } from "@/lib/types";
import { fmtMoney, fmtNum, fmtPct } from "@/lib/report";

function Stat({ label, value, mono = true, tone }: { label: string; value: string; mono?: boolean; tone?: "pos" | "neg" }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`${mono ? "font-mono" : ""} text-sm ${tone === "pos" ? "num-pos" : tone === "neg" ? "num-neg" : ""}`}>{value}</div>
    </div>
  );
}

export function QuoteCard({ data, error, ticker }: { data?: QuoteData; error?: string; ticker: string }) {
  if (error) return <ErrorCard title={ticker} msg={error} />;
  if (!data) return null;
  const cp = parseFloat(data.changePercent ?? "");
  const tone = Number.isFinite(cp) ? (cp >= 0 ? "pos" : "neg") : undefined;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="font-semibold">{data.ticker} <span className="text-muted-foreground font-normal">{data.name}</span></div>
          <div className="text-xs text-muted-foreground">{[data.exchange, data.sector].filter(Boolean).join(" · ")}</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-lg">{fmtNum(data.price)} <span className="text-xs text-muted-foreground">{data.currency}</span></div>
          <div className={`font-mono text-xs ${tone === "pos" ? "num-pos" : tone === "neg" ? "num-neg" : ""}`}>{data.changePercent ?? "—"}%</div>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat label="52W high" value={fmtNum(data.weekHigh52)} />
        <Stat label="52W low" value={fmtNum(data.weekLow52)} />
        <Stat label="Market cap" value={fmtMoney(data.marketCap, data.currency)} />
        <Stat label="P/E" value={fmtNum(data.peRatio)} />
        <Stat label="EPS" value={fmtNum(data.eps)} />
        <Stat label="Beta" value={data.beta == null ? "n/a*" : fmtNum(data.beta)} />
      </div>
      {data.beta == null && <div className="mt-2 text-[10px] text-muted-foreground">* Beta unavailable on free tier for this market.</div>}
    </div>
  );
}

export function PriceChart({ data, error, ticker }: { data?: HistoryData; error?: string; ticker: string }) {
  if (error) return <ErrorCard title={`${ticker} history`} msg={error} />;
  if (!data) return null;
  const series: HistoryPoint[] = data.series;
  const tone = data.return30d >= 0 ? "pos" : "neg";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold">{data.ticker} · 90-day price</div>
        <div className="text-xs text-muted-foreground">
          30d <span className={`font-mono ${tone === "pos" ? "num-pos" : "num-neg"}`}>{fmtPct(data.return30d)}</span>
          {"  ·  "}ann.vol <span className="font-mono">{fmtPct(data.annualVolatility)}</span>
        </div>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
            <XAxis dataKey="date" hide />
            <YAxis domain={["dataMin", "dataMax"]} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} width={48} />
            <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "var(--muted-foreground)" }} formatter={(v: number) => [v.toFixed(2), "Close"]} />
            <Line type="monotone" dataKey="close" stroke="var(--primary)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function RiskCard({ data, ticker }: { data: HistoryData; ticker: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="font-semibold mb-3">{ticker} · Risk profile</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Ann. vol" value={fmtPct(data.annualVolatility)} />
        <Stat label="Max drawdown" value={fmtPct(data.maxDrawdown)} tone="neg" />
        <Stat label="1d 95% VaR" value={fmtPct(data.var95OneDay)} tone="neg" />
        <Stat label="30d return" value={fmtPct(data.return30d)} tone={data.return30d >= 0 ? "pos" : "neg"} />
      </div>
    </div>
  );
}

export function SentimentBadge({ s }: { s: "Bullish" | "Neutral" | "Bearish" }) {
  const cls = s === "Bullish"
    ? "bg-[color:var(--bullish)]/15 text-[color:var(--bullish)] border-[color:var(--bullish)]/30"
    : s === "Bearish" ? "bg-destructive/15 text-destructive border-destructive/30"
    : "bg-muted text-muted-foreground border-border";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-mono ${cls}`}>{s}</span>;
}

export function NewsCard({ ticker, articles, sentiments, error }: { ticker: string; articles?: NewsArticle[]; sentiments?: SentimentResult[]; error?: string }) {
  if (error) return <ErrorCard title={`${ticker} news`} msg={error} />;
  if (!articles || articles.length === 0) return <ErrorCard title={`${ticker} news`} msg="No recent headlines found." />;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="font-semibold mb-3">{ticker} · News & sentiment</div>
      <ul className="space-y-3">
        {articles.map((a, i) => {
          const s = sentiments?.[i];
          return (
            <li key={i} className="flex items-start gap-3">
              {s && <SentimentBadge s={s.sentiment} />}
              <div className="min-w-0">
                <a href={a.url} target="_blank" rel="noreferrer" className="text-sm hover:underline line-clamp-2">{a.title}</a>
                <div className="text-[11px] text-muted-foreground">{a.source}{a.publishedAt ? ` · ${new Date(a.publishedAt).toLocaleDateString()}` : ""}</div>
                {s?.summary && <div className="text-xs text-muted-foreground mt-1">{s.summary}</div>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function CompareGrid({ quotes }: { quotes: Array<{ ticker: string; quote?: QuoteData; history?: HistoryData; error?: string }> }) {
  const chartData = quotes.filter((q) => q.quote || q.history).map((q) => ({
    ticker: q.ticker, pe: q.quote?.peRatio ?? 0,
    ret30: q.history ? q.history.return30d * 100 : 0,
    vol: q.history ? q.history.annualVolatility * 100 : 0,
  }));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {quotes.map((q) => (
          <div key={q.ticker} className="rounded-lg border border-border bg-card p-3">
            <div className="font-semibold text-sm mb-2">{q.ticker}</div>
            {q.error && <div className="text-xs text-destructive">{q.error}</div>}
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Price" value={fmtNum(q.quote?.price)} />
              <Stat label="P/E" value={fmtNum(q.quote?.peRatio)} />
              <Stat label="30d" value={fmtPct(q.history?.return30d)} tone={(q.history?.return30d ?? 0) >= 0 ? "pos" : "neg"} />
              <Stat label="Vol" value={fmtPct(q.history?.annualVolatility)} />
            </div>
          </div>
        ))}
      </div>
      {chartData.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="font-semibold mb-2 text-sm">Comparison · P/E vs 30d return % vs ann. vol %</div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="ticker" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} width={40} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="pe" fill="var(--primary)" name="P/E" />
                <Bar dataKey="ret30" fill="var(--bullish)" name="30d return %" />
                <Bar dataKey="vol" fill="var(--warning)" name="Ann. vol %" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

export function CorrelationHeatmap({ tickers, matrix }: { tickers: string[]; matrix: number[][] }) {
  const cellColor = (v: number) => {
    const t = Math.max(-1, Math.min(1, v));
    if (t >= 0) return `oklch(0.7 0.18 150 / ${(t * 0.7).toFixed(2)})`;
    return `oklch(0.65 0.22 25 / ${(-t * 0.7).toFixed(2)})`;
  };
  return (
    <div className="rounded-lg border border-border bg-card p-4 overflow-x-auto">
      <div className="font-semibold text-sm mb-3">Correlation matrix</div>
      <table className="border-collapse text-xs font-mono">
        <thead>
          <tr><th className="p-2"></th>{tickers.map((t) => <th key={t} className="p-2 text-muted-foreground font-normal">{t}</th>)}</tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={i}>
              <th className="p-2 pr-3 text-right text-muted-foreground font-normal">{tickers[i]}</th>
              {row.map((v, j) => (
                <td key={j} className="p-2 min-w-12 text-center border border-border" style={{ background: cellColor(v) }} title={`${tickers[i]} vs ${tickers[j]}: ${v.toFixed(3)}`}>
                  {v.toFixed(2)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PortfolioCard({ step }: { step: Extract<StepResult, { kind: "portfolio" }> }) {
  const valid = step.histories.filter((h) => h.data);
  const validTickers = valid.map((v) => v.ticker);
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="font-semibold text-sm mb-3">Portfolio · {step.tickers.join(", ")}</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Constituents" value={String(step.tickers.length)} />
          <Stat label="Equal-weight ann. vol" value={fmtPct(step.portfolioVol)} />
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {step.histories.map((h) => (
            <div key={h.ticker} className="flex items-center justify-between text-xs border border-border rounded px-2 py-1">
              <span className="font-mono">{h.ticker}</span>
              {h.error ? <span className="text-destructive">{h.error}</span>
                : <span className={`font-mono ${(h.data?.return30d ?? 0) >= 0 ? "num-pos" : "num-neg"}`}>{fmtPct(h.data?.return30d)}</span>}
            </div>
          ))}
        </div>
      </div>
      {validTickers.length >= 2 && <CorrelationHeatmap tickers={validTickers} matrix={step.correlation} />}
    </div>
  );
}

export function FilingsCard({ ticker, company, filings, error }: { ticker: string; company?: string; filings?: Filing[]; error?: string }) {
  if (error) return <ErrorCard title={`${ticker} filings`} msg={error} />;
  if (!filings || filings.length === 0) return <ErrorCard title={`${ticker} filings`} msg="No recent filings." />;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3"><FileText className="size-4 text-primary" /><span className="font-semibold">{ticker} · SEC Filings {company && <span className="text-muted-foreground font-normal">({company})</span>}</span></div>
      <ul className="space-y-1.5">
        {filings.map((f) => (
          <li key={f.accession} className="flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2"><span className="font-mono inline-flex rounded bg-accent px-1.5 py-0.5 text-accent-foreground">{f.form}</span><span className="text-muted-foreground">{f.date}</span></div>
            <a href={f.url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">View <ExternalLink className="size-3" /></a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function InsiderCard({ ticker, trades, error }: { ticker: string; trades?: InsiderTrade[]; error?: string }) {
  if (error) return <ErrorCard title={`${ticker} insider`} msg={error} />;
  if (!trades || trades.length === 0) return <ErrorCard title={`${ticker} insider`} msg="No recent insider filings." />;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3"><Users className="size-4 text-primary" /><span className="font-semibold">{ticker} · Insider activity</span></div>
      <ul className="space-y-1.5">
        {trades.map((t, i) => (
          <li key={i} className="flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2"><span className="font-mono inline-flex rounded bg-accent px-1.5 py-0.5 text-accent-foreground">{t.form}</span><span className="text-muted-foreground">{t.date}</span></div>
            <a href={t.url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">View <ExternalLink className="size-3" /></a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WebSearchCard({ query, answer, results, error }: { query: string; answer?: string; results?: WebHit[]; error?: string }) {
  if (error) return <ErrorCard title={`Web search: ${query}`} msg={error} />;
  if (!results || results.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2"><Globe className="size-4 text-primary" /><span className="font-semibold text-sm">Web search · "{query}"</span></div>
      {answer && <div className="mb-3 text-xs italic text-muted-foreground border-l-2 border-primary/40 pl-3">{answer}</div>}
      <ul className="space-y-2">
        {results.map((r, i) => (
          <li key={i}>
            <a href={r.url} target="_blank" rel="noreferrer" className="text-sm hover:underline line-clamp-1">{r.title}</a>
            <div className="text-xs text-muted-foreground line-clamp-2">{r.snippet}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MacroCard({ indicator, latest, series, yoyChange, error }: { indicator: string; latest?: MacroPoint; series?: MacroPoint[]; yoyChange?: number | null; error?: string }) {
  if (error) return <ErrorCard title={`Macro: ${indicator}`} msg={error} />;
  if (!latest) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3"><Activity className="size-4 text-primary" /><span className="font-semibold text-sm">Macro · {indicator}</span></div>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <Stat label="Latest" value={fmtNum(latest.value)} />
        <Stat label="As of" value={latest.date} mono={false} />
        <Stat label="YoY" value={yoyChange != null ? fmtPct(yoyChange) : "—"} tone={yoyChange != null && yoyChange >= 0 ? "pos" : "neg"} />
      </div>
      {series && series.length > 1 && (
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series}>
              <XAxis dataKey="date" hide />
              <YAxis domain={["dataMin", "dataMax"]} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} width={40} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export function FxCard({ from, to, rate, updatedAt, error }: { from: string; to: string; rate?: number; updatedAt?: string; error?: string }) {
  if (error) return <ErrorCard title={`FX ${from}/${to}`} msg={error} />;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2"><ArrowLeftRight className="size-4 text-primary" /><span className="font-semibold text-sm">FX · {from} → {to}</span></div>
      <div className="font-mono text-2xl">{fmtNum(rate, 4)}</div>
      {updatedAt && <div className="text-[11px] text-muted-foreground mt-1">Updated {updatedAt}</div>}
    </div>
  );
}

export function ProfileCard({ ticker, data, error }: { ticker: string; data?: CompanyProfile; error?: string }) {
  if (error) return <ErrorCard title={`${ticker} profile`} msg={error} />;
  if (!data) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3"><Building2 className="size-4 text-primary" /><span className="font-semibold">{data.ticker} · Company profile</span>{data.fallback && <span className="text-[10px] uppercase tracking-wider rounded bg-warning/15 text-[color:var(--warning)] px-1.5 py-0.5 border border-warning/30">web fallback</span>}</div>
      <div className="text-sm font-medium">{data.name}</div>
      <div className="text-xs text-muted-foreground mb-2">{[data.sector, data.industry, data.country].filter(Boolean).join(" · ")}</div>
      {data.description && <p className="text-xs leading-relaxed text-muted-foreground mb-3 whitespace-pre-wrap">{data.description}</p>}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Exchange" value={data.exchange || "—"} mono={false} />
        <Stat label="Employees" value={fmtNum(data.employees)} />
        <Stat label="Market cap" value={fmtMoney(data.marketCap, data.currency)} />
        <Stat label="Website" value={data.website ? "↗ link" : "—"} mono={false} />
      </div>
      {data.website && <div className="mt-2"><a href={data.website} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">{data.website} <ExternalLink className="size-3" /></a></div>}
    </div>
  );
}

export function PeersCard({ ticker, peers, error }: { ticker: string; peers?: PeerRow[]; error?: string }) {
  if (error) return <ErrorCard title={`${ticker} peers`} msg={error} />;
  if (!peers || peers.length === 0) return <ErrorCard title={`${ticker} peers`} msg="No peers found." />;
  return (
    <div className="rounded-lg border border-border bg-card p-4 overflow-x-auto">
      <div className="flex items-center gap-2 mb-3"><GitCompareArrows className="size-4 text-primary" /><span className="font-semibold">{ticker} · Peer comparison</span></div>
      <table className="w-full text-xs">
        <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr><th className="text-left p-1.5">Ticker</th><th className="text-left p-1.5">Name</th><th className="text-right p-1.5">P/E</th><th className="text-right p-1.5">M.Cap</th><th className="text-right p-1.5">Rev YoY</th><th className="text-right p-1.5">Margin</th><th className="text-right p-1.5">Beta</th></tr>
        </thead>
        <tbody>
          {peers.map((p) => (
            <tr key={p.ticker} className="border-t border-border">
              <td className="p-1.5 font-mono">{p.ticker}</td>
              <td className="p-1.5 text-muted-foreground truncate max-w-[160px]">{p.name}</td>
              <td className="p-1.5 text-right font-mono">{fmtNum(p.pe)}</td>
              <td className="p-1.5 text-right font-mono">{fmtMoney(p.marketCap, "USD")}</td>
              <td className="p-1.5 text-right font-mono">{fmtPct(p.revenueGrowth)}</td>
              <td className="p-1.5 text-right font-mono">{fmtPct(p.profitMargin)}</td>
              <td className="p-1.5 text-right font-mono">{fmtNum(p.beta)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TranscriptCard({ ticker, data, error }: { ticker: string; data?: TranscriptData; error?: string }) {
  if (error) return <ErrorCard title={`${ticker} transcript`} msg={error} />;
  if (!data) return null;
  const Block = ({ title, body }: { title: string; body: string }) => body ? (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{title}</div>
      <p className="text-xs leading-relaxed whitespace-pre-wrap line-clamp-6">{body}</p>
    </div>
  ) : null;
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2"><Mic className="size-4 text-primary" /><span className="font-semibold">{data.ticker} · Earnings call Q{data.quarter} {data.year}</span>{data.fallback && <span className="text-[10px] uppercase tracking-wider rounded bg-warning/15 text-[color:var(--warning)] px-1.5 py-0.5 border border-warning/30">web fallback</span>}</div>
      <Block title="CEO remarks" body={data.ceoRemarks} />
      <Block title="CFO remarks" body={data.cfoRemarks} />
      <Block title="Q&A" body={data.qa} />
    </div>
  );
}

export function FactCheckCard({ data, error }: { data?: FactCheckResult; error?: string }) {
  if (error) return <ErrorCard title="Fact check" msg={error} />;
  if (!data) return null;
  const Icon = data.verdict === "CONFIRMED" ? ShieldCheck : data.verdict === "DISPUTED" ? ShieldAlert : ShieldQuestion;
  const tone = data.verdict === "CONFIRMED" ? "text-[color:var(--bullish)] border-[color:var(--bullish)]/30 bg-[color:var(--bullish)]/10"
    : data.verdict === "DISPUTED" ? "text-destructive border-destructive/30 bg-destructive/10"
    : "text-muted-foreground border-border bg-muted";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Claim</div>
          <div className="text-sm">{data.claim}</div>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-mono shrink-0 ${tone}`}><Icon className="size-3" /> {data.verdict}</span>
      </div>
      <div className="text-xs text-muted-foreground mb-2">Confidence: <span className="font-mono">{(data.confidence * 100).toFixed(0)}%</span></div>
      {data.notes && <p className="text-xs italic text-muted-foreground border-l-2 border-primary/40 pl-3 mb-3">{data.notes}</p>}
      {data.supporting.length > 0 && (
        <div className="mb-2">
          <div className="text-[10px] uppercase tracking-wider text-[color:var(--bullish)] mb-1">Supporting</div>
          <ul className="space-y-1">{data.supporting.map((h, i) => (
            <li key={i} className="text-xs"><a href={h.url} target="_blank" rel="noreferrer" className="hover:underline line-clamp-1">{h.title}</a><div className="text-muted-foreground line-clamp-1">{h.snippet}</div></li>
          ))}</ul>
        </div>
      )}
      {data.conflicting.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-destructive mb-1">Conflicting</div>
          <ul className="space-y-1">{data.conflicting.map((h, i) => (
            <li key={i} className="text-xs"><a href={h.url} target="_blank" rel="noreferrer" className="hover:underline line-clamp-1">{h.title}</a><div className="text-muted-foreground line-clamp-1">{h.snippet}</div></li>
          ))}</ul>
        </div>
      )}
    </div>
  );
}

export function CalculationCard({ data, error }: { data?: CalcResult; error?: string }) {
  if (error) return <ErrorCard title="Calculation" msg={error} />;
  if (!data) return null;
  const tone = data.confidence === "high"
    ? "bg-[color:var(--bullish)]/15 text-[color:var(--bullish)] border-[color:var(--bullish)]/30"
    : data.confidence === "medium"
      ? "bg-[color:var(--warning)]/15 text-[color:var(--warning)] border-[color:var(--warning)]/30"
      : "bg-destructive/15 text-destructive border-destructive/30";
  const renderResult = () => {
    if (typeof data.result === "number") return fmtNum(data.result);
    if (data.result && typeof data.result === "object") {
      const entries = Object.entries(data.result as Record<string, unknown>).slice(0, 6);
      return (
        <div className="grid grid-cols-2 gap-2 text-xs">
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-2 border-b border-border/40 py-1">
              <span className="text-muted-foreground">{k}</span>
              <span className="font-mono">{typeof v === "number" ? fmtNum(v) : String(v).slice(0, 40)}</span>
            </div>
          ))}
        </div>
      );
    }
    return <span className="font-mono">{String(data.result)}</span>;
  };
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Calculator className="size-4 text-primary" />
          <span className="font-semibold text-sm capitalize">{data.calculation.replace(/_/g, " ")}</span>
        </div>
        <span className={`text-[10px] font-mono uppercase tracking-wider rounded-full border px-2 py-0.5 ${tone}`}>{data.confidence} confidence</span>
      </div>
      <div className="font-mono text-[11px] text-muted-foreground bg-background/50 border border-border rounded p-2 mb-3">{data.formula}</div>
      {data.steps.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Steps</div>
          <ul className="space-y-0.5">
            {data.steps.slice(0, 6).map((s, i) => (
              <li key={i} className="text-[11px] font-mono text-foreground/80">{s}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="rounded-md border border-primary/30 bg-primary/5 p-3">{renderResult()}</div>
    </div>
  );
}

export function ErrorCard({ title, msg }: { title: string; msg: string }) {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
      <div className="font-semibold text-destructive">{title}</div>
      <div className="text-destructive/90 text-xs mt-1">{msg}</div>
    </div>
  );
}

export function StepSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-4 animate-pulse">
      <div className="h-3 w-32 bg-muted rounded mb-3" />
      <div className="h-3 w-full bg-muted rounded mb-2" />
      <div className="h-3 w-2/3 bg-muted rounded" />
    </div>
  );
}
