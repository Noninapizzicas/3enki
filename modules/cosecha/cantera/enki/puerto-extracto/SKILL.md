---
name: puerto-extracto
description: >
  Skill FULL del módulo CONVERSOR `puerto-extracto` de la vertical contabilidad de
  Enki (E2, hoja del plan). Frontera del CANAL/FORMATO del extracto bancario: un
  adaptador por fuente, puesto en el sitio de despliegue, REEMPLAZABLE. Si falta una
  fuente → SE CREA (invariante de puerto abierto). Devuelve los movimientos ya en la
  forma canónica MovimientoBancario (id_movimiento, cuenta_bancaria, fecha, importe
  con SIGNO, moneda, descripcion, contrapartida; NINGUNA si no se identifica). Las
  credenciales del canal se piden a `credential-manager` por EVENTO
  (credential.resolve.request), JAMÁS por require cruzado. Es stateless: entra objeto,
  sale objeto. Úsala para operar, depurar o extender el conversor, o para entender su
  contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites leer/normalizar el extracto de un canal bancario
    (RPC contabilidad.extracto.leer.request) o registrar la forma de un canal
    (RPC contabilidad.extracto.registrar_forma.request).
  - Cuando depures por qué leer falla (404 RESOURCE_NOT_FOUND con accion
    REGISTRAR_ADAPTADOR si no hay adaptador, 502 AUTHENTICATION_REQUIRED si
    credential-manager no resuelve la credencial, 400 INVALID_INPUT si falta
    project_id/canal).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), el puerto
    abierto ("si falta una fuente se crea") y la credencial por evento.
  - Cuando vayas a escribir/ampliar el test unitario del conversor puerto-extracto.
tags: [enki, modulo, conversor, contabilidad, puerto-extracto, banco, extracto]
---

# puerto-extracto — CONVERSOR de la frontera del extracto bancario

## Qué hace el módulo

`puerto-extracto` es un **CONVERSOR STATELESS** (E2, hoja del plan): la **frontera del
CANAL/FORMATO del extracto bancario**. Su diseño es un **adaptador por fuente**,
puesto en el sitio de despliegue y **REEMPLAZABLE**; si falta una fuente → **SE CREA**
(invariante de **puerto abierto**). Devuelve los movimientos ya en la **forma canónica
`MovimientoBancario`** del diseño OOP: `id_movimiento`, `cuenta_bancaria`, `fecha`,
`importe` **con SIGNO**, `moneda`, `descripcion`, `contrapartida` (que es `NINGUNA`
si no se identifica).

Las **credenciales del canal** se piden a `credential-manager` **por EVENTO**
(`credential.resolve.request`), **jamás por `require` cruzado** — el puerto no conoce
el almacén de credenciales, solo el canal.

Es **stateless**: sin PosPersistencia ni `project.activated` — entra objeto, sale
objeto. El **catálogo de adaptadores declarados** vive **en memoria del propio puerto**
(es configuración del adaptador, **no** una parcela persistente).

> **NO REUTILIZA**: ningún módulo del inventario lee extractos bancarios
> (`conciliacion` = 0 módulos). Lo consumen `conciliacion-bancaria` (E1) y
> `partida-no-identificada` (E7).

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.extracto.leer.request` | `onLeerRequest` | RPC conversor: {project_id, canal, movimientos?:[crudo], moneda?} → {project_id, canal, moneda_base, movimientos:[MovimientoBancario], n}. Normaliza el extracto del canal a la forma canonica MovimientoBancario (importe con signo, contrapartida NINGUNA si no se identifica) y resuelve la credencial del canal por EVENTO con credential-manager. 404 si no hay adaptador para el canal (accion REGISTRAR_ADAPTADOR: la fuente se crea, no se fuerza). Publica contabilidad.extracto_leido y responde por contabilidad.extracto.leer.response; si el payload es invalido, el canal es desconocido o no hay credencial → contabilidad.extracto.leer.failed. |
| `contabilidad.extracto.registrar_forma.request` | `onRegistrarFormaRequest` | RPC conversor: {project_id?, canal, formato?, credencial_ref?, moneda?} → {canal, adaptador, creado:true}. Catalogo DECLARABLE de adaptadores de canal: si falta una fuente, SE CREA (invariante de puerto abierto). Responde por contabilidad.extracto.registrar_forma.response; si el payload es invalido → contabilidad.extracto.registrar_forma.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.extracto_leido` | Fire-and-forget (E2): el extracto de un canal quedo leido y normalizado a movimientos bancarios → {project_id, canal, movimientos, n, moneda_base}. Lo consume conciliacion-bancaria (E1) para el cruce por clave natural y reglas, y partida-no-identificada (E7). |
| `contabilidad.extracto.leer.failed` | Par de fallo determinista: canal desconocido (404, la fuente se crea), credencial no resuelta por credential-manager (502), o payload invalido. Cierra el circulo de contabilidad.extracto.leer.request. |
| `contabilidad.extracto.registrar_forma.failed` | Par de fallo determinista: registrar la forma del canal con payload invalido (sin canal). Cierra el circulo de contabilidad.extracto.registrar_forma.request. |
| `contabilidad.extracto_leido.failed` | Par de fallo del evento de dominio contabilidad.extracto_leido: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.extracto.leer.failed` cierra `contabilidad.extracto.leer.request`;
> `contabilidad.extracto.registrar_forma.failed` cierra
> `contabilidad.extracto.registrar_forma.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.extracto.leer.response` y `contabilidad.extracto.registrar_forma.response`
> (los pares response de los RPC); no están declaradas en `publishes`. Además
> `_leer` realiza un **RPC saliente** a `credential.resolve.request` vía `this._rpc(...)`
> (timeout 4000 ms) para resolver la credencial del canal: es una dependencia por
> EVENTO con `credential-manager`, no declarada en el `module.json` de este módulo.

## Reglas de negocio

1. **Un adaptador por canal, reemplazable**: el catálogo vive en memoria
   (`this._adaptadores`, Map `canal → {canal, formato, credencial_ref, moneda,
   registrado_en, registrado_por}`). Los canales que el puerto **sabe de fábrica** son
   `CANALES_BASE = {FICHERO_NORMALIZADO, API_BANCARIA, CSV_MANUAL}`.
2. **Puerto abierto — si falta una fuente, SE CREA**: `leer` de un canal sin adaptador
   ni en `CANALES_BASE` → **`404 RESOURCE_NOT_FOUND`** con
   `{ canal, accion:'REGISTRAR_ADAPTADOR', invariante:'puerto_abierto_se_crea' }`. No se
   fuerza ni se inventa el canal: se indica la acción para crearlo.
   `registrar_forma` lo materializa (siempre `creado:true`).
3. **Credencial por EVENTO (no require)**: si el adaptador tiene `credencial_ref` y no
   trae credencial, `_leer` llama a `credential.resolve.request` con
   `{ project_id, key: credencial_ref }`. Si no resuelve → **`502
   AUTHENTICATION_REQUIRED`** con `{ canal, credencial_ref }`. El puerto nunca accede
   al almacén de credenciales directamente.
4. **Forma canónica `MovimientoBancario`**: `_aMovimiento` normaliza cada crudo:
   `id_movimiento` (o `id`, o `${pid}-${canal}-m<i>`), `cuenta_bancaria` (o `cuenta`/
   `iban`), `fecha` (o `date`), `importe` (o `amount`, **redondeado a 2 dec.**, con
   signo; `null` si no es finito), `moneda` (o `currency`), `descripcion` (o
   `concepto`/`description`), `contrapartida` (**`'NINGUNA'`** si no se identifica).
5. **Sin contenido → lista vacía (honesto)**: si la fuente no aporta
   `payload.movimientos`/`movimientos`, `movimientos = []` y `n = 0`. No se inventan
   movimientos.
6. **Validaciones deterministas**: falta `project_id` (en `leer`) → `400 INVALID_INPUT
   project_id`; falta `canal` → `400 INVALID_INPUT canal`. `registrar_forma` exige
   `canal` (no exige `project_id`). Shape: `{ status:400, error:{ code:'INVALID_INPUT',
   message:'<campo> requerido', details:{ field:<campo> } } }`.
7. **El canal se normaliza a mayúsculas**: `String(...).toUpperCase()` antes de buscar
   o registrar el adaptador.
8. **La ley entra como DATO**: los canales y su forma (`formato`, `credencial_ref`,
   `moneda`) son **declarables** vía `registrar_forma`, no constantes cableadas más
   allá de los tres canales base.
9. **HTTP exacto**: éxito `200`; payload inválido → `400`; canal desconocido → `404`;
   credencial no resuelta → `502`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.extracto.leer.response` y
`contabilidad.extracto.registrar_forma.response`.

### 1. `registrar_forma` — declarar/crear el adaptador de un canal

```json
{ "project_id": "e57a318a-...", "canal": "banco_x", "formato": "CSV", "credencial_ref": "banco_x_token", "moneda": "EUR" }
```
Respuesta `200`:
```json
{ "canal": "BANCO_X", "adaptador": { "canal": "BANCO_X", "formato": "CSV", "credencial_ref": "banco_x_token", "moneda": "EUR", "registrado_en": "2026-09-28T...", "registrado_por": "DUENO" }, "creado": true }
```

### 2. `leer` — leer y normalizar el extracto de un canal

```json
{
  "project_id": "e57a318a-...",
  "canal": "FICHERO_NORMALIZADO",
  "moneda": "EUR",
  "movimientos": [
    { "id": "m1", "cuenta": "ES91...", "fecha": "2026-09-01", "importe": -45.5, "concepto": "COMISION" },
    { "id": "m2", "fecha": "2026-09-02", "amount": 1200.0, "contrapartida": "57200001" }
  ],
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "canal": "FICHERO_NORMALIZADO",
  "moneda_base": "EUR",
  "movimientos": [
    { "id_movimiento": "m1", "cuenta_bancaria": "ES91...", "fecha": "2026-09-01", "importe": -45.5, "moneda": null, "descripcion": "COMISION", "contrapartida": "NINGUNA" },
    { "id_movimiento": "m2", "cuenta_bancaria": null, "fecha": "2026-09-02", "importe": 1200, "moneda": null, "descripcion": null, "contrapartida": "57200001" }
  ],
  "n": 2,
  "adaptador_conocido": true
}
```
Emite `contabilidad.extracto_leido` (res.data + `correlation_id`).

### Fallo — canal desconocido (la fuente se crea, no se fuerza)

```json
{ "project_id": "e57a318a-...", "canal": "banco_nuevo" }
```
Respuesta `404` + `contabilidad.extracto.leer.failed`:
```json
{ "status": 404, "error": { "code": "RESOURCE_NOT_FOUND", "message": "no hay adaptador para el canal BANCO_NUEVO", "details": { "canal": "BANCO_NUEVO", "accion": "REGISTRAR_ADAPTADOR", "invariante": "puerto_abierto_se_crea" } } }
```

### Fallo — credencial no resuelta

Si `credential-manager` no devuelve la credencial → `502 AUTHENTICATION_REQUIRED`
con `{ canal, credencial_ref }`, y `contabilidad.extracto.leer.failed`.

### Tools (sin RPC en module.json)

`toolLeer` → `_leer`; `toolRegistrarAdaptador` → `_registrarAdaptador`.

## Tests

El test vive en `tests/unit/puerto-extracto.test.js`. Cubre:

- `registrar_forma` de un canal → `200 {creado:true}`; el canal queda en el catálogo.
- `leer` de un canal base (`FICHERO_NORMALIZADO`) con movimientos → `200`, movimientos
  en forma canónica con signo y `contrapartida:'NINGUNA'` si no se identifica; emite
  `contabilidad.extracto_leido`.
- `leer` de un canal desconocido → `404 RESOURCE_NOT_FOUND` +
  `{accion:'REGISTRAR_ADAPTADOR'}` + `contabilidad.extracto.leer.failed`.
- `leer` con adaptador que tiene `credencial_ref` y `credential-manager` no resuelve →
  `502 AUTHENTICATION_REQUIRED`.
- `leer` sin `movimientos` → `200` con `movimientos:[]`, `n:0` (no inventa).
- `leer` sin `project_id`/`canal` → `400 INVALID_INPUT` + par de fallo.
- `registrar_forma` sin `canal` → `400 INVALID_INPUT` + `contabilidad.extracto.registrar_forma.failed`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/puerto-extracto
node --test tests/unit/puerto-extracto.test.js
```

## Notas de implementación

- Clase `PuertoExtracto extends ModuloHibridoReflejo`; `name = 'puerto-extracto'`,
  `version = 'reflejo-0.1.0'`. **Sin PosPersistencia ni `project.activated`**; el
  catálogo de adaptadores vive en memoria (`this._adaptadores = new Map()`).
- Constante `CANALES_BASE` (Set de los 3 canales de fábrica).
- `onLeerRequest` delega en `_atender(e, 'leer', 'contabilidad.extracto.leer.response', fn)`;
  `onRegistrarFormaRequest` en `_atender(e, 'registrar_forma',
  'contabilidad.extracto.registrar_forma.response', fn)`. El handler de `leer` emite el
  evento de dominio o el par determinista según el `status`.
- Proyecciones: `_leer` (async, puede llamar a `credential.resolve.request`),
  `_registrarAdaptador` (mutación en memoria del catálogo), `_aMovimiento` (forma
  canónica). `_invalid` → 400 INVALID_INPUT `{field}`; `_errorResponse(status,code,msg,details)`
  y `_rpc(evento, payload, {timeout_ms})` vienen de la base; `_round(x,2)` de la base.
- Tools: `toolLeer`, `toolRegistrarAdaptador`.
- DEP hacia delante: lo consumen `conciliacion-bancaria` (E1) para el cruce por clave
  natural y reglas, y `partida-no-identificada` (E7). DEP hacia atrás por evento:
  `credential-manager` (`credential.resolve.request`).
