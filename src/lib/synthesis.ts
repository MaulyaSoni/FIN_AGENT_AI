// Source reliability hierarchy + conflict resolution.
// Used by the synthesis layer to flag discrepancies between data sources.

export const SOURCE_TIERS = {
  SEC_FILING: 1,
  FINANCIAL_API: 2,
  EARNINGS_CALL: 3,
  MAJOR_NEWS: 4,
  SOCIAL_MEDIA: 5,
  WEB_SEARCH: 6,
} as const;

export type SourceTier = keyof typeof SOURCE_TIERS;

export type DataPoint = {
  metric: string;
  value: number;
  source: string;
  tier: SourceTier;
  date?: string;
};

export type ConflictResolution = {
  metric: string;
  resolvedValue: number;
  method: "single_source" | "tier_priority" | "averaged" | "disputed";
  conflict: boolean;
  values?: { value: number; source: string; tier: SourceTier }[];
  note?: string;
};

/** Resolve a single claim vs another using tier hierarchy. */
export function resolveConflict(
  metric: string,
  a: { value: number; source: string; tier: SourceTier },
  b: { value: number; source: string; tier: SourceTier },
  withinPct = 0.05
): ConflictResolution {
  // Same value within tolerance → average
  if (Math.abs(a.value - b.value) / Math.max(Math.abs(a.value), Math.abs(b.value), 1e-9) <= withinPct) {
    return {
      metric,
      resolvedValue: (a.value + b.value) / 2,
      method: "averaged",
      conflict: false,
      values: [a, b],
    };
  }
  const aRank = SOURCE_TIERS[a.tier];
  const bRank = SOURCE_TIERS[b.tier];
  if (aRank !== bRank) {
    const winner = aRank < bRank ? a : b;
    return {
      metric,
      resolvedValue: winner.value,
      method: "tier_priority",
      conflict: true,
      values: [a, b],
      note: `${winner.source} (tier ${SOURCE_TIERS[winner.tier]}) preferred over the lower-tier source.`,
    };
  }
  return {
    metric,
    resolvedValue: a.value,
    method: "disputed",
    conflict: true,
    values: [a, b],
    note: `Two same-tier sources disagree (${a.value} vs ${b.value}). Reported both.`,
  };
}

/** Combine many data points, preferring higher tier + recency. */
export function synthesizeMultiSource(points: DataPoint[]): ConflictResolution[] {
  const byMetric = new Map<string, DataPoint[]>();
  for (const p of points) {
    if (!byMetric.has(p.metric)) byMetric.set(p.metric, []);
    byMetric.get(p.metric)!.push(p);
  }
  const out: ConflictResolution[] = [];
  for (const [metric, list] of byMetric) {
    if (list.length === 1) {
      out.push({ metric, resolvedValue: list[0].value, method: "single_source", conflict: false, values: list });
      continue;
    }
    // Reduce: keep running best
    let running = list[0];
    let conflict = false;
    for (let i = 1; i < list.length; i++) {
      const r = resolveConflict(metric, running, list[i]);
      if (r.conflict) conflict = true;
      running = { ...running, value: r.resolvedValue };
    }
    out.push({
      metric,
      resolvedValue: running.value,
      method: conflict ? "tier_priority" : "averaged",
      conflict,
      values: list,
      note: conflict ? `Reconciled ${list.length} sources with > 5% spread.` : undefined,
    });
  }
  return out;
}

/** Find numbers in a report markdown that don't appear in any tool observation. */
export function findUntracedNumbers(reportMd: string, observations: string[]): { numbers: string[]; total: number; untraced: number } {
  const obsBlob = observations.join(" ").replace(/[,_$%]/g, "");
  const matches = reportMd.match(/(?<![A-Za-z])-?\d+(?:\.\d+)?/g) ?? [];
  const numbers = [...new Set(matches.filter((m) => Math.abs(Number(m)) >= 0.1))];
  const untraced = numbers.filter((n) => !obsBlob.includes(n));
  return { numbers, total: numbers.length, untraced: untraced.length };
}
