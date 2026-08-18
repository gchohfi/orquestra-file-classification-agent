#!/usr/bin/env node
import { resolve } from "node:path";
import { readLocalWorkbookDataView } from "./local/workbook-data-view.js";
import { writeLocalWorkbookDataHtmlReport } from "./reporting/html-local-workbook-data-report.js";

const OUTPUT_PATH = resolve(".local/reports/dados-reais-dra-marcella-conferencia.html");

async function main(): Promise<void> {
  const [inputPath, ...rest] = process.argv.slice(2);
  if (!inputPath || rest.length > 0) throw new Error("INVALID_ARGUMENTS");
  const data = await readLocalWorkbookDataView(inputPath);
  await writeLocalWorkbookDataHtmlReport(OUTPUT_PATH, data, {
    title: "Dados reais para conferência — Dra. Marcella",
  });
}

await main().catch(() => {
  process.stderr.write("Não foi possível gerar o visualizador local com segurança.\n");
  process.exitCode = 1;
});
