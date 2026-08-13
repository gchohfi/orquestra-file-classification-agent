import type { ClassificationProposal } from "../../domain/contracts.js";
import type { ClassificationRepository } from "../../ports.js";

export class InMemoryClassificationRepository implements ClassificationRepository {
  private readonly proposals = new Map<string, ClassificationProposal>();

  public async get(idempotencyKey: string): Promise<ClassificationProposal | undefined> {
    return this.proposals.get(idempotencyKey);
  }

  public async put(idempotencyKey: string, proposal: ClassificationProposal): Promise<void> {
    if (!this.proposals.has(idempotencyKey)) this.proposals.set(idempotencyKey, proposal);
  }
}
