import type {
  CanonicalSchemaCatalog,
  ClassificationProposal,
  WorkbookManifest,
} from "./domain/contracts.js";

export type ClassificationModelInput = {
  manifest: WorkbookManifest;
  catalog: CanonicalSchemaCatalog;
};

export interface ClassificationModel {
  readonly providerId: string;
  classify(input: ClassificationModelInput, signal: AbortSignal): Promise<unknown>;
}

export interface ApprovedProviderGate {
  assertApproved(providerId: string, approvalId: string | undefined): Promise<void>;
}

export interface ClassificationRepository {
  get(idempotencyKey: string): Promise<ClassificationProposal | undefined>;
  put(idempotencyKey: string, proposal: ClassificationProposal): Promise<void>;
}

export interface StructuredLogger {
  info(event: string, metadata: Record<string, string | number | boolean>): void;
  error(event: string, metadata: Record<string, string | number | boolean>): void;
}
