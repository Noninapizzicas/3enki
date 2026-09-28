---
name: recibo-nomina
description: >
  Skill FULL del módulo REFLEJO `recibo-nomina` de la vertical contabilidad de Enki
  (G1/G2/G3/G6/G8/G9/G10, hoja del plan). DEL RECIBO AL ASIENTO EQUILIBRADO Y EXPLICABLE.
  Cero juicio: el sistema NO calcula nómina por defecto — la RECIBE hecha por el puerto
  (puerto-nomina G4, por EVENTO contabilidad.nomina.recibir.request) y al recibo recibido
  le da FORMA ASENTABLE (G1). Sobre esa forma: calcula la obligación con la TGSS con TIPOS
  DE COTIZACIÓN DECLARABLES (cambian cada año), construye el asiento equilibrado (debe =
  haber, verificado antes de pedirlo), desglosa bruto/retención/cotización/neto,
  imputa anticipos, dietas, especie, pagas extra y finiquitos, y liquida la baja exigiendo
  SALDO CERO (una cuenta de empleado sin cerrar es un ERROR DE ESTADO). El asiento lo
  escribe el diario (B2), aquí solo se PIDE por EVENTO con rol ADMISION. Sin tipos y sin
  importes → 422 TIPOS_NO_DECLARADOS. Sin estado. Úsala para operar, depurar o extender el
  reflejo, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites procesar una nómina (RPC contabilidad.nomina.procesar.request),
    desglosarla (contabilidad.nomina.desglosar.request) o liquidar la baja de un empleado
    (contabilidad.nomina.liquidar.request).
  - Cuando depures por qué no se forma la nómina (503 DEPENDENCIA_NO_DISPONIBLE si no hay
    recibo ni puerto-nomina, 422 TIPOS_NO_DECLARADOS si falta un importe y no hay tipos, 409
    DESCUADRE si el asiento no cuadra, 400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), la petición del
    asiento al diario por EVENTO y por qué el sistema no se inventa los porcentajes.
  - Cuando vayas a escribir/ampliar el test unitario del reflejo recibo-nomina.
tags: [enki, modulo, reflejo, contabilidad, recibo-nomina, nomina, declarable, determinista]
---

# recibo-nomina — REFLEJO del recibo al asiento equilibrado y explicable

## Qué hace el módulo

`recibo-nomina` es un **REFLEJO STATELESS** (G1/G2/G3/G6/G8/G9/G10, hoja del plan): **DEL
RECIBO AL ASIENTO EQUILIBRADO Y EXPLICABLE**. **Cero juicio**: el sistema **NO calcula
nómina por defecto** — la **RECIBE hecha** por el puerto (`puerto-nomina` G4, por **EVENTO**
`contabilidad.nomina.recibir.request`) y al recibo recibido le da **FORMA ASENTABLE** (G1
`_admitir`).

Sobre esa forma:

- **G2** `_calcularObligacion(recibo)` → `Obligacion { gasto_empresa, obligacion_tgss }`
  (**TIPOS DE COTIZACIÓN DECLARABLES** — cambian cada año — por payload o por **EVENTO**
  `contabilidad.criterio.leer.request` criterio `G2`; **NO se cablean**);
- **G3** `_construirAsiento(recibo)` → `AsientoEquilibrado { apuntes, debe, haber, cuadra }`
  (**debe = haber, verificado ANTES de pedir el asiento**: un descuadre → **`409
  DESCUADRE`**);
- **G6** `_desglosar(recibo)` → `Lineas { bruto, retencion, cotizacion_trabajador, neto,
  faltantes, explicable }` (nómina **EXPLICABLE**, no un número pelado);
- **G8** `_aplicarAnticipo(empleado, recibo)` → `NetoAjustado` (anticipos y adelantos
  impactan el neto);
- **G9** `_imputarConcepto(concepto, recibo)` → `List<Apunte>` (dietas, retribución en
  especie, pagas extra, finiquitos e indemnizaciones; concepto no declarado → apuntes
  vacíos, **no se inventa la cuenta**);
- **G10** `_liquidar(empleado)` → `AsientoCierre + SaldoCero` (cierra la cuenta del
  trabajador; **UNA CUENTA DE EMPLEADO SIN CERRAR ES UN ERROR DE ESTADO**, no un saldo
  válido: `saldo_cero:false` → `error_de_estado:true`).

Los importes que el recibo **YA trae** (bruto, retención, cotización) se **RESPETAN** — no
se re-estiman; cuando hay que **CALCULAR** un importe y los tipos **NO están declarados** →
**`422 TIPOS_NO_DECLARADOS`** (el sistema **NO se inventa el porcentaje**).

El **ASIENTO no lo escribe este módulo**: se **PIDE** al diario (`escritor-diario` B2) por
**EVENTO** `contabilidad.asiento.asentar.request` con rol **`ADMISION`** — dependencia por
**EVENTO, NUNCA por `require` cruzado**. Es **stateless**: sin PosPersistencia ni
`project.activated`; cada op **entra objeto, sale objeto**. **Fire-and-forget**:
`contabilidad.nomina_recibida` (G4) → procesa el recibo y publica
`contabilidad.nomina_formada`.

> **NO REUTILIZA**: no existe módulo de nómina en el inventario; el asiento de personal y su
> desglose son propios.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.nomina.procesar.request` | `onProcesarRequest` | RPC reflejo: {project_id, recibo?, tipos?, cuentas?, clave_natural?} → {project_id, recibo_formado, lineas:{bruto, retencion, cotizacion_trabajador, neto}, obligacion:{gasto_empresa, obligacion_tgss}, neto_ajustado, asiento:{apuntes, debe, haber, cuadra}, peticion_asiento_enviada, asiento_asentado, tipos_cableados:false}. Admitir (G1) → obligacion (G2) → desglose (G6) → asiento (G3) → PETICION al diario (B2) por EVENTO con rol ADMISION. Los tipos son DECLARABLES; sin tipos y sin importes en el recibo → 422 TIPOS_NO_DECLARADOS; sin recibo ni puerto-nomina (G4) → 503. Exito publica contabilidad.nomina_formada y responde por contabilidad.nomina.procesar.response; error → contabilidad.nomina.procesar.failed. |
| `contabilidad.nomina.desglosar.request` | `onDesglosarRequest` | RPC reflejo: {project_id, recibo?, tipos?, cuentas?} → {project_id, empleado, periodo, lineas:{bruto, retencion, cotizacion_trabajador, neto, faltantes, explicable}, obligacion, neto_ajustado, tipos_fuente}. Hace la nomina EXPLICABLE (G6/G8), no un numero pelado. Proyeccion PURA de lectura. Responde por contabilidad.nomina.desglosar.response; sin recibo ni puerto-nomina (G4) → contabilidad.nomina.desglosar.failed. |
| `contabilidad.nomina.liquidar.request` | `onLiquidarRequest` | RPC reflejo: {project_id, recibo?, tipos?, cuentas?, finiquito?, indemnizacion?, clave_natural?} → {project_id, empleado, asiento_cierre:{apuntes, debe, haber, cuadra, saldo_trabajador, saldo_cero}, saldo_cero, una_cuenta_de_empleado_sin_cerrar_es_un_error_de_estado:true}. Cierra la cuenta del trabajador con su finiquito/indemnizacion (G10): el saldo de la cuenta de empleado debe quedar a CERO. El asiento de cierre se PIDE al diario (B2). Exito publica contabilidad.nomina_formada y responde por contabilidad.nomina.liquidar.response; sin recibo → 503; sin tipos y sin importes → 422 TIPOS_NO_DECLARADOS. |
| `contabilidad.nomina_recibida` | `onNominaRecibida` | Fire-and-forget (G4 → G1): puerto-nomina recibio un recibo → se le da forma asentable y se procesa (admitir → obligacion → desglose → asiento → PETICION al diario B2). Exito publica contabilidad.nomina_formada; error → contabilidad.nomina.procesar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.nomina_formada` | Fire-and-forget (G1/G3/G10): una nomina quedo FORMADA y EXPLICABLE (recibo formado + desglose + obligacion + asiento equilibrado) → {project_id, recibo_formado, lineas, obligacion, asiento, asiento_asentado}. Lo consumen el cuadro de mando y el flujo de personal. |
| `contabilidad.asiento.asentar.request` | Peticion al diario (B2): el asiento de nomina/cotizacion (equilibrado y verificado) se PIDE a escritor-diario por EVENTO con rol ADMISION — el unico escritor del diario. Dependencia por EVENTO, NUNCA require cruzado. Si el diario no responde, se DECLARA (diario_respondio:false): no se asume asentado. |
| `contabilidad.nomina.procesar.failed` | Par de fallo determinista: procesar sin project_id/empleado, sin recibo ni puerto-nomina (G4) (503), sin tipos ni importes en el recibo (422 TIPOS_NO_DECLARADOS) o asiento descuadrado (409 DESCUADRE). Cierra el circulo de contabilidad.nomina.procesar.request. |
| `contabilidad.nomina.desglosar.failed` | Par de fallo determinista: desglosar sin project_id, o sin recibo ni puerto-nomina (G4) (503). Cierra el circulo de contabilidad.nomina.desglosar.request. |
| `contabilidad.nomina.liquidar.failed` | Par de fallo determinista: liquidar la baja sin project_id, sin recibo ni puerto-nomina (G4) (503), o sin tipos ni importes (422 TIPOS_NO_DECLARADOS). Cierra el circulo de contabilidad.nomina.liquidar.request. |
| `contabilidad.nomina_formada.failed` | Par de fallo del evento de dominio contabilidad.nomina_formada: la emision del hecho de dominio no se completo. |
| `contabilidad.asiento.asentar.failed` | Par de fallo determinista: el diario (B2) no pudo asentar el asiento de nomina (descuadre, clave duplicada, diario no disponible). Cierra el circulo de la peticion contabilidad.asiento.asentar.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.nomina.procesar.failed` cierra `contabilidad.nomina.procesar.request`;
> `contabilidad.nomina.desglosar.failed` cierra `contabilidad.nomina.desglosar.request`;
> `contabilidad.nomina.liquidar.failed` cierra `contabilidad.nomina.liquidar.request`.
> Y la **petición** al diario (`contabilidad.asiento.asentar.request`) se cierra con
> `contabilidad.asiento.asentar.failed`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.nomina.procesar.response`, `contabilidad.nomina.desglosar.response` y
> `contabilidad.nomina.liquidar.response` (los pares response de los RPC); **NO están
> declaradas en `publishes`**.

> Nota: declarado en module.json pero NO emitido por index.js (patrón de la vertical: el
> par de fallo real es `<op>.failed`) — `contabilidad.nomina_formada.failed` es el par de
> fallo del evento de DOMINIO; el reflejo solo publica los pares `*.failed` de sus RPC.

> Nota: `contabilidad.asiento.asentar.request` está declarado como **publisher** (es una
> **petición** al diario B2 por EVENTO, no un evento propio); su par de fallo
> `contabilidad.asiento.asentar.failed` también está declarado — pero el único escritor de
> ese par es el **diario (B2)**, no este módulo.

> Nota: no está en module.json pero sí lo emite index.js — el módulo publica por `_rpc`
> `contabilidad.nomina.recibir.request` (puerto-nomina G4) y
> `contabilidad.criterio.leer.request` (cola-declaraciones-criterio G2); dependencias por
> EVENTO no declaradas como publishers.

## Reglas de negocio

1. **CERO JUICIO (G1)**: `_admitir(recibo)` da forma asentable al recibo que **llega
   hecho** — `{ esquema:'recibo-nomina-formado-v1', empleado, periodo, nif, origen, bruto,
   retencion, cotizacion_trabajador, cotizacion_empresa, neto, conceptos, anticipos, extra,
   cero_juicio:true, recibo_llega_hecho:true }`. Los importes se toman con `_num(...)`
   (varias claves toleradas: `bruto`/`total_devengado`/`devengado`,
   `retencion`/`retencion_irpf`/`irpf`, `cotizacion_trabajador`/`ss_trabajador`/
   `cotizacion`, `cotizacion_empresa`/`ss_empresa`, `neto`/`liquido`/`neto_a_pagar`).
   **El sistema admite, no calcula por defecto.**
2. **Los importes del recibo se RESPETAN; solo se CALCULA lo que falta**: `_desglosar` usa
   `bruto` del recibo; la `retencion` y la `cotizacion_trabajador` se toman del recibo si
   vienen (`fuente:'RECIBO'`); si **no** vienen y hay **tipo declarado**, se calculan
   (`fuente:'TIPO_DECLARADO'`: `bruto * retencion/100`, `base_cotizacion *
   cont_trabajador/100`). El `neto` se respeta si viene; si no y hay retención y cotización,
   `neto = brutoAjustado - retencion - cotTrab`.
3. **Lo que falta se DECLARA (EXPLICABLE)**: `lineas.faltantes` lista lo que no se pudo
   determinar (`retencion_irpf`, `cotizacion_trabajador`, `neto`); `explicable = faltantes
   === 0`. La nómina es **EXPLICABLE, no un número pelado**.
4. **SIN TIPOS Y SIN IMPORTES → 422 TIPOS_NO_DECLARADOS (la ley no se cablea)**: en
   `_procesar`, si `!lineas.explicable` o `obligacion.faltantes.length > 0` → **`422
   TIPOS_NO_DECLARADOS`** con `{ faltantes, dependencia:'cola-declaraciones-criterio (G2)',
   accion:'DECLARAR_TIPOS', tipos_cableados:false }` y el mensaje *«el sistema NO se inventa
   el porcentaje»*. Los **tipos de cotización cambian cada año**: son **DECLARABLES**.
5. **Los tipos se DECLARAN por payload o por EVENTO (G2)**: `_tiposDe` usa `input.tipos`
   (fuente `'PAYLOAD'`) o el EVENTO `contabilidad.criterio.leer.request` con `criterio:'G2'`
   (fuente `'COLA_DECLARACIONES_CRITERIO'`). `_porcentajes(tipos)` extrae
   `cont_trabajador`/`cont_empresa`/`retencion` (varias claves toleradas); si no hay
   ninguno → `null`.
6. **Cuentas DECLARABLES**: `_cuentasDe` fusiona `CUENTAS_POR_DEFECTO` (640 sueldos · 642
   cotización empresa · 641 indemnizaciones · 476 TGSS acreedor · 4751 HP acreedora
   retenciones IRPF · 465 remuneraciones pendientes de pago · 460 anticipos · 755 especie)
   con `input.cuentas`. Son el **valor declarable inicial, no ley cableada**.
7. **La obligación con la TGSS (G2)**: `_calcularObligacion` — `cotizacion_empresa` del
   recibo (`fuente:'RECIBO'`) o calculada (`base_cotizacion * cont_empresa/100`,
   `fuente:'TIPO_DECLARADO'`); `gasto_empresa = bruto + cotizacion_empresa`;
   `obligacion_tgss = cotizacion_empresa + cotizacion_trabajador` (o `null` si falta
   alguna). `faltantes` lista lo que falta.
8. **El asiento EQUILIBRADO (G3)**: `_construirAsiento` — al **DEBE**: `sueldos`
   (`lineas.bruto`), `cotizacion_empresa`, y los conceptos extra (G9); al **HABER**:
   `obligacion_tgss` (476), `retencion` (4751), `neto` (465). `cuadra = |debe - haber| <
   0.005`. El asiento lleva `no_borra:true` (invariante: nunca se borra).
9. **El asiento se verifica ANTES de pedirlo**: en `_procesar`, si `!asiento.cuadra` →
   **`409 DESCUADRE`** con `{ debe, haber, asentado:false }` — **no se pide un asiento que
   no cuadra**.
10. **EL ASIENTO LO ESCRIBE EL DIARIO (B2), aquí solo se PIDE**: `_procesar` publica por
    `_rpc` `contabilidad.asiento.asentar.request` con `rol:'ADMISION'`, `asiento:{ tipo:
    'NOMINA', origen:'NOMINA_G3', apuntes, hecho, periodo, clave_natural
    ('nomina:<empleado>:<periodo|sin-periodo>') }`, timeout 6000ms. La respuesta declara
    `peticion_asiento_enviada:true`, `diario_respondio` (si el diario respondió con 200 o
    409) y `asiento_asentado` (solo si 200). **Si el diario no responde, se DECLARA: no se
    asume asentado.**
11. **Conceptos extra (G9)**: `_imputarConcepto(concepto, cuentas)` — `DIETAS` → gasto 629
    (o `concepto.cuenta`) contra `remuneraciones` (no cotiza); `ESPECIE` → `sueldos` contra
    `especie` (755, o `concepto.cuenta_especie`); `PAGA_EXTRA` → `sueldos` (o
    `concepto.cuenta`) contra `remuneraciones`; `FINIQUITO`/`INDEMNIZACION` →
    `indemnizaciones` (641) contra `remuneraciones`. **Concepto no declarado → `[]` vacío y
    se DECLARA: NUNCA se inventa la cuenta.**
12. **Anticipos (G8)**: `_aplicarAnticipo(empleado, recibo, netoBase)` resta `Σ anticipos`
    (`a.importe` o `a` directo) al neto: `neto_ajustado = neto_base - total`. Devuelve
    `{ empleado, ant_anticipos, anticipos_aplicados, neto_base, neto_ajustado, determinista }`.
13. **LIQUIDAR EXIGE SALDO CERO (G10)**: `_liquidar` añade el `finiquito` (a `sueldos`
    contra `remuneraciones`) y la `indemnizacion` (a `indemnizaciones` contra
    `remuneraciones`) a los apuntes del asiento base; calcula `saldo_trabajador` = Σ sobre
    `cuentas.remuneraciones` de `haber - debe`; `saldo_cero = |saldo_trabajador| < 0.005`;
    `error_de_estado = !saldo_cero`. **UNA CUENTA DE EMPLEADO SIN CERRAR ES UN ERROR DE
    ESTADO, no un saldo válido.** El asiento de cierre se PIDE al diario (B2) igual que el
    de nómina (clave `baja:<empleado>:<periodo|sin-periodo>`).
14. **El recibo se LEE por EVENTO (TOLERANTE)**: `_reciboDe` acepta `recibo`/
    `hecho_nomina` del payload; si no, pide `contabilidad.nomina.recibir.request` a
    `puerto-nomina` (G4) (timeout 4000ms). Si no responde → **`503
    DEPENDENCIA_NO_DISPONIBLE`** (`{ dependencia:'puerto-nomina', accion:'NO_PROCESAR_PUBLICAR_FALLO' }`).
15. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`;
    recibo sin `empleado`/`id_empleado` → `400 INVALID_INPUT recibo.empleado`. Shape:
    `{ status:400, error:{ code:'INVALID_INPUT', message:'<campo> requerido', details:{
    field:<campo> } } }`.
16. **HTTP exacto**: éxito `200`; payload inválido → `400`; sin tipos/importes → `422`;
    asiento descuadrado → `409`; sin recibo ni puerto → `503`; excepción en `_atender` →
    `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.nomina.procesar.response`,
`contabilidad.nomina.desglosar.response` y `contabilidad.nomina.liquidar.response`.

### 1. `procesar` — del recibo al asiento equilibrado

```json
{
  "project_id": "e57a318a-...",
  "recibo": {
    "empleado": "E1",
    "nif": "12345678Z",
    "periodo": "2026-09",
    "bruto": 2000,
    "retencion": 300,
    "cotizacion_trabajador": 130,
    "cotizacion_empresa": 620,
    "neto": 1570,
    "anticipos": [ { "importe": 100 } ]
  },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "op": "procesar",
  "recibo_formado": { "esquema": "recibo-nomina-formado-v1", "empleado": "E1", "periodo": "2026-09", "bruto": 2000, "retencion": 300, "cotizacion_trabajador": 130, "cotizacion_empresa": 620, "neto": 1570, "anticipos": [ { "importe": 100 } ], "cero_juicio": true, "recibo_llega_hecho": true },
  "lineas": { "bruto": 2000, "retencion": 300, "retencion_fuente": "RECIBO", "cotizacion_trabajador": 130, "cotizacion_trabajador_fuente": "RECIBO", "neto": 1570, "base_cotizacion": 2000, "faltantes": [], "explicable": true, "nota": "nomina EXPLICABLE, no un numero pelado (requisito de informacion rica)" },
  "obligacion": { "gasto_empresa": 2620, "obligacion_tgss": 750, "cotizacion_empresa": 620, "cotizacion_empresa_fuente": "RECIBO", "cotizacion_trabajador": 130, "base_cotizacion": 2000, "faltantes": [], "tipos_declarados": true, "nota": "los tipos de cotizacion son DECLARABLES (cambian cada ano): no se cablean" },
  "neto_ajustado": { "empleado": "E1", "ant_anticipos": 1, "anticipos_aplicados": 100, "neto_base": 1570, "neto_ajustado": 1470, "determinista": true },
  "asiento": { "tipo": "NOMINA", "origen": "NOMINA_G3", "empleado": "E1", "periodo": "2026-09", "apuntes": [ { "cuenta": "640", "debe": 2000, "haber": 0, "concepto": "SUELDOS" }, { "cuenta": "642", "debe": 620, "haber": 0, "concepto": "COTIZACION_EMPRESA" }, { "cuenta": "476", "debe": 0, "haber": 750, "concepto": "TGSS" }, { "cuenta": "4751", "debe": 0, "haber": 300, "concepto": "RETENCION_IRPF" }, { "cuenta": "465", "debe": 0, "haber": 1570, "concepto": "NETO_A_PAGAR" } ], "debe": 2620, "haber": 2620, "cuadra": true, "equilibrado": true, "no_borra": true },
  "asiento_equilibrado": true,
  "peticion_asiento_enviada": true,
  "diario_respondio": true,
  "asiento_asentado": true,
  "asiento_resultado": { "status": 200, "error": null, "clave_natural": "nomina:E1:2026-09" },
  "tipos_fuente": null,
  "tipos_cableados": false,
  "determinista": true,
  "nota": "del recibo al ASIENTO EQUILIBRADO y EXPLICABLE: el asiento lo escribe el diario (B2), aqui solo se PIDE"
}
```

Emite `contabilidad.nomina_formada` (res.data + `correlation_id`) y **publica**
`contabilidad.asiento.asentar.request` hacia `escritor-diario` (B2) con rol `ADMISION`.

### 2. `desglosar` — la nómina explicable (lectura pura)

```json
{ "project_id": "e57a318a-...", "recibo": { "empleado": "E1", "periodo": "2026-09", "bruto": 2000, "retencion": 300, "cotizacion_trabajador": 130, "cotizacion_empresa": 620, "neto": 1570 } }
```

Respuesta `200`:

```json
{ "project_id": "e57a318a-...", "empleado": "E1", "periodo": "2026-09", "lineas": { "bruto": 2000, "retencion": 300, "cotizacion_trabajador": 130, "neto": 1570, "base_cotizacion": 2000, "faltantes": [], "explicable": true }, "obligacion": { "gasto_empresa": 2620, "obligacion_tgss": 750, "faltantes": [] }, "neto_ajustado": { "neto_base": 1570, "neto_ajustado": 1570 }, "explicable": true, "tipos_fuente": null, "determinista": true }
```

### 3. `liquidar` — cierre de la cuenta del trabajador (G10)

```json
{ "project_id": "e57a318a-...", "recibo": { "empleado": "E1", "periodo": "2026-09", "bruto": 2000, "retencion": 300, "cotizacion_trabajador": 130, "cotizacion_empresa": 620, "neto": 1570 }, "finiquito": 500, "indemnizacion": 1000, "correlation_id": "abc-123" }
```

Respuesta `200`:

```json
{ "project_id": "e57a318a-...", "op": "liquidar", "empleado": "E1", "recibo_formado": { "empleado": "E1", "periodo": "2026-09" }, "lineas": { "bruto": 2000, "retencion": 300, "cotizacion_trabajador": 130, "neto": 1570, "explicable": true }, "obligacion": { "gasto_empresa": 2620, "obligacion_tgss": 750 }, "asiento_cierre": { "tipo": "CIERRE_EMPLEADO", "origen": "NOMINA_G10", "empleado": "E1", "apuntes": [ "…asiento base…", { "cuenta": "640", "debe": 500, "haber": 0, "concepto": "FINIQUITO" }, { "cuenta": "465", "debe": 0, "haber": 500, "concepto": "FINIQUITO" }, { "cuenta": "641", "debe": 1000, "haber": 0, "concepto": "INDEMNIZACION" }, { "cuenta": "465", "debe": 0, "haber": 1000, "concepto": "INDEMNIZACION" } ], "cuadra": true, "cuenta_trabajador": "465", "saldo_trabajador": 0, "saldo_cero": true, "error_de_estado": false, "no_borra": true }, "saldo_cero": true, "una_cuenta_de_empleado_sin_cerrar_es_un_error_de_estado": true, "peticion_asiento_enviada": true, "asiento_asentado": true, "tipos_fuente": null, "tipos_cableados": false, "determinista": true }
```

Emite `contabilidad.nomina_formada` y **publica** `contabilidad.asiento.asentar.request`
hacia `escritor-diario` (B2).

### 4. Fallo — sin recibo ni puerto-nomina → 503

```json
{ "project_id": "e57a318a-..." }
```

(`puerto-nomina` G4 no responde) → Respuesta `503` + `contabilidad.nomina.procesar.failed`:

```json
{ "status": 503, "error": { "code": "DEPENDENCIA_NO_DISPONIBLE", "message": "puerto-nomina (G4) no respondio y el payload no trae recibo: no se forma la nomina sin recibo", "details": { "dependencia": "puerto-nomina", "accion": "NO_PROCESAR_PUBLICAR_FALLO" } } }
```

### 5. Fallo — sin tipos y sin importes → 422

```json
{ "project_id": "e57a318a-...", "recibo": { "empleado": "E1", "periodo": "2026-09", "bruto": 2000 } }
```

(el recibo no trae retención ni cotizaciones y no hay tipos declarados) → Respuesta `422` +
`contabilidad.nomina.procesar.failed`:

```json
{ "status": 422, "error": { "code": "TIPOS_NO_DECLARADOS", "message": "la nomina no trae retencion_irpf, cotizacion_trabajador, neto y los tipos de cotizacion/retencion no estan declarados (G2): el sistema NO se inventa el porcentaje", "details": { "faltantes": ["retencion_irpf","cotizacion_trabajador","neto"], "dependencia": "cola-declaraciones-criterio (G2)", "accion": "DECLARAR_TIPOS", "tipos_cableados": false } } }
```

### 6. Fallo — asiento descuadrado → 409

Si el asiento compuesto no cuadra (p.ej. `neto` declarado a mano inconsistente) → Respuesta
`409` + `contabilidad.nomina.procesar.failed`:

```json
{ "status": 409, "error": { "code": "DESCUADRE", "message": "el asiento de nomina NO cuadra: debe 2620 != haber 2500", "details": { "debe": 2620, "haber": 2500, "asentado": false } } }
```

### 7. Fallo — payload inválido

```json
{ "recibo": { "empleado": "E1" } }
```

Respuesta `400` + `contabilidad.nomina.procesar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

### 8. Entrada fire-and-forget — nómina recibida (G4 → G1)

Entra `contabilidad.nomina_recibida` con `{ project_id, recibo:{...}|hecho_nomina, tipos?,
cuentas? }` → procesa el recibo y publica `contabilidad.nomina_formada` (o
`contabilidad.nomina.procesar.failed`). Sin `project_id` → `null`.

### 9. Tools (sin RPC en module.json)

`toolProcesar` → `_procesar`; `toolDesglosar` → `_desglosarEntrada`; `toolLiquidar` →
`_liquidar`; `toolCalcularObligacion` → `_calcularObligacion`; `toolConstruirAsiento` →
`_construirAsiento`.

## Tests

El test viviría en `tests/unit/recibo-nomina.test.js`. Cubre:

- `procesar` con recibo completo → `200`, `lineas.explicable:true`, `asiento.cuadra:true`,
  `obligacion.gasto_empresa`/`obligacion_tgss` correctos; emite
  `contabilidad.nomina_formada` y **publica** `contabilidad.asiento.asentar.request` con rol
  `ADMISION`.
- **Cero juicio**: los importes del recibo se **respetan** (fuente `RECIBO`), no se
  re-estiman.
- **Sin tipos y sin importes → `422 TIPOS_NO_DECLARADOS`** (`accion:'DECLARAR_TIPOS'`): el
  sistema no se inventa el porcentaje.
- **Con tipos declarados** se calculan retención/cotizaciones (`fuente:'TIPO_DECLARADO'`) y
  la nómina pasa a `explicable`.
- **Anticipos (G8)**: el `neto_ajustado` resta `Σ anticipos`.
- **Conceptos (G9)**: `DIETAS`/`ESPECIE`/`PAGA_EXTRA`/`FINIQUITO`/`INDEMNIZACION` generan
  apuntes; concepto no declarado → `[]` (no se inventa la cuenta).
- **Liquidar (G10)**: con finiquito/indemnización → `saldo_cero:true`; si el saldo del
  empleado no queda a cero → `error_de_estado:true`.
- **Dependencia tolerante**: sin recibo en el payload y `puerto-nomina` (G4) mudo → `503
  DEPENDENCIA_NO_DISPONIBLE`.
- **Diario tolerante**: si `escritor-diario` (B2) no responde, `diario_respondio:false` y
  `asiento_asentado:false` — **no se asume asentado**.
- Sin `project_id`/`recibo.empleado` → `400 INVALID_INPUT` + par `*.failed`.
- El reflejo es **stateless**: sin `project.activated` ni persistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/recibo-nomina
node --test tests/unit/recibo-nomina.test.js
```

## Notas de implementación

- Clase `ReciboNomina extends ModuloHibridoReflejo`; `name = 'recibo-nomina'`,
  `version = 'reflejo-0.1.0'`. **Sin store** (reflejo stateless: nada que persistir).
- Constantes: `ROL_DIARIO = 'ADMISION'`, `CUENTAS_POR_DEFECTO = { sueldos:'640',
  cotizacion_empresa:'642', indemnizaciones:'641', tgss:'476', retencion_irpf:'4751',
  remuneraciones:'465', anticipos:'460', especie:'755' }`, `CONCEPTOS = ['DIETAS',
  'ESPECIE', 'PAGA_EXTRA', 'FINIQUITO', 'INDEMNIZACION']`.
- `onProcesarRequest`/`onLiquidarRequest` publican `contabilidad.nomina_formada` en éxito y
  el par `*.failed` si no; `onDesglosarRequest` publica solo el par de fallo si `status !==
  200`. Todos delegan en `_atender(e, '<op>', 'contabilidad.nomina.<op>.response', fn)`.
  `onNominaRecibida` es fire-and-forget (async IIFE, sin `_atender`).
- Proyecciones puras: `_admitir`, `_desglosar`, `_calcularObligacion`, `_aplicarAnticipo`,
  `_imputarConcepto`, `_construirAsiento`, `_liquidar` (async), `_procesar` (async),
  `_porcentajes`, `_cuentasDe`, `_num`; helpers de dependencia `_reciboDe`, `_tiposDe`.
  `_rpc`, `_invalid`, `_errorResponse`, `_round` vienen de la base.
- Tools: `toolProcesar`, `toolDesglosar`, `toolLiquidar`, `toolCalcularObligacion`,
  `toolConstruirAsiento`.
- DEP hacia delante: `contabilidad.nomina_formada` lo consumen el cuadro de mando y el flujo
  de personal; `contabilidad.asiento.asentar.request` lo atiende `escritor-diario` (B2).
  DEP hacia atrás por evento: `puerto-nomina` (G4) y `cola-declaraciones-criterio` (G2).
