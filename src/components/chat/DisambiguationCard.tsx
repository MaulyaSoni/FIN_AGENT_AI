import { useState } from "react";
import { AlertTriangle, Send } from "lucide-react";
import type { DisambiguationInfo } from "@/lib/types";

export function DisambiguationCard({
  info, onProceed, onClarify,
}: {
  info: DisambiguationInfo;
  onProceed: (interpretation: string, assumptions: string[]) => void;
  onClarify: (clarified: string) => void;
}) {
  const [clarify, setClarify] = useState("");
  const [showInput, setShowInput] = useState(false);
  return (
    <div className="rounded-lg border border-[color:var(--warning)]/40 bg-[color:var(--warning)]/10 p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="size-4 text-[color:var(--warning)]" />
        <span className="text-sm font-medium text-[color:var(--warning)]">Ambiguous query detected — {info.type.replace(/_/g, " ")}</span>
      </div>
      <p className="text-sm mb-3">
        Interpreting as: <strong>{info.interpretation}</strong>
      </p>
      {info.assumptions.length > 0 && (
        <div className="mb-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Assumptions</div>
          <ul className="space-y-1">
            {info.assumptions.map((a, i) => (
              <li key={i} className="text-xs flex items-start gap-2"><span className="text-[color:var(--warning)]">•</span><span>{a}</span></li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onProceed(info.interpretation, info.assumptions)}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition">
          Proceed with this interpretation
        </button>
        <button type="button" onClick={() => setShowInput((v) => !v)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-accent transition">
          Let me clarify
        </button>
      </div>
      {showInput && (
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (clarify.trim()) onClarify(clarify.trim()); }}>
          <input value={clarify} onChange={(e) => setClarify(e.target.value)}
            placeholder="Type your clarified query…"
            className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary/50" />
          <button type="submit" disabled={!clarify.trim()}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50">
            <Send className="size-3" /> Send
          </button>
        </form>
      )}
    </div>
  );
}
