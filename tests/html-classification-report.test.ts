import { describe, expect, it } from "vitest";
import { clinicCanonicalCatalog } from "../src/domain/catalog.js";
import { renderClassificationHtml } from "../src/reporting/html-classification-report.js";
import { classifierWith, defaultRequest, temporaryBatch, writeWorkbook } from "./helpers.js";
import { cleanupTemporaryBatches } from "./helpers.js";
import { afterEach } from "vitest";

afterEach(cleanupTemporaryBatches);

describe("relatório HTML de classificação", () => {
  it("mostra o plano sem revelar nomes de arquivo, aba, cabeçalho desconhecido ou célula", async () => {
    const directory = await temporaryBatch();
    await writeWorkbook(directory, "Paciente Ana 12345678900.xlsx", (workbook) => {
      const sheet = workbook.addWorksheet("Ana Souza - Particular");
      sheet.addRow(["Nome do Paciente", "ana.souza@example.com"]);
      sheet.addRow(["Ana Souza", "segredo clínico"]);
    });
    const result = await classifierWith().classifyDirectory(directory, defaultRequest());

    const html = renderClassificationHtml(result, clinicCanonicalCatalog, {
      generatedAt: new Date("2026-08-14T12:00:00Z"),
    });

    expect(html).toContain("ClassificationPlanDraft");
    expect(html).toContain("Mapeamento das colunas");
    expect(html).toContain("Arquivo 1 · Aba 1");
    expect(html).toContain("Nome da pessoa");
    expect(html).not.toContain("Paciente Ana 12345678900.xlsx");
    expect(html).not.toContain("Ana Souza - Particular");
    expect(html).not.toContain("ana.souza@example.com");
    expect(html).not.toContain("segredo clínico");
    expect(html).not.toContain(">Ana Souza<");
  });

  it("escapa conteúdo livre em um resultado de falha", () => {
    const html = renderClassificationHtml(
      { status: "failed", errorCode: "<script>alert(1)</script>", correlationId: "corr&1" },
      clinicCanonicalCatalog,
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("corr&amp;1");
  });
});
