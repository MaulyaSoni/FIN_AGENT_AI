import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BarChart3, LineChart as LineChartIcon, Newspaper, GitCompare, PieChart, FileText, Users, Globe, Activity, ArrowLeftRight, CheckCircle2, XCircle, Building2, GitCompareArrows, Mic, Calculator, ShieldCheck } from "lucide-react";
import { getKeyStatus } from "@/lib/agent.functions";

type KeyStatus = { groq: boolean; alphaVantage: boolean; newsapi: boolean; tavily: boolean; fred: boolean; lovableAI: boolean };

type Tool = {
  name: string;
  id: string;
  desc: string;
  source: string;
  needs: (keyof KeyStatus)[];
  icon: typeof BarChart3;
};

const TOOLS: Tool[] = [
  { name: "quote", id: "quote", desc: "Real-time quote + fundamentals (P/E, EPS, market cap, 52W).", source: "Alpha Vantage GLOBAL_QUOTE + OVERVIEW", needs: ["alphaVantage"], icon: BarChart3 },
  { name: "history", id: "history", desc: "90-day daily closes; computes vol, max drawdown, 1d 95% VaR.", source: "Alpha Vantage TIME_SERIES_DAILY", needs: ["alphaVantage"], icon: LineChartIcon },
  { name: "news", id: "news", desc: "Recent headlines + Bullish/Neutral/Bearish sentiment.", source: "NewsAPI + Groq llama-3.3-70b", needs: ["newsapi", "groq"], icon: Newspaper },
  { name: "compare", id: "compare", desc: "Side-by-side multi-ticker comparison with grouped bar chart.", source: "Alpha Vantage", needs: ["alphaVantage"], icon: GitCompare },
  { name: "portfolio", id: "portfolio", desc: "Correlation matrix heatmap + equal-weight portfolio volatility.", source: "Alpha Vantage", needs: ["alphaVantage"], icon: PieChart },
  { name: "filings", id: "filings", desc: "Latest SEC 10-K, 10-Q, 8-K, DEF 14A filings (US tickers).", source: "SEC EDGAR submissions", needs: [], icon: FileText },
  { name: "insider", id: "insider", desc: "Recent Form 3/4/5 insider transactions.", source: "SEC EDGAR submissions", needs: [], icon: Users },
  { name: "websearch", id: "websearch", desc: "General web search for analyst opinions & macro context.", source: "Tavily Search API", needs: ["tavily"], icon: Globe },
  { name: "macro", id: "macro", desc: "Economic indicators: GDP, CPI, UNRATE, FEDFUNDS, 10y, VIX, oil.", source: "FRED (St. Louis Fed)", needs: ["fred"], icon: Activity },
  { name: "fx", id: "fx", desc: "Real-time foreign exchange rate between any two currencies.", source: "Alpha Vantage CURRENCY_EXCHANGE_RATE", needs: ["alphaVantage"], icon: ArrowLeftRight },
  { name: "profile", id: "profile", desc: "Company description, sector, industry, employees, market cap.", source: "Alpha Vantage OVERVIEW + Tavily fallback", needs: ["alphaVantage"], icon: Building2 },
  { name: "peers", id: "peers", desc: "Sector peer comparison: P/E, market cap, revenue growth, margins, beta.", source: "Alpha Vantage OVERVIEW (curated peer map)", needs: ["alphaVantage"], icon: GitCompareArrows },
  { name: "transcript", id: "transcript", desc: "Recent earnings call transcript with CEO/CFO/Q&A split.", source: "Tavily Search (web fallback)", needs: ["tavily"], icon: Mic },
  { name: "calc", id: "calc", desc: "Deterministic financial calc engine: DCF, ratios, growth, VaR, peer ranking.", source: "Local computation (no API)", needs: [], icon: Calculator },
  { name: "factcheck", id: "factcheck", desc: "Verify a factual claim against multiple web sources (Confirmed/Disputed/Unverifiable).", source: "Tavily Search + heuristic scoring", needs: ["tavily"], icon: ShieldCheck },
];

function ToolCard({ tool, status }: { tool: Tool; status: KeyStatus | null }) {
  const Icon = tool.icon;
  const ok = !status ? null : tool.needs.every((k) => status[k]);
  return (
    <div className="rounded-xl border border-border bg-card p-5 hover:border-primary/40 transition">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="size-9 rounded-lg bg-gradient-primary grid place-items-center text-primary-foreground shadow-elegant">
          <Icon className="size-4" />
        </div>
        {ok === null ? <span className="text-[10px] text-muted-foreground">checking…</span>
          : ok ? <span className="inline-flex items-center gap-1 text-[10px] text-[color:var(--bullish)]"><CheckCircle2 className="size-3" /> Ready</span>
          : <span className="inline-flex items-center gap-1 text-[10px] text-destructive"><XCircle className="size-3" /> Needs key</span>}
      </div>
      <div className="font-mono text-sm font-semibold mb-1">{tool.name}</div>
      <p className="text-xs text-muted-foreground mb-3">{tool.desc}</p>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Source</div>
      <div className="text-xs">{tool.source}</div>
      {tool.needs.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {tool.needs.map((k) => (
            <span key={k} className="text-[10px] font-mono rounded bg-accent px-1.5 py-0.5 text-accent-foreground">{k.toUpperCase()}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolsPage() {
  const [status, setStatus] = useState<KeyStatus | null>(null);
  useEffect(() => { getKeyStatus().then(setStatus).catch(() => {}); }, []);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Tool registry</h1>
          <p className="text-sm text-muted-foreground mt-1">
            The agent autonomously selects from these {TOOLS.length} tools when planning a research run.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TOOLS.map((t) => <ToolCard key={t.id} tool={t} status={status} />)}
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/tools")({
  head: () => ({
    meta: [
      { title: "FinAgent — Tools" },
      { name: "description", content: "Browse the 10 autonomous research tools available to FinAgent." },
    ],
  }),
  component: ToolsPage,
});
