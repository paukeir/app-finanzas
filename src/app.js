import {
  money,
  cents,
  decimal,
  validDate,
  initialState,
  parseCSV,
  previewImport,
  reconcile,
  position,
  moveFunds,
  addCommitment,
  settleCommitment,
  goalProgress,
  monthSummary,
  targetFor,
  exportCSV,
  restoreBackup,
  CATEGORIES,
  RECURRENCES,
  penultimateBusinessDay,
} from "./core.js";
const KEY = "clara.finanzas.v1";
let state = initialState(),
  storageError = "";
try {
  const raw = localStorage.getItem(KEY);
  if (raw) state = restoreBackup(raw);
} catch {
  storageError =
    "No se pudo leer la copia local. Descarga los datos originales antes de restaurar o borrar. No se sobrescribirá el almacenamiento.";
}
let page = "home",
  month = state.transactions.at(-1)?.date.slice(0, 7) || "2026-11",
  query = "",
  categoryFilter = "",
  modal = null,
  parsed = null,
  preview = null,
  importName = "",
  pendingBackup = null,
  notice = "";
const today = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
const e = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const dateLabel = (s) =>
  s
    ? new Intl.DateTimeFormat("es-ES", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(s + "T12:00:00Z"))
    : "Sin movimientos";
const monthLabel = (m) =>
  new Intl.DateTimeFormat("es-ES", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(m + "-01T12:00:00Z"));
const icons = {
  home: "◈",
  calendar: "▦",
  transactions: "⇄",
  funds: "◉",
  loans: "▤",
  settings: "⚙",
  reconciliation: "≋",
};
const names = {
  home: "Tu dinero, con claridad",
  calendar: "Cada quincena cuenta",
  transactions: "Todos los movimientos",
  funds: "Un propósito para tu dinero",
  loans: "Un paso más cerca",
  settings: "Tus datos, bajo tu control",
  reconciliation: "Cada céntimo, en su sitio",
};
const nav = [
  ["home", "Inicio"],
  ["calendar", "Seguimiento mensual"],
  ["transactions", "Movimientos"],
  ["reconciliation", "Conciliación"],
  ["funds", "Fondos de ahorro"],
  ["loans", "Préstamos"],
  ["settings", "Configuración"],
];
function save(next) {
  if (storageError)
    throw new Error(
      "El almacenamiento está bloqueado. Conserva una copia original y restaura una copia válida.",
    );
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    throw new Error(
      "No se pudo guardar. Puede faltar espacio o estar bloqueado el almacenamiento. Exporta una copia.",
    );
  }
  state = next;
}
function flash(s) {
  notice = s;
  render();
}
const tag = (text, tone = "") => `<span class="tag ${tone}">${e(text)}</span>`;
const metric = (label, value, detail, tone = "") =>
  `<article class="metric ${tone}"><span>${e(label)}</span><strong>${money(value)}</strong><small>${e(detail)}</small></article>`;
const empty = (title, text) =>
  `<div class="empty"><span class="empty-icon">◎</span><h3>${e(title)}</h3><p>${e(text)}</p><button data-action="import" class="primary">Importar movimientos</button></div>`;
const field = (label, control) => `<label>${e(label)}${control}</label>`;
function transactionsTable(ts, editable = false) {
  return `<div class="table-wrap"><table><thead><tr><th>Fecha bancaria</th><th>Concepto / categoría</th><th>Presupuesto</th><th class="right">Importe</th><th class="right">Saldo posterior</th>${editable ? "<th>Acción</th>" : ""}</tr></thead><tbody>${ts.map((t) => `<tr><td>${dateLabel(t.date)}<small>Valor: ${e(t.valueDate)} · ${e(t.source || "CSV")}</small></td><td><b>${e(t.description)}</b><small>${e(t.category)}</small></td><td>${e(t.budget.month)} · Q${t.budget.half}</td><td class="right ${t.amount > 0 ? "positive" : ""}">${t.amount > 0 ? "+" : ""}${money(t.amount)}</td><td class="right">${t.balance === null ? "—" : money(t.balance)}</td>${editable ? `<td><button class="link" data-action="edit" data-id="${e(t.id)}">Editar</button></td>` : ""}</tr>`).join("")}</tbody></table></div>`;
}
function home() {
  if (!state.transactions.length)
    return empty(
      "Tu historia financiera empieza aquí",
      "Importa tu extracto para comprobar el saldo y organizar tus quincenas. No añadimos datos de ejemplo.",
    );
  const p = position(state),
    g = goalProgress(state, month),
    lastImport = state.imports.at(-1);
  const unknown = state.transactions.filter(
    (t) => t.category === "Pendiente de confirmar",
  ).length;
  return `<div class="status-row">${tag(p.bank.verified ? "Saldos conciliados" : "Revisar conciliación", p.bank.verified ? "green" : "red")}<span>Último movimiento: ${dateLabel(p.bank.lastDate)} · ${state.transactions.length} movimientos</span></div>
 <div class="hero-grid"><article class="balance-card"><div class="eyebrow">CUENTA PRINCIPAL · SALDO REAL OBSERVADO</div><div class="hero-money">${money(p.bank.balance)}</div><p>A fecha de ${dateLabel(p.bank.lastDate)}. No es una conexión bancaria en tiempo real.</p><div class="balance-footer"><span>Reconstruido desde el extracto</span><button data-nav="reconciliation" class="light-link">Ver conciliación →</button></div></article>
 <article class="allocation-card"><div class="section-top"><h3>Todo el saldo tiene su lugar</h3>${tag("Sin doble cómputo")}</div><div class="allocation-row"><i class="dot blue"></i><span>Fondo de amortización</span><b>${money(p.amortization)}</b></div><div class="allocation-row"><i class="dot green"></i><span>Ahorro personal asignado</span><b>${money(p.personal)}</b></div><div class="allocation-row"><i class="dot amber"></i><span>Recibos comprometidos</span><b>${money(p.committed)}</b></div><div class="allocation-row total"><i class="dot neutral"></i><span>Sin clasificar</span><b>${money(p.unclassified)}</b></div><small>Sin clasificar no equivale a dinero libre: pueden faltar obligaciones por confirmar.</small></article></div>
 <div class="metric-grid">${metric("Amortización asignada", p.amortization, "Solo aportaciones confirmadas", "blue")}${metric("Ahorro personal asignado", p.personal, "Saldo inicial personal desconocido", "green")}${metric("Recibos pendientes", p.committed, `${state.commitments.filter((c) => !c.paid).length} compromisos confirmados`, "amber")}${metric("Sin clasificar", p.unclassified, "Pendiente de asignar y revisar")}</div>
 ${!p.bank.verified ? '<div class="alert danger">Hay diferencias bancarias. Las nuevas reservas están bloqueadas hasta conciliarlas.</div>' : ""}${p.unclassified < 0 ? '<div class="alert danger">Los fondos y compromisos superan el efectivo actual. Revisa las reservas y los nuevos cargos.</div>' : ""}
 <div class="two-col"><section class="panel"><div class="section-top"><h2>Objetivo de amortización</h2>${tag(monthLabel(month), "blue")}</div><p class="muted">Primero, préstamo B · mayor interés según tu configuración.</p><div class="goal-amount">${money(g.actual)} <span>/ ${g.target === null ? "pendiente" : money(g.target)}</span></div><progress max="${Math.max(1, g.target || 1)}" value="${Math.max(0, g.actual)}" aria-label="Aportación real frente al objetivo mensual"></progress><div class="spread"><span>Asignación neta real del mes</span><b>${g.target === null ? "Configura el objetivo futuro" : money(g.deviation) + " de desviación"}</b></div><button data-nav="funds" class="secondary">Gestionar fondos →</button></section>
 <section class="panel"><div class="section-top"><h2>Para revisar</h2>${tag("Sin suposiciones", "amber")}</div><ul class="review-list"><li><b>Ahorro personal inicial</b><span>Desconocido. Ningún remanente se asigna automáticamente.</span></li><li><b>${unknown} movimientos pendientes de categoría</b><span>MYBOX y conceptos ambiguos requieren tu confirmación.</span></li><li><b>Cuenta externa de gastos</b><span>Las transferencias son observadas; el gasto final en destino no está disponible.</span></li></ul></section></div>
 <section class="panel"><div class="section-top"><h2>Últimos movimientos</h2><button class="link" data-nav="transactions">Ver todos →</button></div>${transactionsTable([...state.transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5))}</section><p class="footnote">Última importación: ${lastImport ? e(new Date(lastImport.at).toLocaleString("es-ES")) : "ninguna"} · Los compromisos previstos solo se reservan cuando los confirmas.</p>`;
}
function calendar() {
  const sums = [monthSummary(state, month, 1), monthSummary(state, month, 2)];
  const templates = RECURRENCES.filter(
    (r) => !r.months || r.months.includes(Number(month.slice(5))),
  );
  return `<p class="intro">Fecha bancaria y presupuesto son independientes. La nómina de fin de mes financia la primera quincena del siguiente.</p><div class="two-col">${sums.map((s, i) => `<section class="panel quincena"><div class="section-top"><div class="eyebrow">QUINCENA ${i + 1}</div>${tag(i === 0 ? "Días 1–13" : "Día 14–cierre", i === 0 ? "green" : "blue")}</div><h2>${i === 0 ? "El comienzo del mes" : "La segunda mitad"}</h2><p class="muted">${i === 0 ? "Financiada por la nómina del mes anterior" : "Financiada por la nómina del día 14"}</p><div class="q-income">${money(s.income)}<small>Nómina real asignada</small></div>${!s.income ? '<p class="alert">No hay financiación real registrada para esta quincena.</p>' : ""}<dl class="summary-list"><div><dt>Otros ingresos observados</dt><dd>${money(s.otherIncome)}</dd></div><div><dt>Cargos reales sin traspasos</dt><dd>−${money(s.out)}</dd></div><div><dt>De ellos, ahorro externo</dt><dd>${money(s.externalSavings)}</dd></div><div><dt>Transferido a gastos</dt><dd>−${money(s.transfers)}</dd></div><div><dt>Retornos de cuenta propia</dt><dd>+${money(s.returns)}</dd></div><div><dt>Compromisos pendientes</dt><dd>−${money(s.pending)}</dd></div><div class="total"><dt>Margen presupuestario observado</dt><dd>${money(s.margin)}</dd></div></dl><small>El margen no incorpora fondos virtuales ni saldos arrastrados. No es dinero libre ni ahorro asignado. Gasto final en la cuenta externa: no observado.</small><h3>Movimientos asignados</h3>${s.ts.length ? `<ul class="compact-list">${s.ts.map((t) => `<li><div><b>${e(t.description)}</b><small>Banco: ${dateLabel(t.date)} · ${e(t.category)}</small></div><span>${money(t.amount)}</span></li>`).join("")}</ul>` : '<p class="muted">Sin movimientos asignados.</p>'}</section>`).join("")}</div>
 <section class="panel"><div class="section-top"><h2>Previsiones de referencia</h2>${tag("No reservadas", "amber")}</div><p>Importes orientativos del documento; los cargos reales prevalecen. Confirma que cada recibo sigue pendiente antes de reservarlo. Comunidades y garajes no tienen periodicidad confirmada.</p><div class="template-grid">${templates.map((r) => `<article><b>${e(r.name)}</b><span>${money(month >= "2028-02" && r.future ? r.future : r.amount)} · Q${r.half}</span><small>Previsto · pendiente de confirmar</small><button class="link" data-action="template" data-index="${RECURRENCES.indexOf(r)}">Revisar y reservar →</button></article>`).join("")}</div><p class="footnote">Referencia de nómina de fin de mes: ${dateLabel(penultimateBusinessDay(month))} (lunes–viernes; festivos no configurados). La fecha real del banco siempre se conserva.</p></section>`;
}
function transactions() {
  const ts = [...state.transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter(
      (t) =>
        (!query ||
          `${t.description} ${t.category} ${t.date}`
            .toLocaleLowerCase("es")
            .includes(query.toLocaleLowerCase("es"))) &&
        (!categoryFilter || t.category === categoryFilter),
    );
  return `<section class="panel"><div class="section-top"><h2>Extracto bancario</h2>${tag(ts.length + " movimientos")}</div><form id="filters" class="filter-row">${field("Buscar", '<input name="query" type="search" placeholder="Concepto, fecha o categoría" value="' + e(query) + '">')}${field("Categoría", `<select name="category"><option value="">Todas las categorías</option>${CATEGORIES.map((c) => `<option ${categoryFilter === c ? "selected" : ""}>${e(c)}</option>`).join("")}</select>`)}<button class="secondary">Filtrar</button></form><p class="muted">Orden por fecha bancaria. Las operaciones del mismo día conservan el orden del extracto para conciliar.</p>${ts.length ? transactionsTable(ts, true) : '<p class="empty">No hay movimientos con estos filtros.</p>'}</section>`;
}
function reconciliation() {
  const r = reconcile(state.transactions);
  if (!state.transactions.length)
    return empty(
      "Sin extracto para conciliar",
      "Los saldos se calcularán exclusivamente a partir de tus movimientos.",
    );
  return `<div class="status-row">${tag(r.verified ? "Conciliado" : "Revisión necesaria", r.verified ? "green" : "red")}<span>${r.balanceCount} saldos posteriores comprobables de ${state.transactions.length} movimientos</span></div><div class="metric-grid">${metric("Saldo anterior al primer movimiento", r.opening, "Inferido del primer saldo posterior disponible")}${metric("Saldo inicial · 1 agosto 2026", r.startBalance, "Tras los movimientos anteriores a agosto")}${metric("Saldo al cierre del extracto", r.balance, dateLabel(r.lastDate))}${metric(
    "Diferencias entre movimientos",
    r.errors.reduce((s, x) => s + Math.abs(x.difference), 0),
    r.errors.length + " incidencias",
    r.errors.length ? "red" : "green",
  )}</div><section class="panel"><h2>Verificación independiente · 2 noviembre 2026</h2><p>Saldo informado: <b>1.806,99 €</b>. Es un punto de control histórico, no un saldo actual dinámico.</p>${r.checkpoint ? `<p>Saldo calculado: <b>${money(r.checkpoint.calculated)}</b> · Diferencia: <b>${money(r.checkpoint.difference)}</b> ${tag(r.checkpoint.difference === 0 ? "Coincide" : "No coincide", r.checkpoint.difference === 0 ? "green" : "red")}</p>` : '<p class="alert">No hay movimientos del 2 de noviembre para comprobar ese cierre.</p>'}</section><section class="panel"><h2>Continuidad del extracto</h2>${r.errors.length ? `<div class="table-wrap"><table><thead><tr><th>Fecha / concepto</th><th>Calculado</th><th>Informado</th><th>Diferencia</th></tr></thead><tbody>${r.errors.map((x) => `<tr><td>${e(x.date)} · ${e(x.description)}</td><td>${money(x.expected)}</td><td>${money(x.observed)}</td><td class="negative">${money(x.difference)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="success-text">✓ No se han encontrado saltos entre los movimientos y sus saldos posteriores.</p>'}${r.balanceCount !== state.transactions.length ? '<div class="alert">Faltan saldos posteriores en parte del extracto. El saldo es inferido y no puede marcarse completamente conciliado.</div>' : ""}<p class="muted">Esto comprueba la coherencia del extracto disponible, no garantiza que incluya todos tus movimientos. El saldo inicial es inferido, no verificado de forma independiente.</p><h3>Registro de importaciones</h3><ul class="compact-list">${state.imports.map((i) => `<li><div><b>${e(i.name)}</b><small>${e(new Date(i.at).toLocaleString("es-ES"))}</small></div><span>${i.count} nuevos · ${i.duplicates} duplicados omitidos</span></li>`).join("")}</ul></section>`;
}
function funds() {
  const p = position(state),
    g = goalProgress(state, month);
  return `<p class="intro">Son reservas dentro de tu cuenta principal. Asignar o retirar un fondo no crea un movimiento bancario.</p><div class="metric-grid">${metric("Amortización · prioridad B", p.amortization, "Saldo inicial confirmado: 0,00 €", "blue")}${metric("Ahorro personal asignado", p.personal, "Inicial desconocido; no reconstruido por intención", "green")}${metric("Compromisos pendientes", p.committed, "Confirmados explícitamente", "amber")}${metric("Saldo sin clasificar", p.unclassified, "Después de fondos y compromisos")}</div><div class="two-col"><section class="panel"><h2>Asignar, retirar o transferir</h2><form id="fund-form">${field("Desde", fundSelect("from", "unclassified"))}${field("Hacia", fundSelect("to", "amortization"))}<div class="form-row">${field("Importe (€)", '<input name="amount" inputmode="decimal" required placeholder="0,00">')}${field("Fecha de asignación", `<input name="date" type="date" required value="${today()}">`)}</div>${field("Motivo", '<input name="note" required maxlength="300" placeholder="Asignación confirmada de esta quincena">')}<button class="primary">Confirmar movimiento virtual</button></form><p class="footnote">Una retirada vuelve al saldo sin clasificar. Las correcciones se registran como nuevos movimientos, sin borrar el historial.</p></section><section class="panel"><h2>Objetivo · ${e(monthLabel(month))}</h2><dl class="summary-list"><div><dt>Objetivo mensual</dt><dd>${money(g.target)}</dd></div><div><dt>Asignación neta del mes</dt><dd>${money(g.actual)}</dd></div><div><dt>Desviación mensual</dt><dd>${money(g.deviation)}</dd></div><div><dt>Objetivo acumulado desde agosto</dt><dd>${money(g.targetTotal)}</dd></div><div><dt>Asignación neta acumulada</dt><dd>${money(g.cumulative)}</dd></div><div><dt>Desviación acumulada</dt><dd>${money(g.cumulativeDeviation)}</dd></div></dl><p class="muted">Objetivo inicial: (488,18 − 114,00) + (131,92 − 90,39) = 415,71 €/mes. El objetivo no se ingresa automáticamente.</p></section></div><section class="panel"><div class="section-top"><h2>Registro de asignaciones</h2>${tag(state.ledger.length + " operaciones")}</div>${
    state.ledger.length
      ? `<ul class="compact-list">${[...state.ledger]
          .reverse()
          .map(
            (x) =>
              `<li><div><b>${e(x.note)}</b><small>${e(x.date)} · ${fundName(x.from)} → ${fundName(x.to)} · registrado ${e(new Date(x.createdAt).toLocaleString("es-ES"))}</small></div><b>${money(x.amount)}</b></li>`,
          )
          .join("")}</ul>`
      : '<p class="muted">Todavía no has confirmado ninguna asignación.</p>'
  }</section><section class="panel"><div class="section-top"><h2>Recibos comprometidos</h2><button class="secondary" data-action="commitment">Añadir compromiso</button></div><p>Vincula un cargo bancario real al pagar un compromiso para liberar su reserva y evitar doble cómputo. No modifica el saldo bancario.</p>${state.commitments.length ? `<ul class="compact-list">${state.commitments.map((c) => `<li><div><b>${e(c.description)}</b><small>${e(c.date)} · Q${c.half} · ${c.paid ? "Pagado y vinculado" : "Reservado"}</small></div><span>${money(c.amount)}</span>${!c.paid ? `<button class="link" data-action="settle" data-id="${e(c.id)}">Vincular cargo</button><button class="link negative" data-action="cancel-commitment" data-id="${e(c.id)}">Cancelar reserva</button>` : ""}</li>`).join("")}</ul>` : '<p class="muted">Sin compromisos confirmados. Esto no significa que no queden obligaciones por pagar.</p>'}</section>`;
}
function fundName(k) {
  return {
    unclassified: "Sin clasificar",
    personal: "Ahorro personal",
    amortization: "Amortización",
  }[k];
}
function fundSelect(name, value) {
  return `<select name="${name}">${["unclassified", "personal", "amortization"].map((k) => `<option value="${k}" ${value === k ? "selected" : ""}>${fundName(k)}</option>`).join("")}</select>`;
}
function loans() {
  return `<p class="intro">Planifica con datos confirmados. Tu reserva no equivale a una amortización ya realizada.</p><div class="two-col">${[
    ["B", 9039, 13192, 1],
    ["A", 11400, 48818, 2],
  ]
    .map(
      ([name, current, future, half]) =>
        `<section class="panel loan-card"><div class="section-top"><h2>Préstamo ${name}</h2>${tag(name === "B" ? "Prioridad de amortización" : "Segunda prioridad", name === "B" ? "blue" : "")}</div><div class="goal-amount">${money(month >= "2028-02" ? future : current)}<span> / mes</span></div><p>Cuota configurada · quincena ${half}</p><dl class="summary-list"><div><dt>Durante carencia</dt><dd>${money(current)}</dd></div><div><dt>Desde febrero de 2028</dt><dd>${money(future)}</dd></div></dl><p class="muted">Los cargos históricos del banco prevalecen sobre esta previsión.</p></section>`,
    )
    .join(
      "",
    )}</div><section class="panel"><h2>Simulación y amortizaciones reales · siguiente fase</h2><p>El MVP gestiona la reserva virtual. No registra todavía una amortización de capital ni calcula ahorro de intereses.</p><div class="alert">Faltan TAE/TIN, capital pendiente, plazo, comisiones y modalidad de amortización. No se muestran resultados simulados sin estos datos.</div><p>El objetivo de reserva desde febrero de 2028 queda pendiente de configuración; no se mantiene automáticamente en 415,71 €.</p></section>`;
}
function settings() {
  return `<div class="two-col"><section class="panel"><h2>Importar y conservar tus datos</h2><p>CSV bancario con vista previa, columnas configurables y detección de duplicados. Nada se guarda hasta tu confirmación.</p><div class="button-stack"><button class="primary" data-action="import">Importar CSV</button><button class="secondary" data-action="export-json">Descargar copia completa JSON</button><button class="secondary" data-action="export-csv">Exportar movimientos CSV</button><label class="file-label">Seleccionar copia JSON para restaurar<input type="file" id="backup-file" accept=".json,application/json"></label></div><p class="footnote">JSON incluye categorías, presupuestos, fondos, compromisos, objetivos e importaciones. CSV exporta movimientos; no sustituye la copia completa.</p></section><section class="panel"><h2>Objetivos editables</h2><form id="target-form">${field("Reserva mensual hasta enero de 2028 (€)", `<input name="target" inputmode="decimal" required value="${decimal(state.target)}">`)}${field("Reserva desde febrero de 2028 (€)", `<input name="futureTarget" inputmode="decimal" placeholder="Pendiente de confirmar" value="${state.futureTarget === null ? "" : decimal(state.futureTarget)}">`)}<button class="primary">Guardar objetivos</button></form><p class="footnote">Cambiar un objetivo no modifica los fondos. Las reglas de nómina y las recurrencias de referencia se revisan en Seguimiento mensual; no se autoejecutan.</p></section></div><section class="panel"><h2>Privacidad y almacenamiento</h2><p>Los datos se guardan en el almacenamiento de este navegador y este origen. No usamos servicios externos, analítica ni conexión bancaria. Mantén el mismo puerto para recuperar tus datos.</p><p><b>No hay cifrado ni acceso con contraseña en este MVP.</b> Utiliza un dispositivo y un perfil de navegador privados. Borrar datos del navegador o usar navegación privada puede eliminar el histórico. Guarda copias JSON en un lugar seguro.</p><button class="secondary" data-action="raw-backup">Descargar almacenamiento original</button><button class="danger-button" data-action="reset">Borrar datos de este navegador</button></section>`;
}
function render() {
  document.querySelector("#app").innerHTML =
    `<aside class="sidebar"><a class="brand" href="#" data-nav="home"><span class="brand-icon">c</span><span>clara<small>FINANZAS PERSONALES</small></span></a><div class="workspace-label">MI ESPACIO</div><nav aria-label="Navegación principal">${nav.map(([k, label]) => `<button data-nav="${k}" class="nav-item ${page === k ? "active" : ""}" ${page === k ? 'aria-current="page"' : ""}><span aria-hidden="true">${icons[k]}</span>${label}</button>`).join("")}</nav><div class="sidebar-bottom"><span class="privacy-dot"></span><b>Un espacio privado</b><p>Tus datos se quedan<br>en este navegador.</p><small>Local · Sin conexión bancaria</small></div></aside><main><header><div><div class="eyebrow">TU ESPACIO FINANCIERO</div><h1>${names[page]}</h1><p>Decisiones tranquilas, cuentas claras.</p></div><div class="header-actions"><label class="month-picker"><span>Mes presupuestario</span><input id="month" type="month" min="2026-08" max="2100-12" value="${e(month)}" aria-label="Mes presupuestario"></label><button class="primary" data-action="import">＋ Importar CSV</button></div></header>${storageError ? `<div class="alert danger">${e(storageError)}</div>` : ""}${notice ? `<div class="notice" role="status">${e(notice)}<button data-action="dismiss" aria-label="Cerrar aviso">×</button></div>` : ""}<div id="page-content">${{ home, calendar, transactions, reconciliation, funds, loans, settings }[page]()}</div><footer>Clara · Cada cifra tiene un origen. Cada reserva, una decisión.</footer></main>${modal ? modalView() : ""}`;
  if (modal) {
    document
      .querySelector(".modal input, .modal select, .modal button")
      ?.focus();
  }
}
function modalView() {
  let content = "";
  if (modal.type === "import")
    content = `<h2 id="modal-title">Importar movimientos</h2><p>Revisa las columnas, el orden y la conciliación antes de guardar. Las sugerencias de categoría no asignan ahorro.</p><div class="import-choices"><label class="file-label">Seleccionar CSV<input id="csv-file" type="file" accept=".csv,text/csv"></label><button class="secondary" data-action="local-history">Abrir histórico local privado</button></div><small>El histórico local solo está disponible con <code>npm run start:private</code>. También puedes seleccionar el CSV adjunto directamente.</small>${
      parsed
        ? `<h3>${e(importName)} · ${parsed.rows.length} filas</h3><form id="mapping-form"><div class="mapping-grid">${[
            ["date", "Fecha bancaria", "fecha"],
            ["valueDate", "Fecha valor (opcional)", "fecha_valor"],
            ["description", "Concepto", "concepto"],
            ["amount", "Importe (€)", "importe_eur"],
            ["balance", "Saldo posterior (opcional)", "saldo_eur"],
          ]
            .map(([key, label, preferred]) =>
              field(
                label,
                `<select name="${key}" ${["date", "description", "amount"].includes(key) ? "required" : ""}><option value="">Sin asignar</option>${parsed.headers.map((h) => `<option value="${e(h)}" ${h === (modal.mapping?.[key] || preferred) ? "selected" : ""}>${e(h)}</option>`).join("")}</select>`,
              ),
            )
            .join(
              "",
            )}${field("Orden del extracto", `<select name="direction"><option value="desc" ${modal.direction !== "asc" ? "selected" : ""}>Más reciente primero (CSV adjunto)</option><option value="asc" ${modal.direction === "asc" ? "selected" : ""}>Más antiguo primero</option></select>`)}</div><button class="secondary">Generar vista previa</button></form>`
        : ""
    }${preview ? previewView() : ""}`;
  if (modal.type === "edit") {
    const t = state.transactions.find((x) => x.id === modal.id);
    content = `<h2 id="modal-title">Revisar movimiento</h2><p><b>${e(t.description)}</b> · ${money(t.amount)}. Cualquier cambio de fecha se comprueba de nuevo en conciliación.</p><form id="edit-form"><div class="form-row">${field("Fecha bancaria", `<input name="date" type="date" required value="${e(t.date)}">`)}${field("Categoría", `<select name="category">${CATEGORIES.map((c) => `<option ${c === t.category ? "selected" : ""}>${e(c)}</option>`).join("")}</select>`)}</div><div class="form-row">${field("Mes presupuestario", `<input name="month" type="month" min="2026-08" max="2100-12" required value="${e(t.budget.month)}">`)}${field("Quincena", '<select name="half"><option value="1" ' + (t.budget.half === 1 ? "selected" : "") + '>1 · días 1–13</option><option value="2" ' + (t.budget.half === 2 ? "selected" : "") + ">2 · día 14–cierre</option></select>")}</div><p class="muted">La asignación presupuestaria es manual. Cambiar la categoría no desplaza el dinero ni su fecha real.</p><button class="primary">Guardar revisión</button></form>`;
  }
  if (modal.type === "commitment")
    content = `<h2 id="modal-title">Confirmar recibo pendiente</h2><p>Comprueba que todavía no se haya cargado. La reserva reduce el saldo sin clasificar, sin crear una salida bancaria.</p><form id="commitment-form">${field("Concepto", `<input name="description" required value="${e(modal.description || "")}">`)}${field("Importe a reservar (€)", `<input name="amount" inputmode="decimal" required value="${modal.amount ? decimal(modal.amount) : ""}">`)}<div class="form-row">${field("Fecha prevista", `<input name="date" type="date" required value="${month}-${modal.half === 2 ? "14" : "01"}">`)}${field("Quincena", `<select name="half"><option value="1">1 · días 1–13</option><option value="2" ${modal.half === 2 ? "selected" : ""}>2 · día 14–cierre</option></select>`)}</div><button class="primary">Confirmar reserva</button></form>`;
  if (modal.type === "settle") {
    const c = state.commitments.find((x) => x.id === modal.id),
      linked = new Set(
        state.commitments.filter((x) => x.paid).map((x) => x.transactionId),
      );
    content = `<h2 id="modal-title">Vincular un cargo real</h2><p>${e(c.description)} · Reserva de ${money(c.amount)}. Se libera toda la reserva al vincular el cargo; si difiere, manda el importe bancario.</p><form id="settle-form">${field(
      "Cargo bancario",
      `<select name="transactionId" required><option value="">Selecciona un cargo</option>${[
        ...state.transactions,
      ]
        .reverse()
        .filter((t) => t.amount < 0 && !linked.has(t.id))
        .map(
          (t) =>
            `<option value="${e(t.id)}">${e(t.date)} · ${e(t.description)} · ${money(t.amount)}</option>`,
        )
        .join("")}</select>`,
    )}<button class="primary">Confirmar pago y liberar reserva</button></form>`;
  }
  if (modal.type === "restore")
    content = `<h2 id="modal-title">Restaurar copia completa</h2><p>Esta copia sustituirá los datos de este navegador: <b>${pendingBackup.transactions.length} movimientos</b>, ${pendingBackup.ledger.length} operaciones de fondos y ${pendingBackup.commitments.length} compromisos.</p><p>Descarga primero una copia de los datos actuales si quieres conservarlos.</p><button class="secondary" data-action="export-json">Descargar copia actual</button><button class="primary" data-action="confirm-restore">Confirmar sustitución</button>`;
  return `<div class="modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="modal-title" class="modal"><button class="close-modal" data-action="close" aria-label="Cerrar diálogo">×</button>${content}<p id="modal-error" role="alert" class="negative"></p></section></div>`;
}
function previewView() {
  const combined = [...state.transactions, ...preview.transactions].sort(
    (a, b) => a.date.localeCompare(b.date),
  );
  const r = reconcile(combined);
  return `<section class="import-preview"><h3>Vista previa · todavía sin guardar</h3><div class="status-row">${tag(preview.transactions.length + " nuevos", "blue")}${tag(preview.duplicates.length + " duplicados omitidos")}${tag(preview.errors.length + " errores", preview.errors.length ? "red" : "green")}${tag(r.verified ? "Saldos coherentes" : "Revisar saldos", r.verified ? "green" : "red")}</div>${preview.errors.length ? `<ul class="alert danger">${preview.errors.map((x) => `<li>Fila ${x.line}: ${e(x.message)}</li>`).join("")}</ul>` : ""}${r.errors.length ? `<div class="alert danger">${r.errors.length} diferencias de continuidad bancaria. Revisa el orden y las columnas. No se permite confirmar un extracto con descuadres.</div>` : ""}${r.checkpoint?.difference ? '<div class="alert danger">El punto de verificación del 2 de noviembre no coincide.</div>' : ""}${r.balance === null ? '<div class="alert">Sin saldos posteriores: puedes conservar los movimientos, pero no reservar fondos ni dar el banco por conciliado.</div>' : ""}<p>Saldo inicial inferido: <b>${money(r.opening)}</b> · Saldo final: <b>${money(r.balance)}</b></p>${transactionsTable(preview.transactions.slice(0, 8))}<small>Primeras 8 filas en orden cronológico. Repeticiones exactas (fecha, valor, concepto, importe y saldo) se omiten; movimientos de igual importe con distinto saldo se conservan.</small><button class="primary" data-action="confirm-import" ${!preview.transactions.length || preview.errors.length || r.errors.length || r.checkpoint?.difference ? "disabled" : ""}>Confirmar importación de ${preview.transactions.length} movimientos</button></section>`;
}
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function showError(err) {
  const target = document.querySelector("#modal-error");
  if (target) target.textContent = err.message;
  else flash(err.message);
}
function loadCSV(text, name) {
  parsed = parseCSV(text);
  preview = null;
  importName = name;
  modal = { type: "import" };
  render();
}
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action],[data-nav]");
  if (!button) return;
  event.preventDefault();
  if (button.dataset.nav) {
    page = button.dataset.nav;
    notice = "";
    render();
    window.scrollTo(0, 0);
    return;
  }
  const action = button.dataset.action;
  try {
    if (action === "import") {
      modal = { type: "import" };
      parsed = null;
      preview = null;
      render();
    }
    if (action === "close") {
      modal = null;
      pendingBackup = null;
      render();
    }
    if (action === "dismiss") {
      notice = "";
      render();
    }
    if (action === "edit") {
      modal = { type: "edit", id: button.dataset.id };
      render();
    }
    if (action === "commitment") {
      modal = { type: "commitment" };
      render();
    }
    if (action === "template") {
      const r = RECURRENCES[Number(button.dataset.index)];
      modal = {
        type: "commitment",
        description: r.name,
        amount: month >= "2028-02" && r.future ? r.future : r.amount,
        half: r.half,
      };
      render();
    }
    if (action === "settle") {
      modal = { type: "settle", id: button.dataset.id };
      render();
    }
    if (action === "cancel-commitment") {
      if (
        confirm(
          "¿Cancelar esta reserva pendiente? No cambiará ningún movimiento bancario.",
        )
      ) {
        save({
          ...state,
          commitments: state.commitments.filter(
            (c) => c.id !== button.dataset.id,
          ),
        });
        flash("Reserva cancelada.");
      }
    }
    if (action === "local-history") {
      const response = await fetch("/api/local-history");
      if (!response.ok)
        throw new Error(
          "Histórico privado no disponible. Selecciona el CSV con el botón de archivo o inicia npm run start:private.",
        );
      loadCSV(await response.text(), "histórico local privado");
    }
    if (action === "confirm-import") {
      const combined = [...state.transactions, ...preview.transactions].sort(
        (a, b) => a.date.localeCompare(b.date),
      );
      const r = reconcile(combined);
      if (
        !preview.transactions.length ||
        preview.errors.length ||
        r.errors.length ||
        r.checkpoint?.difference
      )
        throw new Error("Corrige la vista previa antes de guardar.");
      save({
        ...state,
        transactions: combined,
        imports: [
          ...state.imports,
          {
            at: new Date().toISOString(),
            name: importName,
            count: preview.transactions.length,
            duplicates: preview.duplicates.length,
            verified: r.verified,
          },
        ],
      });
      month = r.lastDate.slice(0, 7);
      modal = null;
      page = "home";
      flash(
        "Importación guardada. Revisa las categorías y confirma las asignaciones de fondos.",
      );
    }
    if (action === "export-json")
      download(
        "clara-copia-" + today() + ".json",
        JSON.stringify(state, null, 2),
        "application/json",
      );
    if (action === "raw-backup")
      download(
        "clara-almacenamiento-original.json",
        localStorage.getItem(KEY) || "{}",
        "application/json",
      );
    if (action === "export-csv")
      download(
        "clara-movimientos-" + today() + ".csv",
        exportCSV(state),
        "text/csv;charset=utf-8",
      );
    if (action === "confirm-restore") {
      // A valid, explicitly confirmed restore is the only path allowed to replace unreadable storage.
      const next = restoreBackup(JSON.stringify(pendingBackup));
      localStorage.setItem(KEY, JSON.stringify(next));
      state = next;
      storageError = "";
      pendingBackup = null;
      modal = null;
      month = state.transactions.at(-1)?.date.slice(0, 7) || month;
      flash(
        "Copia restaurada. Revisa el estado de conciliación y las reservas.",
      );
    }
    if (
      action === "reset" &&
      confirm(
        "Se borrarán los datos financieros de este navegador. ¿Tienes una copia JSON y quieres continuar?",
      )
    ) {
      localStorage.removeItem(KEY);
      state = initialState();
      storageError = "";
      modal = null;
      flash("Datos locales borrados.");
    }
  } catch (err) {
    showError(err);
  }
});
document.addEventListener("change", async (event) => {
  try {
    if (event.target.id === "month") {
      const value = event.target.value;
      if (!validDate(value + "-01") || value < "2026-08" || value > "2100-12")
        throw new Error(
          "Elige un mes entre agosto de 2026 y diciembre de 2100.",
        );
      month = value;
      render();
    }
    if (event.target.id === "csv-file" && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.size > 5_000_000) throw new Error("El límite es 5 MB por CSV.");
      loadCSV(await file.text(), file.name);
    }
    if (event.target.id === "backup-file" && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.size > 20_000_000) throw new Error("La copia supera 20 MB.");
      pendingBackup = restoreBackup(await file.text());
      modal = { type: "restore" };
      render();
    }
  } catch (err) {
    showError(err);
  }
});
document.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target;
  const f = Object.fromEntries(new FormData(form));
  try {
    if (form.id === "mapping-form") {
      const required = [f.date, f.description, f.amount];
      if (required.some((v) => !v))
        throw new Error("Asigna las columnas obligatorias.");
      const selected = ["date", "valueDate", "description", "amount", "balance"]
        .map((k) => f[k])
        .filter(Boolean);
      if (new Set(selected).size !== selected.length)
        throw new Error("Cada campo debe utilizar una columna distinta.");
      modal.mapping = f;
      modal.direction = f.direction;
      preview = previewImport(parsed, f, f.direction, state.transactions);
      render();
    }
    if (form.id === "filters") {
      query = f.query;
      categoryFilter = f.category;
      render();
    }
    if (form.id === "fund-form") {
      save(moveFunds(state, { ...f, amount: cents(f.amount) }));
      flash("Movimiento de fondos registrado. El saldo bancario no cambia.");
    }
    if (form.id === "commitment-form") {
      save(
        addCommitment(state, {
          ...f,
          amount: cents(f.amount),
          half: Number(f.half),
        }),
      );
      modal = null;
      flash("Compromiso confirmado y reservado.");
    }
    if (form.id === "settle-form") {
      save(settleCommitment(state, modal.id, f.transactionId));
      modal = null;
      flash("Cargo vinculado. Reserva liberada para evitar doble cómputo.");
    }
    if (form.id === "target-form") {
      const target = cents(f.target),
        futureTarget = f.futureTarget.trim() ? cents(f.futureTarget) : null;
      if (target < 0 || (futureTarget !== null && futureTarget < 0))
        throw new Error("Los objetivos no pueden ser negativos.");
      save({ ...state, target, futureTarget });
      flash("Objetivos actualizados; los fondos no cambian.");
    }
    if (form.id === "edit-form") {
      if (
        !validDate(f.date) ||
        !validDate(f.month + "-01") ||
        !CATEGORIES.includes(f.category)
      )
        throw new Error("Revisa las fechas y la categoría.");
      const next = {
        ...state,
        transactions: state.transactions
          .map((t) =>
            t.id === modal.id
              ? {
                  ...t,
                  date: f.date,
                  category: f.category,
                  budget: { month: f.month, half: Number(f.half) },
                  reviewedAt: new Date().toISOString(),
                }
              : t,
          )
          .sort((a, b) => a.date.localeCompare(b.date)),
      };
      save(next);
      modal = null;
      flash("Movimiento revisado. La conciliación se ha recalculado.");
    }
  } catch (err) {
    showError(err);
  }
});
document.addEventListener("keydown", (event) => {
  if (!modal) return;
  if (event.key === "Escape") {
    modal = null;
    render();
    return;
  }
  if (event.key === "Tab") {
    const items = [
      ...document
        .querySelector(".modal")
        .querySelectorAll("button:not([disabled]),input,select,a[href]"),
    ];
    const first = items[0],
      last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
});
render();
