---
name: alta-activo
description: >
  Skill FULL del módulo CUSTODIO `alta-activo` de la vertical contabilidad de Enki.
  La PARCELA DEL INMOVILIZADO: la ficha declarable de cada bien (valor, fecha, vida útil y
  método como DATO), raíz del grupo F — sin esta ficha no hay amortización, ni valor neto, ni
  baja. Un solo escritor y cero valores estimados: lo que el negocio no declara queda `null` y
  se anuncia en `abierto`. Persiste por proyecto con PosPersistencia. Úsala para operar, depurar
  o extender el custodio, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites registrar/actualizar la ficha de un bien del inmovilizado (RPC
    alta-activo.registrar.request).
  - Cuando depures por qué se rechaza el alta (403 PERMISSION_DENIED si el rol no es
    ALTA_INMOVILIZADO, 400 INVALID_INPUT si falta project_id o activo.id_activo) o por qué un
    campo sale `null` (no declarado: aparece en `abierto`).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes del
    custodio (un solo escritor, UPSERT con historial, nada cableado, valoración hidratada).
  - Cuando vayas a escribir/ampliar el test unitario del custodio alta-activo.
tags: [enki, modulo, custodio, contabilidad, alta-activo]
---

# alta-activo — CUSTODIO CON PERSISTENCIA del inmovilizado

## Qué hace el módulo

`alta-activo` es un **CUSTODIO CON PERSISTENCIA** (F1, hoja del plan): **LA PARCELA DEL
INMOVILIZADO** — la ficha de cada **BIEN** de la empresa (la máquina, el vehículo, el local, el
ordenador). Es la **raíz del grupo F**: sin esta ficha **no hay** amortización (F2), ni valor neto
(F4), ni baja (F3).

**LOS DATOS DEL BIEN SON DECLARABLES**: su valor, su fecha de alta, su vida útil y su método
entran como **DATO declarado** por el negocio. El módulo **NUNCA** los estima, **NUNCA** inventa
una vida útil, **NUNCA** asume un valor residual ni un método. Un dato que no llega queda `null` =
**desconocido** y se declara en `abierto` — **jamás se rellena con un valor por defecto**.

**LA VALORACIÓN DEL ALTA ES REFLEJO HIDRATADOR**: el módulo **RECIBE** la valoración ya hecha (el
valor del bien llega declarado); no la calcula ni la deriva.

**UN SOLO ESCRITOR**: solo el camino de alta (rol `ALTA_INMOVILIZADO`) registra activos;
cualquier otro rol es rechazado (**segundo escritor → 403**).

Invariantes:

- **`registrar` es UPSERT declarativo por `id_activo`**: el mismo id **ACTUALIZA** la ficha (el
  dueño corrige) y **apila** el cambio en su historial; **nunca se borra en silencio**.
- **Nada cableado**: ninguna vida útil fiscal, ningún coeficiente, ningún método, ningún tipo de
  bien, ninguna cuenta contable. Todo entra como dato declarado.
- **Persiste por proyecto con PosPersistencia**, restaura en `project.activated` y vuelca en
  `onUnload`.

Proyección `_registrar`. Publica `contabilidad.activo_registrado`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `alta-activo.registrar.request` | `onRegistrarRequest` | RPC custodio (escritura, UNICO ESCRITOR): {project_id, rol:'ALTA_INMOVILIZADO', activo:{id_activo, denominacion?, valor?, fecha_alta?, vida_util?, metodo?, valor_residual?, cuenta?, tipo?, moneda?}} → {project_id, activo, alta:true\|false, actualizado, abierto:[campos no declarados]}. UPSERT declarativo por id_activo (mismo id actualiza y apila en historial). Los campos del bien son ParametroDeclarable: lo ausente queda null y se declara en `abierto` (nada se estima). Exito → publica contabilidad.activo_registrado y responde por alta-activo.registrar.response; rol distinto de ALTA_INMOVILIZADO → 403; project_id o activo.id_activo ausente → alta-activo.registrar.failed. |
| `project.activated` | `onProjectActivated` | Restaura la parcela del inmovilizado del proyecto activado desde el storage (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `alta-activo.registrar.response` | Respuesta RPC correlada de alta-activo.registrar.request → {request_id, status:200, data:{activo, alta, actualizado, abierto}}. Emitida por el helper _atender. |
| `alta-activo.registrar.failed` | Par de fallo determinista (F1): segundo escritor (rol distinto de ALTA_INMOVILIZADO → 403) o activo.id_activo/project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de alta-activo.registrar.request. |
| `contabilidad.activo_registrado` | Fire-and-forget (F1): un bien quedo en la parcela del inmovilizado → {project_id, id_activo, activo, alta, actualizado, abierto, correlation_id}. Lo LEEN plan-amortizacion (F2, genera su tabla), valor-neto-contable (F4, al balance) y baja-activo (F3, al retirar el bien). |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `alta-activo.registrar.failed` cierra el círculo de `alta-activo.registrar.request` cuando
> `_registrar` devuelve status ≠ 200 (`400`/`403`).

> Nota de honestidad (cruce con `index.js`): `onRegistrarRequest` publica
> `contabilidad.activo_registrado` **solo si `_registrar` devuelve `200`**; la rama `else` publica
> `alta-activo.registrar.failed`. El payload del evento lleva
> `{project_id, id_activo, activo, alta, actualizado, abierto, correlation_id}`.

> Nota: el módulo expone `activosDe(pid)` como **lectura directa** para otras hojas del mismo
> proceso (no muta) — no es un evento del bus, no figura en `module.json`. Tampoco figura
> `_obtenerOCrear(pid)` ni `_num` (utilidades internas).

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`).
2. **GUARD de escritor**: `_registrar` exige `input.rol === 'ALTA_INMOVILIZADO'` (constante
   `ROL_ESCRITOR`). Cualquier otro rol → `403 PERMISSION_DENIED` con
   `{rol_esperado:'ALTA_INMOVILIZADO', rol_recibido:<rol ?? null>}`.
3. **Identidad del bien**: la fuente es `input.activo` (objeto) o `input` si no; `id_activo` se
   toma con `String(...).trim()`; vacío → `400 INVALID_INPUT` (`field:'activo.id_activo'`).
4. **UPSERT declarativo**: si el bien ya existe se **reusa el objeto** (conserva `registrado_en`,
   `estado` e `historial`) y `actualizado:true`, `alta:false`; si es nuevo se crea con
   `estado:'ALTA'`, `historial:[]` y `alta:true`, `actualizado:false`.
5. **El molde del bien** (`CAMPOS_ACTIVO`): `['id_activo', 'denominacion', 'valor', 'fecha_alta',
   'vida_util', 'metodo', 'valor_residual', 'cuenta', 'tipo', 'moneda']`. Solo los **nombres** del
   molde: **ningún valor cableado**.
6. **Lo ausente NO se estima**: para cada campo, si llega `undefined`/`null`/`''` → se toma el
   valor del existente (salvo `id_activo`) o `null`, y el nombre del campo se **apila en `abierto`**.
   `valor` y `valor_residual` se normalizan con `_num` (no finito → `null`).
7. **`abierto` del bien y de la respuesta**: `activo.abierto` = los campos no declarados (sin
   `id_activo`); la respuesta repite la lista en `data.abierto`.
8. **Sellos**: `registrado_en` se fija la primera vez (`|| ahora`); `updated_at` se sella siempre
   con `new Date().toISOString()`.
9. **Historial (nada se borra en silencio)**: cada alta/actualización **APPENDEA** a
   `activo.historial` un registro `{estado, valor, por:'ALTA_INMOVILIZADO', en:ahora}`.
10. **Orden estable por alta**: el id nuevo se empuja a `parcela.orden` solo si no estaba.
11. **Un valor que no es número NO se estima**: `declarado.valor === undefined` → se fuerza `null`.
12. **Persistencia**: `PosPersistencia` con `marcarDirty(pid)` en cada escritura;
    `project.activated` → `restaurar(project_id)` (reconstruye `activos` + `orden`);
    `onUnload` → `flush()` + `detener()`.
13. **HTTP exacto**: éxito `200`; rol inválido → `403`; `project_id`/`activo.id_activo` ausentes →
    `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `alta-activo.registrar.response` y emite `contabilidad.activo_registrado`.

### 1. `registrar` — el alta declarada del bien

```json
{
  "project_id": "e57a318a-...",
  "rol": "ALTA_INMOVILIZADO",
  "activo": { "id_activo": "MAQ-01", "denominacion": "Horno de túnel", "valor": 48000, "fecha_alta": "2026-01-15", "vida_util": 10, "metodo": "lineal", "valor_residual": 0, "cuenta": "212", "tipo": "maquinaria", "moneda": "EUR" },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "activo": { "id_activo": "MAQ-01", "denominacion": "Horno de túnel", "valor": 48000, "fecha_alta": "2026-01-15", "vida_util": 10, "metodo": "lineal", "valor_residual": 0, "cuenta": "212", "tipo": "maquinaria", "moneda": "EUR", "estado": "ALTA", "abierto": [], "registrado_en": "2026-09-25T...", "updated_at": "2026-09-25T...", "historial": [ { "estado": "ALTA", "valor": 48000, "por": "ALTA_INMOVILIZADO", "en": "2026-09-25T..." } ] },
  "alta": true,
  "actualizado": false,
  "abierto": []
}
```

Emite `contabilidad.activo_registrado` (lo LEEN plan-amortizacion F2, valor-neto-contable F4 y
baja-activo F3):

```json
{ "project_id": "e57a318a-...", "id_activo": "MAQ-01", "activo": { "...": "..." }, "alta": true, "actualizado": false, "abierto": [], "correlation_id": "abc-123" }
```

### 2. `registrar` — actualización (corregir la ficha)

Mismo `id_activo` con `valor: 47000` → `200 {alta:false, actualizado:true}`; el `historial`
**crece** y `registrado_en` **se conserva**. **Nada se borra en silencio.**

### 3. `registrar` — lo no declarado queda `null` y en `abierto`

```json
{ "project_id": "e57a318a-...", "rol": "ALTA_INMOVILIZADO", "activo": { "id_activo": "VEH-02", "denominacion": "Furgoneta" } }
```

`200` con `valor:null`, `fecha_alta:null`, `vida_util:null`, `metodo:null`, `valor_residual:null`,
`cuenta:null`, `tipo:null`, `moneda:null` y
`abierto:["denominacion" no; los no declarados: "valor","fecha_alta","vida_util","metodo","valor_residual","cuenta","tipo","moneda"]`
(en concreto todos los campos del molde no declarados). **Ninguna vida útil ni valor por defecto**:
la ficha declara lo que falta.

### 4. Fallo — segundo escritor

Respuesta `403` + `alta-activo.registrar.failed`:

```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo el camino de alta (ALTA_INMOVILIZADO) registra activos en la parcela del inmovilizado", "details": { "rol_esperado": "ALTA_INMOVILIZADO", "rol_recibido": "OTRO" } } }
```

### 5. Fallo — sin identidad de bien

Respuesta `400 INVALID_INPUT` con `{field:'activo.id_activo'}` + el par `failed`.

## Tests

El test unitario de la vertical vive en `tests/unit/alta-activo.test.js`. Cubre:

- `registrar` con rol `ALTA_INMOVILIZADO` → `200 {alta:true, actualizado:false}` y emite
  `contabilidad.activo_registrado`.
- Otro rol → `403 PERMISSION_DENIED` + `.registrar.failed`.
- Sin `id_activo` → `400 INVALID_INPUT` (`field:'activo.id_activo'`); sin `project_id` → `400`.
- **UPSERT**: re-registrar el mismo `id_activo` → `actualizado:true`, el historial crece y
  `registrado_en` se conserva.
- **Campos declarables**: un campo ausente queda `null` y aparece en `abierto`; un `valor` no
  numérico queda `null` (**no se estima**).
- **Nada cableado**: ninguna vida útil, método, tipo ni cuenta por defecto.
- `project.activated` restaura la parcela; `activosDe(pid)` lee sin mutar.
- `toolRegistrar` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `AltaActivo extends ModuloHibridoReflejo`; `name = 'alta-activo'`, `version =
  'reflejo-0.1.0'`. Store en memoria `this._parcelas`
  (`Map<project_id, {esquema, activos: Map<id_activo, Activo>, orden:[]}>`). Esquema
  `'contabilidad-alta-activo-v1'`.
- Constantes: `ROL_ESCRITOR = 'ALTA_INMOVILIZADO'` y `CAMPOS_ACTIVO = ['id_activo',
  'denominacion', 'valor', 'fecha_alta', 'vida_util', 'metodo', 'valor_residual', 'cuenta',
  'tipo', 'moneda']` (solo nombres del molde).
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file: 'alta-activo.json', dir:
  '/contabilidad/alta-activo', snapshot, hidratar })` desde
  `modules/contabilidad-analitica/alta-activo/` (DOS niveles → `../../_shared/pos-persistencia`).
  `onProjectActivated` → `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`;
  `marcarDirty(pid)` en cada escritura.
- `onRegistrarRequest` usa `this._atender(e, 'registrar', 'alta-activo.registrar.response',
  async (d) => {...})` con cierre de círculo (evento de dominio en `200`, par `failed` si no).
- Proyección `_registrar(input)` (**síncrona** + GUARD de escritor); helper `_obtenerOCrear`;
  lectura directa `activosDe(pid)`. Tool `toolRegistrar`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: lo LEEN `plan-amortizacion` (F2), `valor-neto-contable` (F4) y `baja-activo` (F3) vía
  `contabilidad.activo_registrado`. Las lecturas por evento `alta-activo.listar.request` **no
  existen** en este module.json (la lectura directa es `activosDe`).
- **PARÁMETRO COMO DATO**: valor, fecha, vida útil, método, valor residual, tipo y cuenta son
  **declarables**; el código **no asume** ninguna vida útil fiscal ni método. El alta **recibe** el
  valor ya declarado (valoración hidratada): no lo deriva.
