import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { BatchClassifier } from "../src/application/classify-batch.js";
import { clinicCanonicalCatalog } from "../src/domain/catalog.js";
import type { ClassifyBatchRequest } from "../src/domain/contracts.js";
import { StaticProviderGate } from "../src/infrastructure/gates/static-provider-gate.js";
import { NullLogger } from "../src/infrastructure/logging/null-logger.js";
import { DeterministicClassificationModel } from "../src/infrastructure/models/deterministic-classification-model.js";
import { InMemoryClassificationRepository } from "../src/infrastructure/repositories/in-memory-classification-repository.js";
import type { ClassificationModel } from "../src/ports.js";
import type { ApprovedProviderGate } from "../src/ports.js";

export const TEST_APPROVAL = "test-local-approval";

const temporaryDirectories: string[] = [];

export async function temporaryBatch(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "orquestra-classifier-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

export async function cleanupTemporaryBatches(): Promise<void> {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory?.startsWith(tmpdir())) await rm(directory, { recursive: true, force: true });
  }
}

export async function writeCsv(directory: string, name: string, content: string): Promise<string> {
  const path = join(directory, name);
  await writeFile(path, content, "utf8");
  return path;
}

export async function writeWorkbook(
  directory: string,
  name: string,
  configure: (workbook: ExcelJS.Workbook) => void,
): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  configure(workbook);
  const path = join(directory, name);
  await workbook.xlsx.writeFile(path);
  return path;
}

export async function addMacroPayload(path: string): Promise<void> {
  const original = await import("node:fs/promises").then(({ readFile }) => readFile(path));
  const zip = await JSZip.loadAsync(original);
  zip.file("xl/vbaProject.bin", Buffer.from("synthetic-macro-marker"));
  await writeFile(path, await zip.generateAsync({ type: "nodebuffer" }));
}

export function defaultRequest(overrides: Partial<ClassifyBatchRequest> = {}): ClassifyBatchRequest {
  return {
    batchId: "batch_test",
    organizationId: "org_test",
    workspaceId: "workspace_test",
    actor: { userId: "admin_test", role: "organization_admin" },
    ...overrides,
  };
}

export function classifierWith(
  model: ClassificationModel = new DeterministicClassificationModel(),
  providerGate: ApprovedProviderGate = new StaticProviderGate(
    new Map([[model.providerId, { approvalId: TEST_APPROVAL, provider: model.provider }]]),
  ),
): BatchClassifier {
  return new BatchClassifier({
    catalog: clinicCanonicalCatalog,
    model,
    providerGate,
    repository: new InMemoryClassificationRepository(),
    logger: new NullLogger(),
  });
}
