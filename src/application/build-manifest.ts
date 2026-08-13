import { DEFAULT_LIMITS, type ClassifierLimits } from "../config.js";
import { WorkbookManifestSchema, type WorkbookManifest } from "../domain/contracts.js";
import { parseCsvFile } from "../infrastructure/parsers/csv-parser.js";
import { parseXlsxFile } from "../infrastructure/parsers/xlsx-parser.js";
import type { LocalFileCandidate } from "../infrastructure/local-batch-source.js";

export async function buildManifest(
  batchId: string,
  batchSha256: string,
  totalBytes: number,
  files: LocalFileCandidate[],
  limits: ClassifierLimits = DEFAULT_LIMITS,
): Promise<WorkbookManifest> {
  const manifests = [];
  for (const file of files) {
    manifests.push(file.kind === "csv" ? await parseCsvFile(file, limits) : await parseXlsxFile(file, limits));
  }
  return WorkbookManifestSchema.parse({
    schemaVersion: "workbook-manifest.v1",
    batchId,
    batchSha256,
    totalBytes,
    files: manifests.sort((left, right) => left.fileId.localeCompare(right.fileId)),
  });
}
