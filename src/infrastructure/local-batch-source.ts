import { lstat, readdir } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { DEFAULT_LIMITS, type ClassifierLimits } from "../config.js";
import { ClassificationError } from "../domain/errors.js";
import type { FileKind } from "../domain/contracts.js";
import { deterministicId, sha256, sha256File } from "../shared/hash.js";

export type LocalFileCandidate = {
  fileId: string;
  path: string;
  originalName: string;
  bytes: number;
  sha256: string;
  kind: FileKind;
};

const XLSX_SIGNATURES = [Buffer.from("504b0304", "hex"), Buffer.from("504b0506", "hex")];

export async function loadLocalBatch(
  directory: string,
  limits: ClassifierLimits = DEFAULT_LIMITS,
): Promise<{ files: LocalFileCandidate[]; batchSha256: string; totalBytes: number }> {
  const root = resolve(directory);
  const rootStat = await lstat(root).catch(() => undefined);
  if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) {
    throw new ClassificationError("INVALID_BATCH_DIRECTORY", "O lote deve ser uma pasta local válida.");
  }

  const entries = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => !entry.name.startsWith("."))
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));

  if (entries.length === 0) {
    throw new ClassificationError("EMPTY_BATCH", "A pasta do lote não contém arquivos.");
  }
  if (entries.length > limits.maxFiles) {
    throw new ClassificationError("TOO_MANY_FILES", "O lote excede o limite de arquivos.");
  }

  const prepared: Array<Omit<LocalFileCandidate, "fileId">> = [];
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new ClassificationError(
        "UNSUPPORTED_BATCH_ENTRY",
        "O lote deve conter somente arquivos XLSX ou CSV no primeiro nível.",
      );
    }
    const path = join(root, entry.name);
    const stat = await lstat(path);
    const kind = await detectFileKind(path, entry.name);
    prepared.push({
      path,
      originalName: basename(entry.name),
      bytes: stat.size,
      sha256: await sha256File(path),
      kind,
    });
  }

  const totalBytes = prepared.reduce((total, file) => total + file.bytes, 0);
  if (totalBytes > limits.maxBatchBytes) {
    throw new ClassificationError("BATCH_TOO_LARGE", "O lote excede o limite de 100 MB.");
  }

  const sorted = prepared.sort((left, right) => {
    const byHash = left.sha256.localeCompare(right.sha256);
    return byHash !== 0 ? byHash : left.originalName.localeCompare(right.originalName, "pt-BR");
  });
  const occurrenceByHash = new Map<string, number>();
  const files = sorted.map((file) => {
    const occurrence = (occurrenceByHash.get(file.sha256) ?? 0) + 1;
    occurrenceByHash.set(file.sha256, occurrence);
    return {
      ...file,
      fileId: deterministicId("file", file.sha256, String(occurrence)),
    };
  });

  const batchMaterial = [...occurrenceByHash.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([fileHash, count]) => `${fileHash}:${count}`)
    .join("\n");

  return { files, batchSha256: sha256(batchMaterial), totalBytes };
}

async function detectFileKind(path: string, name: string): Promise<FileKind> {
  const extension = extname(name).toLocaleLowerCase("en-US");
  const handle = await import("node:fs/promises").then(({ open }) => open(path, "r"));
  try {
    const header = Buffer.alloc(8);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const prefix = header.subarray(0, bytesRead);
    const isZip = XLSX_SIGNATURES.some((signature) => prefix.subarray(0, signature.length).equals(signature));

    if (extension === ".xlsx") {
      if (!isZip) {
        throw new ClassificationError(
          "FILE_SIGNATURE_MISMATCH",
          "Um arquivo .xlsx não possui assinatura de container XLSX.",
        );
      }
      return "xlsx";
    }
    if (extension === ".csv") {
      if (isZip) {
        throw new ClassificationError(
          "FILE_SIGNATURE_MISMATCH",
          "Um arquivo .csv possui assinatura binária incompatível.",
        );
      }
      return "csv";
    }
    throw new ClassificationError(
      "UNSUPPORTED_FILE_TYPE",
      "Somente arquivos .xlsx e .csv são aceitos nesta versão.",
    );
  } finally {
    await handle.close();
  }
}
