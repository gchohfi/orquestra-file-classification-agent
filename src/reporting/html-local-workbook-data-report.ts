import { chmod, lstat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  LocalWorkbookViewError,
  type LocalWorkbookCell,
  type LocalWorkbookColumn,
  type LocalWorkbookDataView,
  type LocalWorkbookRow,
  type LocalWorkbookSheet,
  type WorkbookColumnRole,
} from "../local/workbook-data-view.js";
import { prepareSafeLocalReportDirectory } from "./safe-local-report-directory.js";

type LocalWorkbookReportOptions = Readonly<{
  title?: string;
  generatedAt?: Date;
}>;

const MAX_LOCAL_HTML_BYTES = 64 * 1024 * 1024;
const ROLE_LABELS: Readonly<Record<WorkbookColumnRole, string>> = {
  identity: "Nome ou identificação",
  date: "Data da origem",
  item: "Procedimento ou item",
  financial: "Campo financeiro da origem",
  other: "Outra coluna da origem",
};

export function renderLocalWorkbookDataHtml(
  data: LocalWorkbookDataView,
  options: LocalWorkbookReportOptions = {},
): string {
  const title = options.title ?? "Dados reais para conferência — Dra. Marcella";
  const generatedAt = options.generatedAt ?? new Date();
  const firstOpenSheet = data.sheets.find((sheet) => sheet.hasEssentialColumns)?.index ?? data.sheets[0]?.index;
  const sheetNavigation = data.sheets.map((sheet) =>
    `<li><a href="#sheet-${sheet.index}">Aba ${sheet.index}: ${escapeHtml(sheet.name)}</a> <span>${formatNumber(sheet.physicalRowCount)} linhas × ${formatNumber(sheet.columns.length)} colunas</span></li>`,
  ).join("");
  const sheetSections = data.sheets.map((sheet) => sheetSection(sheet, sheet.index === firstOpenSheet)).join("\n");

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
    :root { color-scheme:light; --ink:#17211f; --muted:#53615d; --line:#8b9793; --paper:#f2f3f0; --card:#fff; --brand:#154f4a; --brand-soft:#e0f0ec; --danger:#702b2b; --danger-soft:#fae9e7; --financial:#765207; --financial-soft:#fff3d1; --identity:#483061; --identity-soft:#f0e8f5; --date:#24506f; --date-soft:#e8f2f8; --item:#4a5a1d; --item-soft:#f0f4df; }
    * { box-sizing:border-box; }
    html { scroll-behavior:smooth; }
    body { margin:0; overflow-x:hidden; background:var(--paper); color:var(--ink); font:16px/1.5 Arial,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    a { color:#0b514b; text-underline-offset:3px; }
    input,label,summary { font:inherit; }
    :focus-visible { outline:3px solid #0067c5; outline-offset:3px; }
    .skip-link { position:absolute; z-index:30; left:16px; top:-80px; padding:10px 14px; color:#000; background:#fff; border:2px solid #000; }
    .skip-link:focus { top:76px; }
    .sensitive-warning { position:sticky; z-index:20; top:0; min-height:58px; padding:13px max(14px,calc((100vw - 1440px)/2)); color:#fff; background:var(--danger); border-bottom:4px solid #351010; font-weight:800; }
    .sensitive-warning span { font-weight:500; }
    main { width:min(1440px,calc(100% - 28px)); margin:26px auto 56px; }
    h1,h2,h3 { margin:0; font-family:Georgia,"Times New Roman",serif; letter-spacing:-.02em; }
    h1 { max-width:980px; font-size:clamp(34px,5vw,58px); line-height:1.04; }
    h2 { font-size:clamp(25px,3vw,34px); }
    h3 { font-size:21px; }
    p { margin:0; }
    .eyebrow { margin-bottom:8px; color:var(--brand); font-size:13px; font-weight:850; letter-spacing:.12em; text-transform:uppercase; }
    .hero { padding:30px; background:var(--card); border:1px solid var(--line); border-top:7px solid var(--brand); }
    .lede { max-width:980px; margin-top:16px; color:#34413e; font-size:18px; }
    .source { margin-top:14px; color:var(--muted); overflow-wrap:anywhere; }
    .source strong { color:var(--ink); }
    .no-sum { margin-top:20px; padding:18px; background:var(--danger-soft); border:2px solid var(--danger); }
    .no-sum strong { display:block; margin-bottom:5px; color:var(--danger); font-size:18px; }
    .icloud { margin-top:14px; color:var(--muted); font-size:14px; }
    .metrics { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:12px; margin:20px 0 0; padding:0; list-style:none; }
    .metric { min-height:108px; padding:15px; background:#fff; border:1px solid var(--line); border-top:6px solid var(--brand); }
    .metric strong { display:block; font-size:30px; line-height:1.1; }
    .metric span { display:block; margin-top:7px; color:var(--muted); font-size:12px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; }
    section,.view-shell { margin-top:20px; padding:22px; background:var(--card); border:1px solid var(--line); }
    .instructions { display:grid; grid-template-columns:1.15fr .85fr; gap:24px; }
    .instructions ol { margin:12px 0 0; padding-left:22px; }
    .instructions li + li { margin-top:7px; }
    .sheet-index { margin:12px 0 0; padding:0; list-style:none; }
    .sheet-index li { display:flex; flex-wrap:wrap; justify-content:space-between; gap:8px; padding:8px 0; border-bottom:1px solid #d4d9d7; }
    .sheet-index span { color:var(--muted); }
    .view-shell { min-width:0; }
    .view-shell > legend { padding:0 8px; font:700 25px/1.2 Georgia,"Times New Roman",serif; }
    .view-input { position:absolute; width:1px; height:1px; margin:-1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
    .view-options { display:flex; flex-wrap:wrap; gap:10px; margin:4px 0 18px; }
    .view-options label { display:inline-flex; min-height:46px; align-items:center; padding:9px 15px; color:var(--brand); background:#fff; border:2px solid var(--brand); cursor:pointer; font-weight:800; }
    #view-essential:checked ~ .view-options label[for="view-essential"],#view-all:checked ~ .view-options label[for="view-all"] { color:#fff; background:var(--brand); }
    #view-essential:focus-visible ~ .view-options label[for="view-essential"],#view-all:focus-visible ~ .view-options label[for="view-all"] { outline:3px solid #0067c5; outline-offset:3px; }
    #view-essential:checked ~ .sheet-list .data-sheet.has-essential .col-other { display:none; }
    .view-help { margin-bottom:18px; color:var(--muted); }
    .sheet-list { display:grid; gap:18px; }
    details.data-sheet { margin:0; padding:0; border:1px solid var(--line); background:#fff; scroll-margin-top:74px; }
    details.data-sheet > summary { min-height:58px; padding:16px 18px; cursor:pointer; color:var(--brand); font-weight:850; }
    .summary-count { margin-left:8px; color:var(--muted); font-weight:500; }
    .sheet-body { padding:0 16px 18px; border-top:1px solid var(--line); }
    .sheet-note { display:flex; flex-wrap:wrap; gap:8px 18px; padding:13px 0; color:var(--muted); }
    .table-region { max-height:76vh; overflow:auto; border:1px solid #5e6a66; background:#fff; }
    table { width:max-content; min-width:100%; border-collapse:separate; border-spacing:0; font-size:14px; }
    caption { padding:11px 12px; color:var(--muted); background:#f6f7f5; text-align:left; }
    th,td { max-width:390px; min-width:145px; padding:9px 10px; border-right:1px solid #c1c9c5; border-bottom:1px solid #c1c9c5; text-align:left; vertical-align:top; white-space:pre-wrap; overflow-wrap:anywhere; }
    thead th { position:sticky; z-index:6; top:0; color:#263431; background:#e8eeeb; border-bottom:2px solid #5e6a66; }
    .origin { position:sticky; z-index:5; left:0; min-width:118px; max-width:118px; background:#f3f5f3; }
    thead .origin { z-index:10; }
    .sticky-identity { position:sticky; z-index:4; left:118px; min-width:250px; max-width:310px; background:var(--identity-soft); }
    thead .sticky-identity { z-index:9; }
    .sticky-date { position:sticky; z-index:3; left:368px; min-width:155px; max-width:180px; background:var(--date-soft); }
    thead .sticky-date { z-index:8; }
    .col-financial { background:var(--financial-soft); font-variant-numeric:tabular-nums; }
    .col-identity:not(.sticky-identity) { background:#faf6fc; }
    .col-date:not(.sticky-date) { background:#f3f8fb; }
    .col-item { background:#f7f9ee; }
    .column-letter { display:block; color:var(--muted); font:700 11px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace; letter-spacing:.06em; text-transform:uppercase; }
    .column-role { display:block; margin:4px 0; color:var(--muted); font-size:11px; font-weight:700; text-transform:uppercase; }
    .column-header { display:block; color:var(--ink); font-size:14px; }
    .financial-warning { display:block; margin-top:5px; color:var(--financial); font-size:11px; font-weight:700; }
    .badge { display:inline-block; margin:2px 4px 2px 0; padding:2px 6px; border:1px solid currentColor; font-size:11px; font-weight:800; line-height:1.35; }
    .badge.warning { color:var(--danger); background:var(--danger-soft); }
    .badge.formula { color:#5c3b73; background:#f0e8f5; }
    .badge.link { color:#24506f; background:#e8f2f8; }
    .badge.hidden { color:#5c4b16; background:#fff3d1; }
    .cell-result-label { display:block; margin-bottom:3px; color:var(--muted); font-size:11px; font-weight:800; text-transform:uppercase; }
    .cell-formula,.cell-target { display:block; margin-top:7px; padding-top:6px; border-top:1px dashed #9da8a4; color:#3d4946; }
    code { font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace; white-space:pre-wrap; overflow-wrap:anywhere; }
    .empty-cell { color:#89938f; font-style:italic; }
    .empty-row th,.empty-row td { background-image:repeating-linear-gradient(135deg,transparent 0,transparent 7px,rgba(80,90,87,.05) 7px,rgba(80,90,87,.05) 12px); }
    .source-header th,.source-header td { border-top:3px solid var(--brand); }
    .footer { margin-top:18px; padding:12px 4px; color:var(--muted); font-size:13px; }
    @media (max-width:980px) { .metrics { grid-template-columns:repeat(2,minmax(0,1fr)); } .instructions { grid-template-columns:1fr; } }
    @media (max-width:620px) { main { width:min(100% - 18px,1440px); margin-top:14px; } .hero,section,.view-shell { padding:16px; } .metrics { grid-template-columns:1fr; } .view-options { display:grid; grid-template-columns:1fr; } .view-options label { justify-content:center; } .sensitive-warning { padding:10px; font-size:14px; } }
    @media print { .sensitive-warning { position:fixed; top:0; left:0; right:0; color:#000; background:#fff; border:3px solid #000; } body { background:#fff; } main { width:100%; margin-top:36px; } .view-options { display:none; } details.data-sheet { break-before:page; } .table-region { max-height:none; overflow:visible; } }
  </style>
</head>
<body>
  <div class="sensitive-warning" role="alert">Dados reais e sensíveis — uso local restrito. <span>Não compartilhar, copiar para mensagens ou usar para contato/campanha.</span></div>
  <a class="skip-link" href="#source-tables">Pular para as tabelas da origem</a>
  <main>
    <header class="hero">
      <div class="eyebrow">Dados reais · somente leitura · arquivo local</div>
      <h1>${escapeHtml(title)}</h1>
      <p class="lede">Visualização literal para conferir nomes, datas, procedimentos, valores e demais células como estão armazenados no XLSX. Nenhuma linha foi deduplicada, reconciliada, importada ou transformada em pessoa canônica.</p>
      <p class="source">Fonte exibida: <strong>${escapeHtml(data.sourceLabel)}</strong></p>
      <aside class="no-sum"><strong>Não some os valores desta tela.</strong><p>Uma mesma consulta pode ocupar várias linhas por procedimento, item ou parcela. Os valores permanecem separados por coluna de origem e ainda não representam faturamento, recebimento ou ticket.</p></aside>
      ${containerAlerts(data.containerAlertCodes)}
      <p class="icloud">Este HTML não usa GPT, Supabase ou rede e está fora do Git. Como a pasta do projeto fica no iCloud Drive, o arquivo pode ser sincronizado pelo iCloud.</p>
      ${metricCards(data)}
    </header>

    <section class="instructions" aria-labelledby="how-title"><div><h2 id="how-title">Como conferir</h2><ol><li>Comece em <strong>Colunas essenciais</strong> para localizar nome, data, procedimento e campos financeiros.</li><li>Troque para <strong>Todas as colunas</strong> para ver o retângulo original completo, inclusive vazios.</li><li>Use a busca do navegador (⌘F) para encontrar um nome ou valor sem gravá-lo em filtros, URL ou histórico do relatório.</li><li>Confira sempre a origem <strong>Aba N · linha N</strong>. Repetições são sinalizadas, mas nunca unidas ou excluídas.</li></ol></div><nav aria-label="Índice das abas"><h3>Abas na ordem original</h3><ul class="sheet-index">${sheetNavigation}</ul></nav></section>

    <fieldset id="source-tables" class="view-shell">
      <legend>Fonte original, linha a linha</legend>
      <input class="view-input" type="radio" name="column-view" id="view-essential" checked>
      <input class="view-input" type="radio" name="column-view" id="view-all">
      <div class="view-options" aria-label="Escolha de colunas">
        <label for="view-essential">Colunas essenciais</label>
        <label for="view-all">Todas as colunas da origem</label>
      </div>
      <p class="view-help">A troca apenas oculta ou mostra colunas; todas as células continuam presentes neste único HTML local. Abas sem mapeamento essencial permanecem completas.</p>
      <div class="sheet-list">${sheetSections}</div>
    </fieldset>

    <footer class="footer">Gerado em ${escapeHtml(formatDateTime(generatedAt))}. Dados identificados reais · somente leitura · não compartilhar. Fórmulas exibem apenas o resultado armazenado no XLSX e não foram recalculadas.</footer>
  </main>
</body>
</html>`;
  if (Buffer.byteLength(html, "utf8") > MAX_LOCAL_HTML_BYTES) {
    throw new LocalWorkbookViewError("LOCAL_HTML_SIZE_LIMIT_EXCEEDED");
  }
  return html;
}

export async function writeLocalWorkbookDataHtmlReport(
  path: string,
  data: LocalWorkbookDataView,
  options: LocalWorkbookReportOptions = {},
): Promise<string> {
  const absolutePath = resolve(path);
  const directory = dirname(absolutePath);
  await prepareSafeLocalReportDirectory(
    directory,
    () => new LocalWorkbookViewError("REPORT_DIRECTORY_NOT_REGULAR"),
  );
  if (await lstat(absolutePath).catch(() => null)) {
    throw new LocalWorkbookViewError("REPORT_ALREADY_EXISTS");
  }
  await writeFile(absolutePath, renderLocalWorkbookDataHtml(data, options), {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  await chmod(absolutePath, 0o600);
  return absolutePath;
}

function metricCards(data: LocalWorkbookDataView): string {
  return `<ul class="metrics" aria-label="Contagens estruturais da fonte">
    ${metric(data.sheetCount, "Abas da origem")}
    ${metric(data.physicalRowCount, "Linhas físicas exibidas")}
    ${metric(data.nonEmptyCellCount, "Células preenchidas")}
    ${metric(data.distinctWrittenNameCount, "Nomes distintos escritos")}
    ${metric(data.formulaCellCount, "Células com fórmula")}
  </ul>`;
}

function metric(value: number, label: string): string {
  return `<li class="metric"><strong>${formatNumber(value)}</strong><span>${escapeHtml(label)}</span></li>`;
}

function sheetSection(sheet: LocalWorkbookSheet, open: boolean): string {
  const className = sheet.hasEssentialColumns ? "data-sheet has-essential" : "data-sheet";
  const hiddenState = sheet.state === "visible" ? "" : ` <span class="badge hidden">aba ${escapeHtml(sheet.state)}</span>`;
  return `<details id="sheet-${sheet.index}" class="${className}"${open ? " open" : ""}>
    <summary>Aba ${sheet.index}: ${escapeHtml(sheet.name)} <span class="summary-count">${formatNumber(sheet.physicalRowCount)} linhas × ${formatNumber(sheet.columns.length)} colunas</span>${hiddenState}</summary>
    <div class="sheet-body"><div class="sheet-note"><span>Cabeçalho provável: ${sheet.headerRow === null ? "não encontrado" : `linha ${sheet.headerRow}`}</span><span>${formatNumber(sheet.nonEmptyCellCount)} células preenchidas</span><span>${formatNumber(sheet.formulaCellCount)} fórmulas</span><span>${formatNumber(sheet.externalLinkCellCount)} links preservados como texto</span></div>${sheetTable(sheet)}</div>
  </details>`;
}

function containerAlerts(codes: readonly string[]): string {
  if (codes.length === 0) return "";
  return `<aside class="no-sum"><strong>Alertas do container XLSX</strong><p>${codes.map((code) => `<code>${escapeHtml(code)}</code>`).join(" ")}. Links externos permanecem apenas como texto e nunca são abertos.</p></aside>`;
}

function sheetTable(sheet: LocalWorkbookSheet): string {
  const headers = sheet.columns.map((column) => columnHeader(sheet, column)).join("");
  const rows = sheet.rows.map((row) => rowMarkup(sheet, row)).join("");
  return `<div class="table-region" role="region" tabindex="0" aria-label="Dados reais da aba ${sheet.index}"><table><caption>Aba ${sheet.index}; todas as linhas de 1 a ${formatNumber(sheet.physicalRowCount)} e colunas de A a ${escapeHtml(sheet.columns.at(-1)?.letter ?? "A")} permanecem na ordem original.</caption><thead><tr><th class="origin" scope="col">Origem</th>${headers}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function columnHeader(sheet: LocalWorkbookSheet, column: LocalWorkbookColumn): string {
  const classes = columnClasses(column);
  const financialWarning = column.role === "financial" ? `<span class="financial-warning">Valor da origem · sem semântica confirmada</span>` : "";
  const hidden = column.hidden ? `<span class="badge hidden">coluna oculta</span>` : "";
  return `<th id="sheet-${sheet.index}-col-${column.index}" class="${classes}" scope="col"><span class="column-letter">Coluna ${escapeHtml(column.letter)}</span><span class="column-role">${escapeHtml(ROLE_LABELS[column.role])}</span><span class="column-header">${escapeHtml(column.header)}</span>${financialWarning}${hidden}</th>`;
}

function rowMarkup(sheet: LocalWorkbookSheet, row: LocalWorkbookRow): string {
  const isEmpty = row.cells.every((cell) => cell.kind === "empty");
  const classes = [isEmpty ? "empty-row" : "", row.sourceRow === sheet.headerRow ? "source-header" : ""].filter(Boolean).join(" ");
  const duplicate = row.sameNameDateRowCount > 1 ? `<span class="badge warning">${formatNumber(row.sameNameDateRowCount)} linhas no mesmo nome/data</span>` : "";
  const hidden = row.hidden ? `<span class="badge hidden">linha oculta</span>` : "";
  const header = row.sourceRow === sheet.headerRow ? `<span class="badge">cabeçalho provável</span>` : "";
  const cells = row.cells.map((cell, index) => cellMarkup(sheet, row, sheet.columns[index] as LocalWorkbookColumn, cell)).join("");
  return `<tr${classes ? ` class="${classes}"` : ""}><th class="origin" scope="row">Aba ${sheet.index}<br>linha ${row.sourceRow}<div>${header}${hidden}${duplicate}${isEmpty ? `<span class="badge">linha vazia</span>` : ""}</div></th>${cells}</tr>`;
}

function cellMarkup(
  sheet: LocalWorkbookSheet,
  row: LocalWorkbookRow,
  column: LocalWorkbookColumn,
  cell: LocalWorkbookCell,
): string {
  const classes = `${columnClasses(column)} cell-${cell.kind}`;
  const coordinate = `${column.letter}${row.sourceRow}`;
  const merged = cell.mergedMaster ? `<span class="badge">mesclada · mestre ${escapeHtml(cell.mergedMaster)}</span>` : "";
  let content: string;
  if (cell.kind === "empty") {
    content = `<span class="empty-cell" aria-label="célula vazia">∅</span>`;
  } else if (cell.kind === "formula") {
    const result = cell.text ? displayText(cell.text) : `<span class="empty-cell">Sem resultado armazenado</span>`;
    content = `<span class="cell-result-label">Resultado armazenado no XLSX · não recalculado</span>${result}<span class="cell-formula"><span class="badge formula">fórmula</span><code>${displayText(cell.formula ?? "")}</code></span>`;
  } else if (cell.kind === "link") {
    content = `${displayText(cell.text)}<span class="cell-target"><span class="badge link">link preservado · não aberto</span><code>${displayText(cell.externalTarget ?? "")}</code></span>`;
  } else if (cell.kind === "error") {
    content = `<span class="badge warning">erro armazenado</span>${displayText(cell.text)}`;
  } else {
    content = displayText(cell.text);
  }
  return `<td class="${classes}" headers="sheet-${sheet.index}-col-${column.index}" aria-label="${escapeHtml(coordinate)}">${merged}${content}</td>`;
}

function columnClasses(column: LocalWorkbookColumn): string {
  return [
    `col-${column.role}`,
    column.stickyIdentity ? "sticky-identity" : "",
    column.stickyDate ? "sticky-date" : "",
  ].filter(Boolean).join(" ");
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
