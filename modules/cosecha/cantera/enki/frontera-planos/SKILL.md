---
name: frontera-planos
description: >
  Skill FULL del módulo REFLEJO `frontera-planos` de la vertical contabilidad de Enki.
  🧱 UNA DE LAS 3 PIEZAS ANTI-BUCLE DEL DOMINIO: EL CERROJO ESTRUCTURAL que separa el plano de la
  operación del plano del cálculo — a la salida solo viajan cálculos, un hecho de negocio a la
  salida es 422, y sin patrón declarado no aprueba lo que no puede verificar. Sin estado. Úsala
  para operar, depurar o extender el reflejo, o para entender su contrato de eventos y sus reglas
  de negocio.
when-to-use: >
  - Cuando necesites verificar que una salida del sistema contable no realimenta la operación (RPC
    frontera-planos.verificar.request).
  - Cuando depures un rechazo 422 FRONTERA_PLANOS_ROTA (evidencia dura de hecho de negocio o de
    realimentación) o por qué `conforme:null` con `verificable:false` (no se declaró el patrón: el
    silencio NO es conformidad).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y POR QUÉ existe el
    cerrojo anti-bucle y QUÉ plano separa.
  - Cuando vayas a escribir/ampliar el test unitario del reflejo frontera-planos (el test de la
    frontera).
tags: [enki, modulo, reflejo, contabilidad, frontera-planos]
---

# frontera-planos — REFLEJO STATELESS del cerrojo anti-bucle

## Qué hace el módulo

`frontera-planos` es un **REFLEJO STATELESS** (M1, hoja del plan): **🧱 UNA DE LAS 3 PIEZAS
ANTI-BUCLE DEL DOMINIO. EL CERROJO ESTRUCTURAL.** Separa los **PLANOS** para que el resultado de
contabilidad **NO realimente su propia entrada**.

**POR QUÉ EXISTE (el bucle que evita)**: contabilidad **OBSERVA** la operación (los hechos que las
verticales emiten) y produce **SUS DERIVADOS** (cálculos: saldos, mayores, estados, informes). Si
un derivado de contabilidad pudiera volver a entrar **como si fuera un HECHO** de la operación, el
sistema **se realimentaría a sí mismo**: contabilidad fabricaría los hechos que luego observa y el
bucle no tendría suelo. Este cerrojo separa los **DOS PLANOS** y lo hace **VERIFICABLE**:

- **`plano_operacion`** — los **HECHOS** del negocio (una venta, una entrega, un cobro real…).
  Contabilidad los **RECIBE**; **NUNCA** los produce.
- **`plano_calculo`** — los **DERIVADOS** de contabilidad (saldo, balanza, informe, delta…).
  Contabilidad los **PRODUCE**; **NUNCA** deben realimentar la operación.

**A la salida solo viajan CÁLCULOS.** Un hecho de negocio a la salida del sistema contable =
**FALLO** (invariante 14: contabilidad observa los hechos y produce SUS documentos; no produce los
hechos que observa).

Atributos del diseño: `permitido:PatronDeCalculo`. Métodos: `verificar(salida):bool`.

**CÓMO GUARDA (fail-safe, sin cablear nada)**:

1. **EVIDENCIA DURA (siempre detectable)**: si la propia salida **DECLARA** ser un hecho de
   negocio (`plano:'hecho'`/`'operacion'`, `es_hecho:true`) o **DECLARA** realimentar/escribir la
   operación (`realimenta:true`, `escribe_operacion:true`), el cerrojo **RECHAZA** (**422
   `FRONTERA_PLANOS_ROTA`**, `bucle_cortado:true`) **sin necesitar patrón**: el bucle queda cortado
   aunque falte el patrón.
2. **PATRÓN DECLARADO** (`permitido:PatronDeCalculo`): dice **QUÉ** planos se admiten a la salida.
   Con patrón el veredicto es **determinista** (conforme solo si toda la salida cae en planos
   permitidos; un hecho de negocio solo pasa si el patrón declara `permite_operacion:true`).
3. **SIN PATRÓN**: el cerrojo **NO puede verificar** y **NO se da por bueno**: `verificable:false`,
   `conforme:null`, `abierto:['patron']`. **El silencio NO es conformidad** — un cerrojo que aprueba
   lo que no sabe verificar es un cerrojo falso.

Invariantes:

- **DETERMINISTA**: misma salida + mismo patrón → mismo veredicto. **Un test lo afirma.**
- **Dato ausente = desconocido**: sin patrón no hay veredicto (`conforme:null`), **no una
  aprobación**; una salida **sin plano declarado** no se asume cálculo.
- **NO escribe, NO persiste, NO muta y NO decide**: **verifica y declara**; el veredicto es un
  **DERIVADO**.
- **Sin `PosPersistencia` y sin `project.activated`**: no es custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `frontera-planos.verificar.request` | `onVerificarRequest` | RPC reflejo (verificacion pura, determinista): {project_id, salida (o {salidas\|items:[]}), permitido?\|patron? (PatronDeCalculo: [planos] \| {planos, permite_operacion})} → {project_id, tipo:'frontera-planos', conforme:true\|false\|null, verificable, no_realimenta, plano, planos_clasificados, num_salidas, num_no_permitidas, patron_aplicado, evidencia_dura, abierto}. EVIDENCIA DURA (la salida se declara hecho de negocio o realimentacion) → RECHAZO 422 FRONTERA_PLANOS_ROTA con bucle_cortado:true. Sin patron declarado → conforme:null y verificable:false (el silencio no es conformidad). Conforme:true → publica contabilidad.salida_verificada y responde por frontera-planos.verificar.response; rechazo 422 o project_id/salida ausente → frontera-planos.verificar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `frontera-planos.verificar.response` | Respuesta RPC correlada de frontera-planos.verificar.request → {request_id, status:200, data:{conforme, verificable, no_realimenta, planos_clasificados, patron_aplicado, abierto}}; en rechazo → {request_id, status:422, error:{code:'FRONTERA_PLANOS_ROTA', ...}}. Emitida por el helper _atender. |
| `frontera-planos.verificar.failed` | Par de fallo determinista (M1): project_id o salida ausente, o FRONTERA_PLANOS_ROTA (422) por evidencia dura de hecho de negocio / realimentacion de la operacion → {status, error:{code, message, details:{evidencia, plano_detectado, bucle_cortado:true}}}. Cierra el circulo de frontera-planos.verificar.request. OJO: conforme:null (sin patron) NO es un fallo: es un no-verificable declarado. |
| `contabilidad.salida_verificada` | Fire-and-forget (M1): una salida paso el cerrojo — SOLO calculos, no realimenta la operacion → {project_id, salida, plano:'calculo', patron, no_realimenta:true, correlation_id}. Lo LEEN el resto de la vertical (y el test de la frontera) como testigo anti-bucle. Solo se publica con conforme:true: una salida no verificable NO se declara verificada. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `frontera-planos.verificar.failed` cierra el círculo de
> `frontera-planos.verificar.request` cuando `_verificar` devuelve status ≠ 200: `400
> INVALID_INPUT` (`project_id` o `salida` ausente) o `422 FRONTERA_PLANOS_ROTA` (evidencia dura).
> **OJO**: `conforme:null` (sin patrón) **NO es un fallo** — se responde `200` con
> `verificable:false`, y **NO se publica** `contabilidad.salida_verificada`.

## Reglas de negocio

1. **La `salida` es obligatoria**: `input.salida` (o `input.s`); ausente/null →
   `400 INVALID_INPUT` (`field:'salida'`).
2. **EVIDENCIA DURA primero**: `_evidenciaDura(salida, input)` inspecciona `salida`, `input` y los
   items (`[salida]`, `salida.salidas[]` o `salida.items[]`). Señales estructurales:
   - `plano ∈ {operacion, hecho, hecho_negocio}` (`toLowerCase().trim()`);
   - `es_hecho === true`;
   - `realimenta === true` o `realimenta_operacion === true`;
   - `escribe_operacion === true`.
   Si hay **alguna** → **RECHAZO** `422 FRONTERA_PLANOS_ROTA` con
   `details:{evidencia, plano_detectado:'operacion', plano_esperado:'calculo', salida,
   bucle_cortado:true}` — **el bucle se corta sin necesitar patrón**.
3. **El PATRÓN (`permitido`) es DECLARABLE**: `input.permitido ?? input.patron`. Acepta:
   - `array` de planos → `{planos:[...], permite_operacion:false}`;
   - `objeto {planos:[...], permite_operacion:bool}` → `permite_operacion` **declarado por el
     negocio**; **por defecto la frontera NO se cruza** (`=== true`);
   - `string` → `{planos:[str], permite_operacion:false}`.
   Sin patrón (`null`/`undefined`) → `null` (**no se verifica**).
4. **Sin patrón → NO se da por bueno**: respuesta `200` con `conforme:null`, `verificable:false`,
   `no_realimenta:null`, `patron_aplicado:null`, `abierto.patron` («el cerrojo NO da por bueno lo
   que no puede verificar (el silencio no es conformidad)») y `revisa:'asesor (...)''`. **NO se
   publica `salida_verificada`.**
5. **Con patrón → veredicto determinista**: cada item se clasifica con `_planoDe(x)` (plano
   declarado, `toLowerCase().trim()`; ausente → `null`) y `_permitido(x, patron)`:
   - plano `null` (no declarado) → **NO permitido** (no se afirma que sea un cálculo);
   - plano de operación/hecho → permitido **solo si** `patron.permite_operacion === true`;
   - cualquier otro → permitido si está en `patron.planos`.
   `conforme = noPermitidas.length === 0`; `no_realimenta = conforme`.
6. **`plano` a la salida conforme**: `'calculo'` (la frontera está para afirmar que el derivado no
   realimenta la operación).
7. **Los items** de una salida: un array, o `salida.salidas[]`, o `salida.items[]`, o la salida
   misma como item único (`_items`).
8. **CONFORME → publica el testigo**: si `status === 200 && conforme === true`, publica
   `contabilidad.salida_verificada` con `{project_id, salida, plano:'calculo', patron:
   patron_aplicado, no_realimenta:true, correlation_id}`. Lo **LEEN** el resto de la vertical y el
   test de la frontera como **testigo anti-bucle**.
9. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`).
10. **HTTP exacto**: conforme o no-verificable → `200`; `project_id`/`salida` ausente → `400`;
    evidencia dura → `422 FRONTERA_PLANOS_ROTA`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `frontera-planos.verificar.response`. Solo con `conforme:true` publica
`contabilidad.salida_verificada`; en rechazo publica `frontera-planos.verificar.failed`.

### 1. `verificar` — conforme (solo cálculos)

```json
{
  "project_id": "e57a318a-...",
  "salida": [ { "plano": "calculo", "saldo": 120.5 }, { "plano": "calculo", "balanza": [] } ],
  "permitido": [ "calculo" ],
  "correlation_id": "abc-123"
}
```

Respuesta `200`: `conforme:true`, `verificable:true`, `no_realimenta:true`, `plano:'calculo'`,
`planos_clasificados:[{plano:'calculo', permitido:true}, ...]`, `num_no_permitidas:0`,
`patron_aplicado:{planos:['calculo'], permite_operacion:false, fuente:'declarado'}` y publica
`contabilidad.salida_verificada`.

### 2. `verificar` — evidencia dura de hecho de negocio → 422 (bucle cortado)

```json
{ "project_id": "e57a318a-...", "salida": { "plano": "hecho", "venta": 100 } }
```

Respuesta `422` + `frontera-planos.verificar.failed`:

```json
{ "status": 422, "error": { "code": "FRONTERA_PLANOS_ROTA", "message": "solo se emiten calculos: un hecho de negocio (o una realimentacion de la operacion) a la salida es FALLO", "details": { "evidencia": [ { "senal": "plano_declarado", "plano": "hecho", "motivo": "la salida se declara un hecho de negocio: contabilidad observa hechos, no los produce" } ], "plano_detectado": "operacion", "plano_esperado": "calculo", "bucle_cortado": true } } }
```

**No necesita patrón**: el bucle se corta por la evidencia dura.

### 3. `verificar` — sin patrón → `conforme:null` (el silencio no es conformidad)

Sin `permitido` → `200` con `conforme:null`, `verificable:false`, `no_realimenta:null`,
`abierto.patron` declarado. **NO se publica `salida_verificada`.**

### 4. `verificar` — salida fuera del patrón → `conforme:false`

Con `permitido:['calculo']` y un item con `plano:'otro_plano'` → `conforme:false`,
`num_no_permitidas:1`, `abierto.planos` («hay 1 salida(s) en planos no permitidos por el patron
declarado: la frontera no se cruza»). **No se publica `salida_verificada`.** (No es 422: no hay
evidencia de bucle, es una salida no conforme.)

### 5. Fallo — falta `project_id` o `salida`

Respuesta `400` + `frontera-planos.verificar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/frontera-planos.test.js` — **el test de la
frontera**. Cubre:

- Salida **solo cálculos** + patrón `['calculo']` → `200 conforme:true`, `no_realimenta:true`,
  publica `contabilidad.salida_verificada`.
- **Evidencia dura** (`plano:'hecho'` / `es_hecho:true` / `realimenta:true` /
  `escribe_operacion:true`) → `422 FRONTERA_PLANOS_ROTA` con `bucle_cortado:true` **sin patrón**.
- **Sin patrón** → `conforme:null`, `verificable:false` (**el silencio NO es conformidad**) y
  **no** se publica `salida_verificada`.
- Salida con **plano no declarado** → no permitida (no se asume cálculo).
- Un **hecho de negocio** solo pasa si el patrón declara `permite_operacion:true`.
- Salida fuera del patrón → `conforme:false` (200, no 422).
- **Determinismo**: misma salida + mismo patrón → mismo veredicto.
- `project_id`/`salida` ausente → `400 INVALID_INPUT` + `frontera-planos.verificar.failed`.
- `toolVerificar` devuelve la misma proyección que `_verificar`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `FronteraPlanos extends ModuloHibridoReflejo`; `name = 'frontera-planos'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store, sin `onProjectActivated`
  (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-libro/frontera-planos/`; es de la vertical **libro**).
- **Constantes de IDENTIDAD de plano** (las nombra el dominio, no son criterios cableados):
  `PLANO_OPERACION = 'operacion'` y `PLANO_CALCULO = 'calculo'`. **QUÉ se admite a la salida lo
  decide el PATRÓN DECLARADO.**
- `onVerificarRequest` usa `this._atender(e, 'verificar', 'frontera-planos.verificar.response',
  async (d) => {...})`: con `status === 200 && conforme === true` publica
  `contabilidad.salida_verificada`; con `status !== 200` publica `frontera-planos.verificar.failed`.
  Con `conforme:null` **NO se publica nada** (no está verificada).
- Proyección `_verificar(input)` (sync); helpers `_evidenciaDura`, `_patron`, `_planoDe`,
  `_permitido`, `_items`. Tool `toolVerificar`.
- **🔴 EL CERROJO ANTI-BUCLE** (por qué existe y qué separa):

  **El bucle que evita**: contabilidad **OBSERVA** la operación (hechos que emiten las verticales)
  y produce **SUS DERIVADOS** (saldos, mayores, estados, informes). Si un derivado contable pudiera
  volver a entrar **como si fuera un HECHO de la operación**, contabilidad fabricaría los hechos
  que luego observa → **el bucle no tendría suelo**.

  **Qué plano separa**: **`plano_operacion`** (los **HECHOS** del negocio — contabilidad los
  **RECIBE**, nunca los produce) **de** **`plano_calculo`** (los **DERIVADOS** de contabilidad —
  contabilidad los **PRODUCE**, jamás deben realimentar la operación).

  **La regla de la frontera**: **a la salida solo viajan CÁLCULOS**. Un hecho de negocio a la
  salida es **FALLO** (invariante 14: contabilidad observa los hechos y produce SUS documentos; no
  produce los hechos que observa).

  **Las 3 defensas**: (1) **evidencia dura** — la propia salida declara ser hecho/realimentación →
  **RECHAZO 422** con `bucle_cortado:true`, **sin necesitar patrón**; (2) **patrón declarado** —
  veredicto determinista contra los planos admitidos; (3) **sin patrón** — **`conforme:null`,
  `verificable:false`**: un cerrojo que aprueba lo que no sabe verificar es un **cerrojo falso**.
- **DEP**: es **la pieza anti-bucle** — el testigo de que el derivado no realimenta la operación.
  NO tiene dependencias de dominio por evento (verifica y declara, no consulta a nadie).
- **DATO AUSENTE = DESCONOCIDO**: sin patrón no hay veredicto (no una aprobación); una salida sin
  plano declarado no se asume cálculo. **NO escribe, NO persiste, NO muta y NO decide.**
