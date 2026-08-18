import { chmod, lstat, mkdir, stat, symlink } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildProcedureInstallmentView,
  parseMoneyToCents,
  type ProcedureInstallmentView,
} from "../src/local/procedure-installment-view.js";
import {
  readLocalWorkbookDataView,
  type LocalWorkbookDataView,
  type LocalWorkbookRow,
} from "../src/local/workbook-data-view.js";
import {
  renderProcedureInstallmentHtml,
  writeProcedureInstallmentHtmlReport,
} from "../src/reporting/html-procedure-installment-report.js";
import {
  cleanupTemporaryBatches,
  temporaryBatch,
  writeWorkbook,
} from "./helpers.js";

afterEach(cleanupTemporaryBatches);

const OPERATIONAL_HEADERS = [
  "Número do Atendimento",
  "Cliente",
  "Data",
  "Tipo",
  "Procedimento",
  "Produto",
  "Quantidade",
  "Produtos Gerais",
  "Preço Procedimento",
  "Meio de Pagamento",
  "Parcela",
  "Data Vencimento",
  "Valor Parcela",
] as const;

type OperationalRow = Readonly<{
  eventId: string;
  client?: string;
  recordDate?: string;
  type?: string;
  procedure?: string;
  product?: string;
  quantity?: string | number;
  generalProducts?: string;
  procedurePrice?: unknown;
  paymentMethod?: string;
  installmentNumber?: string | number;
  dueDate?: string;
  installmentAmount?: unknown;
}>;

describe("agrupamento local de procedimentos e parcelas", () => {
  it("mantém um procedimento, deduplica duas parcelas e preserva cada linha bruta", async () => {
    const { raw, view } = await buildSyntheticView([
      row({ eventId: "AT-001", procedurePrice: "R$ 100,00", installmentNumber: 1, installmentAmount: "50,00" }),
      row({ eventId: "AT-001", procedurePrice: "R$ 100,00", installmentNumber: 2, dueDate: "10/09/2026", installmentAmount: "50,00" }),
    ]);

    expect(view.eventCount).toBe(1);
    expect(view.procedureGroupCount).toBe(1);
    expect(view.installmentCount).toBe(2);
    expect(view.sourceRowCount).toBe(2);
    expect(view.matchedCount).toBe(1);

    const event = view.events[0];
    expect(event).toMatchObject({
      status: "matched",
      procedureTotalCents: 10_000,
      installmentTotalCents: 10_000,
      varianceCents: 0,
    });
    expect(event?.procedures[0]?.sourceRows).toEqual([2, 3]);
    expect(event?.installments.map((installment) => installment.sourceRows)).toEqual([[2], [3]]);
    expectRawRowsPreserved(raw, view);
  });

  it("desmonta o produto cartesiano 2 procedimentos x 3 parcelas sem somar repetições", async () => {
    const rows: OperationalRow[] = [];
    const procedures = [
      { procedure: "Procedimento Sintético Alfa", procedurePrice: "40,00" },
      { procedure: "Procedimento Sintético Beta", procedurePrice: "60,00" },
    ];
    const installments = [
      { installmentNumber: 1, dueDate: "10/08/2026", installmentAmount: "30,00" },
      { installmentNumber: 2, dueDate: "10/09/2026", installmentAmount: "30,00" },
      { installmentNumber: 3, dueDate: "10/10/2026", installmentAmount: "40,00" },
    ];
    for (const procedure of procedures) {
      for (const installment of installments) {
        rows.push(row({ eventId: "AT-CARTESIANO", ...procedure, ...installment }));
      }
    }

    const { raw, view } = await buildSyntheticView(rows);
    const event = view.events[0];

    expect(view.sourceRowCount).toBe(6);
    expect(view.procedureGroupCount).toBe(2);
    expect(view.installmentCount).toBe(3);
    expect(view.extraRawRowsBeyondUniqueInstallments).toBe(3);
    expect(view.eventsWithRepeatedInstallmentRows).toBe(1);
    expect(event).toMatchObject({
      status: "matched",
      procedureTotalCents: 10_000,
      installmentTotalCents: 10_000,
      rawInstallmentTotalCents: 20_000,
      varianceCents: 0,
    });
    expect(event?.procedures.map((procedure) => procedure.sourceRows.length)).toEqual([3, 3]);
    expect(event?.installments.map((installment) => installment.sourceRows.length)).toEqual([2, 2, 2]);
    expectRawRowsPreserved(raw, view);
  });

  it("aceita diferença de até um centavo e marca divergência acima da tolerância", async () => {
    const withinTolerance = await buildSyntheticView([
      row({
        eventId: "AT-TOLERANCIA",
        procedurePrice: "100,00",
        installmentNumber: 1,
        installmentAmount: "99,99",
      }),
    ]);
    expect(withinTolerance.view.events[0]).toMatchObject({
      status: "matched",
      procedureTotalCents: 10_000,
      installmentTotalCents: 9_999,
      varianceCents: -1,
    });

    const mismatch = await buildSyntheticView([
      row({
        eventId: "AT-DIVERGENTE",
        procedurePrice: "100,00",
        installmentNumber: 1,
        installmentAmount: "99,98",
      }),
    ]);
    expect(mismatch.view.events[0]).toMatchObject({
      status: "mismatch",
      procedureTotalCents: 10_000,
      installmentTotalCents: 9_998,
      varianceCents: -2,
    });
  });

  it("bloqueia preços conflitantes para o mesmo procedimento", async () => {
    const { view } = await buildSyntheticView([
      row({ eventId: "AT-PRECO", procedurePrice: "100,00", installmentNumber: 1, installmentAmount: "50,00" }),
      row({ eventId: "AT-PRECO", procedurePrice: "110,00", installmentNumber: 2, dueDate: "10/09/2026", installmentAmount: "50,00" }),
    ]);

    expect(view.events[0]?.status).toBe("blocked");
    expect(view.events[0]?.blockers).toContain("PROCEDURE_PRICE_CONFLICT");
    expect(view.events[0]?.procedureTotalCents).toBeNull();
  });

  it("mantém tuplas distintas quando o número de parcela reaparece com vencimento e valor diferentes", async () => {
    const { view } = await buildSyntheticView([
      row({ eventId: "AT-PARCELA", procedurePrice: "100,00", installmentNumber: 1, dueDate: "10/08/2026", installmentAmount: "50,00" }),
      row({ eventId: "AT-PARCELA", procedurePrice: "100,00", installmentNumber: 1, dueDate: "10/09/2026", installmentAmount: "55,00" }),
    ]);

    expect(view.events[0]?.installments).toHaveLength(2);
    expect(view.events[0]?.installmentTotalCents).toBe(10_500);
    expect(view.events[0]?.status).toBe("mismatch");
    expect(view.events[0]?.blockers).not.toContain("INSTALLMENT_NUMBER_CONFLICT");
    expect(view.events[0]?.rawRows).toHaveLength(2);
  });

  it("mantém resultado armazenado de fórmula como evidência, mas bloqueia a reconciliação", async () => {
    const { raw, view } = await buildSyntheticView([
      row({
        eventId: "AT-FORMULA",
        procedurePrice: { formula: "40+60", result: 100 },
        installmentNumber: 1,
        installmentAmount: "100,00",
      }),
    ]);

    const operationalSheet = raw.sheets.find((sheet) => sheet.name === "Operacional sintético");
    const cachedFormula = operationalSheet?.rows[1]?.cells[8];
    expect(cachedFormula).toMatchObject({ kind: "formula", formula: "=40+60", text: "100" });
    expect(view.events[0]?.status).toBe("blocked");
    expect(view.events[0]?.blockers).toContain("FORMULA_FINANCIAL_VALUE_UNVERIFIED");
    expect(view.events[0]?.rawRows).toHaveLength(1);
  });

  it("também bloqueia fórmula armazenada no valor da parcela", async () => {
    const { raw, view } = await buildSyntheticView([
      row({
        eventId: "AT-FORMULA-PARCELA",
        procedurePrice: "100,00",
        installmentNumber: 1,
        installmentAmount: { formula: "50+50", result: 100 },
      }),
    ]);

    const operationalSheet = raw.sheets.find((sheet) => sheet.name === "Operacional sintético");
    expect(operationalSheet?.rows[1]?.cells[12]).toMatchObject({
      kind: "formula",
      formula: "=50+50",
      text: "100",
    });
    expect(view.events[0]?.status).toBe("blocked");
    expect(view.events[0]?.blockers).toContain("FORMULA_FINANCIAL_VALUE_UNVERIFIED");
  });

  it("bloqueia duplicata exata no mesmo procedimento e separa meios de pagamento diferentes", async () => {
    const duplicate = await buildSyntheticView([
      row({ eventId: "AT-DUPLICADA", installmentNumber: 1, installmentAmount: "100,00" }),
      row({ eventId: "AT-DUPLICADA", installmentNumber: 1, installmentAmount: "100,00" }),
    ]);
    expect(duplicate.view.events[0]?.installments).toHaveLength(1);
    expect(duplicate.view.events[0]?.status).toBe("blocked");
    expect(duplicate.view.events[0]?.blockers).toContain("INSTALLMENT_DUPLICATE_WITHIN_PROCEDURE_GROUP");

    const paymentConflict = await buildSyntheticView([
      row({ eventId: "AT-MEIO", paymentMethod: "Cartão A", installmentNumber: 1, installmentAmount: "100,00" }),
      row({ eventId: "AT-MEIO", paymentMethod: "Cartão B", installmentNumber: 1, installmentAmount: "100,00" }),
    ]);
    expect(paymentConflict.view.events[0]?.installments).toHaveLength(2);
    expect(paymentConflict.view.events[0]?.installmentTotalCents).toBe(20_000);
    expect(paymentConflict.view.events[0]?.status).toBe("mismatch");
    expect(paymentConflict.view.events[0]?.blockers).not.toContain("INSTALLMENT_PAYMENT_METHOD_CONFLICT");
    expect(paymentConflict.view.events[0]?.activationEligibility).toBe("blocked");
  });

  it("faz parsing monetário determinístico em centavos com Decimal", () => {
    expect(parseMoneyToCents("R$ 1.234,56")).toBe(123_456);
    expect(parseMoneyToCents("1234.56")).toBe(123_456);
    expect(parseMoneyToCents("0,10")).toBe(10);
    expect(parseMoneyToCents("0,20")).toBe(20);
    expect(parseMoneyToCents("0,30")).toBe(30);
    expect(parseMoneyToCents("1.234")).toBeNull();
    expect(parseMoneyToCents("1,234")).toBeNull();
    expect(parseMoneyToCents("12,34,567")).toBeNull();
    expect(parseMoneyToCents("10,001")).toBeNull();
    expect(parseMoneyToCents("valor inválido")).toBeNull();
    expect(parseMoneyToCents("")).toBeNull();
  });
});

describe("relatório HTML local de procedimentos e parcelas", () => {
  it("escapa todo conteúdo identificado e não cria script, rede ou links clicáveis", async () => {
    const { view } = await buildSyntheticView([
      row({
        eventId: "AT-XSS",
        client: 'Pessoa </script><img src=x onerror=alert(1)> & "Teste"',
        procedure: "Procedimento <svg onload=alert(2)>",
        generalProducts: "https://example.test/segredo",
        procedurePrice: "100,00",
        installmentNumber: 1,
        installmentAmount: "100,00",
      }),
    ], "Operacional <img onerror=3>");

    const html = renderProcedureInstallmentHtml(view, {
      generatedAt: new Date("2026-08-14T15:00:00Z"),
    });

    expect(html).toContain("procedimentos e parcelas");
    expect(html).toContain("Linhas brutas");
    expect(html).toContain("Pessoa &lt;/script&gt;&lt;img src=x onerror=alert(1)&gt; &amp; &quot;Teste&quot;");
    expect(html).toContain("Procedimento &lt;svg onload=alert(2)&gt;");
    expect(html).toContain("https://example.test/segredo");
    expect(html).not.toContain('</script><img src=x onerror=alert(1)>');
    expect(html).not.toMatch(/<script\b/iu);
    expect(html).not.toMatch(/<img\b/iu);
    expect(html).not.toMatch(/<svg\b/iu);
    expect(html).not.toMatch(/<link\b/iu);
    expect(html).not.toMatch(/<a\b[^>]*href=["']https?:/iu);
    expect(html).not.toMatch(/\bfetch\s*\(/iu);
    expect(html).not.toMatch(/XMLHttpRequest/iu);
    expect(html).not.toMatch(/\b(?:id|href|data-[\w-]+)=["'][^"']*AT-XSS/iu);
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("script-src 'none'");
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("provisória");
    expect(html).toContain("não acionável");
    expect(html).toContain("não cria uma pessoa canônica");
  });

  it("grava somente HTML com 0700/0600, não sobrescreve e recusa diretório simbólico", async () => {
    const { view } = await buildSyntheticView([
      row({ eventId: "AT-WRITER", procedurePrice: "100,00", installmentNumber: 1, installmentAmount: "100,00" }),
    ]);
    const directory = await temporaryBatch();
    await chmod(directory, 0o700);
    const output = join(directory, "relatorios", "procedimentos-parcelas.html");

    await writeProcedureInstallmentHtmlReport(output, view, {
      generatedAt: new Date("2026-08-14T15:00:00Z"),
    });

    expect((await stat(join(directory, "relatorios"))).mode & 0o777).toBe(0o700);
    expect((await stat(output)).mode & 0o777).toBe(0o600);
    await expect(writeProcedureInstallmentHtmlReport(output, view)).rejects.toMatchObject({
      code: "REPORT_ALREADY_EXISTS",
    });

    const realDirectory = join(directory, "diretorio-real");
    const linkedDirectory = join(directory, "diretorio-link");
    await mkdir(realDirectory);
    await symlink(realDirectory, linkedDirectory, "dir");
    await expect(
      writeProcedureInstallmentHtmlReport(join(linkedDirectory, "out.html"), view),
    ).rejects.toMatchObject({ code: "REPORT_DIRECTORY_NOT_REGULAR" });
    expect((await lstat(linkedDirectory)).isSymbolicLink()).toBe(true);
  });
});

function row(overrides: OperationalRow): OperationalRow {
  return {
    client: "Pessoa Sintética Alfa",
    recordDate: "01/08/2026",
    type: "Atendimento sintético",
    procedure: "Procedimento Sintético Alfa",
    product: "",
    quantity: 1,
    generalProducts: "",
    procedurePrice: "100,00",
    paymentMethod: "Cartão sintético",
    installmentNumber: 1,
    dueDate: "10/08/2026",
    installmentAmount: "100,00",
    ...overrides,
  };
}

async function buildSyntheticView(
  rows: readonly OperationalRow[],
  sheetName = "Operacional sintético",
): Promise<{ raw: LocalWorkbookDataView; view: ProcedureInstallmentView }> {
  const directory = await temporaryBatch();
  const source = await writeWorkbook(directory, "procedimentos-parcelas-sinteticos.xlsx", (workbook) => {
    const summary = workbook.addWorksheet("Resumo sintético");
    summary.addRow(["Nota", "Somente dados artificiais de teste"]);

    const sheet = workbook.addWorksheet(sheetName);
    sheet.addRow([...OPERATIONAL_HEADERS]);
    for (const input of rows) sheet.addRow(toCellValues(input));
  });
  const raw = await readLocalWorkbookDataView(source);
  return { raw, view: buildProcedureInstallmentView(raw) };
}

function toCellValues(input: OperationalRow): unknown[] {
  return [
    input.eventId,
    input.client ?? "",
    input.recordDate ?? "",
    input.type ?? "",
    input.procedure ?? "",
    input.product ?? "",
    input.quantity ?? "",
    input.generalProducts ?? "",
    input.procedurePrice ?? "",
    input.paymentMethod ?? "",
    input.installmentNumber ?? "",
    input.dueDate ?? "",
    input.installmentAmount ?? "",
  ];
}

function expectRawRowsPreserved(raw: LocalWorkbookDataView, view: ProcedureInstallmentView): void {
  const operationalSheet = raw.sheets.find((sheet) => sheet.index === view.sourceSheetIndex);
  const expectedRows = operationalSheet?.rows.filter(
    (candidate) =>
      candidate.sourceRow !== operationalSheet.headerRow &&
      candidate.cells.some((cell) => cell.kind !== "empty"),
  ) ?? [];
  const groupedRows = view.events
    .flatMap((event) => event.rawRows)
    .sort((left, right) => left.sourceRow - right.sourceRow);

  expect(groupedRows).toHaveLength(expectedRows.length);
  expect(groupedRows.map((candidate) => candidate.sourceRow)).toEqual(
    expectedRows.map((candidate) => candidate.sourceRow),
  );
  for (const [index, expected] of expectedRows.entries()) {
    expect(groupedRows[index]).toBe(expected as LocalWorkbookRow);
  }
}
