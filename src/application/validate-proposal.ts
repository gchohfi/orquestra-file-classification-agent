import { CLASSIFIER_VERSION } from "../config.js";
import {
  ClassificationPlanDraftSchema,
  ClassificationProposalSchema,
  type CanonicalSchemaCatalog,
  type ClassificationPlanDraft,
  type ClassificationProposal,
  type ColumnMapping,
  type RowProfile,
  type SheetManifest,
  type SourceReference,
  type WorkbookManifest,
} from "../domain/contracts.js";
import { ClassificationError } from "../domain/errors.js";
import { canonicalJson, sha256 } from "../shared/hash.js";

type PlanMetadata = {
  organizationId: string;
  workspaceId: string;
  providerId: string;
  providerApprovalId: string;
};

export function parseAndBuildPlan(
  rawProposal: unknown,
  manifest: WorkbookManifest,
  catalog: CanonicalSchemaCatalog,
  metadata: PlanMetadata,
): { proposal: ClassificationProposal; plan: ClassificationPlanDraft } {
  const parsed = ClassificationProposalSchema.safeParse(rawProposal);
  if (!parsed.success) {
    throw new ClassificationError(
      "MODEL_RESPONSE_INVALID",
      "A resposta do classificador não respeita o schema estrito.",
    );
  }
  const proposal = parsed.data;
  const indexes = buildIndexes(manifest);
  validateProposalReferences(proposal, indexes, catalog);
  validateMappingsAndCoverage(proposal, indexes, catalog);
  validateEvidence(proposal, indexes);

  const classifiedCells = proposal.columnMappings
    .filter((mapping) => mapping.disposition !== "unresolved")
    .reduce((total, mapping) => total + indexes.columns.get(mapping.source.columnId ?? "")!.dataNonEmptyCount, 0);
  const unresolvedCells = proposal.columnMappings
    .filter((mapping) => mapping.disposition === "unresolved")
    .reduce((total, mapping) => total + indexes.columns.get(mapping.source.columnId ?? "")!.dataNonEmptyCount, 0);
  const dataNonEmptyCells = manifest.files.reduce(
    (fileTotal, file) =>
      fileTotal + file.sheets.reduce((sheetTotal, sheet) => sheetTotal + sheet.dataNonEmptyCellCount, 0),
    0,
  );
  if (classifiedCells + unresolvedCells !== dataNonEmptyCells) {
    throw semanticError("A cobertura de células não fecha com o manifesto.");
  }

  const coverage = {
    files: manifest.files.length,
    sheets: indexes.sheets.size,
    rows: [...indexes.sheets.values()].reduce((total, sheet) => total + sheet.dataRowCount, 0),
    dataNonEmptyCells,
    classifiedCells,
    unresolvedCells,
  };
  const validations = [
    "manifest_references",
    "catalog_references",
    "cell_coverage",
    "row_coverage",
    "lineage",
    "identity_safety",
  ].map((rule) => ({
    validationId: `validation_${rule}`,
    rule: rule as
      | "manifest_references"
      | "catalog_references"
      | "cell_coverage"
      | "row_coverage"
      | "lineage"
      | "identity_safety",
    passed: true,
    detail: "Validação determinística concluída.",
  }));

  const manifestSha256 = sha256(canonicalJson(manifest));
  const withoutHash = {
    schemaVersion: "classification-plan.v1" as const,
    planVersion: 1 as const,
    classifierVersion: CLASSIFIER_VERSION,
    batchId: manifest.batchId,
    organizationId: metadata.organizationId,
    workspaceId: metadata.workspaceId,
    batchSha256: manifest.batchSha256,
    manifestSha256,
    catalogVersion: catalog.catalogVersion,
    providerId: metadata.providerId,
    providerApprovalId: metadata.providerApprovalId,
    sourceBlocks: proposal.sourceBlocks,
    sourceGroups: proposal.sourceGroups,
    columnMappings: proposal.columnMappings,
    relationshipCandidates: proposal.relationshipCandidates,
    identityReviewRequests: proposal.identityReviewRequests,
    evidence: proposal.evidence,
    rowCoverage: proposal.rowCoverage,
    validations,
    coverage,
    reviewItems: proposal.reviewItems,
    blockers: proposal.blockers,
    warnings: proposal.warnings,
    status: proposal.blockers.length > 0 || unresolvedCells > 0 ? "blocked" as const : "awaiting_review" as const,
  };
  const plan = ClassificationPlanDraftSchema.parse({
    ...withoutHash,
    planSha256: sha256(canonicalJson(withoutHash)),
  });
  return { proposal, plan };
}

type ManifestIndexes = ReturnType<typeof buildIndexes>;

function buildIndexes(manifest: WorkbookManifest) {
  const files = new Map(manifest.files.map((file) => [file.fileId, file]));
  const sheets = new Map<string, SheetManifest>();
  const sheetToFile = new Map<string, string>();
  const columns = new Map<string, SheetManifest["columns"][number]>();
  const columnToSheet = new Map<string, string>();
  for (const file of manifest.files) {
    for (const sheet of file.sheets) {
      if (sheets.has(sheet.sheetId)) throw semanticError("ID de aba duplicado no manifesto.");
      sheets.set(sheet.sheetId, sheet);
      sheetToFile.set(sheet.sheetId, file.fileId);
      for (const column of sheet.columns) {
        if (columns.has(column.columnId)) throw semanticError("ID de coluna duplicado no manifesto.");
        columns.set(column.columnId, column);
        columnToSheet.set(column.columnId, sheet.sheetId);
      }
    }
  }
  return { files, sheets, sheetToFile, columns, columnToSheet };
}

function validateProposalReferences(
  proposal: ClassificationProposal,
  indexes: ManifestIndexes,
  catalog: CanonicalSchemaCatalog,
): void {
  assertUnique(proposal.sourceBlocks.map((block) => block.blockId), "bloco");
  assertUnique(proposal.columnMappings.map((mapping) => mapping.mappingId), "mapeamento");
  assertUnique(proposal.sourceGroups.map((group) => group.groupId), "grupo");
  assertUnique(proposal.relationshipCandidates.map((relation) => relation.relationshipId), "relação");
  assertUnique(proposal.evidence.map((item) => item.evidenceId), "evidência");
  assertUnique(proposal.reviewItems.map((item) => item.reviewItemId), "item de revisão");

  const blockIds = new Set(proposal.sourceBlocks.map((block) => block.blockId));
  const entityIds = new Set(catalog.entities.map((entity) => entity.entityId));
  const fieldIds = new Set(catalog.fields.map((field) => field.fieldId));

  for (const block of proposal.sourceBlocks) {
    const sheet = indexes.sheets.get(block.sheetId);
    if (!sheet || indexes.sheetToFile.get(block.sheetId) !== block.fileId) {
      throw semanticError("Bloco referencia arquivo ou aba inexistente.");
    }
    const expectedStart = sheet.headerRow === null ? 1 : sheet.headerRow + 1;
    const expectedEnd = Math.max(expectedStart, sheet.physicalRowCount);
    if (block.rowRange.start !== expectedStart || block.rowRange.end !== expectedEnd) {
      throw semanticError("Intervalo do bloco diverge das linhas inventariadas.");
    }
    for (const columnId of block.columnIds) {
      if (indexes.columnToSheet.get(columnId) !== block.sheetId) {
        throw semanticError("Bloco referencia coluna fora da aba declarada.");
      }
    }
    for (const candidate of block.entityCandidates) {
      if (!entityIds.has(candidate.entityId)) throw semanticError("Candidato referencia entidade inexistente.");
    }
  }
  if (blockIds.size !== indexes.sheets.size) {
    throw semanticError("Cada aba deve possuir exatamente um bloco nesta versão.");
  }

  const groupedBlockIds: string[] = [];
  for (const group of proposal.sourceGroups) {
    for (const blockId of group.memberBlockIds) {
      if (!blockIds.has(blockId)) throw semanticError("Grupo referencia bloco inexistente.");
      groupedBlockIds.push(blockId);
    }
  }
  assertUnique(groupedBlockIds, "bloco agrupado");
  if (groupedBlockIds.length !== blockIds.size) {
    throw semanticError("Todo bloco deve pertencer a exatamente um grupo.");
  }

  for (const relation of proposal.relationshipCandidates) {
    if (!blockIds.has(relation.leftBlockId) || !blockIds.has(relation.rightBlockId)) {
      throw semanticError("Relação referencia bloco inexistente.");
    }
    if (relation.leftBlockId === relation.rightBlockId) {
      throw semanticError("Relação não pode ligar um bloco a ele mesmo.");
    }
  }
  for (const mapping of proposal.columnMappings) {
    assertSourceExists(mapping.source, indexes);
    if (mapping.disposition === "canonical" && !fieldIds.has(mapping.canonicalFieldId)) {
      throw semanticError("Mapeamento referencia campo canônico inexistente.");
    }
    const sheet = indexes.sheets.get(mapping.source.sheetId ?? "");
    if (!sheet || sheet.headerRow === null) throw semanticError("Mapeamento sem aba de dados válida.");
    const expectedStart = sheet.headerRow + 1;
    const expectedEnd = Math.max(expectedStart, sheet.physicalRowCount);
    if (mapping.source.rowStart !== expectedStart || mapping.source.rowEnd !== expectedEnd) {
      throw semanticError("Linhagem do mapeamento não cobre o intervalo de origem completo.");
    }
  }
  for (const request of proposal.identityReviewRequests) {
    if (!blockIds.has(request.blockId)) throw semanticError("Revisão de identidade referencia bloco inexistente.");
    if (!indexes.columns.has(request.nameColumnId)) throw semanticError("Revisão de identidade referencia coluna inexistente.");
    for (const columnId of request.strongIdentifierColumnIds) {
      if (!indexes.columns.has(columnId)) throw semanticError("Identificador forte referencia coluna inexistente.");
    }
  }
}

function validateMappingsAndCoverage(
  proposal: ClassificationProposal,
  indexes: ManifestIndexes,
  catalog: CanonicalSchemaCatalog,
): void {
  const mappingsByColumn = new Map<string, ColumnMapping[]>();
  for (const mapping of proposal.columnMappings) {
    const columnId = mapping.source.columnId;
    if (!columnId) throw semanticError("Mapeamento sem coluna de origem.");
    const matching = mappingsByColumn.get(columnId) ?? [];
    matching.push(mapping);
    mappingsByColumn.set(columnId, matching);
  }

  for (const [columnId, column] of indexes.columns) {
    const expected = column.dataNonEmptyCount > 0 ? 1 : 0;
    const actual = mappingsByColumn.get(columnId)?.length ?? 0;
    if (actual !== expected) {
      throw semanticError("Cada coluna preenchida deve possuir exatamente um destino ou bloqueio.");
    }
  }

  const blockBySheet = new Map(proposal.sourceBlocks.map((block) => [block.sheetId, block]));
  for (const [sheetId, sheet] of indexes.sheets) {
    const block = blockBySheet.get(sheetId);
    if (!block) throw semanticError("Aba sem bloco classificatório.");
    const sheetMappings = proposal.columnMappings.filter((mapping) => mapping.source.sheetId === sheetId);
    const expectedColumnIds = sheet.columns
      .filter((column) => column.dataNonEmptyCount > 0)
      .map((column) => column.columnId)
      .sort();
    if (JSON.stringify(block.columnIds) !== JSON.stringify(expectedColumnIds)) {
      throw semanticError("As colunas do bloco não fecham com o manifesto.");
    }
    const expectedDisposition =
      sheet.dataRowCount === 0
        ? "empty"
        : sheetMappings.some((mapping) => mapping.disposition === "unresolved")
          ? "unresolved"
          : "classified";
    if (block.disposition !== expectedDisposition) {
      throw semanticError("Disposição do bloco diverge dos mapeamentos.");
    }
  }

  const expectedCoverage = expectedRowCoverage(indexes, proposal.columnMappings);
  if (JSON.stringify(proposal.rowCoverage) !== JSON.stringify(expectedCoverage)) {
    throw semanticError("Cobertura de linhas incompleta, sobreposta ou incompatível.");
  }

  const strongFieldIds = new Set(
    catalog.fields.filter((field) => field.strongIdentitySignal).map((field) => field.fieldId),
  );
  for (const request of proposal.identityReviewRequests) {
    const block = proposal.sourceBlocks.find((candidate) => candidate.blockId === request.blockId);
    if (!block) throw semanticError("Revisão de identidade sem bloco.");
    const blockMappings = proposal.columnMappings.filter((mapping) => mapping.source.sheetId === block.sheetId);
    const nameMapping = blockMappings.find(
      (mapping) => mapping.disposition === "canonical" && mapping.canonicalFieldId === "person.full_name",
    );
    if (!nameMapping || nameMapping.source.columnId !== request.nameColumnId) {
      throw semanticError("Revisão de identidade não aponta para o nome canônico.");
    }
    const actualStrong = blockMappings
      .filter(
        (mapping): mapping is Extract<ColumnMapping, { disposition: "canonical" }> =>
          mapping.disposition === "canonical" && strongFieldIds.has(mapping.canonicalFieldId),
      )
      .map((mapping) => mapping.source.columnId)
      .filter((value): value is string => typeof value === "string");
    if (actualStrong.length > 0 && request.strongIdentifierColumnIds.length === 0) {
      throw semanticError("Fonte com identificador forte não pode omitir a evidência existente.");
    }
    const nameColumnId = nameMapping.source.columnId!;
    const sheet = indexes.sheets.get(block.sheetId)!;
    const rowsWithName = sheet.rows.filter((row) => row.nonEmptyColumnIds.includes(nameColumnId));
    const strongColumns = actualStrong
      .map((columnId) => indexes.columns.get(columnId))
      .filter((column): column is NonNullable<typeof column> => column !== undefined);
    const missingStrong = rowsWithName.filter((row) =>
      actualStrong.every((columnId) => !row.nonEmptyColumnIds.includes(columnId)),
    ).length;
    const invalidStrong = strongColumns.reduce((total, column) => total + column.strongIdentityInvalidCount, 0);
    const expectedAffected = actualStrong.length === 0
      ? rowsWithName.length
      : Math.min(rowsWithName.length, missingStrong + invalidStrong);
    if (request.rowsWithoutStrongIdentity !== expectedAffected) {
      throw semanticError("Contagem de identidades provisórias diverge da cobertura linha a linha.");
    }
  }
}

function validateEvidence(proposal: ClassificationProposal, indexes: ManifestIndexes): void {
  const evidenceIds = new Set(proposal.evidence.map((evidence) => evidence.evidenceId));
  for (const evidence of proposal.evidence) {
    for (const source of evidence.sources) assertSourceExists(source, indexes);
  }
  const references = [
    ...proposal.columnMappings.flatMap((mapping) => mapping.evidenceIds),
    ...proposal.sourceBlocks.flatMap((block) => block.entityCandidates.flatMap((candidate) => candidate.evidenceIds)),
    ...proposal.sourceGroups.flatMap((group) => group.evidenceIds),
    ...proposal.relationshipCandidates.flatMap((relation) => relation.evidenceIds),
  ];
  if (references.some((evidenceId) => !evidenceIds.has(evidenceId))) {
    throw semanticError("Plano referencia evidência inexistente.");
  }
  for (const review of proposal.reviewItems) {
    for (const source of review.sources) assertSourceExists(source, indexes);
  }
  for (const issue of [...proposal.blockers, ...proposal.warnings]) {
    for (const source of issue.sources) assertSourceExists(source, indexes);
  }
}

function expectedRowCoverage(indexes: ManifestIndexes, mappings: ColumnMapping[]) {
  const result: ClassificationProposal["rowCoverage"] = [];
  for (const [sheetId, sheet] of [...indexes.sheets.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const fileId = indexes.sheetToFile.get(sheetId)!;
    const start = sheet.headerRow === null ? 1 : sheet.headerRow + 1;
    const end = sheet.physicalRowCount;
    if (end < start) continue;
    const unresolvedColumns = new Set(
      mappings
        .filter((mapping) => mapping.source.sheetId === sheetId && mapping.disposition === "unresolved")
        .map((mapping) => mapping.source.columnId),
    );
    const rows = new Map(sheet.rows.map((row) => [row.rowNumber, row]));
    let current: ClassificationProposal["rowCoverage"][number] | undefined;
    for (let rowNumber = start; rowNumber <= end; rowNumber += 1) {
      const row = rows.get(rowNumber);
      const disposition = row ? rowDisposition(row, unresolvedColumns) : "empty";
      if (current && current.disposition === disposition && current.rowEnd + 1 === rowNumber) {
        current.rowEnd = rowNumber;
      } else {
        current = { fileId, sheetId, rowStart: rowNumber, rowEnd: rowNumber, disposition };
        result.push(current);
      }
    }
  }
  return result.sort((left, right) =>
    `${left.fileId}:${left.sheetId}:${left.rowStart}`.localeCompare(`${right.fileId}:${right.sheetId}:${right.rowStart}`),
  );
}

function rowDisposition(
  row: RowProfile,
  unresolvedColumns: Set<string | undefined>,
): "classified" | "unresolved" {
  return row.nonEmptyColumnIds.some((columnId) => unresolvedColumns.has(columnId)) ? "unresolved" : "classified";
}

function assertSourceExists(source: SourceReference, indexes: ManifestIndexes): void {
  if (!indexes.files.has(source.fileId)) throw semanticError("Referência aponta para arquivo inexistente.");
  if (source.sheetId) {
    if (!indexes.sheets.has(source.sheetId) || indexes.sheetToFile.get(source.sheetId) !== source.fileId) {
      throw semanticError("Referência aponta para aba inexistente ou de outro arquivo.");
    }
  }
  if (source.columnId) {
    if (!indexes.columns.has(source.columnId) || indexes.columnToSheet.get(source.columnId) !== source.sheetId) {
      throw semanticError("Referência aponta para coluna inexistente ou de outra aba.");
    }
  }
  if (source.rowStart !== undefined && source.rowEnd !== undefined && source.sheetId) {
    const sheet = indexes.sheets.get(source.sheetId)!;
    if (source.rowEnd > Math.max(sheet.physicalRowCount, source.rowStart)) {
      throw semanticError("Referência de linha excede a origem.");
    }
  }
}

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) throw semanticError(`ID de ${label} duplicado.`);
}

function semanticError(detail: string): ClassificationError {
  return new ClassificationError("MODEL_SEMANTIC_INVALID", detail, "A proposta possui referências ou cobertura inválidas.");
}
