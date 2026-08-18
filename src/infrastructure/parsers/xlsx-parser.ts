import ExcelJS from "exceljs";
import * as yauzl from "yauzl";
import { DEFAULT_LIMITS, type ClassifierLimits } from "../../config.js";
import type { FileManifest, SourceAlert } from "../../domain/contracts.js";
import { ClassificationError } from "../../domain/errors.js";
import { deterministicId } from "../../shared/hash.js";
import type { LocalFileCandidate } from "../local-batch-source.js";
import { SheetProfileBuilder } from "./profile-builder.js";

export async function parseXlsxFile(
  file: LocalFileCandidate,
  limits: ClassifierLimits = DEFAULT_LIMITS,
): Promise<FileManifest> {
  const alerts = await inspectXlsxContainer(file, limits);
  if (alerts.some((alert) => alert.severity === "blocking")) {
    return {
      fileId: file.fileId,
      originalName: file.originalName,
      sha256: file.sha256,
      bytes: file.bytes,
      kind: "xlsx",
      sheets: [],
      alerts,
    };
  }

  const workbook = new ExcelJS.Workbook();
  const sheets = [];
  try {
    await workbook.xlsx.readFile(file.path, {
      ignoreNodes: ["sheetPr", "drawing", "picture", "dataValidations", "pageSetup"],
    });
    for (const [zeroBasedIndex, worksheet] of workbook.worksheets.entries()) {
      const sheetIndex = zeroBasedIndex + 1;
      if (sheetIndex > limits.maxSheetsPerFile) {
        throw new ClassificationError("WORKBOOK_SHEET_LIMIT_EXCEEDED", "O XLSX excede o limite de abas.");
      }
      const sheetId = deterministicId("sheet", file.fileId, String(sheetIndex), worksheet.name);
      const builder = new SheetProfileBuilder(
        file.fileId,
        sheetId,
        worksheet.name || `Sheet${sheetIndex}`,
        worksheet.state ?? "visible",
        limits,
      );
      if (worksheet.rowCount > limits.maxRowsPerSheet || worksheet.columnCount > limits.maxColumnsPerSheet) {
        throw new ClassificationError("WORKBOOK_DIMENSION_LIMIT_EXCEEDED", "Uma aba excede os limites seguros.");
      }
      for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
        const row = worksheet.getRow(rowNumber);
        const values = Array.from({ length: row.cellCount }, (_, index) => row.getCell(index + 1).value);
        builder.addRow(row.number, values);
      }
      sheets.push(builder.finalize());
    }
  } catch (error) {
    if (error instanceof ClassificationError) throw error;
    throw new ClassificationError("XLSX_PARSE_FAILED", "Não foi possível interpretar um arquivo XLSX.");
  }

  if (sheets.length === 0) {
    alerts.push({
      code: "XLSX_WITHOUT_WORKSHEETS",
      severity: "blocking",
      source: { fileId: file.fileId },
      detail: "O container XLSX não possui abas legíveis.",
    });
  }

  return {
    fileId: file.fileId,
    originalName: file.originalName,
    sha256: file.sha256,
    bytes: file.bytes,
    kind: "xlsx",
    sheets,
    alerts: alerts.sort((left, right) => left.code.localeCompare(right.code)),
  };
}

export async function inspectXlsxContainer(
  file: LocalFileCandidate,
  limits: ClassifierLimits,
): Promise<SourceAlert[]> {
  return new Promise((resolve, reject) => {
    yauzl.open(file.path, { lazyEntries: true, autoClose: true }, (openError, zipFile) => {
      if (openError || !zipFile) {
        reject(new ClassificationError("XLSX_CONTAINER_INVALID", "O container XLSX é inválido."));
        return;
      }
      const alerts: SourceAlert[] = [];
      let entries = 0;
      let compressedBytes = 0;
      let uncompressedBytes = 0;
      let hasContentTypes = false;
      let settled = false;

      const fail = (error: ClassificationError): void => {
        if (settled) return;
        settled = true;
        zipFile.close();
        reject(error);
      };

      zipFile.on("entry", (entry: yauzl.Entry) => {
        entries += 1;
        compressedBytes += entry.compressedSize;
        uncompressedBytes += entry.uncompressedSize;
        const normalizedName = entry.fileName.toLocaleLowerCase("en-US");
        hasContentTypes ||= normalizedName === "[content_types].xml";

        if (normalizedName.endsWith("vbaproject.bin") || normalizedName.includes("/embeddings/")) {
          alerts.push({
            code: "ACTIVE_CONTENT_DETECTED",
            severity: "blocking",
            source: { fileId: file.fileId },
            detail: "O XLSX contém macro ou objeto incorporado e foi colocado em quarentena.",
          });
        }
        if (normalizedName.includes("/externallinks/")) {
          alerts.push({
            code: "EXTERNAL_WORKBOOK_LINK_DETECTED",
            severity: "warning",
            source: { fileId: file.fileId },
            detail: "O XLSX referencia fonte externa; o link não será aberto.",
          });
        }

        if (entries > limits.maxZipEntries || uncompressedBytes > limits.maxUncompressedBytes) {
          fail(new ClassificationError("XLSX_CONTAINER_LIMIT_EXCEEDED", "O container XLSX excede limites seguros."));
          return;
        }
        if (compressedBytes > 0 && uncompressedBytes / compressedBytes > limits.maxCompressionRatio) {
          fail(new ClassificationError("XLSX_COMPRESSION_RATIO_EXCEEDED", "O XLSX possui compressão suspeita."));
          return;
        }
        zipFile.readEntry();
      });
      zipFile.on("error", () => fail(new ClassificationError("XLSX_CONTAINER_INVALID", "O container XLSX é inválido.")));
      zipFile.on("end", () => {
        if (settled) return;
        settled = true;
        if (!hasContentTypes) {
          reject(new ClassificationError("XLSX_CONTENT_TYPES_MISSING", "O container não é um XLSX válido."));
          return;
        }
        resolve(alerts);
      });
      zipFile.readEntry();
    });
  });
}
