import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, Filter, MessageSquare, Trash2 } from "lucide-react";
import { getAllTraces, loadAnnotations, saveAnnotation, clearTraces, type StoredTrace, type StoredAnnotation } from "@/lib/traces";

function TraceRow({
  t, annotation, selected, onSelect, onAnnotate,
}: {
  t: StoredTrace; annotation?: StoredAnnotation; selected: boolean;
  onSelect: () => void; onAnnotate: (field: "well" | "improve", v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`border rounded-lg overflow-hidden ${selected ? "border-primary/60 bg-primary/5" : "border-border bg-card/40"}`}>
      <div className="flex items-center gap-3 p-3">
        <input type="checkbox" checked={selected} onChange={onSelect} className="rounded" />
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex-1 flex items-center gap-3 text-left">
          <span className={`size-2 rounded-full shrink-0 ${t.success ? "bg-[color:var(--bullish)]" : "bg-destructive"}`} />
          <span className="font-mono text-xs font-medium">{t.ticker || "—"}</span>
          <span className="text-[11px] text-muted-foreground font-mono">{t.tool}</span>
          {t.fallbackUsed && <span className="text-[10px] uppercase tracking-wider rounded bg-[color:var(--warning)]/15 text-[color:var(--warning)] px-1.5 py-0.5">fallback</span>}
          <span className="text-[10px] text-muted-foreground font-mono">{(t.durationMs / 1000).toFixed(1)}s</span>
          <span className="text-[10px] text-muted-foreground ml-auto">{new Date(t.timestamp).toLocaleString()}</span>
          {open ? <ChevronDown className="size-3 text-muted-foreground" /> : <ChevronRight className="size-3 text-muted-foreground" />}
        </button>
      </div>
      {open && (
        <div className="px-3 pb-3 pt-2 border-t border-border space-y-2 text-xs">
          <div><span className="text-muted-foreground uppercase tracking-wider text-[10px] mr-2">Thought</span>{t.thought || "—"}</div>
          <div><span className="text-muted-foreground uppercase tracking-wider text-[10px] mr-2">Action</span><span className="font-mono">{t.action}</span></div>
          <div><span className="text-muted-foreground uppercase tracking-wider text-[10px] mr-2">Observation</span>{t.observation}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">What went well</label>
              <textarea value={annotation?.well ?? ""} onChange={(e) => onAnnotate("well", e.target.value)}
                className="w-full h-16 rounded border border-border bg-background px-2 py-1 text-xs resize-none outline-none focus:border-primary/50" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">What to improve</label>
              <textarea value={annotation?.improve ?? ""} onChange={(e) => onAnnotate("improve", e.target.value)}
                className="w-full h-16 rounded border border-border bg-background px-2 py-1 text-xs resize-none outline-none focus:border-primary/50" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TracesPage() {
  const [traces, setTraces] = useState<StoredTrace[]>([]);
  const [annotations, setAnnotations] = useState<Record<string, StoredAnnotation>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ticker, setTicker] = useState("");
  const [tool, setTool] = useState("");
  const [outcome, setOutcome] = useState<"all" | "ok" | "fail">("all");

  useEffect(() => { setTraces(getAllTraces()); setAnnotations(loadAnnotations()); }, []);

  const filtered = useMemo(() => traces.filter((t) => {
    if (ticker && !(t.ticker || "").toUpperCase().includes(ticker.toUpperCase())) return false;
    if (tool && !t.tool.toLowerCase().includes(tool.toLowerCase())) return false;
    if (outcome === "ok" && !t.success) return false;
    if (outcome === "fail" && t.success) return false;
    return true;
  }), [traces, ticker, tool, outcome]);

  const annotate = (stepId: string, field: "well" | "improve", v: string) => {
    saveAnnotation(stepId, field, v);
    setAnnotations((prev) => ({ ...prev, [stepId]: { ...(prev[stepId] ?? { well: "", improve: "", updatedAt: 0 }), [field]: v, updatedAt: Date.now() } }));
  };

  const exportSelected = () => {
    const chosen = traces.filter((t) => selected.has(t.stepId));
    const md = chosen.map((t) => {
      const a = annotations[t.stepId];
      return `## ${t.ticker || "—"} · ${t.tool} · ${new Date(t.timestamp).toLocaleString()}\n\n` +
        `**Thought:** ${t.thought || "—"}\n\n` +
        `**Action:** \`${t.action}\`\n\n` +
        `**Observation:** ${t.observation}\n\n` +
        `**Outcome:** ${t.success ? "✅ Success" : "❌ Failed"}${t.fallbackUsed ? " (fallback used)" : ""}\n\n` +
        `**What went well:** ${a?.well || "—"}\n\n` +
        `**What to improve:** ${a?.improve || "—"}\n\n---\n`;
    }).join("\n");
    const blob = new Blob([`# ARA-1 Trace Gallery (${chosen.length} entries)\n\n${md}`], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `ara1_traces_${Date.now()}.md`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Trace gallery</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Every ReAct step from every research run. Annotate what worked and what to improve, then export as Markdown for the eval review.
            </p>
          </div>
          <div className="flex gap-2">
            <button disabled={selected.size === 0} onClick={exportSelected}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
              <Download className="size-3.5" /> Export {selected.size > 0 ? `(${selected.size})` : ""}
            </button>
            <button onClick={() => { if (confirm("Clear all stored traces?")) { clearTraces(); setTraces([]); setSelected(new Set()); } }}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-accent">
              <Trash2 className="size-3.5" /> Clear
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-2">
          <Filter className="size-4 text-muted-foreground" />
          <input value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="Filter ticker"
            className="rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary/50" />
          <input value={tool} onChange={(e) => setTool(e.target.value)} placeholder="Filter tool"
            className="rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary/50" />
          <select value={outcome} onChange={(e) => setOutcome(e.target.value as "all" | "ok" | "fail")}
            className="rounded border border-border bg-background px-2 py-1 text-xs">
            <option value="all">All outcomes</option>
            <option value="ok">Success only</option>
            <option value="fail">Failures only</option>
          </select>
          <span className="text-xs text-muted-foreground ml-auto">{filtered.length} trace{filtered.length === 1 ? "" : "s"} · {selected.size} selected</span>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card/40 p-10 text-center text-sm text-muted-foreground">
            No traces yet. Run a research query from <Link to="/chat" className="text-primary underline inline-flex items-center gap-1"><MessageSquare className="size-3" />Chat</Link> and they will appear here.
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((t) => (
              <TraceRow key={t.stepId} t={t} annotation={annotations[t.stepId]}
                selected={selected.has(t.stepId)}
                onSelect={() => setSelected((prev) => { const n = new Set(prev); if (n.has(t.stepId)) n.delete(t.stepId); else n.add(t.stepId); return n; })}
                onAnnotate={(field, v) => annotate(t.stepId, field, v)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/traces")({
  head: () => ({
    meta: [
      { title: "ARA-1 — Traces" },
      { name: "description", content: "ReAct trace gallery with annotations and Markdown export." },
    ],
  }),
  component: TracesPage,
});
