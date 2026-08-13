import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { CLASSIFIER_VERSION, DEFAULT_LIMITS, type ClassifierLimits } from "../config.js";
import {
  ClassifyBatchRequestSchema,
  ClassificationResultSchema,
  type CanonicalSchemaCatalog,
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
import { parseAndBuildPlan } from "./validate-proposal.js";

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
        batchId: request.batchId,
        files: manifest.files.length,
        bytes: manifest.totalBytes,
      });

      if (manifest.files.some((file) => file.alerts.some((alert) => alert.severity === "blocking"))) {
        return ClassificationResultSchema.parse({
          status: "blocked",
          manifest,
          plan: null,
          errorCode: "MANIFEST_BLOCKED",
        });
      }
      if (request.providerApproval.status !== "approved") {
        return ClassificationResultSchema.parse({
          status: "blocked",
          manifest,
          plan: null,
          errorCode: "AI_PROVIDER_NOT_APPROVED",
        });
      }
      await this.dependencies.providerGate.assertApproved(
        this.dependencies.model.providerId,
        request.providerApproval.approvalId,
      );

      const idempotencyKey = sha256(
        [
          sha256(canonicalJson(manifest)),
          this.dependencies.catalog.catalogVersion,
          CLASSIFIER_VERSION,
          this.dependencies.model.providerId,
        ].join("\u001f"),
      );
      let proposal = await this.dependencies.repository.get(idempotencyKey);
      if (!proposal) {
        const rawProposal = await this.dependencies.model.classify(
          { manifest, catalog: this.dependencies.catalog },
          signal,
        );
        const built = parseAndBuildPlan(rawProposal, manifest, this.dependencies.catalog, {
          organizationId: request.organizationId,
          workspaceId: request.workspaceId,
          providerId: this.dependencies.model.providerId,
          providerApprovalId: request.providerApproval.approvalId!,
        });
        proposal = built.proposal;
        await this.dependencies.repository.put(idempotencyKey, proposal);
        proposal = (await this.dependencies.repository.get(idempotencyKey)) ?? proposal;
      }

      const { plan } = parseAndBuildPlan(proposal, manifest, this.dependencies.catalog, {
        organizationId: request.organizationId,
        workspaceId: request.workspaceId,
        providerId: this.dependencies.model.providerId,
        providerApprovalId: request.providerApproval.approvalId!,
      });
      this.dependencies.logger.info("classification.plan_validated", {
        batchId: request.batchId,
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
        batchId: request.batchId,
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
