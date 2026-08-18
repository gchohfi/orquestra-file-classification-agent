import { ClassificationError } from "../../domain/errors.js";
import { CLASSIFICATION_POLICY_VERSION } from "../../config.js";
import type { ClassificationModel, ClassificationModelInput } from "../../ports.js";

export class DisabledClassificationModel implements ClassificationModel {
  public readonly providerId = "disabled";
  public readonly provider = Object.freeze({
    providerId: this.providerId,
    transport: "disabled" as const,
    endpointOrigin: "disabled://classification",
    model: "disabled",
    reasoningEffort: "disabled",
    store: false,
    background: false,
    promptVersion: "none",
    schemaVersion: "classification-proposal.v1",
    policyVersion: CLASSIFICATION_POLICY_VERSION,
  });

  public async classify(_input: ClassificationModelInput, _signal: AbortSignal): Promise<never> {
    throw new ClassificationError(
      "CLASSIFICATION_MODEL_DISABLED",
      "O adapter de classificação está desabilitado.",
    );
  }
}
