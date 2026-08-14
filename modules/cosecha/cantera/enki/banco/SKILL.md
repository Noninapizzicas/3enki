---
name: banco
description: >-
  CUSTODIO single-writer del banco de nichos del Radar (módulo banco, reflejo con
  PosPersistencia por proyecto). Aplica la máquina de estados del candidato
  (CRUDO→EN_EVALUACION→APROBADO→SELECCIONADO→PUBLICADO, con EN_OBSERVACION por
  falta de evidencia y RECHAZADO por el dueño/evaluador), el tope de 100
  candidatos con rotación (M6), el aparcado por falta de evidencia (M10) y la
  corrección de ficha del dueño (M10: aportar el dato que faltaba →
  EN_OBSERVACION → EN_EVALUACION, re-evaluación). NO decide: el evaluador
  evalúa, el dueño confirma (M11). Store: /radar/banco.json.
fuente: enki
when-to-use: >-
  Ante un candidato de nicho que entra al radar (reloj → sonda → banco.anadir),
  un veredicto del evaluador que aplicar (evaluador.veredicto_emitido), una
  confirmación del dueño (interfaz.veredicto_confirmado), o cualquier consulta
  de estado del banco (listar/obtener). También para corregir la ficha de un
  candidato con evidencia que faltaba (banco.corregir_ficha).
dominio: radar
lente_dominio: radar
lente_tarea: custodiar
tags: [radar, banco, custodio, maquina-de-estados, m6, m10, m11, pospersistencia, proyecto]
---

# Banco de Nichos — Custodio (módulo banco)

> **Qué es.** El módulo `banco` es el CUSTODIO single-writer del banco de
> nichos: candidatos, fichas, veredictos e histórico. Reflejo (JS determinista,
> NO blueprint híbrido) con PosPersistencia por proyecto.
>
> **Quién decide.** El banco NO decide (M11): el evaluador evalúa, el dueño
> confirma. El banco solo aplica la máquina de estados y las reglas M6/M10.
>
> **Forma.** Reflejo + PosPersistencia (`modules/_shared/pos-persistencia`),
> patrón custodio. Store por proyecto: `/radar/banco.json` (single-writer,
> fs.write atómico).

---

## Contrato (eventos)

### RPCs servidas (subscribes)

| Evento | Payload | Respuesta |
|---|---|---|
| `banco.anadir.request` | `{project_id, señales:[{titulo,fuente,url,sector?}]}` o candidato directo `{titulo,fuente,url}` | `{status:201, data:{añadidos, duplicados, rotados}}` |
| `banco.obtener.request` | `{project_id, id}` | `{status:200, data:{candidato}}` · 404 si no existe |
| `banco.listar.request` | `{project_id, estado?}` | `{status:200, data:{candidatos[], total}}` (fechaCosecha desc) |
| `banco.aparcar.request` | `{project_id, id, criterios_faltantes?, motivo?}` | `{status:200, data:{candidato}}` → EN_OBSERVACION |
| `banco.seleccionar.request` | `{project_id, id}` | `{status:200, data:{candidato}}` · 409 si no APROBADO o ya hay SELECCIONADO |
| `banco.publicar.request` | `{project_id, id}` | `{status:200, data:{candidato}}` · 409 si no SELECCIONADO |
| `banco.corregir_ficha.request` (v0.2.0) | `{project_id, id, ficha:{criterios?, detalle?}}` | `{status:200, data:{candidato}}` → EN_EVALUACION |

### Eventos de dominio entrantes (fire-and-forget)

| Evento | Efecto |
|---|---|
| `evaluador.veredicto_emitido` | `{project_id, candidatoId, veredicto}` — FALTA_EVIDENCIA → aparcar (EN_OBSERVACION con criterios_faltantes) · PASA → APROBADO (+ficha.detalle) · NO_PASA → RECHAZADO (a histórico) |
| `interfaz.veredicto_confirmado` | `{project_id, candidatoId, confirmacion}` — PASA → sella ficha (confirmado_por_dueño) y EN_OBSERVACION→APROBADO · NO_PASA → RECHAZADO (a histórico) |
| `project.activated` | Hidrata el banco del proyecto desde disco (restaurar PosPersistencia) |

### Eventos publicados

`banco.candidato_anadido` · `banco.candidato_aparcado` · `banco.candidato_seleccionado` ·
`banco.candidato_publicado` · `banco.candidato_rotado` · `banco.candidato_ficha_corregida` ·
`banco.anadir.failed` · `banco.seleccionar.failed`

---

## Máquina de estados del candidato

```
CRUDO ──anadir──► CRUDO
CRUDO ──evaluador PASA──► APROBADO
CRUDO ──evaluador FALTA_EVIDENCIA──► EN_OBSERVACION
EN_OBSERVACION ──dueño confirma PASA (re-evaluado)──► APROBADO
EN_OBSERVACION ──corregir_ficha──► EN_EVALUACION ──evaluador──► (APROBADO | EN_OBSERVACION | RECHAZADO)
CRUDO/EN_OBSERVACION/EN_EVALUACION ──corregir_ficha──► EN_EVALUACION
APROBADO ──seleccionar──► SELECCIONADO (solo 1 por ciclo)
SELECCIONADO ──publicar──► PUBLICADO
cualquiera ──evaluador NO_PASA / dueño NO_PASA──► RECHAZADO (→ histórico)
tope 100 (M6) ──rotación──► ROTADO (→ histórico, el de menor prioridad local)
```

**Estados**: CRUDO · EN_EVALUACION · APROBADO · SELECCIONADO · PUBLICADO · EN_OBSERVACION · RECHAZADO

**Reglas clave**:

- **Dedupe** por `(fuente, url)` — `banco.anadir` con una señal duplicada devuelve
  `duplicados[{motivo:'duplicado', id}]` sin crear candidato. Señal incompleta
  (sin titulo/fuente/url) → `duplicados[{motivo:'forma_incompleta'}]`.
- **Tope 100 (M6)**: al exceder, rota el de MENOR prioridad local
  (nº criterios con evidencia + disposicionAPagar ? 1 : 0) → histórico con
  `estado:'ROTADO'` + `banco.candidato_rotado`.
- **Selección (M1)**: solo 1 candidato SELECCIONADO por ciclo — 409
  `ya_hay_un_seleccionado_este_ciclo` si se intenta un segundo.
- **corregir_ficha (M10, v0.2.0)**: merge de criterios/detalle + reapertura a
  EN_EVALUACION (re-evaluación). Solo en CRUDO/EN_OBSERVACION/EN_EVALUACION;
  terminales (APROBADO→SELECCIONADO→PUBLICADO, RECHAZADO) → 409
  `correccion_no_permitida_en_este_estado`.
- **El banco no emite veredictos** — solo los aplica. Quien evalúa es
  `evaluador`, quien decide es el dueño vía `interfaz`.

---

## Uso

### Entrada de señales desde la sonda (reloj)

```
banco.anadir.request
  { project_id, señales: [ {titulo, fuente, url, sector, fechaCosecha?, ficha?} ] }
→ 201 { añadidos: [...], duplicados: [...], rotados: [...] }
```

### Consultar el banco

```
banco.listar.request { project_id, estado: 'EN_OBSERVACION' }
→ 200 { candidatos: [...], total: N }
```

### Corregir la ficha de un candidato observado (el dueño aporta evidencia)

```
banco.corregir_ficha.request
  { project_id, id, ficha: { criterios: { disposicionAPagar: { evidencia: [...] } }, detalle: {...} } }
→ 200 { candidato }  (estado → EN_EVALUACION)
```

---

## Pitfalls

- **El candidato manual se queda CRUDO para siempre** si nadie dispara el
  evaluador: `interfaz.anadir_manual` → `banco.anadir` NO encadena
  `evaluador.evaluar`. Hay que dispararlo a mano (scheduler-mqtt one-shot)
  para que CRUDO → APROBADO/EN_OBSERVACION/RECHAZADO.
- **Tras un restart del core, el banco responde vacío** (memoria limpia,
  hidratación solo en `project.activated`): disparar el job
  `activar-proyecto-b-radar` para rehidratar desde disco; no es un bug.
- **Verificación por disco, no por respuesta RPC**: el estado real vive en
  `/radar/banco.json` (`_updated` tras cada mutación). El RPC puede responder
  200 con el payload oculto (`res:null` en publishAndWait) — el disco no miente.
- **key-scheme**: todas las claves del Map son `${project_id}:${id}` — nunca
  mezclar ids pelados con claves prefijadas (hang de rotación/evicción).
- **Los deletes persisten en disco Y en memoria**: `_guardar` reemplaza el
  estado vivo por proyecto (incluye rotaciones y rechazos). Store y memoria
  siempre en sincronía.
- **Isolation multi-tenant**: toda lectura filtra `project_id` del input;
  listar con un proyecto ajeno → 0 filas (no fugas).

---

## Verificación (smoke / gate)

- Gate híbridos: `node /opt/enki/scripts/validate-hibridos.js --module "banco/"` → PASS.
- Smoke reflejo: stub `eventBus{subscribe, publish}` + `logger` + `metrics` vía
  `onLoad({eventBus, logger, metrics})` (onLoad reasigna los campos).
- Roundtrip de persistencia real por el bus: stub sirviendo `fs.read.request` /
  `fs.write.request` → `marcarDirty(pid)` → `flush()` → `new Mod()` + onLoad →
  `restaurar(pid)` → estado hidratado en `/radar/banco.json`.
