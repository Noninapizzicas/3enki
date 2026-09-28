---
name: inmovilizado
description: >
  Skill FULL del módulo CUSTODIO `inmovilizado` de la vertical contabilidad de Enki
  (F1·F2·F3·F4, hoja del plan). EL BIEN DURADERO Y SU AMORTIZACION. Cuatro clases en
  una parcela: F1 AltaActivo (el alta se DECLARA, no se estima — un solo escritor),
  F2 PlanAmortizacion (la cuota se genera CUANDO TOCA: dispara en el cierre C4), F3
  BajaActivo (la baja calcula el resultado y lo imputa — NO borra la historia del
  bien, SUMA un asiento, espejo de B5), F4 ValorNetoContable (coste − amortización
  acumulada, al balance C1). LA LEY ENTRA COMO DATO: el método (LINEAL/DEGRESIVA/
  FISCAL/PERSONALIZADA), el coeficiente, los años, los periodos_por_anio y — sobre
  todo — la TABLA DE AMORTIZACION son DECLARABLES por activo; NINGUN COEFICIENTE
  LEGAL está cableado en la lógica: si no hay tabla ni parámetros declarados, la
  cuota NO SE INVENTA (nada:true, motivo TABLA_NO_DECLARADA) y si no se declara el
  valor recuperado de la baja queda [ABIERTO] (no se asume cero). Persiste por
  proyecto vía PosPersistencia. Úsala para operar, depurar o extender el custodio, o
  para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites dar de alta un bien duradero (RPC contabilidad.activo.alta.request),
    generar la cuota de amortización de un periodo (contabilidad.amortizacion.generar.request),
    dar de baja el bien calculando su resultado (contabilidad.activo.baja.request) o leer
    su valor neto contable (contabilidad.activo.valor_neto.request).
  - Cuando depures por qué se rechaza (409 ERROR_DOS_ESCRITORES si el rol no es DUENO/ASESOR,
    409 ERROR_DUPLICADO si el bien ya está dado de alta o de baja, 422 METODO_NO_VALIDO si el
    método sale del catálogo declarable, 422 PRECONDITION_FAILED si el valor recuperado no se
    declara, 404 RESOURCE_NOT_FOUND si el bien no está, 400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), por qué la
    amortización es DECLARABLE (ninguna constante legal cableada) y por qué la cuota se
    dispara solo en el cierre de NIVEL 2.
  - Cuando vayas a escribir/ampliar el test unitario del custodio inmovilizado.
tags: [enki, modulo, custodio, persistencia, contabilidad, inmovilizado, amortizacion, declarable]
---

# inmovilizado — CUSTODIO del bien duradero y su amortización

## Qué hace el módulo

`inmovilizado` es un **CUSTODIO CON PERSISTENCIA** (F1·F2·F3·F4, hoja del plan):
**EL BIEN DURADERO Y SU AMORTIZACION**. Cuatro clases en una parcela:

- **F1 AltaActivo** — el alta se **DECLARA**, no se estima (coste + gastos activables
  declarados). Un solo escritor: **DUENO/ASESOR**.
- **F2 PlanAmortizacion** — la cuota se genera **CUANDO TOCA**: dispara en el **cierre
  C4**, y **SOLO en el cierre de NIVEL 2** (el mes del asesor). El cierre de jornada
  (nivel 1) **no devenga amortización**.
- **F3 BajaActivo** — la baja calcula el resultado (valor recuperado − valor neto
  contable) y lo **IMPUTA** como asiento que **SUMA**: **NO borra la historia del bien**
  (`borra_historia:false`, espejo de B5 `asiento-ajuste`).
- **F4 ValorNetoContable** — **coste − amortización acumulada**, cálculo determinista al
  balance (C1).

**LA LEY ENTRA COMO DATO (la invariante de la hoja)**: el **método**
(`LINEAL`/`DEGRESIVA`/`FISCAL`/`PERSONALIZADA`), el **coeficiente**, los **años**, los
**periodos_por_anio** y — sobre todo — la **TABLA DE AMORTIZACION** son **DECLARABLES**
por activo. **Ningún coeficiente legal está cableado en la lógica**: si no hay tabla ni
parámetros declarados, la cuota **NO SE INVENTA** (`generada:false`, `nada:true`,
`motivo:'TABLA_NO_DECLARADA'`). Toda respuesta de alta lleva `ley_cableada:false`.

**No se asume cero**: si en la baja no se declara el valor recuperado, el cálculo queda
**[ABIERTO]** (`valor_recuperado_marca:'ABIERTO'`, `calculable:false`,
`motivo:'VALOR_RECUPERADO_NO_DECLARADO'`) y **no se imputa** (422).

**AQUÍ NO SE ESCRIBE EL DIARIO**: la cuota y la baja se **ENVÍAN** al libro por **EVENTO**
(`contabilidad.asiento.asentar.request` con rol `ADMISION`) — **B2 (`escritor-diario`) es
el ÚNICO escritor**. La dependencia con `escritor-diario` (B2), `mayor-balanza` (B3) y
`cola-declaraciones-criterio` (K9) es **por EVENTO, nunca por `require` cruzado**.

Persiste por proyecto con **PosPersistencia** (storage
`/contabilidad/inmovilizado/inmovilizado.json`), restaura en `project.activated` y vuelca
en `onUnload`.

> **NO REUTILIZA**: el inmovilizado y la amortización no existen en el inventario (0
> módulos); la amortización es un hecho que produce el TIEMPO y aquí se genera en el cierre.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response + fire-and-forget + ciclo de vida)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.activo.alta.request` | `onAltaRequest` | RPC custodio: {project_id, rol:'DUENO'\|'ASESOR', activo:{id_activo, descripcion, coste, gastos_activables?, valor_residual?, fecha_alta?, cuenta?, cuenta_amortizacion?, metodo?, coeficiente?, anios?, periodos_por_anio?, tabla_amortizacion?}} → {project_id, activo, importe_alta, valor_neto, tabla_declarada}. El alta se DECLARA (coste + gastos activables), no se estima. Cerrojo: rol fuera de DUENO/ASESOR → 409 ERROR_DOS_ESCRITORES; el bien ya dado de alta → 409 ERROR_DUPLICADO; metodo fuera del catalogo declarable → 422 METODO_NO_VALIDO. Publica contabilidad.activo_dado_de_alta y responde por contabilidad.activo.alta.response; error → contabilidad.activo.alta.failed. |
| `contabilidad.amortizacion.generar.request` | `onGenerarRequest` | RPC custodio: {project_id, id_activo, periodo} → {project_id, id_activo, periodo, generada, importe, metodo, origen_cuota, amortizacion_acumulada, asiento}. La cuota sale de la TABLA DECLARADA o de metodo+coeficiente/anios declarados; sin tabla ni parametros NO se inventa (generada:false, nada:true, motivo TABLA_NO_DECLARADA — ninguna constante legal en la logica). Periodo ya amortizado es idempotente; bien de baja o ya amortizado del todo → generada:false. El asiento de amortizacion se ENVIA a escritor-diario (B2) por EVENTO: exito publica contabilidad.amortizacion_generada; si el libro no confirma → contabilidad.amortizacion_generada.failed. Responde por contabilidad.amortizacion.generar.response; error → contabilidad.amortizacion.generar.failed. |
| `contabilidad.activo.baja.request` | `onBajaRequest` | RPC custodio: {project_id, rol:'DUENO'\|'ASESOR', id_activo, valor_recuperado?, fecha_baja?, motivo?, cuenta_resultado?, cuenta_cobro?} → {project_id, id_activo, baja, asiento, resultado, clase:'BENEFICIO'\|'PERDIDA'\|'SIN_RESULTADO', historial_intacto:true}. Calcula el resultado (valor recuperado − valor neto contable) y lo IMPUTA como asiento que SUMA: la baja NO borra la historia del bien (borra_historia:false). Si no se declara el valor recuperado queda [ABIERTO] y no se imputa (422) — no se asume cero. Cerrojo: rol fuera de DUENO/ASESOR → 409 ERROR_DOS_ESCRITORES; baja ya declarada → 409 ERROR_DUPLICADO. Publica contabilidad.activo_dado_de_baja y responde por contabilidad.activo.baja.response; error → contabilidad.activo.baja.failed. |
| `contabilidad.activo.valor_neto.request` | `onValor_netoRequest` | RPC custodio de lectura: {project_id, id_activo} → {project_id, id_activo, importe_alta, amortizacion_acumulada, valor_neto_contable, de_baja}. F4: coste − amortizacion acumulada, calculo determinista al balance (C1). Responde por contabilidad.activo.valor_neto.response; si el bien no esta en la parcela → 404 y contabilidad.activo.valor_neto.failed. |
| `contabilidad.cierre_realizado` | `onCierreRealizado` | Fire-and-forget (C4 → F2): cierre-ejercicio cerro un periodo → se DISPARA la cuota de amortizacion del periodo (la cuota se genera CUANDO TOCA). SOLO en el cierre de NIVEL 2 (el mes del asesor): el cierre de jornada (nivel 1) responde amortiza:false. Por cada bien se genera su cuota y se envia al libro (B2) por EVENTO; lo que no cuadra publica contabilidad.amortizacion_generada.failed. |
| `project.activated` | `onProjectActivated` | Restaura del storage (PosPersistencia) la parcela del inmovilizado del proyecto activado: activos, amortizacion acumulada, cuotas y bajas son POR PROYECTO y no se borran. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.activo_dado_de_alta` | Fire-and-forget (F1): el bien duradero quedo dado de alta en la parcela → {project_id, activo:{id_activo, importe_alta, metodo, tabla_amortizacion, ...}, importe_alta, valor_neto, tabla_declarada}. El alta se declara, no se estima; ley_cableada:false. |
| `contabilidad.amortizacion_generada` | Fire-and-forget (F2): la cuota de amortizacion de un periodo quedo generada y confirmada por el libro → {project_id, id_activo, periodo, importe, metodo, origen_cuota, amortizacion_acumulada, asiento, senal_libro}. La cuota sale de parametros DECLARABLES (tabla/coeficiente/anios), nunca de una constante legal. |
| `contabilidad.activo_dado_de_baja` | Fire-and-forget (F3): el bien quedo dado de baja con su resultado calculado e imputado → {project_id, id_activo, baja:{valor_neto_contable, valor_recuperado, resultado, clase, asiento}, historial_intacto:true}. La baja no borra la historia del bien: suma un asiento. |
| `contabilidad.activo.alta.failed` | Par de fallo determinista: alta sin project_id/activo/id/coste, con rol fuera de DUENO/ASESOR (409 ERROR_DOS_ESCRITORES), bien duplicado (409 ERROR_DUPLICADO) o metodo no declarable (422). Cierra el circulo de contabilidad.activo.alta.request. |
| `contabilidad.amortizacion.generar.failed` | Par de fallo determinista: generar sin project_id/periodo, bien no hallado (404) o payload invalido. Cierra el circulo de contabilidad.amortizacion.generar.request. |
| `contabilidad.activo.baja.failed` | Par de fallo determinista: baja sin project_id/id_activo, con rol fuera de DUENO/ASESOR (409 ERROR_DOS_ESCRITORES), baja duplicada (409 ERROR_DUPLICADO) o baja no imputable (422). Cierra el circulo de contabilidad.activo.baja.request. |
| `contabilidad.activo.valor_neto.failed` | Par de fallo determinista: valor_neto sin project_id/id_activo o bien no hallado (404). Cierra el circulo de contabilidad.activo.valor_neto.request. |
| `contabilidad.activo_dado_de_alta.failed` | Par de fallo del evento de dominio contabilidad.activo_dado_de_alta: la emision del hecho de dominio no se completo. |
| `contabilidad.amortizacion_generada.failed` | Par de fallo del evento de dominio contabilidad.amortizacion_generada: la cuota se genero pero escritor-diario (B2) no la confirmo (503 DEPENDENCIA_NO_DISPONIBLE), o el bien no es amortizable y no se inventa la cuota. |
| `contabilidad.activo_dado_de_baja.failed` | Par de fallo del evento de dominio contabilidad.activo_dado_de_baja: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.activo.alta.failed` cierra `contabilidad.activo.alta.request`;
> `contabilidad.amortizacion.generar.failed` cierra
> `contabilidad.amortizacion.generar.request`; `contabilidad.activo.baja.failed` cierra
> `contabilidad.activo.baja.request`; `contabilidad.activo.valor_neto.failed` cierra
> `contabilidad.activo.valor_neto.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.activo.alta.response`, `contabilidad.amortizacion.generar.response`,
> `contabilidad.activo.baja.response` y `contabilidad.activo.valor_neto.response` (los
> pares response de los RPC); **NO están declaradas en `publishes`**.

> Nota: declarado en module.json pero NO emitido por index.js (patrón de la vertical: el
> par de fallo real es `<op>.failed`) — `contabilidad.activo_dado_de_alta.failed` y
> `contabilidad.activo_dado_de_baja.failed` son los pares de fallo de los eventos de
> DOMINIO; el custodio solo publica los pares `*.failed` de sus RPC.
> `contabilidad.amortizacion_generada.failed` **sí** se emite (es la señal de B2 sin
> confirmar, dentro de `onGenerarRequest` y `_dispararEnCierre`).

> Nota: no está en module.json pero sí lo emite index.js — el módulo publica por `_rpc`
> `contabilidad.asiento.asentar.request` (dependencia por EVENTO hacia `escritor-diario`
> B2, no declarada como publisher).

> Nota de sub-declaración: `_valorarAlta`, `_cuotaDeclarada`, `_asientoAmortizacion`,
> `_anotarCuota`, `_calcularResultadoBaja`, `_imputar`, `_calcularValorNeto` y
> `_dispararEnCierre` **NO están expuestos por ningún RPC** — solo como tools
> (`toolValorarAlta`, `toolCalcularResultadoBaja`, `toolImputar`, `toolCalcularValorNeto`,
> `toolDispararEnCierre`, ...). La baja completa (`_darDeBaja`) es la única vía RPC que
> encadena cálculo + imputación.

## Reglas de negocio

1. **LA LEY ENTRA COMO DATO (invariante dura)**: `_cuotaDeclarada` resuelve la cuota así:
   (a) si hay `tabla_amortizacion` y una fila con `periodo` igual → `cuota`/`importe` de la
   fila, `metodo:'TABLA_DECLARADA'`, `origen:'tabla_amortizacion'`; **si la tabla existe
   pero no hay fila para ese periodo, NO se extrapola** (`declarada:false`); (b) si no hay
   tabla, exige `metodo` + (`anios`>0 → `base/anios`, origen `'metodo+anios'`) o
   (`coeficiente`>0 → `base*(coef/100)`, origen `'metodo+coeficiente'`); (c) si no hay ni
   tabla ni parámetros → `declarada:false`. **Ninguna constante legal está cableada.**
2. **Sin tabla ni parámetros la cuota NO se inventa**: `_generarCuota` devuelve
   `200` con `{generada:false, nada:true, motivo:'TABLA_NO_DECLARADA',
   parametros_declarables:['tabla_amortizacion','metodo+coeficiente','metodo+anios'],
   ley_cableada:false}`. **No se emite el aviso de dominio en este caso** (no hay cuota).
3. **Periodos_por_anio es DECLARABLE**: el reparto por periodo usa `periodos_por_anio` si
   está declarado (>0); si no, **el periodo devengado ES el anual** (`pxa = 1`) — **no se
   asume un número de períodos**.
4. **El alta se DECLARA, no se estima**: `_valorarAlta` devuelve
   `{coste, gastos_activables, importe_alta = coste+gastos, valor_residual,
   base_amortizable = importe_alta − residual, estimada:false, declarada:true}`. `coste`
   ausente o `<= 0` → `400 INVALID_INPUT activo.coste`. `valor_residual > importe_alta` →
   `422 PRECONDITION_FAILED`.
5. **Un solo escritor de la parcela (F1/F3)**: `_verificarEscritorUnico` exige rol en
   **{DUENO, ASESOR}** (normalizado a mayúsculas). Cualquier otro → **`409
   ERROR_DOS_ESCRITORES`** con `{escritor_vigente:['DUENO','ASESOR'], rol_intentado,
   simbolico:'ERROR_DOS_ESCRITORES'}`. Mensaje: *«la parcela del inmovilizado tiene UN
   escritor: solo DUENO/ASESOR dan de alta»*.
6. **El bien no se re-escribe**: re-dar de alta el mismo `id_activo` → **`409
   ERROR_DUPLICADO`** (*«el alta se declara UNA vez»*); re-dar de baja el mismo bien →
   **`409 ERROR_DUPLICADO`** (*«la historia del bien no se reescribe»*).
7. **Idempotencia de la cuota por periodo**: si `activo.periodos_amortizados` ya contiene
   el periodo → `{generada:false, motivo:'PERIODO_YA_AMORTIZADO', nada:true,
   idempotente:true}`. Bien de baja → `{generada:false, motivo:'BIEN_DADO_DE_BAJA'}`. Bien
   ya amortizado del todo (`pendiente <= EPS`) → `{generada:false,
   motivo:'BIEN_AMORTIZADO_DEL_TODO'}`.
8. **La cuota se tope con lo pendiente**: `importe = min(cuota, pendiente)` con
   `pendiente = base_amortizable − amortizacion_acumulada`; `amortizacion_acumulada` se
   actualiza y el periodo se anota en `periodos_amortizados` (`_anotarCuota`), en la
   secuencia append-only `d.cuotas` (`borrable:false`).
9. **La baja NO borra la historia (F3)**: `_imputar` compone un asiento determinista —
   `{cuentaAcumulada: debe=amortizacion_acumulada}`, `{cuentaCobro: debe=recuperado}`,
   `{cuentaBien: haber=importe_alta}` y `{cuentaResultado: haber=rdo si rdo>=0, debe=−rdo
   si rdo<0}` — con `borra_historia:false`, `suma:true`, `clave_original:'inmovilizado:<id>'`.
   El resultado se clasifica `BENEFICIO` (>EPS) / `PERDIDA` (<−EPS) / `SIN_RESULTADO`.
10. **Lo no declarado NO se asume cero**: sin `valor_recuperado` (ni en payload ni en el
    activo) → `_calcularResultadoBaja` devuelve `{valor_recuperado:null,
    valor_recuperado_marca:'ABIERTO', resultado:null, clase:null, calculable:false,
    motivo:'VALOR_RECUPERADO_NO_DECLARADO', nota:'lo no declarado NO se asume cero'}`; y
    `_imputar` rechaza con **`422 PRECONDITION_FAILED`** (`marca:'ABIERTO'`).
11. **La cuota se dispara CUANDO TOCA (F2)**: `onCierreRealizado` — si `Number(nivel) === 1`
    devuelve `{nivel:1, amortiza:false, motivo:'el cierre de jornada no devenga
    amortizacion'}`; para el **nivel 2** recorre todos los activos, genera la cuota del
    periodo (`clave_natural || periodo` del cierre) y la envía a B2. Sin `project_id` →
    `null` (no publica).
12. **El asiento se ENVÍA a B2 por EVENTO**: `_senalarAlDiario` hace `_rpc`
    (`contabilidad.asiento.asentar.request`, `timeout_ms:5000`, rol `ADMISION`); si B2 no
    confirma → `contabilidad.amortizacion_generada.failed` con `503
    DEPENDENCIA_NO_DISPONIBLE`. **AQUÍ NO SE ESCRIBE EL DIARIO.**
13. **HTTP exacto**: éxito `200`; payload inválido → `400 INVALID_INPUT`; bien no hallado →
    `404 RESOURCE_NOT_FOUND`; segundo escritor / duplicado / descuadre de caja → `409`;
    método fuera de catálogo, valor residual inválido o valor recuperado no declarado →
    `422`; B2 mudo → `503` en el par `*.failed`; excepción en `_atender` → `500
    UNKNOWN_ERROR`.
14. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`;
    sin `activo` (o no objeto) → `400 INVALID_INPUT activo`; sin `id_activo` → `400
    INVALID_INPUT activo.id_activo`; sin `periodo` en generar → `400 INVALID_INPUT
    periodo`. Shape: `{status:400, error:{code:'INVALID_INPUT', message:'<campo>
    requerido', details:{field:<campo>}}}`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.activo.alta.response`,
`contabilidad.amortizacion.generar.response`, `contabilidad.activo.baja.response` y
`contabilidad.activo.valor_neto.response`.

### 1. `alta` — el alta se DECLARA

```json
{
  "project_id": "e57a318a-...",
  "rol": "DUENO",
  "activo": {
    "id_activo": "MAQ-01",
    "descripcion": "Horno industrial",
    "coste": 12000,
    "gastos_activables": 500,
    "valor_residual": 500,
    "metodo": "LINEAL",
    "anios": 10,
    "periodos_por_anio": 12,
    "cuenta": "217",
    "cuenta_amortizacion": "681"
  },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "activo": { "id_activo": "MAQ-01", "importe_alta": 12500, "valor_residual": 500, "metodo": "LINEAL", "coeficiente": null, "anios": 10, "periodos_por_anio": 12, "tabla_amortizacion": null, "amortizacion_acumulada": 0, "periodos_amortizados": [], "baja": null, "declarado_por": "DUENO", "ley_cableada": false, "borrable": false },
  "id_activo": "MAQ-01",
  "importe_alta": 12500,
  "valor_neto": 12500,
  "tabla_declarada": false,
  "ley_cableada": false
}
```

Emite `contabilidad.activo_dado_de_alta` (res.data + `correlation_id`).

### 2. `generar` — la cuota sale de lo DECLARADO

```json
{ "project_id": "e57a318a-...", "id_activo": "MAQ-01", "periodo": "2026-09" }
```

Respuesta `200` (con `metodo+anios` declarado: `12500−500=12000`; `12000/10/12 = 100`):

```json
{
  "project_id": "e57a318a-...",
  "id_activo": "MAQ-01",
  "periodo": "2026-09",
  "generada": true,
  "nada": false,
  "importe": 100,
  "metodo": "LINEAL",
  "origen_cuota": "metodo+anios",
  "base_amortizable": 12000,
  "amortizacion_acumulada_previa": 0,
  "amortizacion_acumulada": 100,
  "asiento": { "tipo": "AMORTIZACION", "origen": "F2_INMOVILIZADO", "periodo": "2026-09", "id_activo": "MAQ-01", "apuntes": [ { "cuenta": "681", "debe": 100, "haber": 0 }, { "cuenta": "AMORTIZACION_ACUMULADA:MAQ-01", "debe": 0, "haber": 100 } ], "debe": 100, "haber": 100, "borra_historia": false, "suma": true },
  "ley_cableada": false
}
```

Emite `contabilidad.amortizacion_generada` (res.data + `senal_libro` + `correlation_id`) si
B2 confirma el asiento.

### 3. `generar` — SIN tabla ni parámetros: la cuota NO se inventa

```json
{ "project_id": "e57a318a-...", "id_activo": "MAQ-02", "periodo": "2026-09" }
```

(activo sin `metodo`, `anios`, `coeficiente` ni `tabla_amortizacion`) → Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "id_activo": "MAQ-02",
  "periodo": "2026-09",
  "generada": false,
  "nada": true,
  "motivo": "TABLA_NO_DECLARADA",
  "parametros_declarables": ["tabla_amortizacion", "metodo+coeficiente", "metodo+anios"],
  "ley_cableada": false
}
```

### 4. `baja` — el resultado se imputa SUMANDO (no borra la historia)

```json
{ "project_id": "e57a318a-...", "rol": "ASESOR", "id_activo": "MAQ-01", "valor_recuperado": 9000, "motivo": "venta", "cuenta_resultado": "771", "cuenta_cobro": "570" }
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "id_activo": "MAQ-01",
  "baja": { "id_activo": "MAQ-01", "valor_neto_contable": 11500, "valor_recuperado": 9000, "resultado": -2500, "clase": "PERDIDA", "asiento": { "...": "..." }, "imputado": true, "borra_historia": false, "suma": true },
  "asiento": { "tipo": "BAJA_INMOVILIZADO", "origen": "F3_INMOVILIZADO", "id_activo": "MAQ-01", "clave_original": "inmovilizado:MAQ-01", "borra_historia": false, "suma": true },
  "resultado": -2500,
  "clase": "PERDIDA",
  "calculable": true,
  "borra_historia": false,
  "suma": true,
  "historial_intacto": true
}
```

Emite `contabilidad.activo_dado_de_baja` (res.data + `correlation_id`).

### 5. `valor_neto` — F4, al balance (C1)

```json
{ "project_id": "e57a318a-...", "id_activo": "MAQ-01" }
```

Respuesta `200`:

```json
{ "project_id": "e57a318a-...", "id_activo": "MAQ-01", "importe_alta": 12500, "amortizacion_acumulada": 100, "valor_neto_contable": 12400, "de_baja": false, "determinista": true, "destino": "estados-contables (C1)" }
```

### 6. Fallo — rol no autorizado → 409

```json
{ "project_id": "e57a318a-...", "rol": "OPERADOR", "activo": { "id_activo": "MAQ-01", "coste": 1 } }
```

Respuesta `409` + `contabilidad.activo.alta.failed`:

```json
{ "status": 409, "error": { "code": "ERROR_DOS_ESCRITORES", "message": "la parcela del inmovilizado tiene UN escritor: solo DUENO/ASESOR dan de alta", "details": { "escritor_vigente": ["DUENO", "ASESOR"], "rol_intentado": "OPERADOR", "simbolico": "ERROR_DOS_ESCRITORES" } } }
```

### 7. Fallo — método fuera del catálogo declarable → 422

```json
{ "project_id": "e57a318a-...", "rol": "DUENO", "activo": { "id_activo": "MAQ-03", "coste": 1000, "metodo": "MAGICO" } }
```

Respuesta `422 METODO_NO_VALIDO` + `contabilidad.activo.alta.failed`:

```json
{ "status": 422, "error": { "code": "METODO_NO_VALIDO", "message": "metodo de amortizacion MAGICO fuera del catalogo declarable", "details": { "metodos_posibles": ["LINEAL", "DEGRESIVA", "FISCAL", "PERSONALIZADA"], "nota": "el metodo es DECLARABLE; no hay ninguno cableado" } } }
```

### 8. Entrada fire-and-forget — cierre de NIVEL 2 (C4 → F2)

Entra `contabilidad.cierre_realizado` con `{project_id, cierre:{clave_natural, nivel:2, ...}}`:
por cada bien se genera la cuota del periodo y se envía al libro. Con `nivel:1` responde
`{nivel:1, amortiza:false, motivo:'el cierre de jornada no devenga amortizacion'}`.

### 9. Tools (sin RPC en module.json)

`toolRegistrar` → `_registrar`; `toolValorarAlta` → `_valorarAlta`; `toolGenerarCuota` →
`_generarCuota`; `toolDispararEnCierre` → `_dispararEnCierre`; `toolCalcularResultadoBaja`
→ `_calcularResultadoBaja`; `toolImputar` → `_imputar`; `toolCalcularValorNeto` →
`_calcularValorNeto`.

## Tests

El test viviría en `tests/unit/inmovilizado.test.js`. Cubre:

- `alta` con `rol:'DUENO'` → `200`, `importe_alta = coste+gastos`, `ley_cableada:false`,
  `declarada:true`; emite `contabilidad.activo_dado_de_alta`.
- **Alta duplicada** → `409 ERROR_DUPLICADO`.
- **Single-writer**: rol distinto de DUENO/ASESOR → `409 ERROR_DOS_ESCRITORES`.
- **Método no declarable** → `422 METODO_NO_VALIDO`.
- `generar` con `metodo+anios` → `200`, `generada:true`, `importe` correcto, `origen_cuota`
  `'metodo+anios'`; emite `contabilidad.amortizacion_generada`.
- **Tabla declarada**: fila para el periodo → `origen_cuota:'tabla_amortizacion'`; tabla sin
  fila para ese periodo → `declarada:false` (NO se extrapola).
- **Sin declaración** → `200` con `generada:false, nada:true, motivo:'TABLA_NO_DECLARADA'`.
- **Idempotencia**: repetir el mismo periodo → `motivo:'PERIODO_YA_AMORTIZADO'`.
- **Baja**: con `valor_recuperado` → `clase` BENEFICIO/PERDIDA/SIN_RESULTADO, asiento
  `suma:true`, `borra_historia:false`, `historial_intacto:true`; re-baja → `409
  ERROR_DUPLICADO`.
- **Baja sin valor recuperado** → `422 PRECONDITION_FAILED` con `marca:'ABIERTO'` (no se
  asume cero).
- `valor_neto` → `importe_alta − amortizacion_acumulada`; bien inexistente → `404`.
- Fire-and-forget `contabilidad.cierre_realizado` con `nivel:2` dispara cuotas; con
  `nivel:1` responde `amortiza:false`.
- B2 mudo → `contabilidad.amortizacion_generada.failed` (503), **nunca** un asiento
  inventado en el diario.
- `project.activated` restaura activos/cuotas/bajas vía PosPersistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/inmovilizado
node --test tests/unit/inmovilizado.test.js
```

## Notas de implementación

- Clase `Inmovilizado extends ModuloHibridoReflejo`; `name = 'inmovilizado'`,
  `version = 'reflejo-0.1.0'` (aunque es **custodio**: conserva el versionado reflejo, es el
  patrón real de la vertical). Store en memoria `this._store` (Map project_id →
  `{esquema:'contabilidad-inmovilizado-v1', activos:{}, cuotas:[], bajas:[],
  escritor:['DUENO','ASESOR']}`).
- Constantes: `ROLES_AUTORIZADOS = Set('DUENO','ASESOR')`, `CODE_DOS_ESCRITORES =
  'ERROR_DOS_ESCRITORES'`, `METODOS = ['LINEAL','DEGRESIVA','FISCAL','PERSONALIZADA']`,
  `MARCA_ABIERTO = 'ABIERTO'`, `ROL_ESCRITOR_DIARIO = 'ADMISION'`, `EPS = 0.005`.
- **PosPersistencia**: `_persist = new PosPersistencia({modulo, file:'inmovilizado.json',
  dir:'/contabilidad/inmovilizado', snapshot, hidratar})`. `onProjectActivated` →
  `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`. Cada mutación marca
  `marcarDirty(pid)`.
- `onAltaRequest`/`onBajaRequest` delegan en `_atender(e, '<op>',
  'contabilidad.activo.<op>.response', fn)` y publican el evento de dominio si `status ===
  200` o el par `*.failed` si no. `onGenerarRequest` además envía el asiento a B2 antes de
  emitir. `onValor_netoRequest` solo publica el par de fallo. `onCierreRealizado` es
  fire-and-forget (sin `_atender`).
- Proyecciones puras: `_registrar`, `_valorarAlta`, `_generarCuota`, `_cuotaDeclarada`,
  `_asientoAmortizacion`, `_dispararEnCierre` (async), `_anotarCuota`,
  `_calcularResultadoBaja`, `_imputar`, `_darDeBaja`, `_calcularValorNeto`,
  `_generarCuotaDePayload`, `_valorNetoDePayload`, `_senalarAlDiario` (async),
  `_verificarEscritorUnico` (+ `_obtenerOCrear`, `_num`). `_atender`, `_rpc`, `_invalid` y
  `_errorResponse` vienen de la base.
- Tools: `toolRegistrar`, `toolValorarAlta`, `toolGenerarCuota`, `toolDispararEnCierre`,
  `toolCalcularResultadoBaja`, `toolImputar`, `toolCalcularValorNeto`.
- DEP hacia delante: `contabilidad.activo_dado_de_alta`, `contabilidad.amortizacion_generada`
  y `contabilidad.activo_dado_de_baja` los consumen el balance (C1) y el cuadro de mando.
  DEP hacia atrás por evento: `cierre-ejercicio` (C4) publica `contabilidad.cierre_realizado`;
  `escritor-diario` (B2) es el ÚNICO escritor del diario (`contabilidad.asiento.asentar.request`).
