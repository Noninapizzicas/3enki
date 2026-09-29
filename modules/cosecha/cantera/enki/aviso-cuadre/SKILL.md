---
name: aviso-cuadre
description: >
  Skill FULL del módulo PUENTE `aviso-cuadre` de la vertical contabilidad de Enki.
  El EMPUJÓN honesto del cuadre: si LA métrica única de cobertura no está completa,
  AVISA — LEE la métrica (`completitud-cobertura`) y NO la recalcula; si no hay
  métrica, no finge ni el cuadre ni el descuadre. Úsala para operar, depurar o
  extender el puente, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites saber si el cuadre de un proyecto necesita aviso (RPC
    aviso-cuadre.avisar.request).
  - Cuando depures por qué no hay aviso (`avisa:false` sin métrica, o `motivo` con la
    cobertura no declarada / no completa; 400 INVALID_INPUT si falta project_id).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes del puente (lee la métrica, no la recalcula; sin métrica no se finge).
  - Cuando vayas a escribir/ampliar el test unitario del puente aviso-cuadre.
tags: [enki, modulo, puente, contabilidad, aviso-cuadre]
---

# aviso-cuadre — PUENTE STATELESS del cuadre honesto

## Qué hace el módulo

`aviso-cuadre` es un **PUENTE STATELESS** (C6, hoja del plan): el **EMPUJÓN honesto
del cuadre**. Si **LA métrica única de cobertura** dice que **FALTA** algo, este
puente **AVISA**. **NO finge el cuadre** y **NO recalcula la métrica: la LEE**.

De dónde LEE la cobertura, en este orden, y **declarando el origen**:

1. lo declarado en la propia petición (`cobertura`) → `origen_cobertura:'declarada_en_peticion'`,
2. la última `contabilidad.cobertura_medida` que pasó por el bus (espejo en memoria)
   → `origen_cobertura:'cobertura_medida'`,
3. se la **PIDE** a `completitud-cobertura` **POR EVENTO** (RPC `completitud-cobertura.medir.request`)
   → `origen_cobertura:'completitud-cobertura'`.

Invariantes:

- **Si NO hay métrica, NO se afirma cuadre ni descuadre**: `avisa:false`, `aviso:null`,
  `cobertura:null`, `cubre:null` y `motivo` declarado (invariante 7: dato ausente =
  desconocido; nada se estima).
- **Una cobertura «cubre» SOLO si está declarada y completa**
  (`declarada === true && completa === true`).
- El **DESTINO** del aviso es `ParametroDeclarable` ([ABIERTO] Q70: quién actúa); sin
  destino declarado **NO se inventa**: `destino:null`, `destino_declarado:false`.
- Es **PURO y sin estado de dominio**: solo guarda el último **espejo** de la métrica
  leída para poder avisar de forma proactiva; **no recuerda avisos ni decide nada**.
- **La ley entra como DATO**: no se cablea ningún umbral ni regla de cuadre; la
  cobertura es la que mide `completitud-cobertura` y el destino lo declara el negocio.

Sin `PosPersistencia` y sin `project.activated`: no es custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `aviso-cuadre.avisar.request` | `onAvisarRequest` | RPC puente: {project_id, vertical?, ejercicio?, cobertura?, destino?} → {cobertura, origen_cobertura, cubre, aviso, avisa, destino_declarado}. LEE la metrica unica (peticion → espejo de contabilidad.cobertura_medida → RPC a completitud-cobertura.medir); NO la recalcula. Si la cobertura no cubre, produce el Aviso con su motivo y su destino declarable; si no hay metrica, avisa:false sin inventar. Exito con aviso → publica contabilidad.aviso_cuadre y responde por aviso-cuadre.avisar.response; fallo (project_id ausente) → aviso-cuadre.avisar.failed. |
| `contabilidad.cobertura_medida` | `onCoberturaMedida` | Fire-and-forget (A12 → C6): completitud-cobertura publico que LA metrica unica quedo medida → {project_id, vertical, cobertura, correlation_id}. Se refleja la medida y, si NO esta completa, se empuja el aviso de forma proactiva por la misma proyeccion `_avisar`; si cubre, no se emite nada (el puente no finge un cuadre que no hace falta avisar). |

### Publishes

| Evento | Descripción |
|---|---|
| `aviso-cuadre.avisar.response` | Respuesta RPC correlada de aviso-cuadre.avisar.request → {request_id, status:200, data:{cobertura, origen_cobertura, cubre, aviso, avisa, destino_declarado}}. Emitida por el helper _atender. |
| `aviso-cuadre.avisar.failed` | Par de fallo determinista (C6): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de aviso-cuadre.avisar.request y de contabilidad.cobertura_medida. |
| `contabilidad.aviso_cuadre` | Fire-and-forget (C6): la cobertura no estaba completa y el aviso de cuadre quedo empujado con su motivo y su destino declarable → {project_id, aviso, destino, correlation_id}. Lo consume motor-avisos (que produce el aviso al negocio/asesor). |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `aviso-cuadre.avisar.failed` cierra el círculo de `aviso-cuadre.avisar.request`
> (lo publica `onAvisarRequest` cuando `_avisar` devuelve status ≠ 200) **y** el de
> `contabilidad.cobertura_medida` (misma proyección `_avisar`).

> Nota de honestidad (cruce con `index.js`): en `onCoberturaMedida`, si la cobertura
> **sí** cubre el handler devuelve `null` **sin publicar nada**; y en el camino de la
> métrica, `_avisar` solo puede devolver ≠ 200 si falta `project_id`, que `onCoberturaMedida`
> ya filtra antes — así que el par `failed` que declara el manifest para
> `contabilidad.cobertura_medida` es un par **declarado** que en la práctica no llega a
> emitirse desde ese handler.

> Nota: no figura en `module.json` pero lo **pide** `index.js` en `_leerCobertura`: la
> RPC saliente `completitud-cobertura.medir.request` con `{project_id, vertical}` y
> `timeout_ms:4000`. Es una dependencia (DEP) por evento, no un evento emitido.

> Nota: el módulo expone `toolAvisar(params)` como **tool directa** (misma proyección
> `_avisar`) — no es un evento del bus, no figura en `module.json`.

## Reglas de negocio

1. **Fallo determinista**: `_avisar` toma `input.project_id || this.project_id`; ausente
   → `400 INVALID_INPUT` (`field:'project_id'`).
2. **Se LEE, no se recalcula**: `_leerCobertura(pid, input)` prueba en este orden
   (1) `input.cobertura` objeto → `origen:'declarada_en_peticion'`; (2) el espejo en
   memoria del `project_id` → `origen:'cobertura_medida'`; (3) `completitud-cobertura.medir.request`
   **por evento**; si responde `200` con `data.cobertura` → `origen:'completitud-cobertura'`.
   Si nada de eso da métrica → `{medida:null, origen:null}`. **Nunca la recalcula aquí.**
3. **Sin métrica no se finge (invariante 7)**: `200` con `cobertura:null`,
   `origen_cobertura:null`, `cubre:null`, `aviso:null`, `avisa:false` y
   `motivo:'no hay metrica de cobertura disponible: el puente no finge el cuadre'`.
4. **«Cubre» = declarada Y completa**: `_cubre(c)` es `true` **solo** si `c` es objeto y
   `c.declarada === true && c.completa === true`. No declarada o incompleta → hay hueco.
5. **El motivo del aviso se declara**: si `cobertura.declarada !== true` →
   `'la cobertura no esta declarada: no hay expectativa declarada con la que medir el cuadre'`;
   si está declarada pero no completa → `faltan <n> hecho(s) por llegar: hay huecos
   declarados` (con el número de `huecos`), o `'la cobertura no esta completa: hay
   huecos declarados'` si no se puede contar.
6. **El Aviso es un objeto declarado**: `{asunto:'cuadre', vertical, motivo,
   cobertura:{declarada, tasa, huecos, completa}, destino, destino_declarado,
   requiere_revision:true, avisado_en}`. `avisado_en` se sella con
   `new Date().toISOString()`.
7. **El destino es DATO declarable ([ABIERTO] Q70)**: `_destinoDeclarado(raw)` es `true`
   si `raw` no es `undefined`/`null` y `String(raw).trim().length > 0`; `_destino(raw)`
   devuelve la cadena recortada o `null`. **Nunca se inventa un destino.**
8. **`avisa` es `Boolean(aviso)`**: `true` solo cuando se produjo el aviso (cobertura
   medida y no cubre); `false` cuando no hay métrica o cuando sí cubre.
9. **Espejo proactivo, no memoria de avisos**: `onCoberturaMedida` guarda
   `this._medidas.set(pid, {cobertura, vertical, medida_en})` (con `medida_en` sellado) y,
   si **no** cubre, empuja el aviso por la misma `_avisar`; si **cubre**, no emite nada.
   El espejo NO recuerda avisos ni decisiones.
10. **`ejercicio`/`vertical` se propagan** de `input` o quedan `null` (etiquetas).
11. **Sin estado persistente**: sin `PosPersistencia`, sin `onProjectActivated`; el
    espejo vive en memoria.
12. **HTTP exacto**: éxito `200` (con `avisa` true o false); `project_id` ausente → `400`;
    excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `aviso-cuadre.avisar.response` y emite `contabilidad.aviso_cuadre`.

### 1. `avisar` — la cobertura declarada en la petición

```json
{
  "project_id": "e57a318a-...",
  "vertical": "pizzepos",
  "ejercicio": "2026",
  "cobertura": { "declarada": true, "completa": false, "tasa": 0.6667, "huecos": ["2026-09-02"] },
  "destino": "ASESOR",
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "ejercicio": "2026",
  "vertical": "pizzepos",
  "cobertura": { "declarada": true, "completa": false, "tasa": 0.6667, "huecos": ["2026-09-02"], "origen": "declarada_en_peticion" },
  "origen_cobertura": "declarada_en_peticion",
  "cubre": false,
  "aviso": {
    "asunto": "cuadre",
    "vertical": "pizzepos",
    "motivo": "faltan 1 hecho(s) por llegar: hay huecos declarados",
    "cobertura": { "declarada": true, "tasa": 0.6667, "huecos": ["2026-09-02"], "completa": false },
    "destino": "ASESOR",
    "destino_declarado": true,
    "requiere_revision": true,
    "avisado_en": "2026-09-25T..."
  },
  "avisa": true,
  "destino_declarado": true
}
```

Emite `contabilidad.aviso_cuadre` (lo consume `motor-avisos`):

```json
{ "project_id": "e57a318a-...", "aviso": { "...": "..." }, "destino": "ASESOR", "correlation_id": "abc-123" }
```

### 2. Sin métrica disponible — no se finge

Sin `cobertura`, sin espejo y con `completitud-cobertura` sin responder → `200` con:

```json
{ "cobertura": null, "origen_cobertura": null, "cubre": null, "aviso": null, "avisa": false, "destino_declarado": false, "motivo": "no hay metrica de cobertura disponible: el puente no finge el cuadre" }
```

**No se afirma ni el cuadre ni el descuadre.**

### 3. Fire-and-forget — reacción a `contabilidad.cobertura_medida`

`onCoberturaMedida` toma `e.data || e`; sin `project_id` → `null`. Con `project_id`:
refleja `{cobertura, vertical, medida_en}` en el espejo y, si **no** cubre, empuja el
aviso (misma proyección). Si **cubre**, no publica nada.

### 4. Fallo — falta `project_id`

```json
{ "vertical": "pizzepos" }
```

Respuesta `400` + `aviso-cuadre.avisar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/aviso-cuadre.test.js`. Cubre:

- `avisar` con cobertura declarada **no completa** → `200 avisa:true`, `aviso` con
  `motivo` y `destino`, `cubre:false`, y emite `contabilidad.aviso_cuadre`.
- `avisar` con cobertura **declarada y completa** → `200 avisa:false`, `aviso:null`.
- `avisar` sin métrica (ni petición, ni espejo, ni RPC) → `avisa:false`,
  `cobertura:null`, `motivo` declarado (no se finge el cuadre).
- La cobertura se **lee** de las tres fuentes en orden y se declara el `origen_cobertura`.
- Destino ausente → `destino:null`, `destino_declarado:false` (**no se inventa**).
- `avisar` sin `project_id` → `400 INVALID_INPUT` + `aviso-cuadre.avisar.failed`.
- `onCoberturaMedida`: refleja la métrica; con cobertura incompleta empuja el aviso;
  si cubre, no emite; sin `project_id` → `null`.
- `toolAvisar` devuelve la misma proyección que `_avisar`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `AvisoCuadre extends ModuloHibridoReflejo`; `name = 'aviso-cuadre'`,
  `version = 'reflejo-0.1.0'`. Espejo en memoria `this._medidas`
  (`Map<project_id, {cobertura, vertical, medida_en}>`). Sin `PosPersistencia`.
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-libro/aviso-cuadre/`).
- `onAvisarRequest` usa `this._atender(e, 'avisar', 'aviso-cuadre.avisar.response',
  async (d) => {...})` y dentro hace el cierre de círculo: en `200` con aviso publica
  `contabilidad.aviso_cuadre`; si no, publica `aviso-cuadre.avisar.failed`.
  `onCoberturaMedida` **no** usa `_atender`.
- Proyección `_avisar(input)` (`async`, porque puede pedir la métrica por evento);
  helpers `_leerCobertura` (los 3 saltos), `_cubre`, `_motivo`, `_destinoDeclarado`,
  `_destino`. Tool `toolAvisar`.
- `_invalid` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: **LEE** la métrica de `completitud-cobertura` (A12) por evento o vía
  `contabilidad.cobertura_medida`; lo consume `motor-avisos`, que produce el aviso al
  negocio/asesor vía `contabilidad.aviso_cuadre`.
- **LA LEY COMO DATO**: el puente **no** cablea la regla de cuadre ni un umbral; la
  cobertura la mide la métrica única y el destino lo declara el negocio. El sistema
  **AVISA**; no presenta ni firma nada.
