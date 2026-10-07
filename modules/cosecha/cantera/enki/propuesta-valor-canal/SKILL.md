---
name: propuesta-valor-canal
description: >
  Skill FULL del módulo MICRO-AGENTE FUZZY `propuesta-valor-canal` de la vertical nichos
  (Radar de Nichos). Propone el COPY/POSICIONAMIENTO de cómo el nicho gana confianza y compra
  en su territorio; se hidrata de los datos del canal (estudio-competencia y sondeo-territorio)
  y escribe el mensaje de propuesta de valor. Es HÍBRIDO: una pasada fuzzy (LLM con guion
  self-contained) para el juicio de copy + un fallback reflejo determinista por plantilla si el
  LLM falla o no cumple el contrato. Sin store, sin persistencia. Publica nichos.copy_propuesto
  y su par de fallo. Úsala para operar, depurar o extender el micro-agente, o para entender su
  contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites proponer el copy/propuesta de valor de un nicho para un canal
    (RPC nichos.copy.proponer.request).
  - Cuando depures por qué una propuesta se rechaza (NICHO_INVALIDO si el nicho no es objeto,
    NICHO_SIN_IDENTIDAD si carece de producto/audiencia).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y el patrón híbrido
    fuzzy + fallback reflejo por plantilla.
  - Cuando vayas a escribir/ampliar el test unitario del micro-agente.
tags: [enki, modulo, micro-agente, fuzzy, reflect, nichos, radar, copy, propuesta-valor, proyecto-3d]
---

# propuesta-valor-canal — MICRO-AGENTE FUZZY que propone cómo el nicho gana confianza y compra

## Qué hace el módulo

`propuesta-valor-canal` es un **MICRO-AGENTE FUZZY** (I2, hoja del plan): dado un **NICHO viable**
y los datos de su **canal** (**estudio-competencia** y **sondeo-territorio**), escribe la
**PROPUESTA DE VALOR**: el **copy**/posicionamiento que conecta el problema del cliente con la
**promesa** del producto, adaptado al **territorio** donde se vende.

Es un **HÍBRIDO** (patrón real de estudio-demanda): `_proponerFuzzy` hace **1 llamada
`llm.complete.request`** con guion-prompt self-contained + el nicho y los datos de canal →
`{copy, posicionamiento, promesa, canal_target}`; si el LLM **falla o no cumple el contrato**, cae
al **fallback reflejo determinista por plantilla** (`_proponerReflejo`). **SIEMPRE** devuelve el
objeto de propuesta; **NUNCA inventa** — un nicho vacío o sin identidad → par de fallo honesto.

**Sin store ni persistencia.** Aunque es stateless, escucha **`project.activated`** para **solo
registrar el `project_id` activo** (scope del contexto). Publica `nichos.copy_propuesto` (→
canal-distribucion E4 y pipeline-por-nicho L1) y su par determinista `nichos.copy.proponer.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.copy.proponer.request` | `onProponerRequest` | RPC híbrido: {project_id, nicho} → propuesta {copy, posicionamiento, promesa, canal_target}. Fuzzy vía `llm.complete.request`; fallback reflejo por plantilla si el LLM falla. Nicho vacío o sin datos de canal → error determinista (`nichos.copy.proponer.failed`). Éxito → publica `nichos.copy_propuesto` y responde por `nichos.copy.proponer.response`. |
| `project.activated` | `onProjectActivated` | Micro-agente sin estado: registra el project_id activo para scope del contexto; no persiste nada. |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.copy_propuesto` | Fire-and-forget (I2): se propuso el copy/propuesta de valor para un nicho → {project_id, nicho, copy, posicionamiento, promesa, canal_target, propuesto}. Lo consume canal-distribucion (E4) y el pipeline-por-nicho (L1) para materializar el canal. |
| `nichos.copy.proponer.failed` | Par de fallo determinista: el nicho llegó vacío o no hay datos de canal para proponer → {status, code, mensaje}. Cierra el círculo de nichos.copy.proponer.request. |

> **Regla de cierre de círculo**: el par `nichos.copy.proponer.failed` cierra el círculo de
> `nichos.copy.proponer.request`. En éxito `onProponerRequest` propaga el fire-and-forget de dominio
> `nichos.copy_propuesto` (publicando `res.data`) además de la `.response`.

> **Nota: no está en module.json pero sí lo emite/usa index.js en `_proponerFuzzy`** — el micro-agente
> invoca (`_rpc`) el RPC **`llm.complete.request`** (con `system: GUION_PROPONER`, `JSON.stringify({nicho,canal})`,
> `tools:[]`, `settings:{temperature:0.7}` y `timeout_ms:30000`) para la pasada fuzzy. Esto no se declara
> en `module.json` (que solo lista nichos.copy.*) pero es parte esencial del contrato real.

## Reglas de negocio

1. **Nicho obligatorio → `400 NICHO_INVALIDO`**: si `nicho` falta o no es objeto →
   `{ status:400, code:'NICHO_INVALIDO', mensaje:'el nicho es obligatorio para proponer la propuesta de valor', data:{ project_id } }`
   + `nichos.copy.proponer.failed`.
2. **Nicho sin identidad → `400 NICHO_SIN_IDENTIDAD`**: se normaliza la identidad con
   `_identidadDelNicho` (producto/servicio, audiencia/cliente, territorio/canal/lugar/canal-param).
   Si no hay `producto` NI `audiencia` → `{ status:400, code:'NICHO_SIN_IDENTIDAD', mensaje:'el
   nicho debe tener producto o audiencia para proponer valor', data:{ project_id } }` + failed.
3. **Híbrido fuzzy→reflejo**: primero `_proponerFuzzy` (1 llamada `llm.complete.request`, temperatura
   0.7, timeout 30s). Si el resultado no tiene `copy` (LLM falla, timeout, o no cumple contrato) →
   cae a `_proponerReflejo` (plantilla declarada).
4. **NUNCA inventa (CERO resultados inventados)**: el guion-prompt prohíbe inventar competidores,
   precios ni canales inexistentes; usa SOLO los datos provistos. El copy siempre sale de los datos
   del nicho y del canal (o de la plantilla refleja aplicada a esos datos).
5. **Fallback reflejo por plantilla**: `_proponerMensajeReflejo` arma el copy con interpolación:
   `{producto} pensado para {audiencia}, y al alcance en {territorio}.`; `posicionamiento`: `La
   opcion que combina calidad local y precio honesto para {audiencia} en {territorio}.`;
   `promesa`: `Resolvemos tu necesidad de {producto} sin complicaciones: rapido, claro y cercano.`;
   `canal_target` = territorio. Defaults honrados: `audiencia`→`'tu mercado'`, `territorio`→`'tu zona'`,
   y producto que cae al capitalizar la audiencia.
6. **`fuente` distingue el origen**: el payload de respuesta incluye `fuente:'fuzzy'` (LLM) o
   `fuente:'reflejo'` (plantilla) — honestidad sobre cómo se produjo el copy.
7. **`project_id` con fallback al contexto**: si no viene `project_id` usa `this.project_id` (el
   proyecto activo registrado en `project.activated`).
8. **HTTP exacto**: éxito `200`; nicho inválido / sin identidad → `400`;
   excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPC request/response que responde en `nichos.copy.proponer.response`:

### 1. `proponer` — proponer el copy/propuesta de valor de un nicho

```json
{
  "project_id": "e57a318a-...",
  "nicho": {
    "producto": "Pan artesano",
    "audiencia": "barrios residenciales",
    "territorio": "Córdoba capital"
  },
  "canal": { "señal": "demanda alta de pan artesano", "competencia": "baja" },
  "correlation_id": "abc-123"
}
```
Respuesta `200` (vía fuzzy o reflejo):
```json
{
  "project_id": "e57a318a-...",
  "nicho": { "producto": "Pan artesano", "audiencia": "barrios residenciales", "territorio": "Córdoba capital" },
  "copy": "Pan artesano pensado para barrios residenciales, y al alcance en Córdoba capital.",
  "posicionamiento": "La opcion que combina calidad local y precio honesto para barrios residenciales en Córdoba capital.",
  "promesa": "Resolvemos tu necesidad de Pan artesano sin complicaciones: rapido, claro y cercano.",
  "canal_target": "Córdoba capital",
  "fuente": "reflejo",
  "propuesto": true
}
```
Emite `nichos.copy_propuesto`:
```json
{ "project_id": "e57a318a-...", "nicho": { "producto": "Pan artesano", "audiencia": "barrios residenciales", "territorio": "Córdoba capital" }, "copy": "Pan artesano pensado para barrios residenciales, y al alcance en Córdoba capital.", "posicionamiento": "...", "promesa": "...", "canal_target": "Córdoba capital", "fuente": "reflejo", "propuesto": true }
```

### Fallos típicos

- Nicho no es objeto → `400` + `nichos.copy.proponer.failed` (`NICHO_INVALIDO`).
- Nicho sin producto ni audiencia → `400` + failed (`NICHO_SIN_IDENTIDAD`).

## Tests

El test vive en `tests/unit/nichos__propuesta-valor-canal.test.js`. Cubre:

- `proponer` con nicho válido y datos de canal → `200` devuelve copy/posicionamiento/promesa/canal_target
  y publica `nichos.copy_propuesto` + `.response`.
- Fallback reflejo: `_proponerFuzzy` que falla (resp. no devuelve `copy`) → se arma el copy por plantilla
  (`fuente:'reflejo'`).
- `_parsePropuesta` tolera fences ```` ```json ```` y texto, y devuelve `null` si no hay `copy`
  (y no asigna `fuente`).
- `_identidadDelNicho` normaliza producto/audiencia/territorio desde alias (servicio, cliente, canal/lugar).
- Nicho no objeto → `400 NICHO_INVALIDO` + failed.
- Nicho sin producto ni audiencia → `400 NICHO_SIN_IDENTIDAD` + failed.
- `project.activated` registra project_id sin persistir (fallback de contexto).
- Manifest: subscribes/publishes exactos de la hoja I2.

Para ejecutarlo (test central del repo):

```bash
cd /home/admin/3enki
node tests/unit/nichos__propuesta-valor-canal.test.js
```

## Notas de implementación

- Clase `PropuestaValorCanal extends ModuloHibridoReflejo`; `name = 'propuesta-valor-canal'`,
  `version = 'reflejo-0.1.0'`. **Sin store, sin PosPersistencia**. `this.project_id` = scope de contexto.
- `onProponerRequest` delega en `_atender(e, 'proponer', 'nichos.copy.proponer.response', fn)` y hace
  el fire-and-forget de dominio (`nichos.copy_propuesto` con `res.data` en 200 o
  `nichos.copy.proponer.failed` si no).
- Proyecciones: `_proponer` (orquesta híbrido + valida), `_proponerFuzzy` (1 llamada
  `llm.complete.request` vía `_rpc`, guion `GUION_PROPONER` self-contained), `_parsePropuesta`,
  `_identidadDelNicho`, `_proponerReflejo`/`_proponerMensajeReflejo` (plantillas). Helper `capitalizar`.
- El guion-prompt `GUION_PROPONER` exige responder SOLO con JSON `{"copy","posicionamiento","promesa",
  "canal_target"}` en español y prohíbe inventar competidores/precios/canales.
- Tool: `toolProponer` → `_proponer`.
- DEP hacia delante: lo consumen canal-distribucion (E4) y pipeline-por-nicho (L1). Fuentes de datos:
  estudio-competencia y sondeo-territorio.
