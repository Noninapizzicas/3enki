# Trabajo — Generar Blueprints Full (impresion-3d)

> **Documento de trabajo** — entrada para el agente `crear-blueprint-full` (cantera
> `modules/cosecha/cantera/enki/agentes/crear-blueprint-full.json`). Lista los módulos del
> proyecto impresion-3d, su estado de blueprint y el orden de generación.
> Proyecto: `impresion-3d` (id `e57a318a-b93a-46d9-8ae6-fd5bd0384964`).
> Máquina: Creality SPARKX i7 (CoreXY) · material PETG. Propósito: mantener la máquina ocupada.

---

## 0. CÓMO SE USA ESTE DOCUMENTO

Cada módulo se procesa con el agente `crear-blueprint-full`:

```
node scripts/generar-blueprint-full.js <slug> --no-frontend
```

El agente clasifica cada op por ROL (`jefe` / `utilizacion` / `neutro`), fusiona el bloque en
`ui.roles` del blueprint, añade la fase `jefe` PRIMERA en `ui.flujo`, y copia el blueprint a
`frontend/src/lib/modules/<slug>/<slug>.blueprint.json` (frontend_sync obligatorio antes del PR).

**Regla de reparto (del patrón híbrido):**
- **Reflejo (JS, determinista):** transiciones de estado, orden por prioridad, persistencia, CRUD,
  validación de invariantes, y TODOS los RPC que otros módulos le piden.
- **Blueprint (LLM de página, NO agente):** interpretar la intención del operador, decidir
  aprobar/rechazar, redactar un modelo desde conversación. El LLM de página NUNCA toca fs; entra
  por el reflejo (5 fases: CONTRATO → LEER(reflejo) → PENSAR(LLM) → GUARDAR(reflejo) → EMITIR).

---

## 1. MÓDULOS CREADOS EN ESTE PROYECTO (10)

| # | Módulo | Rol | Paso | Blueprint |
|---|---|---|---|---|
| 1 | `cola_modelos` | Cripta de la cola: modelos, prioridad, máquina de estados | 1 | ✅ `cola_modelos.blueprint.json` |
| 2 | `motor_propuesta` | Motor puro: elige el siguiente por prioridad+antigüedad | 2 | ✅ `motor_propuesta.blueprint.json` |
| 3 | `orquestador_cola` | Orquesta el ciclo libre→propuesta→aprobación→imprimiendo→impreso | 3 | ✅ `orquestador_cola.blueprint.json` |
| 4 | `buscador_www` | Busca modelos en Cults3D/Printables/Thingiverse/MakerWorld | 4 | ✅ `buscador_www.blueprint.json` (PR #467) |
| 5 | `disenador_parametrico` | Diseño paramétrico OpenSCAD → STL/3MF | 5 | ✅ `disenador_parametrico.blueprint.json` (PR #467) |
| 6 | `cupula_stl` | Custodia el STL/3MF universal (una vez por pieza) | 6 | ✅ `cupula_stl.blueprint.json` (PR #467) |
| 7 | `cupula_gcode` | Custodia el gcode por máquina (receta firmada) | 7 | ✅ `cupula_gcode.blueprint.json` (PR #468) |
| 8 | `puente_creality` | Frontera con CrealityPrint: slice, arranque, monitoreo | 8 | ✅ `puente_creality.blueprint.json` (PR #468) |
| 9 | `estimador_tiempo` | Estima minutos de impresión (volumen/material) | 9 | ✅ `estimador_tiempo.blueprint.json` (PR #468) |
| 10 | `horarios_casa` | Ventanas de impresión por persona (presencia) | 10 | ✅ `horarios_casa.blueprint.json` (PR #469) |

**Skills en cantera (5, fase 5):** `cola_modelos`, `motor_propuesta`, `orquestador_cola`,
`disenador_parametrico`, `buscador_www`.

---

## 2. ORDEN DE GENERACIÓN DE BLUEPRINTS FULL

Los 7 módulos sin blueprint se generan en este orden (respetando dependencias del plan de
construcción). Los 3 con blueprint ya están hechos y no se regeneran salvo que cambie su module.json.

```jsonc
{
  "orden_blueprints_full": [
    { "orden": 1, "slug": "buscador_www",          "rol": "reflejo + puente web",   "ops": ["buscar_por_necesidad"] },
    { "orden": 2, "slug": "disenador_parametrico", "rol": "reflejo + puente openscad", "ops": ["generar_stl", "estimar_tiempo"] },
    { "orden": 3, "slug": "cupula_stl",            "rol": "cripta reflejo",          "ops": ["registrar", "obtener", "listar"] },
    { "orden": 4, "slug": "cupula_gcode",          "rol": "cripta reflejo",          "ops": ["registrar", "obtener_por_maquina", "listar"] },
    { "orden": 5, "slug": "puente_creality",       "rol": "puente externo",          "ops": ["orquestar_slice", "arrancar_impresion", "estado_impresion"] },
    { "orden": 6, "slug": "estimador_tiempo",      "rol": "reflejo puro",            "ops": ["estimar_tiempo"] },
    { "orden": 7, "slug": "horarios_casa",         "rol": "cripta reflejo",          "ops": ["listar", "actualizar", "obtener"] }
  ]
}
```

---

## 3. MÓDULOS QUE VAMOS A UTILIZAR (ya existen en el sistema, se integran)

Estos NO se generan (no son de este proyecto); se reutilizan tal cual:

| Módulo | Cómo se integra |
|---|---|
| `proceso-negocio` | Orquestador de fases — encadena todo el proceso |
| `scheduler` | Jobs cron — para el ciclo de la cola |
| `telegram-service` / `telegram-bridge` | Notificaciones y control por bot |
| `notificador-pedidos` | Avisos (reutilizable para "pieza lista") |
| `filesystem` | Acceso a STL/gcode en disco |
| `verificador-visual` | Verificación de pieza impresa |
| `system-inspector` / `system-coherence-analyzer` | Observabilidad |
| `sonda` | Telemetría del estado de la máquina |

---

## 4. CONTRATO DE BUS (referencia para los blueprints)

Topic pattern (cerrado en `_persona.md`):
`core/<core_id>/api/request/<dominio>/<accion>` → `core/<core_id>/api/response/<correlation_id>`.
Todos los flujos llevan `correlation_id` (idempotencia, qos1) y emiten su `*.failed` canónico.
Cada `.request` declarado DEBE tener su response atendida (regla de la cúpula de eventos: no
rpc_fantasma). Los eventos de dominio (notificación fire-and-forget, CREATE-ONLY) van a
`core/<core_id>/events/<cola>/<suceso>`.

```jsonc
// ── RPCs (request/response). `<modulo>.<opcion>.request → <modulo>.<opcion>.response`
{
  "buscador_www": {
    "buscar_por_necesidad": {
      "request":  "core/<core_id>/api/request/buscador_www/buscar_por_necesidad",
      "payload":  "{ correlation_id, project_id, necesidad }",
      "response": "core/<core_id>/api/response/<correlation_id>",
      "respuesta": "{ status:200, data:{ candidatos:[ Candidato{nombre, fuente, material?, tiempo_estimado?, prioridad_sugerida} ] } }",
      "nota":     "Candidato es DTO de entrada; solo pasa a Modelo vía cola_modelos.agregar."
    }
  },
  "disenador_parametrico": {
    "generar_stl": {
      "request":  "core/<core_id>/api/request/disenador_parametrico/generar_stl",
      "payload":  "{ correlation_id, project_id, parametros }",
      "response": "core/<core_id>/api/response/<correlation_id>",
      "respuesta": "{ status:200, data:{ archivo } } | { status:422, error:'PARAMETROS_INVALIDOS' }"
    },
    "estimar_tiempo": {
      "request":  "core/<core_id>/api/request/disenador_parametrico/estimar_tiempo",
      "payload":  "{ correlation_id, project_id, parametros }",
      "response": "core/<core_id>/api/response/<correlation_id>",
      "respuesta": "{ status:200, data:{ minutos } }"
    }
  },
  "cupula_stl": {
    "registrar": { "request": "core/<core_id>/api/request/cupula_stl/registrar", "payload": "{ correlation_id, project_id, stl: { id, nombre, archivo, parametros, fecha } }", "response": "core/<core_id>/api/response/<correlation_id>", "respuesta": "{ status:201, data:{ id } }" },
    "obtener":   { "request": "core/<core_id>/api/request/cupula_stl/obtener",   "payload": "{ correlation_id, project_id, id }", "response": "core/<core_id>/api/response/<correlation_id>", "respuesta": "{ status:200, data:{ stl } } | { status:404, error:'NO_EXISTE' }" },
    "listar":    { "request": "core/<core_id>/api/request/cupula_stl/listar",    "payload": "{ correlation_id, project_id }", "response": "core/<core_id>/api/response/<correlation_id>", "respuesta": "{ status:200, data:{ stls:[Stl...] } }" }
  },
  "cupula_gcode": {
    "registrar":          { "request": "core/<core_id>/api/request/cupula_gcode/registrar",          "payload": "{ correlation_id, project_id, gcode: { id, stl_id, maquina, archivo, hash, fecha } }", "response": "core/<core_id>/api/response/<correlation_id>", "respuesta": "{ status:201, data:{ id } }" },
    "obtener_por_maquina": { "request": "core/<core_id>/api/request/cupula_gcode/obtener_por_maquina", "payload": "{ correlation_id, project_id, stl_id, maquina }", "response": "core/<core_id>/api/response/<correlation_id>", "respuesta": "{ status:200, data:{ gcode } } | { status:404, error:'NO_EXISTE' }" },
    "listar":             { "request": "core/<core_id>/api/request/cupula_gcode/listar",             "payload": "{ correlation_id, project_id }", "response": "core/<core_id>/api/response/<correlation_id>", "respuesta": "{ status:200, data:{ gcodes:[Gcode...] } }" }
  },
  "puente_creality": {
    "orquestar_slice":   { "request": "core/<core_id>/api/request/puente_creality/orquestar_slice",   "payload": "{ correlation_id, project_id, stl_id, maquina }", "response": "core/<core_id>/api/response/<correlation_id>", "respuesta": "{ status:200, data:{ gcode_id } }" },
    "arrancar_impresion": { "request": "core/<core_id>/api/request/puente_creality/arrancar_impresion", "payload": "{ correlation_id, project_id, gcode_id }", "response": "core/<core_id>/api/response/<correlation_id>", "respuesta": "{ status:200, data:{ ok:true } } | { status:409, error:'MAQUINA_OCUPADA' }" },
    "estado_impresion":  { "request": "core/<core_id>/api/request/puente_creality/estado_impresion",  "payload": "{ correlation_id, project_id }", "response": "core/<core_id>/api/response/<correlation_id>", "respuesta": "{ status:200, data:{ estado, progreso? } }" }
  },
  "estimador_tiempo": {
    "estimar_tiempo": { "request": "core/<core_id>/api/request/estimador_tiempo/estimar_tiempo", "payload": "{ correlation_id, project_id, parametros, material }", "response": "core/<core_id>/api/response/<correlation_id>", "respuesta": "{ status:200, data:{ minutos } }" }
  },
  "horarios_casa": {
    "listar":    { "request": "core/<core_id>/api/request/horarios_casa/listar",    "payload": "{ correlation_id, project_id }", "response": "core/<core_id>/api/response/<correlation_id>", "respuesta": "{ status:200, data:{ horarios:[Horario...] } }" },
    "actualizar": { "request": "core/<core_id>/api/request/horarios_casa/actualizar", "payload": "{ correlation_id, project_id, persona, ventanas }", "response": "core/<core_id>/api/response/<correlation_id>", "respuesta": "{ status:200, data:{ horario } }" },
    "obtener":   { "request": "core/<core_id>/api/request/horarios_casa/obtener",   "payload": "{ correlation_id, project_id, persona }", "response": "core/<core_id>/api/response/<correlation_id>", "respuesta": "{ status:200, data:{ horario } } | { status:404, error:'NO_EXISTE' }" }
  }
}

// ── Eventos de dominio (fire-and-forget, notify). CREATE-ONLY.
{
  "core/<core_id>/events/cola/modelo/entra":        "{ evento: 'cola.modelo.entra', modelo }",
  "core/<core_id>/events/cola/modelo/estado/cambia": "{ evento: 'cola.modelo.estado.cambia', id, de, a }",
  "core/<core_id>/events/cola/propuesta/siguiente":  "{ evento: 'cola.propuesta.siguiente', modelo, prioridad }",
  "core/<core_id>/events/cola/maquina/liberada":     "{ evento: 'maquina.liberada', instante }",
  "core/<core_id>/events/cola/ociosa":               "{ evento: 'cola.ociosa', causa: 'sin_candidatos_pendientes' }"
}
```

---

## 5. CRITERIO DE ACEPTACIÓN

Un blueprint full de este proyecto se da por hecho cuando:

1. **Existe** en `modules/<slug>/<slug>.blueprint.json` (contenido ≥ 800 chars).
2. **Roles clasificados** — cada op de `ui.ops` tiene su rol (`jefe`/`utilizacion`/`neutro`) en
   `ui.roles`, y la fase `jefe` es PRIMERA en `ui.flujo`.
3. **Frontend sincronizado** — copia en `frontend/src/lib/modules/<slug>/<slug>.blueprint.json`
   (la UI renderiza la del frontend; sin esta copia el PR se mergea y la UI no cambia).
4. **Commiteado en rama propia** (`agente/crear-blueprint-full`), PR abierto, merge externo.
5. **Sin rpc_fantasma** — todo `.request` declarado tiene su `.response` atendida (cúpula de eventos).
