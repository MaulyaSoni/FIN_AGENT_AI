// Lightweight ticker extraction + reference resolution.
const KNOWN = new Set([
  "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "META", "TSLA", "NVDA", "NFLX", "AMD", "INTC", "ORCL",
  "RELIANCE.NS", "TCS.NS", "INFY.NS", "INFY", "WIPRO.NS", "WIPRO", "HCLTECH.NS", "HCLTECH",
  "HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS", "BAJFINANCE.NS", "ITC.NS", "LT.NS", "MARUTI.NS",
  "JPM", "BAC", "GS", "DIS", "BA", "KO", "PEP", "WMT", "XOM", "CVX", "SPY", "QQQ",
]);

const TICKER_RE = /\b([A-Z]{1,6}(?:\.[A-Z]{1,4})?)\b/g;

const STOPWORDS = new Set([
  "I","A","AN","THE","AND","OR","BUT","FOR","TO","OF","IN","ON","AT","BY","IS","ARE","WAS","WERE",
  "BE","BEEN","DO","DID","DOES","HAS","HAVE","HAD","WILL","WOULD","CAN","COULD","SHOULD","MAY",
  "MIGHT","ME","MY","YOU","YOUR","WE","US","OUR","HE","SHE","IT","THEY","THEM","THEIR","WHAT",
  "WHEN","WHERE","WHY","HOW","WHICH","WHO","WHOM","NEWS","STOCK","STOCKS","PRICE","CHART","RISK",
  "PROFILE","REPORT","SUMMARY","COMPARE","ANALYZE","ANALYSIS","BUILD","PORTFOLIO","GIVE","FULL",
  "RECENT","ON","OK","NS","BSE","NSE","USD","INR",
]);

export function extractTickers(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const upper = text.toUpperCase();
  let m: RegExpExecArray | null;
  while ((m = TICKER_RE.exec(upper))) {
    const t = m[1];
    const isTicker = KNOWN.has(t) || (!STOPWORDS.has(t) && /^[A-Z]{2,5}(?:\.[A-Z]{1,4})?$/.test(t));
    if (isTicker && !seen.has(t)) { seen.add(t); found.push(t); }
  }
  return found;
}

const ORDINAL_MAP: Record<string, number> = {
  first: 0, "1st": 0, one: 0,
  second: 1, "2nd": 1, two: 1,
  third: 2, "3rd": 2, three: 2,
  fourth: 3, "4th": 3, four: 3,
  fifth: 4, "5th": 4, five: 4,
  last: -1, final: -1, latest: -1,
};

export function resolveReferences(query: string, history: string[]): string[] {
  if (history.length === 0) return [];
  const q = query.toLowerCase();

  // Ordinal references: "the first stock", "second one", "the 3rd ticker"
  const ord = q.match(/\b(first|1st|one|second|2nd|two|third|3rd|three|fourth|4th|four|fifth|5th|five|last|final|latest)\b/);
  if (ord) {
    const idx = ORDINAL_MAP[ord[1]];
    const pick = idx === -1 ? history[history.length - 1] : history[idx];
    if (pick) return [pick];
  }

  // Generic anaphora: "it", "that stock", "the same one", "previous", "above"
  if (/\b(it|that stock|same stock|same one|the same|previous|earlier|above|prior)\b/.test(q)) {
    return [history[history.length - 1]];
  }
  return [];
}
