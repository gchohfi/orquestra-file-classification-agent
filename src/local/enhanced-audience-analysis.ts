import { Decimal } from "decimal.js";
import type {
  ProcedureInstallmentEvent,
  ProcedureInstallmentIssueCode,
  ProcedureInstallmentView,
} from "./procedure-installment-view.js";
import { LocalWorkbookViewError } from "./workbook-data-view.js";

export const ENHANCED_AUDIENCE_WINDOW_DAYS = 120 as const;

export type EnhancedLifecycleCluster =
  | "recent_one_time"
  | "active_repeat"
  | "risk_one_time"
  | "risk_repeat"
  | "inactive_one_time"
  | "inactive_repeat";

export type ProcedureAffinity =
  | "Toxina"
  | "Linear Z"
  | "Bioestímulo"
  | "Preenchedor"
  | "Consulta"
  | "Fios"
  | "Esvaziador"
  | "Outros";

export type EnhancedAudienceRow = Readonly<{
  nameInSpreadsheet: string;
  lastRecordOn: string;
  daysSinceLastRecord: number;
  eventCount: number;
  lifecycleCluster: EnhancedLifecycleCluster;
  candidateHistoricalValueCents: number | null;
  valueEvidence: "complete_candidate" | "incomplete";
  vipCandidate: boolean;
  priorityReactivation: boolean;
  crossSellReview: boolean;
  affinities: readonly ProcedureAffinity[];
  activationEligibility: "report_only";
}>;

/**
 * Análise identificada somente em memória para gerar um HTML local.
 * Não serializar, registrar ou exportar como JSON.
 */
export type EnhancedAudienceAnalysis = Readonly<{
  schemaVersion: "local-enhanced-audience-analysis.v1";
  asOf: string;
  windowDays: 120;
  repeatThreshold: 2;
  vipPercentile: 0.75;
  vipThresholdCents: number | null;
  totalNameCount: number;
  sourceEventCount: number;
  clusterCounts: Readonly<Record<EnhancedLifecycleCluster, number>>;
  reliableValueNameCount: number;
  incompleteValueNameCount: number;
  vipCandidateCount: number;
  priorityReactivationCount: number;
  crossSellReviewCount: number;
  affinityCounts: Readonly<Record<ProcedureAffinity, number>>;
  excludedEventCount: number;
  rows: readonly EnhancedAudienceRow[];
}>;

type MutableAudience = {
  displayName: string;
  latestRecordOn: string;
  eventCount: number;
  candidateValueCents: Decimal;
  valueEvidenceComplete: boolean;
  affinities: Set<ProcedureAffinity>;
};

const VALUE_BLOCKERS = new Set<ProcedureInstallmentIssueCode>([
  "PROCEDURE_AND_PRODUCT_MISSING",
  "PROCEDURE_PRICE_MISSING_OR_INVALID",
  "PROCEDURE_PRICE_CONFLICT",
  "PROCEDURE_ATTRIBUTE_CONFLICT",
  "FORMULA_FINANCIAL_VALUE_UNVERIFIED",
  "FINANCIAL_TOTAL_OUT_OF_RANGE",
]);

const CLUSTER_ORDER: Readonly<Record<EnhancedLifecycleCluster, number>> = {
  inactive_repeat: 0,
  inactive_one_time: 1,
  risk_repeat: 2,
  risk_one_time: 3,
  active_repeat: 4,
  recent_one_time: 5,
};

export function buildEnhancedAudienceAnalysis(
  view: ProcedureInstallmentView,
  options: Readonly<{ asOf: string }>,
): EnhancedAudienceAnalysis {
  const asOf = assertDateKey(options.asOf);
  const names = new Map<string, MutableAudience>();
  let excludedEventCount = 0;

  for (const event of view.events) {
    const name = event.namesInSpreadsheet.length === 1 ? normalizeDisplayName(event.namesInSpreadsheet[0] ?? "") : "";
    const eventDate = event.recordDates.length === 1 ? parseDateKey(event.recordDates[0] ?? "") : null;
    if (!name || !eventDate || daysBetween(eventDate, asOf) < 0) {
      excludedEventCount += 1;
      continue;
    }
    const nameKey = normalizeNameKey(name);
    const current = names.get(nameKey) ?? {
      displayName: name,
      latestRecordOn: eventDate,
      eventCount: 0,
      candidateValueCents: new Decimal(0),
      valueEvidenceComplete: true,
      affinities: new Set<ProcedureAffinity>(),
    };
    current.eventCount += 1;
    if (eventDate > current.latestRecordOn) current.latestRecordOn = eventDate;
    if (name.length > current.displayName.length) current.displayName = name;
    if (hasUnreliableValue(event) || event.procedureTotalCents === null) {
      current.valueEvidenceComplete = false;
    } else {
      current.candidateValueCents = current.candidateValueCents.plus(event.procedureTotalCents);
      if (current.candidateValueCents.abs().greaterThan(Number.MAX_SAFE_INTEGER)) {
        current.valueEvidenceComplete = false;
      }
    }
    for (const procedure of event.procedures) {
      if (procedure.procedureLabels.length === 0) current.affinities.add("Outros");
      for (const label of procedure.procedureLabels) current.affinities.add(procedureAffinity(label));
    }
    names.set(nameKey, current);
  }

  const preliminaryRows = [...names.values()].map((record) => {
    const daysSinceLastRecord = daysBetween(record.latestRecordOn, asOf);
    const reliable = record.valueEvidenceComplete && record.candidateValueCents.isInteger();
    return {
      record,
      daysSinceLastRecord,
      lifecycleCluster: lifecycleCluster(daysSinceLastRecord, record.eventCount),
      candidateValueCents: reliable ? record.candidateValueCents.toNumber() : null,
    };
  });
  const vipThresholdCents = percentileThreshold(
    preliminaryRows
      .map((row) => row.candidateValueCents)
      .filter((value): value is number => value !== null),
    0.75,
  );

  const rows = preliminaryRows.map(({ record, daysSinceLastRecord, lifecycleCluster, candidateValueCents }): EnhancedAudienceRow => {
    const highValue = candidateValueCents !== null && vipThresholdCents !== null && candidateValueCents >= vipThresholdCents;
    const repeat = record.eventCount >= 2;
    const isRiskOrInactive = lifecycleCluster.startsWith("risk_") || lifecycleCluster.startsWith("inactive_");
    return {
      nameInSpreadsheet: record.displayName,
      lastRecordOn: record.latestRecordOn,
      daysSinceLastRecord,
      eventCount: record.eventCount,
      lifecycleCluster,
      candidateHistoricalValueCents: candidateValueCents,
      valueEvidence: candidateValueCents === null ? "incomplete" : "complete_candidate",
      vipCandidate: highValue && repeat,
      priorityReactivation: highValue && isRiskOrInactive,
      crossSellReview: repeat && record.affinities.size === 1,
      affinities: [...record.affinities].sort((left, right) => left.localeCompare(right, "pt-BR")),
      activationEligibility: "report_only",
    };
  }).sort((left, right) =>
    Number(right.priorityReactivation) - Number(left.priorityReactivation) ||
    CLUSTER_ORDER[left.lifecycleCluster] - CLUSTER_ORDER[right.lifecycleCluster] ||
    right.daysSinceLastRecord - left.daysSinceLastRecord ||
    left.nameInSpreadsheet.localeCompare(right.nameInSpreadsheet, "pt-BR", { sensitivity: "base" }),
  );

  return {
    schemaVersion: "local-enhanced-audience-analysis.v1",
    asOf,
    windowDays: ENHANCED_AUDIENCE_WINDOW_DAYS,
    repeatThreshold: 2,
    vipPercentile: 0.75,
    vipThresholdCents,
    totalNameCount: rows.length,
    sourceEventCount: view.events.length,
    clusterCounts: countClusters(rows),
    reliableValueNameCount: rows.filter((row) => row.valueEvidence === "complete_candidate").length,
    incompleteValueNameCount: rows.filter((row) => row.valueEvidence === "incomplete").length,
    vipCandidateCount: rows.filter((row) => row.vipCandidate).length,
    priorityReactivationCount: rows.filter((row) => row.priorityReactivation).length,
    crossSellReviewCount: rows.filter((row) => row.crossSellReview).length,
    affinityCounts: countAffinities(rows),
    excludedEventCount,
    rows,
  };
}

function hasUnreliableValue(event: ProcedureInstallmentEvent): boolean {
  return event.blockers.some((blocker) => VALUE_BLOCKERS.has(blocker));
}

function lifecycleCluster(daysSinceLastRecord: number, eventCount: number): EnhancedLifecycleCluster {
  const repeat = eventCount >= 2;
  if (daysSinceLastRecord < ENHANCED_AUDIENCE_WINDOW_DAYS) return repeat ? "active_repeat" : "recent_one_time";
  if (daysSinceLastRecord < ENHANCED_AUDIENCE_WINDOW_DAYS * 2) return repeat ? "risk_repeat" : "risk_one_time";
  return repeat ? "inactive_repeat" : "inactive_one_time";
}

function procedureAffinity(value: string): ProcedureAffinity {
  const normalized = normalizeNameKey(value);
  if (normalized.includes("toxina")) return "Toxina";
  if (normalized.includes("linear")) return "Linear Z";
  if (normalized.includes("bioest")) return "Bioestímulo";
  if (normalized.includes("preenched")) return "Preenchedor";
  if (normalized.includes("consulta")) return "Consulta";
  if (normalized.includes("fio")) return "Fios";
  if (normalized.includes("esvazi")) return "Esvaziador";
  return "Outros";
}

function percentileThreshold(values: readonly number[], percentile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.floor((sorted.length - 1) * percentile);
  return sorted[index] ?? null;
}

function countClusters(rows: readonly EnhancedAudienceRow[]): Record<EnhancedLifecycleCluster, number> {
  const counts: Record<EnhancedLifecycleCluster, number> = {
    recent_one_time: 0,
    active_repeat: 0,
    risk_one_time: 0,
    risk_repeat: 0,
    inactive_one_time: 0,
    inactive_repeat: 0,
  };
  for (const row of rows) counts[row.lifecycleCluster] += 1;
  return counts;
}

function countAffinities(rows: readonly EnhancedAudienceRow[]): Record<ProcedureAffinity, number> {
  const counts: Record<ProcedureAffinity, number> = {
    "Toxina": 0,
    "Linear Z": 0,
    "Bioestímulo": 0,
    "Preenchedor": 0,
    "Consulta": 0,
    "Fios": 0,
    "Esvaziador": 0,
    "Outros": 0,
  };
  for (const row of rows) for (const affinity of row.affinities) counts[affinity] += 1;
  return counts;
}

function normalizeDisplayName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

function normalizeNameKey(value: string): string {
  return normalizeDisplayName(value).toLocaleLowerCase("pt-BR");
}

function parseDateKey(value: string): string | null {
  const trimmed = value.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/u);
  if (iso) return validDateKey(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const pt = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/u);
  if (pt) return validDateKey(Number(pt[3]), Number(pt[2]), Number(pt[1]));
  return null;
}

function assertDateKey(value: string): string {
  const parsed = parseDateKey(value);
  if (!parsed || parsed !== value) throw new LocalWorkbookViewError("INVALID_ENHANCED_AUDIENCE_AS_OF");
  return parsed;
}

function validDateKey(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysBetween(from: string, to: string): number {
  return Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
