import { ClassificationError } from "../../domain/errors.js";
import type { ClassificationModel, ClassificationModelInput } from "../../ports.js";

export class DisabledClassificationModel implements ClassificationModel {
  public readonly providerId = "disabled";

  public async classify(_input: ClassificationModelInput, _signal: AbortSignal): Promise<never> {
    throw new ClassificationError(
      "CLASSIFICATION_MODEL_DISABLED",
      "O adapter de classificação está desabilitado.",
    );
  }
}
