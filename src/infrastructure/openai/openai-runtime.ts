import {
  OPENAI_CLASSIFIER_ENDPOINT_ORIGIN,
  OPENAI_CLASSIFIER_MODEL,
  OPENAI_CLASSIFIER_REASONING_EFFORT,
} from "../../config.js";
import { ClassificationError } from "../../domain/errors.js";
import { StaticProviderGate } from "../gates/static-provider-gate.js";
import {
  OpenAIClassificationModel,
} from "../models/openai-classification-model.js";

export type OpenAIClassificationRuntime = Readonly<{
  model: OpenAIClassificationModel;
  providerGate: StaticProviderGate;
}>;

/**
 * Creates the server-side runtime only when every external-transfer gate is
 * explicitly open. Model, endpoint and reasoning level are immutable in code.
 */
export function createOpenAIClassificationRuntime(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): OpenAIClassificationRuntime {
  assertExactWhenPresent(environment.AI_PROVIDER, "openai");
  assertExactWhenPresent(environment.OPENAI_MODEL, OPENAI_CLASSIFIER_MODEL);
  assertExactWhenPresent(
    environment.OPENAI_REASONING_EFFORT,
    OPENAI_CLASSIFIER_REASONING_EFFORT,
  );
  assertExactWhenPresent(
    environment.OPENAI_API_BASE_URL,
    `${OPENAI_CLASSIFIER_ENDPOINT_ORIGIN}/v1`,
  );

  if (
    environment.OPENAI_API_ENABLED !== "true" ||
    environment.AI_PROVIDER_GATE_STATUS !== "approved"
  ) {
    throw new ClassificationError(
      "AI_PROVIDER_NOT_APPROVED",
      "O uso da API externa permanece desabilitado ou sem aprovação.",
    );
  }

  const apiKey = environment.OPENAI_API_KEY?.trim();
  const approvalId = environment.AI_PROVIDER_APPROVAL_ID?.trim();
  if (!apiKey || !approvalId) {
    throw new ClassificationError(
      "OPENAI_CONFIGURATION_INVALID",
      "A configuração server-side aprovada está incompleta.",
    );
  }

  const model = OpenAIClassificationModel.create(apiKey);
  const providerGate = new StaticProviderGate(
    new Map([
      [
        model.providerId,
        {
          approvalId,
          provider: model.provider,
        },
      ],
    ]),
  );
  return {
    model,
    providerGate,
  };
}

function assertExactWhenPresent(actual: string | undefined, expected: string): void {
  if (actual !== undefined && actual !== expected) {
    throw new ClassificationError(
      "OPENAI_CONFIGURATION_INVALID",
      "Uma configuração tentou alterar o provedor, modelo, endpoint ou nível de raciocínio aprovado.",
    );
  }
}
