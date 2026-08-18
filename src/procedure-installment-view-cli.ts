#!/usr/bin/env node
import { resolve } from "node:path";
import { buildProcedureInstallmentView } from "./local/procedure-installment-view.js";
import { readLocalWorkbookDataView } from "./local/workbook-data-view.js";
import { writeProcedureInstallmentHtmlReport } from "./reporting/html-procedure-installment-report.js";

const OUTPUT_PATH = resolve(".local/reports/procedimentos-parcelas-dra-marcella-conferencia.html");

async function main(): Promise<void> {
  const [inputPath, ...rest] = process.argv.slice(2);
  if (!inputPath || rest.length > 0) throw new Error("INVALID_ARGUMENTS");
  const workbook = await readLocalWorkbookDataView(inputPath);
  const view = buildProcedureInstallmentView(workbook);
  await writeProcedureInstallmentHtmlReport(OUTPUT_PATH, view, {
    title: "Conferência de procedimentos e parcelas — Dra. Marcella",
  });
}

await main().catch(() => {
  process.stderr.write("Não foi possível gerar o relatório local com segurança.\n");
  process.exitCode = 1;
});
