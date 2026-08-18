import type {
  LocalWorkbookColumn,
  LocalWorkbookDataView,
  LocalWorkbookRow,
  LocalWorkbookSheet,
} from "./workbook-data-view.js";
import { LocalWorkbookViewError } from "./workbook-data-view.js";
import { normalizeHeader } from "../shared/text.js";
import { Decimal } from "decimal.js";

export type ArithmeticReconciliationStatus = "matched" | "mismatch" | "blocked";

export type ProcedureInstallmentIssueCode =
  | "EVENT_ID_MISSING"
  | "EVENT_NAME_CONFLICT"
  | "EVENT_DATE_CONFLICT"
  | "PROCEDURE_AND_PRODUCT_MISSING"
  | "PROCEDURE_PRICE_MISSING_OR_INVALID"
  | "PROCEDURE_PRICE_CONFLICT"
  | "PROCEDURE_ATTRIBUTE_CONFLICT"
  | "FORMULA_FINANCIAL_VALUE_UNVERIFIED"
  | "INSTALLMENT_IDENTITY_INCOMPLETE"
  | "INSTALLMENT_AMOUNT_MISSING_OR_INVALID"
  | "INSTALLMENT_DUPLICATE_WITHIN_PROCEDURE_GROUP"
  | "INSTALLMENT_REPEATED_ACROSS_SOURCE_ROWS"
  | "FINANCIAL_TOTAL_OUT_OF_RANGE"
  | "TOTAL_MISMATCH";

export type ProcedureGroup = Readonly<{
  procedureLabels: readonly string[];
  productLabels: readonly string[];
  types: readonly string[];
  quantities: readonly string[];
  generalProducts: readonly string[];
  priceRawValues: readonly string[];
  priceCents: number | null;
  hasFormulaFinancialValue: boolean;
  sourceRows: readonly number[];
}>;

export type InstallmentGroup = Readonly<{
  numberVariants: readonly string[];
  dueDateVariants: readonly string[];
  amountRawValues: readonly string[];
  amountCents: number | null;
  paymentMethods: readonly string[];
  sourceRows: readonly number[];
  procedureGroupCount: number;
  procedureGroupIndexes: readonly number[];
  hasFormulaFinancialValue: boolean;
}>;

export type ProcedureInstallmentEvent = Readonly<{
  eventId: string;
  namesInSpreadsheet: readonly string[];
  recordDates: readonly string[];
  procedures: readonly ProcedureGroup[];
  installments: readonly InstallmentGroup[];
  rawRows: readonly LocalWorkbookRow[];
  status: ArithmeticReconciliationStatus;
  procedureTotalCents: number | null;
  installmentTotalCents: number | null;
  rawInstallmentTotalCents: number | null;
  varianceCents: number | null;
  toleranceCents: 1;
  activationEligibility: "blocked";
  blockers: readonly ProcedureInstallmentIssueCode[];
  warnings: readonly ProcedureInstallmentIssueCode[];
}>;

/**
 * Visão identificada, somente em memória, para produzir um HTML local.
 * Não registrar, serializar ou exportar como JSON.
 */
export type ProcedureInstallmentView = Readonly<{
  schemaVersion: "local-procedure-installment-preview.v1";
  groupingBasis: "source_event_id";
  priceSemantics: "line_amount_hypothesis";
  installmentGroupingBasis: "number_due_date_amount_payment_method_candidate";
  toleranceCents: 1;
  activationEligibility: "blocked";
  sourceLabel: string;
  sourceSheetIndex: number;
  sourceSheetName: string;
  sourceColumns: readonly LocalWorkbookColumn[];
  sourceRowCount: number;
  eventCount: number;
  procedureGroupCount: number;
  installmentCount: number;
  completeInstallmentCandidateCount: number;
  incompleteInstallmentRowCount: number;
  extraRawRowsBeyondUniqueInstallments: number;
  matchedCount: number;
  mismatchCount: number;
  blockedCount: number;
  eventsWithRepeatedInstallmentRows: number;
  events: readonly ProcedureInstallmentEvent[];
}>;

type MutableProcedure = {
  procedureLabels: Set<string>;
  productLabels: Set<string>;
  types: Set<string>;
  quantities: Set<string>;
  generalProducts: Set<string>;
  priceRawValues: Set<string>;
  priceCentsValues: Set<number>;
  hasInvalidPriceValue: boolean;
  hasFormulaFinancialValue: boolean;
  sourceRows: number[];
};

type MutableInstallment = {
  numberVariants: Set<string>;
  dueDateVariants: Set<string>;
  amountRawValues: Set<string>;
  amountCents: number | null;
  paymentMethods: Set<string>;
  sourceRows: number[];
  procedureKeys: Set<string>;
  hasFormulaFinancialValue: boolean;
};

type MutableEvent = {
  eventId: string;
  names: Set<string>;
  dates: Set<string>;
  procedures: Map<string, MutableProcedure>;
  installments: Map<string, MutableInstallment>;
  rawRows: LocalWorkbookRow[];
  rawInstallmentAmountsCents: Array<number | null>;
  structuralBlockers: Set<ProcedureInstallmentIssueCode>;
};

type RequiredColumnIndexes = Readonly<{
  eventId: number;
  name: number;
  recordDate: number;
  type: number;
  procedure: number;
  product: number;
  quantity: number;
  generalProducts: number;
  procedurePrice: number;
  paymentMethod: number;
  installmentNumber: number;
  installmentDueDate: number;
  installmentAmount: number;
}>;

export function buildProcedureInstallmentView(data: LocalWorkbookDataView): ProcedureInstallmentView {
  const sheet = findOperationalSheet(data.sheets);
  const columns = requiredColumnIndexes(sheet);
  const events = new Map<string, MutableEvent>();

  for (const row of sheet.rows) {
    if (row.sourceRow === sheet.headerRow || row.cells.every((cell) => cell.kind === "empty")) continue;
    const sourceEventId = cellText(row, columns.eventId);
    const normalizedEventId = normalizeSourceEventId(sourceEventId);
    const eventKey = normalizedEventId || `missing-event-row-${row.sourceRow}`;
    const event: MutableEvent = events.get(eventKey) ?? {
      eventId: sourceEventId || `Sem identificador · linha ${row.sourceRow}`,
      names: new Set<string>(),
      dates: new Set<string>(),
      procedures: new Map<string, MutableProcedure>(),
      installments: new Map<string, MutableInstallment>(),
      rawRows: [] as LocalWorkbookRow[],
      rawInstallmentAmountsCents: [] as Array<number | null>,
      structuralBlockers: new Set<ProcedureInstallmentIssueCode>(),
    };
    if (!normalizedEventId) event.structuralBlockers.add("EVENT_ID_MISSING");
    event.rawRows.push(row);
    addIfPresent(event.names, cellText(row, columns.name));
    addIfPresent(event.dates, cellText(row, columns.recordDate));

    const procedure = cellText(row, columns.procedure);
    const product = cellText(row, columns.product);
    const normalizedProcedure = normalizeGroupingText(procedure);
    const normalizedProduct = normalizeGroupingText(product);
    const procedureKey = normalizedProcedure || normalizedProduct
      ? collisionSafeKey([normalizedProcedure, normalizedProduct])
      : `missing-item-row-${row.sourceRow}`;
    if (!normalizedProcedure && !normalizedProduct) event.structuralBlockers.add("PROCEDURE_AND_PRODUCT_MISSING");
    const mutableProcedure = event.procedures.get(procedureKey) ?? {
      procedureLabels: new Set<string>(),
      productLabels: new Set<string>(),
      types: new Set<string>(),
      quantities: new Set<string>(),
      generalProducts: new Set<string>(),
      priceRawValues: new Set<string>(),
      priceCentsValues: new Set<number>(),
      hasInvalidPriceValue: false,
      hasFormulaFinancialValue: false,
      sourceRows: [],
    };
    addIfPresent(mutableProcedure.procedureLabels, procedure);
    addIfPresent(mutableProcedure.productLabels, product);
    addIfPresent(mutableProcedure.types, cellText(row, columns.type));
    addIfPresent(mutableProcedure.quantities, cellText(row, columns.quantity));
    addIfPresent(mutableProcedure.generalProducts, cellText(row, columns.generalProducts));
    const priceRaw = cellText(row, columns.procedurePrice);
    const priceCents = parseMoneyToCents(priceRaw);
    if (priceCents === null) mutableProcedure.hasInvalidPriceValue = true;
    if (row.cells[columns.procedurePrice]?.kind === "formula") {
      mutableProcedure.hasFormulaFinancialValue = true;
      event.structuralBlockers.add("FORMULA_FINANCIAL_VALUE_UNVERIFIED");
    }
    addIfPresent(mutableProcedure.priceRawValues, priceRaw);
    if (priceCents !== null) mutableProcedure.priceCentsValues.add(priceCents);
    mutableProcedure.sourceRows.push(row.sourceRow);
    event.procedures.set(procedureKey, mutableProcedure);

    const installmentNumber = cellText(row, columns.installmentNumber);
    const installmentDueDate = cellText(row, columns.installmentDueDate);
    const installmentAmountRaw = cellText(row, columns.installmentAmount);
    const installmentAmountCents = parseMoneyToCents(installmentAmountRaw);
    const paymentMethod = cellText(row, columns.paymentMethod);
    event.rawInstallmentAmountsCents.push(installmentAmountCents);
    const normalizedInstallmentNumber = normalizeGroupingText(installmentNumber);
    const normalizedInstallmentDueDate = normalizeGroupingText(installmentDueDate);
    const normalizedPaymentMethod = normalizeGroupingText(paymentMethod);
    const installmentKey = normalizedInstallmentNumber && normalizedInstallmentDueDate && installmentAmountCents !== null
      ? collisionSafeKey([
          normalizedInstallmentNumber,
          normalizedInstallmentDueDate,
          String(installmentAmountCents),
          normalizedPaymentMethod,
        ])
      : `incomplete-installment-row-${row.sourceRow}`;
    const mutableInstallment = event.installments.get(installmentKey) ?? {
      numberVariants: new Set<string>(),
      dueDateVariants: new Set<string>(),
      amountRawValues: new Set<string>(),
      amountCents: installmentAmountCents,
      paymentMethods: new Set<string>(),
      sourceRows: [],
      procedureKeys: new Set<string>(),
      hasFormulaFinancialValue: false,
    };
    if (row.cells[columns.installmentAmount]?.kind === "formula") {
      mutableInstallment.hasFormulaFinancialValue = true;
      event.structuralBlockers.add("FORMULA_FINANCIAL_VALUE_UNVERIFIED");
    }
    addIfPresent(mutableInstallment.numberVariants, installmentNumber);
    addIfPresent(mutableInstallment.dueDateVariants, installmentDueDate);
    addIfPresent(mutableInstallment.amountRawValues, installmentAmountRaw);
    addIfPresent(mutableInstallment.paymentMethods, paymentMethod);
    mutableInstallment.sourceRows.push(row.sourceRow);
    mutableInstallment.procedureKeys.add(procedureKey);
    event.installments.set(installmentKey, mutableInstallment);
    events.set(eventKey, event);
  }

  const finalizedEvents = [...events.values()]
    .map(finalizeEvent)
    .sort((left, right) => (left.rawRows[0]?.sourceRow ?? 0) - (right.rawRows[0]?.sourceRow ?? 0));
  return {
    schemaVersion: "local-procedure-installment-preview.v1",
    groupingBasis: "source_event_id",
    priceSemantics: "line_amount_hypothesis",
    installmentGroupingBasis: "number_due_date_amount_payment_method_candidate",
    toleranceCents: 1,
    activationEligibility: "blocked",
    sourceLabel: data.sourceLabel,
    sourceSheetIndex: sheet.index,
    sourceSheetName: sheet.name,
    sourceColumns: sheet.columns,
    sourceRowCount: finalizedEvents.reduce((sum, event) => sum + event.rawRows.length, 0),
    eventCount: finalizedEvents.length,
    procedureGroupCount: finalizedEvents.reduce((sum, event) => sum + event.procedures.length, 0),
    installmentCount: finalizedEvents.reduce((sum, event) => sum + event.installments.length, 0),
    completeInstallmentCandidateCount: finalizedEvents.reduce(
      (sum, event) => sum + event.installments.filter((installment) =>
        installment.numberVariants.length > 0 &&
        installment.dueDateVariants.length > 0 &&
        installment.amountCents !== null,
      ).length,
      0,
    ),
    incompleteInstallmentRowCount: finalizedEvents.reduce(
      (sum, event) => sum + event.installments.filter((installment) =>
        installment.numberVariants.length === 0 ||
        installment.dueDateVariants.length === 0 ||
        installment.amountCents === null,
      ).reduce((rows, installment) => rows + installment.sourceRows.length, 0),
      0,
    ),
    extraRawRowsBeyondUniqueInstallments: finalizedEvents.reduce(
      (sum, event) => sum + Math.max(0, event.rawRows.length - event.installments.length),
      0,
    ),
    matchedCount: finalizedEvents.filter((event) => event.status === "matched").length,
    mismatchCount: finalizedEvents.filter((event) => event.status === "mismatch").length,
    blockedCount: finalizedEvents.filter((event) => event.status === "blocked").length,
    eventsWithRepeatedInstallmentRows: finalizedEvents.filter((event) =>
      event.installments.some((installment) => installment.sourceRows.length > 1 && installment.procedureGroupCount > 1),
    ).length,
    events: finalizedEvents,
  };
}

export function parseMoneyToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-") return null;
  const negativeByParentheses = /^\(.*\)$/u.test(trimmed);
  let normalized = trimmed
    .replace(/^\(|\)$/gu, "")
    .replace(/\bBRL\b/giu, "")
    .replace(/R\$/giu, "")
    .replace(/[\s\u00a0]/gu, "");
  if (!/^-?[0-9.,]+$/u.test(normalized)) return null;
  if (!normalized || normalized === "-" || normalized === "." || normalized === ",") return null;
  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalIndex = Math.max(lastComma, lastDot);
    const decimalSeparator: "," | "." = lastComma > lastDot ? "," : ".";
    const groupingSeparator = decimalSeparator === "," ? "." : ",";
    const fractionalDigits = normalized.length - decimalIndex - 1;
    if (fractionalDigits < 1 || fractionalDigits > 2) return null;
    const unsigned = normalized.startsWith("-") ? normalized.slice(1) : normalized;
    const integerPart = unsigned.slice(0, unsigned.lastIndexOf(decimalSeparator));
    const integerGroups = integerPart.split(groupingSeparator);
    if (
      integerGroups.length < 2 ||
      integerGroups[0]?.length === 0 ||
      integerGroups[0]!.length > 3 ||
      integerGroups.slice(1).some((part) => part.length !== 3)
    ) return null;
    normalized = decimalSeparator === ","
      ? normalized.replace(/\./gu, "").replace(",", ".")
      : normalized.replace(/,/gu, "");
  } else if (lastComma >= 0) {
    const commas = normalized.match(/,/gu)?.length ?? 0;
    const fractionalDigits = normalized.length - lastComma - 1;
    if (commas === 1 && fractionalDigits === 3) return null;
    if (commas > 1) {
      if (fractionalDigits !== 3) return null;
      const unsigned = normalized.startsWith("-") ? normalized.slice(1) : normalized;
      const groups = unsigned.split(",");
      if (
        groups[0]?.length === 0 ||
        groups[0]!.length > 3 ||
        groups.slice(1).some((part) => part.length !== 3)
      ) return null;
      normalized = normalized.replace(/,/gu, "");
    } else {
      if (fractionalDigits < 1 || fractionalDigits > 2) return null;
      normalized = normalized.replace(",", ".");
    }
  } else if ((normalized.match(/\./gu) ?? []).length > 1) {
    const parts = normalized.split(".");
    const first = parts[0]?.startsWith("-") ? parts[0].slice(1) : parts[0];
    if (!first || first.length > 3 || parts.slice(1).some((part) => part.length !== 3)) return null;
    normalized = parts.join("");
  } else if (lastDot >= 0) {
    const fractionalDigits = normalized.length - lastDot - 1;
    if (fractionalDigits < 1 || fractionalDigits === 3 || fractionalDigits > 2) return null;
  }
  let parsed: Decimal;
  try {
    parsed = new Decimal(normalized);
  } catch {
    return null;
  }
  if (!parsed.isFinite()) return null;
  const signed = negativeByParentheses ? parsed.abs().negated() : parsed;
  const scaled = signed.mul(100);
  if (!scaled.isInteger()) return null;
  const cents = scaled;
  if (cents.abs().greaterThan(Number.MAX_SAFE_INTEGER)) return null;
  return cents.toNumber();
}

function finalizeEvent(event: MutableEvent): ProcedureInstallmentEvent {
  const blockers = new Set(event.structuralBlockers);
  const warnings = new Set<ProcedureInstallmentIssueCode>();
  if (event.names.size !== 1) blockers.add("EVENT_NAME_CONFLICT");
  if (event.dates.size !== 1) blockers.add("EVENT_DATE_CONFLICT");

  const procedureEntries = [...event.procedures.entries()];
  const procedureKeyToIndex = new Map(procedureEntries.map(([key], index) => [key, index]));
  const procedures = procedureEntries.map(([, procedure]): ProcedureGroup => {
    if (procedure.hasInvalidPriceValue || procedure.priceRawValues.size === 0 || procedure.priceCentsValues.size === 0) {
      blockers.add("PROCEDURE_PRICE_MISSING_OR_INVALID");
    } else if (procedure.priceCentsValues.size > 1) {
      blockers.add("PROCEDURE_PRICE_CONFLICT");
    }
    if (procedure.types.size > 1 || procedure.quantities.size > 1 || procedure.generalProducts.size > 1) {
      blockers.add("PROCEDURE_ATTRIBUTE_CONFLICT");
    }
    if (procedure.hasFormulaFinancialValue) blockers.add("FORMULA_FINANCIAL_VALUE_UNVERIFIED");
    return {
      procedureLabels: [...procedure.procedureLabels],
      productLabels: [...procedure.productLabels],
      types: [...procedure.types],
      quantities: [...procedure.quantities],
      generalProducts: [...procedure.generalProducts],
      priceRawValues: [...procedure.priceRawValues],
      priceCents: procedure.priceCentsValues.size === 1 ? [...procedure.priceCentsValues][0] ?? null : null,
      hasFormulaFinancialValue: procedure.hasFormulaFinancialValue,
      sourceRows: [...procedure.sourceRows].sort((left, right) => left - right),
    };
  });

  const installments = [...event.installments.values()]
    .map((installment): InstallmentGroup => {
      if (installment.numberVariants.size === 0 || installment.dueDateVariants.size === 0) {
        blockers.add("INSTALLMENT_IDENTITY_INCOMPLETE");
      }
      if (installment.amountCents === null) blockers.add("INSTALLMENT_AMOUNT_MISSING_OR_INVALID");
      if (installment.sourceRows.length > 1) warnings.add("INSTALLMENT_REPEATED_ACROSS_SOURCE_ROWS");
      if (installment.sourceRows.length > 1 && installment.procedureKeys.size === 1) {
        blockers.add("INSTALLMENT_DUPLICATE_WITHIN_PROCEDURE_GROUP");
      }
      if (installment.hasFormulaFinancialValue) blockers.add("FORMULA_FINANCIAL_VALUE_UNVERIFIED");
      return {
        numberVariants: [...installment.numberVariants],
        dueDateVariants: [...installment.dueDateVariants],
        amountRawValues: [...installment.amountRawValues],
        amountCents: installment.amountCents,
        paymentMethods: [...installment.paymentMethods],
        sourceRows: [...installment.sourceRows].sort((left, right) => left - right),
        procedureGroupCount: installment.procedureKeys.size,
        procedureGroupIndexes: [...installment.procedureKeys]
          .map((key) => procedureKeyToIndex.get(key))
          .filter((index): index is number => index !== undefined)
          .sort((left, right) => left - right),
        hasFormulaFinancialValue: installment.hasFormulaFinancialValue,
      };
    })
    .sort(compareInstallments);

  const procedureTotalCents = procedures.every((procedure) => procedure.priceCents !== null)
    ? sumCents(procedures.map((procedure) => procedure.priceCents ?? 0))
    : null;
  const installmentTotalCents = installments.every((installment) => installment.amountCents !== null)
    ? sumCents(installments.map((installment) => installment.amountCents ?? 0))
    : null;
  const rawInstallmentTotalCents = event.rawInstallmentAmountsCents.every((amount) => amount !== null)
    ? sumCents(event.rawInstallmentAmountsCents.map((amount) => amount ?? 0))
    : null;
  if (
    (procedures.every((procedure) => procedure.priceCents !== null) && procedureTotalCents === null) ||
    (installments.every((installment) => installment.amountCents !== null) && installmentTotalCents === null) ||
    (event.rawInstallmentAmountsCents.every((amount) => amount !== null) && rawInstallmentTotalCents === null)
  ) blockers.add("FINANCIAL_TOTAL_OUT_OF_RANGE");
  const varianceCents = procedureTotalCents === null || installmentTotalCents === null
    ? null
    : installmentTotalCents - procedureTotalCents;
  if (varianceCents !== null && Math.abs(varianceCents) > 1) warnings.add("TOTAL_MISMATCH");
  const status: ArithmeticReconciliationStatus = blockers.size > 0
    ? "blocked"
    : varianceCents !== null && Math.abs(varianceCents) <= 1
      ? "matched"
      : "mismatch";

  return {
    eventId: event.eventId,
    namesInSpreadsheet: [...event.names],
    recordDates: [...event.dates],
    procedures,
    installments,
    rawRows: [...event.rawRows].sort((left, right) => left.sourceRow - right.sourceRow),
    status,
    procedureTotalCents,
    installmentTotalCents,
    rawInstallmentTotalCents,
    varianceCents,
    toleranceCents: 1,
    activationEligibility: "blocked",
    blockers: [...blockers].sort(),
    warnings: [...warnings].sort(),
  };
}

function normalizeGroupingText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("pt-BR");
}

function normalizeSourceEventId(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

function collisionSafeKey(parts: readonly string[]): string {
  return parts.map((part) => `${part.length}:${part}`).join("");
}

function sumCents(values: readonly number[]): number | null {
  const total = values.reduce((sum, value) => sum.plus(value), new Decimal(0));
  if (!total.isInteger() || total.abs().greaterThan(Number.MAX_SAFE_INTEGER)) return null;
  return total.toNumber();
}

function findOperationalSheet(sheets: readonly LocalWorkbookSheet[]): LocalWorkbookSheet {
  const requiredHeaders = [
    "numero do atendimento",
    "procedimento",
    "parcela",
    "data vencimento",
    "valor parcela",
  ];
  const matchingSheets = sheets.filter((candidate) => {
    const headers = new Set(candidate.columns.map((column) => normalizeHeader(column.header)));
    return requiredHeaders.every((header) => headers.has(header));
  });
  if (matchingSheets.length > 1) throw new LocalWorkbookViewError("OPERATIONAL_INSTALLMENT_SHEET_AMBIGUOUS");
  const sheet = matchingSheets[0];
  if (!sheet) throw new LocalWorkbookViewError("OPERATIONAL_INSTALLMENT_SHEET_NOT_FOUND");
  return sheet;
}

function requiredColumnIndexes(sheet: LocalWorkbookSheet): RequiredColumnIndexes {
  const byHeader = new Map(sheet.columns.map((column, index) => [normalizeHeader(column.header), index]));
  const required = (header: string): number => {
    const index = byHeader.get(normalizeHeader(header));
    if (index === undefined) throw new LocalWorkbookViewError("REQUIRED_INSTALLMENT_COLUMN_MISSING");
    return index;
  };
  return {
    eventId: required("Número do Atendimento"),
    name: required("Cliente"),
    recordDate: required("Data"),
    type: required("Tipo"),
    procedure: required("Procedimento"),
    product: required("Produto"),
    quantity: required("Quantidade"),
    generalProducts: required("Produtos Gerais"),
    procedurePrice: required("Preço Procedimento"),
    paymentMethod: required("Meio de Pagamento"),
    installmentNumber: required("Parcela"),
    installmentDueDate: required("Data Vencimento"),
    installmentAmount: required("Valor Parcela"),
  };
}

function cellText(row: LocalWorkbookRow, index: number): string {
  return row.cells[index]?.text.trim() ?? "";
}

function addIfPresent(target: Set<string>, value: string): void {
  if (value.trim()) target.add(value.trim());
}

function compareInstallments(left: InstallmentGroup, right: InstallmentGroup): number {
  const leftLabel = left.numberVariants[0] ?? "";
  const rightLabel = right.numberVariants[0] ?? "";
  const leftNumber = Number(leftLabel.replace(/[^0-9.-]/gu, ""));
  const rightNumber = Number(rightLabel.replace(/[^0-9.-]/gu, ""));
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }
  const leftDueDate = left.dueDateVariants[0] ?? "";
  const rightDueDate = right.dueDateVariants[0] ?? "";
  const byDueDate = leftDueDate.localeCompare(rightDueDate, "pt-BR", { numeric: true });
  return byDueDate !== 0 ? byDueDate : leftLabel.localeCompare(rightLabel, "pt-BR", { numeric: true });
}
