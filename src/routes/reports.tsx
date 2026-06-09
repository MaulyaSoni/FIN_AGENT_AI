import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download, ChevronDown, ChevronRight, FileText } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { downloadReport } from "@/lib/report";

function ReportsPage() {
  const { reports } = useSession();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Auto-generated after every analysis. Stored locally per browser; download as plain text.
          </p>
        </div>

        {reports.length === 0 && (
          <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
            <FileText className="size-8 mx-auto mb-2 opacity-60" />
            <div className="text-sm">No reports yet — run an analysis from the chat to generate one.</div>
          </div>
        )}

        <div className="space-y-3">
          {reports.map((r) => {
            const isOpen = !!open[r.id];
            return (
              <div key={r.id} className="rounded-lg border border-border bg-card">
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <button
                    onClick={() => setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))}
                    className="flex items-start gap-2 text-left flex-1 min-w-0"
                  >
                    {isOpen ? <ChevronDown className="size-4 mt-0.5" /> : <ChevronRight className="size-4 mt-0.5" />}
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{r.title}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {new Date(r.createdAt).toLocaleString()} · {r.tickers.join(", ") || "—"}
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => downloadReport(r)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-accent"
                  >
                    <Download className="size-3.5" /> .txt
                  </button>
                </div>
                {isOpen && (
                  <pre className="px-4 pb-4 text-xs whitespace-pre-wrap font-mono text-muted-foreground border-t border-border pt-3">
                    {r.markdown}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "FinAgent — Reports" },
      { name: "description", content: "View and download FinAgent research reports." },
    ],
  }),
  component: ReportsPage,
});
