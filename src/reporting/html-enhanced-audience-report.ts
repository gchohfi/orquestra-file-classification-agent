import { chmod, lstat, mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type {
  EnhancedAudienceAnalysis,
  EnhancedAudienceRow,
  EnhancedLifecycleCluster,
  ProcedureAffinity,
} from "../local/enhanced-audience-analysis.js";
import { LocalWorkbookViewError } from "../local/workbook-data-view.js";

export type EnhancedAudienceReportOptions = Readonly<{
  title?: string;
  generatedAt?: Date;
}>;

const MAX_LOCAL_HTML_BYTES = 32 * 1024 * 1024;
const CLUSTER_LABELS: Readonly<Record<EnhancedLifecycleCluster, string>> = {
  recent_one_time: "Recente pontual",
  active_repeat: "Ativo recorrente",
  risk_one_time: "Em risco pontual",
  risk_repeat: "Em risco recorrente",
  inactive_one_time: "Inativo pontual",
  inactive_repeat: "Inativo recorrente",
};
const CLUSTER_CLASSES: Readonly<Record<EnhancedLifecycleCluster, string>> = {
  recent_one_time: "recent",
  active_repeat: "active",
  risk_one_time: "risk-one",
  risk_repeat: "risk-repeat",
  inactive_one_time: "inactive-one",
  inactive_repeat: "inactive-repeat",
};
const CLUSTER_ORDER: readonly EnhancedLifecycleCluster[] = [
  "recent_one_time",
  "active_repeat",
  "risk_one_time",
  "risk_repeat",
  "inactive_one_time",
  "inactive_repeat",
];
const AFFINITY_ORDER: readonly ProcedureAffinity[] = [
  "Toxina",
  "Linear Z",
  "Bioestímulo",
  "Preenchedor",
  "Consulta",
  "Fios",
  "Esvaziador",
  "Outros",
];

export function renderEnhancedAudienceHtml(
  analysis: EnhancedAudienceAnalysis,
  options: EnhancedAudienceReportOptions = {},
): string {
  const title = options.title ?? "Teste V2 de clusterização — Dra. Marcella";
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
    :root { color-scheme:light; --ink:#17211f; --muted:#53615d; --line:#7c8985; --paper:#f2f3f0; --card:#fff; --brand:#154f4a; --brand-soft:#e0f0ec; --recent:#365761; --recent-soft:#e7eff1; --active:#285f45; --active-soft:#e4f1e9; --risk:#8a5000; --risk-soft:#fff1d3; --inactive:#7a2929; --inactive-soft:#f9e7e5; --overlay:#4d3562; --overlay-soft:#eee6f4; }
    * { box-sizing:border-box; }
    html { scroll-behavior:smooth; }
    body { margin:0; overflow-x:hidden; color:var(--ink); background:var(--paper); font:16px/1.55 Arial,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    a { color:var(--brand); text-underline-offset:3px; }
    :focus-visible { outline:3px solid #0067c5; outline-offset:3px; }
    .skip-link { position:absolute; z-index:30; left:16px; top:-80px; padding:10px 14px; color:#000; background:#fff; border:2px solid #000; }
    .skip-link:focus { top:72px; }
    .top-notice { position:sticky; z-index:20; top:0; min-height:56px; padding:13px max(14px,calc((100vw - 1380px)/2)); color:#fff; background:var(--overlay); border-bottom:4px solid #281734; font-weight:850; }
    .top-notice span { font-weight:500; }
    main { width:min(1380px,calc(100% - 28px)); margin:26px auto 58px; }
    h1,h2,h3 { margin:0; font-family:Georgia,"Times New Roman",serif; letter-spacing:-.02em; }
    h1 { max-width:1050px; font-size:clamp(34px,5vw,58px); line-height:1.04; }
    h2 { font-size:clamp(25px,3vw,34px); }
    h3 { font-size:21px; }
    p { margin:0; }
    .eyebrow { margin-bottom:8px; color:var(--brand); font-size:13px; font-weight:850; letter-spacing:.12em; text-transform:uppercase; }
    .hero,section,details { margin-top:20px; padding:24px; background:var(--card); border:1px solid var(--line); }
    .hero { margin-top:0; padding:30px; border-top:7px solid var(--brand); }
    .lede { max-width:1050px; margin-top:16px; color:#34413e; font-size:18px; }
    .method { margin-top:18px; padding:17px; background:var(--brand-soft); border:2px solid var(--brand); }
    .method strong { display:block; margin-bottom:5px; color:#103d39; font-size:18px; }
    .caveat { margin-top:14px; padding:15px; background:var(--overlay-soft); border-left:5px solid var(--overlay); }
    .privacy { margin-top:13px; color:var(--muted); font-size:14px; }
    .metrics { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin:18px 0 26px; padding:0; list-style:none; }
    .metric { min-height:108px; padding:15px; border:2px solid var(--line); border-top:7px solid var(--brand); }
    .metric.overlay { border-top-color:var(--overlay); background:var(--overlay-soft); }
    .metric.risk { border-top-color:var(--risk); background:var(--risk-soft); }
    .metric.inactive { border-top-color:var(--inactive); background:var(--inactive-soft); }
    .metric strong { display:block; font-size:32px; line-height:1.1; }
    .metric span { display:block; margin-top:7px; color:#394742; font-size:12px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; }
    .bar-list { display:grid; gap:17px; margin-top:18px; }
    .bar-copy { display:flex; flex-wrap:wrap; justify-content:space-between; gap:8px; margin-bottom:7px; }
    .bar-copy span { color:var(--muted); }
    .bar-track { height:22px; overflow:hidden; background:#fff; border:2px solid #58645f; }
    .bar-fill { display:block; height:100%; }
    .bar-fill.recent { background:repeating-linear-gradient(135deg,#365761 0,#365761 8px,#76919a 8px,#76919a 14px); }
    .bar-fill.active { background:repeating-linear-gradient(90deg,#285f45 0,#285f45 9px,#69a083 9px,#69a083 15px); }
    .bar-fill.risk-one { background:repeating-linear-gradient(135deg,#8a5000 0,#8a5000 8px,#d19743 8px,#d19743 14px); }
    .bar-fill.risk-repeat { background:repeating-linear-gradient(90deg,#684000 0,#684000 6px,#d19743 6px,#d19743 12px); }
    .bar-fill.inactive-one { background:repeating-linear-gradient(135deg,#7a2929 0,#7a2929 8px,#c77975 8px,#c77975 14px); }
    .bar-fill.inactive-repeat { background:repeating-linear-gradient(90deg,#571b1b 0,#571b1b 6px,#c77975 6px,#c77975 12px); }
    .overlay-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin-top:18px; }
    .overlay-card { min-height:132px; padding:16px; background:var(--overlay-soft); border:2px solid var(--overlay); }
    .overlay-card strong { display:block; font-size:30px; }
    .overlay-card span { display:block; margin-top:6px; font-weight:800; }
    .overlay-card p { margin-top:7px; color:var(--muted); font-size:13px; }
    .affinity-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin-top:16px; }
    .affinity { padding:12px; background:#f5f7f5; border:1px solid var(--line); }
    .affinity strong { display:block; font-size:24px; }
    .affinity span { color:var(--muted); }
    .list-heading { display:flex; flex-wrap:wrap; justify-content:space-between; gap:10px; align-items:end; }
    .list-heading p { max-width:900px; margin-top:7px; color:var(--muted); }
    .table-region { margin-top:16px; max-height:76vh; overflow:auto; border:1px solid #58645f; }
    table { width:max-content; min-width:100%; border-collapse:separate; border-spacing:0; font-size:14px; }
    caption { padding:11px 12px; color:var(--muted); background:#f6f7f5; text-align:left; }
    th,td { max-width:390px; min-width:145px; padding:10px 11px; border-right:1px solid #c1c9c5; border-bottom:1px solid #c1c9c5; text-align:left; vertical-align:top; overflow-wrap:anywhere; }
    thead th { position:sticky; z-index:6; top:0; color:#263431; background:#e8eeeb; border-bottom:2px solid #58645f; }
    .name { position:sticky; z-index:4; left:0; min-width:250px; max-width:310px; background:#f4edf7; }
    thead .name { z-index:9; }
    .money { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
    .tag { display:inline-block; margin:2px 4px 2px 0; padding:4px 8px; border:2px solid currentColor; font-size:11px; font-weight:850; text-transform:uppercase; }
    .tag.recent { color:#294b54; background:var(--recent-soft); }
    .tag.active { color:#1f543b; background:var(--active-soft); }
    .tag.risk-one,.tag.risk-repeat { color:#6e4000; background:var(--risk-soft); }
    .tag.inactive-one,.tag.inactive-repeat { color:#672020; background:var(--inactive-soft); }
    .tag.overlay { color:#4d3562; background:var(--overlay-soft); }
    .note { display:block; margin-top:5px; color:var(--muted); font-size:12px; }
    details { padding:0; }
    summary { min-height:52px; padding:15px 20px; cursor:pointer; color:var(--brand); font-weight:850; }
    .diagnostic { padding:4px 22px 22px; border-top:1px solid var(--line); }
    .diagnostic p + p { margin-top:9px; }
    .footer { margin-top:18px; padding:12px 4px; color:var(--muted); font-size:13px; }
    @media (max-width:1000px) { .metrics,.overlay-grid,.affinity-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
    @media (max-width:620px) { main { width:min(100% - 18px,1380px); margin-top:14px; } .hero,section { padding:17px; } .metrics,.overlay-grid,.affinity-grid { grid-template-columns:1fr; } .top-notice { padding:10px; font-size:14px; } }
    @media print { @page { size:A4 landscape; margin:16mm 9mm 13mm; } body { color:#000; background:#fff; font-size:10px; } .top-notice { position:fixed; top:-12mm; left:0; right:0; min-height:0; padding:3px; color:#000; background:#fff; border:3px solid #000; text-align:center; } main { width:100%; margin:0; } .table-region { max-height:none; overflow:visible; } thead { display:table-header-group; } tr { break-inside:avoid; } }
  </style>
</head>
<body>
  <div class="top-notice" role="status">Teste V2 real · somente leitura <span>— não enviado ao Supabase, campanhas ou automações.</span></div>
  <a class="skip-link" href="#cluster-list">Pular para a lista de nomes</a>
  <main>
    <header class="hero">
      <div class="eyebrow">Recência + frequência + valor + afinidade</div>
      <h1>${escapeHtml(title)}</h1>
      <p class="lede">Nova leitura dos dados reais com seis clusters principais e etiquetas complementares. A data-base é <strong>${escapeHtml(formatDate(analysis.asOf))}</strong>.</p>
      <div class="method"><strong>Como o cluster principal é definido</strong><p>Recência mantém a janela aprovada de ${formatNumber(analysis.windowDays)} dias. Frequência separa histórico pontual de recorrente a partir de ${formatNumber(analysis.repeatThreshold)} atendimentos operacionais distintos.</p></div>
      <div class="caveat"><strong>Valor e identidade continuam limitados:</strong> o valor é uma soma candidata dos grupos de procedimento, não faturamento ou recebimento confirmado. Nomes são agrupados pela grafia normalizada e podem combinar homônimos.</div>
      <p class="privacy">Contém nomes e valores reais apenas neste HTML local. Fora do Git, sem GPT, Supabase ou rede; a pasta do projeto pode ser sincronizada pelo iCloud.</p>
    </header>

    <section aria-labelledby="clusters-title">
      <div class="eyebrow">Seis grupos exclusivos</div>
      <h2 id="clusters-title">Distribuição dos clusters principais</h2>
      <ul class="metrics" aria-label="Resumo estrutural">
        ${metric(analysis.totalNameCount, "Nomes classificados", "")}
        ${metric(analysis.sourceEventCount, "Atendimentos operacionais", "")}
        ${metric(analysis.reliableValueNameCount, "Valores candidatos completos", "")}
        ${metric(analysis.incompleteValueNameCount, "Valores excluídos", "overlay")}
      </ul>
      <p>As barras usam ${formatNumber(analysis.totalNameCount)} nomes como denominador e repetem os valores por escrito.</p>
      ${clusterBars(analysis)}
    </section>

    <section aria-labelledby="overlays-title">
      <div class="eyebrow">Etiquetas que podem se sobrepor</div>
      <h2 id="overlays-title">Prioridades complementares para revisão</h2>
      ${overlayCards(analysis)}
    </section>

    <section aria-labelledby="affinity-title">
      <div class="eyebrow">Histórico de procedimento</div>
      <h2 id="affinity-title">Afinidades observadas</h2>
      <p>Um mesmo nome pode aparecer em várias famílias; por isso, estas contagens não somam ${formatNumber(analysis.totalNameCount)}.</p>
      ${affinityCards(analysis)}
    </section>

    <section id="cluster-list" aria-labelledby="list-title">
      <div class="list-heading"><div><h2 id="list-title">Classificação detalhada por nome</h2><p>Reativações prioritárias aparecem primeiro. Use ⌘F para localizar um nome. Nenhuma linha autoriza contato.</p></div><strong>${formatNumber(analysis.rows.length)} nomes exibidos</strong></div>
      ${audienceTable(analysis)}
    </section>

    ${diagnostic(analysis)}
    <footer class="footer">Gerado em ${escapeHtml(formatDateTime(generatedAt))}. Teste V2 real · uso somente como relatório · não compartilhar.</footer>
  </main>
</body>
</html>`;
  if (Buffer.byteLength(html, "utf8") > MAX_LOCAL_HTML_BYTES) throw new LocalWorkbookViewError("LOCAL_HTML_SIZE_LIMIT_EXCEEDED");
  return html;
}

export async function writeEnhancedAudienceHtmlReport(
  path: string,
  analysis: EnhancedAudienceAnalysis,
  options: EnhancedAudienceReportOptions = {},
): Promise<string> {
  const absolutePath = resolve(path);
  const directory = dirname(absolutePath);
  await assertExistingWorkspaceDirectoryComponents(directory);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await assertSafeReportDirectory(directory);
  await chmod(directory, 0o700);
  if (await lstat(absolutePath).catch(() => null)) throw new LocalWorkbookViewError("REPORT_ALREADY_EXISTS");
  await writeFile(absolutePath, renderEnhancedAudienceHtml(analysis, options), { encoding: "utf8", flag: "wx", mode: 0o600 });
  await chmod(absolutePath, 0o600);
  return absolutePath;
}

function metric(value: number, label: string, className: string): string {
  return `<li class="metric ${className}"><strong>${formatNumber(value)}</strong><span>${escapeHtml(label)}</span></li>`;
}

function clusterBars(analysis: EnhancedAudienceAnalysis): string {
  return `<div class="bar-list" aria-label="Distribuição dos seis clusters">${CLUSTER_ORDER.map((cluster) => {
    const count = analysis.clusterCounts[cluster];
    const percent = analysis.totalNameCount === 0 ? 0 : count / analysis.totalNameCount * 100;
    return `<div><div class="bar-copy"><strong>${escapeHtml(CLUSTER_LABELS[cluster])}</strong><span>${formatNumber(count)} de ${formatNumber(analysis.totalNameCount)} · ${formatPercent(percent)}</span></div><div class="bar-track" role="img" aria-label="${escapeHtml(CLUSTER_LABELS[cluster])}: ${formatNumber(count)} de ${formatNumber(analysis.totalNameCount)}"><span class="bar-fill ${CLUSTER_CLASSES[cluster]}" style="width:${percent.toFixed(2)}%"></span></div></div>`;
  }).join("")}</div>`;
}

function overlayCards(analysis: EnhancedAudienceAnalysis): string {
  return `<div class="overlay-grid">
    ${overlay(analysis.vipCandidateCount, "VIP candidato", `Recorrente e no quartil superior de valor candidato, a partir de ${money(analysis.vipThresholdCents)}.`)}
    ${overlay(analysis.priorityReactivationCount, "Reativação prioritária", "Em risco ou inativo e no quartil superior de valor candidato.")}
    ${overlay(analysis.crossSellReviewCount, "Cross-sell para revisão", "Recorrente e concentrado em uma única família; exige matriz clínica/comercial.")}
    ${overlay(analysis.incompleteValueNameCount, "Valor não classificável", "Excluído de VIP por preço, quantidade ou evidência financeira conflitante.")}
  </div>`;
}

function overlay(value: number, label: string, description: string): string {
  return `<article class="overlay-card"><strong>${formatNumber(value)}</strong><span>${escapeHtml(label)}</span><p>${escapeHtml(description)}</p></article>`;
}

function affinityCards(analysis: EnhancedAudienceAnalysis): string {
  return `<div class="affinity-grid">${AFFINITY_ORDER.filter((affinity) => analysis.affinityCounts[affinity] > 0).map((affinity) => `<div class="affinity"><strong>${formatNumber(analysis.affinityCounts[affinity])}</strong><span>${escapeHtml(affinity)}</span></div>`).join("")}</div>`;
}

function audienceTable(analysis: EnhancedAudienceAnalysis): string {
  const rows = analysis.rows.map((row) => audienceRow(row)).join("");
  return `<div class="table-region" role="region" tabindex="0" aria-label="Tabela ampla da clusterização V2"><table><caption>Valor histórico é candidato e só aparece quando todos os eventos do nome têm evidência de preço consistente.</caption><thead><tr><th class="name" scope="col">Nome informado</th><th scope="col">Último registro</th><th scope="col">Dias</th><th scope="col">Atendimentos</th><th scope="col">Cluster principal</th><th class="money" scope="col">Valor histórico candidato</th><th scope="col">Evidência de valor</th><th scope="col">Etiquetas complementares</th><th scope="col">Afinidades</th><th scope="col">Uso</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function audienceRow(row: EnhancedAudienceRow): string {
  const overlays = [
    row.priorityReactivation ? `<span class="tag overlay">Reativação prioritária</span>` : "",
    row.vipCandidate ? `<span class="tag overlay">VIP candidato</span>` : "",
    row.crossSellReview ? `<span class="tag overlay">Cross-sell para revisão</span>` : "",
  ].filter(Boolean).join("") || `<span class="note">Sem etiqueta complementar.</span>`;
  const valueEvidence = row.valueEvidence === "complete_candidate"
    ? `Candidato completo<span class="note">Não confirma receita ou pagamento.</span>`
    : `Excluído<span class="note">Há evidência financeira inconsistente.</span>`;
  return `<tr><th class="name" scope="row">${escapeHtml(row.nameInSpreadsheet)}</th><td><time datetime="${escapeHtml(row.lastRecordOn)}">${escapeHtml(formatDate(row.lastRecordOn))}</time></td><td>${formatNumber(row.daysSinceLastRecord)}</td><td>${formatNumber(row.eventCount)}</td><td><span class="tag ${CLUSTER_CLASSES[row.lifecycleCluster]}">${escapeHtml(CLUSTER_LABELS[row.lifecycleCluster])}</span></td><td class="money">${money(row.candidateHistoricalValueCents)}</td><td>${valueEvidence}</td><td>${overlays}</td><td>${row.affinities.length > 0 ? row.affinities.map((affinity) => `<span class="tag">${escapeHtml(affinity)}</span>`).join("") : `<span class="note">Não identificada.</span>`}</td><td>Somente relatório<span class="note">Identidade por nome; sem ativação.</span></td></tr>`;
}

function diagnostic(analysis: EnhancedAudienceAnalysis): string {
  return `<details><summary>Ver metodologia e diagnóstico técnico</summary><div class="diagnostic"><p><strong>Cluster principal:</strong> recência de ${formatNumber(analysis.windowDays)} dias × frequência mínima de ${formatNumber(analysis.repeatThreshold)} eventos para recorrência.</p><p><strong>VIP candidato:</strong> percentil ${formatPercent(analysis.vipPercentile * 100)} do valor histórico candidato entre ${formatNumber(analysis.reliableValueNameCount)} nomes com evidência completa; limiar observado ${money(analysis.vipThresholdCents)}.</p><p><strong>Eventos excluídos:</strong> ${formatNumber(analysis.excludedEventCount)} por nome/data ausente, conflitante ou futura. <strong>Nomes sem valor completo:</strong> ${formatNumber(analysis.incompleteValueNameCount)}.</p><p><strong>Limites:</strong> afinidade é textual; cross-sell não é recomendação clínica; parcela vencida não prova inadimplência; valor candidato não prova faturamento ou recebimento.</p></div></details>`;
}

function money(valueCents: number | null): string {
  if (valueCents === null || !Number.isFinite(valueCents)) return "Não classificável";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valueCents / 100);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(value);
}

function formatNumber(value: number): string { return new Intl.NumberFormat("pt-BR").format(value); }
function formatPercent(value: number): string { return new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value / 100); }
function escapeHtml(value: string): string { return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, "�").replace(/[&<>"']/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character); }

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
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new LocalWorkbookViewError("REPORT_DIRECTORY_NOT_REGULAR");
  }
}

async function assertSafeReportDirectory(directory: string): Promise<void> {
  const directoryStat = await lstat(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) throw new LocalWorkbookViewError("REPORT_DIRECTORY_NOT_REGULAR");
  const components = workspaceRelativeComponents(directory);
  if (components === null) return;
  let current = resolve(".");
  for (const component of components) {
    current = resolve(current, component);
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new LocalWorkbookViewError("REPORT_DIRECTORY_NOT_REGULAR");
  }
}

function workspaceRelativeComponents(directory: string): string[] | null {
  const workspaceRoot = resolve(".");
  const relativePath = relative(workspaceRoot, directory);
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) return null;
  return relativePath.split(sep).filter(Boolean);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException { return error instanceof Error && "code" in error; }
