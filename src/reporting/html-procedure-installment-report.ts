import { chmod, lstat, mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type {
  ArithmeticReconciliationStatus,
  InstallmentGroup,
  ProcedureGroup,
  ProcedureInstallmentEvent,
  ProcedureInstallmentView,
} from "../local/procedure-installment-view.js";
import {
  LocalWorkbookViewError,
  type LocalWorkbookCell,
  type LocalWorkbookColumn,
  type LocalWorkbookRow,
} from "../local/workbook-data-view.js";

export type ProcedureInstallmentReportOptions = Readonly<{
  title?: string;
  generatedAt?: Date;
}>;

type RenderedEvent = Readonly<{
  event: ProcedureInstallmentEvent;
  domId: string;
}>;

const MAX_LOCAL_HTML_BYTES = 64 * 1024 * 1024;
const STATUS_ORDER: Readonly<Record<ArithmeticReconciliationStatus, number>> = {
  blocked: 0,
  mismatch: 1,
  matched: 2,
};
const STATUS_LABELS: Readonly<Record<ArithmeticReconciliationStatus, string>> = {
  blocked: "Bloqueado",
  mismatch: "Diverge",
  matched: "Bate sob hipótese",
};
const METADATA_ENUM_LABELS: Readonly<Record<string, string>> = {
  source_event_id: "Identificador operacional informado na planilha",
  line_amount_hypothesis: "Hipótese de valor por grupo textual; não representa faturamento ou recebimento",
  blocked: "Bloqueada; depende de revisão",
  review_required: "Revisão obrigatória",
  not_eligible: "Não elegível",
  non_actionable: "Não acionável",
};

export function renderProcedureInstallmentHtml(
  view: ProcedureInstallmentView,
  options: ProcedureInstallmentReportOptions = {},
): string {
  const title = options.title ?? "Conferência de procedimentos e parcelas — Dra. Marcella";
  const generatedAt = options.generatedAt ?? new Date();
  const sourceOrderIds = new Map(view.events.map((event, index) => [
    event,
    `event-${String(index + 1).padStart(3, "0")}`,
  ]));
  const events = sortEvents(view.events).map((event): RenderedEvent => ({
    event,
    domId: sourceOrderIds.get(event) ?? "event-unassigned",
  }));
  const counts = statusCounts(events);
  const toleranceCents = readToleranceCents(view) ?? 0;

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; connect-src 'none'; img-src 'none'; media-src 'none'; font-src 'none'; object-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme:light; --ink:#17211f; --muted:#53615d; --line:#7c8985; --paper:#f2f3f0; --card:#fff; --brand:#154f4a; --brand-dark:#103d39; --brand-soft:#e1f0ec; --matched:#285f45; --matched-soft:#e4f1e9; --mismatch:#8a5000; --mismatch-soft:#fff1d3; --blocked:#7a2929; --blocked-soft:#f9e7e5; --raw:#3d4f64; --raw-soft:#e9eef4; }
    * { box-sizing:border-box; }
    html { scroll-behavior:smooth; }
    body { margin:0; overflow-x:hidden; color:var(--ink); background:var(--paper); font:16px/1.5 Arial,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    a { color:#0b514b; text-underline-offset:3px; }
    summary { font:inherit; }
    :focus-visible { outline:3px solid #0067c5; outline-offset:3px; }
    .skip-link { position:absolute; z-index:40; left:16px; top:-90px; padding:10px 14px; color:#000; background:#fff; border:2px solid #000; }
    .skip-link:focus { top:74px; }
    .top-warning { position:sticky; z-index:30; top:0; min-height:58px; padding:13px max(14px,calc((100vw - 1440px)/2)); color:#fff; background:var(--blocked); border-bottom:4px solid #351010; font-weight:850; }
    .top-warning span { font-weight:500; }
    main { width:min(1440px,calc(100% - 28px)); margin:26px auto 60px; }
    h1,h2,h3,h4,h5 { margin:0; font-family:Georgia,"Times New Roman",serif; letter-spacing:-.02em; }
    h1 { max-width:1050px; font-size:clamp(34px,5vw,58px); line-height:1.04; }
    h2 { font-size:clamp(25px,3vw,35px); }
    h3 { font-size:clamp(21px,2.5vw,27px); }
    h4 { font-size:20px; }
    h5 { font-size:18px; }
    p { margin:0; }
    .eyebrow { margin-bottom:8px; color:var(--brand); font-size:13px; font-weight:850; letter-spacing:.12em; text-transform:uppercase; }
    .hero,section,.event-card { margin-top:20px; padding:24px; background:var(--card); border:1px solid var(--line); }
    .hero { margin-top:0; padding:30px; border-top:7px solid var(--brand-dark); }
    .lede { max-width:1050px; margin-top:16px; color:#34413e; font-size:18px; }
    .source { margin-top:14px; color:var(--muted); overflow-wrap:anywhere; }
    .source strong { color:var(--ink); }
    .no-total { margin-top:20px; padding:18px; color:#4f1c1c; background:var(--blocked-soft); border:2px solid var(--blocked); }
    .no-total strong { display:block; margin-bottom:5px; font-size:18px; }
    .metadata { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px 22px; margin:18px 0 0; padding:16px; background:#f7f8f6; border:1px solid var(--line); }
    .metadata div { min-width:0; }
    .metadata dt { color:var(--muted); font-size:12px; font-weight:850; letter-spacing:.04em; text-transform:uppercase; }
    .metadata dd { margin:4px 0 0; overflow-wrap:anywhere; }
    .metrics { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin:20px 0 0; padding:0; list-style:none; }
    .metric { min-height:112px; padding:15px; background:#fff; border:2px solid var(--line); border-top-width:7px; }
    .metric.total { border-top-color:var(--brand); }
    .metric.matched { border-top-color:var(--matched); background:var(--matched-soft); }
    .metric.mismatch { border-top-color:var(--mismatch); background:var(--mismatch-soft); }
    .metric.blocked { border-top-color:var(--blocked); background:var(--blocked-soft); }
    .metric strong { display:block; font-size:32px; line-height:1.1; }
    .metric span { display:block; margin-top:7px; color:#394742; font-size:12px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; }
    .bar-list { display:grid; gap:18px; margin-top:18px; }
    .bar-copy { display:flex; flex-wrap:wrap; justify-content:space-between; gap:8px; margin-bottom:7px; }
    .bar-copy span { color:var(--muted); }
    .bar-track { height:22px; overflow:hidden; background:#fff; border:2px solid #58645f; }
    .bar-fill { display:block; height:100%; }
    .bar-fill.matched { background:repeating-linear-gradient(135deg,#285f45 0,#285f45 8px,#69a083 8px,#69a083 14px); }
    .bar-fill.mismatch { background:repeating-linear-gradient(90deg,#8a5000 0,#8a5000 9px,#d19743 9px,#d19743 15px); }
    .bar-fill.blocked { background:repeating-linear-gradient(135deg,#7a2929 0,#7a2929 8px,#c77975 8px,#c77975 14px); }
    .jump-list { display:flex; flex-wrap:wrap; gap:10px; margin:16px 0 0; padding:0; list-style:none; }
    .jump-list a { display:inline-flex; min-height:44px; align-items:center; padding:8px 13px; background:#fff; border:2px solid var(--brand); font-weight:800; }
    .table-region { margin-top:16px; max-height:76vh; overflow:auto; background:#fff; border:1px solid #58645f; }
    table { width:max-content; min-width:100%; border-collapse:separate; border-spacing:0; font-size:14px; }
    caption { padding:11px 12px; color:var(--muted); background:#f6f7f5; text-align:left; }
    th,td { max-width:390px; min-width:135px; padding:9px 10px; border-right:1px solid #c1c9c5; border-bottom:1px solid #c1c9c5; text-align:left; vertical-align:top; white-space:pre-wrap; overflow-wrap:anywhere; }
    thead th { position:sticky; z-index:6; top:0; color:#263431; background:#e8eeeb; border-bottom:2px solid #58645f; }
    tbody tr:last-child > * { border-bottom:0; }
    .index-table { min-width:1460px; }
    .index-id { position:sticky; z-index:5; left:0; min-width:104px; max-width:104px; background:#f2f5f3; }
    thead .index-id { z-index:10; }
    .index-name { position:sticky; z-index:4; left:104px; min-width:250px; max-width:300px; background:#f5eef8; }
    thead .index-name { z-index:9; }
    .money { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
    .status { display:inline-block; padding:4px 8px; border:2px solid currentColor; font-size:12px; font-weight:850; letter-spacing:.02em; text-transform:uppercase; }
    .status.matched { color:#1f543b; background:var(--matched-soft); }
    .status.mismatch { color:#6e4000; background:var(--mismatch-soft); }
    .status.blocked { color:#672020; background:var(--blocked-soft); }
    .status-note { display:block; margin-top:5px; color:var(--muted); font-size:12px; }
    .event-group { scroll-margin-top:80px; }
    .event-list { display:grid; gap:18px; margin-top:18px; }
    .event-card { margin:0; padding:0; scroll-margin-top:80px; border-top-width:7px; }
    .event-card.matched { border-top-color:var(--matched); }
    .event-card.mismatch { border-top-color:var(--mismatch); }
    .event-card.blocked { border-top-color:var(--blocked); }
    .event-heading { padding:22px; }
    .event-title-row { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:flex-start; gap:14px; }
    .event-title-row h3 { overflow-wrap:anywhere; }
    .identity-line { margin-top:10px; color:#33403d; font-size:18px; overflow-wrap:anywhere; }
    .identity-line strong { color:var(--ink); }
    .origin-line { margin-top:8px; color:var(--muted); overflow-wrap:anywhere; }
    .event-values { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:10px; margin:18px 0 0; padding:0; list-style:none; }
    .event-values li { min-height:102px; padding:13px; background:#f7f8f6; border:1px solid var(--line); }
    .event-values strong { display:block; font-size:22px; font-variant-numeric:tabular-nums; overflow-wrap:anywhere; }
    .event-values span { display:block; margin-top:6px; color:var(--muted); font-size:11px; font-weight:800; text-transform:uppercase; }
    .diagnosis { margin-top:16px; padding:14px; background:#f7f8f6; border-left:5px solid var(--line); }
    .diagnosis.matched { border-left-color:var(--matched); }
    .diagnosis.mismatch { border-left-color:var(--mismatch); }
    .diagnosis.blocked { border-left-color:var(--blocked); }
    .code-list { display:flex; flex-wrap:wrap; gap:7px; margin:10px 0 0; padding:0; list-style:none; }
    .code-list li { padding:4px 7px; background:#fff; border:1px solid var(--line); }
    code { font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace; white-space:pre-wrap; overflow-wrap:anywhere; }
    .event-body { display:grid; gap:18px; padding:0 22px 22px; }
    .subsection h4 { margin-bottom:8px; }
    .subsection > p { color:var(--muted); }
    .procedure-table { min-width:1200px; }
    .installment-table { min-width:1050px; }
    .procedure-stack { display:grid; gap:14px; margin-top:14px; }
    .procedure-block { padding:16px; background:#fbfcfa; border:1px solid var(--line); border-left:6px solid var(--brand); }
    .procedure-block > .table-region { margin-top:10px; }
    .linked-installments { margin-top:14px; padding-top:14px; border-top:1px dashed var(--line); }
    .linked-installments > p { margin-top:5px; color:var(--muted); }
    .relationship { display:inline-block; margin-top:4px; padding:3px 6px; color:#553500; background:var(--mismatch-soft); border:1px solid currentColor; font-size:11px; font-weight:850; }
    .linked-table { min-width:980px; }
    details.raw-lines { background:#fff; border:2px solid var(--raw); }
    details.raw-lines > summary { min-height:54px; padding:15px 17px; color:var(--raw); background:var(--raw-soft); cursor:pointer; font-weight:850; }
    .raw-body { padding:0 14px 14px; border-top:1px solid var(--raw); }
    .raw-table { font-size:13px; }
    .raw-table th,.raw-table td { min-width:145px; max-width:360px; }
    .raw-origin { position:sticky; z-index:5; left:0; min-width:105px !important; max-width:105px !important; background:#f2f5f3; }
    thead .raw-origin { z-index:10; }
    .column-letter { display:block; color:var(--muted); font:700 11px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace; letter-spacing:.06em; text-transform:uppercase; }
    .column-header { display:block; margin-top:4px; color:var(--ink); }
    .cell-meta { display:block; margin-bottom:4px; color:var(--muted); font-size:11px; font-weight:800; text-transform:uppercase; }
    .cell-extra { display:block; margin-top:7px; padding-top:6px; border-top:1px dashed #9da8a4; }
    .empty-value { color:#7c8783; font-style:italic; }
    .multi-value { display:block; }
    .multi-value + .multi-value { margin-top:4px; padding-top:4px; border-top:1px dotted #aeb7b3; }
    .back-link { display:inline-flex; min-height:44px; align-items:center; margin-top:14px; font-weight:800; }
    .footer { margin-top:18px; padding:12px 4px; color:var(--muted); font-size:13px; }
    @media (max-width:1050px) { .metrics { grid-template-columns:repeat(2,minmax(0,1fr)); } .event-values { grid-template-columns:repeat(2,minmax(0,1fr)); } }
    @media (max-width:700px) { main { width:min(100% - 18px,1440px); margin-top:14px; } .hero,section { padding:16px; } .metadata,.metrics,.event-values { grid-template-columns:1fr; } .top-warning { padding:10px; font-size:14px; } .event-heading { padding:17px; } .event-body { padding:0 17px 17px; } }
    @media print { @page { size:A4 landscape; margin:16mm 9mm 13mm; } body { color:#000; background:#fff; font-size:10px; } .top-warning { position:fixed; top:-12mm; left:0; right:0; min-height:0; padding:3px; color:#000; background:#fff; border:3px solid #000; text-align:center; } main { width:100%; margin:0; } .skip-link,.jump-list,.back-link { display:none; } .hero,section,.event-card { border-color:#000; } .table-region { max-height:none; overflow:visible; } thead { display:table-header-group; } tr { break-inside:avoid; } details.raw-lines:not([open]) > .raw-body { display:none; } }
  </style>
</head>
<body>
  <div class="top-warning" role="alert">Reconciliação provisória para conferência — não acionável <span>· não comprova identidade, conclusão do atendimento, pagamento ou elegibilidade para contato.</span></div>
  <a class="skip-link" href="#event-index">Pular para o índice dos agrupamentos operacionais</a>
  <main>
    <header class="hero">
      <div class="eyebrow">Dados reais · arquivo local · somente leitura</div>
      <h1>${escapeHtml(title)}</h1>
      <p class="lede">Conferência aritmética local entre grupos textuais candidatos de procedimentos, produtos e parcelas. Os nomes abaixo são <strong>nomes informados na planilha</strong>; o agrupamento não cria uma pessoa canônica e o resultado “Bate sob hipótese” não confirma unicidade, obrigação financeira ou recebimento.</p>
      <p class="source">Fonte exibida: <strong>${escapeHtml(view.sourceLabel)}</strong> · Aba ${formatNumber(view.sourceSheetIndex)}: <strong>${escapeHtml(view.sourceSheetName)}</strong> · ${formatNumber(view.sourceColumns.length)} colunas brutas.</p>
      <aside class="no-total"><strong>Não há total financeiro global neste relatório.</strong><p>Grupos de itens, parcelas candidatas e ocorrências brutas têm granularidades diferentes. Compare cada agrupamento individualmente; não some valores entre agrupamentos operacionais sem reconciliação aprovada.</p></aside>
      ${viewMetadata(view, toleranceCents)}
      ${metricCards(events.length, counts)}
    </header>

    <section aria-labelledby="distribution-title">
      <h2 id="distribution-title">Situação aritmética dos agrupamentos</h2>
      <p>As barras usam ${formatNumber(events.length)} agrupamentos como denominador. Contagens e rótulos permanecem legíveis sem depender das cores.</p>
      ${statusBars(events.length, counts)}
      <nav aria-label="Atalhos para os grupos de conferência"><ul class="jump-list">
        <li><a href="#status-blocked">Bloqueados (${formatNumber(counts.blocked)})</a></li>
        <li><a href="#status-mismatch">Divergências (${formatNumber(counts.mismatch)})</a></li>
        <li><a href="#status-matched">Conferências que batem sob hipótese (${formatNumber(counts.matched)})</a></li>
      </ul></nav>
    </section>

    <section id="event-index" aria-labelledby="event-index-title">
      <h2 id="event-index-title">Índice para conferência</h2>
      <p>Ordem: bloqueados; divergências por valor absoluto da diferença, da maior para a menor; e conferências que batem sob a hipótese atual. Use ⌘F para localizar um nome sem criar filtros, URLs ou arquivos auxiliares.</p>
      ${eventIndex(events, toleranceCents)}
    </section>

    ${eventGroups(events, view, toleranceCents)}

    <footer class="footer">Gerado localmente em ${escapeHtml(formatDateTime(generatedAt))}. Contém nomes e valores reais no próprio HTML. Sem JavaScript, JSON incorporado, rede ou recursos externos. Não compartilhar. Se salvo no iCloud Drive, o arquivo pode ser sincronizado pelo iCloud.</footer>
  </main>
</body>
</html>`;

  if (Buffer.byteLength(html, "utf8") > MAX_LOCAL_HTML_BYTES) {
    throw new LocalWorkbookViewError("LOCAL_HTML_SIZE_LIMIT_EXCEEDED");
  }
  return html;
}

export async function writeProcedureInstallmentHtmlReport(
  path: string,
  view: ProcedureInstallmentView,
  options: ProcedureInstallmentReportOptions = {},
): Promise<string> {
  const absolutePath = resolve(path);
  const directory = dirname(absolutePath);
  await assertExistingWorkspaceDirectoryComponents(directory);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await assertSafeReportDirectory(directory);
  await chmod(directory, 0o700);
  if (await lstat(absolutePath).catch(() => null)) {
    throw new LocalWorkbookViewError("REPORT_ALREADY_EXISTS");
  }
  try {
    await writeFile(absolutePath, renderProcedureInstallmentHtml(view, options), {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if (isNodeError(error) && error.code === "EEXIST") {
      throw new LocalWorkbookViewError("REPORT_ALREADY_EXISTS");
    }
    throw error;
  }
  await chmod(absolutePath, 0o600);
  return absolutePath;
}

function sortEvents(events: readonly ProcedureInstallmentEvent[]): ProcedureInstallmentEvent[] {
  return [...events].sort((left, right) => {
    const byStatus = STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
    if (byStatus !== 0) return byStatus;
    if (left.status === "mismatch" && right.status === "mismatch") {
      const leftMagnitude = left.varianceCents === null ? -1 : Math.abs(left.varianceCents);
      const rightMagnitude = right.varianceCents === null ? -1 : Math.abs(right.varianceCents);
      if (leftMagnitude !== rightMagnitude) return rightMagnitude - leftMagnitude;
    }
    const bySourceRow = firstSourceRow(left) - firstSourceRow(right);
    return bySourceRow !== 0
      ? bySourceRow
      : left.eventId.localeCompare(right.eventId, "pt-BR", { numeric: true });
  });
}

function firstSourceRow(event: ProcedureInstallmentEvent): number {
  return event.rawRows[0]?.sourceRow ?? Number.MAX_SAFE_INTEGER;
}

function statusCounts(events: readonly RenderedEvent[]): Record<ArithmeticReconciliationStatus, number> {
  return {
    matched: events.filter(({ event }) => event.status === "matched").length,
    mismatch: events.filter(({ event }) => event.status === "mismatch").length,
    blocked: events.filter(({ event }) => event.status === "blocked").length,
  };
}

function metricCards(
  total: number,
  counts: Readonly<Record<ArithmeticReconciliationStatus, number>>,
): string {
  return `<ul class="metrics" aria-label="Contagens dos agrupamentos">
    ${metric(total, "Agrupamentos conferidos", "total")}
    ${metric(counts.matched, "Bate sob hipótese aritmética", "matched")}
    ${metric(counts.mismatch, "Diverge aritmeticamente", "mismatch")}
    ${metric(counts.blocked, "Conferência bloqueada", "blocked")}
  </ul>`;
}

function metric(value: number, label: string, className: string): string {
  return `<li class="metric ${className}"><strong>${formatNumber(value)}</strong><span>${escapeHtml(label)}</span></li>`;
}

function statusBars(
  total: number,
  counts: Readonly<Record<ArithmeticReconciliationStatus, number>>,
): string {
  return `<div class="bar-list" aria-label="Distribuição dos status">
    ${statusBar("matched", counts.matched, total)}
    ${statusBar("mismatch", counts.mismatch, total)}
    ${statusBar("blocked", counts.blocked, total)}
  </div>`;
}

function statusBar(status: ArithmeticReconciliationStatus, count: number, total: number): string {
  const percentage = total > 0 ? Math.max(0, Math.min(100, (count / total) * 100)) : 0;
  const percentageLabel = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(percentage);
  return `<div><div class="bar-copy"><strong>${STATUS_LABELS[status]}</strong><span>${formatNumber(count)} de ${formatNumber(total)} · ${percentageLabel}%</span></div><div class="bar-track" role="img" aria-label="${escapeHtml(STATUS_LABELS[status])}: ${formatNumber(count)} de ${formatNumber(total)}, ${percentageLabel} por cento"><span class="bar-fill ${status}" style="width:${percentage.toFixed(4)}%"></span></div></div>`;
}

function viewMetadata(view: ProcedureInstallmentView, toleranceCents: number): string {
  const groupingBasis = metadataText(Reflect.get(view, "groupingBasis")) ?? "Identificador operacional informado na planilha; conferir conflitos e ausências.";
  const priceSemantics = metadataText(Reflect.get(view, "priceSemantics")) ?? "Valores preservados da origem; sem qualificação como faturado, recebido ou ticket.";
  const activationEligibility = metadataText(Reflect.get(view, "activationEligibility")) ?? "Não acionável nesta conferência local.";
  return `<dl class="metadata">
    <div><dt>Base do agrupamento</dt><dd>${displayText(groupingBasis)}</dd></div>
    <div><dt>Semântica de preço</dt><dd>${displayText(priceSemantics)}</dd></div>
    <div><dt>Hipótese de tolerância aritmética</dt><dd>${escapeHtml(formatCents(toleranceCents))} · parâmetro ainda não aprovado</dd></div>
    <div><dt>Elegibilidade informada</dt><dd>${displayText(activationEligibility)} Este HTML permanece não acionável.</dd></div>
  </dl>`;
}

function eventIndex(events: readonly RenderedEvent[], defaultToleranceCents: number): string {
  const rows = events.map(({ event, domId }) => {
    const toleranceCents = readToleranceCents(event) ?? defaultToleranceCents;
    return `<tr>
      <th class="index-id" scope="row"><a href="#${domId}">${domId}</a></th>
      <td class="index-name">${listValues(event.namesInSpreadsheet)}</td>
      <td>${listValues(event.recordDates)}</td>
      <td>${displayText(event.eventId)}</td>
      <td>${statusBadge(event.status)}</td>
      <td class="money">${moneyCell(event.procedureTotalCents)}</td>
      <td class="money">${moneyCell(event.installmentTotalCents)}</td>
      <td class="money">${moneyCell(event.rawInstallmentTotalCents)}</td>
      <td class="money">${moneyCell(event.varianceCents, true)}</td>
      <td class="money">${escapeHtml(formatCents(toleranceCents))}</td>
      <td><a href="#${domId}">Ver detalhes</a></td>
    </tr>`;
  }).join("");
  return `<div class="table-region" tabindex="0" role="region" aria-label="Índice amplo dos agrupamentos; role horizontalmente para ver todas as colunas">
    <table class="index-table">
      <caption>Um índice por agrupamento. Totais são individuais e não devem ser somados globalmente.</caption>
      <thead><tr><th class="index-id" scope="col">ID local</th><th class="index-name" scope="col">Nome informado</th><th scope="col">Data informada</th><th scope="col">ID da origem</th><th scope="col">Status</th><th class="money" scope="col">Soma candidata dos grupos textuais de item</th><th class="money" scope="col">Soma dos grupos candidatos de parcela</th><th class="money" scope="col">Soma bruta das ocorrências</th><th class="money" scope="col">Diferença</th><th class="money" scope="col">Tolerância hipotética</th><th scope="col">Detalhes</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function eventGroups(
  events: readonly RenderedEvent[],
  view: ProcedureInstallmentView,
  defaultToleranceCents: number,
): string {
  return (["blocked", "mismatch", "matched"] as const).map((status) => {
    const statusEvents = events.filter(({ event }) => event.status === status);
    const content = statusEvents.length > 0
      ? `<div class="event-list">${statusEvents.map((rendered) => eventCard(rendered, view, defaultToleranceCents)).join("\n")}</div>`
      : `<p>Nenhum agrupamento neste status.</p>`;
    return `<section id="status-${status}" class="event-group" aria-labelledby="status-${status}-title">
      <div class="eyebrow">${formatNumber(statusEvents.length)} agrupamentos</div>
      <h2 id="status-${status}-title">${escapeHtml(statusGroupHeading(status))}</h2>
      ${content}
    </section>`;
  }).join("\n");
}

function statusGroupHeading(status: ArithmeticReconciliationStatus): string {
  switch (status) {
    case "blocked": return "Bloqueados para conferência aritmética";
    case "mismatch": return "Divergências aritméticas";
    case "matched": return "Conferências que batem sob a hipótese aritmética";
  }
}

function eventCard(
  rendered: RenderedEvent,
  view: ProcedureInstallmentView,
  defaultToleranceCents: number,
): string {
  const { event, domId } = rendered;
  const toleranceCents = readToleranceCents(event) ?? defaultToleranceCents;
  const activationEligibility = metadataText(Reflect.get(event, "activationEligibility"))
    ?? metadataText(Reflect.get(view, "activationEligibility"));
  return `<article id="${domId}" class="event-card ${event.status}" aria-labelledby="${domId}-title">
    <header class="event-heading">
      <div class="event-title-row"><div><div class="eyebrow">${domId} · agrupamento local</div><h3 id="${domId}-title">${listValues(event.namesInSpreadsheet)}</h3></div>${statusBadge(event.status)}</div>
      <p class="identity-line"><strong>Data informada:</strong> ${listValues(event.recordDates)}</p>
      <p class="origin-line"><strong>ID informado na origem:</strong> ${displayText(event.eventId)} · <strong>Aba:</strong> ${formatNumber(view.sourceSheetIndex)} · <strong>Linhas brutas:</strong> ${formatSourceRows(event.rawRows.map((row) => row.sourceRow))}</p>
      <ul class="event-values" aria-label="Valores deste agrupamento">
        ${eventValue(event.procedureTotalCents, "Soma candidata dos grupos textuais de item")}
        ${eventValue(event.installmentTotalCents, "Soma dos grupos candidatos de parcela")}
        ${eventValue(event.rawInstallmentTotalCents, "Soma bruta das ocorrências")}
        ${eventValue(event.varianceCents, "Diferença: parcelas menos procedimentos", true)}
        ${eventValue(toleranceCents, "Hipótese de tolerância · não aprovada")}
      </ul>
      ${eventDiagnosis(event, toleranceCents, activationEligibility)}
    </header>
    <div class="event-body">
      ${proceduresSection(domId, event.procedures, event.installments)}
      ${installmentsSection(domId, event.installments)}
      ${rawRowsSection(domId, event.rawRows, view.sourceColumns, view.sourceSheetIndex)}
      <a class="back-link" href="#event-index">Voltar ao índice</a>
    </div>
  </article>`;
}

function eventValue(valueCents: number | null, label: string, signed = false): string {
  return `<li><strong>${moneyCell(valueCents, signed)}</strong><span>${escapeHtml(label)}</span></li>`;
}

function eventDiagnosis(
  event: ProcedureInstallmentEvent,
  toleranceCents: number,
  activationEligibility: string | null,
): string {
  const explanation = statusExplanation(event.status, toleranceCents);
  const eligibility = activationEligibility
    ? `<p><strong>Elegibilidade informada:</strong> ${displayText(activationEligibility)}. Este relatório permanece não acionável.</p>`
    : `<p><strong>Ativação:</strong> não acionável nesta conferência.</p>`;
  const blockers = codeList("Bloqueios", event.blockers);
  const warnings = codeList("Alertas", event.warnings);
  return `<aside class="diagnosis ${event.status}"><p><strong>${STATUS_LABELS[event.status]}:</strong> ${escapeHtml(explanation)}</p>${eligibility}${blockers}${warnings}</aside>`;
}

function statusExplanation(status: ArithmeticReconciliationStatus, toleranceCents: number): string {
  switch (status) {
    case "matched":
      return `a diferença está dentro da hipótese de tolerância de ${formatCents(toleranceCents)}. Isso não comprova unicidade dos grupos, existência de obrigações distintas ou pagamento.`;
    case "mismatch":
      return `a comparação foi possível sob a hipótese atual, mas a diferença excede a tolerância não aprovada de ${formatCents(toleranceCents)}.`;
    case "blocked":
      return "não foi possível comparar com segurança; confira os bloqueios e as linhas brutas.";
  }
}

function statusBadge(status: ArithmeticReconciliationStatus): string {
  const note = status === "matched" ? "não confirma unicidade ou pagamento" : status === "mismatch" ? "revisão necessária" : "comparação impedida";
  return `<span><span class="status ${status}">${STATUS_LABELS[status]}</span><span class="status-note">${note}</span></span>`;
}

function codeList(label: string, codes: readonly string[]): string {
  if (codes.length === 0) return "";
  return `<div><strong>${escapeHtml(label)}:</strong><ul class="code-list">${codes.map((code) => `<li><code>${escapeHtml(code)}</code></li>`).join("")}</ul></div>`;
}

function proceduresSection(
  domId: string,
  procedures: readonly ProcedureGroup[],
  installments: readonly InstallmentGroup[],
): string {
  const procedureBlocks = procedures.length > 0
    ? procedures.map((procedure, procedureIndex) => procedureBlock(
        domId,
        procedure,
        procedureIndex,
        installments,
      )).join("")
    : `<p class="empty-value">Nenhum grupo textual candidato de procedimento ou produto neste agrupamento.</p>`;
  return `<section class="subsection" aria-labelledby="${domId}-procedures-title">
    <h4 id="${domId}-procedures-title">Grupos textuais candidatos de procedimento e produto</h4>
    <p>Cada grupo textual aparece uma vez e traz logo abaixo as parcelas candidatas relacionadas. A chave provisória reduz repetições textuais, mas não comprova unicidade clínica ou financeira.</p>
    <div class="procedure-stack">${procedureBlocks}</div>
  </section>`;
}

function procedureBlock(
  domId: string,
  procedure: ProcedureGroup,
  procedureIndex: number,
  installments: readonly InstallmentGroup[],
): string {
  const relatedInstallments = installments
    .map((installment, installmentIndex) => ({ installment, installmentIndex }))
    .filter(({ installment }) => installment.procedureGroupIndexes.includes(procedureIndex));
  const relatedRows = relatedInstallments.length > 0
    ? relatedInstallments.map(({ installment, installmentIndex }) => linkedInstallmentRow(
        domId,
        installment,
        installmentIndex,
      )).join("")
    : emptyTableRow(7, "Nenhuma parcela candidata foi relacionada a este grupo pela chave provisória.");
  const formulaNote = procedure.hasFormulaFinancialValue
    ? `<span class="relationship">Valor de fórmula não verificado</span>`
    : "";
  return `<article id="${domId}-procedure-${procedureIndex + 1}" class="procedure-block" aria-labelledby="${domId}-procedure-${procedureIndex + 1}-title">
    <h5 id="${domId}-procedure-${procedureIndex + 1}-title">Grupo candidato de item ${formatNumber(procedureIndex + 1)}</h5>
    <div class="table-region" tabindex="0" role="region" aria-label="Dados do grupo candidato de item ${formatNumber(procedureIndex + 1)}; role horizontalmente para ver todas as colunas"><table class="procedure-table"><caption>Este grupo aparece uma vez no evento. O valor é candidato e não compõe total financeiro global.</caption><thead><tr><th scope="col">Procedimento</th><th scope="col">Produto</th><th scope="col">Tipo</th><th scope="col">Quantidade</th><th scope="col">Produtos gerais</th><th scope="col">Preços brutos</th><th class="money" scope="col">Valor candidato</th><th scope="col">Linhas de origem</th></tr></thead><tbody><tr><td>${listValues(procedure.procedureLabels)}</td><td>${listValues(procedure.productLabels)}</td><td>${listValues(procedure.types)}</td><td>${listValues(procedure.quantities)}</td><td>${listValues(procedure.generalProducts)}</td><td>${listValues(procedure.priceRawValues)}</td><td class="money">${moneyCell(procedure.priceCents)}${formulaNote}</td><td>${formatSourceRows(procedure.sourceRows)}</td></tr></tbody></table></div>
    <div class="linked-installments"><h5>Parcelas candidatas relacionadas logo abaixo</h5><p>Estas linhas mostram relações. <strong>Não crie subtotal aqui:</strong> parcelas compartilhadas podem reaparecer sob outros grupos e entram apenas uma vez na soma candidata da tabela global.</p><div class="table-region" tabindex="0" role="region" aria-label="Parcelas relacionadas ao grupo candidato ${formatNumber(procedureIndex + 1)}; role horizontalmente para ver todas as colunas"><table class="linked-table"><caption>${formatNumber(relatedInstallments.length)} relações de parcela; não somar esta tabela.</caption><thead><tr><th scope="col">Referência global</th><th scope="col">Número informado</th><th scope="col">Vencimento informado</th><th class="money" scope="col">Valor candidato</th><th scope="col">Meio de pagamento</th><th scope="col">Relação</th><th scope="col">Linhas de origem</th></tr></thead><tbody>${relatedRows}</tbody></table></div></div>
  </article>`;
}

function linkedInstallmentRow(
  domId: string,
  installment: InstallmentGroup,
  installmentIndex: number,
): string {
  const groupCount = Math.max(installment.procedureGroupCount, installment.procedureGroupIndexes.length);
  const relationship = groupCount > 1
    ? `Compartilhada por ${formatNumber(groupCount)} grupos; não somar novamente`
    : "Relacionada a 1 grupo sob a chave provisória";
  const formulaNote = installment.hasFormulaFinancialValue
    ? `<span class="relationship">Valor de fórmula não verificado</span>`
    : "";
  return `<tr><th scope="row"><a href="#${domId}-installment-${installmentIndex + 1}">Parcela candidata ${formatNumber(installmentIndex + 1)}</a></th><td>${listValues(installment.numberVariants)}</td><td>${listValues(installment.dueDateVariants)}</td><td class="money">${moneyCell(installment.amountCents)}${formulaNote}</td><td>${listValues(installment.paymentMethods)}</td><td><span class="relationship">${escapeHtml(relationship)}</span></td><td>${formatSourceRows(installment.sourceRows)}</td></tr>`;
}

function installmentsSection(domId: string, installments: readonly InstallmentGroup[]): string {
  const rows = installments.length > 0
    ? installments.map((installment, index) => `<tr id="${domId}-installment-${index + 1}">
        <th scope="row">Parcela candidata ${formatNumber(index + 1)}</th>
        <td>${listValues(installment.numberVariants)}</td>
        <td>${listValues(installment.dueDateVariants)}</td>
        <td>${listValues(installment.amountRawValues)}</td>
        <td class="money">${moneyCell(installment.amountCents)}${installment.hasFormulaFinancialValue ? `<span class="relationship">Valor de fórmula não verificado</span>` : ""}</td>
        <td>${listValues(installment.paymentMethods)}</td>
        <td>${procedureGroupReferences(domId, installment)}</td>
        <td>${formatSourceRows(installment.sourceRows)}</td>
      </tr>`).join("")
    : emptyTableRow(8, "Nenhuma parcela candidata neste agrupamento.");
  return `<section class="subsection" aria-labelledby="${domId}-installments-title">
    <h4 id="${domId}-installments-title">Grupos candidatos de parcela pela chave provisória</h4>
    <p>Ocorrências com a mesma chave aparecem uma vez nesta tabela, mas podem representar obrigações legítimas distintas. Todas as ocorrências continuam no detalhamento bruto para revisão.</p>
    <div class="table-region" tabindex="0" role="region" aria-label="Tabela ampla de grupos candidatos de parcela; role horizontalmente para ver todas as colunas"><table class="installment-table"><caption>${formatNumber(installments.length)} grupos candidatos de parcela sob a chave provisória.</caption><thead><tr><th scope="col">Grupo</th><th scope="col">Número informado</th><th scope="col">Vencimento informado</th><th scope="col">Valores brutos</th><th class="money" scope="col">Valor candidato</th><th scope="col">Meio de pagamento</th><th scope="col">Grupos de procedimento</th><th scope="col">Linhas de origem</th></tr></thead><tbody>${rows}</tbody></table></div>
  </section>`;
}

function procedureGroupReferences(domId: string, installment: InstallmentGroup): string {
  if (installment.procedureGroupIndexes.length === 0) {
    return `<span class="empty-value">Nenhum grupo relacionado</span>`;
  }
  const links = installment.procedureGroupIndexes.map((procedureIndex) =>
    `<a href="#${domId}-procedure-${procedureIndex + 1}">grupo ${formatNumber(procedureIndex + 1)}</a>`,
  ).join(", ");
  const groupCount = Math.max(installment.procedureGroupCount, installment.procedureGroupIndexes.length);
  const shared = groupCount > 1
    ? `<span class="relationship">Compartilhada por ${formatNumber(groupCount)} grupos · somada uma vez aqui</span>`
    : `<span class="status-note">Relacionada a 1 grupo</span>`;
  return `${links}${shared}`;
}

function rawRowsSection(
  domId: string,
  rows: readonly LocalWorkbookRow[],
  columns: readonly LocalWorkbookColumn[],
  sheetIndex: number,
): string {
  const headers = columns.map((column) => `<th id="${domId}-column-${column.index}" scope="col"><span class="column-letter">${escapeHtml(column.letter)} · coluna ${formatNumber(column.index)}</span><span class="column-header">${displayText(column.header)}</span></th>`).join("");
  const body = rows.length > 0
    ? rows.map((row) => rawRowMarkup(domId, row, columns, sheetIndex)).join("")
    : emptyTableRow(columns.length + 1, "Nenhuma linha bruta neste agrupamento.");
  return `<details class="raw-lines"><summary>Ver todas as ${formatNumber(rows.length)} linhas brutas · ${formatNumber(columns.length)} colunas da origem</summary><div class="raw-body"><div class="table-region" tabindex="0" role="region" aria-label="Linhas brutas completas; role horizontalmente para ver todas as colunas"><table class="raw-table"><caption>Todas as colunas e linhas da origem deste agrupamento; nenhuma duplicata foi apagada.</caption><thead><tr><th class="raw-origin" scope="col">Origem</th>${headers}</tr></thead><tbody>${body}</tbody></table></div></div></details>`;
}

function rawRowMarkup(
  domId: string,
  row: LocalWorkbookRow,
  columns: readonly LocalWorkbookColumn[],
  sheetIndex: number,
): string {
  const rowBadges = [
    row.hidden ? `<span class="status-note">linha oculta</span>` : "",
    row.sameNameDateRowCount > 1 ? `<span class="status-note">${formatNumber(row.sameNameDateRowCount)} linhas no mesmo nome/data</span>` : "",
  ].join("");
  const cells = columns.map((column, columnIndex) => {
    const cell = row.cells[columnIndex] ?? { text: "", kind: "empty" };
    return `<td headers="${domId}-column-${column.index}" aria-label="${escapeHtml(`${column.letter}${row.sourceRow}`)}">${rawCellMarkup(cell)}</td>`;
  }).join("");
  return `<tr><th class="raw-origin" scope="row">Aba ${formatNumber(sheetIndex)}<br>linha ${formatNumber(row.sourceRow)}${rowBadges}</th>${cells}</tr>`;
}

function rawCellMarkup(cell: LocalWorkbookCell): string {
  if (cell.kind === "empty") return `<span class="empty-value" aria-label="célula vazia">∅</span>`;
  const merged = cell.mergedMaster ? `<span class="cell-meta">Célula mesclada · mestre ${displayText(cell.mergedMaster)}</span>` : "";
  if (cell.kind === "formula") {
    const result = cell.text ? displayText(cell.text) : `<span class="empty-value">Sem resultado armazenado</span>`;
    return `${merged}<span class="cell-meta">Resultado armazenado · fórmula não recalculada</span>${result}<span class="cell-extra"><code>${displayText(cell.formula ?? "Fórmula não informada")}</code></span>`;
  }
  if (cell.kind === "link") {
    return `${merged}${displayText(cell.text)}<span class="cell-extra"><span class="cell-meta">Destino preservado como texto · link não aberto</span><code>${displayText(cell.externalTarget ?? "")}</code></span>`;
  }
  if (cell.kind === "error") {
    return `${merged}<span class="cell-meta">Erro armazenado na origem</span>${displayText(cell.text)}`;
  }
  return `${merged}${displayText(cell.text)}`;
}

function emptyTableRow(columnCount: number, message: string): string {
  return `<tr><td colspan="${formatNumber(columnCount)}"><span class="empty-value">${escapeHtml(message)}</span></td></tr>`;
}

function listValues(values: readonly string[]): string {
  if (values.length === 0) return `<span class="empty-value">Não informado</span>`;
  return values.map((value) => `<span class="multi-value">${displayText(value)}</span>`).join("");
}

function formatSourceRows(rows: readonly number[]): string {
  if (rows.length === 0) return "Nenhuma linha informada";
  return rows.map((row) => `linha ${formatNumber(row)}`).join(", ");
}

function moneyCell(valueCents: number | null, signed = false): string {
  if (valueCents === null || !Number.isFinite(valueCents)) {
    return `<span class="empty-value">Não calculável</span>`;
  }
  return escapeHtml(signed ? formatSignedCents(valueCents) : formatCents(valueCents));
}

function formatCents(valueCents: number): string {
  if (!Number.isFinite(valueCents)) return "Não calculável";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valueCents / 100);
}

function formatSignedCents(valueCents: number): string {
  const formatted = formatCents(Math.abs(valueCents));
  return valueCents > 0 ? `+${formatted}` : valueCents < 0 ? `−${formatted}` : formatted;
}

function readToleranceCents(target: object): number | null {
  const value = Reflect.get(target, "toleranceCents");
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function metadataText(value: unknown, depth = 0): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? METADATA_ENUM_LABELS[trimmed] ?? trimmed : null;
  }
  if (typeof value === "boolean") return value ? "Sim, segundo o metadado informado" : "Não";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (depth >= 2) return "metadado estruturado presente";
  if (Array.isArray(value)) {
    const parts = value.map((item) => metadataText(item, depth + 1)).filter((item): item is string => item !== null);
    return parts.length > 0 ? parts.join(" · ") : null;
  }
  if (typeof value === "object") {
    const parts = Object.entries(value).map(([key, item]) => {
      const rendered = metadataText(item, depth + 1);
      return rendered === null ? null : `${key}: ${rendered}`;
    }).filter((item): item is string => item !== null);
    return parts.length > 0 ? parts.join(" · ") : null;
  }
  return null;
}

function displayText(value: string): string {
  return escapeHtml(value).replace(/\r\n|\r|\n/gu, "<br>");
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

function escapeHtml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, "�")
    .replace(/[&<>"']/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
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
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new LocalWorkbookViewError("REPORT_DIRECTORY_NOT_REGULAR");
    }
  }
}

async function assertSafeReportDirectory(directory: string): Promise<void> {
  const directoryStat = await lstat(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new LocalWorkbookViewError("REPORT_DIRECTORY_NOT_REGULAR");
  }
  const components = workspaceRelativeComponents(directory);
  if (components === null) return;
  let current = resolve(".");
  for (const component of components) {
    current = resolve(current, component);
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new LocalWorkbookViewError("REPORT_DIRECTORY_NOT_REGULAR");
    }
  }
}

function workspaceRelativeComponents(directory: string): string[] | null {
  const workspaceRoot = resolve(".");
  const relativePath = relative(workspaceRoot, directory);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    return null;
  }
  return relativePath.split(sep).filter((component) => component.length > 0);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
