import type {
  CanonicalSchemaCatalog,
  ClassificationProposal,
  WorkbookManifest,
} from "./domain/contracts.js";

export type ClassificationModelInput = {
  manifest: WorkbookManifest;
  catalog: CanonicalSchemaCatalog;
  deterministicBaseline?: ClassificationProposal;
};

export type ClassificationProviderDescriptor = Readonly<{
  providerId: string;
  transport: "local" | "openai_responses" | "disabled";
  endpointOrigin: string;
  model: string;
  reasoningEffort: string;
  store: boolean;
  background: boolean;
  promptVersion: string;
  schemaVersion: string;
  policyVersion: string;
}>;

export interface ClassificationModel {
  readonly providerId: string;
  readonly provider: ClassificationProviderDescriptor;
  classify(input: ClassificationModelInput, signal: AbortSignal): Promise<unknown>;
}

export type ApprovedProviderRegistration = Readonly<{
  approvalId: string;
  provider: ClassificationProviderDescriptor;
}>;

export interface ApprovedProviderGate {
  assertApproved(provider: ClassificationProviderDescriptor): Promise<ApprovedProviderRegistration>;
}

export interface ClassificationRepository {
  get(idempotencyKey: string): Promise<ClassificationProposal | undefined>;
  put(idempotencyKey: string, proposal: ClassificationProposal): Promise<void>;
}

export interface StructuredLogger {
  info(event: string, metadata: Record<string, string | number | boolean>): void;
  error(event: string, metadata: Record<string, string | number | boolean>): void;
}
