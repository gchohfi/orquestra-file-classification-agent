import { chmod, lstat, mkdir, stat, symlink } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readLocalWorkbookDataView } from "../src/local/workbook-data-view.js";
import {
  renderLocalWorkbookDataHtml,
  writeLocalWorkbookDataHtmlReport,
} from "../src/reporting/html-local-workbook-data-report.js";
import {
  addMacroPayload,
  cleanupTemporaryBatches,
  temporaryBatch,
  writeWorkbook,
} from "./helpers.js";

afterEach(cleanupTemporaryBatches);

describe("visualizador local dos dados reais", () => {
  it("preserva todas as abas, linhas, células, estados e coordenadas sem deduplicar", async () => {
    const source = await syntheticSensitiveWorkbook();
    const data = await readLocalWorkbookDataView(source);

    expect(data.sheetCount).toBe(3);
    expect(data.distinctWrittenNameCount).toBe(3);
    expect(data.repeatedNameDateRowCount).toBe(2);
    expect(data.formulaCellCount).toBe(1);
    expect(data.externalLinkCellCount).toBe(1);
    expect(data.containerAlertCodes).toEqual([]);

    const first = data.sheets[0];
    expect(first?.name).toBe("Fonte <script>");
    expect(first?.rows).toHaveLength(first?.physicalRowCount ?? -1);
    expect(first?.rows[0]?.sourceRow).toBe(1);
    expect(first?.rows[3]?.sourceRow).toBe(4);
    expect(first?.rows[3]?.cells.every((cell) => cell.kind === "empty")).toBe(true);
    expect(first?.rows[4]?.hidden).toBe(true);
    expect(first?.columns[4]?.hidden).toBe(true);
    expect(first?.rows[1]?.sameNameDateRowCount).toBe(2);
    expect(first?.rows[2]?.sameNameDateRowCount).toBe(2);
    expect(first?.rows[1]?.cells[6]).toMatchObject({ kind: "formula", formula: "=D2*2" });
    expect(first?.rows[1]?.cells[5]).toMatchObject({
      kind: "link",
      externalTarget: "https://example.test/documento?nome=Pessoa",
    });
    expect(first?.rows[5]?.cells[5]?.mergedMaster).toBe("F6");
    expect(first?.rows[5]?.cells[6]?.mergedMaster).toBe("F6");
    expect(data.sheets[1]?.state).toBe("hidden");
    expect(data.sheets[2]?.state).toBe("veryHidden");
  });

  it("renderiza valores e fórmulas sintéticos com escape, sem rede, script ou links clicáveis", async () => {
    const source = await syntheticSensitiveWorkbook();
    const data = await readLocalWorkbookDataView(source);
    const html = renderLocalWorkbookDataHtml(data, {
      generatedAt: new Date("2026-08-14T15:00:00Z"),
    });

    expect(html).toContain("Dados reais e sensíveis");
    expect(html).toContain("Não some os valores desta tela");
    expect(html).toContain("Colunas essenciais");
    expect(html).toContain("Todas as colunas da origem");
    expect(html).toContain("Aba 1<br>linha 2");
    expect(html).toContain("Pessoa Sintética Alfa");
    expect(html).toContain("1234.56");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt; &amp; &quot;teste&quot;");
    expect(html).not.toContain('<img src=x onerror=alert(1)> & "teste"');
    expect(html).toContain("Resultado armazenado no XLSX");
    expect(html).toContain("=D2*2");
    expect(html).toContain("https://example.test/documento?nome=Pessoa");
    expect(html).not.toMatch(/<a\b[^>]*href=["']https?:/iu);
    expect(html).not.toMatch(/<script\b/iu);
    expect(html).not.toMatch(/<link\b/iu);
    expect(html).not.toMatch(/\bfetch\s*\(/iu);
    expect(html).toContain("script-src 'none'");
    expect(html).toContain("Fonte &lt;script&gt;");
    expect(html).not.toContain("Total financeiro");
  });

  it("grava com 0700/0600, não sobrescreve e recusa diretório simbólico", async () => {
    const source = await syntheticSensitiveWorkbook();
    const data = await readLocalWorkbookDataView(source);
    const directory = await temporaryBatch();
    await chmod(directory, 0o700);
    const output = join(directory, "relatorios", "dados-reais.html");

    await writeLocalWorkbookDataHtmlReport(output, data);

    expect((await stat(join(directory, "relatorios"))).mode & 0o777).toBe(0o700);
    expect((await stat(output)).mode & 0o777).toBe(0o600);
    await expect(writeLocalWorkbookDataHtmlReport(output, data)).rejects.toMatchObject({
      code: "REPORT_ALREADY_EXISTS",
    });

    const realDirectory = join(directory, "diretorio-real");
    const linkedDirectory = join(directory, "diretorio-link");
    await mkdir(realDirectory);
    await symlink(realDirectory, linkedDirectory, "dir");
    await expect(writeLocalWorkbookDataHtmlReport(join(linkedDirectory, "out.html"), data)).rejects.toMatchObject({
      code: "REPORT_DIRECTORY_NOT_REGULAR",
    });
    expect((await lstat(linkedDirectory)).isSymbolicLink()).toBe(true);

    const nestedRealDirectory = join(directory, "diretorio-real-aninhado");
    const nestedLinkedDirectory = join(directory, "diretorio-link-aninhado");
    await mkdir(join(nestedRealDirectory, "relatorios"), { recursive: true });
    await symlink(nestedRealDirectory, nestedLinkedDirectory, "dir");
    await expect(
      writeLocalWorkbookDataHtmlReport(
        join(nestedLinkedDirectory, "relatorios", "out.html"),
        data,
      ),
    ).rejects.toMatchObject({ code: "REPORT_DIRECTORY_NOT_REGULAR" });
  });

  it("bloqueia conteúdo ativo antes de ler as células", async () => {
    const source = await syntheticSensitiveWorkbook();
    await addMacroPayload(source);
    await expect(readLocalWorkbookDataView(source)).rejects.toMatchObject({
      code: "ACTIVE_CONTENT_DETECTED",
    });
  });
});

async function syntheticSensitiveWorkbook(): Promise<string> {
  const directory = await temporaryBatch();
  return writeWorkbook(directory, "dados-sinteticos.xlsx", (workbook) => {
    const sheet = workbook.addWorksheet("Fonte <script>");
    sheet.addRow([
      "Nome do Paciente",
      "Data Atendimento",
      "Procedimento",
      "Valor Total",
      "Observação",
      "Link",
      "Fórmula",
    ]);
    sheet.addRow([
      "Pessoa Sintética Alfa",
      new Date("2026-08-01T00:00:00Z"),
      "Consulta sintética",
      1234.56,
      '<img src=x onerror=alert(1)> & "teste"',
      { text: "Documento externo", hyperlink: "https://example.test/documento?nome=Pessoa" },
      { formula: "D2*2", result: 2469.12 },
    ]);
    sheet.addRow([
      "Pessoa Sintética Alfa",
      new Date("2026-08-01T00:00:00Z"),
      "Produto sintético",
      10,
      "Segunda linha do mesmo nome/data",
    ]);
    sheet.getRow(4).hidden = true;
    sheet.addRow([
      "Pessoa Sintética Beta",
      new Date("2026-07-01T00:00:00Z"),
      "Retorno sintético",
      200,
      "Texto seguro",
    ]);
    sheet.getRow(5).hidden = true;
    sheet.getCell("F6").value = "Célula mesclada sintética";
    sheet.mergeCells("F6:G6");
    sheet.getColumn(2).numFmt = "dd/mm/yyyy";
    sheet.getColumn(4).numFmt = "R$ #,##0.00";
    sheet.getColumn(5).hidden = true;

    const hidden = workbook.addWorksheet("Aba oculta sintética", { state: "hidden" });
    hidden.addRow(["Nome do Paciente", "Data Atendimento"]);
    hidden.addRow(["Pessoa Sintética Gama", "01/06/2026"]);

    const veryHidden = workbook.addWorksheet("Aba muito oculta sintética", { state: "veryHidden" });
    veryHidden.addRow(["Nota"]);
    veryHidden.addRow(["Conteúdo sintético"]);
  });
}
