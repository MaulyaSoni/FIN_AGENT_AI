import { useEffect, useRef, useState } from "react";
import { Send, Lightbulb, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useSession } from "@/context/SessionContext";
import { runAgent, isPaused } from "@/lib/agent";
import { extractTickers, resolveReferences } from "@/lib/tickers";
import { MessageItem } from "./MessageItem";
import { getKeyStatus } from "@/lib/agent.functions";
import type { ChatMessage } from "@/lib/types";

const EXAMPLES = [
  "Analyze AAPL stock performance",
  "Compare RELIANCE.NS and TCS.NS",
  "What is the risk profile of TSLA?",
  "Pull MSFT recent 10-K filings and summarize",
  "Build a portfolio with INFY, WIPRO, HCLTECH",
  "GOOGL — fundamentals, news sentiment, insider trades",
  "Show US CPI and 10y yield, comment on rates",
  "USD vs INR exchange rate today",
];

type KeyStatus = { groq: boolean; alphaVantage: boolean; newsapi: boolean; tavily: boolean; fred: boolean; lovableAI: boolean };

export function ChatView() {
  const { current, reports, appendMessage, updateMessage, addReport, renameSessionFromQuery } = useSession();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(true);
  const [keys, setKeys] = useState<KeyStatus | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getKeyStatus().then(setKeys).catch(() => setKeys({ groq: false, alphaVantage: false, newsapi: false, tavily: false, fred: false, lovableAI: false }));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [current.messages.length, busy]);

  const missingCore = keys && (!keys.groq || !keys.alphaVantage || !keys.newsapi);

  const runFull = async (params: {
    asstId: string;
    query: string;
    resolvedQuery: string;
    assumptions?: string[];
    skipDisambiguation?: boolean;
    historyOverride?: ChatMessage[];
  }) => {
    const result = await runAgent({
      query: params.resolvedQuery,
      history: params.historyOverride ?? current.messages,
      reports,
      update: (mut) => updateMessage(params.asstId, mut),
      sessionId: current.id,
      assumptions: params.assumptions,
      skipDisambiguation: params.skipDisambiguation,
    });
    if (isPaused(result)) return; // wait for user
    if (result.synthesis && result.steps.length > 0) {
      const reportId = crypto.randomUUID();
      addReport({
        id: reportId, sessionId: current.id, title: params.query.slice(0, 80),
        query: params.query, tickers: result.tickers, markdown: result.reportMarkdown,
        createdAt: Date.now(), embedding: result.embedding ?? undefined,
      });
      updateMessage(params.asstId, (m) => { m.reportId = reportId; });
      toast.success("Report ready", { description: "View it in the Reports tab." });
    }
  };

  const submit = async (q: string) => {
    const text = q.trim();
    if (!text || busy) return;
    if (keys && !keys.groq) { toast.error("GROQ_API_KEY missing — open Settings."); return; }
    setBusy(true); setInput("");
    renameSessionFromQuery(text);

    const userMsg = { id: crypto.randomUUID(), role: "user" as const, content: text, createdAt: Date.now() };
    appendMessage(userMsg);

    const asstId = crypto.randomUUID();
    appendMessage({ id: asstId, role: "assistant", content: "", createdAt: Date.now(), pending: true });

    const priorTickers = current.messages.flatMap((m) => extractTickers(m.content)).filter((v, i, arr) => arr.indexOf(v) === i);
    const refs = resolveReferences(text, priorTickers);
    const resolvedQuery = refs.length > 0 ? `${text} (resolving prior references: ${refs.join(", ")})` : text;

    try {
      await runFull({ asstId, query: text, resolvedQuery, historyOverride: [...current.messages, userMsg] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      updateMessage(asstId, (m) => { m.synthesis = `Error: ${msg}`; m.pending = false; });
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleProceed = async (asstId: string, originalQuery: string, interpretation: string, assumptions: string[]) => {
    if (busy) return;
    setBusy(true);
    updateMessage(asstId, (m) => { m.disambiguation = undefined; m.pending = true; });
    try {
      await runFull({ asstId, query: originalQuery, resolvedQuery: `${originalQuery} — proceeding with: ${interpretation}`, assumptions, skipDisambiguation: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      updateMessage(asstId, (m) => { m.synthesis = `Error: ${msg}`; m.pending = false; });
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleClarify = (asstId: string, clarified: string) => {
    updateMessage(asstId, (m) => { m.disambiguation = undefined; m.synthesis = "Clarified — re-running with the updated query."; m.pending = false; });
    submit(clarified);
  };

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {missingCore && (
        <div className="mx-3 mt-3 rounded-md border border-warning/40 bg-[color:var(--warning)]/10 text-sm px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="size-4 mt-0.5 text-[color:var(--warning)]" />
          <div className="flex-1">
            Some API keys are missing:&nbsp;
            <span className="font-mono text-xs">
              {!keys?.groq && "GROQ_API_KEY "} {!keys?.alphaVantage && "ALPHA_VANTAGE_API_KEY "} {!keys?.newsapi && "NEWSAPI_KEY"}
            </span>.{" "}
            <Link to="/settings" className="text-primary underline">Open Settings</Link>
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 sm:px-6 py-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {current.messages.length === 0 && (
            <div className="text-center text-muted-foreground py-12">
              <div className="font-semibold text-foreground mb-1">ARA-1</div>
              <p className="text-sm">Autonomous financial research with ReAct planning, episodic memory, retries, fallbacks, and source-tier conflict resolution.</p>
            </div>
          )}
          {current.messages.map((m) => (
            <MessageItem key={m.id} m={m}
              onProceed={(interp, ass) => {
                // Find the most recent user message preceding this assistant turn
                const idx = current.messages.findIndex((x) => x.id === m.id);
                const userPrev = [...current.messages.slice(0, idx)].reverse().find((x) => x.role === "user");
                handleProceed(m.id, userPrev?.content ?? "", interp, ass);
              }}
              onClarify={(text) => handleClarify(m.id, text)}
            />
          ))}
        </div>
      </div>

      <div className="border-t border-border bg-card/40 px-3 sm:px-6 py-3">
        <div className="mx-auto max-w-3xl space-y-2">
          <button type="button" onClick={() => setExamplesOpen((v) => !v)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            {examplesOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            <Lightbulb className="size-3" /> Examples
          </button>
          {examplesOpen && (
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((e) => (
                <button key={e} onClick={() => setInput(e)} disabled={busy}
                  title="Click to insert — edit and press Analyze"
                  className="text-xs px-2.5 py-1 rounded-full border border-border bg-background hover:bg-accent hover:border-primary/40 transition disabled:opacity-50">
                  {e}
                </button>
              ))}
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); submit(input); }}
            className="flex items-end gap-2 rounded-lg border border-border bg-background focus-within:border-primary/50 transition">
            <textarea value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(input); } }}
              placeholder="Ask ARA-1 — e.g. Analyze AAPL with SEC filings and recent news"
              rows={2} className="flex-1 resize-none bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
              disabled={busy} />
            <button type="submit" disabled={busy || !input.trim()}
              className="m-1.5 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition">
              <Send className="size-4" /> Analyze
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
