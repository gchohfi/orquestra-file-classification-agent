import {
  ClassificationProposalSchema,
  type CanonicalSchemaCatalog,
  type ClassificationProposal,
  type ColumnMapping,
} from "../domain/contracts.js";
import { ClassificationError } from "../domain/errors.js";
import { canonicalJson } from "../shared/hash.js";

const CONFIDENCE_RANK = {
  supported: 0,
  review_required: 1,
  blocking: 2,
} as const;

/**
 * The external model may enrich classification, but it cannot weaken locally
 * derived safety decisions or change the physical source inventory.
 */
export function enforceDeterministicSafety(
  rawCandidate: unknown,
  deterministicBaseline: ClassificationProposal,
  catalog: CanonicalSchemaCatalog,
): ClassificationProposal {
  const candidateResult = ClassificationProposalSchema.safeParse(rawCandidate);
  if (!candidateResult.success) {
    throw new ClassificationError(
      "MODEL_RESPONSE_INVALID",
      "A resposta do classificador não respeita o schema estrito.",
    );
  }
  const candidate = candidateResult.data;
  const baseline = ClassificationProposalSchema.parse(deterministicBaseline);

  const candidateMappings = indexMappingsByColumn(candidate.columnMappings);
  const baselineMappings = indexMappingsByColumn(baseline.columnMappings);
  if (
    candidateMappings.size !== baselineMappings.size ||
    [...baselineMappings.keys()].some((columnId) => !candidateMappings.has(columnId))
  ) {
    throw semanticError("O modelo alterou o conjunto físico de colunas classificadas.");
  }

  const columnMappings = baseline.columnMappings.map((safetyMapping) => {
    const columnId = sourceColumnId(safetyMapping);
    const modelMapping = candidateMappings.get(columnId);
    if (!modelMapping) throw semanticError("O modelo omitiu uma coluna inventariada.");
    return mergeMapping(modelMapping, safetyMapping, catalog);
  });

  const candidateBlocks = new Map(candidate.sourceBlocks.map((block) => [block.sheetId, block]));
  if (
    candidateBlocks.size !== baseline.sourceBlocks.length ||
    baseline.sourceBlocks.some((block) => !candidateBlocks.has(block.sheetId))
  ) {
    throw semanticError("O modelo alterou o conjunto físico de blocos de origem.");
  }
  const sourceBlocks = baseline.sourceBlocks;

  return ClassificationProposalSchema.parse({
    ...candidate,
    sourceBlocks,
    sourceGroups: baseline.sourceGroups,
    columnMappings,
    relationshipCandidates: baseline.relationshipCandidates,
    identityReviewRequests: mergeById(
      candidate.identityReviewRequests,
      baseline.identityReviewRequests,
      "requestId",
    ),
    evidence: mergeById(candidate.evidence, baseline.evidence, "evidenceId"),
    rowCoverage: baseline.rowCoverage,
    reviewItems: mergeById(candidate.reviewItems, baseline.reviewItems, "reviewItemId"),
    blockers: mergeIssues(candidate.blockers, baseline.blockers),
    warnings: mergeIssues(candidate.warnings, baseline.warnings),
  });
}

function indexMappingsByColumn(mappings: ColumnMapping[]): Map<string, ColumnMapping> {
  const result = new Map<string, ColumnMapping>();
  for (const mapping of mappings) {
    const columnId = sourceColumnId(mapping);
    if (result.has(columnId)) throw semanticError("O modelo duplicou uma coluna de origem.");
    result.set(columnId, mapping);
  }
  return result;
}

function sourceColumnId(mapping: ColumnMapping): string {
  const columnId = mapping.source.columnId;
  if (typeof columnId !== "string") throw semanticError("Mapeamento sem coluna física de origem.");
  return columnId;
}

function mergeMapping(
  modelMapping: ColumnMapping,
  safetyMapping: ColumnMapping,
  catalog: CanonicalSchemaCatalog,
): ColumnMapping {
  if (safetyMapping.disposition === "canonical" || safetyMapping.disposition === "unresolved") {
    return safetyMapping;
  }
  if (modelMapping.disposition === "canonical") {
    const target = catalog.fields.find(
      (field) => field.fieldId === modelMapping.canonicalFieldId,
    );
    if (!target || target.risk !== "descriptive") {
      return safetyMapping;
    }
  }
  const confidenceClass =
    CONFIDENCE_RANK[modelMapping.confidenceClass] >= CONFIDENCE_RANK[safetyMapping.confidenceClass]
      ? modelMapping.confidenceClass
      : safetyMapping.confidenceClass;
  return ClassificationProposalSchema.shape.columnMappings.element.parse({
    ...modelMapping,
    mappingId: safetyMapping.mappingId,
    source: safetyMapping.source,
    confidenceClass,
    evidenceIds: [...new Set([...modelMapping.evidenceIds, ...safetyMapping.evidenceIds])].sort(),
  });
}

function mergeById<T extends Record<K, string>, K extends keyof T>(
  candidate: T[],
  safety: T[],
  key: K,
): T[] {
  const merged = new Map<string, T>();
  for (const item of candidate) merged.set(item[key], item);
  for (const item of safety) merged.set(item[key], item);
  return [...merged.values()].sort((left, right) => left[key].localeCompare(right[key]));
}

function mergeIssues(
  candidate: ClassificationProposal["blockers"],
  safety: ClassificationProposal["blockers"],
): ClassificationProposal["blockers"] {
  const merged = new Map<string, ClassificationProposal["blockers"][number]>();
  for (const issue of candidate) merged.set(issueKey(issue), issue);
  for (const issue of safety) merged.set(issueKey(issue), issue);
  return [...merged.values()].sort((left, right) => issueKey(left).localeCompare(issueKey(right)));
}

function issueKey(issue: ClassificationProposal["blockers"][number]): string {
  return `${issue.code}:${canonicalJson(issue.sources)}`;
}

function semanticError(detail: string): ClassificationError {
  return new ClassificationError(
    "MODEL_SEMANTIC_INVALID",
    detail,
    "A proposta do modelo tentou alterar uma garantia determinística.",
  );
}
