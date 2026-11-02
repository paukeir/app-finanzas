# Clara · Finanzas personales

Aplicación web privada, en español, para llevar una cuenta principal, quincenas presupuestarias, conciliación y fondos virtuales. MVP sin conexión bancaria y sin servicios externos. No contiene datos financieros de ejemplo ni incluye el CSV privado en Git.

## Acceder desde móvil y ordenador

La web está preparada para GitHub Pages en `https://paukeir.github.io/app-finanzas/`. El workflow `.github/workflows/pages.yml` publica automáticamente los cambios de `main`, tras comprobar la sintaxis y las pruebas. La URL solo estará disponible cuando GitHub haya completado el despliegue.

Si GitHub no permite habilitar Pages desde el workflow, el propietario debe seleccionar **Settings → Pages → Build and deployment → Source: GitHub Actions** y repetir el workflow **Publicar Finanzas en GitHub Pages** desde Actions. No se necesita otro proveedor ni ejecutar comandos en el móvil.

La publicación contiene exclusivamente HTML, CSS y JavaScript de `dist/`; nunca incluye el histórico, `.local`, copias, capturas, adjuntos ni dependencias de desarrollo. `npm run build` genera esa carpeta a partir de una lista explícita de archivos. Las rutas relativas permiten servirla dentro de `/app-finanzas/`.

**El enlace permite abrir la app en ambos dispositivos; los datos no se sincronizan automáticamente.** Se almacenan en cada navegador. Para continuar con el mismo histórico, exporta una copia JSON y restáurala en el otro dispositivo. Los dos dispositivos pueden divergir: la restauración sustituye los datos, no fusiona cambios. La sincronización automática requeriría una ampliación con almacenamiento y acceso privado; no está implementada.

## Ejecutar

Requiere **Node.js 24 LTS** (mínimo 22.7) y npm. La aplicación no necesita dependencias de ejecución; las dependencias de desarrollo son para probarla.

```sh
cd /workspace/app-finanzas   # o la carpeta donde hayas clonado el proyecto
npm ci --ignore-scripts
npm start
```

Abre `http://127.0.0.1:5173` en tu propio ordenador. El servidor escucha exclusivamente en loopback. En el entorno de onboarding se usa para comprobaciones internas; no se ofrece una vista previa pública. Para abrirla en un móvil u otro ordenador sin ejecutar el servidor, utiliza la publicación de GitHub Pages descrita arriba. El código de la web es público; los datos importados permanecen en cada navegador y no se incluyen en la publicación. El diseño se prueba en viewport de iPhone con Chromium, no en un dispositivo Safari real.

La app y los datos funcionan sin Internet una vez iniciado el servidor. No hay service worker: para abrir o recargar la página, el servidor debe seguir en ejecución. No abras `index.html` directamente con `file://`.

## Primera importación del histórico

1. Pulsa **Importar CSV** y selecciona el CSV original.
2. Asigna `fecha`, `fecha_valor`, `concepto`, `importe_eur` y `saldo_eur`. Se detectan los nombres del extracto adjunto. Fecha valor y saldo posterior son opcionales; sin todos los saldos no se confirma la conciliación ni se permite reservar fondos.
3. Para el archivo adjunto, selecciona **Más reciente primero**. Se invierten las filas completas, conservando la secuencia intradía del banco. No se ordena por concepto o importe.
4. Pulsa **Generar vista previa**. Comprueba filas nuevas, duplicados, errores, saldo inicial inferido y saldo final. Un descuadre o una discrepancia con el punto de control impide confirmar; corrige el archivo o la asignación de columnas, sin alterar los importes para forzar una coincidencia.
5. Pulsa **Confirmar importación**. Antes de esto no se persiste ningún movimiento.

En esta máquina, la copia original está en `.local/historico.csv`, fuera del control de versiones. Puedes iniciar `npm run start:private` y elegir **Abrir histórico local privado** en el importador. Esa opción habilita un endpoint local explícito para ese archivo; `npm start` no lo expone. No compartas la carpeta `.local`, el perfil del navegador, copias de seguridad ni una instantánea con datos privados con otras personas.

Se admiten CSV UTF-8 con BOM, coma o punto y coma, campos entrecomillados y saltos de línea dentro de campos. Las fechas deben estar en `AAAA-MM-DD`. Importes con punto decimal o coma decimal (entrecomillada si el separador es una coma). Límite: 5 MB. No se admiten hojas Excel directamente.

Los duplicados exactos se identifican por fecha bancaria, fecha valor, concepto, importe y saldo. Movimientos repetidos con distinto saldo se conservan. Si faltan saldos y dos operaciones reales son idénticas, no pueden distinguirse automáticamente: revisa el extracto antes de importar. En importaciones solapadas, revisa especialmente operaciones del mismo día; no se inventa un orden para hacerlas cuadrar.

## Uso

- **Inicio:** saldo al último movimiento importado, reservas de fondos, compromisos y saldo sin clasificar. El saldo no se actualiza por sí solo. Sin clasificar no significa dinero disponible para gastar: puede haber obligaciones no confirmadas.
- **Seguimiento mensual:** selecciona un mes arriba. Q1 cubre días 1–13 y Q2 el 14–cierre. La nómina de fin de mes se asigna al mes siguiente/Q1 y la de mediados a Q2. La referencia de penúltimo hábil considera lunes a viernes; no incluye festivos. Las fechas e importes reales se conservan. Las fechas atípicas se revisan manualmente.
- **Movimientos:** filtra y edita categoría, fecha bancaria y quincena/mes presupuestario. Cambiar la quincena no cambia la fecha bancaria. Cambiar la fecha bancaria recalcula conciliación. Los importes y saldos originales no se editan en este MVP.
- **Conciliación:** comprueba continuidad, saldo inferido anterior al primer movimiento, saldo de inicio de seguimiento y registro de importaciones. El saldo inicial se infiere de `saldo posterior − movimiento`; no es un saldo verificado de forma independiente. El punto de control del 2 de noviembre es histórico. La coherencia del CSV no demuestra que contenga todos los movimientos.
- **Fondos de ahorro:** asigna, retira o transfiere fondos con fecha y motivo. No se crean cargos bancarios. Las asignaciones que superan el efectivo después de compromisos se rechazan. Nuevos cargos pueden dejar reservas excesivas: se muestra un déficit y puedes liberar fondos con un movimiento de retirada. El libro de fondos conserva cada operación; corrige mediante operaciones compensatorias.
- **Compromisos:** registra solo recibos que confirmes pendientes. En el calendario, las previsiones sirven de referencia y nunca se reservan automáticamente. Al pagarse, vincula un cargo real para liberar la reserva y no contarlo dos veces. Si difiere del previsto, manda el importe bancario; se libera la reserva completa. Un cargo solo puede vincularse una vez.
- **Préstamos:** muestra las cuotas de referencia antes y después de febrero de 2028 y prioridad B. El objetivo inicial de reserva es 415,71 €/mes, editable en Configuración. No se añade dinero por cumplir un objetivo. Desde febrero de 2028 el objetivo queda sin confirmar hasta que lo configures.

El ahorro personal inicial es desconocido. Un saldo asignado de cero significa que no has confirmado reservas, no que tu ahorro real sea cero. MYBOX y otros conceptos ambiguos quedan pendientes: confirma si corresponden a seguro, jubilación/ahorro externo u otra categoría. Los traspasos propios se separan del consumo final: se observa la salida de la principal, pero no el uso del dinero en la cuenta destino. Los retornos positivos se muestran aparte.

### Alcance del MVP

Incluye las pantallas principales, previsiones de referencia revisables al crear cada compromiso y objetivos editables. No incluye todavía editor permanente de recurrencias, festivos, reglas automáticas configurables, registro específico de amortizaciones de capital, simulador de intereses, sincronización entre dispositivos ni autenticación. Las cuotas de referencia son configuración del dominio; para cambiarlas permanentemente se ampliará el editor de préstamos. Comunidades y garajes no tienen periodicidad inventada. No se calculan intereses ni calendarios sin TAE/TIN, capital pendiente, plazo, comisiones y modalidad.

## Copias de seguridad y restauración

En **Configuración → Descargar copia completa JSON** se exportan movimientos, asignaciones presupuestarias, categorías, libro de fondos, compromisos, objetivos e historial de importaciones. Descárgala con regularidad y guárdala en una ubicación privada. No está cifrada.

Para restaurar, selecciona la copia JSON. Se valida su estructura y se muestra un resumen; **Confirmar sustitución** reemplaza los datos locales. Exporta antes los actuales para conservarlos. No se fusionan copias automáticamente. Si el almacenamiento está corrupto, la app impide sobrescribirlo: usa **Descargar almacenamiento original** antes de restaurar una copia válida.

**Exportar movimientos CSV** exporta importes exactos, categoría y asignación presupuestaria para revisión externa; neutraliza fórmulas en textos de hoja de cálculo. No es una copia completa: la importación bancaria recalcula sugerencias y no restaura fondos, categorías revisadas ni asignaciones manuales. Usa JSON para restaurar sin pérdidas.

Los datos se guardan en `localStorage`, solo en este navegador y origen (protocolo, host y puerto). No hay cifrado ni contraseña. Usa un perfil privado y bloqueo del equipo. La navegación privada o borrar datos del sitio puede eliminarlos. No uses el servidor de desarrollo como servicio público. Una copia JSON o CSV contiene información financiera sensible.

## Pruebas

```sh
npm run check
npm test
# Para los recorridos en navegador:
npx playwright install chromium
npm run test:e2e
```

Si Chromium ya está instalado en `/usr/bin/chromium`, las pruebas lo reutilizan. En otro directorio, establece `CHROMIUM_PATH`. Los navegadores descargados por Playwright son solo necesarios para pruebas; no para usar la aplicación.

Las pruebas unitarias cubren importes exactos, fechas, quincenas, nóminas, CSV, duplicados, conciliación, reservas, pagos, déficit, transferencias entre fondos, objetivos y copias. Las de navegador comprueban importación con confirmación, rechazo de descuadres, persistencia, filtros/edición, asignaciones, bloqueo de sobregiro, vinculación de recibos, exportación y restauración en escritorio y viewport móvil.

Los datos de las pruebas públicas son **sintéticos exclusivamente para las pruebas**, nunca se cargan en la aplicación. Si existe `.local/historico.csv`, también se ejecuta una comprobación privada del histórico real y su importación en ambos tamaños. En otros checkouts esas pruebas privadas quedan marcadas como omitidas. No se guardan capturas ni trazas de datos reales en Git.

La aplicación usa módulos JavaScript nativos y CSS. `npm run build` prepara una publicación estática en `dist/` sin copiar datos privados. La lógica monetaria opera en céntimos enteros; la división por 100 se usa solo para presentar importes. El servidor utiliza únicamente la biblioteca estándar de Node.js y una lista explícita de archivos públicos.

## Estructura

- `src/core.js`: importación, fechas, conciliación, saldos, fondos, objetivos y validación de copias.
- `src/app.js`: interfaz en español, persistencia y acciones.
- `src/style.css`: diseño responsive.
- `server.mjs`: servidor local con CSP, lista de rutas permitidas y endpoint privado opcional.
- `tests/`: pruebas unitarias y de navegador.
- `.local/`: datos locales ignorados; nunca deben publicarse.

Cada tarea en la nube ya está aislada. Reutiliza este checkout; no crees worktrees adicionales salvo petición expresa.
