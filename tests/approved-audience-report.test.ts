import { chmod, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { analyzeLocalAudienceWorkbook } from "../src/local/audience-preview.js";
import {
  renderApprovedAudienceHtml,
  writeApprovedAudienceHtmlReport,
} from "../src/reporting/html-approved-audience-report.js";
import { cleanupTemporaryBatches, temporaryBatch, writeWorkbook } from "./helpers.js";

afterEach(cleanupTemporaryBatches);

describe("relatório real de públicos com regra aprovada", () => {
  it("aplica a regra aprovada de 120 dias sem linguagem de simulação", async () => {
    const preview = await approvedFixture();
    const html = renderApprovedAudienceHtml(preview, {
      approvedWindowDays: 120,
      generatedAt: new Date("2026-08-14T15:00:00Z"),
    });

    expect(html).toContain("Dados reais · regra aprovada");
    expect(html).toContain("Menos de 120 dias: sem ação");
    expect(html).toContain("Paciente em risco");
    expect(html).toContain("Paciente inativo");
    expect(html).toContain("Cluster pela regra aprovada");
    expect(html).toContain("Pessoa Sintética Recente");
    expect(html).toContain("Pessoa &lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("Pessoa </script><img src=x onerror=alert(1)>");
    expect(html).not.toMatch(/\b(?:simulad[oa]|prévia)\b/iu);
    expect(html).not.toMatch(/<script\b/iu);
    expect(html).not.toMatch(/https?:\/\//iu);
    expect(html).not.toMatch(/\bfetch\s*\(/iu);
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("Somente relatório");
  });

  it("grava somente HTML com 0700/0600 e não sobrescreve", async () => {
    const preview = await approvedFixture();
    const directory = await temporaryBatch();
    await chmod(directory, 0o700);
    const output = join(directory, "relatorios", "publicos-reais.html");
    await writeApprovedAudienceHtmlReport(output, preview, { approvedWindowDays: 120 });

    expect((await stat(join(directory, "relatorios"))).mode & 0o777).toBe(0o700);
    expect((await stat(output)).mode & 0o777).toBe(0o600);
    expect(await readFile(output, "utf8")).toContain("Relatório real de públicos");
    await expect(writeApprovedAudienceHtmlReport(output, preview, { approvedWindowDays: 120 })).rejects.toMatchObject({
      code: "REPORT_ALREADY_EXISTS",
    });
  });
});

async function approvedFixture() {
  const directory = await temporaryBatch();
  const path = await writeWorkbook(directory, "base-aprovada-sintetica.xlsx", (workbook) => {
    const sheet = workbook.addWorksheet("Registros sintéticos");
    sheet.addRow(["Nome do Paciente", "Data Atendimento"]);
    sheet.addRow(["Pessoa Sintética Recente", "10/08/2026"]);
    sheet.addRow(["Pessoa Sintética em Risco", "16/03/2026"]);
    sheet.addRow(["Pessoa Sintética Inativa", "01/01/2025"]);
    sheet.addRow(["Pessoa </script><img src=x onerror=alert(1)>", "16/03/2026"]);
  });
  return analyzeLocalAudienceWorkbook(path, { asOf: "2026-08-14" });
}
