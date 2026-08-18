#!/usr/bin/env node
import { resolve } from "node:path";
import {
  AUDIENCE_PREVIEW_WINDOWS,
  analyzeLocalAudienceWorkbook,
  type AudiencePreviewWindow,
} from "./local/audience-preview.js";
import { writeAudiencePreviewHtmlReport } from "./reporting/html-audience-preview-report.js";

const DEFAULT_OUTPUT_PATH = resolve(".local/reports/publicos-dra-marcella-preview.html");

async function main(): Promise<void> {
  const [inputPath, ...rest] = process.argv.slice(2);
  if (!inputPath) throw new Error("INVALID_ARGUMENTS");
  const options = parseOptions(rest);
  const defaultWindowDays = parseWindow(options.get("window"));
  const preview = await analyzeLocalAudienceWorkbook(inputPath, {
    asOf: options.get("as-of") ?? localDateKey(new Date()),
  });
  const outputPath = defaultWindowDays === undefined
    ? DEFAULT_OUTPUT_PATH
    : resolve(`.local/reports/publicos-dra-marcella-${defaultWindowDays}-dias.html`);
  await writeAudiencePreviewHtmlReport(outputPath, preview, {
    title: defaultWindowDays === undefined
      ? "Prévia de públicos — Dra. Marcella"
      : `Públicos simulados — cenário principal de ${defaultWindowDays} dias`,
    ...(defaultWindowDays === undefined ? {} : { defaultWindowDays }),
  });
}

function parseOptions(args: string[]): ReadonlyMap<string, string> {
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith("--") || !value || (flag !== "--as-of" && flag !== "--window")) {
      throw new Error("INVALID_ARGUMENTS");
    }
    options.set(flag.slice(2), value);
  }
  return options;
}

function parseWindow(value: string | undefined): AudiencePreviewWindow | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!AUDIENCE_PREVIEW_WINDOWS.some((windowDays) => windowDays === parsed)) {
    throw new Error("INVALID_ARGUMENTS");
  }
  return parsed as AudiencePreviewWindow;
}

function localDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

await main().catch(() => {
  process.stderr.write("Não foi possível gerar a prévia local com segurança.\n");
  process.exitCode = 1;
});
