---
name: acuse-presentacion
description: >
  Skill FULL del módulo PUENTE `acuse-presentacion` de la vertical contabilidad de Enki.
  RECOGE Y LIGA el justificante/acuse que devuelve la ADMINISTRACIÓN a su MODELO y a su
  ASIENTO — el sistema NO presenta: la presentación la hace el ASESOR y aquí solo se ANOTA
  la respuesta que trae de vuelta. El acuse entra tal cual la administración lo devuelve; el
  `mapeo` es declarable y lo ausente queda null + `abierto`. Úsala para operar, depurar o
  extender el puente, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites ligar un acuse/justificante a su modelo y su asiento (RPC
    acuse-presentacion.ligar.request).
  - Cuando depures por qué un acuse no se liga (`ligado:false` + motivo si no hay acuse o no
    trae justificante; 400 INVALID_INPUT si falta project_id).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes
    del puente (el sistema no presenta, no muta el modelo ni el asiento, la ley entra como
    dato, nada se estima).
  - Cuando vayas a escribir/ampliar el test unitario del puente acuse-presentacion.
tags: [enki, modulo, puente, contabilidad, acuse-presentacion]
---

# acuse-presentacion — PUENTE STATELESS del acuse de la administración

## Qué hace el módulo

`acuse-presentacion` es un **PUENTE STATELESS** (D13, hoja del plan): **RECOGE Y LIGA** el
justificante/acuse que devuelve la **ADMINISTRACIÓN** a su **MODELO** y a su **ASIENTO**.
Cierra el bucle **hacia fuera**, por evento.

**EL SISTEMA NO PRESENTA**: la presentación la hace el **ASESOR** en la sede de la
administración. Aquí solo se **ANOTA** la respuesta que el asesor trae de vuelta: un acuse
llega y este puente lo **LIGA** a su modelo (D2/D3) y a su asiento (B2). **Sin acuse no se
inventa un justificante** (`ligado:false` + motivo). Cada respuesta declara
`presentado_por_sistema:false`.

**LA LEY ENTRA COMO DATO** (invariante 5): **NO se cablea ningún formato de acuse, ni código
de administración, ni código de justificante, ni plazo, ni ejercicio**. El acuse entra **TAL
CUAL lo devuelve la administración** (`acuse`, alias `justificante_externo`) y el `mapeo`
(campo canónico → clave del acuse) es **DECLARABLE**; lo que no venga queda `null` y se
declara en `abierto` — **jamás se estima**.

Campos canónicos: `justificante, fecha, administracion, modelo, ejercicio, periodo,
resultado`. Los campos extra del acuse **se conservan** bajo `datos` (no se pierde nada).

**No custodia nada** (el estado de la obligación lo guarda `estado-presentacion-fiscal` D12,
que este puente **NOTIFICA POR EVENTO**) y **no muta** el modelo ni el asiento:
`modelo_mutado:false`, `asiento_mutado:false`.

Es un **PUENTE stateless**: sin `PosPersistencia`, sin `onProjectActivated`. Proyección
`_ligar`. Publica `contabilidad.acuse_ligado`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `acuse-presentacion.ligar.request` | `onLigarRequest` | RPC puente: {project_id, acuse\|justificante_externo, modelo?, asiento?, asiento_clave?, mapeo?} → {ligado:true, acuse:{justificante, fecha, administracion, modelo, ejercicio, periodo, resultado, datos, abierto}, modelo, asiento, adaptador_declarado, presentado_por_sistema:false}. Liga el acuse a su modelo y a su asiento (el sistema no presenta, solo anota). Sin acuse → ligado:false + motivo; sin justificante → ligado:false + motivo (no se fabrica). Exito → publica contabilidad.acuse_ligado y responde por acuse-presentacion.ligar.response; fallo (project_id ausente) → acuse-presentacion.ligar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `acuse-presentacion.ligar.response` | Respuesta RPC correlada de acuse-presentacion.ligar.request → {request_id, status:200, data:{ligado, acuse, modelo, asiento, adaptador_declarado, presentado_por_sistema:false}}. Emitida por el helper _atender. |
| `acuse-presentacion.ligar.failed` | Par de fallo determinista (D13): project_id ausente → {status, error:{code, message}}. Cierra el circulo de acuse-presentacion.ligar.request. |
| `contabilidad.acuse_ligado` | Fire-and-forget (D13): un acuse de la administracion quedo ligado a su modelo y a su asiento → {project_id, acuse, modelo, asiento, justificante, presentado_por_sistema:false, correlation_id}. Lo consume estado-presentacion-fiscal (D12) para registrar el estado presentada/justificada. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `acuse-presentacion.ligar.failed` cierra el círculo de
> `acuse-presentacion.ligar.request` cuando `_ligar` devuelve status ≠ 200 — hoy, **solo
> cuando falta `project_id`**.

> Nota de honestidad (cruce con `index.js`): `onLigarRequest` publica
> `contabilidad.acuse_ligado` **solo si `status === 200 && data.ligado`**; la rama
> `else if (res.status !== 200)` publica `acuse-presentacion.ligar.failed`. Las ramas
> **sin acuse** y **sin justificante** devuelven **`200` con `ligado:false`** → **ni** evento
> **ni** failed: se declara el `motivo` y se responde.

> Nota: a diferencia de `project_id` en otros módulos, aquí el puente **no** rechaza por
> `project_id` ausente en `_ligar` (usa `input.project_id || this.project_id || null`): la
> única vía de `ligar.failed` es la excepción capturada por `_atender` (`500`). La
> `description` del manifest y la implementación coinciden en que el `project_id` ausente
> es el único caso de fallo declarado.

## Reglas de negocio

1. **El acuse es lo que devuelve la administración**: `input.acuse || input.justificante_externo`;
   si no es objeto → `200 {ligado:false, acuse:null, asiento:null, motivo:'no hay acuse de la
   administracion: el sistema no presenta, solo anota lo que el asesor trae',
   presentado_por_sistema:false}`. **No se fabrica.**
2. **Traducción con `mapeo` declarable**: `_aAcuse(datos, mapeo)` recorre `CAMPOS_ACUSE`
   (`justificante, fecha, administracion, modelo, ejercicio, periodo, resultado`), lee
   `datos[mapeo[campo] ?? campo]`; si el valor es `undefined`/`null`/`''` → `null` y se apila
   en `abierto`. **Nada se estima.**
3. **Campos extra conservados**: los del acuse no reconocidos se guardan bajo `value.datos`.
4. **A QUÉ se liga**: `modelo_ref = input.modelo ?? (acuse.modelo != null ? {modelo,
   ejercicio, periodo} : null)`; `asiento_ref = input.asiento ?? (input.asiento_clave != null
   ? {clave} : null)`. **Nunca se inventa.**
5. **Sin justificante no hay acuse ligable**: si `acuse.justificante == null` →
   `200 {ligado:false, acuse, asiento:null, motivo:'el acuse no trae justificante: no se liga
   un justificante inventado', presentado_por_sistema:false}`.
6. **El enlace construido**: `{acuse, modelo, asiento, modelo_mutado:false,
   asiento_mutado:false, presentado_por_sistema:false, ligado_en}`.
7. **`_modeloRef(m)`** normaliza `{modelo, ejercicio, periodo}` a string o `null`.
8. **`adaptador_declarado`**: `Boolean(mapeo)` — refleja si vino `mapeo` en la petición.
9. **El puente NO muta**: `modelo_mutado:false`, `asiento_mutado:false` — solo emite el enlace.
10. **El sistema NO presenta**: `presentado_por_sistema:false` en la respuesta y en el evento.
11. **`abierto`**: la lista de campos canónicos que el acuse no trajo (se declara el hueco).
12. **`project_id` con fallback**: `input.project_id || this.project_id || null` (se propaga;
    no se valida aquí).
13. **HTTP exacto**: éxito `200` (ligado o no); excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `acuse-presentacion.ligar.response` y emite `contabilidad.acuse_ligado`.

### 1. `ligar` — acuse mapeado, ligado a su modelo y su asiento

```json
{
  "project_id": "e57a318a-...",
  "acuse": { "csv": "N-2026-0001", "f_pres": "2026-07-20", "admin": "AEAT", "mod": "303", "res": "ACEPTADA" },
  "mapeo": { "justificante": "csv", "fecha": "f_pres", "administracion": "admin", "modelo": "mod", "resultado": "res" },
  "asiento_clave": "pizzepos:impuesto:2026-2T:0007",
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "ligado": true,
  "acuse": { "justificante": "N-2026-0001", "fecha": "2026-07-20", "administracion": "AEAT", "modelo": "303", "ejercicio": null, "periodo": null, "resultado": "ACEPTADA", "datos": {}, "abierto": ["ejercicio", "periodo"] },
  "modelo": { "modelo": "303", "ejercicio": null, "periodo": null },
  "asiento": { "clave": "pizzepos:impuesto:2026-2T:0007" },
  "adaptador_declarado": true,
  "abierto": ["ejercicio", "periodo"],
  "presentado_por_sistema": false
}
```

Emite `contabilidad.acuse_ligado`:

```json
{ "project_id": "e57a318a-...", "acuse": { "...": "..." }, "modelo": "303", "asiento": { "clave": "pizzepos:impuesto:2026-2T:0007" }, "justificante": "N-2026-0001", "presentado_por_sistema": false, "correlation_id": "abc-123" }
```

Lo consume `estado-presentacion-fiscal` (D12) para registrar el estado `presentada`/`justificada`.

### 2. `ligar` — sin acuse (no se fabrica)

```json
{ "project_id": "e57a318a-..." }
```

Respuesta `200`:

```json
{ "project_id": "e57a318a-...", "ligado": false, "acuse": null, "asiento": null, "motivo": "no hay acuse de la administracion: el sistema no presenta, solo anota lo que el asesor trae", "presentado_por_sistema": false }
```

### 3. `ligar` — acuse sin justificante (no se liga un justificante inventado)

```json
{ "project_id": "e57a318a-...", "acuse": { "resultado": "ACEPTADA" } }
```

Respuesta `200`:

```json
{ "project_id": "e57a318a-...", "ligado": false, "acuse": { "justificante": null, "fecha": null, "administracion": null, "modelo": null, "ejercicio": null, "periodo": null, "resultado": "ACEPTADA", "datos": {}, "abierto": ["justificante","fecha","administracion","modelo","ejercicio","periodo"] }, "asiento": null, "motivo": "el acuse no trae justificante: no se liga un justificante inventado", "presentado_por_sistema": false }
```

## Tests

El test unitario vive en `tests/unit/acuse-presentacion.test.js`. Cubre:

- `ligar` con acuse + mapeo + modelo/asiento → `200 {ligado:true}` con `abierto` de los
  ausentes, `adaptador_declarado:true`, `modelo_mutado:false`, `asiento_mutado:false`; emite
  `contabilidad.acuse_ligado`.
- Acuse canonico sin mapeo → identidad por nombre canónico; `adaptador_declarado:false`.
- Sin `acuse` → `200 {ligado:false, motivo}` (no emite evento ni par de fallo).
- Acuse sin `justificante` → `200 {ligado:false, motivo}`.
- `modelo` derivado del propio acuse cuando no se declara; `asiento` desde `asiento_clave`.
- Campos extra del acuse → conservados en `datos`.
- `presentado_por_sistema:false` siempre presente.
- `toolLigar` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `AcusePresentacion extends ModuloHibridoReflejo`; `name = 'acuse-presentacion'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store, sin `onProjectActivated`
  (PUENTE stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-fiscal/acuse-presentacion/`).
- Constante `CAMPOS_ACUSE = ['justificante','fecha','administracion','modelo','ejercicio',
  'periodo','resultado']`.
- `onLigarRequest` usa `this._atender(e, 'ligar', 'acuse-presentacion.ligar.response',
  async (d) => {...})`; dentro hace el cierre de círculo: en `200 && ligado` publica
  `contabilidad.acuse_ligado`, si `status !== 200` publica `acuse-presentacion.ligar.failed`.
- Proyección `_ligar(input)`; helpers `_aAcuse(datos, mapeo)`, `_modeloRef(m)`. Tool
  `toolLigar`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: **notifica POR EVENTO** a `estado-presentacion-fiscal` (D12) vía
  `contabilidad.acuse_ligado`, que es quien custodia el estado presentada/justificada. Este
  puente no custodia nada.
