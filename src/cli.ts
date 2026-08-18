#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { resolve } from "node:path";
import { BatchClassifier } from "./application/classify-batch.js";
import { clinicCanonicalCatalog } from "./domain/catalog.js";
import { StaticProviderGate } from "./infrastructure/gates/static-provider-gate.js";
import { NullLogger } from "./infrastructure/logging/null-logger.js";
import { DeterministicClassificationModel } from "./infrastructure/models/deterministic-classification-model.js";
import { InMemoryClassificationRepository } from "./infrastructure/repositories/in-memory-classification-repository.js";
import { createOpenAIClassificationRuntime } from "./infrastructure/openai/openai-runtime.js";
import type { ApprovedProviderGate, ClassificationModel } from "./ports.js";
import { writeClassificationHtmlReport } from "./reporting/html-classification-report.js";

const LOCAL_APPROVAL = "local-development-no-external-transfer";

async function main(): Promise<void> {
  const environment = loadLocalEnvironment();
  const [directoryArg, ...rest] = process.argv.slice(2);
  if (!directoryArg) {
    process.stderr.write(
      "Uso: npm run classify -- <pasta> --organization <id> --workspace <id> [--batch <id>] [--provider deterministic|openai] [--report-html <arquivo>]\n",
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

  const provider = options.get("provider") ?? "deterministic";
  const runtime = buildRuntime(provider, environment);
  const classifier = new BatchClassifier({
    catalog: clinicCanonicalCatalog,
    model: runtime.model,
    providerGate: runtime.providerGate,
    repository: new InMemoryClassificationRepository(),
    logger: new NullLogger(),
  });
  const result = await classifier.classifyDirectory(resolve(directoryArg), {
    batchId: options.get("batch") ?? "batch_local",
    organizationId,
    workspaceId,
    actor: { userId: "local_admin", role: "organization_admin" },
  });
  const reportPath = options.get("report-html");
  if (reportPath) {
    await writeClassificationHtmlReport(reportPath, result, clinicCanonicalCatalog, {
      title: "Classificação inteligente de dados",
    });
  }
  process.stdout.write(`${JSON.stringify(renderCliResult(result, provider), null, 2)}\n`);
  if (result.status === "failed") process.exitCode = 1;
}

function buildRuntime(
  provider: string,
  environment: Readonly<Record<string, string | undefined>>,
): {
  model: ClassificationModel;
  providerGate: ApprovedProviderGate;
} {
  if (provider === "openai") return createOpenAIClassificationRuntime(environment);
  if (provider !== "deterministic") {
    throw new Error("--provider deve ser deterministic ou openai.");
  }
  const model = new DeterministicClassificationModel();
  return {
    model,
    providerGate: new StaticProviderGate(
      new Map([[model.providerId, { approvalId: LOCAL_APPROVAL, provider: model.provider }]]),
    ),
  };
}

function loadLocalEnvironment(): Record<string, string | undefined> {
  const fromFile = (name: string): Record<string, string | undefined> => {
    const path = resolve(name);
    return existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {};
  };
  return {
    ...fromFile(".env"),
    ...fromFile(".env.local"),
    ...process.env,
  };
}

function renderCliResult(
  result: Awaited<ReturnType<BatchClassifier["classifyDirectory"]>>,
  provider: string,
): unknown {
  if (provider !== "openai") return result;
  if (result.status === "failed") return result;
  return {
    status: result.status,
    errorCode: result.status === "blocked" ? result.errorCode : undefined,
    planSha256: result.plan?.planSha256,
    coverage: result.plan?.coverage,
    blockers: result.plan?.blockers.map((issue) => issue.code) ?? [],
    warnings: result.plan?.warnings.map((issue) => issue.code) ?? [],
    reviewItems: result.plan?.reviewItems.length ?? 0,
  };
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
