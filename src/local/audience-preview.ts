import { lstat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import ExcelJS from "exceljs";
import { DEFAULT_LIMITS } from "../config.js";
import { clinicCanonicalCatalog } from "../domain/catalog.js";
import { ClassificationError } from "../domain/errors.js";
import { inspectXlsxContainer } from "../infrastructure/parsers/xlsx-parser.js";
import { normalizeHeader } from "../shared/text.js";

export const AUDIENCE_PREVIEW_WINDOWS = [60, 90, 120] as const;

export type AudiencePreviewWindow = (typeof AUDIENCE_PREVIEW_WINDOWS)[number];
export type SimulatedAudienceGroup = "no_action" | "at_risk" | "inactive";

export type AudiencePreviewRow = Readonly<{
  nameInSpreadsheet: string;
  lastRecordOn: string;
  daysSinceLastRecord: number;
  simulatedGroup: SimulatedAudienceGroup;
  reason: string;
  confidence: "Baixa — janela sintética e conclusão não comprovada";
  activationBlock: "Não ativável";
}>;

export type AudiencePreviewScenario = Readonly<{
  windowDays: AudiencePreviewWindow;
  noActionCount: number;
  atRiskCount: number;
  inactiveCount: number;
  releasedCount: 0;
  rows: readonly AudiencePreviewRow[];
}>;

export type AudiencePreviewSheetDiagnostic = Readonly<{
  sheetAlias: string;
  headerRow: number;
  nameColumn: number;
  dateColumn: number;
  scannedDataRows: number;
  validRecordRows: number;
}>;

/**
 * Contém nomes identificados. Este objeto existe apenas em memória para gerar
 * o HTML local e não deve ser serializado, registrado ou exportado.
 */
export type LocalAudiencePreview = Readonly<{
  asOf: string;
  distinctNameCount: number;
  scenarios: readonly AudiencePreviewScenario[];
  diagnostics: Readonly<{
    workbookSheetCount: number;
    recognizedSheetCount: number;
    skippedSheetCount: number;
    scannedDataRows: number;
    validRecordRows: number;
    invalidDateRows: number;
    futureDateRows: number;
    namesWithoutValidRecord: number;
    sheets: readonly AudiencePreviewSheetDiagnostic[];
  }>;
}>;

export class AudiencePreviewError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AudiencePreviewError";
  }
}

type AnalyzeOptions = Readonly<{
  asOf: string;
}>;

type HeaderMapping = Readonly<{
  headerRow: number;
  nameColumn: number;
  dateColumn: number;
}>;

type NameAccumulator = {
  displayName: string;
  lastRecordOn: string;
};

const nameHeaders = acceptedHeadersFor("person.full_name");
const dateHeaders = acceptedHeadersFor("event.occurred_on");
const DAY_MS = 86_400_000;
const MAX_HEADER_SCAN_ROWS = 25;
const MAX_NAME_CHARACTERS = 300;

export async function analyzeLocalAudienceWorkbook(
  inputPath: string,
  options: AnalyzeOptions,
): Promise<LocalAudiencePreview> {
  const asOf = assertDateKey(options.asOf, "INVALID_AS_OF_DATE");
  const absoluteInputPath = resolve(inputPath);
  if (extname(absoluteInputPath).toLocaleLowerCase("en-US") !== ".xlsx") {
    throw new AudiencePreviewError("UNSUPPORTED_INPUT_TYPE");
  }

  const sourceStat = await lstat(absoluteInputPath).catch(() => null);
  if (!sourceStat?.isFile() || sourceStat.isSymbolicLink()) {
    throw new AudiencePreviewError("INPUT_NOT_REGULAR_FILE");
  }
  if (sourceStat.size > DEFAULT_LIMITS.maxBatchBytes) {
    throw new AudiencePreviewError("INPUT_FILE_LIMIT_EXCEEDED");
  }

  const containerAlerts = await inspectXlsxContainer(
    {
      fileId: "local_audience_preview",
      path: absoluteInputPath,
      originalName: "local-audience-preview.xlsx",
      bytes: sourceStat.size,
      sha256: "not-persisted",
      kind: "xlsx",
    },
    DEFAULT_LIMITS,
  ).catch((error: unknown) => {
    if (error instanceof ClassificationError) throw new AudiencePreviewError(error.code);
    throw new AudiencePreviewError("XLSX_CONTAINER_INVALID");
  });
  const unsafeContainerAlert = containerAlerts.find(
    (alert) =>
      alert.severity === "blocking" || alert.code === "EXTERNAL_WORKBOOK_LINK_DETECTED",
  );
  if (unsafeContainerAlert) throw new AudiencePreviewError(unsafeContainerAlert.code);

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(absoluteInputPath, {
      ignoreNodes: [
        "sheetPr",
        "drawing",
        "picture",
        "dataValidations",
        "pageSetup",
        "extLst",
      ],
    });
  } catch {
    throw new AudiencePreviewError("XLSX_PARSE_FAILED");
  }

  if (workbook.worksheets.length > DEFAULT_LIMITS.maxSheetsPerFile) {
    throw new AudiencePreviewError("WORKBOOK_SHEET_LIMIT_EXCEEDED");
  }

  const names = new Map<string, NameAccumulator>();
  const namesSeenWithoutValidRecord = new Set<string>();
  const diagnostics: AudiencePreviewSheetDiagnostic[] = [];
  let scannedDataRows = 0;
  let validRecordRows = 0;
  let invalidDateRows = 0;
  let futureDateRows = 0;

  for (const [zeroBasedIndex, worksheet] of workbook.worksheets.entries()) {
    if (
      worksheet.rowCount > DEFAULT_LIMITS.maxRowsPerSheet ||
      worksheet.columnCount > DEFAULT_LIMITS.maxColumnsPerSheet
    ) {
      throw new AudiencePreviewError("WORKBOOK_DIMENSION_LIMIT_EXCEEDED");
    }

    const mapping = findHeaderMapping(worksheet);
    if (!mapping) continue;

    let sheetScannedRows = 0;
    let sheetValidRows = 0;
    for (let rowNumber = mapping.headerRow + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      scannedDataRows += 1;
      sheetScannedRows += 1;
      const row = worksheet.getRow(rowNumber);
      const displayName = normalizeDisplayName(plainText(row.getCell(mapping.nameColumn).value));
      if (!displayName) continue;

      const nameKey = normalizeNameKey(displayName);
      if (!nameKey) continue;
      const dateKey = parseDateCell(row.getCell(mapping.dateColumn).value);
      if (!dateKey) {
        invalidDateRows += 1;
        namesSeenWithoutValidRecord.add(nameKey);
        continue;
      }
      if (daysBetween(dateKey, asOf) < 0) {
        futureDateRows += 1;
        namesSeenWithoutValidRecord.add(nameKey);
        continue;
      }

      validRecordRows += 1;
      sheetValidRows += 1;
      namesSeenWithoutValidRecord.delete(nameKey);
      const current = names.get(nameKey);
      if (!current) {
        names.set(nameKey, { displayName, lastRecordOn: dateKey });
      } else if (dateKey > current.lastRecordOn) {
        current.lastRecordOn = dateKey;
      } else if (dateKey === current.lastRecordOn && displayName.length > current.displayName.length) {
        current.displayName = displayName;
      }
    }

    diagnostics.push({
      sheetAlias: `Aba ${zeroBasedIndex + 1}`,
      headerRow: mapping.headerRow,
      nameColumn: mapping.nameColumn,
      dateColumn: mapping.dateColumn,
      scannedDataRows: sheetScannedRows,
      validRecordRows: sheetValidRows,
    });
  }

  if (diagnostics.length === 0) {
    throw new AudiencePreviewError("NAME_AND_DATE_COLUMNS_NOT_FOUND");
  }

  const baseRows = [...names.values()]
    .map((record) => ({
      ...record,
      daysSinceLastRecord: daysBetween(record.lastRecordOn, asOf),
    }))
    .sort(
      (left, right) =>
        right.daysSinceLastRecord - left.daysSinceLastRecord ||
        left.displayName.localeCompare(right.displayName, "pt-BR", { sensitivity: "base" }),
    );

  const scenarios = AUDIENCE_PREVIEW_WINDOWS.map((windowDays) => buildScenario(baseRows, windowDays));
  return {
    asOf,
    distinctNameCount: baseRows.length,
    scenarios,
    diagnostics: {
      workbookSheetCount: workbook.worksheets.length,
      recognizedSheetCount: diagnostics.length,
      skippedSheetCount: workbook.worksheets.length - diagnostics.length,
      scannedDataRows,
      validRecordRows,
      invalidDateRows,
      futureDateRows,
      namesWithoutValidRecord: [...namesSeenWithoutValidRecord].filter((nameKey) => !names.has(nameKey)).length,
      sheets: diagnostics,
    },
  };
}

export function simulatedAudienceGroup(
  daysSinceLastRecord: number,
  windowDays: AudiencePreviewWindow,
): SimulatedAudienceGroup {
  if (daysSinceLastRecord < windowDays) return "no_action";
  if (daysSinceLastRecord < windowDays * 2) return "at_risk";
  return "inactive";
}

function buildScenario(
  baseRows: readonly Readonly<{
    displayName: string;
    lastRecordOn: string;
    daysSinceLastRecord: number;
  }>[],
  windowDays: AudiencePreviewWindow,
): AudiencePreviewScenario {
  let noActionCount = 0;
  let atRiskCount = 0;
  let inactiveCount = 0;
  const rows = baseRows.map((baseRow): AudiencePreviewRow => {
    const simulatedGroup = simulatedAudienceGroup(baseRow.daysSinceLastRecord, windowDays);
    if (simulatedGroup === "no_action") noActionCount += 1;
    if (simulatedGroup === "at_risk") atRiskCount += 1;
    if (simulatedGroup === "inactive") inactiveCount += 1;
    return {
      nameInSpreadsheet: baseRow.displayName,
      lastRecordOn: baseRow.lastRecordOn,
      daysSinceLastRecord: baseRow.daysSinceLastRecord,
      simulatedGroup,
      reason: reasonFor(simulatedGroup, baseRow.daysSinceLastRecord, windowDays),
      confidence: "Baixa — janela sintética e conclusão não comprovada",
      activationBlock: "Não ativável",
    };
  });
  return { windowDays, noActionCount, atRiskCount, inactiveCount, releasedCount: 0, rows };
}

function reasonFor(group: SimulatedAudienceGroup, age: number, windowDays: number): string {
  const ageLabel = `${age} ${age === 1 ? "dia" : "dias"}`;
  if (group === "no_action") {
    return `Último registro há ${ageLabel}; abaixo da janela sintética de ${windowDays} dias.`;
  }
  if (group === "at_risk") {
    return `Último registro há ${ageLabel}; na faixa sintética de risco entre ${windowDays} e ${windowDays * 2 - 1} dias.`;
  }
  return `Último registro há ${ageLabel}; na faixa sintética de inatividade a partir de ${windowDays * 2} dias.`;
}

function findHeaderMapping(worksheet: ExcelJS.Worksheet): HeaderMapping | null {
  const lastHeaderCandidate = Math.min(MAX_HEADER_SCAN_ROWS, worksheet.rowCount);
  for (let rowNumber = 1; rowNumber <= lastHeaderCandidate; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    let nameColumn: number | null = null;
    let dateColumn: number | null = null;
    for (let column = 1; column <= worksheet.columnCount; column += 1) {
      const normalized = normalizeHeader(plainText(row.getCell(column).value) ?? "");
      if (!normalized) continue;
      if (nameColumn === null && nameHeaders.has(normalized)) nameColumn = column;
      if (dateColumn === null && dateHeaders.has(normalized)) dateColumn = column;
    }
    if (nameColumn !== null && dateColumn !== null) {
      return { headerRow: rowNumber, nameColumn, dateColumn };
    }
  }
  return null;
}

function acceptedHeadersFor(fieldId: string): ReadonlySet<string> {
  const field = clinicCanonicalCatalog.fields.find((candidate) => candidate.fieldId === fieldId);
  if (!field) throw new AudiencePreviewError("CATALOG_FIELD_MISSING");
  return new Set(field.acceptedHeaders);
}

function plainText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (!isObject(value) || "formula" in value) return null;
  if (typeof value.text === "string") return value.text;
  if (Array.isArray(value.richText)) {
    return value.richText
      .map((part) => (isObject(part) && typeof part.text === "string" ? part.text : ""))
      .join("");
  }
  return null;
}

function normalizeDisplayName(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (!normalized || normalized.length > MAX_NAME_CHARACTERS) return null;
  return normalized;
}

function normalizeNameKey(value: string): string {
  return normalizeHeader(value);
}

function parseDateCell(value: unknown): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return dateKey(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0 || value >= 2_958_466) return null;
    const excelEpoch = Date.UTC(1899, 11, 30);
    const parsed = new Date(excelEpoch + Math.floor(value) * DAY_MS);
    return dateKey(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate());
  }
  if (isObject(value)) {
    if ("formula" in value) return null;
    if (typeof value.text === "string") return parseDateString(value.text);
  }
  return typeof value === "string" ? parseDateString(value) : null;
}

function parseDateString(value: string): string | null {
  const trimmed = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/u.exec(trimmed);
  if (iso) return dateKey(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const brazilian = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[T\s].*)?$/u.exec(trimmed);
  if (brazilian) return dateKey(Number(brazilian[3]), Number(brazilian[2]), Number(brazilian[1]));
  return null;
}

function assertDateKey(value: string, code: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) throw new AudiencePreviewError(code);
  const result = dateKey(Number(match[1]), Number(match[2]), Number(match[3]));
  if (!result) throw new AudiencePreviewError(code);
  return result;
}

function dateKey(year: number, month: number, day: number): string | null {
  if (![year, month, day].every(Number.isInteger)) return null;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysBetween(earlier: string, later: string): number {
  return Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / DAY_MS);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
