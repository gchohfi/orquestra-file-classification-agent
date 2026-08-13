import { Decimal } from "decimal.js";
import { DEFAULT_LIMITS, type ClassifierLimits } from "../../config.js";
import type {
  CellKind,
  ColumnProfile,
  RowProfile,
  SheetManifest,
  SourceAlert,
} from "../../domain/contracts.js";
import { ClassificationError } from "../../domain/errors.js";
import { deterministicId, sha256 } from "../../shared/hash.js";
import {
  isFormulaLikeText,
  isInstructionLike,
  normalizeHeader,
} from "../../shared/text.js";

type SheetState = "visible" | "hidden" | "veryHidden";

type MutableColumn = {
  columnId: string;
  index: number;
  rawHeader: string;
  normalizedHeader: string;
  dataNonEmptyCount: number;
  kindCounts: Record<CellKind, number>;
  formulaCount: number;
  externalLinkCount: number;
  instructionLikeCount: number;
  moneyLikeCount: number;
  ambiguousNumericCount: number;
  dateLikeCount: number;
  strongIdentityValueCount: number;
  strongIdentityInvalidCount: number;
};

type CellInspection = {
  empty: boolean;
  kind?: CellKind;
  instructionLike: boolean;
  moneyLike: boolean;
  ambiguousNumeric: boolean;
  dateLike: boolean;
  formula: boolean;
  externalLink: boolean;
};

export class SheetProfileBuilder {
  private headerRow: number | null = null;
  private physicalRowCount = 0;
  private readonly columns = new Map<number, MutableColumn>();
  private readonly rows: RowProfile[] = [];
  private readonly alerts: SourceAlert[] = [];

  public constructor(
    private readonly fileId: string,
    private readonly sheetId: string,
    private readonly sheetName: string,
    private readonly state: SheetState = "visible",
    private readonly limits: ClassifierLimits = DEFAULT_LIMITS,
  ) {}

  public addRow(rowNumber: number, values: unknown[]): void {
    if (rowNumber > this.limits.maxRowsPerSheet) {
      throw new ClassificationError("SHEET_ROW_LIMIT_EXCEEDED", "Uma aba excede o limite de linhas.");
    }
    if (values.length > this.limits.maxColumnsPerSheet) {
      throw new ClassificationError("SHEET_COLUMN_LIMIT_EXCEEDED", "Uma aba excede o limite de colunas.");
    }
    this.physicalRowCount = Math.max(this.physicalRowCount, rowNumber);
    const inspected = values.map((value) => inspectCell(value, this.limits.maxCellCharacters));
    const nonEmptyIndexes = inspected
      .map((cell, index) => ({ cell, index: index + 1 }))
      .filter(({ cell }) => !cell.empty);

    if (this.headerRow === null) {
      if (nonEmptyIndexes.length === 0) return;
      this.headerRow = rowNumber;
      for (const { index } of nonEmptyIndexes) {
        const rawHeader = headerText(values[index - 1]);
        this.ensureColumn(index, rawHeader);
      }
      return;
    }

    if (nonEmptyIndexes.length === 0) return;

    const nonEmptyColumnIds: string[] = [];
    let hasFormula = false;
    let hasInstructionLikeContent = false;

    for (const { cell, index } of nonEmptyIndexes) {
      const column = this.ensureColumn(index, "");
      column.dataNonEmptyCount += 1;
      if (cell.kind) column.kindCounts[cell.kind] += 1;
      if (cell.formula) column.formulaCount += 1;
      if (cell.externalLink) column.externalLinkCount += 1;
      if (cell.instructionLike) column.instructionLikeCount += 1;
      if (cell.moneyLike) column.moneyLikeCount += 1;
      if (cell.ambiguousNumeric) column.ambiguousNumericCount += 1;
      if (cell.dateLike) column.dateLikeCount += 1;
      if (isStrongIdentityHeader(column.normalizedHeader)) {
        column.strongIdentityValueCount += 1;
        if (!isPlausibleStrongIdentity(column.normalizedHeader, values[index - 1])) {
          column.strongIdentityInvalidCount += 1;
        }
      }
      hasFormula ||= cell.formula;
      hasInstructionLikeContent ||= cell.instructionLike;
      nonEmptyColumnIds.push(column.columnId);
    }

    this.rows.push({
      rowNumber,
      nonEmptyColumnIds: nonEmptyColumnIds.sort(),
      hasFormula,
      hasInstructionLikeContent,
    });
  }

  public finalize(): SheetManifest {
    const source = { fileId: this.fileId, sheetId: this.sheetId };
    const columns = [...this.columns.values()]
      .filter((column) => column.rawHeader !== "" || column.dataNonEmptyCount > 0)
      .sort((left, right) => left.index - right.index);

    if (this.state !== "visible") {
      this.alerts.push({
        code: "HIDDEN_SHEET_INCLUDED",
        severity: "warning",
        source,
        detail: "A aba oculta foi incluída no inventário e exige revisão.",
      });
    }
    if (this.headerRow === null) {
      this.alerts.push({
        code: "EMPTY_SHEET",
        severity: "info",
        source,
        detail: "A aba não contém células preenchidas.",
      });
    }

    const normalizedHeaders = new Map<string, MutableColumn[]>();
    for (const column of columns) {
      if (!column.normalizedHeader && column.dataNonEmptyCount > 0) {
        this.alerts.push({
          code: "MISSING_COLUMN_HEADER",
          severity: "blocking",
          source: { ...source, columnId: column.columnId },
          detail: "Uma coluna com dados não possui cabeçalho.",
        });
      }
      const matching = normalizedHeaders.get(column.normalizedHeader) ?? [];
      matching.push(column);
      normalizedHeaders.set(column.normalizedHeader, matching);
      this.addColumnAlerts(column, source);
    }
    for (const [header, duplicates] of normalizedHeaders) {
      if (header && duplicates.length > 1) {
        for (const column of duplicates) {
          this.alerts.push({
            code: "DUPLICATE_COLUMN_HEADER",
            severity: "blocking",
            source: { ...source, columnId: column.columnId },
            detail: "O cabeçalho normalizado aparece mais de uma vez na mesma aba.",
          });
        }
      }
    }

    const dataRowNumbers = this.rows.map((row) => row.rowNumber).sort((a, b) => a - b);
    if (hasInteriorGap(dataRowNumbers)) {
      this.alerts.push({
        code: "POSSIBLE_MULTIPLE_BLOCKS",
        severity: "blocking",
        source,
        detail: "Existem linhas vazias entre blocos preenchidos; a granularidade requer revisão.",
      });
    }

    return {
      sheetId: this.sheetId,
      name: this.sheetName,
      state: this.state,
      headerRow: this.headerRow,
      physicalRowCount: this.physicalRowCount,
      dataRowCount: this.rows.length,
      columnCount: columns.length,
      dataNonEmptyCellCount: columns.reduce((sum, column) => sum + column.dataNonEmptyCount, 0),
      columns: columns.map(toColumnProfile),
      rows: [...this.rows].sort((left, right) => left.rowNumber - right.rowNumber),
      alerts: this.alerts.sort(compareAlerts),
    };
  }

  private ensureColumn(index: number, rawHeader: string): MutableColumn {
    const existing = this.columns.get(index);
    if (existing) return existing;
    const column: MutableColumn = {
      columnId: deterministicId("column", this.sheetId, String(index)),
      index,
      rawHeader,
      normalizedHeader: normalizeHeader(rawHeader),
      dataNonEmptyCount: 0,
      kindCounts: { text: 0, integer: 0, decimal: 0, date: 0, boolean: 0, formula: 0, error: 0 },
      formulaCount: 0,
      externalLinkCount: 0,
      instructionLikeCount: 0,
      moneyLikeCount: 0,
      ambiguousNumericCount: 0,
      dateLikeCount: 0,
      strongIdentityValueCount: 0,
      strongIdentityInvalidCount: 0,
    };
    this.columns.set(index, column);
    return column;
  }

  private addColumnAlerts(column: MutableColumn, source: { fileId: string; sheetId: string }): void {
    const columnSource = { ...source, columnId: column.columnId };
    if (column.formulaCount > 0) {
      this.alerts.push({
        code: "FORMULA_PRESERVED_NOT_EXECUTED",
        severity: "warning",
        source: columnSource,
        detail: `${column.formulaCount} fórmula(s) foram tratadas somente como evidência.`,
      });
    }
    if (column.externalLinkCount > 0) {
      this.alerts.push({
        code: "EXTERNAL_LINK_PRESERVED_NOT_OPENED",
        severity: "warning",
        source: columnSource,
        detail: `${column.externalLinkCount} link(s) externo(s) não foram abertos.`,
      });
    }
    if (column.instructionLikeCount > 0) {
      this.alerts.push({
        code: "UNTRUSTED_INSTRUCTION_LIKE_CONTENT",
        severity: "warning",
        source: columnSource,
        detail: "Conteúdo semelhante a instrução foi mantido como dado não confiável.",
      });
    }
  }
}

function inspectCell(value: unknown, maxCharacters: number): CellInspection {
  if (value === null || value === undefined || value === "") {
    return emptyInspection();
  }
  if (typeof value === "string") {
    if (value.length > maxCharacters) {
      throw new ClassificationError("CELL_TOO_LARGE", "Uma célula excede o limite de caracteres.");
    }
    const formulaLike = isFormulaLikeText(value);
    return {
      empty: false,
      kind: formulaLike ? "formula" : "text",
      instructionLike: isInstructionLike(value),
      moneyLike: isMoneyLike(value),
      ambiguousNumeric: isAmbiguousNumeric(value),
      dateLike: isDateLike(value),
      formula: formulaLike,
      externalLink: /^https?:\/\//iu.test(value.trim()),
    };
  }
  if (typeof value === "number") {
    return {
      empty: false,
      kind: Number.isInteger(value) ? "integer" : "decimal",
      instructionLike: false,
      moneyLike: false,
      ambiguousNumeric: false,
      dateLike: false,
      formula: false,
      externalLink: false,
    };
  }
  if (typeof value === "boolean") {
    return { ...emptyInspection(), empty: false, kind: "boolean" };
  }
  if (value instanceof Date) {
    return { ...emptyInspection(), empty: false, kind: "date", dateLike: true };
  }
  if (typeof value === "object") {
    const cell = value as Record<string, unknown>;
    if ("formula" in cell || "sharedFormula" in cell) {
      const formula = String(cell.formula ?? cell.sharedFormula ?? "");
      return {
        empty: false,
        kind: "formula",
        instructionLike: isInstructionLike(formula),
        moneyLike: false,
        ambiguousNumeric: false,
        dateLike: false,
        formula: true,
        externalLink: /https?:\/\//iu.test(formula),
      };
    }
    if ("hyperlink" in cell) {
      return {
        empty: false,
        kind: "text",
        instructionLike: false,
        moneyLike: false,
        ambiguousNumeric: false,
        dateLike: false,
        formula: false,
        externalLink: true,
      };
    }
    if ("error" in cell) {
      return { ...emptyInspection(), empty: false, kind: "error" };
    }
    if ("richText" in cell) {
      const text = Array.isArray(cell.richText)
        ? cell.richText.map((part) => String((part as { text?: unknown }).text ?? "")).join("")
        : "";
      return inspectCell(text, maxCharacters);
    }
  }
  return { ...emptyInspection(), empty: false, kind: "text" };
}

function emptyInspection(): CellInspection {
  return {
    empty: true,
    instructionLike: false,
    moneyLike: false,
    ambiguousNumeric: false,
    dateLike: false,
    formula: false,
    externalLink: false,
  };
}

function headerText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  return "";
}

function isMoneyLike(value: string): boolean {
  const normalized = value
    .trim()
    .replace(/^R\$\s*/u, "")
    .replace(/^\((.*)\)$/u, "-$1")
    .replace(/\./gu, "")
    .replace(",", ".");
  if (!/^-?\d+(?:\.\d+)?$/u.test(normalized)) return false;
  try {
    return new Decimal(normalized).isFinite();
  } catch {
    return false;
  }
}

function isAmbiguousNumeric(value: string): boolean {
  const normalized = value.trim().replace(/^R\$\s*/u, "").replace(/^\((.*)\)$/u, "$1");
  return /^[+-]?\d{1,3}[.,]\d{3}$/u.test(normalized);
}

function isDateLike(value: string): boolean {
  return /^(?:0?[1-9]|[12]\d|3[01])\/(?:0?[1-9]|1[0-2])\/\d{4}$/u.test(value.trim());
}

function isStrongIdentityHeader(header: string): boolean {
  return /^(?:cpf|cpf paciente|id paciente|codigo paciente|id cliente|codigo cliente|patient id)$/u.test(header);
}

function isPlausibleStrongIdentity(header: string, value: unknown): boolean {
  const text = String(value ?? "").trim();
  if (!text) return false;
  if (header === "cpf" || header === "cpf paciente") {
    const digits = text.replace(/\D/gu, "");
    return digits.length === 11 && !/^(\d)\1{10}$/u.test(digits);
  }
  return text.length > 0 && text.length <= 200;
}

function hasInteriorGap(rows: number[]): boolean {
  for (let index = 1; index < rows.length; index += 1) {
    if ((rows[index] ?? 0) - (rows[index - 1] ?? 0) > 1) return true;
  }
  return false;
}

function toColumnProfile(column: MutableColumn): ColumnProfile {
  return {
    columnId: column.columnId,
    index: column.index,
    rawHeader: column.rawHeader,
    normalizedHeader: column.normalizedHeader,
    dataNonEmptyCount: column.dataNonEmptyCount,
    kindCounts: { ...column.kindCounts },
    formulaCount: column.formulaCount,
    externalLinkCount: column.externalLinkCount,
    instructionLikeCount: column.instructionLikeCount,
    moneyLikeCount: column.moneyLikeCount,
    ambiguousNumericCount: column.ambiguousNumericCount,
    dateLikeCount: column.dateLikeCount,
    strongIdentityValueCount: column.strongIdentityValueCount,
    strongIdentityInvalidCount: column.strongIdentityInvalidCount,
  };
}

function compareAlerts(left: SourceAlert, right: SourceAlert): number {
  return `${left.source.columnId ?? ""}:${left.code}`.localeCompare(
    `${right.source.columnId ?? ""}:${right.code}`,
  );
}

export function formulaFingerprint(value: string): string {
  return sha256(value);
}
