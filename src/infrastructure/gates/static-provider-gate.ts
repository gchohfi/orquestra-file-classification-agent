import { ClassificationError } from "../../domain/errors.js";
import type {
  ApprovedProviderGate,
  ApprovedProviderRegistration,
  ClassificationProviderDescriptor,
} from "../../ports.js";
import { canonicalJson } from "../../shared/hash.js";

export class StaticProviderGate implements ApprovedProviderGate {
  public constructor(private readonly approvals: ReadonlyMap<string, ApprovedProviderRegistration>) {}

  public async assertApproved(
    provider: ClassificationProviderDescriptor,
  ): Promise<ApprovedProviderRegistration> {
    const expected = this.approvals.get(provider.providerId);
    if (
      !expected ||
      canonicalJson(expected.provider) !== canonicalJson(provider)
    ) {
      throw new ClassificationError(
        "AI_PROVIDER_NOT_APPROVED",
        "O provedor não passou pelo gate técnico, jurídico e de privacidade.",
      );
    }
    return expected;
  }
}

export class ClosedProviderGate implements ApprovedProviderGate {
  public async assertApproved(): Promise<never> {
    throw new ClassificationError(
      "AI_PROVIDER_NOT_APPROVED",
      "Nenhum provedor está aprovado para receber dados.",
    );
  }
}
