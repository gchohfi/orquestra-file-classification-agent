import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type {
  CanonicalSchemaCatalog,
  ClassificationPlanDraft,
  ClassificationResult,
  SourceReference,
  WorkbookManifest,
} from "../domain/contracts.js";

type ReportOptions = Readonly<{
  title?: string;
  generatedAt?: Date;
}>;

type SourceAliases = Readonly<{
  files: ReadonlyMap<string, string>;
  sheets: ReadonlyMap<string, string>;
  columns: ReadonlyMap<string, string>;
}>;

export function renderClassificationHtml(
  result: ClassificationResult,
  catalog: CanonicalSchemaCatalog,
  options: ReportOptions = {},
): string {
  const title = options.title ?? "Relatório de classificação de dados";
  const generatedAt = options.generatedAt ?? new Date();
  if (result.status === "failed") {
    return documentShell(title, generatedAt, failedBody(result.errorCode, result.correlationId));
  }
  if (result.manifest === null) {
    return documentShell(
      title,
      generatedAt,
      `${hero("blocked", title)}${privacyNotice()}${blockedWithoutPlan(result.status === "blocked" ? result.errorCode : "MANIFEST_UNAVAILABLE")}`,
    );
  }

  const manifest = result.manifest;
  const aliases = buildAliases(manifest);
  const plan = result.plan;
  const body = [
    hero(result.status, title),
    privacyNotice(),
    summarySection(manifest, plan),
    sheetSection(manifest, aliases),
    plan ? mappingSection(plan, catalog, aliases) : "",
    plan
      ? reviewSection(plan, aliases)
      : blockedWithoutPlan(result.status === "blocked" ? result.errorCode : "PLAN_UNAVAILABLE"),
    plan ? validationSection(plan) : "",
    footer(plan?.planSha256, generatedAt),
  ].join("\n");
  return documentShell(title, generatedAt, body);
}

export async function writeClassificationHtmlReport(
  path: string,
  result: ClassificationResult,
  catalog: CanonicalSchemaCatalog,
  options: ReportOptions = {},
): Promise<string> {
  const absolutePath = resolve(path);
  await mkdir(dirname(absolutePath), { recursive: true, mode: 0o700 });
  await writeFile(absolutePath, renderClassificationHtml(result, catalog, options), {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  return absolutePath;
}

function documentShell(title: string, generatedAt: Date, body: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; --ink:#182027; --muted:#5d6972; --line:#d9e0e4; --paper:#f6f7f5; --card:#fff; --brand:#155f59; --brand-soft:#dff1ed; --warn:#8b5a00; --warn-soft:#fff2cc; --danger:#9b2c2c; --danger-soft:#fde8e8; --ok:#1c6b45; --ok-soft:#e4f3e9; }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--paper); color:var(--ink); font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    main { width:min(1180px,calc(100% - 32px)); margin:32px auto 56px; }
    h1,h2 { font-family:Georgia,"Times New Roman",serif; letter-spacing:-.02em; }
    h1 { max-width:780px; margin:10px 0 14px; font-size:clamp(32px,5vw,58px); line-height:1.04; }
    h2 { margin:0 0 16px; font-size:25px; }
    p { margin:0; }
    .eyebrow { color:var(--brand); font-size:12px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; }
    .hero { display:grid; grid-template-columns:1fr auto; gap:24px; align-items:end; padding:32px; color:#fff; background:#173e3a; border-radius:4px; }
    .hero p { max-width:730px; color:#d9e8e5; }
    .status { display:inline-flex; align-items:center; gap:8px; padding:8px 12px; border:1px solid rgba(255,255,255,.4); border-radius:999px; white-space:nowrap; font-weight:700; }
    .status::before { content:""; width:9px; height:9px; border-radius:50%; background:#7bd7a8; }
    .notice { margin:18px 0; padding:16px 18px; border-left:4px solid var(--brand); background:var(--brand-soft); }
    section { margin-top:18px; padding:24px; background:var(--card); border:1px solid var(--line); border-radius:4px; }
    .metrics { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:12px; }
    .metric { padding:15px; background:#f8faf9; border-top:3px solid var(--brand); }
    .metric strong { display:block; font-size:26px; line-height:1.15; }
    .metric span { color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.06em; }
    .coverage { height:10px; margin-top:20px; overflow:hidden; background:#e5e9e7; border-radius:999px; }
    .coverage > div { height:100%; background:var(--ok); }
    .subtle { margin-top:8px; color:var(--muted); font-size:13px; }
    .table-wrap { overflow:auto; border:1px solid var(--line); }
    table { width:100%; border-collapse:collapse; min-width:720px; }
    th,td { padding:11px 12px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; }
    th { position:sticky; top:0; background:#eef2f0; color:#32423f; font-size:12px; letter-spacing:.05em; text-transform:uppercase; }
    tr:last-child td { border-bottom:0; }
    code { font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace; color:#34413f; }
    .pill { display:inline-block; margin:2px 4px 2px 0; padding:3px 8px; border-radius:999px; background:#edf1ef; font-size:12px; white-space:nowrap; }
    .pill.warn { color:var(--warn); background:var(--warn-soft); }
    .pill.danger { color:var(--danger); background:var(--danger-soft); }
    .pill.ok { color:var(--ok); background:var(--ok-soft); }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
    .empty { padding:18px; color:var(--muted); background:#f7f8f7; }
    .footer { margin-top:18px; padding:15px 4px; color:var(--muted); font-size:12px; word-break:break-all; }
    button { padding:9px 12px; border:1px solid #fff; border-radius:3px; color:#fff; background:transparent; cursor:pointer; }
    @media (max-width:850px) { .hero,.grid { grid-template-columns:1fr; } .metrics { grid-template-columns:repeat(2,minmax(0,1fr)); } }
    @media print { body { background:#fff; } main { width:100%; margin:0; } section,.hero { break-inside:avoid; } button { display:none; } }
  </style>
</head>
<body>
  <main>${body}</main>
  <script>document.getElementById("print-report")?.addEventListener("click",()=>window.print());</script>
</body>
</html>`;
}

function hero(status: "awaiting_review" | "blocked", title: string): string {
  const label = status === "awaiting_review" ? "Aguardando revisão" : "Bloqueado para revisão";
  return `<header class="hero">
    <div><div class="eyebrow">ClassificationPlanDraft</div><h1>${escapeHtml(title)}</h1><p>Inventário e proposta de organização. Nenhuma importação ou alteração de pacientes foi executada.</p></div>
    <div><div class="status">${label}</div><button id="print-report" type="button">Imprimir / salvar PDF</button></div>
  </header>`;
}

function privacyNotice(): string {
  return `<aside class="notice"><strong>Relatório protegido.</strong> Nomes de arquivos, abas, cabeçalhos não reconhecidos e valores das células foram omitidos. As referências usam apenas aliases estruturais.</aside>`;
}

function summarySection(manifest: WorkbookManifest, plan: ClassificationPlanDraft | null): string {
  const sheets = manifest.files.flatMap((file) => file.sheets);
  const rows = sheets.reduce((sum, sheet) => sum + sheet.dataRowCount, 0);
  const cells = sheets.reduce((sum, sheet) => sum + sheet.dataNonEmptyCellCount, 0);
  const classified = plan?.coverage.classifiedCells ?? 0;
  const rate = cells === 0 ? 0 : Math.min(100, Math.round((classified / cells) * 100));
  return `<section><h2>Resumo do lote</h2><div class="metrics">
    ${metric(manifest.files.length, "Arquivos")}${metric(sheets.length, "Abas")}${metric(rows, "Linhas")}${metric(cells, "Células preenchidas")}${metric(plan?.reviewItems.length ?? 0, "Itens para revisão")}
  </div><div class="coverage"><div style="width:${rate}%"></div></div><p class="subtle">Cobertura classificada: ${formatNumber(classified)} de ${formatNumber(cells)} células (${rate}%).</p></section>`;
}

function sheetSection(manifest: WorkbookManifest, aliases: SourceAliases): string {
  const rows = manifest.files.flatMap((file) => file.sheets.map((sheet) => {
    const alerts = sheet.alerts.length === 0 ? `<span class="pill ok">Sem alertas</span>` : sheet.alerts.map((alert) => issuePill(alert.code, alert.severity)).join("");
    return `<tr><td>${escapeHtml(aliases.sheets.get(sheet.sheetId) ?? "Aba")}</td><td>${formatNumber(sheet.dataRowCount)}</td><td>${formatNumber(sheet.columnCount)}</td><td>${escapeHtml(sheet.state)}</td><td>${alerts}</td></tr>`;
  })).join("");
  return `<section><h2>Estrutura encontrada</h2><div class="table-wrap"><table><thead><tr><th>Origem protegida</th><th>Linhas</th><th>Colunas</th><th>Estado</th><th>Alertas</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function mappingSection(plan: ClassificationPlanDraft, catalog: CanonicalSchemaCatalog, aliases: SourceAliases): string {
  const fields = new Map(catalog.fields.map((field) => [field.fieldId, field]));
  const rows = plan.columnMappings.map((mapping) => {
    let target = "Não resolvido";
    if (mapping.disposition === "canonical") {
      const field = fields.get(mapping.canonicalFieldId);
      target = field ? `${field.label} (${field.fieldId})` : mapping.canonicalFieldId;
    } else if (mapping.disposition === "custom_field_candidate") {
      target = `Campo personalizado pendente · ${mapping.proposedField.category}`;
    } else if (mapping.disposition === "preserved") {
      target = "Preservado sem promoção";
    }
    return `<tr><td>${escapeHtml(sourceLabel(mapping.source, aliases))}</td><td>${escapeHtml(target)}</td><td>${escapeHtml(mapping.inferredType)}</td><td>${confidencePill(mapping.confidenceClass)}</td></tr>`;
  }).join("");
  return `<section><h2>Mapeamento das colunas</h2><div class="table-wrap"><table><thead><tr><th>Origem protegida</th><th>Destino proposto</th><th>Tipo inferido</th><th>Confiança</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function reviewSection(plan: ClassificationPlanDraft, aliases: SourceAliases): string {
  const issueRows = plan.reviewItems.map((item) => `<tr><td><code>${escapeHtml(item.code)}</code></td><td>${escapeHtml(item.sources.map((source) => sourceLabel(source, aliases)).join("; "))}</td><td>Revisão administrativa necessária</td></tr>`).join("");
  const identities = plan.identityReviewRequests.map((request) => `<tr><td>${formatNumber(request.rowsWithoutStrongIdentity)}</td><td>Manter provisório</td><td><code>${escapeHtml(request.reason)}</code></td></tr>`).join("");
  const warnings = aggregateCodes(plan.warnings.map((warning) => warning.code));
  const blockers = aggregateCodes(plan.blockers.map((blocker) => blocker.code));
  return `<div class="grid"><section><h2>Alertas e bloqueios</h2>${blockers.length === 0 ? `<p class="empty">Nenhum bloqueio.</p>` : blockers.map(({ code, count }) => issuePill(`${code} · ${count}`, "blocking")).join("")}<div style="height:12px"></div>${warnings.length === 0 ? `<p class="empty">Nenhum alerta.</p>` : warnings.map(({ code, count }) => issuePill(`${code} · ${count}`, "warning")).join("")}</section>
  <section><h2>Identidade provisória</h2>${identities ? `<div class="table-wrap"><table><thead><tr><th>Linhas sem identidade forte</th><th>Decisão</th><th>Regra</th></tr></thead><tbody>${identities}</tbody></table></div>` : `<p class="empty">Nenhuma revisão de identidade solicitada.</p>`}</section></div>
  <section><h2>Fila de revisão</h2>${issueRows ? `<div class="table-wrap"><table><thead><tr><th>Código</th><th>Origem protegida</th><th>Ação</th></tr></thead><tbody>${issueRows}</tbody></table></div>` : `<p class="empty">Nenhum item pendente.</p>`}</section>`;
}

function validationSection(plan: ClassificationPlanDraft): string {
  const rows = plan.validations.map((validation) => `<tr><td><code>${escapeHtml(validation.rule)}</code></td><td>${validation.passed ? `<span class="pill ok">Aprovada</span>` : `<span class="pill danger">Falhou</span>`}</td></tr>`).join("");
  return `<section><h2>Validações determinísticas</h2><div class="table-wrap"><table><thead><tr><th>Regra</th><th>Resultado</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function blockedWithoutPlan(errorCode: string): string {
  return `<section><h2>Processamento interrompido</h2><p class="empty">O manifesto foi bloqueado antes da proposta. Código: <code>${escapeHtml(errorCode)}</code>.</p></section>`;
}

function failedBody(errorCode: string, correlationId: string): string {
  return `<header class="hero"><div><div class="eyebrow">Falha segura</div><h1>Relatório indisponível</h1><p>A classificação foi encerrada sem produzir um plano.</p></div></header><section><p>Código: <code>${escapeHtml(errorCode)}</code></p><p>Correlação: <code>${escapeHtml(correlationId)}</code></p></section>`;
}

function footer(planSha256: string | undefined, generatedAt: Date): string {
  return `<footer class="footer">Gerado em ${escapeHtml(generatedAt.toLocaleString("pt-BR"))}.${planSha256 ? ` Hash do plano: <code>${escapeHtml(planSha256)}</code>.` : ""}</footer>`;
}

function buildAliases(manifest: WorkbookManifest): SourceAliases {
  const files = new Map<string, string>();
  const sheets = new Map<string, string>();
  const columns = new Map<string, string>();
  manifest.files.forEach((file, fileIndex) => {
    files.set(file.fileId, `Arquivo ${fileIndex + 1}`);
    file.sheets.forEach((sheet, sheetIndex) => {
      sheets.set(sheet.sheetId, `Arquivo ${fileIndex + 1} · Aba ${sheetIndex + 1}`);
      sheet.columns.forEach((column) => columns.set(column.columnId, `Coluna ${column.index}`));
    });
  });
  return { files, sheets, columns };
}

function sourceLabel(source: SourceReference, aliases: SourceAliases): string {
  const parts = [aliases.files.get(source.fileId) ?? "Arquivo"];
  if (source.sheetId) parts.push(aliases.sheets.get(source.sheetId)?.split(" · ").at(-1) ?? "Aba");
  if (source.columnId) parts.push(aliases.columns.get(source.columnId) ?? "Coluna");
  if (source.rowStart != null && source.rowEnd != null) parts.push(`linhas ${source.rowStart}–${source.rowEnd}`);
  return parts.join(" · ");
}

function metric(value: number, label: string): string {
  return `<div class="metric"><strong>${formatNumber(value)}</strong><span>${escapeHtml(label)}</span></div>`;
}

function issuePill(code: string, severity: "info" | "warning" | "blocking"): string {
  const className = severity === "blocking" ? "danger" : severity === "warning" ? "warn" : "";
  return `<span class="pill ${className}">${escapeHtml(code)}</span>`;
}

function confidencePill(confidence: "supported" | "review_required" | "blocking"): string {
  const labels = { supported: "Suportado", review_required: "Revisar", blocking: "Bloqueante" } as const;
  const className = confidence === "supported" ? "ok" : confidence === "blocking" ? "danger" : "warn";
  return `<span class="pill ${className}">${labels[confidence]}</span>`;
}

function aggregateCodes(codes: string[]): Array<{ code: string; count: number }> {
  const counts = new Map<string, number>();
  for (const code of codes) counts.set(code, (counts.get(code) ?? 0) + 1);
  return [...counts.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => a.code.localeCompare(b.code));
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}
