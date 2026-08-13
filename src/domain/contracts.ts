import { z } from "zod";

export const FileKindSchema = z.enum(["csv", "xlsx"]);
export type FileKind = z.infer<typeof FileKindSchema>;

export const AlertSeveritySchema = z.enum(["info", "warning", "blocking"]);
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;

export const SourceReferenceSchema = z
  .object({
    fileId: z.string().min(1),
    sheetId: z.string().min(1).nullable().optional(),
    columnId: z.string().min(1).nullable().optional(),
    rowStart: z.number().int().positive().nullable().optional(),
    rowEnd: z.number().int().positive().nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const hasRowStart = value.rowStart !== undefined && value.rowStart !== null;
    const hasRowEnd = value.rowEnd !== undefined && value.rowEnd !== null;
    if (hasRowStart !== hasRowEnd) {
      context.addIssue({
        code: "custom",
        message: "rowStart e rowEnd devem aparecer juntos",
      });
    }
    if (value.rowStart != null && value.rowEnd != null && value.rowStart > value.rowEnd) {
      context.addIssue({
        code: "custom",
        message: "rowStart não pode ser maior que rowEnd",
      });
    }
  });
export type SourceReference = z.infer<typeof SourceReferenceSchema>;

export const SourceAlertSchema = z
  .object({
    code: z.string().min(1),
    severity: AlertSeveritySchema,
    source: SourceReferenceSchema,
    detail: z.string().min(1).max(1_000),
  })
  .strict();
export type SourceAlert = z.infer<typeof SourceAlertSchema>;

export const CellKindSchema = z.enum([
  "text",
  "integer",
  "decimal",
  "date",
  "boolean",
  "formula",
  "error",
]);
export type CellKind = z.infer<typeof CellKindSchema>;

const KindCountsSchema = z
  .object({
    text: z.number().int().nonnegative(),
    integer: z.number().int().nonnegative(),
    decimal: z.number().int().nonnegative(),
    date: z.number().int().nonnegative(),
    boolean: z.number().int().nonnegative(),
    formula: z.number().int().nonnegative(),
    error: z.number().int().nonnegative(),
  })
  .strict();

export const ColumnProfileSchema = z
  .object({
    columnId: z.string().min(1),
    index: z.number().int().positive(),
    rawHeader: z.string(),
    normalizedHeader: z.string(),
    dataNonEmptyCount: z.number().int().nonnegative(),
    kindCounts: KindCountsSchema,
    formulaCount: z.number().int().nonnegative(),
    externalLinkCount: z.number().int().nonnegative(),
    instructionLikeCount: z.number().int().nonnegative(),
    moneyLikeCount: z.number().int().nonnegative(),
    ambiguousNumericCount: z.number().int().nonnegative(),
    dateLikeCount: z.number().int().nonnegative(),
    strongIdentityValueCount: z.number().int().nonnegative(),
    strongIdentityInvalidCount: z.number().int().nonnegative(),
  })
  .strict();
export type ColumnProfile = z.infer<typeof ColumnProfileSchema>;

export const RowProfileSchema = z
  .object({
    rowNumber: z.number().int().positive(),
    nonEmptyColumnIds: z.array(z.string().min(1)),
    hasFormula: z.boolean(),
    hasInstructionLikeContent: z.boolean(),
  })
  .strict();
export type RowProfile = z.infer<typeof RowProfileSchema>;

export const SheetManifestSchema = z
  .object({
    sheetId: z.string().min(1),
    name: z.string().min(1),
    state: z.enum(["visible", "hidden", "veryHidden"]),
    headerRow: z.number().int().positive().nullable(),
    physicalRowCount: z.number().int().nonnegative(),
    dataRowCount: z.number().int().nonnegative(),
    columnCount: z.number().int().nonnegative(),
    dataNonEmptyCellCount: z.number().int().nonnegative(),
    columns: z.array(ColumnProfileSchema),
    rows: z.array(RowProfileSchema),
    alerts: z.array(SourceAlertSchema),
  })
  .strict();
export type SheetManifest = z.infer<typeof SheetManifestSchema>;

export const FileManifestSchema = z
  .object({
    fileId: z.string().min(1),
    originalName: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    bytes: z.number().int().nonnegative(),
    kind: FileKindSchema,
    sheets: z.array(SheetManifestSchema),
    alerts: z.array(SourceAlertSchema),
  })
  .strict();
export type FileManifest = z.infer<typeof FileManifestSchema>;

export const WorkbookManifestSchema = z
  .object({
    schemaVersion: z.literal("workbook-manifest.v1"),
    batchId: z.string().min(1),
    batchSha256: z.string().regex(/^[a-f0-9]{64}$/),
    totalBytes: z.number().int().nonnegative().max(100 * 1024 * 1024),
    files: z.array(FileManifestSchema).min(1),
  })
  .strict();
export type WorkbookManifest = z.infer<typeof WorkbookManifestSchema>;

export const CanonicalFieldSchema = z
  .object({
    fieldId: z.string().min(1),
    entityId: z.string().min(1),
    label: z.string().min(1),
    type: z.enum(["text", "integer", "decimal", "date", "boolean"]),
    risk: z.enum(["descriptive", "identity", "financial", "protected"]),
    acceptedHeaders: z.array(z.string().min(1)).min(1),
    strongIdentitySignal: z.boolean().default(false),
  })
  .strict();

export const CanonicalEntitySchema = z
  .object({
    entityId: z.string().min(1),
    label: z.string().min(1),
    grain: z.enum([
      "person",
      "professional",
      "catalog_item",
      "event",
      "item",
      "installment",
      "allocation",
      "organization",
    ]),
  })
  .strict();

export const CanonicalSchemaCatalogSchema = z
  .object({
    schemaVersion: z.literal("canonical-schema-catalog.v1"),
    catalogVersion: z.string().min(1),
    entities: z.array(CanonicalEntitySchema).min(1),
    fields: z.array(CanonicalFieldSchema).min(1),
  })
  .strict();
export type CanonicalSchemaCatalog = z.infer<typeof CanonicalSchemaCatalogSchema>;

export const EvidenceSchema = z
  .object({
    evidenceId: z.string().min(1),
    kind: z.enum([
      "header_match",
      "type_profile",
      "structure_match",
      "shared_key",
      "risk_signal",
    ]),
    sources: z.array(SourceReferenceSchema).min(1),
    summary: z.string().min(1).max(500),
  })
  .strict();

export const EntityCandidateSchema = z
  .object({
    entityId: z.string().min(1),
    grain: CanonicalEntitySchema.shape.grain,
    assessment: z.enum(["supported", "review_required", "blocking"]),
    evidenceIds: z.array(z.string().min(1)).min(1),
    explanation: z.string().min(1).max(500),
  })
  .strict();

export const SourceBlockSchema = z
  .object({
    blockId: z.string().min(1),
    fileId: z.string().min(1),
    sheetId: z.string().min(1),
    rowRange: z
      .object({
        start: z.number().int().positive(),
        end: z.number().int().positive(),
      })
      .strict(),
    columnIds: z.array(z.string().min(1)),
    disposition: z.enum(["classified", "unresolved", "empty", "unsupported"]),
    entityCandidates: z.array(EntityCandidateSchema),
  })
  .strict();

const BaseColumnMappingSchema = z.object({
  mappingId: z.string().min(1),
  source: SourceReferenceSchema,
  inferredType: z.enum(["text", "integer", "decimal", "date", "boolean", "mixed"]),
  confidenceClass: z.enum(["supported", "review_required", "blocking"]),
  evidenceIds: z.array(z.string().min(1)).min(1),
});

export const ColumnMappingSchema = z.discriminatedUnion("disposition", [
  BaseColumnMappingSchema.extend({
    disposition: z.literal("canonical"),
    canonicalFieldId: z.string().min(1),
  }).strict(),
  BaseColumnMappingSchema.extend({
    disposition: z.literal("custom_field_candidate"),
    proposedField: z
      .object({
        name: z.string().min(1).max(120),
        type: z.enum(["text", "integer", "decimal", "date", "boolean"]),
        category: z.enum(["administrative", "commercial", "financial", "operational"]),
        approvalState: z.literal("pending"),
      })
      .strict(),
  }).strict(),
  BaseColumnMappingSchema.extend({
    disposition: z.literal("preserved"),
    reason: z.string().min(1).max(500),
  }).strict(),
  BaseColumnMappingSchema.extend({
    disposition: z.literal("unresolved"),
    reason: z.string().min(1).max(500),
  }).strict(),
]);
export type ColumnMapping = z.infer<typeof ColumnMappingSchema>;

export const SourceGroupSchema = z
  .object({
    groupId: z.string().min(1),
    label: z.string().min(1).max(120),
    memberBlockIds: z.array(z.string().min(1)).min(1),
    groupType: z.enum(["single_source", "periodic_history", "related_sources"]),
    assessment: z.enum(["supported", "review_required"]),
    evidenceIds: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const RelationshipCandidateSchema = z
  .object({
    relationshipId: z.string().min(1),
    leftBlockId: z.string().min(1),
    rightBlockId: z.string().min(1),
    kind: z.enum(["shared_key", "event_to_item", "event_to_installment", "related_source"]),
    assessment: z.enum(["supported", "review_required"]),
    evidenceIds: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const IdentityReviewRequestSchema = z
  .object({
    requestId: z.string().min(1),
    blockId: z.string().min(1),
    nameColumnId: z.string().min(1),
    strongIdentifierColumnIds: z.array(z.string().min(1)),
    rowsWithoutStrongIdentity: z.number().int().nonnegative(),
    disposition: z.literal("keep_provisional"),
    reason: z.literal("name_only_is_not_identity_evidence"),
  })
  .strict();

export const RowCoverageSchema = z
  .object({
    fileId: z.string().min(1),
    sheetId: z.string().min(1),
    rowStart: z.number().int().positive(),
    rowEnd: z.number().int().positive(),
    disposition: z.enum(["classified", "unresolved", "empty"]),
  })
  .strict();

export const ValidationResultSchema = z
  .object({
    validationId: z.string().min(1),
    rule: z.enum([
      "manifest_references",
      "catalog_references",
      "cell_coverage",
      "row_coverage",
      "lineage",
      "identity_safety",
    ]),
    passed: z.boolean(),
    detail: z.string().min(1),
  })
  .strict();

export const ReviewItemSchema = z
  .object({
    reviewItemId: z.string().min(1),
    code: z.string().min(1),
    sources: z.array(SourceReferenceSchema).min(1),
    reason: z.string().min(1).max(500),
    actionRequired: z.string().min(1).max(500),
  })
  .strict();

export const PlanIssueSchema = z
  .object({
    code: z.string().min(1),
    sources: z.array(SourceReferenceSchema).min(1),
    detail: z.string().min(1).max(1_000),
  })
  .strict();

export const ClassificationProposalSchema = z
  .object({
    proposalVersion: z.literal("classification-proposal.v1"),
    sourceBlocks: z.array(SourceBlockSchema),
    sourceGroups: z.array(SourceGroupSchema),
    columnMappings: z.array(ColumnMappingSchema),
    relationshipCandidates: z.array(RelationshipCandidateSchema),
    identityReviewRequests: z.array(IdentityReviewRequestSchema),
    evidence: z.array(EvidenceSchema),
    rowCoverage: z.array(RowCoverageSchema),
    reviewItems: z.array(ReviewItemSchema),
    blockers: z.array(PlanIssueSchema),
    warnings: z.array(PlanIssueSchema),
  })
  .strict();
export type ClassificationProposal = z.infer<typeof ClassificationProposalSchema>;

export const PlanDraftWithoutHashSchema = z
  .object({
    schemaVersion: z.literal("classification-plan.v1"),
    planVersion: z.literal(1),
    classifierVersion: z.string().min(1),
    batchId: z.string().min(1),
    organizationId: z.string().min(1),
    workspaceId: z.string().min(1),
    batchSha256: z.string().regex(/^[a-f0-9]{64}$/),
    manifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
    catalogVersion: z.string().min(1),
    providerId: z.string().min(1),
    providerApprovalId: z.string().min(1),
    sourceBlocks: z.array(SourceBlockSchema),
    sourceGroups: z.array(SourceGroupSchema),
    columnMappings: z.array(ColumnMappingSchema),
    relationshipCandidates: z.array(RelationshipCandidateSchema),
    identityReviewRequests: z.array(IdentityReviewRequestSchema),
    evidence: z.array(EvidenceSchema),
    rowCoverage: z.array(RowCoverageSchema),
    validations: z.array(ValidationResultSchema),
    coverage: z
      .object({
        files: z.number().int().nonnegative(),
        sheets: z.number().int().nonnegative(),
        rows: z.number().int().nonnegative(),
        dataNonEmptyCells: z.number().int().nonnegative(),
        classifiedCells: z.number().int().nonnegative(),
        unresolvedCells: z.number().int().nonnegative(),
      })
      .strict(),
    reviewItems: z.array(ReviewItemSchema),
    blockers: z.array(PlanIssueSchema),
    warnings: z.array(PlanIssueSchema),
    status: z.enum(["awaiting_review", "blocked"]),
  })
  .strict();

export const ClassificationPlanDraftSchema = PlanDraftWithoutHashSchema.extend({
  planSha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type ClassificationPlanDraft = z.infer<typeof ClassificationPlanDraftSchema>;

export const ClassificationResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("awaiting_review"),
      manifest: WorkbookManifestSchema,
      plan: ClassificationPlanDraftSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("blocked"),
      manifest: WorkbookManifestSchema.nullable(),
      plan: ClassificationPlanDraftSchema.nullable(),
      errorCode: z.string().min(1),
    })
    .strict(),
  z
    .object({
      status: z.literal("failed"),
      errorCode: z.string().min(1),
      correlationId: z.string().min(1),
    })
    .strict(),
]);
export type ClassificationResult = z.infer<typeof ClassificationResultSchema>;

export const ClassifyBatchRequestSchema = z
  .object({
    batchId: z.string().min(1),
    organizationId: z.string().min(1),
    workspaceId: z.string().min(1),
    actor: z
      .object({
        userId: z.string().min(1),
        role: z.literal("organization_admin"),
      })
      .strict(),
  })
  .strict();
export type ClassifyBatchRequest = z.infer<typeof ClassifyBatchRequestSchema>;
