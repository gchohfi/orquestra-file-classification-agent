import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { CLASSIFIER_VERSION, DEFAULT_LIMITS, type ClassifierLimits } from "../config.js";
import {
  ClassifyBatchRequestSchema,
  ClassificationResultSchema,
  type CanonicalSchemaCatalog,
  type ClassificationProposal,
  type ClassificationResult,
  type ClassifyBatchRequest,
  type WorkbookManifest,
} from "../domain/contracts.js";
import { ClassificationError, errorCodeOf } from "../domain/errors.js";
import { loadLocalBatch } from "../infrastructure/local-batch-source.js";
import type {
  ApprovedProviderGate,
  ClassificationModel,
  ClassificationRepository,
  StructuredLogger,
} from "../ports.js";
import { sha256 } from "../shared/hash.js";
import { canonicalJson } from "../shared/hash.js";
import { buildManifest } from "./build-manifest.js";
import { enforceDeterministicSafety } from "./enforce-deterministic-safety.js";
import { parseAndBuildPlan } from "./validate-proposal.js";
import { DeterministicClassificationModel } from "../infrastructure/models/deterministic-classification-model.js";

type BatchClassifierDependencies = {
  catalog: CanonicalSchemaCatalog;
  model: ClassificationModel;
  providerGate: ApprovedProviderGate;
  repository: ClassificationRepository;
  logger: StructuredLogger;
  limits?: ClassifierLimits;
};

export class BatchClassifier {
  private readonly inFlight = new Map<string, Promise<ClassificationResult>>();
  private readonly safetyModel = new DeterministicClassificationModel();

  public constructor(private readonly dependencies: BatchClassifierDependencies) {}

  public async classifyDirectory(
    directory: string,
    requestInput: ClassifyBatchRequest,
    signal: AbortSignal = AbortSignal.timeout(30 * 60 * 1000),
  ): Promise<ClassificationResult> {
    const request = ClassifyBatchRequestSchema.parse(requestInput);
    const key = `${request.batchId}:${request.organizationId}:${request.workspaceId}:${sha256(resolve(directory))}`;
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const execution = this.execute(directory, request, signal).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, execution);
    return execution;
  }

  private async execute(
    directory: string,
    request: ClassifyBatchRequest,
    signal: AbortSignal,
  ): Promise<ClassificationResult> {
    let manifest: WorkbookManifest | undefined;
    const correlationId = randomUUID();
    const batchRef = correlationId;
    try {
      signal.throwIfAborted();
      const limits = this.dependencies.limits ?? DEFAULT_LIMITS;
      const localBatch = await loadLocalBatch(directory, limits);
      manifest = await buildManifest(
        request.batchId,
        localBatch.batchSha256,
        localBatch.totalBytes,
        localBatch.files,
        limits,
      );
      this.dependencies.logger.info("classification.manifest_built", {
        batchRef,
        files: manifest.files.length,
        bytes: manifest.totalBytes,
      });

      if (hasBlockingManifestAlert(manifest)) {
        return ClassificationResultSchema.parse({
          status: "blocked",
          manifest,
          plan: null,
          errorCode: "MANIFEST_BLOCKED",
        });
      }
      if (this.dependencies.model.providerId !== this.dependencies.model.provider.providerId) {
        throw new ClassificationError(
          "AI_PROVIDER_NOT_APPROVED",
          "A identidade do adapter diverge da configuração aprovada.",
        );
      }
      const approvedProvider = await this.dependencies.providerGate.assertApproved(
        this.dependencies.model.provider,
      );

      const idempotencyKey = sha256(
        [
          sha256(canonicalJson(manifest)),
          this.dependencies.catalog.catalogVersion,
          CLASSIFIER_VERSION,
          sha256(canonicalJson(this.dependencies.model.provider)),
        ].join("\u001f"),
      );
      let proposal = await this.dependencies.repository.get(idempotencyKey);
      if (!proposal) {
        const deterministicBaseline = await this.safetyModel.classify(
          { manifest, catalog: this.dependencies.catalog },
          signal,
        );
        const rawProposal = await this.dependencies.model.classify(
          {
            manifest,
            catalog: this.dependencies.catalog,
            deterministicBaseline: deterministicBaseline as ClassificationProposal,
          },
          signal,
        );
        const safeProposal = enforceDeterministicSafety(
          rawProposal,
          deterministicBaseline as ClassificationProposal,
          this.dependencies.catalog,
        );
        const built = parseAndBuildPlan(safeProposal, manifest, this.dependencies.catalog, {
          organizationId: request.organizationId,
          workspaceId: request.workspaceId,
          providerId: this.dependencies.model.providerId,
          providerApprovalId: approvedProvider.approvalId,
        });
        proposal = built.proposal;
        await this.dependencies.repository.put(idempotencyKey, proposal);
        proposal = (await this.dependencies.repository.get(idempotencyKey)) ?? proposal;
      }

      const { plan } = parseAndBuildPlan(proposal, manifest, this.dependencies.catalog, {
        organizationId: request.organizationId,
        workspaceId: request.workspaceId,
        providerId: this.dependencies.model.providerId,
        providerApprovalId: approvedProvider.approvalId,
      });
      this.dependencies.logger.info("classification.plan_validated", {
        batchRef,
        status: plan.status,
        blockers: plan.blockers.length,
        reviewItems: plan.reviewItems.length,
      });
      return ClassificationResultSchema.parse(
        plan.status === "blocked"
          ? { status: "blocked", manifest, plan, errorCode: "PLAN_REQUIRES_BLOCKING_REVIEW" }
          : { status: "awaiting_review", manifest, plan },
      );
    } catch (error) {
      const code = errorCodeOf(error);
      this.dependencies.logger.error("classification.failed", {
        batchRef,
        errorCode: code,
        correlationId,
      });
      if (error instanceof ClassificationError && code === "AI_PROVIDER_NOT_APPROVED") {
        return ClassificationResultSchema.parse({ status: "blocked", manifest: manifest ?? null, plan: null, errorCode: code });
      }
      return ClassificationResultSchema.parse({ status: "failed", errorCode: code, correlationId });
    }
  }
}

function hasBlockingManifestAlert(manifest: WorkbookManifest): boolean {
  return manifest.files.some(
    (file) =>
      file.alerts.some((alert) => alert.severity === "blocking") ||
      file.sheets.some((sheet) => sheet.alerts.some((alert) => alert.severity === "blocking")),
  );
}
