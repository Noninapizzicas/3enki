---
name: marca-borrador-validado
description: >
  Skill FULL del módulo REFLEJO `marca-borrador-validado` de la vertical contabilidad
  de Enki. EL SELLO DEL PUNTO EN QUE ESTÁ lo que el dueño ve: EN_CURSO / REVISADO /
  FIRMADO. Existe para que no se decida sobre un BORRADOR VIVO como si fuera
  definitivo. DERIVA, NO ALMACENA: computa el estado de la traza (B4) y la firma (L3)
  y jamás afirma FIRMADO sin firma; dato ausente = DESCONOCIDO. Úsala para operar,
  depurar o extender el reflejo, o para entender su contrato de eventos y sus reglas
  de negocio.
when-to-use: >
  - Cuando necesites sellar si un dato está en borrador vivo o es definitivo (RPC
    marca-borrador-validado.estado.request).
  - Cuando depures por qué sale `marca.estado:'DESCONOCIDO'` (sin traza ni firma, o
    sin dato identificable), por qué `seguro_para_decidir:false`, o por qué falta
    `project_id` (400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), las
    invariantes del reflejo (deriva no almacena, jamás FIRMADO sin firma, dato
    ausente = desconocido, determinista) y cómo consume la evidencia de
    `contabilidad.traza_registrada` (B4) y `contabilidad.firma_registrada` (L3).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo marca-borrador-validado.
tags: [enki, modulo, reflejo, contabilidad, marca-borrador-validado]
---

# marca-borrador-validado — REFLEJO del sello de borrador/validado

## Qué hace el módulo

`marca-borrador-validado` es un **REFLEJO STATELESS** (Q4, hoja del plan): **EL SELLO DEL
PUNTO EN QUE ESTÁ** lo que el dueño ve: **EN_CURSO / REVISADO / FIRMADO**. Existe para que
**no se decida sobre un BORRADOR VIVO como si fuera definitivo**.

Atributos del diseño: `traza:TrazaAsiento`, `firma:FlujoFirma`.
Método: `estado(dato):MarcaEstado`.

- **DERIVA, NO ALMACENA**: el estado se **COMPUTA** de la **traza** (B4,
  `contabilidad.traza_registrada`) y la **firma** (L3, `contabilidad.firma_registrada`).
  **No se guarda una marca por dato** (no es parcela; el ¿almacén de marca por dato o
  derivación pura? del diseño se resuelve por **DERIVACIÓN PURA**).
- **JAMÁS SE AFIRMA FIRMADO SIN FIRMA**: sin evidencia de firma, el estado máximo es
  **REVISADO** (o **EN_CURSO**). **No se declara definitivo lo que no lo es.**
- **Dato ausente = desconocido**: sin dato identificable el estado es **`DESCONOCIDO`** —
  no se asume borrador ni validado.
- **DETERMINISTA**: misma traza + misma firma → mismo estado.

Los cuatro estados del contrato, de menos a más avanzado (el diseño los fija, **no se
amplían**): `DESCONOCIDO`, `EN_CURSO`, `REVISADO`, `FIRMADO`.

Sin `PosPersistencia` y sin `project.activated`: no es custodio. Proyección única
`_estado`. **No emite ningún evento de dominio** (solo **RECUERDA** evidencia en memoria:
`this._trazas` y `this._firmas`, una **LECTURA**, no una parcela). Cierra el círculo con
`marca-borrador-validado.estado.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `marca-borrador-validado.estado.request` | `onEstadoRequest` | RPC reflejo (derivación determinista): {project_id, dato\|dato_id, traza?, firma?} → {dato_id, marca:{estado:'DESCONOCIDO'\|'EN_CURSO'\|'REVISADO'\|'FIRMADO', borrador, validado, firmado, seguro_para_decidir, motivo}, derivada_de:[...], almacena:false, decide:false, abierto, faltan}. DERIVA el estado de la traza (B4) y la firma (L3) — declaradas o la última observada por evento; NO almacena marca por dato. Sin dato identificable → DESCONOCIDO; sin firma NUNCA FIRMADO. Responde por marca-borrador-validado.estado.response; project_id ausente → marca-borrador-validado.estado.failed. |
| `contabilidad.traza_registrada` | `onTrazaRegistrada` | Fire-and-forget (B4 → Q4): traza-asiento registró la creación de un asiento → evidencia de que el dato existe (punto de partida EN_CURSO). Se recuerda como evidencia para derivar el estado; NO se almacena una marca. Tolerante: sin project_id o sin dato identificable se ignora. |
| `contabilidad.firma_registrada` | `onFirmaRegistrada` | Fire-and-forget (L3 → Q4): flujo-firma registró una firma → evidencia para derivar REVISADO/FIRMADO. Se recuerda como evidencia; NO se almacena una marca. Tolerante: sin project_id o sin dato identificable se ignora. |

### Publishes

| Evento | Descripción |
|---|---|
| `marca-borrador-validado.estado.response` | Respuesta RPC correlada de marca-borrador-validado.estado.request → {request_id, status:200, data:{dato_id, marca, derivada_de, almacena:false, decide:false, abierto, faltan}}. Emitida por el helper _atender. |
| `marca-borrador-validado.estado.failed` | Par de fallo determinista (Q4): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de marca-borrador-validado.estado.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `marca-borrador-validado.estado.failed` cierra el círculo de
> `marca-borrador-validado.estado.request` cuando `_estado` devuelve status ≠ 200 (el único
> camino: `400 INVALID_INPUT` por `project_id` ausente).

> Nota de honestidad (cruce con `index.js`): los dos fire-and-forget
> (`onTrazaRegistrada`, `onFirmaRegistrada`) **no pasan por el bus**: recuerdan la evidencia
> en memoria (`_push`) y devuelven `{status:200, data:{project_id, evidencia:'traza'|'firma'}}`
> — **no publican ningún evento de dominio** (el reflejo **deriva**, no propaga). El módulo
> **no emite** ningún `contabilidad.*` — coherente con **DERIVA, NO ALMACENA**: no es parcela.

> Nota: el módulo expone `toolEstado(params)` como **tool directa** (misma proyección
> `_estado`) — no es un evento del bus, no figura en `module.json`. Tampoco figuran
> `_derivar`, `_evidencia`, `_buscar`, `_push`, `_dato` (internos) ni los `Map` de lectura
> `this._trazas` / `this._firmas`.

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`). Único error duro.
2. **El DATO** (`_dato`): si es objeto → `dato_id` ?? `id` ?? `clave` ?? `clave_natural`
   (string) o `null`; si es escalar → `String(...)`; vacío/`undefined`/`null` → `null`.
3. **SIN DATO IDENTIFICABLE** → `200` con `dato_id:null`,
   `marca:{estado:'DESCONOCIDO', borrador:null, validado:null, firmado:null}`,
   `derivada_de:[]`, `almacena:false`, `abierto:true`, `faltan:['dato_id']` y
   `motivo:'sin dato identificable el estado es DESCONOCIDO: no se asume borrador ni
   validado'`. **No se asume borrador ni validado.**
4. **LA EVIDENCIA** (`_evidencia`): si la petición **declara** `traza`/`firma` (objeto) se usa
   esa; si no, se **busca** la última observada por evento (`_buscar` sobre `_trazas`/`_firmas`
   para ese `project_id` + `dato_id`, **la más reciente**). Sin ninguna → `null`.
5. **La DERIVACIÓN** (`_derivar`), **en este orden de precedencia**:
   - **FIRMADO**: la firma trae `firmado === true` **o** `estado_firma (upper) === 'FIRMADO'`
     → `{estado:'FIRMADO', borrador:false, validado:true, firmado:true, firma:{estado,
     firmado_por}, seguro_para_decidir:true, motivo:'el dato esta FIRMADO (firma registrada,
     L3): es el punto definitivo'}`. **Lo firmado es definitivo.**
   - **REVISADO**: firma con `estado_firma (upper) === 'REVISADO'` →
     `{estado:'REVISADO', borrador:true, validado:false, firmado:false, seguro_para_decidir:false,
     motivo:'el dato esta REVISADO pero NO firmado: sigue siendo un borrador vivo — no se decide
     como definitivo'}`.
   - **EN_CURSO**: hay traza (sin firma) → `{estado:'EN_CURSO', borrador:true, validado:false,
     firmado:false, seguro_para_decidir:false, motivo:'el dato esta EN CURSO (hay traza, sin
     firma): es un borrador vivo'}`.
   - **DESCONOCIDO**: sin traza ni firma → `{estado:'DESCONOCIDO', borrador:null, validado:null,
     firmado:null, seguro_para_decidir:false, motivo:'no hay traza ni firma del dato: el estado no
     se puede derivar'}`.
   **Nota fina**: `REVISADO` (y `EN_CURSO`) son **borrador vivo** (`borrador:true`): solo
   `FIRMADO` da `seguro_para_decidir:true`. **Jamás se salta la firma.**
6. **`derivada_de`** declara **de dónde sale cada pieza**: `['traza-asiento (B4)']` y/o
   `['flujo-firma (L3)']` (solo las presentes). `almacena:false` y `decide:false` **siempre**.
7. **`abierto`** declara los huecos: `{traza: <null si hay, si no 'no hay traza del dato: el punto
   de partida es EN_CURSO'>, firma: <null si hay, si no 'no hay firma registrada: el estado NO
   puede afirmarse FIRMADO'>}`. **`faltan`** = `['traza']` y/o `['firma']` (solo los ausentes;
   `[]` si ambos constan).
8. **`onTrazaRegistrada`** (B4 → Q4): `e.data || e`; **sin `project_id` → `null`** (se ignora por
   tolerancia). Toma `d.traza || d`, computa `dato_id` (`_dato`) y recuerda
   `{dato_id, creado:true, creado_por:<traza.registrado_por || d.registrado_por || null>,
   en:<ISO>}` en `_trazas`. **Sin `dato_id` NO se recuerda** (el `_push` lo descarta).
9. **`onFirmaRegistrada`** (L3 → Q4): `e.data || e`; **sin `project_id` → `null`**. Toma
   `d.firma || d`, computa `dato_id` y recuerda `{dato_id, firmado:true, estado_firma:<firma.estado
   (upper) o 'FIRMADO'>, firmado_por:<firma.firmado_por o null>, en:<ISO>}` en `_firmas`.
   **`firmado:true` siempre en la evidencia**: el estado se decide al derivar leyendo
   `estado_firma`.
10. **Memoria acotada**: `_push` recorta cada lista a **5000** entradas (descarta las más
    antiguas). **Es memoria viva para derivar; no es persistencia.**
11. **DERIVA, NO ALMACENA**: stateless. Sin `PosPersistencia`, sin `onProjectActivated`, sin
    store en disco. **No es parcela.**
12. **HTTP exacto**: éxito `200` (FIRMADO/REVISADO/EN_CURSO/DESCONOCIDO); `project_id` ausente
    → `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `marca-borrador-validado.estado.response`. **No emite evento de dominio.**

### 1. `estado` — dato FIRMADO (traza + firma declaradas)

```json
{
  "project_id": "e57a318a-...",
  "dato_id": "AS-2026-0001",
  "traza": { "dato_id": "AS-2026-0001", "registrado_por": "asesor" },
  "firma": { "dato_id": "AS-2026-0001", "estado": "FIRMADO", "firmado_por": "dueno" },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "dato_id": "AS-2026-0001",
  "marca": { "estado": "FIRMADO", "borrador": false, "validado": true, "firmado": true, "firma": { "estado": "FIRMADO", "firmado_por": "dueno" }, "seguro_para_decidir": true, "motivo": "el dato esta FIRMADO (firma registrada, L3): es el punto definitivo" },
  "derivada_de": ["traza-asiento (B4)", "flujo-firma (L3)"],
  "almacena": false,
  "decide": false,
  "abierto": { "traza": null, "firma": null },
  "faltan": []
}
```

### 2. `estado` — REVISADO pero NO firmado → sigue siendo borrador vivo

Con `firma:{estado:'REVISADO'}` y traza → `marca.estado:'REVISADO'`, `borrador:true`,
`validado:false`, `firmado:false`, **`seguro_para_decidir:false`**. **No se decide como
definitivo.**

### 3. `estado` — solo traza → `EN_CURSO` (borrador vivo)

Con `traza` y sin firma → `marca:{estado:'EN_CURSO', borrador:true, validado:false,
firmado:false, seguro_para_decidir:false}`, `derivada_de:['traza-asiento (B4)']`,
`faltan:['firma']` y `abierto.firma` declarando que **no puede afirmarse FIRMADO**.

### 4. `estado` — ni traza ni firma → `DESCONOCIDO`

Con `dato_id` pero sin evidencia → `marca:{estado:'DESCONOCIDO', borrador:null, validado:null,
firmado:null, seguro_para_decidir:false}`, `derivada_de:[]`, `faltan:['traza','firma']`.

### 5. `estado` — sin dato identificable → `DESCONOCIDO` (no se asume nada)

Sin `dato`/`dato_id` → `200` con `dato_id:null`, `faltan:['dato_id']` y `motivo:'sin dato
identificable el estado es DESCONOCIDO: no se asume borrador ni validado'`.

### 6. Fire-and-forget — la traza y la firma alimentan la evidencia

`contabilidad.traza_registrada` → `onTrazaRegistrada` recuerda la evidencia (`creado:true`).
`contabilidad.firma_registrada` → `onFirmaRegistrada` recuerda la evidencia (`firmado:true`,
`estado_firma`). Después, un `estado` **sin declarar** traza/firma las toma de esta memoria (la
última observada). **Sin `project_id` o sin dato identificable → se ignora.**

### 7. Fallo — falta `project_id`

```json
{ "dato_id": "AS-2026-0001" }
```

Respuesta `400` + `marca-borrador-validado.estado.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/marca-borrador-validado.test.js`. Cubre:

- `estado` con traza + firma FIRMADA → `200 marca.estado:'FIRMADO'`, `seguro_para_decidir:true`,
  `derivada_de:['traza-asiento (B4)','flujo-firma (L3)']`.
- Firma REVISADA (sin firmar) → `marca.estado:'REVISADO'`, **`borrador:true`**,
  `seguro_para_decidir:false` (**no se decide como definitivo**).
- Solo traza → `marca.estado:'EN_CURSO'`, `faltan:['firma']`, `abierto.firma` declarado.
- Ni traza ni firma → `marca.estado:'DESCONOCIDO'`, `faltan:['traza','firma']`.
- Sin dato identificable → `marca.estado:'DESCONOCIDO'`, `faltan:['dato_id']` (**no se asume
  borrador ni validado**).
- **JAMÁS FIRMADO sin firma**: cualquier vía sin evidencia de firma nunca alcanza `FIRMADO`.
- `onTrazaRegistrada` recuerda la evidencia y alimenta `estado`; `onFirmaRegistrada` ídem;
  **tolerantes** sin `project_id` (→ `null`) y **sin dato identificable** (no recuerdan).
- **DERIVA, NO ALMACENA**: `almacena:false` y `decide:false` **siempre**; ninguna llamada
  persiste ni muta (stateless); no se emite ningún evento de dominio.
- `project_id` ausente → `400 INVALID_INPUT` + `.estado.failed`.
- `toolEstado` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `MarcaBorradorValidado extends ModuloHibridoReflejo`; `name = 'marca-borrador-validado'`,
  `version = 'reflejo-0.1.0'`. Evidencia observada en memoria: `this._trazas = new Map()` y
  `this._firmas = new Map()` (`project_id → [item]`, acotadas a **5000**) — **LECTURA, no
  parcela**. Sin `PosPersistencia`, sin store en disco, sin `onProjectActivated`.
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-analitica/marca-borrador-validado/`).
- Constante `ESTADOS = ['DESCONOCIDO','EN_CURSO','REVISADO','FIRMADO']` — los estados del
  contrato, de menos a más avanzado (**el diseño los fija; no se amplían**).
- `onEstadoRequest` usa `this._atender(e, 'estado', 'marca-borrador-validado.estado.response',
  async (d) => {...})` con cierre de círculo (par `failed` si status ≠ 200). Los fire-and-forget
  `onTrazaRegistrada` / `onFirmaRegistrada` recuerdan la evidencia sin pasar por el bus.
  `onUnload` delega en `super`.
- Proyección única `_estado(input)` (**síncrona**: deriva de la evidencia declarada o en
  memoria); helpers `_derivar`, `_evidencia`, `_buscar`, `_push`, `_dato`. Tool `toolEstado`.
- `_invalid` viene de `modulo-hibrido-reflejo`.
- DEP: **escucha** `contabilidad.traza_registrada` (B4, lo publica `traza-asiento`) y
  `contabilidad.firma_registrada` (L3, lo publica `flujo-firma`) como **evidencia**
  (fire-and-forget). Lo consumen las hojas que necesitan **no decidir sobre un borrador vivo**
  vía `marca-borrador-validado.estado.request` (por EVENTO).
- **DERIVA, NO ALMACENA**: el estado se **computa** (determinista) de la traza y la firma;
  **JAMÁS FIRMADO sin firma**; dato ausente = `DESCONOCIDO`.
