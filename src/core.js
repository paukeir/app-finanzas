export const TRACKING_START = "2026-08-01";
export const CHECKPOINT = { date: "2026-11-02", balance: 180699 };
export const CATEGORIES = [
  "Pendiente de confirmar",
  "Nómina",
  "Transferencia propia",
  "Ahorro externo",
  "Préstamo A",
  "Préstamo B",
  "Recibo",
  "Consumo",
  "Otros ingresos",
];
export function cents(value) {
  let s = String(value).trim().replace(/\s|€/g, "");
  if (s.includes(",") && s.includes(".")) {
    if (s.lastIndexOf(",") > s.lastIndexOf("."))
      s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else s = s.replace(",", ".");
  if (!/^[+-]?\d+(\.\d{1,2})?$/.test(s))
    throw new Error(`Importe no válido: ${value}`);
  const negative = s.startsWith("-");
  const [whole, fraction = ""] = s.replace(/^[+-]/, "").split(".");
  const n = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(n)) throw new Error("Importe fuera de rango");
  return negative ? -n : n;
}
export const money = (n) =>
  n === null || n === undefined
    ? "Pendiente de confirmar"
    : new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency: "EUR",
      }).format(n / 100);
export function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T12:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
export function nextMonth(month) {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}
export function budgetFor(date, category) {
  if (!validDate(date)) throw new Error("Fecha no válida");
  const day = Number(date.slice(8));
  // Midmonth payroll finances Q2; late-month payroll finances Q1 of the next month.
  if (category === "Nómina" && day > 20)
    return { month: nextMonth(date.slice(0, 7)), half: 1 };
  if (category === "Nómina" && day >= 14)
    return { month: date.slice(0, 7), half: 2 };
  return { month: date.slice(0, 7), half: day <= 13 ? 1 : 2 };
}
export function penultimateBusinessDay(month) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0, 12));
  let found = 0;
  while (true) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && ++found === 2)
      return d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() - 1);
  }
}
export function suggestCategory(description, amount = null) {
  const s = description
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  if (s.includes("NOMINA")) return "Nómina";
  if (/TRASPASOS? PROPIOS?/.test(s)) return "Transferencia propia";
  if (/^PRES\./.test(s) && [-11400, -48818].includes(amount))
    return "Préstamo A";
  if (/^PRES\./.test(s) && [-9039, -13192].includes(amount))
    return "Préstamo B";
  // MYBOX has ambiguous products and amounts. Never infer saving intent from its name.
  if (/SEVIAM|DIGI |GANA ENERGIA|EMPR.MIXTA|CDAD PROP|C.P.URUGUAY/.test(s))
    return "Recibo";
  return "Pendiente de confirmar";
}
export function parseCSV(text, delimiter) {
  text = text.replace(/^\uFEFF/, "");
  delimiter ||= text
    .slice(0, text.indexOf("\n") < 0 ? undefined : text.indexOf("\n"))
    .includes(";")
    ? ";"
    : ",";
  const rows = [];
  let row = [],
    value = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (!quoted && value.length)
        throw new Error("Comillas CSV fuera de lugar");
      else quoted = !quoted;
    } else if (c === delimiter && !quoted) {
      row.push(value);
      value = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(value);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      value = "";
    } else value += c;
  }
  if (quoted) throw new Error("CSV con comillas sin cerrar");
  row.push(value);
  if (row.some((v) => v.trim())) rows.push(row);
  if (rows.length < 2)
    throw new Error("El CSV necesita cabecera y al menos un movimiento");
  const headers = rows.shift().map((s) => s.trim());
  if (new Set(headers).size !== headers.length)
    throw new Error("Hay cabeceras duplicadas");
  if (rows.some((r) => r.length !== headers.length))
    throw new Error(
      "Hay filas con un número de columnas distinto a la cabecera",
    );
  return { headers, rows };
}
export function fingerprint(t) {
  return JSON.stringify([
    t.date,
    t.valueDate,
    t.description,
    t.amount,
    t.balance,
  ]);
}
export function previewImport(
  parsed,
  mapping,
  direction = "desc",
  existing = [],
) {
  const errors = [],
    duplicates = [],
    transactions = [];
  const seen = new Set(existing.map(fingerprint));
  let rows = parsed.rows.map((r, i) => ({ r, line: i + 2 }));
  if (direction === "desc") rows.reverse();
  if (!["asc", "desc"].includes(direction)) throw new Error("Orden no válido");
  const read = (r, key) => r[parsed.headers.indexOf(mapping[key])]?.trim();
  for (const { r, line } of rows) {
    try {
      const date = read(r, "date"),
        valueDate = read(r, "valueDate") || date;
      if (!validDate(date) || !validDate(valueDate))
        throw new Error("Fecha inválida; utiliza AAAA-MM-DD");
      const description = read(r, "description");
      if (!description) throw new Error("Concepto vacío");
      const amount = cents(read(r, "amount"));
      const rawBalance = read(r, "balance");
      const balance = rawBalance ? cents(rawBalance) : null;
      const category = suggestCategory(description, amount);
      const t = {
        id: crypto.randomUUID(),
        date,
        valueDate,
        description,
        amount,
        balance,
        category,
        budget: budgetFor(date, category),
        source: "CSV",
        line,
      };
      const key = fingerprint(t);
      if (seen.has(key)) duplicates.push({ line, description });
      else {
        seen.add(key);
        transactions.push(t);
      }
    } catch (e) {
      errors.push({ line, message: e.message });
    }
  }
  // Keep same-day bank ordering; do not sort by amount or concept.
  if (transactions.some((t, i) => i > 0 && t.date < transactions[i - 1].date))
    errors.push({
      line: 0,
      message: "Orden de fechas incoherente. Revisa el sentido del extracto.",
    });
  return { transactions, errors, duplicates };
}
export function reconcile(transactions) {
  const ordered = [...transactions].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const errors = [];
  let running = null,
    opening = null;
  for (let i = 0; i < ordered.length; i++) {
    const t = ordered[i];
    if (running === null && t.balance !== null) {
      const prior = ordered.slice(0, i).reduce((sum, x) => sum + x.amount, 0);
      opening = t.balance - t.amount - prior;
      running = opening + prior;
    }
    if (running !== null) {
      running += t.amount;
      if (t.balance !== null && running !== t.balance)
        errors.push({
          id: t.id,
          date: t.date,
          description: t.description,
          expected: running,
          observed: t.balance,
          difference: t.balance - running,
        });
    }
  }
  const last = ordered.at(-1);
  const checkpointRows = ordered.filter((t) => t.date <= CHECKPOINT.date);
  let checkpoint = null;
  if (checkpointRows.at(-1)?.date === CHECKPOINT.date && opening !== null) {
    const calculated =
      opening + checkpointRows.reduce((sum, t) => sum + t.amount, 0);
    checkpoint = { calculated, difference: calculated - CHECKPOINT.balance };
  }
  const startRows = ordered.filter((t) => t.date < TRACKING_START);
  return {
    opening,
    startBalance:
      opening === null
        ? null
        : opening + startRows.reduce((s, t) => s + t.amount, 0),
    balance: running,
    lastDate: last?.date || null,
    errors,
    checkpoint,
    verified:
      !!last &&
      running !== null &&
      ordered.every((t) => t.balance !== null) &&
      errors.length === 0 &&
      (!checkpoint || checkpoint.difference === 0),
    balanceCount: ordered.filter((t) => t.balance !== null).length,
  };
}
export const initialState = () => ({
  version: 1,
  transactions: [],
  ledger: [],
  commitments: [],
  imports: [],
  target: 41571,
  futureTarget: null,
});
export function fundTotals(state) {
  return state.ledger.reduce(
    (s, e) => {
      s.personal += e.personal;
      s.amortization += e.amortization;
      return s;
    },
    { personal: 0, amortization: 0 },
  );
}
export function position(state) {
  const bank = reconcile(state.transactions);
  const funds = fundTotals(state);
  const committed = state.commitments
    .filter((c) => !c.paid)
    .reduce((s, c) => s + c.amount, 0);
  return {
    ...funds,
    bank,
    committed,
    unclassified:
      bank.balance === null
        ? null
        : bank.balance - funds.personal - funds.amortization - committed,
  };
}
function assertSafeTotals(state) {
  const p = position(state);
  if (!p.bank.verified)
    throw new Error("Concilia el banco antes de reservar dinero");
  if (p.personal < 0 || p.amortization < 0)
    throw new Error("El fondo no tiene saldo suficiente");
  if (p.unclassified < 0)
    throw new Error(
      "La asignación supera el efectivo disponible tras fondos y compromisos",
    );
}
export function moveFunds(state, { from, to, amount, date, note }) {
  if (
    !["unclassified", "personal", "amortization"].includes(from) ||
    !["unclassified", "personal", "amortization"].includes(to) ||
    from === to
  )
    throw new Error("Elige dos destinos distintos");
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new Error("El importe debe ser positivo");
  if (!validDate(date)) throw new Error("Fecha no válida");
  if (!note?.trim()) throw new Error("Añade un motivo para el registro");
  const p = position(state);
  if (amount > p[from]) throw new Error("Saldo de origen insuficiente");
  const entry = {
    id: crypto.randomUUID(),
    date,
    createdAt: new Date().toISOString(),
    note: note.trim(),
    from,
    to,
    amount,
    personal: 0,
    amortization: 0,
  };
  if (from !== "unclassified") entry[from] -= amount;
  if (to !== "unclassified") entry[to] += amount;
  const next = { ...state, ledger: [...state.ledger, entry] };
  if (to === "unclassified") {
    const after = position(next);
    if (after.personal < 0 || after.amortization < 0)
      throw new Error("Saldo de fondo insuficiente");
  } else assertSafeTotals(next);
  return next;
}
export function addCommitment(state, { description, amount, date, half }) {
  if (
    !description?.trim() ||
    !validDate(date) ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    ![1, 2].includes(half)
  )
    throw new Error("Revisa concepto, fecha, quincena e importe positivo");
  const c = {
    id: crypto.randomUUID(),
    description: description.trim(),
    amount,
    date,
    half,
    paid: false,
    transactionId: null,
  };
  const next = { ...state, commitments: [...state.commitments, c] };
  assertSafeTotals(next);
  return next;
}
export function settleCommitment(state, commitmentId, transactionId) {
  const c = state.commitments.find((x) => x.id === commitmentId);
  const t = state.transactions.find((x) => x.id === transactionId);
  if (
    !c ||
    c.paid ||
    !t ||
    t.amount >= 0 ||
    state.commitments.some((x) => x.transactionId === transactionId)
  )
    throw new Error("Selecciona un cargo real no vinculado");
  return {
    ...state,
    commitments: state.commitments.map((x) =>
      x.id === c.id
        ? {
            ...x,
            paid: true,
            transactionId,
            settledAt: new Date().toISOString(),
          }
        : x,
    ),
  };
}
export function targetFor(state, month) {
  return month >= "2028-02" ? state.futureTarget : state.target;
}
export function goalProgress(state, month) {
  const actual = state.ledger
    .filter((e) => e.date.slice(0, 7) === month)
    .reduce((s, e) => s + e.amortization, 0);
  const cumulative = state.ledger
    .filter((e) => e.date.slice(0, 7) <= month)
    .reduce((s, e) => s + e.amortization, 0);
  let targetTotal = 0,
    unknown = false;
  for (let m = "2026-08"; m <= month; m = nextMonth(m)) {
    const target = targetFor(state, m);
    if (target === null) unknown = true;
    else targetTotal += target;
  }
  const target = targetFor(state, month);
  return {
    actual,
    cumulative,
    target,
    deviation: target === null ? null : actual - target,
    targetTotal: unknown ? null : targetTotal,
    cumulativeDeviation: unknown ? null : cumulative - targetTotal,
  };
}
export function monthSummary(state, month, half) {
  const ts = state.transactions.filter(
    (t) => t.budget.month === month && t.budget.half === half,
  );
  const income = ts
    .filter((t) => t.category === "Nómina" && t.amount > 0)
    .reduce((s, t) => s + t.amount, 0);
  const transfers = -ts
    .filter((t) => t.category === "Transferencia propia" && t.amount < 0)
    .reduce((s, t) => s + t.amount, 0);
  const returns = ts
    .filter((t) => t.category === "Transferencia propia" && t.amount > 0)
    .reduce((s, t) => s + t.amount, 0);
  const out = -ts
    .filter((t) => t.amount < 0 && t.category !== "Transferencia propia")
    .reduce((s, t) => s + t.amount, 0);
  const externalSavings = -ts
    .filter((t) => t.amount < 0 && t.category === "Ahorro externo")
    .reduce((s, t) => s + t.amount, 0);
  const pending = state.commitments
    .filter((c) => !c.paid && c.date.slice(0, 7) === month && c.half === half)
    .reduce((s, c) => s + c.amount, 0);
  const otherIncome = ts
    .filter(
      (t) =>
        t.amount > 0 &&
        !["Nómina", "Transferencia propia"].includes(t.category),
    )
    .reduce((s, t) => s + t.amount, 0);
  return {
    ts,
    income,
    transfers,
    returns,
    out,
    externalSavings,
    pending,
    otherIncome,
    margin: income + otherIncome + returns - transfers - out - pending,
  };
}
function csvCell(v) {
  let s = String(v ?? "");
  if (/^[=+@\t\r]/.test(s) || /^-\D/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function exportCSV(state) {
  return (
    "\uFEFF" +
    [
      [
        "fecha",
        "fecha_valor",
        "concepto",
        "importe_eur",
        "saldo_eur",
        "categoria",
        "mes_presupuestario",
        "quincena",
      ],
      ...state.transactions.map((t) => [
        t.date,
        t.valueDate,
        t.description,
        decimal(t.amount),
        t.balance === null ? "" : decimal(t.balance),
        t.category,
        t.budget.month,
        t.budget.half,
      ]),
    ]
      .map((r) => r.map(csvCell).join(","))
      .join("\r\n")
  );
}
export function decimal(n) {
  return `${n < 0 ? "-" : ""}${Math.floor(Math.abs(n) / 100)}.${String(Math.abs(n) % 100).padStart(2, "0")}`;
}
export function restoreBackup(text) {
  let s;
  try {
    s = JSON.parse(text);
  } catch {
    throw new Error("El archivo no es un JSON válido");
  }
  const fail = () => {
    throw new Error("Copia incompatible o con datos inválidos");
  };
  const integer = (n) => Number.isSafeInteger(n);
  const month = (m) => typeof m === "string" && validDate(m + "-01");
  if (
    !s ||
    s.version !== 1 ||
    !["transactions", "ledger", "commitments", "imports"].every((k) =>
      Array.isArray(s[k]),
    ) ||
    !integer(s.target) ||
    s.target < 0 ||
    (s.futureTarget !== null &&
      (!integer(s.futureTarget) || s.futureTarget < 0))
  )
    fail();
  for (const t of s.transactions)
    if (
      !t ||
      typeof t.id !== "string" ||
      !validDate(t.date) ||
      !validDate(t.valueDate) ||
      typeof t.description !== "string" ||
      !integer(t.amount) ||
      (t.balance !== null && !integer(t.balance)) ||
      !CATEGORIES.includes(t.category) ||
      !t.budget ||
      !month(t.budget.month) ||
      ![1, 2].includes(t.budget.half)
    )
      fail();
  if (new Set(s.transactions.map((t) => t.id)).size !== s.transactions.length)
    fail();
  for (const e of s.ledger) {
    if (
      !e ||
      typeof e.id !== "string" ||
      !validDate(e.date) ||
      typeof e.note !== "string" ||
      !integer(e.personal) ||
      !integer(e.amortization) ||
      !integer(e.amount) ||
      e.amount <= 0 ||
      !["unclassified", "personal", "amortization"].includes(e.from) ||
      !["unclassified", "personal", "amortization"].includes(e.to) ||
      e.from === e.to
    )
      fail();
    const expected = { personal: 0, amortization: 0 };
    if (e.from !== "unclassified") expected[e.from] -= e.amount;
    if (e.to !== "unclassified") expected[e.to] += e.amount;
    if (
      e.personal !== expected.personal ||
      e.amortization !== expected.amortization
    )
      fail();
  }
  if (new Set(s.ledger.map((e) => e.id)).size !== s.ledger.length) fail();
  for (const c of s.commitments)
    if (
      !c ||
      typeof c.id !== "string" ||
      typeof c.description !== "string" ||
      !validDate(c.date) ||
      !integer(c.amount) ||
      c.amount <= 0 ||
      ![1, 2].includes(c.half) ||
      typeof c.paid !== "boolean" ||
      (c.paid &&
        !s.transactions.some((t) => t.id === c.transactionId && t.amount < 0))
    )
      fail();
  const linked = s.commitments
    .filter((c) => c.paid)
    .map((c) => c.transactionId);
  if (
    new Set(linked).size !== linked.length ||
    new Set(s.commitments.map((c) => c.id)).size !== s.commitments.length
  )
    fail();
  for (const i of s.imports)
    if (
      !i ||
      typeof i.at !== "string" ||
      !integer(i.count) ||
      i.count < 0 ||
      typeof i.name !== "string"
    )
      fail();
  const funds = fundTotals(s);
  if (funds.personal < 0 || funds.amortization < 0) fail();
  return s;
}
export const RECURRENCES = [
  { name: "Seviam", amount: 1525, half: 1 },
  { name: "Seviam", amount: 209, half: 1 },
  { name: "Donaciones", amount: 3000, half: 1 },
  { name: "Jubilación · ahorro externo", amount: 20000, half: 1 },
  { name: "Seguro hogar", amount: 3756, half: 1 },
  { name: "Préstamo B", amount: 9039, future: 13192, half: 1 },
  { name: "Préstamo A", amount: 11400, future: 48818, half: 2 },
  { name: "Luz (estimación)", amount: 7000, half: 2 },
  { name: "Wifi (estimación)", amount: 700, half: 2 },
  {
    name: "Agua (estimación)",
    amount: 6500,
    half: 2,
    months: [2, 4, 6, 8, 10, 12],
  },
  { name: "Sindicato", amount: 1850, half: 1, months: [1, 4, 7, 10] },
];
