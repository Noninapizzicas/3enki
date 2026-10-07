---
name: proponedor-modelo-cobro
description: >
  Skill FULL del módulo MICRO-AGENTE (fuzzy) `proponedor-modelo-cobro` de la vertical
  nichos (Radar de Nichos). Propone el modelo de negocio/cobro por nicho antes del gate
  de operar (D4): dado un NICHO construido (D1) y (opcionalmente) el estudio de competencia
  (E1), produce un MODELO DE COBRO estructurado (suscripcion|empresa|transaccional|abierto)
  con el porqué y el precio sugerido derivado de la evidencia. NO lo impone: lo confirma el
  gate E2. Úsala para operar, depurar o extender la célula, o para entender su contrato de
  eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites proponer el modelo de cobro de un nicho (RPC nichos.modelo_cobro.proponer.request).
  - Cuando depures por qué un nicho no se propone un modelo o la propuesta falla
    (NICHO_INVALIDO / SIN_PROPUESTA), o cuándo cae al fallback reflejo.
  - Cuando quieras entender el patrón híbrido reflejo+fuzzy de la propuesta (derivar opciones/precio
    de la evidencia + razonar vía llm.complete.request) y su contrato.
  - Cuando vayas a escribir/ampliar el test unitario del micro-agente.
tags: [enki, modulo, micro-agente, fuzzy, nichos, radar, cobro, gate, proyecto-3d]
---

# proponedor-modelo-cobro — MICRO-AGENTE (fuzzy) que propone el modelo de cobro ante el gate

## Qué hace el módulo

`proponedor-modelo-cobro` es un **MICRO-AGENTE HÍBRIDO** (D4): propone el **modelo de
negocio/cobro por nicho antes del gate de operar** (E2). Dado un **NICHO construido** (D1) y
(opcionalmente) el **estudio de competencia** (E1), produce un **MODELO DE COBRO estructurado**:
la **opción recomendada** (`suscripcion | empresa | transaccional | abierto`), el **porqué en
1 frase** y el **precio sugerido derivado de la evidencia** de disposición a pagar. **NO lo
impone**: lo confirma el gate E2, no se autoimpone.

Dos mitades (patrón real de `estudio-competencia` + `estudio-demanda`):

- **REFLEJO** (`_proponerEstructura`): mecánico y determinista. Valida el nicho y **deriva las
  opciones de modelo declaradas por tipo de entrega** (`POR_TIPO`), del precio sugerido de la
  disposición a pagar y de `basado_en` (qué evidencia apoyó la propuesta).
- **FUZZY** (`_redactarPropuesta`): juicio LLM. Un guion-prompt self-contained
  (`GUION_PROPUESTA`) + los datos → `llm.complete.request` → **propuesta razonada**. Si el
  LLM falla o incumple contrato, el reflejo determinista (`_redactarReflejo`) deriva la
  propuesta **de la evidencia, sin fabricar precio**.

**NUNCA inventa**: no fabrica precio ni modelo que la evidencia no apoye; si el nicho viene
vacío → par de fallo honesto (`nichos.modelo_cobro.proponer.failed`). Sin store, sin custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.modelo_cobro.proponer.request` | `onProponerRequest` | RPC híbrido: {project_id, nicho, competencia?} → {nicho, modelo, opciones, precio_sugerido_eur, provisional, razon, basado_en, propuesto}. Valida el nicho y deriva las opciones de modelo declaradas por tipo de entrega + el precio sugerido de la disposición a pagar (reflejo, números declarados) y razona la propuesta (fuzzy `llm.complete.request` con fallback reflejo que deriva la propuesta de la evidencia sin inventar). Nicho vacío → error determinista `nichos.modelo_cobro.proponer.failed`. Éxito → publica `nichos.modelo_cobro.propuesto` y responde por `nichos.modelo_cobro.proponer.response`. |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.modelo_cobro.propuesto` | Fire-and-forget (D4): el modelo de cobro de un nicho quedó propuesto → {project_id, nicho, modelo, opciones, precio_sugerido_eur, provisional, razon, propuesto}. Lo consume paquete-decision (H1) y el gate-decision-operar (E2); se confirma en el gate, no se impone. |
| `nichos.modelo_cobro.proponer.failed` | Par de fallo determinista (D4): el nicho llegó vacío o el juicio no pudo proponer un modelo → {status, code, mensaje, data}. Cierra el círculo de nichos.modelo_cobro.proponer.request. |

> **Regla de cierre de círculo**: el par `nichos.modelo_cobro.proponer.failed` cierra el círculo
> de `nichos.modelo_cobro.proponer.request`. En éxito se emite `nichos.modelo_cobro.propuesto`
> (fire-and-forget de dominio) para el paquete-decision (H1) y el gate-decision-operar (E2).

> **Nota: los eventos de dominio que emite index.js en `onProponerRequest` (nichos.modelo_cobro.propuesto,
> nichos.modelo_cobro.proponer.failed) coinciden exactamente con los publicados en module.json** —
> no hay sub-declaración en este módulo.

## Reglas de negocio

1. **NUNCA inventar precio ni modelo (honestidad)**: `_proponerEstructura` deriva el precio SOLO
   de `competencia.disposicion_pagar.precio_medio_eur` (número declarado) y `_validarPropuesta`
   sólo acepta precios numéricos `>= 0`; si no hay evidencia, queda provisional. `_redactarReflejo`
   concluye **de la evidencia**, sin fabricar precio.
2. **Nicho obligatorio → `400 NICHO_INVALIDO`**: si `nicho` falta o no es objeto →
   `{ status:400, code:'NICHO_INVALIDO', mensaje:'el nicho es obligatorio para proponer el modelo de cobro', data:{project_id} }`
   + `nichos.modelo_cobro.proponer.failed`.
3. **Sin propuesta → `502 SIN_PROPUESTA`**: si ni el juicio fuzzy ni el fallback reflejo producen
   propuesta → `{ status:502, code:'SIN_PROPUESTA', mensaje:'el juicio no pudo proponer un modelo de cobro', data:{project_id, nicho} }`
   + failed. Honesto: si no se puede proponer, no se finge.
4. **Modelo declarado por tipo de entrega**: `POR_TIPO` asigna `servicio→suscripcion`,
   `producto→transaccional`, `empresa→empresa`, `contenido→suscripcion`; `tipo==='abierto'` o
   desconocido → `abierto`/`transaccional`. El tipo se deriva de `nicho.tipo` o de si hay
   `producto`/`servicio`.
5. **Provisional cuando falta evidencia de pago**: `provisional = !disposicion_pagar || typeof
   precio_medio_eur !== 'number'`. Un precio sugerido que no se apoya en la disposición a pagar
   queda marcado provisional y lo confirma el gate E2.
6. **NO se autoimpone**: el módulo SOLO propone; la confirmación del modelo es del gate E2
   (gate-decision-operar). `nichos.modelo_cobro.propuesto` se consume y confirma en el gate.
7. **Fallback reflejo por reglas (no romper el pipeline)**: si el LLM no devuelve propuesta válida,
   `_redactarReflejo` construye la propuesta de `estructura` + `provisional`: si provisional, razon
   "Aun sin precio confirmado, queda provisional y lo confirma el gate E2"; si hay precio, lo deriva
   de la disposición a pagar observada.
8. **Validación de contrato del LLM**: `_validarPropuesta` descarta un `modelo` que no esté en el
   elenco `[suscripcion, empresa, transaccional, abierto]` y normaliza `razon` (default
   'modelo razonado para este nicho') y `provisional` (true si el precio quedó null).
9. **Sin estado**: `project_id` del request tiene preferencia sobre el de contexto; no hay store
   ni PosPersistencia (stateless).

## Cómo se usa (RPCs)

RPC request/response que responde en `nichos.modelo_cobro.proponer.response`:

### 1. `proponer` — proponer el modelo de cobro de un nicho (antes del gate E2)

```json
{
  "project_id": "e57a318a-...",
  "nicho": { "producto": "salsa picante", "audiencia": "restaurantes", "tipo": "producto" },
  "competencia": { "disposicion_pagar": { "precio_medio_eur": 8.5 } }
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "nicho": "salsa picante",
  "modelo": "transaccional",
  "opciones": ["suscripcion", "empresa", "transaccional", "abierto"],
  "precio_sugerido_eur": 8.5,
  "provisional": false,
  "razon": "Venta directa por unidad, coherente con el producto y su precio medio.",
  "basado_en": "estudio de competencia (D4 -> E1)",
  "propuesto": true
}
```
Emite `nichos.modelo_cobro.propuesto` (fire-and-forget para paquete-decision H1 / gate E2):
```json
{ "project_id": "e57a318a-...", "nicho": "salsa picante", "modelo": "transaccional", "opciones": [...], "precio_sugerido_eur": 8.5, "provisional": false, "razon": "...", "propuesto": true }
```

### Fallos típicos

- Nicho vacío/no-objeto → `400` + `nichos.modelo_cobro.proponer.failed` (`NICHO_INVALIDO`).
- Juicio sin propuesta ni fallback → `502` + failed (`SIN_PROPUESTA`).
- Precio provisional (sin disposición a pagar) — NO es un fallo; queda `provisional: true` para que el gate E2 lo confirme.

## Tests

El test vive en `tests/unit/proponedor-modelo-cobro.test.js`. Cubre:

- `proponer` con nicho y competencia → `200`, deriva opciones/precio (reflejo), razona propuesta,
  emite `nichos.modelo_cobro.propuesto`.
- Nicho vacío → `400 NICHO_INVALIDO` + failed.
- Sin disposición a pagar → `provisional: true` y precio null (no inventa).
- Si el LLM falla/incumple contrato → fallback `_redactarReflejo` (propuesta derivada de la evidencia).
- Ni LLM ni reflejo → `502 SIN_PROPUESTA` + failed.
- `_validarPropuesta` descarta modelos fuera de `[suscripcion, empresa, transaccional, abierto]`.

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/nichos/proponedor-modelo-cobro
node tests/unit/proponedor-modelo-cobro.test.js
```

## Notas de implementación

- Clase `ProponedorModeloCobro extends ModuloHibridoReflejo`; `name = 'proponedor-modelo-cobro'`,
  `version = 'reflejo-0.1.0'`. Sin store ni PosPersistencia (stateless).
- `onProponerRequest` delega en `_atender(e, 'proponer', 'nichos.modelo_cobro.proponer.response', fn)`;
  con `status === 200` publica `nichos.modelo_cobro.propuesto`; si no, `nichos.modelo_cobro.proponer.failed`.
- `_proponerEstructura` es el reflejo: `POR_TIPO` por tipo de entrega, precio de
  `competencia.disposicion_pagar.precio_medio_eur`, `basado_en` según si vino competencia.
- `_redactarPropuesta` hace 1 llamada `this._rpc('llm.complete.request', ...)` headless
  (`GUION_PROPUESTA`, `settings.temperature: 0.2`, `timeout_ms: 30000`, tools vacíos).
- `_parse` tolera fences ```json y texto; `_validarPropuesta` es el guarda de contrato (elenco de
  modelos, precio numérico ≥ 0, razon normalizada).
- `_redactarReflejo` garantiza la propuesta determinista de la evidencia (provisional o con precio).
- Dependencia hacia delante: lo consumen paquete-decision (H1) y gate-decision-operar (E2); entra
  tras D1 (nicho construido) y E1 (estudio de competencia).
