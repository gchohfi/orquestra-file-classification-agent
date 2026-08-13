import type {
  CanonicalFieldSchema,
  ClassificationProposal,
  ColumnMapping,
  ColumnProfile,
  EvidenceSchema,
  PlanIssueSchema,
  ReviewItemSchema,
  RowCoverageSchema,
  SheetManifest,
  SourceBlockSchema,
  SourceGroupSchema,
  WorkbookManifest,
} from "../../domain/contracts.js";
import type { z } from "zod";
import { deterministicId, sha256 } from "../../shared/hash.js";
import { periodicFamilyName } from "../../shared/text.js";
import type { ClassificationModel, ClassificationModelInput } from "../../ports.js";

type CanonicalField = z.infer<typeof CanonicalFieldSchema>;
type Evidence = z.infer<typeof EvidenceSchema>;
type SourceBlock = z.infer<typeof SourceBlockSchema>;
type SourceGroup = z.infer<typeof SourceGroupSchema>;
type RowCoverage = z.infer<typeof RowCoverageSchema>;
type PlanIssue = z.infer<typeof PlanIssueSchema>;
type ReviewItem = z.infer<typeof ReviewItemSchema>;

type BlockContext = {
  manifest: WorkbookManifest;
  fileId: string;
  fileName: string;
  sheet: SheetManifest;
  block: SourceBlock;
  mappings: ColumnMapping[];
  entityIds: Set<string>;
};

export class DeterministicClassificationModel implements ClassificationModel {
  public readonly providerId = "local-deterministic";

  public async classify(input: ClassificationModelInput, signal: AbortSignal): Promise<unknown> {
    signal.throwIfAborted();
    const evidence: Evidence[] = [];
    const sourceBlocks: SourceBlock[] = [];
    const columnMappings: ColumnMapping[] = [];
    const identityReviewRequests: ClassificationProposal["identityReviewRequests"] = [];
    const reviewItems: ReviewItem[] = [];
    const blockers: PlanIssue[] = [];
    const warnings: PlanIssue[] = [];
    const contexts: BlockContext[] = [];

    const entityById = new Map(input.catalog.entities.map((entity) => [entity.entityId, entity]));
    const fieldById = new Map(input.catalog.fields.map((field) => [field.fieldId, field]));

    for (const file of input.manifest.files) {
      for (const alert of file.alerts) addAlertIssue(alert, blockers, warnings);
      for (const sheet of file.sheets) {
        signal.throwIfAborted();
        for (const alert of sheet.alerts) addAlertIssue(alert, blockers, warnings);
        const rowStart = sheet.headerRow === null ? 1 : sheet.headerRow + 1;
        const rowEnd = Math.max(rowStart, sheet.physicalRowCount);
        const blockId = deterministicId("block", file.fileId, sheet.sheetId, String(rowStart), String(rowEnd));
        const fieldMatches = new Map<string, CanonicalField[]>();
        const entityScores = new Map<string, number>();

        for (const column of sheet.columns) {
          const matches = input.catalog.fields.filter((field) =>
            field.acceptedHeaders.includes(column.normalizedHeader),
          );
          fieldMatches.set(column.columnId, matches);
          for (const match of matches) {
            entityScores.set(match.entityId, (entityScores.get(match.entityId) ?? 0) + 1);
          }
        }

        const maximumScore = Math.max(0, ...entityScores.values());
        const topEntities = new Set(
          [...entityScores.entries()]
            .filter(([, score]) => score === maximumScore && score > 0)
            .map(([entityId]) => entityId),
        );

        const blockMappings: ColumnMapping[] = [];
        const entityEvidence = new Map<string, string[]>();
        for (const column of sheet.columns) {
          if (column.dataNonEmptyCount === 0) continue;
          const mapping = classifyColumn({
            fileId: file.fileId,
            sheet,
            column,
            matches: fieldMatches.get(column.columnId) ?? [],
            topEntities,
            evidence,
            reviewItems,
            blockers,
          });
          blockMappings.push(mapping);
          columnMappings.push(mapping);
          if (mapping.disposition === "canonical") {
            const entityId = fieldById.get(mapping.canonicalFieldId)?.entityId;
            if (entityId) {
              const current = entityEvidence.get(entityId) ?? [];
              current.push(...mapping.evidenceIds);
              entityEvidence.set(entityId, current);
            }
          }
        }

        const unresolved = blockMappings.some((mapping) => mapping.disposition === "unresolved");
        const empty = sheet.dataRowCount === 0;
        const entityCandidates = [...entityEvidence.entries()]
          .map(([entityId, evidenceIds]) => {
            const entity = entityById.get(entityId);
            if (!entity) return undefined;
            return {
              entityId,
              grain: entity.grain,
              assessment: topEntities.size === 1 && topEntities.has(entityId) ? "supported" as const : "review_required" as const,
              evidenceIds: [...new Set(evidenceIds)].sort(),
              explanation: "Entidade candidata baseada em cabeçalhos e tipos perfilados.",
            };
          })
          .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== undefined)
          .sort((left, right) => left.entityId.localeCompare(right.entityId));

        const block: SourceBlock = {
          blockId,
          fileId: file.fileId,
          sheetId: sheet.sheetId,
          rowRange: { start: rowStart, end: rowEnd },
          columnIds: blockMappings.map((mapping) => mapping.source.columnId).filter(isString).sort(),
          disposition: empty ? "empty" : unresolved ? "unresolved" : "classified",
          entityCandidates,
        };
        sourceBlocks.push(block);

        const canonicalFieldToColumn = new Map<string, string>();
        for (const mapping of blockMappings) {
          if (mapping.disposition === "canonical" && mapping.source.columnId) {
            canonicalFieldToColumn.set(mapping.canonicalFieldId, mapping.source.columnId);
          }
        }
        const nameColumnId = canonicalFieldToColumn.get("person.full_name");
        if (nameColumnId) {
          const strongIdentifierColumnIds = blockMappings
            .filter(
              (mapping): mapping is Extract<ColumnMapping, { disposition: "canonical" }> =>
                mapping.disposition === "canonical" &&
                Boolean(fieldById.get(mapping.canonicalFieldId)?.strongIdentitySignal),
            )
            .map((mapping) => mapping.source.columnId)
            .filter(isString)
            .sort();
          if (strongIdentifierColumnIds.length === 0) {
            const personRows = sheet.rows.filter((row) => row.nonEmptyColumnIds.includes(nameColumnId)).length;
            const requestId = deterministicId("identity_review", blockId, nameColumnId);
            identityReviewRequests.push({
              requestId,
              blockId,
              nameColumnId,
              strongIdentifierColumnIds: [],
              rowsWithoutStrongIdentity: personRows,
              disposition: "keep_provisional",
              reason: "name_only_is_not_identity_evidence",
            });
            const source = { fileId: file.fileId, sheetId: sheet.sheetId, columnId: nameColumnId };
            warnings.push({
              code: "NAME_ONLY_IDENTITY_IS_PROVISIONAL",
              sources: [source],
              detail: "A pessoa permanecerá provisória porque nome isolado não autoriza união.",
            });
            reviewItems.push({
              reviewItemId: deterministicId("review", requestId),
              code: "REVIEW_PROVISIONAL_IDENTITY",
              sources: [source],
              reason: "Não há identificador forte na fonte.",
              actionRequired: "Manter separado ou fornecer evidências adicionais; nunca unir somente por nome.",
            });
          } else {
            const strongColumns = strongIdentifierColumnIds
              .map((columnId) => sheet.columns.find((column) => column.columnId === columnId))
              .filter((column): column is ColumnProfile => column !== undefined);
            const rowsWithName = sheet.rows.filter((row) => row.nonEmptyColumnIds.includes(nameColumnId));
            const rowsWithoutStrongIdentity = rowsWithName.filter((row) =>
              strongIdentifierColumnIds.every((columnId) => !row.nonEmptyColumnIds.includes(columnId)),
            ).length;
            const invalidStrongIdentityRows = strongColumns.reduce(
              (total, column) => total + column.strongIdentityInvalidCount,
              0,
            );
            const affectedRows = Math.min(
              rowsWithName.length,
              rowsWithoutStrongIdentity + invalidStrongIdentityRows,
            );
            if (affectedRows > 0) {
              const requestId = deterministicId("identity_review", blockId, nameColumnId, "partial");
              identityReviewRequests.push({
                requestId,
                blockId,
                nameColumnId,
                strongIdentifierColumnIds,
                rowsWithoutStrongIdentity: affectedRows,
                disposition: "keep_provisional",
                reason: "name_only_is_not_identity_evidence",
              });
              const source = { fileId: file.fileId, sheetId: sheet.sheetId, columnId: nameColumnId };
              warnings.push({
                code: "PARTIAL_STRONG_IDENTITY_REQUIRES_ROW_REVIEW",
                sources: [source],
                detail: `${affectedRows} linha(s) com nome não possuem identificador forte válido e permanecerão provisórias.`,
              });
              reviewItems.push({
                reviewItemId: deterministicId("review", requestId),
                code: "REVIEW_PARTIAL_PROVISIONAL_IDENTITY",
                sources: [source],
                reason: "A presença da coluna de identificador não garante cobertura linha a linha.",
                actionRequired: "Revisar somente as linhas sem identificador forte válido.",
              });
            }
          }
        }

        contexts.push({
          manifest: input.manifest,
          fileId: file.fileId,
          fileName: file.originalName,
          sheet,
          block,
          mappings: blockMappings,
          entityIds: new Set(entityCandidates.map((candidate) => candidate.entityId)),
        });
      }
    }

    const sourceGroups = buildSourceGroups(contexts, evidence);
    const relationshipCandidates = buildRelationships(contexts, evidence);
    const rowCoverage = buildRowCoverage(contexts);

    return {
      proposalVersion: "classification-proposal.v1",
      sourceBlocks: sourceBlocks.sort((left, right) => left.blockId.localeCompare(right.blockId)),
      sourceGroups,
      columnMappings: columnMappings.sort((left, right) => left.mappingId.localeCompare(right.mappingId)),
      relationshipCandidates,
      identityReviewRequests: identityReviewRequests.sort((left, right) => left.requestId.localeCompare(right.requestId)),
      evidence: uniqueById(evidence, "evidenceId").sort((left, right) => left.evidenceId.localeCompare(right.evidenceId)),
      rowCoverage,
      reviewItems: uniqueById(reviewItems, "reviewItemId").sort((left, right) => left.reviewItemId.localeCompare(right.reviewItemId)),
      blockers: uniqueIssues(blockers),
      warnings: uniqueIssues(warnings),
    } satisfies ClassificationProposal;
  }
}

function classifyColumn(input: {
  fileId: string;
  sheet: SheetManifest;
  column: ColumnProfile;
  matches: CanonicalField[];
  topEntities: Set<string>;
  evidence: Evidence[];
  reviewItems: ReviewItem[];
  blockers: PlanIssue[];
}): ColumnMapping {
  const { fileId, sheet, column, matches, topEntities, evidence, reviewItems, blockers } = input;
  const source = {
    fileId,
    sheetId: sheet.sheetId,
    columnId: column.columnId,
    ...(sheet.headerRow !== null
      ? { rowStart: sheet.headerRow + 1, rowEnd: Math.max(sheet.headerRow + 1, sheet.physicalRowCount) }
      : {}),
  };
  const mappingId = deterministicId("mapping", fileId, sheet.sheetId, column.columnId);
  const inferredType = inferType(column);
  const typeEvidenceId = deterministicId("evidence", mappingId, "type");
  evidence.push({
    evidenceId: typeEvidenceId,
    kind: "type_profile",
    sources: [source],
    summary: `Tipo perfilado: ${inferredType}; ${column.dataNonEmptyCount} célula(s) não vazia(s).`,
  });

  if (!column.normalizedHeader) {
    blockers.push({
      code: "MISSING_COLUMN_HEADER",
      sources: [source],
      detail: "Coluna preenchida sem cabeçalho não pode ser classificada automaticamente.",
    });
    return {
      mappingId,
      source,
      inferredType,
      confidenceClass: "blocking",
      evidenceIds: [typeEvidenceId],
      disposition: "unresolved",
      reason: "Cabeçalho ausente.",
    };
  }

  const narrowed = matches.filter((match) => topEntities.has(match.entityId));
  const selected = matches.length === 1 ? matches[0] : narrowed.length === 1 ? narrowed[0] : undefined;
  if (selected) {
    const headerEvidenceId = deterministicId("evidence", mappingId, "header", selected.fieldId);
    evidence.push({
      evidenceId: headerEvidenceId,
      kind: "header_match",
      sources: [source],
      summary: `Cabeçalho compatível com ${selected.fieldId}.`,
    });
    const typeCompatible = isTypeCompatible(inferredType, selected.type);
    const ambiguousFinancial = selected.risk === "financial" && column.ambiguousNumericCount > 0;
    const needsReview =
      !typeCompatible || column.formulaCount > 0 || selected.risk === "protected" || ambiguousFinancial;
    if (ambiguousFinancial) {
      blockers.push({
        code: "AMBIGUOUS_FINANCIAL_NUMBER",
        sources: [source],
        detail: "A coluna financeira contém separador numérico ambíguo e não será interpretada automaticamente.",
      });
    }
    if (needsReview) {
      reviewItems.push({
        reviewItemId: deterministicId("review", mappingId),
        code: ambiguousFinancial
          ? "REVIEW_AMBIGUOUS_FINANCIAL_NUMBER"
          : !typeCompatible
            ? "REVIEW_TYPE_MISMATCH"
            : "REVIEW_PROTECTED_OR_FORMULA_FIELD",
        sources: [source],
        reason: ambiguousFinancial
          ? "O separador pode representar milhar ou casas decimais."
          : !typeCompatible
            ? `Tipo perfilado ${inferredType} difere do tipo canônico ${selected.type}.`
            : "Campo protegido ou derivado por fórmula exige confirmação.",
        actionRequired: "Confirmar o mapeamento e a regra de transformação antes da promoção.",
      });
    }
    return {
      mappingId,
      source,
      inferredType,
      confidenceClass: ambiguousFinancial ? "blocking" : needsReview ? "review_required" : "supported",
      evidenceIds: [headerEvidenceId, typeEvidenceId].sort(),
      disposition: "canonical",
      canonicalFieldId: selected.fieldId,
    };
  }

  if (matches.length > 1) {
    blockers.push({
      code: "AMBIGUOUS_CANONICAL_DESTINATION",
      sources: [source],
      detail: "O cabeçalho é compatível com mais de um destino canônico.",
    });
    return {
      mappingId,
      source,
      inferredType,
      confidenceClass: "blocking",
      evidenceIds: [typeEvidenceId],
      disposition: "unresolved",
      reason: "Mais de um destino canônico é plausível.",
    };
  }

  const proposedType = inferredType === "mixed" ? "text" : inferredType;
  reviewItems.push({
    reviewItemId: deterministicId("review", mappingId),
    code: "APPROVE_CUSTOM_FIELD",
    sources: [source],
    reason: "O cabeçalho não pertence ao núcleo canônico atual.",
    actionRequired: "Aprovar, remapear ou preservar o campo adicional tipado.",
  });
  return {
    mappingId,
    source,
    inferredType,
    confidenceClass: "review_required",
    evidenceIds: [typeEvidenceId],
    disposition: "custom_field_candidate",
    proposedField: {
      name: column.rawHeader,
      type: proposedType,
      category: inferredType === "decimal" ? "financial" : "operational",
      approvalState: "pending",
    },
  };
}

function inferType(column: ColumnProfile): ColumnMapping["inferredType"] {
  const nonFormula = {
    text: column.kindCounts.text,
    integer: column.kindCounts.integer,
    decimal: column.kindCounts.decimal,
    date: column.kindCounts.date,
    boolean: column.kindCounts.boolean,
  };
  if (column.moneyLikeCount > 0 && column.moneyLikeCount === column.dataNonEmptyCount) return "decimal";
  if (column.dateLikeCount > 0 && column.dateLikeCount === column.dataNonEmptyCount) return "date";
  const present = Object.entries(nonFormula)
    .filter(([, count]) => count > 0)
    .map(([kind]) => kind);
  if (present.length === 0) return "text";
  if (present.every((kind) => kind === "integer" || kind === "decimal")) return "decimal";
  return present.length === 1 ? (present[0] as ColumnMapping["inferredType"]) : "mixed";
}

function isTypeCompatible(inferred: ColumnMapping["inferredType"], canonical: CanonicalField["type"]): boolean {
  if (inferred === canonical) return true;
  return inferred === "integer" && canonical === "decimal";
}

function buildSourceGroups(contexts: BlockContext[], evidence: Evidence[]): SourceGroup[] {
  const bySignature = new Map<string, BlockContext[]>();
  for (const context of contexts) {
    const headers = context.sheet.columns
      .filter((column) => column.dataNonEmptyCount > 0)
      .map((column) => column.normalizedHeader)
      .sort()
      .join("|");
    const visibleName = context.sheet.name === "CSV" ? context.fileName.replace(/\.[^.]+$/u, "") : context.sheet.name;
    const family = periodicFamilyName(visibleName);
    const signature = sha256(`${family}\n${headers}`);
    const matching = bySignature.get(signature) ?? [];
    matching.push(context);
    bySignature.set(signature, matching);
  }

  return [...bySignature.entries()]
    .map(([signature, members]) => {
      const sorted = members.sort((left, right) => left.block.blockId.localeCompare(right.block.blockId));
      const evidenceId = deterministicId("evidence", "group", signature);
      evidence.push({
        evidenceId,
        kind: "structure_match",
        sources: sorted.map((member) => ({ fileId: member.fileId, sheetId: member.sheet.sheetId })),
        summary:
          sorted.length > 1
            ? "Fontes possuem a mesma família de nome e estrutura de cabeçalhos."
            : "Fonte organizada como conjunto independente.",
      });
      return {
        groupId: deterministicId("group", signature),
        label: sorted.length > 1 ? "Histórico periódico candidato" : "Fonte individual",
        memberBlockIds: sorted.map((member) => member.block.blockId),
        groupType: sorted.length > 1 ? "periodic_history" as const : "single_source" as const,
        assessment: sorted.length > 1 ? "review_required" as const : "supported" as const,
        evidenceIds: [evidenceId],
      };
    })
    .sort((left, right) => left.groupId.localeCompare(right.groupId));
}

function buildRelationships(
  contexts: BlockContext[],
  evidence: Evidence[],
): ClassificationProposal["relationshipCandidates"] {
  const relationships: ClassificationProposal["relationshipCandidates"] = [];
  for (let leftIndex = 0; leftIndex < contexts.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < contexts.length; rightIndex += 1) {
      const left = contexts[leftIndex];
      const right = contexts[rightIndex];
      if (!left || !right) continue;
      const leftFields = new Set(
        left.mappings
          .filter((mapping): mapping is Extract<ColumnMapping, { disposition: "canonical" }> => mapping.disposition === "canonical")
          .map((mapping) => mapping.canonicalFieldId),
      );
      const shared = right.mappings
        .filter((mapping): mapping is Extract<ColumnMapping, { disposition: "canonical" }> => mapping.disposition === "canonical")
        .map((mapping) => mapping.canonicalFieldId)
        .filter((fieldId) => leftFields.has(fieldId) && (fieldId.endsWith("legacy_id") || fieldId === "person.cpf"))
        .sort();
      if (shared.length === 0) continue;
      const relationshipId = deterministicId("relationship", left.block.blockId, right.block.blockId, shared.join("|"));
      const evidenceId = deterministicId("evidence", relationshipId);
      evidence.push({
        evidenceId,
        kind: "shared_key",
        sources: [
          { fileId: left.fileId, sheetId: left.sheet.sheetId },
          { fileId: right.fileId, sheetId: right.sheet.sheetId },
        ],
        summary: `Campos de chave compartilhados: ${shared.join(", ")}.`,
      });
      relationships.push({
        relationshipId,
        leftBlockId: left.block.blockId,
        rightBlockId: right.block.blockId,
        kind: relationshipKind(left, right),
        assessment: "review_required",
        evidenceIds: [evidenceId],
      });
    }
  }
  return relationships.sort((left, right) => left.relationshipId.localeCompare(right.relationshipId));
}

function relationshipKind(
  left: BlockContext,
  right: BlockContext,
): "shared_key" | "event_to_item" | "event_to_installment" | "related_source" {
  const entities = new Set([...left.entityIds, ...right.entityIds]);
  if (entities.has("event") && entities.has("event_item")) return "event_to_item";
  if (entities.has("event") && entities.has("installment")) return "event_to_installment";
  return "shared_key";
}

function buildRowCoverage(contexts: BlockContext[]): RowCoverage[] {
  const coverage: RowCoverage[] = [];
  for (const context of contexts) {
    const unresolvedColumns = new Set(
      context.mappings
        .filter((mapping) => mapping.disposition === "unresolved")
        .map((mapping) => mapping.source.columnId)
        .filter(isString),
    );
    const start = context.sheet.headerRow === null ? 1 : context.sheet.headerRow + 1;
    const end = context.sheet.physicalRowCount;
    if (end < start) continue;
    let cursor = start;
    for (const row of context.sheet.rows) {
      if (row.rowNumber < start) continue;
      if (cursor < row.rowNumber) {
        pushCoverage(coverage, context, cursor, row.rowNumber - 1, "empty");
      }
      const disposition = row.nonEmptyColumnIds.some((columnId) => unresolvedColumns.has(columnId))
        ? "unresolved"
        : "classified";
      pushCoverage(coverage, context, row.rowNumber, row.rowNumber, disposition);
      cursor = row.rowNumber + 1;
    }
    if (cursor <= end) pushCoverage(coverage, context, cursor, end, "empty");
  }
  return coverage.sort((left, right) =>
    `${left.fileId}:${left.sheetId}:${left.rowStart}`.localeCompare(`${right.fileId}:${right.sheetId}:${right.rowStart}`),
  );
}

function pushCoverage(
  coverage: RowCoverage[],
  context: BlockContext,
  rowStart: number,
  rowEnd: number,
  disposition: RowCoverage["disposition"],
): void {
  const previous = coverage.at(-1);
  if (
    previous &&
    previous.fileId === context.fileId &&
    previous.sheetId === context.sheet.sheetId &&
    previous.disposition === disposition &&
    previous.rowEnd + 1 === rowStart
  ) {
    previous.rowEnd = rowEnd;
    return;
  }
  coverage.push({ fileId: context.fileId, sheetId: context.sheet.sheetId, rowStart, rowEnd, disposition });
}

function addAlertIssue(
  alert: { code: string; severity: "info" | "warning" | "blocking"; source: PlanIssue["sources"][number]; detail: string },
  blockers: PlanIssue[],
  warnings: PlanIssue[],
): void {
  if (alert.severity === "info") return;
  (alert.severity === "blocking" ? blockers : warnings).push({
    code: alert.code,
    sources: [alert.source],
    detail: alert.detail,
  });
}

function uniqueIssues(issues: PlanIssue[]): PlanIssue[] {
  const seen = new Set<string>();
  return issues
    .filter((issue) => {
      const key = `${issue.code}:${JSON.stringify(issue.sources)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => `${left.code}:${JSON.stringify(left.sources)}`.localeCompare(`${right.code}:${JSON.stringify(right.sources)}`));
}

function uniqueById<T extends Record<K, string>, K extends keyof T>(items: T[], key: K): T[] {
  const byId = new Map<string, T>();
  for (const item of items) byId.set(item[key], item);
  return [...byId.values()];
}

function isString(value: string | undefined): value is string {
  return typeof value === "string";
}
