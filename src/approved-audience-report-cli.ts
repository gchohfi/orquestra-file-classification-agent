#!/usr/bin/env node
import { resolve } from "node:path";
import { analyzeLocalAudienceWorkbook } from "./local/audience-preview.js";
import { writeApprovedAudienceHtmlReport } from "./reporting/html-approved-audience-report.js";

const OUTPUT_PATH = resolve(".local/reports/publicos-reais-dra-marcella-120-dias.html");

async function main(): Promise<void> {
  const [inputPath, ...rest] = process.argv.slice(2);
  if (!inputPath) throw new Error("INVALID_ARGUMENTS");
  const asOf = parseAsOf(rest) ?? localDateKey(new Date());
  const preview = await analyzeLocalAudienceWorkbook(inputPath, { asOf });
  await writeApprovedAudienceHtmlReport(OUTPUT_PATH, preview, {
    approvedWindowDays: 120,
    title: "Relatório real de públicos — Dra. Marcella",
  });
}

function parseAsOf(args: string[]): string | undefined {
  if (args.length === 0) return undefined;
  if (args.length !== 2 || args[0] !== "--as-of" || !args[1]) throw new Error("INVALID_ARGUMENTS");
  return args[1];
}

function localDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

await main().catch(() => {
  process.stderr.write("Não foi possível gerar o relatório real local com segurança.\n");
  process.exitCode = 1;
});
