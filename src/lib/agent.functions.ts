import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const AV_URL = "https://www.alphavantage.co/query";
const SEC_UA = "FinAgent research/1.0 (educational; contact@finagent.local)";

function ok<T>(data: T) { return { data, error: null as string | null }; }
function fail(error: string) { return { data: null, error }; }

function mapHttpError(status: number, provider: string): string {
  if (status === 429) return "Rate limit reached, try in 60s";
  if (status === 401 || status === 403) return `${provider} API key is invalid or missing`;
  return `${provider} request failed (${status})`;
}

// ---------- KEY STATUS ----------
export const getKeyStatus = createServerFn({ method: "GET" }).handler(async () => {
  return {
    groq: !!process.env.GROQ_API_KEY,
    alphaVantage: !!process.env.ALPHA_VANTAGE_API_KEY,
    newsapi: !!process.env.NEWSAPI_KEY,
    tavily: !!process.env.TAVILY_API_KEY,
    fred: !!process.env.FRED_API_KEY,
    lovableAI: !!process.env.LOVABLE_API_KEY,
  };
});

// ---------- QUOTE ----------
const tickerSchema = z.object({ ticker: z.string().min(1).max(20).regex(/^[A-Z0-9.\-]+$/i) });

export const getQuote = createServerFn({ method: "POST" })
  .inputValidator((d) => tickerSchema.parse(d))
  .handler(async ({ data }) => {
    const key = process.env.ALPHA_VANTAGE_API_KEY;
    if (!key) return fail("ALPHA_VANTAGE_API_KEY not configured");
    const t = data.ticker.toUpperCase();
    try {
      const [qRes, oRes] = await Promise.all([
        fetch(`${AV_URL}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(t)}&apikey=${key}`),
        fetch(`${AV_URL}?function=OVERVIEW&symbol=${encodeURIComponent(t)}&apikey=${key}`),
      ]);
      if (!qRes.ok) return fail(mapHttpError(qRes.status, "Alpha Vantage"));
      const qJson = (await qRes.json()) as Record<string, unknown>;
      const oJson = oRes.ok ? ((await oRes.json()) as Record<string, unknown>) : {};
      if ((qJson as { Note?: string }).Note) return fail("Rate limit reached, try in 60s");
      const q = (qJson as { "Global Quote"?: Record<string, string> })["Global Quote"];
      if (!q || !q["05. price"]) return fail("Ticker not recognized");
      const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
      return ok({
        ticker: t,
        price: num(q["05. price"]),
        change: num(q["09. change"]),
        changePercent: q["10. change percent"]?.replace("%", "") ?? null,
        previousClose: num(q["08. previous close"]),
        high: num(q["03. high"]),
        low: num(q["04. low"]),
        name: (oJson["Name"] as string) || t,
        exchange: (oJson["Exchange"] as string) || "",
        sector: (oJson["Sector"] as string) || "",
        marketCap: num(oJson["MarketCapitalization"]),
        peRatio: num(oJson["PERatio"]),
        eps: num(oJson["EPS"]),
        weekHigh52: num(oJson["52WeekHigh"]),
        weekLow52: num(oJson["52WeekLow"]),
        beta: num(oJson["Beta"]),
        currency: (oJson["Currency"] as string) || "USD",
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Network error");
    }
  });

// ---------- HISTORY + RISK ----------
export const getHistory = createServerFn({ method: "POST" })
  .inputValidator((d) => tickerSchema.parse(d))
  .handler(async ({ data }) => {
    const key = process.env.ALPHA_VANTAGE_API_KEY;
    if (!key) return fail("ALPHA_VANTAGE_API_KEY not configured");
    const t = data.ticker.toUpperCase();
    try {
      const r = await fetch(
        `${AV_URL}?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(t)}&outputsize=compact&apikey=${key}`
      );
      if (!r.ok) return fail(mapHttpError(r.status, "Alpha Vantage"));
      const j = (await r.json()) as Record<string, unknown>;
      if ((j as { Note?: string }).Note) return fail("Rate limit reached, try in 60s");
      const series = (j as { "Time Series (Daily)"?: Record<string, Record<string, string>> })["Time Series (Daily)"];
      if (!series) return fail("Ticker not recognized or no history available");
      const rows = Object.entries(series)
        .map(([date, v]) => ({ date, close: Number(v["4. close"]) }))
        .filter((r) => Number.isFinite(r.close))
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .slice(-90);
      if (rows.length < 2) return fail("Not enough historical data");
      const closes = rows.map((r) => r.close);
      const dailyReturns: number[] = [];
      for (let i = 1; i < closes.length; i++) dailyReturns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
      const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
      const variance = dailyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / dailyReturns.length;
      const stdev = Math.sqrt(variance);
      const annualVol = stdev * Math.sqrt(252);
      const totalReturn = (closes[closes.length - 1] - closes[0]) / closes[0];
      const periodReturn30 = closes.length >= 31
        ? (closes[closes.length - 1] - closes[closes.length - 31]) / closes[closes.length - 31]
        : totalReturn;
      let peak = closes[0]; let maxDd = 0;
      for (const c of closes) { if (c > peak) peak = c; const dd = (c - peak) / peak; if (dd < maxDd) maxDd = dd; }
      const var95 = -(mean - 1.645 * stdev);
      return ok({
        ticker: t, series: rows, return30d: periodReturn30, returnPeriod: totalReturn,
        dailyVolatility: stdev, annualVolatility: annualVol, maxDrawdown: maxDd,
        var95OneDay: var95, dailyReturns,
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Network error");
    }
  });

// ---------- NEWS ----------
export const getNews = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ ticker: z.string().min(1).max(40), companyName: z.string().max(80).optional() }).parse(d))
  .handler(async ({ data }) => {
    const key = process.env.NEWSAPI_KEY;
    if (!key) return fail("NEWSAPI_KEY not configured");
    const q = data.companyName || data.ticker.replace(/\.[A-Z]+$/, "");
    try {
      const r = await fetch(
        `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&sortBy=publishedAt&language=en&pageSize=5&apiKey=${key}`
      );
      if (!r.ok) return fail(mapHttpError(r.status, "NewsAPI"));
      const j = (await r.json()) as { articles?: Array<{ title: string; description?: string; url: string; source?: { name?: string }; publishedAt?: string }> };
      const articles = (j.articles || []).slice(0, 5).map((a) => ({
        title: a.title, description: a.description ?? "", url: a.url,
        source: a.source?.name ?? "", publishedAt: a.publishedAt ?? "",
      }));
      return ok({ ticker: data.ticker, articles });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Network error");
    }
  });

// ---------- SEC EDGAR: FILINGS ----------
let _cikMap: Record<string, string> | null = null;
async function loadCikMap(): Promise<Record<string, string>> {
  if (_cikMap) return _cikMap;
  try {
    const r = await fetch("https://www.sec.gov/files/company_tickers.json", { headers: { "User-Agent": SEC_UA } });
    if (!r.ok) return {};
    const j = (await r.json()) as Record<string, { cik_str: number; ticker: string }>;
    const m: Record<string, string> = {};
    for (const k of Object.keys(j)) m[j[k].ticker.toUpperCase()] = String(j[k].cik_str).padStart(10, "0");
    _cikMap = m;
    return m;
  } catch { return {}; }
}

export const getFilings = createServerFn({ method: "POST" })
  .inputValidator((d) => tickerSchema.parse(d))
  .handler(async ({ data }) => {
    const t = data.ticker.toUpperCase().replace(/\.[A-Z]+$/, "");
    const map = await loadCikMap();
    const cik = map[t];
    if (!cik) return fail(`SEC: no CIK found for ${t} (non-US ticker?)`);
    try {
      const r = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, { headers: { "User-Agent": SEC_UA } });
      if (!r.ok) return fail(mapHttpError(r.status, "SEC EDGAR"));
      const j = (await r.json()) as { name?: string; filings?: { recent?: { accessionNumber: string[]; form: string[]; filingDate: string[]; primaryDocument: string[]; reportDate: string[] } } };
      const rec = j.filings?.recent;
      if (!rec) return fail("No filings");
      const out: Array<{ form: string; date: string; reportDate: string; url: string; accession: string }> = [];
      for (let i = 0; i < rec.form.length && out.length < 8; i++) {
        const form = rec.form[i];
        if (!/^(10-K|10-Q|8-K|DEF 14A)(\/A)?$/i.test(form)) continue;
        const acc = rec.accessionNumber[i].replace(/-/g, "");
        out.push({
          form, date: rec.filingDate[i], reportDate: rec.reportDate[i] || "",
          accession: rec.accessionNumber[i],
          url: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${acc}/${rec.primaryDocument[i]}`,
        });
      }
      return ok({ ticker: t, company: j.name || t, filings: out });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Network error");
    }
  });

// ---------- SEC EDGAR: INSIDER (Form 4) ----------
export const getInsider = createServerFn({ method: "POST" })
  .inputValidator((d) => tickerSchema.parse(d))
  .handler(async ({ data }) => {
    const t = data.ticker.toUpperCase().replace(/\.[A-Z]+$/, "");
    const map = await loadCikMap();
    const cik = map[t];
    if (!cik) return fail(`SEC: no CIK for ${t}`);
    try {
      const r = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, { headers: { "User-Agent": SEC_UA } });
      if (!r.ok) return fail(mapHttpError(r.status, "SEC EDGAR"));
      const j = (await r.json()) as { filings?: { recent?: { accessionNumber: string[]; form: string[]; filingDate: string[]; primaryDocument: string[] } } };
      const rec = j.filings?.recent;
      if (!rec) return fail("No filings");
      const out: Array<{ form: string; date: string; url: string }> = [];
      for (let i = 0; i < rec.form.length && out.length < 10; i++) {
        if (!/^(4|3|5)$/.test(rec.form[i])) continue;
        const acc = rec.accessionNumber[i].replace(/-/g, "");
        out.push({
          form: `Form ${rec.form[i]}`, date: rec.filingDate[i],
          url: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${acc}/${rec.primaryDocument[i]}`,
        });
      }
      return ok({ ticker: t, trades: out });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Network error");
    }
  });

// ---------- TAVILY WEB SEARCH ----------
export const webSearch = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ query: z.string().min(1).max(400) }).parse(d))
  .handler(async ({ data }) => {
    const key = process.env.TAVILY_API_KEY;
    if (!key) return fail("TAVILY_API_KEY not configured (add it to enable web search)");
    try {
      const r = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: key, query: data.query, max_results: 5, search_depth: "basic", include_answer: true }),
      });
      if (!r.ok) return fail(mapHttpError(r.status, "Tavily"));
      const j = (await r.json()) as { answer?: string; results?: Array<{ title: string; url: string; content: string }> };
      return ok({
        query: data.query, answer: j.answer ?? "",
        results: (j.results || []).slice(0, 5).map((x) => ({ title: x.title, url: x.url, snippet: x.content?.slice(0, 280) ?? "" })),
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Network error");
    }
  });

// ---------- FRED MACRO ----------
const FRED_SERIES: Record<string, string> = {
  GDP: "GDP", CPI: "CPIAUCSL", UNRATE: "UNRATE", FEDFUNDS: "FEDFUNDS",
  TREASURY10Y: "DGS10", VIX: "VIXCLS", OIL: "DCOILWTICO",
};

export const getMacro = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ indicator: z.string().min(1).max(40) }).parse(d))
  .handler(async ({ data }) => {
    const key = process.env.FRED_API_KEY;
    if (!key) return fail("FRED_API_KEY not configured");
    const sid = FRED_SERIES[data.indicator.toUpperCase()] || data.indicator.toUpperCase();
    try {
      const r = await fetch(
        `https://api.stlouisfed.org/fred/series/observations?series_id=${sid}&api_key=${key}&file_type=json&sort_order=desc&limit=24`
      );
      if (!r.ok) return fail(mapHttpError(r.status, "FRED"));
      const j = (await r.json()) as { observations?: Array<{ date: string; value: string }> };
      const obs = (j.observations || [])
        .map((o) => ({ date: o.date, value: Number(o.value) }))
        .filter((o) => Number.isFinite(o.value))
        .reverse();
      if (obs.length === 0) return fail(`No data for indicator ${sid}`);
      const latest = obs[obs.length - 1];
      const yearAgo = obs[Math.max(0, obs.length - 13)];
      const yoy = yearAgo ? (latest.value - yearAgo.value) / yearAgo.value : null;
      return ok({ indicator: sid, latest, series: obs.slice(-24), yoyChange: yoy });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Network error");
    }
  });

// ---------- FX / CRYPTO via AV ----------
export const getFx = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ from: z.string().min(1).max(10), to: z.string().min(1).max(10) }).parse(d))
  .handler(async ({ data }) => {
    const key = process.env.ALPHA_VANTAGE_API_KEY;
    if (!key) return fail("ALPHA_VANTAGE_API_KEY not configured");
    try {
      const r = await fetch(
        `${AV_URL}?function=CURRENCY_EXCHANGE_RATE&from_currency=${data.from.toUpperCase()}&to_currency=${data.to.toUpperCase()}&apikey=${key}`
      );
      if (!r.ok) return fail(mapHttpError(r.status, "Alpha Vantage"));
      const j = (await r.json()) as { "Realtime Currency Exchange Rate"?: Record<string, string> };
      const x = j["Realtime Currency Exchange Rate"];
      if (!x) return fail("FX rate unavailable");
      return ok({
        from: x["1. From_Currency Code"], to: x["3. To_Currency Code"],
        rate: Number(x["5. Exchange Rate"]),
        bid: Number(x["8. Bid Price"]), ask: Number(x["9. Ask Price"]),
        updatedAt: x["6. Last Refreshed"],
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Network error");
    }
  });

// ---------- LOVABLE AI EMBEDDINGS ----------
export const embedText = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ text: z.string().min(1).max(8000) }).parse(d))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return fail("LOVABLE_API_KEY not configured");
    try {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "openai/text-embedding-3-small", input: data.text, dimensions: 384 }),
      });
      if (!r.ok) return fail(mapHttpError(r.status, "Lovable AI"));
      const j = (await r.json()) as { data: Array<{ embedding: number[] }> };
      return ok({ embedding: j.data[0].embedding });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Network error");
    }
  });

// ---------- GROQ helpers ----------
async function callGroq(body: Record<string, unknown>): Promise<{ data: unknown; error: string | null }> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { data: null, error: "GROQ_API_KEY not configured" };
  try {
    const r = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: GROQ_MODEL, ...body }),
    });
    if (!r.ok) {
      const txt = await r.text();
      console.error("Groq error", r.status, txt);
      return { data: null, error: mapHttpError(r.status, "Groq") };
    }
    return { data: await r.json(), error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "Network error" };
  }
}

// ---------- SENTIMENT ----------
export const analyzeSentiment = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      headlines: z.array(z.object({ title: z.string().min(1).max(500), description: z.string().max(1000).optional() })).min(1).max(10),
    }).parse(d)
  )
  .handler(async ({ data }) => {
    const items = data.headlines.map((h, i) => `${i + 1}. ${h.title}${h.description ? " — " + h.description.slice(0, 200) : ""}`).join("\n");
    const res = await callGroq({
      messages: [
        { role: "system", content: "You are a financial sentiment classifier. For each headline return Bullish, Bearish, or Neutral plus a one-line summary. Be concise." },
        { role: "user", content: `Classify each headline:\n${items}` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "report_sentiments",
          parameters: {
            type: "object",
            properties: {
              results: { type: "array", items: { type: "object", properties: { sentiment: { type: "string", enum: ["Bullish", "Neutral", "Bearish"] }, summary: { type: "string" } }, required: ["sentiment", "summary"] } },
            },
            required: ["results"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "report_sentiments" } },
      temperature: 0.2,
    });
    if (res.error) return fail(res.error);
    try {
      const j = res.data as { choices: Array<{ message: { tool_calls?: Array<{ function: { arguments: string } }> } }> };
      const args = j.choices[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!args) return fail("No sentiment results");
      const parsed = JSON.parse(args) as { results: Array<{ sentiment: "Bullish" | "Neutral" | "Bearish"; summary: string }> };
      return ok(parsed.results);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Failed to parse sentiment");
    }
  });

// ---------- AGENT PLAN (ReAct schema) ----------
const planStepSchema = z.object({
  query: z.string().min(1).max(2000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(20).optional(),
  memory: z.string().max(2000).optional(),
  episodicHint: z.string().max(1000).optional(),
  assumptions: z.array(z.string().max(400)).max(10).optional(),
});

export const agentPlan = createServerFn({ method: "POST" })
  .inputValidator((d) => planStepSchema.parse(d))
  .handler(async ({ data }) => {
    const memHint = data.memory ? `\n\nRelevant prior research (long-term memory):\n${data.memory}` : "";
    const epiHint = data.episodicHint ? `\n\nEpisodic hints (past sessions): ${data.episodicHint}` : "";
    const assumeHint = data.assumptions && data.assumptions.length
      ? `\n\nAssumptions to honor: ${data.assumptions.join("; ")}` : "";
    const res = await callGroq({
      messages: [
        {
          role: "system",
          content:
            "You are ARA-1, an autonomous financial research planner using a ReAct (Reason+Act) loop. Given a user query, produce an ordered plan of tool steps. For each step output a 'thought' explaining WHY this step is needed and an 'expectedObservation' describing what you expect to learn. Available tools:\n" +
            "- quote, history, news, compare, portfolio, filings, insider, websearch, macro, fx, profile, peers, transcript, calc, factcheck\n" +
            "Return 2–6 steps. Past-failure tools from episodic hints should be deprioritized but you may still try them. For factcheck put the claim string in tickers[0]. For macro use indicator code in tickers[0]. For fx use ['FROM','TO']. tickers must be uppercase.",
        },
        ...(data.history ?? []).slice(-10),
        { role: "user", content: data.query + memHint + epiHint + assumeHint },
      ],
      tools: [{
        type: "function",
        function: {
          name: "submit_plan",
          parameters: {
            type: "object",
            properties: {
              steps: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    tool: { type: "string", enum: ["quote", "history", "news", "compare", "portfolio", "filings", "insider", "websearch", "macro", "fx", "profile", "peers", "transcript", "calc", "factcheck"] },
                    tickers: { type: "array", items: { type: "string" } },
                    label: { type: "string" },
                    thought: { type: "string" },
                    expectedObservation: { type: "string" },
                  },
                  required: ["tool", "tickers", "label", "thought", "expectedObservation"],
                },
              },
              rationale: { type: "string" },
            },
            required: ["steps", "rationale"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "submit_plan" } },
      temperature: 0.3,
    });
    if (res.error) return fail(res.error);
    try {
      const j = res.data as { choices: Array<{ message: { tool_calls?: Array<{ function: { arguments: string } }> } }> };
      const args = j.choices[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!args) return fail("No plan returned");
      const parsed = JSON.parse(args) as {
        steps: Array<{ tool: import("./types").AgentToolName; tickers: string[]; label: string; thought?: string; expectedObservation?: string }>;
        rationale: string;
      };
      return ok(parsed);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Failed to parse plan");
    }
  });

// ---------- AGENT SYNTHESIZE ----------
export const agentSynthesize = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      query: z.string().min(1).max(2000),
      context: z.string().min(1).max(20000),
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(20).optional(),
      conflictReport: z.string().max(3000).optional(),
      assumptions: z.array(z.string().max(400)).max(10).optional(),
    }).parse(d)
  )
  .handler(async ({ data }) => {
    const conflictBlock = data.conflictReport ? `\n\nData discrepancies detected across sources:\n${data.conflictReport}` : "";
    const assumeBlock = data.assumptions && data.assumptions.length
      ? `\n\nResearch assumptions made: ${data.assumptions.join("; ")}` : "";
    const res = await callGroq({
      messages: [
        {
          role: "system",
          content:
            "You are ARA-1, a senior equity research analyst. Write a structured analyst report with EXACTLY these sections, in this order:\n" +
            "1. Executive Summary — 3–5 sentence TL;DR with the headline thesis.\n" +
            "2. Company Snapshot — sector/industry, business model, key metrics.\n" +
            "3. Market & Sentiment — price action, news sentiment, recent catalysts.\n" +
            "4. Risk Profile — volatility, drawdown, VaR, qualitative risks.\n" +
            "5. Data Discrepancies — call out conflicts between sources if any were flagged (omit if none).\n" +
            "6. Research Assumptions — list the assumptions made (omit if none).\n" +
            "7. Methodology & Sources — which tools were used and how confidence was established.\n" +
            "Use a measured analyst tone, cite actual numbers, and call out conflicting signals between sources. End with: 'Disclaimer: educational only, not investment advice.'",
        },
        ...(data.history ?? []).slice(-6),
        { role: "user", content: `Query: ${data.query}\n\nResearch findings:\n${data.context}${conflictBlock}${assumeBlock}` },
      ],
      temperature: 0.5,
    });
    if (res.error) return fail(res.error);
    const j = res.data as { choices: Array<{ message: { content: string } }> };
    return ok(j.choices[0]?.message?.content ?? "");
  });

// ============================================================
// EXTENDED TOOLS (FMP-style features with Tavily fallback)
// ============================================================

// ---------- COMPANY PROFILE ----------
export const getProfile = createServerFn({ method: "POST" })
  .inputValidator((d) => tickerSchema.parse(d))
  .handler(async ({ data }) => {
    const t = data.ticker.toUpperCase();
    const key = process.env.ALPHA_VANTAGE_API_KEY;
    if (!key) return fail("ALPHA_VANTAGE_API_KEY not configured");
    try {
      const r = await fetch(`${AV_URL}?function=OVERVIEW&symbol=${encodeURIComponent(t)}&apikey=${key}`);
      if (!r.ok) return fail(mapHttpError(r.status, "Alpha Vantage"));
      const j = (await r.json()) as Record<string, string>;
      if ((j as { Note?: string }).Note) return fail("Rate limit reached, try in 60s");
      if (!j.Name) {
        // Fallback to Tavily
        const tav = process.env.TAVILY_API_KEY;
        if (tav) {
          const tr = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ api_key: tav, query: `${t} company profile sector industry CEO`, max_results: 3, include_answer: true }),
          });
          if (tr.ok) {
            const tj = (await tr.json()) as { answer?: string };
            return ok({
              ticker: t, name: t, description: tj.answer || "Profile unavailable from primary source.",
              sector: "", industry: "", country: "", employees: null, ceo: "", website: "",
              exchange: "", ipoDate: "", marketCap: null, currency: "USD", fallback: true,
            });
          }
        }
        return fail("Profile not found");
      }
      const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
      return ok({
        ticker: t,
        name: j.Name || t,
        description: (j.Description || "").slice(0, 1200),
        sector: j.Sector || "",
        industry: j.Industry || "",
        country: j.Country || "",
        employees: num(j.FullTimeEmployees),
        ceo: "",
        website: j.OfficialSite || "",
        exchange: j.Exchange || "",
        ipoDate: "",
        marketCap: num(j.MarketCapitalization),
        currency: j.Currency || "USD",
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Network error");
    }
  });

// ---------- PEER COMPARISON (sector-based via AV OVERVIEW) ----------
// Built-in peer sets for common tickers (FMP-style without FMP key).
const PEER_MAP: Record<string, string[]> = {
  AAPL: ["MSFT", "GOOGL", "AMZN", "META", "NVDA"],
  MSFT: ["AAPL", "GOOGL", "AMZN", "ORCL", "CRM"],
  GOOGL: ["AAPL", "MSFT", "META", "AMZN", "NFLX"],
  AMZN: ["AAPL", "MSFT", "GOOGL", "WMT", "META"],
  NVDA: ["AMD", "INTC", "QCOM", "AVGO", "TSM"],
  AMD: ["NVDA", "INTC", "QCOM", "AVGO", "MU"],
  TSLA: ["F", "GM", "RIVN", "LCID", "NIO"],
  META: ["GOOGL", "SNAP", "PINS", "NFLX", "AAPL"],
  JPM: ["BAC", "WFC", "C", "GS", "MS"],
  BAC: ["JPM", "WFC", "C", "USB", "PNC"],
  WFC: ["JPM", "BAC", "C", "USB", "PNC"],
  NFLX: ["DIS", "WBD", "PARA", "GOOGL", "AMZN"],
};

export const getPeers = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ ticker: z.string().min(1).max(20).regex(/^[A-Z0-9.\-]+$/i), numPeers: z.number().min(1).max(8).optional() }).parse(d))
  .handler(async ({ data }) => {
    const key = process.env.ALPHA_VANTAGE_API_KEY;
    if (!key) return fail("ALPHA_VANTAGE_API_KEY not configured");
    const t = data.ticker.toUpperCase().replace(/\.[A-Z]+$/, "");
    const n = data.numPeers ?? 5;
    const peers = PEER_MAP[t]?.slice(0, n) ?? [];
    if (peers.length === 0) return fail(`No peer mapping for ${t} (limited mapping in demo).`);
    const num = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : null; };
    try {
      const rows = await Promise.all(peers.map(async (p) => {
        try {
          const r = await fetch(`${AV_URL}?function=OVERVIEW&symbol=${p}&apikey=${key}`);
          if (!r.ok) return { ticker: p, name: p, pe: null, marketCap: null, revenueGrowth: null, profitMargin: null, beta: null };
          const j = (await r.json()) as Record<string, string>;
          return {
            ticker: p,
            name: j.Name || p,
            pe: num(j.PERatio),
            marketCap: num(j.MarketCapitalization),
            revenueGrowth: num(j.QuarterlyRevenueGrowthYOY),
            profitMargin: num(j.ProfitMargin),
            beta: num(j.Beta),
          };
        } catch {
          return { ticker: p, name: p, pe: null, marketCap: null, revenueGrowth: null, profitMargin: null, beta: null };
        }
      }));
      return ok({ ticker: t, peers: rows });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Network error");
    }
  });

// ---------- EARNINGS TRANSCRIPT (Tavily-only, FMP-free) ----------
export const getTranscript = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    ticker: z.string().min(1).max(20).regex(/^[A-Z0-9.\-]+$/i),
    quarter: z.number().min(1).max(4),
    year: z.number().min(2015).max(2030),
  }).parse(d))
  .handler(async ({ data }) => {
    const tav = process.env.TAVILY_API_KEY;
    if (!tav) return fail("TAVILY_API_KEY not configured (needed for transcript fallback).");
    const t = data.ticker.toUpperCase();
    try {
      const r = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: tav,
          query: `${t} earnings call transcript Q${data.quarter} ${data.year} CEO CFO`,
          max_results: 5,
          search_depth: "advanced",
          include_answer: true,
        }),
      });
      if (!r.ok) return fail(mapHttpError(r.status, "Tavily"));
      const j = (await r.json()) as { answer?: string; results?: Array<{ title: string; content?: string; url: string }> };
      const merged = (j.results || []).map((x) => x.content || "").join("\n\n").slice(0, 8000);
      // Heuristic split
      const ceoMatch = merged.match(/(CEO|Chief Executive)[\s\S]{0,2500}/i)?.[0]?.slice(0, 1800) || "";
      const cfoMatch = merged.match(/(CFO|Chief Financial)[\s\S]{0,2500}/i)?.[0]?.slice(0, 1800) || "";
      const qaMatch = merged.match(/(Q ?&? ?A|Question[- ]and[- ]Answer|operator[\s\S]{0,200}question)[\s\S]{0,3000}/i)?.[0]?.slice(0, 2000) || "";
      return ok({
        ticker: t,
        quarter: data.quarter,
        year: data.year,
        date: new Date().toISOString().slice(0, 10),
        ceoRemarks: ceoMatch || (j.answer || "").slice(0, 1200),
        cfoRemarks: cfoMatch,
        qa: qaMatch,
        source: "web" as const,
        fallback: true,
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Network error");
    }
  });

// ---------- CALCULATION ENGINE ----------
const calcSchema = z.object({
  calculation: z.enum(["dcf", "ratios", "growth_rates", "var_95", "peer_ranking"]),
  inputs: z.record(z.string(), z.unknown()),
});

export const runCalc = createServerFn({ method: "POST" })
  .inputValidator((d) => calcSchema.parse(d))
  .handler(async ({ data }) => {
    const t = data.calculation;
    const i = data.inputs as Record<string, unknown>;
    const steps: string[] = [];
    const num = (v: unknown, d = 0): number => { const n = Number(v); return Number.isFinite(n) ? n : d; };
    try {
      if (t === "dcf") {
        const fcf = num(i.free_cash_flow);
        const g = num(i.growth_rate, 0.05);
        const r = num(i.discount_rate, 0.1);
        const tg = num(i.terminal_growth, 0.025);
        const years = Math.max(1, Math.min(20, num(i.years, 5)));
        let pv = 0;
        for (let y = 1; y <= years; y++) {
          const cf = fcf * Math.pow(1 + g, y);
          const disc = cf / Math.pow(1 + r, y);
          steps.push(`Year ${y}: FCF=${cf.toFixed(0)}, PV=${disc.toFixed(0)}`);
          pv += disc;
        }
        const terminal = (fcf * Math.pow(1 + g, years) * (1 + tg)) / (r - tg);
        const termPV = terminal / Math.pow(1 + r, years);
        steps.push(`Terminal value=${terminal.toFixed(0)}, PV=${termPV.toFixed(0)}`);
        return ok({
          calculation: "dcf" as const,
          result: { intrinsic_value: pv + termPV, projection_pv: pv, terminal_pv: termPV },
          formula: "Σ FCF·(1+g)^t / (1+r)^t + TV/(1+r)^n",
          steps,
          confidence: "medium" as const,
        });
      }
      if (t === "ratios") {
        const rev = num(i.revenue, 1);
        const ni = num(i.net_income);
        const ta = num(i.total_assets, 1);
        const eq = num(i.equity, 1);
        const debt = num(i.debt);
        const grossMargin = num(i.gross_profit) / rev;
        const netMargin = ni / rev;
        const roe = ni / eq;
        const roa = ni / ta;
        const de = debt / eq;
        steps.push(`Net margin = ${ni}/${rev} = ${(netMargin * 100).toFixed(2)}%`);
        steps.push(`ROE = ${ni}/${eq} = ${(roe * 100).toFixed(2)}%`);
        steps.push(`D/E = ${debt}/${eq} = ${de.toFixed(2)}`);
        return ok({
          calculation: "ratios" as const,
          result: { gross_margin: grossMargin, net_margin: netMargin, roe, roa, debt_to_equity: de },
          formula: "Standard accounting ratios",
          steps,
          confidence: "high" as const,
        });
      }
      if (t === "growth_rates") {
        const vals = (i.values as number[]) || [];
        if (vals.length < 2) return fail("Need at least 2 values");
        const yoy: number[] = [];
        for (let k = 1; k < vals.length; k++) yoy.push((vals[k] - vals[k - 1]) / vals[k - 1]);
        const periods = vals.length - 1;
        const cagr = Math.pow(vals[vals.length - 1] / vals[0], 1 / periods) - 1;
        const avg = yoy.reduce((a, b) => a + b, 0) / yoy.length;
        steps.push(`CAGR over ${periods} periods = ${(cagr * 100).toFixed(2)}%`);
        steps.push(`Avg YoY = ${(avg * 100).toFixed(2)}%`);
        return ok({
          calculation: "growth_rates" as const,
          result: { cagr, yoy_growth_rates: yoy, avg_growth: avg },
          formula: "CAGR = (V_end / V_start)^(1/n) − 1",
          steps,
          confidence: "high" as const,
        });
      }
      if (t === "var_95") {
        const rets = (i.daily_returns as number[]) || [];
        if (rets.length < 30) return fail("Need ≥30 daily returns for 95% VaR.");
        const sorted = [...rets].sort((a, b) => a - b);
        const var95 = -sorted[Math.floor(sorted.length * 0.05)];
        const tail = sorted.slice(0, Math.floor(sorted.length * 0.05));
        const es = tail.length ? -tail.reduce((a, b) => a + b, 0) / tail.length : 0;
        steps.push(`Sorted ${rets.length} returns; 5th percentile = ${(-var95).toFixed(4)}`);
        steps.push(`Expected shortfall (avg of tail) = ${(-es).toFixed(4)}`);
        return ok({
          calculation: "var_95" as const,
          result: { var_95: var95, expected_shortfall: es },
          formula: "Historical 5th percentile loss",
          steps,
          confidence: "high" as const,
        });
      }
      if (t === "peer_ranking") {
        const companies = (i.companies as Array<Record<string, number>>) || [];
        const metric = String(i.metric || "marketCap");
        const ranked = [...companies]
          .map((c, idx) => ({ ...c, _idx: idx, _val: Number(c[metric]) || 0 }))
          .sort((a, b) => b._val - a._val)
          .map((c, rank) => ({ ...c, rank: rank + 1, percentile: 100 - (rank / companies.length) * 100 }));
        steps.push(`Ranked ${companies.length} companies by ${metric}`);
        return ok({
          calculation: "peer_ranking" as const,
          result: ranked,
          formula: `Sort by ${metric} desc`,
          steps,
          confidence: "high" as const,
        });
      }
      return fail("Unknown calculation");
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Calc failed");
    }
  });

// ---------- FACT CHECKER ----------
export const factCheck = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    claim: z.string().min(5).max(500),
    ticker: z.string().min(1).max(20).optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const tav = process.env.TAVILY_API_KEY;
    if (!tav) return fail("TAVILY_API_KEY not configured");
    try {
      const q = data.ticker ? `${data.ticker} ${data.claim}` : data.claim;
      const r = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: tav, query: q, max_results: 6, include_answer: true, search_depth: "advanced" }),
      });
      if (!r.ok) return fail(mapHttpError(r.status, "Tavily"));
      const j = (await r.json()) as { answer?: string; results?: Array<{ title: string; url: string; content: string }> };
      const hits = (j.results || []).map((x) => ({ title: x.title, url: x.url, snippet: (x.content || "").slice(0, 240) }));
      // Heuristic: numbers in claim → check if they appear in snippets
      const claimNums = (data.claim.match(/\d+(?:\.\d+)?/g) ?? []).map(String);
      const blob = hits.map((h) => h.snippet).join(" ");
      let supportingHits = 0;
      let conflictingHits = 0;
      if (claimNums.length > 0) {
        for (const n of claimNums) {
          if (blob.includes(n)) supportingHits++;
          else conflictingHits++;
        }
      } else {
        // No numbers: count snippets that mention claim keywords
        const keywords = data.claim.toLowerCase().split(/\W+/).filter((w) => w.length > 4).slice(0, 5);
        for (const h of hits) {
          const sn = h.snippet.toLowerCase();
          const matches = keywords.filter((k) => sn.includes(k)).length;
          if (matches >= 2) supportingHits++;
        }
      }
      const supporting = hits.slice(0, Math.max(1, supportingHits));
      const conflicting = conflictingHits > 0 ? hits.slice(-Math.min(conflictingHits, 2)) : [];
      const verdict: "CONFIRMED" | "DISPUTED" | "UNVERIFIABLE" =
        supportingHits >= 2 && conflictingHits === 0 ? "CONFIRMED"
        : conflictingHits > supportingHits ? "DISPUTED"
        : "UNVERIFIABLE";
      const confidence = Math.min(1, supportingHits / Math.max(1, hits.length));
      return ok({
        claim: data.claim,
        verdict,
        confidence,
        supporting,
        conflicting,
        notes: j.answer ? `Tavily synthesis: ${j.answer.slice(0, 240)}` : "",
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Network error");
    }
  });

// ---------- QUERY DISAMBIGUATION ----------
export const disambiguateQuery = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ query: z.string().min(1).max(2000) }).parse(d))
  .handler(async ({ data }) => {
    const res = await callGroq({
      messages: [
        {
          role: "system",
          content: "Detect ambiguity in financial research queries. Output JSON with: isAmbiguous, type (one of entity_unclear|time_period_unclear|metric_unclear|none), interpretation (your best reading), assumptions (array of strings you'd make). Be conservative — only flag when truly vague (e.g. 'the banks', 'recent', 'how is it doing').",
        },
        { role: "user", content: data.query },
      ],
      tools: [{
        type: "function",
        function: {
          name: "report_disambiguation",
          parameters: {
            type: "object",
            properties: {
              isAmbiguous: { type: "boolean" },
              type: { type: "string", enum: ["entity_unclear", "time_period_unclear", "metric_unclear", "none"] },
              interpretation: { type: "string" },
              assumptions: { type: "array", items: { type: "string" } },
            },
            required: ["isAmbiguous", "type", "interpretation", "assumptions"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "report_disambiguation" } },
      temperature: 0.2,
    });
    if (res.error) return fail(res.error);
    try {
      const j = res.data as { choices: Array<{ message: { tool_calls?: Array<{ function: { arguments: string } }> } }> };
      const args = j.choices[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!args) return fail("No disambiguation");
      return ok(JSON.parse(args) as { isAmbiguous: boolean; type: "entity_unclear" | "time_period_unclear" | "metric_unclear" | "none"; interpretation: string; assumptions: string[] });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Parse error");
    }
  });

// ---------- LLM JUDGE (for eval scoring) ----------
export const judgeReport = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ report: z.string().min(50).max(15000), query: z.string().min(1).max(2000) }).parse(d))
  .handler(async ({ data }) => {
    const res = await callGroq({
      messages: [
        {
          role: "system",
          content: "Score this financial research report on five 1-5 axes. Return JSON: { insightDensity, crossSourceSynthesis, logicalFlow, internalConsistency, executiveSummaryQuality, notes }. Be a tough grader.",
        },
        { role: "user", content: `Query: ${data.query}\n\nReport:\n${data.report.slice(0, 8000)}` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "score_report",
          parameters: {
            type: "object",
            properties: {
              insightDensity: { type: "number" },
              crossSourceSynthesis: { type: "number" },
              logicalFlow: { type: "number" },
              internalConsistency: { type: "number" },
              executiveSummaryQuality: { type: "number" },
              notes: { type: "string" },
            },
            required: ["insightDensity", "crossSourceSynthesis", "logicalFlow", "internalConsistency", "executiveSummaryQuality"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "score_report" } },
      temperature: 0.2,
    });
    if (res.error) return fail(res.error);
    try {
      const j = res.data as { choices: Array<{ message: { tool_calls?: Array<{ function: { arguments: string } }> } }> };
      const args = j.choices[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!args) return fail("No score");
      return ok(JSON.parse(args) as { insightDensity: number; crossSourceSynthesis: number; logicalFlow: number; internalConsistency: number; executiveSummaryQuality: number; notes?: string });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Parse error");
    }
  });
