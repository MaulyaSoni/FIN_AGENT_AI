import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Trash2, TrendingUp, TrendingDown, FileText } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { getQuote } from "@/lib/agent.functions";
import { fmtNum } from "@/lib/report";
import type { QuoteData } from "@/lib/types";

const WATCH_KEY = "finagent:watchlist:v1";

function useWatchlist() {
  const [list, setList] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(WATCH_KEY);
      setList(raw ? JSON.parse(raw) : ["AAPL", "MSFT", "GOOGL", "NVDA", "TSLA"]);
    } catch { setList(["AAPL", "MSFT", "GOOGL"]); }
  }, []);
  useEffect(() => { localStorage.setItem(WATCH_KEY, JSON.stringify(list)); }, [list]);
  return {
    list,
    add: (t: string) => setList((p) => p.includes(t) ? p : [...p, t.toUpperCase()]),
    remove: (t: string) => setList((p) => p.filter((x) => x !== t)),
  };
}

function WatchRow({ ticker, onRemove }: { ticker: string; onRemove: () => void }) {
  const [q, setQ] = useState<QuoteData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let cancel = false;
    getQuote({ data: { ticker } })
      .then((r) => { if (cancel) return; if (r.error) setErr(r.error); else setQ(r.data!); })
      .catch((e) => !cancel && setErr(String(e)));
    return () => { cancel = true; };
  }, [ticker]);
  const cp = parseFloat(q?.changePercent ?? "");
  const up = Number.isFinite(cp) && cp >= 0;
  return (
    <div className="flex items-center gap-3 border border-border rounded-lg bg-card px-3 py-2.5">
      <div className="font-mono text-sm font-semibold w-20">{ticker}</div>
      <div className="flex-1 text-xs text-muted-foreground truncate">{q?.name ?? (err ? "—" : "loading…")}</div>
      <div className="font-mono text-sm w-24 text-right">{q ? fmtNum(q.price) : "—"}</div>
      <div className={`font-mono text-xs w-20 text-right inline-flex items-center justify-end gap-1 ${up ? "num-pos" : "num-neg"}`}>
        {q?.changePercent ? (<>{up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}{q.changePercent}%</>) : "—"}
      </div>
      <button onClick={onRemove} className="text-muted-foreground hover:text-destructive p-1" aria-label="remove"><Trash2 className="size-3.5" /></button>
    </div>
  );
}

function Dashboard() {
  const { list, add, remove } = useWatchlist();
  const { reports } = useSession();
  const [input, setInput] = useState("");

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-5xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Live watchlist quotes and your recent research reports.</p>
        </div>

        {/* Watchlist */}
        <div className="rounded-xl border border-border bg-card/60 backdrop-blur p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Watchlist</h2>
            <form onSubmit={(e) => { e.preventDefault(); if (input.trim()) { add(input.trim()); setInput(""); } }}
              className="flex items-center gap-2">
              <input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} placeholder="Add ticker"
                className="w-32 rounded-md border border-border bg-background px-2 py-1.5 text-xs font-mono outline-none focus:border-primary/50" />
              <button className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs text-primary-foreground hover:bg-primary/90">
                <Plus className="size-3" /> Add
              </button>
            </form>
          </div>
          <div className="space-y-1.5">
            {list.length === 0 && <div className="text-sm text-muted-foreground text-center py-6">Watchlist is empty.</div>}
            {list.map((t) => <WatchRow key={t} ticker={t} onRemove={() => remove(t)} />)}
          </div>
        </div>

        {/* Recent reports */}
        <div className="rounded-xl border border-border bg-card/60 backdrop-blur p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Recent reports</h2>
            <Link to="/reports" className="text-xs text-primary hover:underline">View all →</Link>
          </div>
          {reports.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              No reports yet. <Link to="/chat" className="text-primary hover:underline">Start a research session</Link>.
            </div>
          ) : (
            <div className="space-y-2">
              {reports.slice(0, 5).map((r) => (
                <Link key={r.id} to="/reports" className="flex items-start gap-3 rounded-lg border border-border bg-background px-3 py-2.5 hover:border-primary/40 transition">
                  <FileText className="size-4 mt-0.5 text-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{r.title}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {new Date(r.createdAt).toLocaleString()} · {r.tickers.join(", ") || "—"}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "FinAgent — Dashboard" },
      { name: "description", content: "Watchlist and recent FinAgent research reports." },
    ],
  }),
  component: Dashboard,
});
