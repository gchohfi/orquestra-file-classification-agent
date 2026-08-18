import { chmod, lstat, mkdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import JSZip from "jszip";
import { afterEach, describe, expect, it } from "vitest";
import {
  analyzeLocalAudienceWorkbook,
  simulatedAudienceGroup,
} from "../src/local/audience-preview.js";
import {
  renderAudiencePreviewHtml,
  writeAudiencePreviewHtmlReport,
} from "../src/reporting/html-audience-preview-report.js";
import {
  addMacroPayload,
  cleanupTemporaryBatches,
  temporaryBatch,
  writeWorkbook,
} from "./helpers.js";

afterEach(cleanupTemporaryBatches);

describe("prévia local de públicos", () => {
  it("mantém os limites dos sinais simulados exclusivos e determinísticos", () => {
    expect(simulatedAudienceGroup(59, 60)).toBe("no_action");
    expect(simulatedAudienceGroup(60, 60)).toBe("at_risk");
    expect(simulatedAudienceGroup(119, 60)).toBe("at_risk");
    expect(simulatedAudienceGroup(120, 60)).toBe("inactive");

    expect(simulatedAudienceGroup(89, 90)).toBe("no_action");
    expect(simulatedAudienceGroup(90, 90)).toBe("at_risk");
    expect(simulatedAudienceGroup(179, 90)).toBe("at_risk");
    expect(simulatedAudienceGroup(180, 90)).toBe("inactive");
  });

  it("agrupa somente por nome textual, usa o último registro válido e não promove identidades", async () => {
    const fixture = await syntheticPreviewFixture();
    const preview = await analyzeLocalAudienceWorkbook(fixture, { asOf: "2026-08-14" });

    expect(preview.distinctNameCount).toBe(3);
    expect(preview.diagnostics.workbookSheetCount).toBe(3);
    expect(preview.diagnostics.recognizedSheetCount).toBe(2);
    expect(preview.diagnostics.invalidDateRows).toBe(2);
    expect(preview.diagnostics.futureDateRows).toBe(1);
    expect(preview.diagnostics.namesWithoutValidRecord).toBe(3);

    for (const scenario of preview.scenarios) {
      expect(scenario.noActionCount + scenario.atRiskCount + scenario.inactiveCount).toBe(3);
      expect(scenario.releasedCount).toBe(0);
      expect(scenario.rows).toHaveLength(3);
      expect(scenario.rows[0]?.nameInSpreadsheet).toBe("Pessoa Sintética Antiga");
      expect(scenario.rows.every((row) => row.activationBlock === "Não ativável")).toBe(true);
      expect(scenario.rows.every((row) => row.confidence.startsWith("Baixa"))).toBe(true);
    }

    const recent = preview.scenarios[0]?.rows.find((row) => row.nameInSpreadsheet === "Pessoa Sintética Recente");
    expect(recent?.lastRecordOn).toBe("2026-08-10");
  });

  it("bloqueia macro antes de carregar a planilha de públicos", async () => {
    const fixture = await syntheticPreviewFixture();
    await addMacroPayload(fixture);

    await expect(
      analyzeLocalAudienceWorkbook(fixture, { asOf: "2026-08-14" }),
    ).rejects.toMatchObject({ code: "ACTIVE_CONTENT_DETECTED" });
  });

  it("bloqueia referência externa detectada no container XLSX", async () => {
    const fixture = await syntheticPreviewFixture();
    await addArchiveEntry(
      fixture,
      "xl/externalLinks/externalLink1.xml",
      "<externalLink xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"/>",
    );

    await expect(
      analyzeLocalAudienceWorkbook(fixture, { asOf: "2026-08-14" }),
    ).rejects.toMatchObject({ code: "EXTERNAL_WORKBOOK_LINK_DETECTED" });
  });

  it("bloqueia container XLSX com razão de compressão suspeita", async () => {
    const fixture = await syntheticPreviewFixture();
    await addArchiveEntry(
      fixture,
      "xl/media/conteudo-altamente-compressivel.bin",
      Buffer.alloc(2 * 1024 * 1024, 0x41),
      "DEFLATE",
    );

    await expect(
      analyzeLocalAudienceWorkbook(fixture, { asOf: "2026-08-14" }),
    ).rejects.toMatchObject({ code: "XLSX_COMPRESSION_RATIO_EXCEEDED" });
  });

  it("renderiza três cenários acessíveis, escapa nomes hostis e não inclui rede ou script", async () => {
    const fixture = await syntheticPreviewFixture();
    const preview = await analyzeLocalAudienceWorkbook(fixture, { asOf: "2026-08-14" });
    const html = renderAudiencePreviewHtml(preview, {
      generatedAt: new Date("2026-08-14T15:00:00Z"),
    });

    expect(html).toContain("Prévia não acionável");
    expect(html).toContain("Nome informado na planilha");
    expect(html).toContain("Último registro na planilha");
    expect(html).toContain("Liberados para uso");
    expect(html).toContain("Ver diagnóstico técnico");
    expect(html).toContain("scenario-60");
    expect(html).toContain("scenario-90");
    expect(html).toContain("scenario-120");
    expect(html).toContain("Pessoa &lt;/script&gt;&lt;img src=x onerror=alert(1)&gt; &amp; &quot;Teste&quot;");
    expect(html).not.toContain("Pessoa </script><img src=x onerror=alert(1)>");
    expect(html).not.toMatch(/<script\b/iu);
    expect(html).not.toMatch(/https?:\/\//iu);
    expect(html).not.toMatch(/\bfetch\s*\(/iu);
    expect(html).not.toContain("JSON.stringify");
    expect(html).toContain("default-src 'none'");

    const primary120 = renderAudiencePreviewHtml(preview, {
      generatedAt: new Date("2026-08-14T15:00:00Z"),
      defaultWindowDays: 120,
    });
    expect(primary120).toContain('id="scenario-120" value="120" checked');
    expect(primary120).not.toContain('id="scenario-90" value="90" checked');
    expect(primary120).toContain("Cluster simulado · 120 dias");
    expect(primary120).toContain("120 dias · simulado · visão principal");
  });

  it("grava somente o HTML com diretório 0700, arquivo 0600 e sem sobrescrever", async () => {
    const directory = await temporaryBatch();
    await chmod(directory, 0o700);
    const fixture = await syntheticPreviewFixture();
    const preview = await analyzeLocalAudienceWorkbook(fixture, { asOf: "2026-08-14" });
    const output = join(directory, "relatorios", "preview.html");

    await writeAudiencePreviewHtmlReport(output, preview, {
      generatedAt: new Date("2026-08-14T15:00:00Z"),
    });

    expect((await stat(join(directory, "relatorios"))).mode & 0o777).toBe(0o700);
    expect((await stat(output)).mode & 0o777).toBe(0o600);
    expect(await readFile(output, "utf8")).toContain("Pessoa Sintética Antiga");
    await expect(writeAudiencePreviewHtmlReport(output, preview)).rejects.toMatchObject({
      code: "REPORT_ALREADY_EXISTS",
    });

    const realParent = join(directory, "destino-real");
    const linkedParent = join(directory, "destino-redirecionado");
    await mkdir(join(realParent, "relatorios"), { recursive: true });
    await symlink(realParent, linkedParent, "dir");
    await expect(
      writeAudiencePreviewHtmlReport(join(linkedParent, "relatorios", "preview.html"), preview),
    ).rejects.toMatchObject({ code: "REPORT_DIRECTORY_NOT_REGULAR" });
    expect((await lstat(linkedParent)).isSymbolicLink()).toBe(true);
  });
});

async function addArchiveEntry(
  path: string,
  entryName: string,
  content: string | Buffer,
  compression: "STORE" | "DEFLATE" = "STORE",
): Promise<void> {
  const zip = await JSZip.loadAsync(await readFile(path));
  zip.file(entryName, content);
  await writeFile(
    path,
    await zip.generateAsync({
      type: "nodebuffer",
      compression,
      ...(compression === "DEFLATE" ? { compressionOptions: { level: 9 } } : {}),
    }),
  );
}

async function syntheticPreviewFixture(): Promise<string> {
  const directory = await temporaryBatch();
  return writeWorkbook(directory, "base-sintetica.xlsx", (workbook) => {
    const ignored = workbook.addWorksheet("Instruções sintéticas");
    ignored.addRow(["Texto", "Observação"]);
    ignored.addRow(["Sem dados pessoais", "Somente teste"]);

    const first = workbook.addWorksheet("Registros sintéticos A");
    first.addRow(["Nome do Paciente", "Data Atendimento"]);
    first.addRow(["Pessoa Sintética Recente", "01/08/2026"]);
    first.addRow(["Pessoa Sintética Antiga", "14/08/2025"]);
    first.addRow(['Pessoa </script><img src=x onerror=alert(1)> & "Teste"', "16/05/2026"]);
    first.addRow(["Pessoa Sem Data", "data inválida"]);
    first.addRow(["Pessoa do Futuro", "15/08/2026"]);
    first.addRow(["Pessoa com Fórmula", { formula: "TODAY()", result: "14/08/2026" }]);

    const second = workbook.addWorksheet("Registros sintéticos B");
    second.addRow(["Paciente", "Data da Consulta"]);
    second.addRow(["  pessoa sintética recente  ", "10/08/2026"]);
  });
}
