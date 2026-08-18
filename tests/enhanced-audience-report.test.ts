import { chmod, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildEnhancedAudienceAnalysis } from "../src/local/enhanced-audience-analysis.js";
import type {
  ProcedureGroup,
  ProcedureInstallmentEvent,
  ProcedureInstallmentIssueCode,
  ProcedureInstallmentView,
} from "../src/local/procedure-installment-view.js";
import {
  renderEnhancedAudienceHtml,
  writeEnhancedAudienceHtmlReport,
} from "../src/reporting/html-enhanced-audience-report.js";
import { cleanupTemporaryBatches, temporaryBatch } from "./helpers.js";

afterEach(cleanupTemporaryBatches);

describe("teste V2 de clusterização", () => {
  it("combina recência, frequência, valor e afinidade em seis clusters exclusivos", () => {
    const analysis = buildEnhancedAudienceAnalysis(syntheticView(), { asOf: "2026-08-14" });

    expect(analysis.totalNameCount).toBe(6);
    expect(analysis.sourceEventCount).toBe(9);
    expect(analysis.clusterCounts).toEqual({
      recent_one_time: 1,
      active_repeat: 1,
      risk_one_time: 1,
      risk_repeat: 1,
      inactive_one_time: 1,
      inactive_repeat: 1,
    });
    expect(analysis.reliableValueNameCount).toBe(5);
    expect(analysis.incompleteValueNameCount).toBe(1);
    expect(analysis.vipThresholdCents).toBe(900_000);
    expect(analysis.vipCandidateCount).toBe(2);
    expect(analysis.priorityReactivationCount).toBe(2);
    expect(analysis.crossSellReviewCount).toBe(3);
    expect(analysis.rows.every((row) => row.activationEligibility === "report_only")).toBe(true);
  });

  it("renderiza dados identificados com escape e sem rede, script ou JSON", () => {
    const analysis = buildEnhancedAudienceAnalysis(syntheticView(), { asOf: "2026-08-14" });
    const html = renderEnhancedAudienceHtml(analysis, { generatedAt: new Date("2026-08-14T15:00:00Z") });

    expect(html).toContain("Teste V2 real · somente leitura");
    expect(html).toContain("Recência + frequência + valor + afinidade");
    expect(html).toContain("VIP candidato");
    expect(html).toContain("Cross-sell para revisão");
    expect(html).toContain("Pessoa &lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("Pessoa </script><img src=x onerror=alert(1)>");
    expect(html).not.toMatch(/<script\b/iu);
    expect(html).not.toMatch(/https?:\/\//iu);
    expect(html).not.toMatch(/\bfetch\s*\(/iu);
    expect(html).not.toContain("JSON.stringify");
    expect(html).toContain("default-src 'none'");
  });

  it("grava com 0700/0600 e não sobrescreve", async () => {
    const analysis = buildEnhancedAudienceAnalysis(syntheticView(), { asOf: "2026-08-14" });
    const directory = await temporaryBatch();
    await chmod(directory, 0o700);
    const output = join(directory, "relatorios", "teste-v2.html");
    await writeEnhancedAudienceHtmlReport(output, analysis);

    expect((await stat(join(directory, "relatorios"))).mode & 0o777).toBe(0o700);
    expect((await stat(output)).mode & 0o777).toBe(0o600);
    expect(await readFile(output, "utf8")).toContain("Teste V2 de clusterização");
    await expect(writeEnhancedAudienceHtmlReport(output, analysis)).rejects.toMatchObject({
      code: "REPORT_ALREADY_EXISTS",
    });
  });
});

function syntheticView(): ProcedureInstallmentView {
  const events = [
    event("Pessoa </script><img src=x onerror=alert(1)>", "10/08/2026", 100_000, "Consulta"),
    event("Pessoa Ativa Recorrente", "01/07/2026", 500_000, "Toxina"),
    event("Pessoa Ativa Recorrente", "10/08/2026", 500_000, "Toxina"),
    event("Pessoa Risco Pontual", "01/04/2026", 900_000, "Preenchedor"),
    event("Pessoa Risco Recorrente", "01/02/2026", 400_000, "Linear Z"),
    event("Pessoa Risco Recorrente", "15/03/2026", 500_000, "Linear Z"),
    event("Pessoa Inativa Pontual", "01/01/2025", 200_000, "Bioestímulo", ["PROCEDURE_PRICE_CONFLICT"]),
    event("Pessoa Inativa Recorrente", "01/01/2025", 300_000, "Fios"),
    event("Pessoa Inativa Recorrente", "01/02/2025", 300_000, "Fios"),
  ];
  return {
    schemaVersion: "local-procedure-installment-preview.v1",
    groupingBasis: "source_event_id",
    priceSemantics: "line_amount_hypothesis",
    installmentGroupingBasis: "number_due_date_amount_payment_method_candidate",
    toleranceCents: 1,
    activationEligibility: "blocked",
    sourceLabel: "sintetico.xlsx",
    sourceSheetIndex: 1,
    sourceSheetName: "Sintética",
    sourceColumns: [],
    sourceRowCount: events.length,
    eventCount: events.length,
    procedureGroupCount: events.length,
    installmentCount: events.length,
    completeInstallmentCandidateCount: events.length,
    incompleteInstallmentRowCount: 0,
    extraRawRowsBeyondUniqueInstallments: 0,
    matchedCount: events.length - 1,
    mismatchCount: 0,
    blockedCount: 1,
    eventsWithRepeatedInstallmentRows: 0,
    events,
  };
}

function event(
  name: string,
  recordDate: string,
  valueCents: number,
  procedureLabel: string,
  blockers: readonly ProcedureInstallmentIssueCode[] = [],
): ProcedureInstallmentEvent {
  const procedure: ProcedureGroup = {
    procedureLabels: [procedureLabel],
    productLabels: [],
    types: [],
    quantities: ["1"],
    generalProducts: [],
    priceRawValues: [String(valueCents / 100)],
    priceCents: blockers.includes("PROCEDURE_PRICE_CONFLICT") ? null : valueCents,
    hasFormulaFinancialValue: false,
    sourceRows: [2],
  };
  return {
    eventId: `${name}-${recordDate}`,
    namesInSpreadsheet: [name],
    recordDates: [recordDate],
    procedures: [procedure],
    installments: [],
    rawRows: [],
    status: blockers.length > 0 ? "blocked" : "matched",
    procedureTotalCents: blockers.includes("PROCEDURE_PRICE_CONFLICT") ? null : valueCents,
    installmentTotalCents: valueCents,
    rawInstallmentTotalCents: valueCents,
    varianceCents: 0,
    toleranceCents: 1,
    activationEligibility: "blocked",
    blockers,
    warnings: [],
  };
}
