import { ClassificationError } from "../../domain/errors.js";
import type { ApprovedProviderGate } from "../../ports.js";

export class StaticProviderGate implements ApprovedProviderGate {
  public constructor(private readonly approvals: ReadonlyMap<string, string>) {}

  public async assertApproved(providerId: string, approvalId: string | undefined): Promise<void> {
    const expected = this.approvals.get(providerId);
    if (!expected || !approvalId || expected !== approvalId) {
      throw new ClassificationError(
        "AI_PROVIDER_NOT_APPROVED",
        "O provedor não passou pelo gate técnico, jurídico e de privacidade.",
      );
    }
  }
}

export class ClosedProviderGate implements ApprovedProviderGate {
  public async assertApproved(): Promise<void> {
    throw new ClassificationError(
      "AI_PROVIDER_NOT_APPROVED",
      "Nenhum provedor está aprovado para receber dados.",
    );
  }
}
