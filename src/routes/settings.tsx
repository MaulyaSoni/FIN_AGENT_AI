import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { getKeyStatus } from "@/lib/agent.functions";

type Status = { groq: boolean; alphaVantage: boolean; newsapi: boolean; tavily: boolean; fred: boolean; lovableAI: boolean };

function StatusRow({ label, ok, name, helpUrl, optional }: { label: string; ok: boolean; name: string; helpUrl: string; optional?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-4">
      <div>
        <div className="font-semibold">{label} {optional && <span className="text-xs font-normal text-muted-foreground">(optional)</span>}</div>
        <div className="text-xs text-muted-foreground font-mono">{name}</div>
        <a href={helpUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline mt-1 inline-block">Get a key →</a>
      </div>
      <div className="shrink-0">
        {ok ? (
          <span className="inline-flex items-center gap-1.5 text-[color:var(--bullish)] text-sm"><CheckCircle2 className="size-4" /> Configured</span>
        ) : (
          <span className={`inline-flex items-center gap-1.5 ${optional ? "text-muted-foreground" : "text-destructive"} text-sm`}><XCircle className="size-4" /> {optional ? "Not set" : "Missing"}</span>
        )}
      </div>
    </div>
  );
}

function SettingsPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = async () => {
    setLoading(true);
    try { setStatus(await getKeyStatus()); } finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            API keys are stored as secure server-side environment variables, never sent to the browser.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <h2 className="text-sm uppercase tracking-wider text-muted-foreground">API key status</h2>
          <button onClick={refresh} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground" disabled={loading}>
            <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        <div className="space-y-3">
          <StatusRow label="Groq (LLM)" name="GROQ_API_KEY" ok={!!status?.groq} helpUrl="https://console.groq.com/keys" />
          <StatusRow label="Alpha Vantage (market data)" name="ALPHA_VANTAGE_API_KEY" ok={!!status?.alphaVantage} helpUrl="https://www.alphavantage.co/support/#api-key" />
          <StatusRow label="NewsAPI (headlines)" name="NEWSAPI_KEY" ok={!!status?.newsapi} helpUrl="https://newsapi.org/register" />
          <StatusRow label="Tavily (web search)" name="TAVILY_API_KEY" ok={!!status?.tavily} helpUrl="https://tavily.com" optional />
          <StatusRow label="FRED (macro indicators)" name="FRED_API_KEY" ok={!!status?.fred} helpUrl="https://fred.stlouisfed.org/docs/api/api_key.html" optional />
          <StatusRow label="Lovable AI (embeddings)" name="LOVABLE_API_KEY" ok={!!status?.lovableAI} helpUrl="#" optional />
        </div>

        <div className="rounded-lg border border-border bg-card/50 p-4 text-sm text-muted-foreground space-y-2">
          <div className="font-semibold text-foreground">Notes</div>
          <ul className="list-disc pl-5 space-y-1">
            <li>LLM: <code className="font-mono text-xs">llama-3.3-70b-versatile</code> via Groq.</li>
            <li>SEC EDGAR (filings + insider) is free and requires no key.</li>
            <li>Long-term semantic memory uses Lovable AI embeddings with a 384-d <code className="font-mono text-xs">text-embedding-3-small</code> vector, cached in localStorage.</li>
            <li>Alpha Vantage free tier may return sparse fundamentals for non-US tickers (e.g. <code className="font-mono">.NS</code>).</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "FinAgent — Settings" },
      { name: "description", content: "Configure FinAgent API keys and inspect provider status." },
    ],
  }),
  component: SettingsPage,
});
