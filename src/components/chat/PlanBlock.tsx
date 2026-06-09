import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2, CheckCircle2, XCircle, Brain, Zap, Eye, Database, History as HistoryIcon } from "lucide-react";
import type { AgentPlan, ReActTrace } from "@/lib/types";

function ReActRow({ label, content, icon: Icon, mono = false }: { label: string; content: string; icon: typeof Brain; mono?: boolean }) {
  if (!content) return null;
  return (
    <div className="flex gap-2 text-xs">
      <div className="flex items-center gap-1 shrink-0 text-muted-foreground min-w-[88px]">
        <Icon className="size-3" />
        <span className="uppercase tracking-wider text-[10px]">{label}</span>
      </div>
      <div className={`flex-1 min-w-0 ${mono ? "font-mono text-[11px]" : ""} text-foreground/90 whitespace-pre-wrap`}>{content}</div>
    </div>
  );
}

function StepRow({ step, trace, index }: { step: AgentPlan["steps"][number]; trace?: ReActTrace; index: number }) {
  const [open, setOpen] = useState(false);
  const status: "pending" | "running" | "ok" | "fail" =
    !trace ? "pending" : trace.success ? "ok" : "fail";
  const StatusIcon = status === "ok" ? CheckCircle2 : status === "fail" ? XCircle : Loader2;
  const statusColor = status === "ok" ? "text-[color:var(--bullish)]" : status === "fail" ? "text-destructive" : "text-muted-foreground";

  return (
    <li className="border border-border rounded-md overflow-hidden bg-card/40">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/40 transition">
        <span className="inline-flex size-5 items-center justify-center rounded bg-primary/20 text-[11px] font-mono text-primary">{index + 1}</span>
        <StatusIcon className={`size-3.5 ${statusColor} ${status === "pending" ? "animate-spin opacity-40" : ""}`} />
        <span className="text-sm font-medium truncate flex-1">{step.label}</span>
        <span className="font-mono text-[10px] text-muted-foreground">{step.tool}</span>
        {trace?.durationMs ? <span className="font-mono text-[10px] text-muted-foreground">{(trace.durationMs / 1000).toFixed(1)}s</span> : null}
        {open ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border bg-background/40">
          <ReActRow label="Thought" content={step.thought ?? ""} icon={Brain} />
          <ReActRow label="Action" content={trace?.action ?? `${step.tool}(${step.tickers.join(", ")})`} icon={Zap} mono />
          <ReActRow label="Expected" content={step.expectedObservation ?? ""} icon={Eye} />
          <ReActRow label="Observed" content={trace?.observation ?? (status === "pending" ? "Waiting…" : "")} icon={Database} />
        </div>
      )}
    </li>
  );
}

export function PlanBlock({ plan, pending, traces }: { plan?: AgentPlan; pending?: boolean; traces?: ReActTrace[] }) {
  const [open, setOpen] = useState(true);
  if (!plan && !pending) return null;
  return (
    <div className="rounded-md border border-border bg-card/60 text-sm">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-muted-foreground hover:text-foreground">
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        <HistoryIcon className="size-3.5" />
        {pending && !plan ? (
          <span className="inline-flex items-center gap-2"><Loader2 className="size-3 animate-spin" /> Thinking…</span>
        ) : (
          <span>ReAct plan ({plan?.steps.length ?? 0} steps)</span>
        )}
      </button>
      {open && plan && (
        <div className="px-3 pb-3 space-y-2">
          {plan.rationale && <p className="text-xs text-muted-foreground italic">{plan.rationale}</p>}
          <ol className="space-y-1.5">
            {plan.steps.map((s, i) => (
              <StepRow key={i} step={s} trace={traces?.[i]} index={i} />
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
