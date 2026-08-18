import { chmod, lstat, mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import {
  AudiencePreviewError,
  type AudiencePreviewRow,
  type AudiencePreviewScenario,
  type AudiencePreviewWindow,
  type LocalAudiencePreview,
  type SimulatedAudienceGroup,
} from "../local/audience-preview.js";

export type ApprovedAudienceReportOptions = Readonly<{
  approvedWindowDays: AudiencePreviewWindow;
  title?: string;
  generatedAt?: Date;
}>;

const MAX_LOCAL_HTML_BYTES = 32 * 1024 * 1024;
const CLUSTER_LABELS: Readonly<Record<SimulatedAudienceGroup, string>> = {
  no_action: "Sem ação",
  at_risk: "Paciente em risco",
  inactive: "Paciente inativo",
};

export function renderApprovedAudienceHtml(
  preview: LocalAudiencePreview,
  options: ApprovedAudienceReportOptions,
): string {
  const scenario = preview.scenarios.find((candidate) => candidate.windowDays === options.approvedWindowDays);
  if (!scenario) throw new AudiencePreviewError("APPROVED_SCENARIO_MISSING");
  const title = options.title ?? `Relatório real de públicos — regra de ${options.approvedWindowDays} dias`;
  const generatedAt = options.generatedAt ?? new Date();
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; connect-src 'none'; img-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme:light; --ink:#17211f; --muted:#53615d; --line:#7c8985; --paper:#f2f3f0; --card:#fff; --brand:#154f4a; --brand-soft:#e0f0ec; --risk:#8a5000; --risk-soft:#fff1d3; --inactive:#7a2929; --inactive-soft:#f9e7e5; --neutral:#365761; --neutral-soft:#e7eff1; --notice:#4d3562; --notice-soft:#eee6f4; }
    * { box-sizing:border-box; }
    html { scroll-behavior:smooth; }
    body { margin:0; overflow-x:hidden; color:var(--ink); background:var(--paper); font:16px/1.55 Arial,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    a { color:var(--brand); text-underline-offset:3px; }
    :focus-visible { outline:3px solid #0067c5; outline-offset:3px; }
    .skip-link { position:absolute; z-index:30; left:16px; top:-80px; padding:10px 14px; color:#000; background:#fff; border:2px solid #000; }
    .skip-link:focus { top:72px; }
    .top-notice { position:sticky; z-index:20; top:0; min-height:56px; padding:13px max(14px,calc((100vw - 1240px)/2)); color:#fff; background:var(--notice); border-bottom:4px solid #281734; font-weight:850; }
    .top-notice span { font-weight:500; }
    main { width:min(1240px,calc(100% - 28px)); margin:26px auto 58px; }
    h1,h2,h3 { margin:0; font-family:Georgia,"Times New Roman",serif; letter-spacing:-.02em; }
    h1 { max-width:980px; font-size:clamp(34px,5vw,58px); line-height:1.04; }
    h2 { font-size:clamp(25px,3vw,34px); }
    h3 { font-size:21px; }
    p { margin:0; }
    .eyebrow { margin-bottom:8px; color:var(--brand); font-size:13px; font-weight:850; letter-spacing:.12em; text-transform:uppercase; }
    .hero,section,details { margin-top:20px; padding:24px; background:var(--card); border:1px solid var(--line); }
    .hero { margin-top:0; padding:30px; border-top:7px solid var(--brand); }
    .lede { max-width:980px; margin-top:16px; color:#34413e; font-size:18px; }
    .approval { margin-top:18px; padding:17px; background:var(--brand-soft); border:2px solid var(--brand); }
    .approval strong { display:block; margin-bottom:4px; color:#103d39; font-size:18px; }
    .identity { margin-top:14px; padding:15px; background:var(--notice-soft); border-left:5px solid var(--notice); }
    .privacy { margin-top:13px; color:var(--muted); font-size:14px; }
    .rule-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin-top:18px; }
    .rule { min-height:115px; padding:16px; border:2px solid var(--line); border-top-width:7px; }
    .rule strong { display:block; font-size:20px; }
    .rule span { display:block; margin-top:7px; color:var(--muted); }
    .rule.neutral { border-top-color:var(--neutral); background:var(--neutral-soft); }
    .rule.risk { border-top-color:var(--risk); background:var(--risk-soft); }
    .rule.inactive { border-top-color:var(--inactive); background:var(--inactive-soft); }
    .metrics { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin:18px 0 26px; padding:0; list-style:none; }
    .metric { min-height:108px; padding:15px; border:2px solid var(--line); border-top-width:7px; }
    .metric.total { border-top-color:var(--brand); }
    .metric.neutral { border-top-color:var(--neutral); background:var(--neutral-soft); }
    .metric.risk { border-top-color:var(--risk); background:var(--risk-soft); }
    .metric.inactive { border-top-color:var(--inactive); background:var(--inactive-soft); }
    .metric strong { display:block; font-size:32px; line-height:1.1; }
    .metric span { display:block; margin-top:7px; color:#394742; font-size:12px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; }
    .bar-list { display:grid; gap:18px; margin-top:16px; }
    .bar-copy { display:flex; flex-wrap:wrap; justify-content:space-between; gap:8px; margin-bottom:7px; }
    .bar-copy span { color:var(--muted); }
    .bar-track { height:22px; overflow:hidden; background:#fff; border:2px solid #58645f; }
    .bar-fill { display:block; height:100%; }
    .bar-fill.neutral { background:repeating-linear-gradient(135deg,#365761 0,#365761 8px,#76919a 8px,#76919a 14px); }
    .bar-fill.risk { background:repeating-linear-gradient(90deg,#8a5000 0,#8a5000 9px,#d19743 9px,#d19743 15px); }
    .bar-fill.inactive { background:repeating-linear-gradient(135deg,#7a2929 0,#7a2929 8px,#c77975 8px,#c77975 14px); }
    .list-heading { display:flex; flex-wrap:wrap; justify-content:space-between; gap:10px; align-items:end; }
    .list-heading p { max-width:840px; margin-top:7px; color:var(--muted); }
    .table-region { margin-top:16px; max-height:74vh; overflow:auto; border:1px solid #58645f; }
    table { width:max-content; min-width:100%; border-collapse:separate; border-spacing:0; font-size:14px; }
    caption { padding:11px 12px; color:var(--muted); background:#f6f7f5; text-align:left; }
    th,td { max-width:380px; min-width:145px; padding:10px 11px; border-right:1px solid #c1c9c5; border-bottom:1px solid #c1c9c5; text-align:left; vertical-align:top; overflow-wrap:anywhere; }
    thead th { position:sticky; z-index:6; top:0; color:#263431; background:#e8eeeb; border-bottom:2px solid #58645f; }
    .name { position:sticky; z-index:4; left:0; min-width:250px; max-width:310px; background:#f4edf7; }
    thead .name { z-index:9; }
    .tag { display:inline-block; padding:4px 9px; border:2px solid currentColor; font-size:12px; font-weight:850; text-transform:uppercase; }
    .tag.neutral { color:#294b54; background:var(--neutral-soft); }
    .tag.risk { color:#6e4000; background:var(--risk-soft); }
    .tag.inactive { color:#672020; background:var(--inactive-soft); }
    .note { display:block; margin-top:5px; color:var(--muted); font-size:12px; }
    details { padding:0; }
    summary { min-height:52px; padding:15px 20px; cursor:pointer; color:var(--brand); font-weight:850; }
    .diagnostic { padding:4px 22px 22px; border-top:1px solid var(--line); }
    .footer { margin-top:18px; padding:12px 4px; color:var(--muted); font-size:13px; }
    @media (max-width:900px) { .metrics,.rule-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
    @media (max-width:620px) { main { width:min(100% - 18px,1240px); margin-top:14px; } .hero,section { padding:17px; } .metrics,.rule-grid { grid-template-columns:1fr; } .top-notice { padding:10px; font-size:14px; } }
    @media print { @page { size:A4 landscape; margin:16mm 9mm 13mm; } body { color:#000; background:#fff; font-size:10px; } .top-notice { position:fixed; top:-12mm; left:0; right:0; min-height:0; padding:3px; color:#000; background:#fff; border:3px solid #000; text-align:center; } main { width:100%; margin:0; } .table-region { max-height:none; overflow:visible; } thead { display:table-header-group; } tr { break-inside:avoid; } }
  </style>
</head>
<body>
  <div class="top-notice" role="status">Relatório real · somente leitura <span>— não enviado ao Supabase, campanhas ou automações.</span></div>
  <a class="skip-link" href="#cluster-list">Pular para a lista de clusters</a>
  <main>
    <header class="hero">
      <div class="eyebrow">Dados reais · regra aprovada</div>
      <h1>${escapeHtml(title)}</h1>
      <p class="lede">Classificação aplicada aos registros reais da planilha com data-base em <strong>${escapeHtml(formatDate(preview.asOf))}</strong>. A regra de ${formatNumber(scenario.windowDays)} dias foi aprovada para este relatório.</p>
      <div class="approval"><strong>Regra oficial deste relatório</strong><p>Menos de ${formatNumber(scenario.windowDays)} dias: sem ação. De ${formatNumber(scenario.windowDays)} a ${formatNumber(scenario.windowDays * 2 - 1)} dias: paciente em risco. A partir de ${formatNumber(scenario.windowDays * 2)} dias: paciente inativo.</p></div>
      <div class="identity"><strong>Limite de identidade:</strong> cada linha representa um <em>nome informado na planilha</em>, agrupado pela grafia normalizada. Sem CPF, telefone ou identificador canônico, homônimos ainda podem estar combinados.</div>
      <p class="privacy">Contém nomes reais. O arquivo fica fora do Git e não usa GPT, Supabase ou rede. Como a pasta está no iCloud Drive, pode ser sincronizado pelo iCloud.</p>
      ${rules(scenario.windowDays)}
    </header>

    <section aria-labelledby="summary-title">
      <div class="eyebrow">Resultado da regra aprovada</div>
      <h2 id="summary-title">Distribuição real dos nomes informados</h2>
      ${metrics(preview.distinctNameCount, scenario)}
      <p>As barras usam ${formatNumber(preview.distinctNameCount)} nomes como denominador e repetem os valores por escrito.</p>
      ${bars(preview.distinctNameCount, scenario)}
    </section>

    <section id="cluster-list" aria-labelledby="list-title">
      <div class="list-heading"><div><h2 id="list-title">Cluster atribuído a cada nome</h2><p>Ordenado dos registros mais antigos para os mais recentes. Use ⌘F para localizar um nome.</p></div><strong>${formatNumber(scenario.rows.length)} nomes classificados</strong></div>
      ${audienceTable(scenario)}
    </section>

    ${diagnostic(preview)}
    <footer class="footer">Gerado em ${escapeHtml(formatDateTime(generatedAt))}. Dados reais · regra aprovada de ${formatNumber(scenario.windowDays)} dias · uso autorizado somente como relatório.</footer>
  </main>
</body>
</html>`;
  if (Buffer.byteLength(html, "utf8") > MAX_LOCAL_HTML_BYTES) {
    throw new AudiencePreviewError("LOCAL_HTML_SIZE_LIMIT_EXCEEDED");
  }
  return html;
}

export async function writeApprovedAudienceHtmlReport(
  path: string,
  preview: LocalAudiencePreview,
  options: ApprovedAudienceReportOptions,
): Promise<string> {
  const absolutePath = resolve(path);
  const directory = dirname(absolutePath);
  await assertExistingWorkspaceDirectoryComponents(directory);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await assertSafeReportDirectory(directory);
  await chmod(directory, 0o700);
  if (await lstat(absolutePath).catch(() => null)) throw new AudiencePreviewError("REPORT_ALREADY_EXISTS");
  await writeFile(absolutePath, renderApprovedAudienceHtml(preview, options), {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  await chmod(absolutePath, 0o600);
  return absolutePath;
}

function rules(windowDays: number): string {
  return `<div class="rule-grid" aria-label="Faixas da regra aprovada">
    <div class="rule neutral"><strong>Sem ação</strong><span>Último registro há menos de ${formatNumber(windowDays)} dias.</span></div>
    <div class="rule risk"><strong>Paciente em risco</strong><span>Último registro entre ${formatNumber(windowDays)} e ${formatNumber(windowDays * 2 - 1)} dias.</span></div>
    <div class="rule inactive"><strong>Paciente inativo</strong><span>Último registro há ${formatNumber(windowDays * 2)} dias ou mais.</span></div>
  </div>`;
}

function metrics(total: number, scenario: AudiencePreviewScenario): string {
  return `<ul class="metrics" aria-label="Contagens da classificação real">
    ${metric(total, "Nomes classificados", "total")}
    ${metric(scenario.noActionCount, "Sem ação", "neutral")}
    ${metric(scenario.atRiskCount, "Pacientes em risco", "risk")}
    ${metric(scenario.inactiveCount, "Pacientes inativos", "inactive")}
  </ul>`;
}

function metric(value: number, label: string, className: string): string {
  return `<li class="metric ${className}"><strong>${formatNumber(value)}</strong><span>${escapeHtml(label)}</span></li>`;
}

function bars(total: number, scenario: AudiencePreviewScenario): string {
  return `<div class="bar-list" aria-label="Distribuição dos clusters">
    ${bar("Sem ação", scenario.noActionCount, total, "neutral")}
    ${bar("Paciente em risco", scenario.atRiskCount, total, "risk")}
    ${bar("Paciente inativo", scenario.inactiveCount, total, "inactive")}
  </div>`;
}

function bar(label: string, value: number, total: number, className: string): string {
  const percent = total === 0 ? 0 : (value / total) * 100;
  return `<div><div class="bar-copy"><strong>${escapeHtml(label)}</strong><span>${formatNumber(value)} de ${formatNumber(total)} · ${formatPercent(percent)}</span></div><div class="bar-track" role="img" aria-label="${escapeHtml(label)}: ${formatNumber(value)} de ${formatNumber(total)}, ${formatPercent(percent)}"><span class="bar-fill ${className}" style="width:${percent.toFixed(2)}%"></span></div></div>`;
}

function audienceTable(scenario: AudiencePreviewScenario): string {
  const rows = scenario.rows.map((row) => audienceRow(row)).join("");
  return `<div class="table-region" role="region" tabindex="0" aria-label="Classificação real pela regra de ${scenario.windowDays} dias"><table><caption>Classificação baseada no último registro válido encontrado para cada grafia normalizada de nome.</caption><thead><tr><th class="name" scope="col">Nome informado na planilha</th><th scope="col">Último registro</th><th scope="col">Dias desde o registro</th><th scope="col">Cluster pela regra aprovada</th><th scope="col">Evidência da regra</th><th scope="col">Identidade</th><th scope="col">Uso</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function audienceRow(row: AudiencePreviewRow): string {
  const className = row.simulatedGroup === "at_risk" ? "risk" : row.simulatedGroup === "inactive" ? "inactive" : "neutral";
  return `<tr><th class="name" scope="row">${escapeHtml(row.nameInSpreadsheet)}</th><td><time datetime="${escapeHtml(row.lastRecordOn)}">${escapeHtml(formatDate(row.lastRecordOn))}</time></td><td>${formatNumber(row.daysSinceLastRecord)} dias</td><td><span class="tag ${className}">${escapeHtml(CLUSTER_LABELS[row.simulatedGroup])}</span></td><td>${escapeHtml(approvedReason(row))}</td><td>Nome informado<span class="note">Identidade canônica não comprovada.</span></td><td>Somente relatório<span class="note">Sem Supabase, campanha ou automação.</span></td></tr>`;
}

function approvedReason(row: AudiencePreviewRow): string {
  if (row.simulatedGroup === "no_action") return "Abaixo da janela aprovada.";
  if (row.simulatedGroup === "at_risk") return "Dentro da faixa aprovada de risco.";
  return "Dentro da faixa aprovada de inatividade.";
}

function diagnostic(preview: LocalAudiencePreview): string {
  return `<details><summary>Ver diagnóstico da leitura</summary><div class="diagnostic"><p>Foram reconhecidas ${formatNumber(preview.diagnostics.recognizedSheetCount)} de ${formatNumber(preview.diagnostics.workbookSheetCount)} abas. A leitura encontrou ${formatNumber(preview.diagnostics.validRecordRows)} registros válidos, ${formatNumber(preview.diagnostics.invalidDateRows)} datas ausentes ou inválidas, ${formatNumber(preview.diagnostics.futureDateRows)} datas futuras e ${formatNumber(preview.diagnostics.namesWithoutValidRecord)} nomes sem registro válido.</p><p class="privacy">A classificação usa somente nome informado e data do último registro. Não infere pagamento, atendimento concluído, consentimento ou identidade canônica.</p></div></details>`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value / 100);
}

function escapeHtml(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, "�").replace(/[&<>"']/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

async function assertExistingWorkspaceDirectoryComponents(directory: string): Promise<void> {
  const components = workspaceRelativeComponents(directory);
  if (components === null) return;
  let current = resolve(".");
  for (const component of components) {
    current = resolve(current, component);
    const stat = await lstat(current).catch((error: unknown) => {
      if (isNodeError(error) && error.code === "ENOENT") return null;
      throw error;
    });
    if (stat === null) return;
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new AudiencePreviewError("REPORT_DIRECTORY_NOT_REGULAR");
  }
}

async function assertSafeReportDirectory(directory: string): Promise<void> {
  const directoryStat = await lstat(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) throw new AudiencePreviewError("REPORT_DIRECTORY_NOT_REGULAR");
  const components = workspaceRelativeComponents(directory);
  if (components === null) return;
  let current = resolve(".");
  for (const component of components) {
    current = resolve(current, component);
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new AudiencePreviewError("REPORT_DIRECTORY_NOT_REGULAR");
  }
}

function workspaceRelativeComponents(directory: string): string[] | null {
  const workspaceRoot = resolve(".");
  const relativePath = relative(workspaceRoot, directory);
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) return null;
  return relativePath.split(sep).filter(Boolean);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
