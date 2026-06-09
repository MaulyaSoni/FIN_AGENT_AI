import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles, FileText, Wrench, LayoutDashboard, ClipboardCheck, ShieldCheck, Database, Globe, Activity, Users, BarChart3, Brain } from "lucide-react";

function Feature({ icon: Icon, title, desc }: { icon: typeof Sparkles; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 backdrop-blur p-5 hover:border-primary/40 transition">
      <div className="size-9 rounded-lg bg-gradient-primary grid place-items-center text-primary-foreground shadow-elegant mb-3">
        <Icon className="size-4" />
      </div>
      <div className="font-semibold mb-1">{title}</div>
      <p className="text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function Landing() {
  return (
    <div className="flex-1 overflow-y-auto">
      {/* Hero */}
      <section className="relative px-6 sm:px-10 pt-16 pb-20">
        <div className="max-w-5xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary mb-6">
            <Sparkles className="size-3" /> Autonomous research · Plan → Execute → Synthesize
          </div>
          <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight">
            Your AI <span className="text-gradient">junior analyst</span>,
            <br className="hidden sm:block" /> running on autopilot.
          </h1>
          <p className="mt-5 max-w-2xl text-base sm:text-lg text-muted-foreground">
            FinAgent receives a research query, formulates a plan, gathers data from market APIs, SEC EDGAR,
            news feeds, web search, and macro indicators — then synthesizes a structured analyst report.
            No step-by-step babysitting.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/chat" className="inline-flex items-center gap-2 rounded-lg bg-gradient-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-elegant hover:opacity-90 transition">
              Start a research session <ArrowRight className="size-4" />
            </Link>
            <Link to="/dashboard" className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-2.5 text-sm hover:bg-accent transition">
              Open dashboard
            </Link>
            <Link to="/evals" className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-2.5 text-sm hover:bg-accent transition">
              Run evaluation suite
            </Link>
          </div>

          {/* Stat strip */}
          <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { k: "10", v: "Research tools" },
              { k: "3-tier", v: "Memory system" },
              { k: "20+", v: "Eval metrics" },
              { k: "8", v: "Challenge tests" },
            ].map((s) => (
              <div key={s.v} className="rounded-lg border border-border bg-card/50 p-4 text-center">
                <div className="text-2xl font-semibold text-gradient">{s.k}</div>
                <div className="text-xs text-muted-foreground mt-1">{s.v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 sm:px-10 py-16 border-t border-border bg-card/30">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-semibold mb-2">What FinAgent can pull</h2>
          <p className="text-sm text-muted-foreground mb-8">Ten autonomous research tools across market data, filings, news, and macro.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Feature icon={BarChart3} title="Market data" desc="Real-time quotes, fundamentals, 90-day price series via Alpha Vantage." />
            <Feature icon={ShieldCheck} title="Risk metrics" desc="Annualized volatility, max drawdown, 1-day 95% VaR computed server-side." />
            <Feature icon={FileText} title="SEC EDGAR filings" desc="10-K, 10-Q, 8-K, and DEF 14A filings pulled directly from EDGAR." />
            <Feature icon={Users} title="Insider activity" desc="Form 3/4/5 transactions to gauge insider sentiment." />
            <Feature icon={Globe} title="Web search" desc="Tavily-powered web search with cited sources." />
            <Feature icon={Activity} title="Macro indicators" desc="GDP, CPI, UNRATE, fed funds, 10y, VIX, oil from FRED." />
            <Feature icon={Database} title="News + sentiment" desc="NewsAPI headlines classified Bullish/Neutral/Bearish via Groq." />
            <Feature icon={Brain} title="Vector memory" desc="Past reports embedded and recalled semantically on every query." />
            <Feature icon={ClipboardCheck} title="Eval harness" desc="8 progressive challenges scored across 20+ quality metrics." />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 sm:px-10 py-16 border-t border-border">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-semibold mb-8">How the agent thinks</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { n: "01", t: "Plan", d: "LLM analyzes the query, recalls relevant past research, and emits an ordered tool plan." },
              { n: "02", t: "Execute", d: "Each tool runs in sequence; results stream back as live cards with charts." },
              { n: "03", t: "Synthesize", d: "Findings are merged into a 7-section analyst report with disclaimer." },
            ].map((s) => (
              <div key={s.n} className="rounded-xl border border-border bg-card p-6">
                <div className="text-xs font-mono text-muted-foreground mb-2">{s.n}</div>
                <div className="font-semibold mb-1">{s.t}</div>
                <p className="text-sm text-muted-foreground">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 sm:px-10 py-20 border-t border-border bg-gradient-primary/5">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-semibold mb-3">Ready to dispatch the agent?</h2>
          <p className="text-muted-foreground mb-6">Ask anything — a ticker, a portfolio, a macro thesis. The agent handles the rest.</p>
          <Link to="/chat" className="inline-flex items-center gap-2 rounded-lg bg-gradient-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-elegant hover:opacity-90 transition">
            Open chat <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <footer className="px-6 py-8 border-t border-border text-center text-xs text-muted-foreground">
        FinAgent · Educational research tool · Not investment advice.
      </footer>
    </div>
  );
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FinAgent — Autonomous Financial Research Agent" },
      { name: "description", content: "AI junior analyst that plans, gathers, and synthesizes financial research autonomously." },
      { property: "og:title", content: "FinAgent — Autonomous Financial Research" },
      { property: "og:description", content: "Plan-and-Execute LLM agent with 10 tools, vector memory, and an eval harness." },
    ],
  }),
  component: Landing,
});
