import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  cents,
  decimal,
  validDate,
  budgetFor,
  penultimateBusinessDay,
  parseCSV,
  previewImport,
  reconcile,
  initialState,
  position,
  moveFunds,
  addCommitment,
  addManualTransaction,
  settleCommitment,
  goalProgress,
  monthSummary,
  exportCSV,
  restoreBackup,
} from "../src/core.js";
const mapping = {
  date: "fecha",
  valueDate: "fecha_valor",
  description: "concepto",
  amount: "importe_eur",
  balance: "saldo_eur",
};
const csv =
  "fecha,fecha_valor,concepto,importe_eur,saldo_eur\n2027-01-14,2027-01-14,NÓMINA,100,200\n2027-01-14,2027-01-14,Recibo,-10,190\n2027-01-15,2027-01-15,TRASPASO PROPIO,-20,170";
const imported = () =>
  previewImport(parseCSV(csv), mapping, "asc").transactions;
const base = () => ({ ...initialState(), transactions: imported() });
test("registro manual: signos, saldo opcional, nómina y copias", () => {
  const input = {
    date: "2027-01-28",
    description: "Nómina",
    amount: "1500,50",
    category: "Nómina",
    kind: "income",
  };
  const state = addManualTransaction(initialState(), input);
  assert.equal(state.transactions[0].amount, 150050);
  assert.deepEqual(state.transactions[0].budget, { month: "2027-02", half: 1 });
  assert.equal(reconcile(state.transactions).balance, null);
  const next = addManualTransaction(state, {
    ...input,
    description: "Luz",
    category: "Recibo",
    kind: "expense",
    amount: "50,25",
    balance: "1450,25",
  });
  assert.equal(next.transactions[1].amount, -5025);
  assert.equal(reconcile(next.transactions).balance, 145025);
  assert.equal(reconcile(next.transactions).verified, false);
  assert.deepEqual(restoreBackup(JSON.stringify(next)), next);
  assert.equal(state.transactions.length, 1);
  for (const invalid of [
    { amount: "0" },
    { amount: "-1" },
    { amount: "1,001" },
    { date: "2027-02-30" },
    { description: " " },
    { kind: "expense" },
  ])
    assert.throws(() => addManualTransaction(state, { ...input, ...invalid }));
  const backdated = addManualTransaction(next, {
    ...input,
    date: "2027-01-01",
    balance: "20",
  });
  assert.equal(backdated.transactions[0].date, "2027-01-01");
  assert.ok(reconcile(backdated.transactions).errors.length);
});
test("céntimos exactos, decimales españoles y límites", () => {
  assert.equal(cents("1.806,99 €"), 180699);
  assert.equal(cents("-0,09"), -9);
  assert.equal(cents("0.1") + cents("0.2"), 30);
  assert.equal(decimal(-7), "-0.07");
  for (const s of ["NaN", "1.001", "", "Infinity", "1e3", "90071992547409999"])
    assert.throws(() => cents(s));
});
test("fechas reales, años bisiestos, quincenas y cambio de año", () => {
  assert.ok(validDate("2028-02-29"));
  assert.ok(!validDate("2026-02-29"));
  assert.ok(!validDate("2026-13-01"));
  assert.deepEqual(budgetFor("2026-11-13", "Recibo"), {
    month: "2026-11",
    half: 1,
  });
  assert.deepEqual(budgetFor("2026-11-14", "Recibo"), {
    month: "2026-11",
    half: 2,
  });
  assert.deepEqual(budgetFor("2026-12-30", "Nómina"), {
    month: "2027-01",
    half: 1,
  });
  assert.deepEqual(budgetFor("2026-10-14", "Nómina"), {
    month: "2026-10",
    half: 2,
  });
  assert.equal(penultimateBusinessDay("2026-10"), "2026-10-29");
});
test("CSV: BOM, comillas, saltos de línea y separador español", () => {
  const p = parseCSV(
    '\uFEFFfecha;concepto;importe\r\n2027-01-01;"Texto; con ""comillas""\ny salto";"-1,20"\r\n',
  );
  assert.equal(p.rows[0][1], 'Texto; con "comillas"\ny salto');
  assert.throws(() => parseCSV('a,b\n"sin cerrar,b'));
  assert.throws(() => parseCSV("a,a\n1,2"));
  assert.throws(() => parseCSV("a,b\n1,2,3"));
});
test("importación rechaza filas inválidas y sentido incorrecto", () => {
  const p = previewImport(
    parseCSV(csv.replace("2027-01-15,2027-01-15", "2027-02-30,2027-02-30")),
    mapping,
    "asc",
  );
  assert.equal(p.errors.length, 1);
  assert.equal(p.errors[0].line, 4);
  assert.ok(previewImport(parseCSV(csv), mapping, "desc").errors.length);
});
test("orden intradía, saldos iniciales y continuidad", () => {
  const r = reconcile(imported());
  assert.equal(r.opening, 10000);
  assert.equal(r.balance, 17000);
  assert.ok(r.verified);
  assert.equal(r.errors.length, 0);
  const bad = imported();
  bad[1].balance += 1;
  assert.equal(reconcile(bad).errors.length, 1);
  assert.equal(reconcile(bad).verified, false);
});
test("sin saldo posterior no se inventa saldo inicial ni disponibilidad", () => {
  const ts = imported().map((t) => ({ ...t, balance: null }));
  assert.equal(reconcile(ts).balance, null);
  assert.equal(reconcile(ts).verified, false);
  assert.throws(() =>
    moveFunds(
      { ...initialState(), transactions: ts },
      {
        from: "unclassified",
        to: "personal",
        amount: 1,
        date: "2027-01-15",
        note: "test",
      },
    ),
  );
  const partial = imported();
  partial.at(-1).balance = null;
  assert.equal(reconcile(partial).verified, false);
});
test("duplicados exactos se omiten sin borrar operaciones legítimas repetidas", () => {
  const p = previewImport(parseCSV(csv), mapping, "asc", imported());
  assert.equal(p.transactions.length, 0);
  assert.equal(p.duplicates.length, 3);
  const twice =
    "fecha,fecha_valor,concepto,importe_eur,saldo_eur\n2027-01-01,2027-01-01,TRASPASO PROPIO,-10,90\n2027-01-01,2027-01-01,TRASPASO PROPIO,-10,80";
  assert.equal(
    previewImport(parseCSV(twice), mapping, "asc").transactions.length,
    2,
  );
});
test("fondos explícitos, retirada y transferencia preservan la identidad contable", () => {
  let s = base();
  assert.equal(position(s).personal, 0);
  assert.equal(position(s).amortization, 0);
  s = moveFunds(s, {
    from: "unclassified",
    to: "amortization",
    amount: 5000,
    date: "2027-01-15",
    note: "Aportación confirmada",
  });
  s = moveFunds(s, {
    from: "amortization",
    to: "personal",
    amount: 1000,
    date: "2027-01-15",
    note: "Reasignación",
  });
  s = moveFunds(s, {
    from: "personal",
    to: "unclassified",
    amount: 500,
    date: "2027-01-15",
    note: "Retirada",
  });
  const p = position(s);
  assert.equal(p.amortization, 4000);
  assert.equal(p.personal, 500);
  assert.equal(
    p.unclassified + p.amortization + p.personal + p.committed,
    p.bank.balance,
  );
  assert.equal(s.ledger.length, 3);
  assert.equal(p.bank.balance, 17000);
  assert.throws(() =>
    moveFunds(s, {
      from: "unclassified",
      to: "personal",
      amount: 999999,
      date: "2027-01-15",
      note: "Imposible",
    }),
  );
  assert.throws(() =>
    moveFunds(s, {
      from: "amortization",
      to: "personal",
      amount: 4001,
      date: "2027-01-15",
      note: "Imposible",
    }),
  );
  assert.throws(() =>
    moveFunds(s, {
      from: "unclassified",
      to: "personal",
      amount: 0,
      date: "2027-01-15",
      note: "cero",
    }),
  );
});
test("reservas no crean cargos; al vincular un pago se evita doble cómputo", () => {
  let s = addCommitment(base(), {
    description: "Pendiente",
    amount: 1000,
    date: "2027-01-14",
    half: 2,
  });
  assert.equal(position(s).committed, 1000);
  assert.equal(position(s).bank.balance, 17000);
  s = settleCommitment(s, s.commitments[0].id, s.transactions[1].id);
  assert.equal(position(s).committed, 0);
  assert.equal(position(s).bank.balance, 17000);
  assert.throws(() =>
    settleCommitment(s, s.commitments[0].id, s.transactions[1].id),
  );
  assert.throws(() =>
    addCommitment(s, {
      description: "Imposible",
      amount: 18000,
      date: "2027-01-14",
      half: 2,
    }),
  );
});
test("nuevos cargos pueden causar déficit: se alerta y se permite liberar reservas", () => {
  let s = moveFunds(base(), {
    from: "unclassified",
    to: "amortization",
    amount: 17000,
    date: "2027-01-15",
    note: "Reserva",
  });
  s = {
    ...s,
    transactions: [
      ...s.transactions,
      {
        ...s.transactions[1],
        id: "new",
        date: "2027-01-16",
        amount: -1000,
        balance: 16000,
      },
    ],
  };
  assert.equal(position(s).unclassified, -1000);
  s = moveFunds(s, {
    from: "amortization",
    to: "unclassified",
    amount: 500,
    date: "2027-01-16",
    note: "Liberación parcial",
  });
  assert.equal(position(s).unclassified, -500);
});
test("quincenas separan traspasos de gasto final y no desplazan fecha bancaria", () => {
  const s = base(),
    summary = monthSummary(s, "2027-01", 2);
  assert.equal(summary.income, 10000);
  assert.equal(summary.transfers, 2000);
  assert.equal(summary.out, 1000);
  assert.equal(summary.margin, 7000);
  s.transactions[0].budget = { month: "2027-02", half: 1 };
  assert.equal(s.transactions[0].date, "2027-01-14");
  assert.equal(monthSummary(s, "2027-02", 1).income, 10000);
});
test("objetivos no crean fondos y no se prolongan automáticamente tras carencia", () => {
  const s = base();
  assert.equal(goalProgress(s, "2026-08").target, 41571);
  assert.equal(goalProgress(s, "2026-09").targetTotal, 83142);
  assert.equal(goalProgress(s, "2026-09").cumulative, 0);
  assert.equal(goalProgress(s, "2028-02").target, null);
  assert.equal(goalProgress(s, "2028-03").targetTotal, null);
  s.futureTarget = 10000;
  assert.equal(goalProgress(s, "2028-02").target, 10000);
});
test("copias JSON restauran datos, detectan corrupción y no aceptan apuntes falsos", () => {
  let s = moveFunds(base(), {
    from: "unclassified",
    to: "personal",
    amount: 1234,
    date: "2027-01-15",
    note: "Confirmado",
  });
  assert.deepEqual(restoreBackup(JSON.stringify(s)), s);
  for (const invalid of ["{}", "null", "{", '{"version":2}'])
    assert.throws(() => restoreBackup(invalid));
  const invalid = structuredClone(s);
  invalid.ledger[0].personal = 90000;
  assert.throws(() => restoreBackup(JSON.stringify(invalid)));
  const badAmount = structuredClone(s);
  badAmount.transactions[0].amount = 0.1;
  assert.throws(() => restoreBackup(JSON.stringify(badAmount)));
});
test("CSV exportado conserva importes exactos y neutraliza fórmulas de hoja de cálculo", () => {
  const s = base();
  s.transactions[0].description = '=HYPERLINK("example")';
  const out = exportCSV(s);
  assert.ok(out.includes("'=HYPERLINK"));
  const parsed = parseCSV(out);
  assert.equal(parsed.rows[0][3], "100.00");
});
const privatePath = new URL("../.local/historico.csv", import.meta.url);
test(
  "histórico privado: conciliación completa, duplicados y nóminas según banco",
  { skip: !existsSync(privatePath) },
  () => {
    const text = readFileSync(privatePath, "utf8");
    const p = previewImport(parseCSV(text), mapping, "desc");
    assert.equal(p.errors.length, 0);
    assert.equal(p.duplicates.length, 0);
    assert.ok(p.transactions.length > 0);
    const r = reconcile(p.transactions);
    assert.ok(r.verified);
    assert.equal(r.errors.length, 0);
    assert.equal(r.checkpoint.difference, 0);
    assert.equal(
      r.opening + p.transactions.reduce((s, t) => s + t.amount, 0),
      r.balance,
    );
    assert.equal(
      previewImport(parseCSV(text), mapping, "desc", p.transactions)
        .transactions.length,
      0,
    );
    const latePayroll = p.transactions.filter(
      (t) => t.category === "Nómina" && Number(t.date.slice(8)) > 20,
    );
    for (const t of latePayroll) {
      assert.equal(t.budget.half, 1);
      assert.notEqual(t.budget.month, t.date.slice(0, 7));
    }
  },
);
