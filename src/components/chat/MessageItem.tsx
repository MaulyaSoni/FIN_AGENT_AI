import { Loader2, User, Bot, FileText, Brain } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { ChatMessage, StepResult } from "@/lib/types";
import { PlanBlock } from "./PlanBlock";
import { DisambiguationCard } from "./DisambiguationCard";
import {
  CompareGrid, NewsCard, PortfolioCard, PriceChart, QuoteCard, RiskCard, StepSkeleton,
  FilingsCard, InsiderCard, WebSearchCard, MacroCard, FxCard,
  ProfileCard, PeersCard, TranscriptCard, FactCheckCard, CalculationCard, ErrorCard,
} from "@/components/data/Cards";

function StepView({ s }: { s: StepResult }) {
  if (s.kind === "quote") return <QuoteCard ticker={s.ticker} data={s.data} error={s.error} />;
  if (s.kind === "history")
    return (
      <div className="space-y-3">
        <PriceChart ticker={s.ticker} data={s.data} error={s.error} />
        {s.data && <RiskCard ticker={s.ticker} data={s.data} />}
      </div>
    );
  if (s.kind === "news") return <NewsCard ticker={s.ticker} articles={s.articles} sentiments={s.sentiments} error={s.error} />;
  if (s.kind === "compare") return <CompareGrid quotes={s.quotes} />;
  if (s.kind === "portfolio") return <PortfolioCard step={s} />;
  if (s.kind === "filings") return <FilingsCard ticker={s.ticker} company={s.company} filings={s.filings} error={s.error} />;
  if (s.kind === "insider") return <InsiderCard ticker={s.ticker} trades={s.trades} error={s.error} />;
  if (s.kind === "websearch") return <WebSearchCard query={s.query} answer={s.answer} results={s.results} error={s.error} />;
  if (s.kind === "macro") return <MacroCard indicator={s.indicator} latest={s.latest} series={s.series} yoyChange={s.yoyChange} error={s.error} />;
  if (s.kind === "fx") return <FxCard from={s.from} to={s.to} rate={s.rate} updatedAt={s.updatedAt} error={s.error} />;
  if (s.kind === "profile") return <ProfileCard ticker={s.ticker} data={s.data} error={s.error} />;
  if (s.kind === "peers") return <PeersCard ticker={s.ticker} peers={s.peers} error={s.error} />;
  if (s.kind === "transcript") return <TranscriptCard ticker={s.ticker} data={s.data} error={s.error} />;
  if (s.kind === "factcheck") return <FactCheckCard data={s.data} error={s.error} />;
  if (s.kind === "calc") return <CalculationCard data={s.data} error={s.error} />;
  return null;
}

export function MessageItem({
  m, onProceed, onClarify,
}: {
  m: ChatMessage;
  onProceed?: (interpretation: string, assumptions: string[]) => void;
  onClarify?: (clarified: string) => void;
}) {
  if (m.role === "user") {
    return (
      <div className="flex gap-3 justify-end">
        <div className="max-w-[85%] rounded-lg bg-primary/15 border border-primary/30 px-3 py-2 text-sm">{m.content}</div>
        <div className="size-7 shrink-0 rounded-full bg-primary/30 grid place-items-center text-primary"><User className="size-4" /></div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <div className="size-7 shrink-0 rounded-full bg-card border border-border grid place-items-center text-primary"><Bot className="size-4" /></div>
      <div className="flex-1 min-w-0 space-y-3">
        {m.memoryHits && m.memoryHits.length > 0 && (
          <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-[11px] text-muted-foreground inline-flex items-center gap-2">
            <Brain className="size-3 text-primary" />
            <span>Memory recall — {m.memoryHits.map((h) => `${h.title} (${(h.score * 100).toFixed(0)}%)`).join(", ")}</span>
          </div>
        )}
        {m.disambiguation && onProceed && onClarify && (
          <DisambiguationCard info={m.disambiguation} onProceed={onProceed} onClarify={onClarify} />
        )}
        <PlanBlock plan={m.plan} pending={m.pending && !m.plan} traces={m.traces} />
        {m.steps && m.steps.length > 0 && (
          <div className="space-y-3">
            {m.steps.map((s, i) => <StepView key={i} s={s} />)}
          </div>
        )}
        {m.pending && m.plan && (!m.steps || m.steps.length < m.plan.steps.length) && <StepSkeleton />}
        {m.discrepancies && m.discrepancies.length > 0 && (
          <ErrorCard title="Data discrepancies (resolved by source-tier priority)" msg={m.discrepancies.join("\n")} />
        )}
        {m.synthesis && (
          <div className="rounded-lg border border-border bg-card/50 p-4 text-sm leading-relaxed whitespace-pre-wrap">{m.synthesis}</div>
        )}
        {m.pending && !m.plan && !m.disambiguation && (
          <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> Planning…
          </div>
        )}
        {m.reportId && (
          <Link to="/reports" className="inline-flex items-center gap-2 text-xs text-primary hover:underline">
            <FileText className="size-3" /> Report ready · view
          </Link>
        )}
      </div>
    </div>
  );
}
