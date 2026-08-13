#!/usr/bin/env node
import { resolve } from "node:path";
import { BatchClassifier } from "./application/classify-batch.js";
import { clinicCanonicalCatalog } from "./domain/catalog.js";
import { StaticProviderGate } from "./infrastructure/gates/static-provider-gate.js";
import { NullLogger } from "./infrastructure/logging/null-logger.js";
import { DeterministicClassificationModel } from "./infrastructure/models/deterministic-classification-model.js";
import { InMemoryClassificationRepository } from "./infrastructure/repositories/in-memory-classification-repository.js";

const LOCAL_APPROVAL = "local-development-no-external-transfer";

async function main(): Promise<void> {
  const [directoryArg, ...rest] = process.argv.slice(2);
  if (!directoryArg) {
    process.stderr.write(
      "Uso: npm run classify -- <pasta> --organization <id> --workspace <id> [--batch <id>]\n",
    );
    process.exitCode = 2;
    return;
  }
  const options = parseOptions(rest);
  const organizationId = options.get("organization");
  const workspaceId = options.get("workspace");
  if (!organizationId || !workspaceId) {
    process.stderr.write("Informe --organization e --workspace.\n");
    process.exitCode = 2;
    return;
  }

  const model = new DeterministicClassificationModel();
  const classifier = new BatchClassifier({
    catalog: clinicCanonicalCatalog,
    model,
    providerGate: new StaticProviderGate(new Map([[model.providerId, LOCAL_APPROVAL]])),
    repository: new InMemoryClassificationRepository(),
    logger: new NullLogger(),
  });
  const result = await classifier.classifyDirectory(resolve(directoryArg), {
    batchId: options.get("batch") ?? "batch_local",
    organizationId,
    workspaceId,
    actor: { userId: "local_admin", role: "organization_admin" },
    providerApproval: { status: "approved", approvalId: LOCAL_APPROVAL },
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status === "failed") process.exitCode = 1;
}

function parseOptions(args: string[]): Map<string, string> {
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith("--") || !value) {
      throw new Error("Opções devem usar o formato --nome valor.");
    }
    options.set(flag.slice(2), value);
  }
  return options;
}

await main();
