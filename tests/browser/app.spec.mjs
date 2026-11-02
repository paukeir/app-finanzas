import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const sample =
  "fecha,fecha_valor,concepto,importe_eur,saldo_eur\n2027-01-15,2027-01-15,TRASPASO PROPIO,-20,170\n2027-01-14,2027-01-14,Recibo,-10,190\n2027-01-14,2027-01-14,NÓMINA,100,200";
async function openImport(page) {
  await page
    .getByRole("button", { name: "＋ Importar CSV", exact: true })
    .click();
}
async function preview(page, text) {
  await openImport(page);
  await page.locator("#csv-file").setInputFiles({
    name: "prueba-sintetica.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(text),
  });
  await page.getByRole("button", { name: "Generar vista previa" }).click();
}
async function importSample(page) {
  await preview(page, sample);
  await page
    .getByRole("button", { name: "Confirmar importación de 3 movimientos" })
    .click();
}
test("importar, reservar, impedir sobregiro, persistir y exportar", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto("/");
  await expect(
    page.getByText("Tu historia financiera empieza aquí"),
  ).toBeVisible();
  await preview(page, sample);
  await expect(page.getByText("3 nuevos", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toBeVisible();
  // Preview is not committed until confirmation.
  expect(
    await page.evaluate(() => localStorage.getItem("clara.finanzas.v1")),
  ).toBeNull();
  await page
    .getByRole("button", { name: "Confirmar importación de 3 movimientos" })
    .click();
  await expect(page.locator(".hero-money")).toContainText("170,00");
  await page
    .getByRole("button", { name: "Fondos de ahorro", exact: true })
    .click();
  const fund = page.locator("#fund-form");
  await fund.locator("[name=amount]").fill("50");
  await fund.locator("[name=note]").fill("Reserva de prueba");
  await fund.getByRole("button").click();
  await expect(
    page.getByText("Movimiento de fondos registrado.", { exact: false }),
  ).toBeVisible();
  await fund.locator("[name=amount]").fill("200");
  await fund.locator("[name=note]").fill("Sobregiro de prueba");
  await fund.getByRole("button").click();
  await expect(page.getByRole("status")).toContainText(
    "Saldo de origen insuficiente",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Fondos de ahorro", exact: true })
    .click();
  await expect(page.locator(".metric").first().locator("strong")).toContainText(
    "50,00",
  );
  await page.getByRole("button", { name: "Añadir compromiso" }).click();
  const commitment = page.locator("#commitment-form");
  await commitment.locator("[name=description]").fill("Recibo prueba");
  await commitment.locator("[name=amount]").fill("10");
  await commitment.locator("[name=date]").fill("2027-01-14");
  await commitment.getByRole("button").click();
  await page
    .getByRole("button", { name: "Vincular cargo", exact: true })
    .click();
  await page
    .locator("#settle-form select")
    .selectOption({ label: "2027-01-14 · Recibo · -10,00 €" });
  await page
    .getByRole("button", { name: "Confirmar pago y liberar reserva" })
    .click();
  await expect(
    page.getByText("Pagado y vinculado", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Configuración", exact: true })
    .click();
  const dl = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Descargar copia completa JSON" })
    .click();
  const download = await dl;
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});
test("duplicados, edición de presupuesto y restauración con confirmación", async ({
  page,
}) => {
  await page.goto("/");
  await importSample(page);
  await preview(page, sample);
  await expect(
    page.getByText("3 duplicados omitidos", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Confirmar importación de 0 movimientos",
    }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Cerrar diálogo" }).click();
  await page.getByRole("button", { name: "Movimientos", exact: true }).click();
  await page
    .locator("tbody tr")
    .filter({ hasText: "NÓMINA" })
    .getByRole("button", { name: "Editar", exact: true })
    .click();
  await page.locator("#edit-form [name=month]").fill("2027-02");
  await page.getByRole("button", { name: "Guardar revisión" }).click();
  let copy = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("clara.finanzas.v1")),
  );
  expect(copy.transactions[0].date).toBe("2027-01-14");
  expect(copy.transactions[0].budget.month).toBe("2027-02");
  await page
    .getByRole("button", { name: "Configuración", exact: true })
    .click();
  copy.target = 12345;
  await page.locator("#backup-file").setInputFiles({
    name: "copia.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(copy)),
  });
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("clara.finanzas.v1")).target,
    ),
  ).toBe(41571);
  await page.getByRole("button", { name: "Confirmar sustitución" }).click();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("clara.finanzas.v1")).target,
    ),
  ).toBe(12345);
});
test("errores de CSV y conceptos HTML se presentan como texto", async ({
  page,
}) => {
  await page.goto("/");
  await preview(
    page,
    sample
      .replace("Recibo", "<img src=x onerror=alert(1)>")
      .replace("-10,190", "-10,195"),
  );
  await expect(
    page.getByRole("button", {
      name: "Confirmar importación de 3 movimientos",
    }),
  ).toBeDisabled();
  await expect(page.locator(".import-preview img")).toHaveCount(0);
  await expect(page.locator(".import-preview")).toContainText(
    "<img src=x onerror=alert(1)>",
  );
});
const privateFile = fileURLToPath(
  new URL("../../.local/historico.csv", import.meta.url),
);
test("histórico real privado: importación funcional y navegación completa", async ({
  page,
}) => {
  test.skip(
    !existsSync(privateFile),
    "CSV privado no disponible en este checkout",
  );
  await page.goto("/");
  await openImport(page);
  await page.locator("#csv-file").setInputFiles(privateFile);
  await page.getByRole("button", { name: "Generar vista previa" }).click();
  await expect(
    page.getByText("Saldos coherentes", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Confirmar importación de \d+ movimientos/ })
    .click();
  await expect(
    page.getByText("Saldos conciliados", { exact: true }),
  ).toBeVisible();
  for (const name of [
    "Seguimiento mensual",
    "Movimientos",
    "Conciliación",
    "Fondos de ahorro",
    "Préstamos",
    "Configuración",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.locator("h1")).toBeVisible();
  }
});
