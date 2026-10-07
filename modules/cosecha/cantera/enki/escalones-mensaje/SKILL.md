---
name: escalones-mensaje
description: >
  Skill FULL del módulo REFLEJO STATELESS `escalones-mensaje` de la vertical nichos
  (Radar de Nichos). Clasifica los mensajes al supervisor del nicho en el ESCALÓN que
  les toca (pulso|alerta|decision) con su cadencia de entrega, mediante regla dura no
  ambigua: pulso→informativo (no interrumpe), alerta→urgente al canal (interrumpe),
  decisión→SolicitudDecision que exige acción del dueño. Es una proyección pura
  determinista sin store ni persistencia. Publica nichos.escalon.clasificado y su par de
  fallo. Úsala para operar, depurar o extender el reflejo, o para entender su contrato de
  eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites clasificar un mensaje de supervisión en su escalón/cadencia
    (RPC nichos.escalon.clasificar.request).
  - Cuando depures por qué un mensaje se rechaza (INVALID_INPUT si el tipo no es
    clasificable o falta project_id/tipo).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las reglas
    de negocio (regla dura, escalones por tipo, cadencia declarada vs. por defecto).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo.
tags: [enki, modulo, reflejo, stateless, nichos, radar, escalon, mensaje, proyecto-3d]
---

# escalones-mensaje — REFLEJO STATELESS que decide el escalón del mensaje al supervisor

## Qué hace el módulo

`escalones-mensaje` es un **REFLEJO STATELESS** (G2, hoja del plan): sin store, sin
persistencia — cada operación entra objeto y sale objeto, es una **proyección pura
determinista**. Clasifica los **mensajes al supervisor del nicho** en el **ESCALÓN** que les
toca según una **regla dura no ambigua**:

- **pulso** → notificación informativa con cadencia (no interrumpe);
- **alerta** → notificación urgente al canal (interrumpe);
- **decisión** → SolicitudDecision que espera respuesta del dueño (exige acción).

Consume el tipo de mensaje (origen: pulso-avance, alerta-sangria, gate...) y, si se le pasa el
**perfil de supervisión (H2)**, aplica la cadencia declarada del dueño; sin perfil, usa la
cadencia por defecto del escalón. Publica `nichos.escalon.clasificado` (→ canal-supervision G1
para enrutar) y su par determinista `nichos.escalon.clasificar.failed`.

Aunque es **stateless**, escucha **`project.activated`** para **solo registrar el `project_id`
activo** (scope del contexto) — no persiste absolutamente nada.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.escalon.clasificar.request` | `onClasificarRequest` | RPC puro: {project_id, tipo:'pulso'\|'alerta'\|'decisión', mensaje?, perfil_supervision?} → {project_id, tipo, escalon:'PULSO'\|'ALERTA'\|'DECISION', prioridad, interrumpe, exige_accion, cadencia, mensaje, regla:'duro', clasificado:true}. Regla dura (pulso→informativo con cadencia declarada; alerta→urgente que interrumpe; decisión→SolicitudDecision que exige acción). Si el tipo no es clasificable → `nichos.escalon.clasificar.failed`. Éxito → publica `nichos.escalon.clasificado` y responde por `nichos.escalon.clasificar.response`. |
| `project.activated` | `onProjectActivated` | Reflejo sin estado: registra el project_id activo para scope del contexto; no persiste nada. |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.escalon.clasificado` | Fire-and-forget (G2): un mensaje de supervisión quedó escalonado → {project_id, escalon:'PULSO'\|'ALERTA'\|'DECISION', prioridad, interrumpe, exige_accion, cadencia, tipo, clasificado:true}. Lo consume canal-supervision (G1) para enrutarlo al dueño con el escalón/cadencia correctos. |
| `nichos.escalon.clasificar.failed` | Par de fallo determinista (G2): el tipo de mensaje no es clasificable → {status, code, message, data}. Cierra el círculo de nichos.escalon.clasificar.request. |

> **Regla de cierre de círculo**: el par `nichos.escalon.clasificar.failed` cierra el círculo de
> `nichos.escalon.clasificar.request`. En éxito `onClasificarRequest` propaga el fire-and-forget de
> dominio `nichos.escalon.clasificado` (con `correlation_id` del request) además de la `.response`.

> **Nota: el evento `project.activated` sí está en module.json aunque este es un reflejo stateless** —
> sirve solo de scope de contexto (setea `this.project_id`), sin persistir. Los eventos de dominio
> que emite index.js en `onClasificarRequest` (nichos.escalon.clasificado, nichos.escalon.clasificar.failed)
> coinciden exactamente con los publicados en module.json — no hay sub-declaración en este módulo.

## Reglas de negocio

1. **Regla dura no ambigua (DUROA)**: el escalón de cada tipo de mensaje está fijado en la tabla
   `ESCALON_POR_TIPO`. Nada de heurística ni juicio — es mecánico:
   - `pulso` → `{ escalon:'PULSO', prioridad:1, interrumpe:false, exige_accion:false, cadencia:'declarada' }`
   - `alerta` → `{ escalon:'ALERTA', prioridad:2, interrumpe:true, exige_accion:false, cadencia:'inmediata' }`
   - `decisión` → `{ escalon:'DECISION', prioridad:3, interrumpe:true, exige_accion:true, cadencia:'inmediata' }`
2. **Tipo desconocido → `400 INVALID_INPUT`**: si el tipo no está en el Set `TIPOS_MENSAJE`
   (`'pulso','alerta','decision'` — **la literal canónica en código es `'decision'` sin tilde**;
   el `module.json` la documenta como `'decisión'` pero `index.js` usa `'decision'`) →
   `{ status:400, code:'INVALID_INPUT', mensaje:'tipo de mensaje no clasificable', data:{ tipo } }`
   + `nichos.escalon.clasificar.failed`. (En el helper
   `_clasificarTipo` un tipo no mapeado cae a un PULSO por defecto `prioridad:0`, pero el RPC lo
   bloquea antes.)
3. **`project_id` obligatorio → `400 INVALID_INPUT`**: si no viene y no hay `this.project_id`
   (activo) → `_invalid('project_id')` + failed. Si se omite pero hay proyecto activo, usa
   `this.project_id` como fallback.
4. **`tipo` obligatorio → `400 INVALID_INPUT`**: si falta `tipo` → `_invalid('tipo')` + failed.
   Se normaliza a minúsculas.
5. **Cadencia declarada (H2) con prioridad**: si se pasa `perfil_supervision.cadencia_pulso`
   (del custodio H2), esa cadencia **reemplaza** a la cadencia por defecto del escalón. Sin
   perfil, queda la cadencia del escalón (`declarada` para pulso, `inmediata` para alerta/decisión).
6. **Determinismo puro**: mismo tipo + mismo perfil ⇒ misma clasificación. Sin efectos laterales;
   `mensaje` se trimea y se devuelve tal cual en el payload.
7. **HTTP exacto**: éxito `200`; tipo no clasificable o campos faltantes → `400`;
   excepción en `_atender` → `500 UNKNOWN_ERROR`.
8. **`project.activated` solo registra, no persiste**: `onProjectActivated` setea `this.project_id`
   y responde `200 {project_id}` (status real), devolviendo el id activo.

## Cómo se usa (RPCs)

RPC request/response que responde en `nichos.escalon.clasificar.response`:

### 1. `clasificar` — clasificar un mensaje en su escalón/cadencia

```json
{
  "project_id": "e57a318a-...",
  "tipo": "alerta",
  "mensaje": "El techo perdida eur del nicho se superó",
  "perfil_supervision": { "cadencia_pulso": "tiempo_real", "limites": { "max_alertas_dia": 3, "techo_perdida_eur": 150 } },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "tipo": "alerta",
  "escalon": "ALERTA",
  "prioridad": 2,
  "interrumpe": true,
  "exige_accion": false,
  "cadencia": "inmediata",
  "mensaje": "El techo perdida eur del nicho se superó",
  "regla": "duro",
  "clasificado": true
}
```
> Nota: para `alerta` la cadencia por defecto es `'inmediata'`; el `perfil_supervision.cadencia_pulso`
> solo aplica al escalón `PULSO` (que usa la cadencia **declarada** por el dueño).

Emite `nichos.escalon.clasificado`:
```json
{ "project_id": "e57a318a-...", "escalon": "ALERTA", "clasificado": true, "correlation_id": "abc-123" }
```

### 2. Ejemplo con tipo `pulso` y cadencia declarada (H2)

```json
{ "project_id": "e57a318a-...", "tipo": "pulso", "perfil_supervision": { "cadencia_pulso": "diaria" } }
```
Respuesta `200` (fragmento): `{ "escalon": "PULSO", "prioridad": 1, "interrumpe": false, "exige_accion": false, "cadencia": "diaria", "regla": "duro", "clasificado": true }`

### Fallos típicos

- Tipo no clasificable (`'spam'`) → `400` + `nichos.escalon.clasificar.failed` (`INVALID_INPUT`).
- Falta `project_id` (y no hay proyecto activo) o falta `tipo` → `400` + failed.

## Tests

El test vive en `tests/unit/nichos__escalones-mensaje.test.js`. Cubre:

- `clasificar` tipo `pulso` → `200` `{ escalon:'PULSO', prioridad:1, interrumpe:false, exige_accion:false, cadencia:'declarada' }`, publica `nichos.escalon.clasificado` + `.response`.
- `clasificar` tipo `alerta` → `200` `{ escalon:'ALERTA', prioridad:2, interrumpe:true, exige_accion:false, cadencia:'inmediata' }`.
- `clasificar` tipo `decisión` → `200` `{ escalon:'DECISION', prioridad:3, interrumpe:true, exige_accion:true, cadencia:'inmediata' }`.
- Tipo desconocido → `400 INVALID_INPUT` + `nichos.escalon.clasificar.failed`.
- Falta `project_id`/`tipo` → `400 INVALID_INPUT` + failed.
- Con `perfil_supervision.cadencia_pulso` → la cadencia declarada reemplaza la por defecto.
- `project.activated` registra el project_id activo (y se usa de fallback) sin persistir.
- Manifest: subscribes/publishes exactos de la hoja G2.

Para ejecutarlo (test central del repo):

```bash
cd /home/admin/3enki
node tests/unit/nichos__escalones-mensaje.test.js
```

## Notas de implementación

- Clase `EscalonesMensaje extends ModuloHibridoReflejo`; `name = 'escalones-mensaje'`,
  `version = 'reflejo-0.1.0'`. **Sin store, sin PosPersistencia**.
- `onClasificarRequest` delega en `_atender(e, 'clasificar', 'nichos.escalon.clasificar.response', fn)`
  y hace el fire-and-forget de dominio (`nichos.escalon.clasificado` en 200 o
  `nichos.escalon.clasificar.failed` si no), propagando `correlation_id`.
- Proyecciones puras: `_clasificar` (orquesta y valida) y `_clasificarTipo` (rotula un tipo → regla
  de `ESCALON_POR_TIPO`, con fallback PULSO prioridad 0). Tablas constantes `TIPOS_MENSAJE`
  (Set) y `ESCALON_POR_TIPO`.
- `this.project_id` es scope de contexto (default para requests sin project_id).
- Tools: `toolClasificar` → `_clasificar`, `toolClasificarTipo` → `_clasificarTipo`.
- DEP: origen = tipos de mensaje de pulso-avance, alerta-sangria, gate; salida → canal-supervision (G1).
