# Motor de agentes — estado de construcción (rama hermes/framework-v3)

Sesión ag-2026. El árbol viejo (ai-agent-framework, LLM autónomo + bucle) se corta;
el motor nuevo (agente = pipeline determinista + fuzzy acotado) se planta AL LADO.
Este reference es el detalle de obra: paths, eventos, contratos y cómo probarlo.

## Esquema (fuente de verdad del diseño)

`arquitectura/esquema-motor-agentes/` — generado con la skill `esquematizador`
(prisma recursivo + disección). 10 piezas: 4 REFLEJO · 3 CUSTODIO · 1 MICRO-AGENTE
(el fuzzy) · 1 CONVERSOR · 1 PUENTE → ~90% determinista. Prueba de fuego: 0 tecnologías.

## Piezas construidas (ciclo de obra del diseccionador: reflejos → custodios → ejecutor)

| Pieza | Path | Tests | Eventos |
|---|---|---|---|
| P3 validador | `modules/_shared/motor/validador.js` | 19/19 (`node --test .../motor/test.js`) | lib pura |
| P4 JEFE | `modules/_shared/motor/verificador.js` | idem | lib pura — mundo INYECTADO `{existe,leer,enRepo}`; `enRepo` con `undefined` = no bloquea |
| P10 conversor | `modules/_shared/motor/conversor.js` | idem | lib pura — crudo→canónico (JSON/objeto/texto) |
| P2 registro | `modules/agentes/registro/` | smoke `/tmp/smoke-custodios.js` | `pipeline.declarar/obtener/listar.request` → `*.response`/`*.failed`/`pipeline.declarado` |
| P6 bitácora | `modules/agentes/bitacora/` | idem | `bitacora.abrir/paso/sellar/leer.request` → `*.abierta/registrado/sellada/leer.response` |
| P1 ejecutor | `modules/conversacion/ai-agent-framework-v3/` | smoke `/tmp/smoke-ejecutor.js` | `agent.execute.request` + `invoke_agent.request` (alias) + `llm.complete.*` |

## Contratos de pipeline (el registro los VALIDA — reglas duras)

- `name` requerido; `pasos` array no vacío con `tipo: reflejo|fuzzy`.
- **Determinismo obligatorio**: pipeline con fuzzy y SIN ningún reflejo → rechazado
  (`INVALID_INPUT`, "el determinismo es obligatorio").
- `entregable.path` + `entregable.reglas` (array no vacío) requeridos.
- Plantillas `<slug>` en el path se resuelven del task (stopwords + token tipo-slug).

## Flujo del ejecutor (lo que el smoke 4/4 demuestra)

1. `_pedir('pipeline.obtener.request', {request_id, nombre}, 'pipeline.obtener.response')` — el patrón request/response por eventos (publish + subscribe al *.response, filtro por request_id, timeout). Es el MISMO patrón que el gateway usa para las tools.
2. `bitacora.abrir.request` → pasos en orden:
   - **reflejo**: ejecuta la op determinista si la declara (`validar`), si no no-op registrado.
   - **fuzzy**: `llm.complete.request` (system = `paso.instruccion`, tools: [] — el generador NO tiene herramientas, solo genera) → respuesta por `llm_request_id` → `convertir` → `validar(paso.valida)` → si falla, reintento QUIRÚRGICO (máx `presupuesto.generaciones_por_paso`, default 3) → agotado = `PASO_FUZZY_NO_VALIDADO` (failed honesto, nunca success con humo).
3. JEFE: `verificar(entregableReal, mundo)` — mundo = fs real (storage/ del proyecto o modules/ del sistema) inyectable para smokes.
4. `bitacora.sellar.request` con el veredicto → estado `verificada`|`fallida`.
5. `agent.execute.response` (verificado + veredicto + pasos) | `agent.execute.failed` (ENTREGABLE_NO_VERIFICADO con reglas).
6. `agent.execute.progress` por paso (vitrina/marco existente).

## Cómo probarlo (sin tocar prod)

- Reflejos: `cd ~/3enki && node --test modules/_shared/motor/test.js`
- Custodios: `/tmp/smoke-custodios.js` (registro+bitácora con stores temporales, eventBus mock síncrono)
- Ejecutor: `/tmp/smoke-ejecutor.js` — flujo completo con registro+bitácora REALES en /tmp,
  gateway MOCK (responde `llm.complete.response` con content fijo) y mundo en /tmp.
  Lección del smoke: **cablear manualmente las suscripciones** (`bus.subscribe(ev, e => mod[handler](e))`)
  porque en prod las hace el loader de módulos — sin cablear, `_pedir` espera timeout.
  Lección 2: el mock del gateway debe responder con el `llm_request_id` del request, no uno fijo.

## Pitfalls de obra

- `fs.write` por el BUS no funciona (salió de GLOBAL_TOOLS, incidente the-pirate): usar
  `ui/request/fs/write { project_id, path, content }` (el core escribe como www-data).
- Hermes no puede escribir en `/opt/enki/data/projects/` sin sudo: crear proyectos con
  `ui/request/project/create` (el core crea el dir). El filesystem resuelve el proyecto
  por su registro — un proyecto recién creado sin chat puede caer a un storage raro
  (se vio el esquema escrito en `c/storage/motor/...`): verificar la ruta real.
- El esquematizador-agente (framework viejo) falla 3/3: bitácora `started→final` — el
  LLM recibe tools (fix "LUZ" en prod) y responde texto sin invocar ninguna. No
  re-litigar: usar la skill `esquematizador` (Hermes aplica el método directamente).
- Agentes largos (>6 min): `terminal(background=true, notify_on_complete=true)`; NUNCA
  pipear a head/tail (bufferiza stdout); verificar por bitácora, no por el stdout.

## Siguiente obra pendiente (marcado en el esquema)

- FUZZY real: el contrato `llm.complete.request` está cableado; falta probar con el
  proveedor real (deploy). Los smokes usan gateway MOCK.
- Rail (P7): reutilizar `estados.*` — no construir otro.
- Fase de corte: cuando el motor verifique en prod, retirar el framework viejo
  (poda tras verificar dependencias reales).

## Sesión final (PR #144 mergeado + 6f7f5ba0): el ciclo completo

El motor está en MAIN (`ad4c16d4` = PR #144; `6f7f5ba0` = paso escribir + pipelines
+ seed). Lo que cerró el círculo:

### Paso reflejo `escribir` (el pipeline toca el mundo real)

`op: 'escribir'` en un paso reflejo: escribe `salidaUltima` (la canónica del fuzzy)
en el path del entregable RESUELTO (slug sustituido). `{content: '...'}` → texto
plano; objeto → `JSON.stringify(obj, null, 2)`. Requisito: `entregableReal` se
resuelve AL ABRIR la bitácora (antes del loop), no al final — o el escribir usa el
path con plantilla `<slug>` y escribe mal.

### Pipelines de proceso (formato REAL — difiere de la spec inicial)

`modules/agentes/registro/store/*.json` (fuente única, commiteada — el store del
custodio; el antiguo dir espejo en arquitectura/ se eliminó):

```json
{
  "name": "construir-modulos",
  "pasos": [
    { "paso": "leer_plan_y_rail", "tipo": "reflejo" },
    { "paso": "generar_codigo", "tipo": "fuzzy",
      "instruccion": "Genera el CÓDIGO del módulo Enki (index.js)...",
      "valida": { "tamano_min": 200 } },
    { "paso": "escribir_modulo", "tipo": "reflejo", "op": "escribir" }
  ],
  "entregable": { "tipo": "fs", "path": "<slug>/index.js", "reglas": ["existe", "api_real", "en_repo"] },
  "presupuesto": { "generaciones_por_paso": 3, "max_tokens": 64000, "generacion_timeout_ms": 240000 }
}
```

- `valida` es OBJETO (`{campos, tamano_min}`), no array.
- Las skills/esquemas/planes (texto largo) → salida plano → conversor la envuelve
  `{content}` → valida `tamano_min` mide el content (fix del validador).
- El entregable `cosecha/cantera/enki/<slug>/SKILL.md` usa `min_chars` para la
  regla `contenido_min`.

### Seed

`scripts/seed-pipelines.js` — declara los pipelines vía el CUSTODIO
(`onPipelineDeclararRequest` directo con eventBus mock para capturar el resultado),
NUNCA escribiendo el store del registro a mano. 4/4 ✅. Ejecutar tras el deploy:
`node scripts/seed-pipelines.js`.

### Smoke del ciclo completo (`/tmp/smoke-escribir.js`)

- Gateway MOCK devuelve el código de un módulo Enki real → escribir crea
  `modules/<slug>/index.js` → JEFE verifica `existe + api_real` → verificado:true,
  bitácora `verificada`. Caso B: skill en la cantera → `contenido_min` pasa.
- **Pitfall del mini-bus**: el publish debe iterar `listeners.get(topic)` Y
  `listeners.get('*')` — sin el reenvío a `*`, el capturador `publicados` queda
  vacío y todos los asserts de eventos fallan aunque el flujo funcione (los
  archivos se escriben y las bitácoras se sellan — verificar por disco, no por el
  capturador).
- **Slug**: token no-stopword MÁS LARGO (no el primero): 'planes-y-tiers' gana a
  'skill'. Stopwords: skill, esquema, genera, plan, construye, escribe + artículos/verbos.

### Lección de flujo (Paco)

El commit del paso escribir cayó en MAIN sin rama (tras el merge del PR #144 se
editó directo). Regla: tras cada merge, crear la rama del siguiente bloque ANTES
de editar y verificar `git branch --show-current`. El trabajo estaba verificado
(smokes verdes) pero el flujo hermes/* + PR se violó — Paco decide si se queda o
se rehace.
