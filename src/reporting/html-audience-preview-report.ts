import { chmod, lstat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  AUDIENCE_PREVIEW_WINDOWS,
  AudiencePreviewError,
  type AudiencePreviewRow,
  type AudiencePreviewScenario,
  type AudiencePreviewWindow,
  type LocalAudiencePreview,
  type SimulatedAudienceGroup,
} from "../local/audience-preview.js";
import { prepareSafeLocalReportDirectory } from "./safe-local-report-directory.js";

type AudiencePreviewReportOptions = Readonly<{
  title?: string;
  generatedAt?: Date;
  defaultWindowDays?: AudiencePreviewWindow;
}>;

const GROUP_LABELS: Readonly<Record<SimulatedAudienceGroup, string>> = {
  no_action: "Sem ação — simulação",
  at_risk: "Sinal em risco — simulação",
  inactive: "Sinal inativo — simulação",
};

export function renderAudiencePreviewHtml(
  preview: LocalAudiencePreview,
  options: AudiencePreviewReportOptions = {},
): string {
  const title = options.title ?? "Prévia de públicos — Dra. Marcella";
  const generatedAt = options.generatedAt ?? new Date();
  const defaultWindowDays = options.defaultWindowDays ?? 90;
  if (!AUDIENCE_PREVIEW_WINDOWS.includes(defaultWindowDays)) {
    throw new AudiencePreviewError("INVALID_DEFAULT_SCENARIO");
  }
  const scenarioByWindow = new Map(preview.scenarios.map((scenario) => [scenario.windowDays, scenario]));
  for (const windowDays of AUDIENCE_PREVIEW_WINDOWS) {
    if (!scenarioByWindow.has(windowDays)) throw new AudiencePreviewError("PREVIEW_SCENARIO_MISSING");
  }

  const panels = AUDIENCE_PREVIEW_WINDOWS.map((windowDays) =>
    scenarioPanel(
      preview,
      scenarioByWindow.get(windowDays) as AudiencePreviewScenario,
      windowDays === defaultWindowDays,
    ),
  ).join("\n");

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme:light; --ink:#17211f; --muted:#56645f; --line:#82908b; --paper:#f4f5f2; --card:#fff; --brand:#155f59; --brand-dark:#123d39; --brand-soft:#dff1ed; --risk:#a85d08; --risk-soft:#fff1cf; --inactive:#9b2c2c; --inactive-soft:#fde8e8; --neutral:#3d5961; --neutral-soft:#e7eff1; --block:#5b3b70; --block-soft:#eee6f4; }
    * { box-sizing:border-box; }
    html { scroll-behavior:smooth; }
    body { margin:0; overflow-x:hidden; background:var(--paper); color:var(--ink); font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    a { color:var(--brand-dark); }
    button,input,label,summary { font:inherit; }
    :focus-visible { outline:3px solid #0066cc; outline-offset:3px; }
    .skip-link { position:absolute; z-index:20; left:16px; top:-80px; padding:10px 14px; background:#fff; border:2px solid var(--ink); }
    .skip-link:focus { top:74px; }
    .top-warning { position:sticky; z-index:10; top:0; min-height:54px; padding:14px max(16px,calc((100vw - 1180px)/2)); color:#fff; background:#712c2c; border-bottom:3px solid #351010; font-weight:800; letter-spacing:.01em; }
    .top-warning span { font-weight:500; }
    main { width:min(1180px,calc(100% - 32px)); margin:28px auto 56px; }
    h1,h2,h3 { font-family:Georgia,"Times New Roman",serif; letter-spacing:-.02em; }
    h1 { max-width:850px; margin:8px 0 14px; font-size:clamp(34px,5vw,58px); line-height:1.04; }
    h2 { margin:0 0 12px; font-size:clamp(25px,3vw,34px); }
    h3 { margin:24px 0 10px; font-size:21px; }
    p { margin:0; }
    .eyebrow { color:var(--brand); font-size:13px; font-weight:850; letter-spacing:.12em; text-transform:uppercase; }
    .hero { padding:32px; background:#fff; border:1px solid var(--line); border-top:7px solid var(--brand-dark); }
    .lede { max-width:860px; color:#35433f; font-size:18px; }
    .gate-notice { display:grid; grid-template-columns:auto 1fr; gap:12px; margin-top:22px; padding:18px; background:var(--block-soft); border:2px solid var(--block); }
    .gate-notice strong { color:var(--block); }
    .privacy-note { margin-top:14px; color:var(--muted); font-size:14px; }
    section,.scenario-shell,details { margin-top:20px; padding:24px; background:var(--card); border:1px solid var(--line); }
    .comparison-wrap,.table-region { overflow:auto; border:1px solid var(--line); }
    table { width:100%; border-collapse:collapse; }
    th,td { padding:12px 13px; border-bottom:1px solid #bcc5c1; text-align:left; vertical-align:top; }
    thead th { background:#e8eeeb; color:#273632; font-size:13px; letter-spacing:.035em; text-transform:uppercase; }
    tbody tr:last-child > * { border-bottom:0; }
    caption { padding:13px; text-align:left; color:var(--muted); background:#f7f8f6; }
    .comparison th:first-child { width:25%; }
    .scenario-shell { min-width:0; }
    .scenario-shell > legend { padding:0 8px; font:700 24px/1.2 Georgia,"Times New Roman",serif; }
    .scenario-input { position:absolute; width:1px; height:1px; margin:-1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
    .scenario-options { display:flex; flex-wrap:wrap; gap:10px; margin:4px 0 18px; }
    .scenario-options label { display:inline-flex; min-height:46px; align-items:center; padding:9px 16px; border:2px solid var(--brand); background:#fff; color:var(--brand-dark); cursor:pointer; font-weight:800; }
    #scenario-60:checked ~ .scenario-options label[for="scenario-60"],
    #scenario-90:checked ~ .scenario-options label[for="scenario-90"],
    #scenario-120:checked ~ .scenario-options label[for="scenario-120"] { color:#fff; background:var(--brand-dark); }
    #scenario-60:focus-visible ~ .scenario-options label[for="scenario-60"],
    #scenario-90:focus-visible ~ .scenario-options label[for="scenario-90"],
    #scenario-120:focus-visible ~ .scenario-options label[for="scenario-120"] { outline:3px solid #0066cc; outline-offset:3px; }
    .scenario-panel { display:none; }
    #scenario-60:checked ~ .scenario-panels .scenario-60,
    #scenario-90:checked ~ .scenario-panels .scenario-90,
    #scenario-120:checked ~ .scenario-panels .scenario-120 { display:block; }
    .scenario-heading { display:flex; flex-wrap:wrap; align-items:baseline; justify-content:space-between; gap:12px; padding:16px 0 6px; }
    .scenario-heading p { color:var(--muted); }
    .metrics { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:12px; margin:18px 0 28px; padding:0; list-style:none; }
    .metric { min-height:116px; padding:15px; border:2px solid var(--line); border-top-width:7px; background:#fff; }
    .metric.risk { border-top-color:var(--risk); }
    .metric.inactive { border-top-color:var(--inactive); }
    .metric.neutral { border-top-color:var(--neutral); }
    .metric.blocked { border-top-color:var(--block); background:var(--block-soft); }
    .metric strong { display:block; font-size:32px; line-height:1.1; }
    .metric span { display:block; margin-top:7px; color:#394742; font-size:13px; font-weight:750; letter-spacing:.035em; text-transform:uppercase; }
    .bar-list { display:grid; gap:18px; margin:16px 0 30px; }
    .bar-copy { display:flex; flex-wrap:wrap; justify-content:space-between; gap:8px; margin-bottom:7px; }
    .bar-copy span { color:var(--muted); }
    .bar-track { height:20px; overflow:hidden; background:#fff; border:2px solid #5e6d68; }
    .bar-fill { display:block; height:100%; min-width:0; }
    .bar-fill.risk { background:repeating-linear-gradient(135deg,#a85d08 0,#a85d08 8px,#d49045 8px,#d49045 14px); }
    .bar-fill.inactive { background:repeating-linear-gradient(90deg,#9b2c2c 0,#9b2c2c 9px,#cf7474 9px,#cf7474 15px); }
    .bar-fill.neutral { background:repeating-linear-gradient(135deg,#3d5961 0,#3d5961 8px,#76919a 8px,#76919a 14px); }
    .list-intro { display:flex; flex-wrap:wrap; justify-content:space-between; gap:10px; margin:0 0 12px; }
    .list-intro p { max-width:820px; color:var(--muted); }
    .table-region { max-height:72vh; }
    .audience-table { min-width:1120px; }
    .audience-table th[scope="row"] { min-width:220px; background:#fff; color:#17211f; }
    .audience-table td:nth-child(2) { min-width:145px; white-space:nowrap; }
    .audience-table td:nth-child(3) { min-width:175px; }
    .audience-table td:nth-child(4) { min-width:290px; }
    .audience-table td:nth-child(5) { min-width:190px; }
    .audience-table td:nth-child(6) { min-width:150px; }
    .tag { display:inline-block; padding:4px 9px; border:1px solid currentColor; font-size:13px; font-weight:800; }
    .tag.risk { color:#774000; background:var(--risk-soft); }
    .tag.inactive { color:#7d2020; background:var(--inactive-soft); }
    .tag.neutral { color:#2d4b53; background:var(--neutral-soft); }
    .tag.blocked { color:#4c2f61; background:var(--block-soft); }
    .confidence { display:block; font-weight:800; }
    .confidence-note { display:block; margin-top:3px; color:var(--muted); font-size:13px; }
    details { padding:0; }
    summary { min-height:52px; padding:15px 20px; cursor:pointer; color:var(--brand-dark); font-weight:850; }
    .diagnostic { padding:4px 24px 24px; border-top:1px solid var(--line); }
    code { font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace; overflow-wrap:anywhere; }
    .code-list { display:flex; flex-wrap:wrap; gap:8px; padding:0; list-style:none; }
    .code-list li { padding:6px 9px; border:1px solid var(--line); background:#f1f3f1; }
    .technical-table { min-width:720px; }
    .footer { margin-top:18px; padding:12px 4px; color:var(--muted); font-size:13px; }
    .visually-hidden { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; border:0; }
    @media (max-width:900px) { .metrics { grid-template-columns:repeat(2,minmax(0,1fr)); } }
    @media (max-width:620px) { main { width:min(100% - 20px,1180px); margin-top:16px; } .hero,section,.scenario-shell { padding:18px; } .metrics { grid-template-columns:1fr; } .scenario-options { display:grid; grid-template-columns:1fr; } .scenario-options label { justify-content:center; } .top-warning { position:sticky; padding:12px; font-size:14px; } .gate-notice { grid-template-columns:1fr; } }
    @media print { @page { size:A4 landscape; margin:18mm 10mm 14mm; } body { background:#fff; font-size:11px; } .top-warning { position:fixed; top:-14mm; left:0; right:0; min-height:0; padding:4px; border:2px solid #000; color:#000; background:#fff; text-align:center; } main { width:100%; margin:0; } .skip-link,.scenario-options { display:none; } .hero,section,.scenario-shell,details { border-color:#000; } .table-region { max-height:none; overflow:visible; } .audience-table { min-width:0; } thead { display:table-header-group; } tr { break-inside:avoid; } .scenario-panel { display:none !important; } #scenario-60:checked ~ .scenario-panels .scenario-60,#scenario-90:checked ~ .scenario-panels .scenario-90,#scenario-120:checked ~ .scenario-panels .scenario-120 { display:block !important; } }
  </style>
</head>
<body>
  <div class="top-warning" role="status">Prévia não acionável <span>— nenhum nome está liberado para campanha, contato ou automação.</span></div>
  <a class="skip-link" href="#audience-list">Pular para a lista de nomes</a>
  <main>
    <header class="hero">
      <div class="eyebrow">Leitura exploratória local</div>
      <h1>${escapeHtml(title)}</h1>
      <p class="lede">A visão inicial usa o cenário simulado de <strong>${formatNumber(defaultWindowDays)} dias</strong> para mostrar em qual cluster provisório cada nome foi colocado. Cada identidade abaixo é apenas um <strong>nome informado na planilha</strong>, agrupado provisoriamente pela grafia normalizada; não representa uma pessoa canônica e pode combinar homônimos.</p>
      <div class="gate-notice"><strong>Liberados para uso: 0</strong><p>Identidade forte, atendimento concluído, promoção para a base canônica e reconciliação ainda não foram comprovados. Por isso, todos os sinais permanecem <strong>não ativáveis</strong>.</p></div>
      <p class="privacy-note">Contém nomes completos. O arquivo está fora do Git e não usa rede, GPT ou Supabase; como o projeto está no iCloud Drive, ele pode ser sincronizado pelo iCloud.</p>
    </header>

    ${comparisonSection(preview, defaultWindowDays)}

    <fieldset class="scenario-shell">
      <legend>Explore um cenário simulado</legend>
      <input class="scenario-input" type="radio" name="scenario" id="scenario-60" value="60"${defaultWindowDays === 60 ? " checked" : ""}>
      <input class="scenario-input" type="radio" name="scenario" id="scenario-90" value="90"${defaultWindowDays === 90 ? " checked" : ""}>
      <input class="scenario-input" type="radio" name="scenario" id="scenario-120" value="120"${defaultWindowDays === 120 ? " checked" : ""}>
      <div class="scenario-options" aria-label="Cenários simulados">
        <label for="scenario-60">60 dias · simulado${defaultWindowDays === 60 ? " · visão principal" : ""}</label>
        <label for="scenario-90">90 dias · simulado${defaultWindowDays === 90 ? " · visão principal" : ""}</label>
        <label for="scenario-120">120 dias · simulado${defaultWindowDays === 120 ? " · visão principal" : ""}</label>
      </div>
      <p>Nenhum cenário é uma regra aprovada. A faixa de risco usa, apenas para comparação, uma tolerância sintética igual à janela escolhida.</p>
      <div id="audience-list" class="scenario-panels">${panels}</div>
    </fieldset>

    ${technicalDiagnosis(preview)}
    <footer class="footer">Gerado localmente em ${escapeHtml(formatDateTime(generatedAt))}. Prévia não acionável · contém nomes informados na planilha · não compartilhar.</footer>
  </main>
</body>
</html>`;
}

export async function writeAudiencePreviewHtmlReport(
  path: string,
  preview: LocalAudiencePreview,
  options: AudiencePreviewReportOptions = {},
): Promise<string> {
  const absolutePath = resolve(path);
  const directory = dirname(absolutePath);
  await prepareSafeLocalReportDirectory(
    directory,
    () => new AudiencePreviewError("REPORT_DIRECTORY_NOT_REGULAR"),
  );
  const existingTarget = await lstat(absolutePath).catch(() => null);
  if (existingTarget) throw new AudiencePreviewError("REPORT_ALREADY_EXISTS");
  await writeFile(absolutePath, renderAudiencePreviewHtml(preview, options), {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  await chmod(absolutePath, 0o600);
  return absolutePath;
}

function comparisonSection(preview: LocalAudiencePreview, defaultWindowDays: AudiencePreviewWindow): string {
  const rows = preview.scenarios.map((scenario) => `<tr>
    <th scope="row">${scenario.windowDays} dias · simulado${scenario.windowDays === defaultWindowDays ? " · visão principal" : ""}</th>
    <td>${formatNumber(scenario.noActionCount)}</td>
    <td>${formatNumber(scenario.atRiskCount)}</td>
    <td>${formatNumber(scenario.inactiveCount)}</td>
    <td><strong>0</strong></td>
  </tr>`).join("");
  return `<section aria-labelledby="comparison-title"><h2 id="comparison-title">Compare os três cenários</h2><p>Cada linha usa os mesmos ${formatNumber(preview.distinctNameCount)} agrupamentos textuais provisórios e muda somente a janela sintética.</p><div class="comparison-wrap"><table class="comparison"><caption>Resumo comparativo; nenhum cenário foi aprovado como regra.</caption><thead><tr><th scope="col">Janela</th><th scope="col">Sem ação</th><th scope="col">Sinal em risco</th><th scope="col">Sinal inativo</th><th scope="col">Liberados</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function scenarioPanel(
  preview: LocalAudiencePreview,
  scenario: AudiencePreviewScenario,
  isPrimary: boolean,
): string {
  return `<section class="scenario-panel scenario-${scenario.windowDays}" role="region" aria-labelledby="scenario-${scenario.windowDays}-title">
    <div class="scenario-heading"><div><div class="eyebrow">${isPrimary ? "Visão principal selecionada" : "Hipótese uniforme"}</div><h2 id="scenario-${scenario.windowDays}-title">Cenário simulado de ${scenario.windowDays} dias</h2></div><p>Data-base: ${escapeHtml(formatDate(preview.asOf))}</p></div>
    ${metricCards(preview.distinctNameCount, scenario)}
    <h3>Distribuição dos sinais</h3>
    <p>As barras usam o total de ${formatNumber(preview.distinctNameCount)} nomes como denominador. Valores escritos e padrões visuais evitam depender apenas de cores.</p>
    ${distributionBars(preview.distinctNameCount, scenario)}
    <div class="list-intro"><div><h3>Lista dos nomes informados</h3><p>Ordenada dos registros mais antigos para os mais recentes. Use a busca do navegador (⌘F) para localizar um nome sem gravá-lo em URL, histórico ou filtro.</p></div><strong>${formatNumber(scenario.rows.length)} nomes exibidos</strong></div>
    ${audienceTable(scenario)}
  </section>`;
}

function metricCards(total: number, scenario: AudiencePreviewScenario): string {
  return `<ul class="metrics" aria-label="Indicadores do cenário simulado de ${scenario.windowDays} dias">
    ${metric(total, "Nomes distintos", "neutral")}
    ${metric(scenario.atRiskCount, "Sinal em risco · simulação", "risk")}
    ${metric(scenario.inactiveCount, "Sinal inativo · simulação", "inactive")}
    ${metric(scenario.noActionCount, "Sem ação · simulação", "neutral")}
    ${metric(0, "Liberados para uso", "blocked")}
  </ul>`;
}

function metric(value: number, label: string, className: string): string {
  return `<li class="metric ${className}"><strong>${formatNumber(value)}</strong><span>${escapeHtml(label)}</span></li>`;
}

function distributionBars(total: number, scenario: AudiencePreviewScenario): string {
  return `<div class="bar-list" aria-label="Distribuição textual e visual">
    ${bar("Sinal em risco · simulação", scenario.atRiskCount, total, "risk")}
    ${bar("Sinal inativo · simulação", scenario.inactiveCount, total, "inactive")}
    ${bar("Sem ação · simulação", scenario.noActionCount, total, "neutral")}
  </div>`;
}

function bar(label: string, value: number, total: number, className: string): string {
  const percent = total === 0 ? 0 : (value / total) * 100;
  return `<div><div class="bar-copy"><strong>${escapeHtml(label)}</strong><span>${formatNumber(value)} de ${formatNumber(total)} (${formatPercent(percent)})</span></div><div class="bar-track" aria-hidden="true"><span class="bar-fill ${className}" style="width:${percent.toFixed(2)}%"></span></div></div>`;
}

function audienceTable(scenario: AudiencePreviewScenario): string {
  const rows = scenario.rows.map((row) => audienceTableRow(row)).join("");
  return `<div class="table-region" role="region" aria-label="Nomes no cenário simulado de ${scenario.windowDays} dias" tabindex="0"><table class="audience-table"><caption>Todos permanecem não ativáveis: identidade, conclusão do atendimento, promoção e reconciliação não foram comprovadas.</caption><thead><tr><th scope="col">Nome informado na planilha</th><th scope="col">Último registro na planilha</th><th scope="col">Cluster simulado · ${scenario.windowDays} dias</th><th scope="col">Motivo</th><th scope="col">Confiança</th><th scope="col">Bloqueio</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function audienceTableRow(row: AudiencePreviewRow): string {
  const groupClass = row.simulatedGroup === "at_risk" ? "risk" : row.simulatedGroup === "inactive" ? "inactive" : "neutral";
  return `<tr>
    <th scope="row">${escapeHtml(row.nameInSpreadsheet)}</th>
    <td><time datetime="${escapeHtml(row.lastRecordOn)}">${escapeHtml(formatDate(row.lastRecordOn))}</time><span class="confidence-note">há ${formatNumber(row.daysSinceLastRecord)} dias</span></td>
    <td><span class="tag ${groupClass}">${escapeHtml(GROUP_LABELS[row.simulatedGroup])}</span></td>
    <td>${escapeHtml(row.reason)}</td>
    <td><span class="confidence">Baixa</span><span class="confidence-note">Janela sintética; conclusão não comprovada.</span></td>
    <td><span class="tag blocked">${escapeHtml(row.activationBlock)}</span></td>
  </tr>`;
}

function technicalDiagnosis(preview: LocalAudiencePreview): string {
  const sheetRows = preview.diagnostics.sheets.map((sheet) => `<tr><th scope="row">${escapeHtml(sheet.sheetAlias)}</th><td>Coluna ${sheet.nameColumn} → nome informado</td><td>Coluna ${sheet.dateColumn} → último registro</td><td>${formatNumber(sheet.validRecordRows)} de ${formatNumber(sheet.scannedDataRows)}</td></tr>`).join("");
  const codes = [
    "PREVIEW_NON_ACTIONABLE",
    "NAME_ONLY_IDENTITY_IS_PROVISIONAL",
    "EVENT_COMPLETION_NOT_PROVEN",
    "CANONICAL_PROMOTION_NOT_PROVEN",
    "RECONCILIATION_NOT_PROVEN",
    "RETURN_WINDOW_NOT_PUBLISHED",
  ].map((code) => `<li><code>${code}</code></li>`).join("");
  return `<details><summary>Ver diagnóstico técnico</summary><div class="diagnostic">
    <h3>Hipótese de cálculo</h3><p>Para uma janela sintética W: <strong>sem ação</strong> quando a idade do último registro é menor que W; <strong>sinal em risco</strong> de W até antes de 2W; <strong>sinal inativo</strong> a partir de 2W. A tolerância sintética é igual a W. Isso não é uma <code>ReturnWindowDefinition</code> publicada.</p>
    <h3>Mapeamento local protegido</h3><div class="comparison-wrap"><table class="technical-table"><caption>Nomes de arquivos, nomes de abas e cabeçalhos brutos não são reproduzidos.</caption><thead><tr><th scope="col">Origem protegida</th><th scope="col">Nome</th><th scope="col">Data</th><th scope="col">Registros válidos / lidos</th></tr></thead><tbody>${sheetRows}</tbody></table></div>
    <h3>Contagens de leitura</h3><p>${formatNumber(preview.diagnostics.workbookSheetCount)} abas no arquivo; ${formatNumber(preview.diagnostics.recognizedSheetCount)} com nome e data reconhecidos; ${formatNumber(preview.diagnostics.skippedSheetCount)} ignoradas. Foram lidas ${formatNumber(preview.diagnostics.scannedDataRows)} linhas, com ${formatNumber(preview.diagnostics.validRecordRows)} registros válidos, ${formatNumber(preview.diagnostics.invalidDateRows)} datas ausentes/inválidas, ${formatNumber(preview.diagnostics.futureDateRows)} datas futuras e ${formatNumber(preview.diagnostics.namesWithoutValidRecord)} nomes sem registro válido.</p>
    <h3>Códigos e alertas</h3><ul class="code-list">${codes}</ul><p class="privacy-note">Os códigos descrevem gates desta prévia local. Nenhum agrupamento foi promovido, reconciliado ou disponibilizado para ativação.</p>
  </div></details>`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(value / 100);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}
