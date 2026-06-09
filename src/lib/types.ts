// Shared types for chat + agent results.
export type Role = "user" | "assistant";

export type QuoteData = {
  ticker: string; name: string; exchange: string; sector: string;
  price: number | null; change: number | null; changePercent: string | null;
  previousClose: number | null; high: number | null; low: number | null;
  marketCap: number | null; peRatio: number | null; eps: number | null;
  weekHigh52: number | null; weekLow52: number | null; beta: number | null;
  currency: string;
};

export type HistoryPoint = { date: string; close: number };

export type HistoryData = {
  ticker: string; series: HistoryPoint[];
  return30d: number; returnPeriod: number;
  dailyVolatility: number; annualVolatility: number;
  maxDrawdown: number; var95OneDay: number; dailyReturns: number[];
};

export type NewsArticle = { title: string; description: string; url: string; source: string; publishedAt: string };
export type Sentiment = "Bullish" | "Neutral" | "Bearish";
export type SentimentResult = { sentiment: Sentiment; summary: string };

export type Filing = { form: string; date: string; reportDate: string; url: string; accession: string };
export type InsiderTrade = { form: string; date: string; url: string };
export type WebHit = { title: string; url: string; snippet: string };
export type MacroPoint = { date: string; value: number };

export type CompanyProfile = {
  ticker: string; name: string; description: string; sector: string; industry: string;
  country: string; employees: number | null; ceo: string; website: string;
  exchange: string; ipoDate: string; marketCap: number | null; currency: string;
  fallback?: boolean;
};

export type PeerRow = {
  ticker: string; name: string;
  pe: number | null; marketCap: number | null;
  revenueGrowth: number | null; profitMargin: number | null; beta: number | null;
};

export type TranscriptData = {
  ticker: string; quarter: number; year: number; date: string;
  ceoRemarks: string; cfoRemarks: string; qa: string; source: "fmp" | "web";
  fallback?: boolean;
};

export type CalcType = "dcf" | "ratios" | "growth_rates" | "var_95" | "peer_ranking";
export type CalcResult = {
  calculation: CalcType;
  result: unknown;
  formula: string;
  steps: string[];
  confidence: "high" | "medium" | "low";
};

export type FactCheckResult = {
  claim: string;
  verdict: "CONFIRMED" | "DISPUTED" | "UNVERIFIABLE";
  confidence: number;
  supporting: { title: string; url: string; snippet: string }[];
  conflicting: { title: string; url: string; snippet: string }[];
  notes: string;
};

export type AgentToolName =
  | "quote" | "history" | "news" | "compare" | "portfolio"
  | "filings" | "insider" | "websearch" | "macro" | "fx"
  | "profile" | "peers" | "transcript" | "calc" | "factcheck";

export type AgentStep = {
  tool: AgentToolName;
  tickers: string[];
  label: string;
  thought?: string;
  expectedObservation?: string;
};
export type AgentPlan = { steps: AgentStep[]; rationale: string };

// ReAct trace: per-step thought/action/observation
export type ReActTrace = {
  index: number;
  tool: AgentToolName;
  thought: string;
  action: string;
  observation: string;
  success: boolean;
  timestamp: number;
  durationMs: number;
};

export type DisambiguationInfo = {
  isAmbiguous: boolean;
  type: "entity_unclear" | "time_period_unclear" | "metric_unclear" | "none";
  interpretation: string;
  assumptions: string[];
};

export type StepResult =
  | { kind: "quote"; ticker: string; data?: QuoteData; error?: string }
  | { kind: "history"; ticker: string; data?: HistoryData; error?: string }
  | { kind: "news"; ticker: string; articles?: NewsArticle[]; sentiments?: SentimentResult[]; error?: string }
  | { kind: "compare"; quotes: Array<{ ticker: string; quote?: QuoteData; history?: HistoryData; error?: string }> }
  | { kind: "portfolio"; tickers: string[]; histories: Array<{ ticker: string; data?: HistoryData; error?: string }>; correlation: number[][]; portfolioVol: number }
  | { kind: "filings"; ticker: string; company?: string; filings?: Filing[]; error?: string }
  | { kind: "insider"; ticker: string; trades?: InsiderTrade[]; error?: string }
  | { kind: "websearch"; query: string; answer?: string; results?: WebHit[]; error?: string }
  | { kind: "macro"; indicator: string; latest?: MacroPoint; series?: MacroPoint[]; yoyChange?: number | null; error?: string }
  | { kind: "fx"; from: string; to: string; rate?: number; updatedAt?: string; error?: string }
  | { kind: "profile"; ticker: string; data?: CompanyProfile; error?: string }
  | { kind: "peers"; ticker: string; peers?: PeerRow[]; error?: string }
  | { kind: "transcript"; ticker: string; data?: TranscriptData; error?: string }
  | { kind: "calc"; data?: CalcResult; error?: string }
  | { kind: "factcheck"; data?: FactCheckResult; error?: string };

export type ChatMessage = {
  id: string; role: Role; content: string; createdAt: number;
  plan?: AgentPlan; steps?: StepResult[]; synthesis?: string;
  pending?: boolean; reportId?: string;
  traces?: ReActTrace[];
  disambiguation?: DisambiguationInfo;
  memoryHits?: { title: string; score: number }[];
  discrepancies?: string[];
};

export type ChatSession = { id: string; title: string; createdAt: number; messages: ChatMessage[] };

export type Report = {
  id: string; sessionId: string; title: string; query: string;
  tickers: string[]; markdown: string; createdAt: number;
  embedding?: number[];
  traces?: ReActTrace[];
  qualityScore?: number;
};

export type EpisodicEntry = {
  sessionId: string;
  queryType: string;
  tickers: string[];
  successfulTools: string[];
  failedTools: string[];
  fallbacksUsed: string[];
  qualityScore?: number;
  timestamp: number;
};

export type TraceAnnotation = {
  reportId: string;
  note: string;
  updatedAt: number;
};
