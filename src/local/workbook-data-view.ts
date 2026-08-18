import { lstat } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import ExcelJS from "exceljs";
import { DEFAULT_LIMITS } from "../config.js";
import { clinicCanonicalCatalog } from "../domain/catalog.js";
import { inspectXlsxContainer } from "../infrastructure/parsers/xlsx-parser.js";
import { normalizeHeader } from "../shared/text.js";

export type WorkbookColumnRole = "identity" | "date" | "item" | "financial" | "other";
export type WorkbookCellKind =
  | "empty"
  | "text"
  | "number"
  | "date"
  | "boolean"
  | "formula"
  | "error"
  | "link";

export type LocalWorkbookCell = Readonly<{
  text: string;
  kind: WorkbookCellKind;
  formula?: string;
  externalTarget?: string;
  mergedMaster?: string;
}>;

export type LocalWorkbookColumn = Readonly<{
  index: number;
  letter: string;
  header: string;
  role: WorkbookColumnRole;
  essential: boolean;
  hidden: boolean;
  stickyIdentity: boolean;
  stickyDate: boolean;
  canonicalFieldId?: string;
}>;

export type LocalWorkbookRow = Readonly<{
  sourceRow: number;
  hidden: boolean;
  cells: readonly LocalWorkbookCell[];
  sameNameDateRowCount: number;
}>;

export type LocalWorkbookSheet = Readonly<{
  index: number;
  name: string;
  state: "visible" | "hidden" | "veryHidden";
  headerRow: number | null;
  physicalRowCount: number;
  dataRowCount: number;
  nonEmptyCellCount: number;
  formulaCellCount: number;
  externalLinkCellCount: number;
  hasEssentialColumns: boolean;
  columns: readonly LocalWorkbookColumn[];
  rows: readonly LocalWorkbookRow[];
}>;

/**
 * Snapshot identificado e somente local. Não serializar, registrar ou exportar.
 * Seu único destino permitido neste projeto é o HTML local ignorado pelo Git.
 */
export type LocalWorkbookDataView = Readonly<{
  sourceLabel: string;
  sheetCount: number;
  physicalRowCount: number;
  dataRowCount: number;
  nonEmptyCellCount: number;
  formulaCellCount: number;
  externalLinkCellCount: number;
  distinctWrittenNameCount: number;
  repeatedNameDateRowCount: number;
  containerAlertCodes: readonly string[];
  sheets: readonly LocalWorkbookSheet[];
}>;

export class LocalWorkbookViewError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "LocalWorkbookViewError";
  }
}

type MutableRow = {
  sourceRow: number;
  hidden: boolean;
  cells: LocalWorkbookCell[];
  sameNameDateRowCount: number;
};

type MutableSheet = Omit<LocalWorkbookSheet, "rows"> & { rows: MutableRow[] };

const headerFields = new Map<string, (typeof clinicCanonicalCatalog.fields)[number]>();
const MAX_LOCAL_REPORT_CELLS = 500_000;
for (const field of clinicCanonicalCatalog.fields) {
  for (const header of field.acceptedHeaders) {
    if (!headerFields.has(header)) headerFields.set(header, field);
  }
}

export async function readLocalWorkbookDataView(inputPath: string): Promise<LocalWorkbookDataView> {
  const absoluteInputPath = resolve(inputPath);
  if (extname(absoluteInputPath).toLocaleLowerCase("en-US") !== ".xlsx") {
    throw new LocalWorkbookViewError("UNSUPPORTED_INPUT_TYPE");
  }
  const sourceStat = await lstat(absoluteInputPath).catch(() => null);
  if (!sourceStat?.isFile() || sourceStat.isSymbolicLink()) {
    throw new LocalWorkbookViewError("INPUT_NOT_REGULAR_FILE");
  }
  if (sourceStat.size > DEFAULT_LIMITS.maxBatchBytes) {
    throw new LocalWorkbookViewError("INPUT_FILE_LIMIT_EXCEEDED");
  }

  const containerAlerts = await inspectXlsxContainer(
    {
      fileId: "local_sensitive_view",
      path: absoluteInputPath,
      originalName: "local-sensitive.xlsx",
      bytes: sourceStat.size,
      sha256: "not-persisted",
      kind: "xlsx",
    },
    DEFAULT_LIMITS,
  ).catch(() => {
    throw new LocalWorkbookViewError("XLSX_CONTAINER_INVALID");
  });
  const blockingContainerAlert = containerAlerts.find((alert) => alert.severity === "blocking");
  if (blockingContainerAlert) throw new LocalWorkbookViewError(blockingContainerAlert.code);

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(absoluteInputPath, {
      ignoreNodes: ["sheetPr", "drawing", "picture", "dataValidations", "pageSetup", "extLst"],
    });
  } catch {
    throw new LocalWorkbookViewError("XLSX_PARSE_FAILED");
  }
  if (workbook.worksheets.length > DEFAULT_LIMITS.maxSheetsPerFile) {
    throw new LocalWorkbookViewError("WORKBOOK_SHEET_LIMIT_EXCEEDED");
  }

  const sheets: MutableSheet[] = [];
  let renderedCellGrid = 0;
  for (const [zeroBasedIndex, worksheet] of workbook.worksheets.entries()) {
    if (
      worksheet.rowCount > DEFAULT_LIMITS.maxRowsPerSheet ||
      worksheet.columnCount > DEFAULT_LIMITS.maxColumnsPerSheet
    ) {
      throw new LocalWorkbookViewError("WORKBOOK_DIMENSION_LIMIT_EXCEEDED");
    }
    renderedCellGrid += worksheet.rowCount * worksheet.columnCount;
    if (renderedCellGrid > MAX_LOCAL_REPORT_CELLS) {
      throw new LocalWorkbookViewError("LOCAL_REPORT_CELL_LIMIT_EXCEEDED");
    }
    sheets.push(readSheet(worksheet, zeroBasedIndex + 1));
  }

  const distinctWrittenNames = new Set<string>();
  const nameDateGroups = new Map<string, MutableRow[]>();
  for (const sheet of sheets) {
    const nameColumnIndex = sheet.columns.findIndex((column) => column.canonicalFieldId === "person.full_name");
    const dateColumnIndex = sheet.columns.findIndex((column) => column.canonicalFieldId === "event.occurred_on");
    for (const row of sheet.rows) {
      if (row.sourceRow === sheet.headerRow) continue;
      const name = nameColumnIndex >= 0 ? row.cells[nameColumnIndex]?.text.trim() ?? "" : "";
      const normalizedName = normalizeHeader(name);
      if (normalizedName) distinctWrittenNames.add(normalizedName);
      if (!normalizedName || dateColumnIndex < 0) continue;
      const date = normalizeHeader(row.cells[dateColumnIndex]?.text ?? "");
      if (!date) continue;
      const key = `${normalizedName}\u0000${date}`;
      const groupedRows = nameDateGroups.get(key) ?? [];
      groupedRows.push(row);
      nameDateGroups.set(key, groupedRows);
    }
  }

  let repeatedNameDateRowCount = 0;
  for (const rows of nameDateGroups.values()) {
    if (rows.length < 2) continue;
    repeatedNameDateRowCount += rows.length;
    for (const row of rows) row.sameNameDateRowCount = rows.length;
  }

  return {
    sourceLabel: basename(absoluteInputPath),
    sheetCount: sheets.length,
    physicalRowCount: sheets.reduce((sum, sheet) => sum + sheet.physicalRowCount, 0),
    dataRowCount: sheets.reduce((sum, sheet) => sum + sheet.dataRowCount, 0),
    nonEmptyCellCount: sheets.reduce((sum, sheet) => sum + sheet.nonEmptyCellCount, 0),
    formulaCellCount: sheets.reduce((sum, sheet) => sum + sheet.formulaCellCount, 0),
    externalLinkCellCount: sheets.reduce((sum, sheet) => sum + sheet.externalLinkCellCount, 0),
    distinctWrittenNameCount: distinctWrittenNames.size,
    repeatedNameDateRowCount,
    containerAlertCodes: containerAlerts.map((alert) => alert.code).sort(),
    sheets,
  };
}

function readSheet(worksheet: ExcelJS.Worksheet, sheetIndex: number): MutableSheet {
  const headerRow = findFirstPopulatedRow(worksheet);
  const columns = Array.from({ length: worksheet.columnCount }, (_, zeroBasedIndex) => {
    const index = zeroBasedIndex + 1;
    const headerCell = headerRow === null ? emptyCell() : readCell(worksheet.getRow(headerRow).getCell(index));
    const header = headerCell.text.trim() || `Coluna ${worksheet.getColumn(index).letter}`;
    const field = headerFields.get(normalizeHeader(header));
    const role = columnRole(header, field);
    const column: LocalWorkbookColumn = {
      index,
      letter: worksheet.getColumn(index).letter,
      header,
      role,
      essential: role !== "other",
      hidden: worksheet.getColumn(index).hidden === true,
      stickyIdentity: field?.fieldId === "person.full_name",
      stickyDate: field?.fieldId === "event.occurred_on",
      ...(field ? { canonicalFieldId: field.fieldId } : {}),
    };
    return column;
  });

  const rows: MutableRow[] = [];
  let nonEmptyCellCount = 0;
  let formulaCellCount = 0;
  let externalLinkCellCount = 0;
  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const sourceRow = worksheet.getRow(rowNumber);
    const cells = columns.map((column) => readCell(sourceRow.getCell(column.index)));
    const populatedCells = cells.filter((cell) => cell.kind !== "empty");
    nonEmptyCellCount += populatedCells.length;
    formulaCellCount += populatedCells.filter((cell) => cell.kind === "formula").length;
    externalLinkCellCount += populatedCells.filter((cell) => cell.kind === "link" || cell.externalTarget).length;
    rows.push({
      sourceRow: rowNumber,
      hidden: sourceRow.hidden === true,
      cells,
      sameNameDateRowCount: 1,
    });
  }

  return {
    index: sheetIndex,
    name: worksheet.name || `Aba ${sheetIndex}`,
    state: worksheet.state ?? "visible",
    headerRow,
    physicalRowCount: worksheet.rowCount,
    dataRowCount: rows.length,
    nonEmptyCellCount,
    formulaCellCount,
    externalLinkCellCount,
    hasEssentialColumns: columns.some((column) => column.essential),
    columns,
    rows,
  };
}

function readCell(cell: ExcelJS.Cell): LocalWorkbookCell {
  const value = cell.value;
  if (value === null || value === undefined) return finalizeCell(cell, emptyCell());
  if (value instanceof Date) return finalizeCell(cell, { text: formatDateValue(value), kind: "date" });
  if (typeof value === "number") return finalizeCell(cell, { text: cell.text || String(value), kind: "number" });
  if (typeof value === "boolean") return finalizeCell(cell, { text: cell.text || String(value), kind: "boolean" });
  if (typeof value === "string") return finalizeCell(cell, { text: cell.text || value, kind: "text" });
  if (!isObject(value)) return finalizeCell(cell, { text: cell.text || String(value), kind: "text" });

  const formula = typeof value.formula === "string"
    ? value.formula
    : typeof value.sharedFormula === "string"
      ? cell.formula || `Fórmula compartilhada: ${value.sharedFormula}`
      : null;
  if (formula !== null) {
    return finalizeCell(cell, {
      text: cell.text,
      kind: "formula",
      formula: formula.startsWith("=") ? formula : `=${formula}`,
    });
  }
  if (typeof value.hyperlink === "string") {
    return finalizeCell(cell, {
      text: typeof value.text === "string" ? value.text : cell.text,
      kind: "link",
      externalTarget: value.hyperlink,
    });
  }
  if (typeof value.error === "string") return finalizeCell(cell, { text: value.error, kind: "error" });
  if (Array.isArray(value.richText)) {
    return finalizeCell(cell, {
      text: value.richText
        .map((part) => (isObject(part) && typeof part.text === "string" ? part.text : ""))
        .join(""),
      kind: "text",
    });
  }
  return finalizeCell(cell, { text: cell.text, kind: cell.text ? "text" : "empty" });
}

function emptyCell(): LocalWorkbookCell {
  return { text: "", kind: "empty" };
}

function finalizeCell(cell: ExcelJS.Cell, value: LocalWorkbookCell): LocalWorkbookCell {
  const cleaned: LocalWorkbookCell = {
    ...value,
    text: cleanText(value.text),
    ...(value.formula ? { formula: cleanText(value.formula) } : {}),
    ...(value.externalTarget ? { externalTarget: cleanText(value.externalTarget) } : {}),
    ...(cell.isMerged ? { mergedMaster: cell.master.address } : {}),
  };
  const characterCount = cleaned.text.length +
    (cleaned.formula?.length ?? 0) +
    (cleaned.externalTarget?.length ?? 0);
  if (characterCount > DEFAULT_LIMITS.maxCellCharacters) {
    throw new LocalWorkbookViewError("CELL_CHARACTER_LIMIT_EXCEEDED");
  }
  return cleaned;
}

function cleanText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, "�");
}

function formatDateValue(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${day}/${month}/${year}`;
}

function findFirstPopulatedRow(worksheet: ExcelJS.Worksheet): number | null {
  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    for (let column = 1; column <= worksheet.columnCount; column += 1) {
      if (readCell(row.getCell(column)).kind !== "empty") return rowNumber;
    }
  }
  return null;
}

function columnRole(
  header: string,
  field: (typeof clinicCanonicalCatalog.fields)[number] | undefined,
): WorkbookColumnRole {
  if (field?.entityId === "person" && (field.risk === "identity" || field.risk === "protected")) {
    return "identity";
  }
  if (field?.type === "date") return "date";
  if (field?.entityId === "catalog_item") return "item";
  if (field?.risk === "financial") return "financial";
  const normalized = normalizeHeader(header);
  if (/\b(nome|paciente|cliente|cpf|email|telefone|celular|whatsapp)\b/u.test(normalized)) return "identity";
  if (/\b(data|competencia|vencimento)\b/u.test(normalized)) return "date";
  if (/\b(procedimento|produto|servico|item)\b/u.test(normalized)) return "item";
  if (/\b(valor|preco|receita|faturamento|custo|lucro|comissao|imposto|parcela|pagamento)\b/u.test(normalized)) {
    return "financial";
  }
  return "other";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
