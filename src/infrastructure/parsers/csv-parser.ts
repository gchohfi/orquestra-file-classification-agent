import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { Transform, type TransformCallback } from "node:stream";
import { parse } from "csv-parse";
import { DEFAULT_LIMITS, type ClassifierLimits } from "../../config.js";
import type { FileManifest } from "../../domain/contracts.js";
import { ClassificationError } from "../../domain/errors.js";
import { deterministicId } from "../../shared/hash.js";
import type { LocalFileCandidate } from "../local-batch-source.js";
import { SheetProfileBuilder } from "./profile-builder.js";

export async function parseCsvFile(
  file: LocalFileCandidate,
  limits: ClassifierLimits = DEFAULT_LIMITS,
): Promise<FileManifest> {
  const delimiter = await detectDelimiter(file.path);
  const sheetId = deterministicId("sheet", file.fileId, "csv");
  const builder = new SheetProfileBuilder(file.fileId, sheetId, "CSV", "visible", limits);
  const parser = parse({
    bom: true,
    delimiter,
    relax_column_count: true,
    skip_empty_lines: false,
  });
  const input = createReadStream(file.path).pipe(new Utf8DecodeTransform()).pipe(parser);

  let rowNumber = 0;
  try {
    for await (const record of input) {
      rowNumber += 1;
      builder.addRow(rowNumber, record as unknown[]);
    }
  } catch (error) {
    if (error instanceof ClassificationError) throw error;
    throw new ClassificationError("CSV_PARSE_FAILED", "Não foi possível interpretar um arquivo CSV.");
  }

  return {
    fileId: file.fileId,
    originalName: file.originalName,
    sha256: file.sha256,
    bytes: file.bytes,
    kind: "csv",
    sheets: [builder.finalize()],
    alerts: [],
  };
}

class Utf8DecodeTransform extends Transform {
  private readonly decoder = new TextDecoder("utf-8", { fatal: true });

  public override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    try {
      callback(null, this.decoder.decode(chunk, { stream: true }));
    } catch {
      callback(new ClassificationError("CSV_ENCODING_UNSUPPORTED", "O CSV não está em UTF-8 válido."));
    }
  }

  public override _flush(callback: TransformCallback): void {
    try {
      callback(null, this.decoder.decode());
    } catch {
      callback(new ClassificationError("CSV_ENCODING_UNSUPPORTED", "O CSV não está em UTF-8 válido."));
    }
  }
}

async function detectDelimiter(path: string): Promise<string> {
  const handle = await open(path, "r");
  try {
    const sample = Buffer.alloc(64 * 1024);
    const { bytesRead } = await handle.read(sample, 0, sample.length, 0);
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(sample.subarray(0, bytesRead));
    } catch {
      throw new ClassificationError("CSV_ENCODING_UNSUPPORTED", "O CSV não está em UTF-8 válido.");
    }
    const counts = new Map<string, number>([
      [";", 0],
      [",", 0],
      ["\t", 0],
    ]);
    let quoted = false;
    let completedRecords = 0;
    for (const character of text) {
      if (character === '"') quoted = !quoted;
      if (!quoted && counts.has(character)) counts.set(character, (counts.get(character) ?? 0) + 1);
      if (!quoted && character === "\n") {
        completedRecords += 1;
        if (completedRecords >= 20) break;
      }
    }
    const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1]);
    const best = ranked[0];
    const second = ranked[1];
    if (!best || best[1] === 0) return ";";
    if (second && best[1] === second[1]) {
      throw new ClassificationError("CSV_DELIMITER_AMBIGUOUS", "O delimitador do CSV é ambíguo.");
    }
    return best[0];
  } finally {
    await handle.close();
  }
}
