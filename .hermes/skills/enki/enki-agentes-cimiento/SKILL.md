---
name: enki-agentes-cimiento
description: >-
  Ejecución de AGENTES en Enki: el framework ai-agent-framework y su CIMIENTO v3
  (JEFE que verifica el entregable antes del success, BITÁCORA custodio, REANUDADOR,
  VITRINA). Incluye el diagnóstico del "humo" (success sin trabajo), el manifest v2
  (entregable + presupuesto), cómo invocar/probar agentes por MQTT externamente
  (envelope canónico del bus), y cómo verificar que un deploy llevó los cambios.
  Incluye los pitfalls de la cadena completa de "b" (slug del módulo, identidad
  git de www-data, en_repo vs staging, chat ciego a modules/) y el replanteo de
  la FASE 3 en dos mitades: PLASMA (el LLM diseña en pseudocódigo OOP, SIN
  conocer Enki) + ADAPTADOR X→Enki (traduce el diseño al sistema real contra el
  inventario; polivalente, PR #168).
  Úsala antes de diagnosticar agentes que "reportan éxito sin entregable", de
  reescribir/endurecer el framework, de probar un agente por el bus, de verificar
  un deploy de Enki, o de revisar un plan de construcción que reinventa módulos
  que el sistema ya tiene.
when-to-use: >-
  · Un agente de Enki reporta "success" y el trabajo no existe / está a medias.
  · Necesitas invocar o probar un agente (agent.execute.request) desde fuera del chat.
  · Verificas si un deploy llevó cambios a prod (/opt/enki).
  · Tocas el framework de agentes (manifest, entregables, gates, bitácora).
source: hermes
tags: [enki, agentes, ai-agent-framework, cimiento, mqtt, envelope, verificación, entregable, gate]
---

# Agentes en Enki — el CIMIENTO v3 y cómo operarlo

## El diagnóstico del HUMO (la lección que lo empezó todo)

Dato duro del historial real (`agent_executions` de los proyectos b y c):
**22/22 ejecuciones registraron "success" y la mayor parte del trabajo no existía**
(15 módulos de "b" barridos por el deploy; la skill 18 de "c": "success" de 97s y
el archivo no estaba en NINGÚN sitio del disco).

Causa raíz: el framework **certificaba "el LLM terminó su bucle" como success**.
En 50K chars de ai-agent-framework solo había 1 aparición de "validar". El LLM podía
decir "listo" sin llamar a la tool que persiste, o escribir a medias y reportar éxito.

Regla que rige desde entonces (P1 del cimiento): **success = ENTREGABLE VERIFICADO**.
Quien certifica es el sistema (reflejo determinista), nunca el LLM.

## La arquitectura del CIMIENTO v3 (implementada en el PR #140)

```
agent.execute.request → bitácora abierta (custodio) → llm-flow ejecuta
→ termina → JEFE verifica el entregable declarado → se sella la bitácora
→ agent.execute.response { verificado, veredicto, pasos, llm:{...} }  o  failed ENTREGABLE_NO_VERIFICADO
```

Piezas (del esquema validado por el esquematizador — 7 reflejo · 2 custodio · 1 agente · 1 puente):

| Pieza | Forma | Implementación |
|---|---|---|
| JEFE | reflejo | `cimiento.verificar(entregable, ctx)` — reglas: `existe` · `api_real` (import `_shared` + `_atender` 4 args + name/version) · `en_repo` (git ls-files, lección rsync --delete) · `contenido_min` |
| CONTRATO | reflejo | `cimiento.preparar(agent)` — manifest v2: `entregable` + `presupuesto` |
| BITÁCORA | custodio | `storage/agentes/bitacoras/<request_id>.json` — pasos reales, single-writer, sobrevive reinicios |
| REANUDADOR | reflejo+custodio | `agent.execute.resume.request` — retoma una pausada (timeout → pausa con session_id+prev_state) |
| VITRINA | puente | veredicto + pasos viajan en `agent.execute.response` y `.failed` |

### Manifest v2 (el contrato que hace el gate posible)

```json
{
  "name": "construir-modulos",
  "presupuesto": { "max_tokens": 64000, "timeout_ms": 1800000, "max_iteraciones": 500 },
  "entregable": {
    "tipo": "fs",                       // fs | evento | juicio | ninguno
    "path": "<slug>/index.js",          // plantillas <slug>/<nombre>; "storage/..." = storage del proyecto
    "reglas": ["existe", "api_real", "en_repo"],
    "min_chars": 100                    // para skills (regla contenido_min)
  }
}
```

- `entregable: null` (agente v1) → success con `verificado:false` explícito — compat total, nadie confunde.
- `tipo: 'juicio'` → puerto `verificar(juicio)` — se reporta NO verificable, nunca se finge.
- El framework `_loadAgents` propaga `presupuesto` y `entregable` al objeto agente (parche necesario).
- Ojo con las rutas: `cimiento.js` vive en `modules/conversacion/ai-agent-framework/` → `MODULES_DIR = path.resolve(__dirname, '../..')` (subir DOS niveles).

### Entregable MULTI-ARCHIVO (PR #158 — FASE 7 construir-interfaz)

Un pipeline puede declarar `dir` + `archivos[]` en vez de un solo `path`: el
reflejo `escribir` escribe TODOS los archivos, el JEFE verifica TODOS (veredicto
`multi_archivo` con el resultado por path). El fuzzy devuelve
`{ archivos: { '<rel>': '<contenido>' } }`.

```json
"entregable": {
  "tipo": "fs",
  "dir": "frontend/src/lib/modules/<slug>/",
  "archivos": ["manifest.json", "index.ts", "<Slug>Panel.svelte"],
  "reglas": ["interfaz_operativa", "en_repo"]
}
```

- `_resolverEntregable` resuelve `<slug>` y `<Slug>` (primera letra mayúscula +
  resto igual) en dir y archivos → `paths[]`; el loop de pasos (escribir/commitar)
  y el JEFE iteran `paths[]`. Un solo veredicto combinado.
- **Rutas `frontend/` se resuelven contra el REPO** (`<repo>/frontend`), no contra
  `modules/`: `_resolver` y `_commitar` necesitan la rama `rel.startsWith('frontend/')`
  → `path.join(repoDir, rel)` (y el mundo `enRepo`: `git ls-files -- frontend/...` sin
  prefijar `modules/`).
- **El fuzzy suele devolver las claves SIN el prefijo del resolver** (`esquemas/...`
  en vez de `storage/esquemas/...`): la escritura multi-archivo busca la clave exacta
  y luego los fallbacks `rel.replace(/^frontend\//,'')` y `rel.replace(/^storage\//,'')`.
- **NO pongas `contenido_min` global en multi-archivo**: pasadas legítimas (ej.
  pasada-2 de un prisma) pueden ser cortas; la estructura la verifica el gate del
  orquestador por NOMBRES de archivo, no el JEFE por longitud.

### Fases de interfaz del proceso (F6 → F6½ → F7) — la lección grave

Skills `decidir-interfaz` · `esquematizar-interfaz` · `construir-interfaz` en la
cantera + pipelines en el registro + reglas del JEFE:

```
F6  decidir-interfaz      → type+zone canónicos en module.json (regla interfaz_decidida)
F6½ esquematizar-interfaz → prisma de 5 huecos sobre "la interfaz del módulo X de tipo Y"
                            → SPEC en UN archivo: esquemas/interfaz-<slug>.md
                            (patrón del repo: UN entregable = UN path, como esquema.md;
                            el prisma + disección van EMBEBIDOS en el mismo archivo)
F7  construir-interfaz    → CONSUME la spec → trío frontend/ (store + panel + UIModule)
                            (regla interfaz_operativa: manifest.json + index.ts + <Slug>Panel.svelte;
                            EXCEPCIÓN documentada al patrón UN path — el trío son 3-4
                            archivos físicos inseparables que el loader necesita)
```

**Lección GRAVE (corrección de Paco en vivo)**: intentamos saltar de F6 a F7 y el
panel se habría improvisado sin anatomía — "no hemos pasado esquematizador a la idea
de a partir del tipo de interfaz elegida y el módulo". Regla: **NUNCA construir sin
esquematizar primero**. La SPEC del prisma precede a la construcción; el gate del
orquestador verifica `esquemas/interfaz-<slug>.md` (UN archivo, patrón del repo:
UN entregable = UN path) antes de aceptar la fase. Los módulos con
`ui_decision.necesita=false` cierran F6½ y F7 directo, sin archivos.

**RUTAS WEB de la F7 (corrección de Paco en vivo)**: cuando el dueño dice "ruta" en
contexto de interfaz se refiere a DIRECCIÓN WEB (URL), no a path de archivo. El
`manifest.json` del módulo lleva `routes: [...]` — las URLs donde su botón es visible
en el frame — y el patrón exige SOLO deep-links reales de `frontend/src/routes/`
(scopeados `/[project_id]/<pagina>` o planos `/chat`) o páginas del `PAGE_CATALOG`
(`frontend/src/lib/ui-core/project-pages.ts`). NUNCA se inventa una URL nueva dentro
del manifest: si la página no existe, se crea aparte siguiendo `/[project_id]/<pagina>/`.
Verificar contra las rutas reales del frame antes de generar (p.ej. `contenido` →
`["/carta-digital"]`, `impresion` → `["/comandero"]`).

### Separación LLM vs AGENTE (HECHO — PR #141)

La respuesta del modelo (`llm.complete.response`, canal interno gateway↔framework) y la del
agente (`agent.execute.response`, canal público) son eventos distintos. El payload del
response las separa del todo:

```json
{
  "veredicto": { "verificado": true, "motivo": "...", "reglas": [...] },  // la respuesta del AGENTE
  "pasos": [...],                       // la bitácora
  "llm": { "content": "...", "model": "...", "tokens": {...} }            // anexo ETIQUETADO del modelo
}
```

- `result.content` se mantiene por compat (agent-observer/chat lo usan) — el bloque `llm:` es aditivo.
- Cadena completa: framework → puente `chat-io` (conversation/{id}/agent_status lleva `veredicto` + `llm.content`) → store `agente-progreso.ts` (`veredicto` + `llm_content`) → `AgenteMarco.svelte` (bloque ✅/❌ "Entregable verificado" con reglas + `<details>` "Lo que dijo el modelo").
- **Schema pagado**: `agent.execute.response.schema.json` tenía `additionalProperties:false` y el cimiento ya emitía verificado/veredicto/pasos (deuda real) — ahora declarados + `llm` + `entregable`.
- **Rehidratación del marco**: `chat-io` ganó el ui_handler `agentes.bitacora` (`handleBitacora`) que sirve `storage/agentes/bitacoras/<request_id>.json`; el frontend llama `mqttRequest('agentes','bitacora',{project_id,request_id})` y reconstruye la ejecución (verificada→done, fallida→failed, pausada/ejecutando→running) al montar `/agentes/[request_id]`. Patrón: para servir datos del servidor al frontend, añadir un ui_handler, no un endpoint HTTP.

### La puerta LEGACY (invoke_agent) — PR #142, el hallazgo que casi lo deja abierto

**El chat de Enki invoca a los agentes por `invoke_agent` (el camino LEGACY), NO por
`agent.execute.request`** (medido: 42 invocaciones en un día en el proyecto "c"). El
cimiento v3 solo cubría el canónico → un agente invocado desde el chat escapaba al JEFE:
sin bitácora, sin veredicto, humo posible por esa puerta.

Evidencia en vivo: tanda de las 13:58 ("construye 3 módulos") por legacy → construyó 1 de 3
(`gestor-de-suscriptores` existe; los otros 2 no) y nadie lo verificó. El chat decía "no dejó
nada aplicado" porque su fs está scopeado al storage y no ve `modules/` — el módulo SÍ estaba.

Cierre (mismo patrón que el canónico, en `_runAgentLegacy` + branch legacy de
`onLlmCompleteResponse`): contrato (`cimiento.preparar`) + bitácora al lanzar, y el JEFE
verifica ANTES del `invoke_agent.response` → si el entregable no existe, response con
`error: { code: 'ENTREGABLE_NO_VERIFICADO', veredicto }` (el chat lo ve como fallo, jamás
como éxito). El shape del error ya existía (RESOURCE_NOT_FOUND lo usaba).

Regla: **al tocar el framework de agentes, cubrir SIEMPRE ambas vías (canónica + legacy)**.
Nota: la bitácora del legacy solo se crea si el chat manda `context.project_id` (no lo manda)
— el JEFE igual verifica contra modules/; el fallback de project_id queda pendiente.

### El MARCO ve las ejecuciones del chat (legacy) — PR #143

El marco (AgenteMarco) solo se alimentaba de `agent.execute.*` (canónico) — las
invocaciones del chat (legacy) no emitían esos eventos y el marco nunca aparecía.
Cierre SIN duplicar registros:

- `_runAgentLegacy` publica `agent.execute.progress` (step `started` al lanzar,
  `finalizing` al cerrar) cuando hay `conversation_id` → el marco se abre y se llena
  (conversation-export NO escucha progress → sin duplicados).
- El `invoke_agent.response` lleva `conversation_id` (éxito y error).
- `chat-io` ganó `onInvokeAgentResponse` (subscribe `invoke_agent.response`) →
  publica `conversation/{id}/agent_status` idle con `veredicto` + `llm.content` →
  el marco se cierra con el veredicto del JEFE.
- NO se emite `agent.execute.response` desde legacy (eso duplicaría la fila en
  agent_executions vía el buffer de conversation-export).

## Invocar/probar un agente por MQTT desde fuera (el envelope — pitfall crítico)

Publicar el payload directo NO funciona: el bus Enki exige el **EventEnvelope canónico**
y **descarta los eventos cuyo `source.core_id` es el propio core** (anti-loop):

```json
{
  "event_id": "<uuid>",
  "event_type": "agent.execute.request",
  "timestamp": "<ISO>",
  "source": { "core_id": "hermes-cli", "module_id": "hermes" },
  "data": { "request_id": "...", "agent_name": "escribir-skills", "project_id": "c", "task": "..." },
  "metadata": {}
}
```

- Topic: `core/core-a/events/agent/execute/request` (el bus se suscribe a `events/#`).
- `source.core_id` DEBE ser distinto de `core-a` (ej: `hermes-cli`) o el bus lo ignora en silencio.
- Respuesta en `core/core-a/events/agent/execute/{response,failed,progress}`.
- Script re-ejecutable: `scripts/invocar-agente-mqtt.js` (usa el mqtt de `/opt/enki/node_modules`).
- **Crear proyecto limpio + conversación + enviar guión** (validar el proceso F0-F7 sin
  contaminación): `scripts/crear-proyecto-limpio.js "<nombre>" "<título conv>" "<archivo guión>"`
  — crea el proyecto, la conversación con nombre de fase y manda el guión al LLM con el
  contrato real del frontend (project/create → conversation/create → conversation/send
  con 9 campos). El proyecto nace de cero: si el chat encadena las fases SOLO, el proceso
  está demostrado.
- **Smoke LOCAL de un pipeline SIN tocar prod ni ensuciar el repo** (probado con el
  adaptador, 2026-08): `scripts/smoke-pipeline-local.js <pipeline> "<task>" ["<respuesta>"]`
  — instancia el motor v3, stubs `_pedir` (pipeline del registro + bitácora + project.get
  → /tmp), captura `llm.complete.request` vía `_publicar` y responde por
  `motor.onLlmCompleteResponse({data:{request_id, content, finish_reason:'end_turn'}})`.
  Lo que PRUEBA y muestra: (1) la INYECCIÓN — la task efectiva que recibe el fuzzy con
  las rebanadas inyectadas (base + tema), el inventario y el mandato (la prueba clave de
  `usa_rebanadas`/`usa_inventario`); (2) el flujo completo hasta el entregable escrito
  en `/tmp/smoke-<pipeline>/`; (3) cero efectos secundarios (sin `_commitar` real, nada
  en el repo). Pitfalls: NO sobreescribir `_generar` para el smoke (pierdes la inyección
  que quieres VER — hay que pasar por `_publicar`); el require del motor debe ser
  ABSOLUTO (el script vive en scripts/, no en la raíz del repo); el mandato es "No
  inventes" (mayúscula — un check case-sensitive con minúscula da falso negativo);
  `project.get` responde `{project:{base_path}}` (no `{data:{...}}`) para que el slug
  resuelva a /tmp.
- Cronología real de una prueba completa (receive → progress → failed → bitácora sellada)
  y comandos de diagnóstico reutilizables: `references/prueba-cimiento-prod.md`.

## Verificar que un deploy llevó los cambios

1. Comparar archivos repo (~/3enki, main) vs prod (/opt/enki) — IDÉNTICOS = deploy hecho.
2. Marcadores de código en prod (ej: `toolProducirSkill`, `ENTREGABLE_NO_VERIFICADO`, `_verificarUnSlug`).
3. `systemctl show enki -p ActiveEnterTimestamp` — el reinicio del core DEBE ser posterior al merge.
4. El arranque del core NO loguea la carga de módulos a `current.jsonl` (solo eventbus/activity) — no buscar ahí "module.loaded".

### El chat responde con el código del ARRANQUE del proceso, no con el disco (lección 2026-08)

El deploy puede estar HECHO (archivos nuevos en `/opt/enki/`) y el chat seguir viendo el sistema
viejo — el motor corre con el código cargado en memoria al arrancar (`_registrarTools`, el enum
de `invoke_agent`, los fixes). Secuencia real (proyecto "b", 2026-08): archivos nuevos en disco a
las 16:14, proceso enki arrancado a las 07:29 → el chat a las 19:37 reportaba "solo 4 pipelines,
adaptar-a-enki no existe" (CORRECTO para su memoria); el proceso se reinició a las 19:40 → el
motor nuevo ya ve los 8 pipelines. El chat no mentía: **respondió con el código del arranque
anterior al reinicio**.

Diagnóstico: `ps -o lstart= -p $(pgrep -f 'node.*enki' | head -1)` (inicio del proceso ACTUAL)
vs. timestamp de los archivos en disco y vs. el timestamp de la consulta del chat. Si el proceso
arrancó DESPUÉS del mensaje del chat, la respuesta refleja código viejo — reintentar tras el
reinicio, no parchear nada. Regla: **antes de concluir "el deploy no llegó" o "el agente no
existe", verificar el inicio del proceso**, no solo los archivos en disco. `systemctl is-active`
solo dice que corre, no DESDE CUÁNDO con qué código.

## La NUEVA VISIÓN (replanteo de Paco — ag-2026): el árbol podrido se corta

Tras el día del cimiento, Paco paró la reescritura con una intuición de diseño
fundamental: **"el framework viejo (LLM autónomo + bucle de tools) es la visión
equivocada — repetirla con otro framework es repetir el error"**. La visión
correcta (la suya, confirmada con el estándar de la industria: Claude Code ve la
realidad, NEXUS da el QA loop, LangGraph usa el LLM como nodo):

> **Un agente en Enki = un PIPELINE casi todo determinista, con una parte fuzzy
> acotada y verificada.** El LLM solo GENERA en los pasos declarados fuzzy —
> nunca ejecuta ni decide el flujo. Los reflejos (deterministas) ejecutan y
> verifican. Checkpoint después de cada paso fuzzy. El JEFE verifica el
> entregable al final.

Pipeline ejemplo (construir-modulos): leer plan+rail → resolver contrato →
**generar código (único fuzzy)** → validar manifest → escribir en modules/ →
JEFE verifica → cerrar fase. Si el paso fuzzy produce basura, el checkpoint lo
pilla y **se reintenta SOLO ese paso**, no todo el agente.

El manifest del agente declara el pipeline (no solo prompt_file):

```json
{
  "name": "construir-modulos",
  "pipeline": [
    { "paso": "leer_plan_y_rail",  "tipo": "reflejo" },
    { "paso": "generar_codigo",    "tipo": "fuzzy", "valida": ["manifest", "tamano_min"] },
    { "paso": "escribir_modulo",   "tipo": "reflejo" },
    { "paso": "verificar_jefe",    "tipo": "reflejo", "reglas": ["existe", "api_real", "en_repo"] },
    { "paso": "cerrar_fase",       "tipo": "reflejo" }
  ]
}
```

El motor nuevo está **CONSTRUIDO Y EN MAIN** (PR #144, merge `ad4c16d4`; el paso
`escribir` + los pipelines de proceso + el seed llegaron en `6f7f5ba0`; cero
manifests viejos dentro — los pipelines los custodia el registro):

```
arquitectura/esquema-motor-agentes/              esquema (skill esquematizador, 0 tecnologías)
modules/_shared/motor/                           reflejos puros (19/19 tests):
    validador.js (P3) · verificador.js (P4, JEFE con MUNDO inyectado DI) · conversor.js (P10)
modules/agentes/registro/                        CUSTODIO P2 (16/16 smoke):
    pipeline.declarar/obtener/listar.request → *.response / *.failed
modules/agentes/bitacora/                        CUSTODIO P6 (16/16 smoke):
    bitacora.abrir/paso/sellar/leer.request → *.abierta/registrado/sellada/leer.response
modules/conversacion/ai-agent-framework-v3/      EJECUTOR P1 (4/4 casos smoke):
    agent.execute.request + invoke_agent (alias del mismo pipeline)
```

Flujo del ejecutor: pipeline del REGISTRO → abrir BITÁCORA → pasos uno a uno
(reflejo = determinista; fuzzy → `llm.complete.request` → CONVERSOR → VALIDADOR →
reintento QUIRÚRGICO según presupuesto) → JEFE contra el MUNDO REAL (storage del
proyecto o modules/ del sistema, puerto inyectable) → sellar → `response verificado`
| `failed ENTREGABLE_NO_VERIFICADO`. Los custodios se hablan por eventos con
`request_id` (patrón `_pedir`: publish + subscribe al `*.response`, filtro por
request_id — el mismo que usa el gateway para las tools).

### El ciclo COMPLETO (PR #144 + 6f7f5ba0): el paso `escribir` cierra el círculo

El fuzzy GENERA → el reflejo **`escribir`** (op del paso reflejo) ESCRIBE la salida
en el mundo real (path del entregable resuelto con el slug; `{content}` → texto
plano, objeto → JSON pretty) → el JEFE verifica el archivo ESCRITO. Smoke 2/2:
construir-modulos escribe `modules/<slug>/index.js` y `api_real` pasa; escribir-skills
escribe la SKILL.md y `contenido_min` pasa. **Sin el paso `escribir` el pipeline no
toca el mundo: el JEFE fallaría siempre** (nadie escribió el entregable).

Los **4 pipelines de proceso** viven en `arquitectura/esquema-motor-agentes/pipelines/*.json`
(construir-modulos, escribir-skills, esquematizador-negocio, planificar-construccion).
Formato REAL (no el de la spec inicial): `pasos: [{paso, tipo: 'reflejo'|'fuzzy',
op? (ej 'escribir'), instruccion? (el prompt del paso fuzzy), valida: {campos?,
tamano_min?}}]`, `entregable: {tipo:'fs', path, reglas, min_chars?}`,
`presupuesto: {generaciones_por_paso, max_tokens, generacion_timeout_ms}`.

**Seed**: `scripts/seed-pipelines.js` — declara los pipelines vía el CUSTODIO
(`pipeline.declarar.request` directo al módulo, nunca escribiendo el store del
registro a mano). Ejecutar tras el deploy: `node scripts/seed-pipelines.js` (4/4 ✅).

Decisiones tomadas con Paco: **JS puro + event-driven** (Rust solo para los reflejos
puros si la verificación escalara a CPU-bound — el JEFE es pieza aislada, extraíble);
el rail (P7) se REUTILIZA (`estados.*`, referencia no duplicar); la vitrina (P8) son
los `agent.execute.progress` que el marco existente ya proyecta.

El esquematizador-agente falló 3 veces (bitácora `started→final` — el LLM no usó
tools); el esquema se generó con la skill `esquematizador` y se escribió vía
`ui/request/fs/write`. Detalle de construcción: `references/motor-construido.md`.

Cómo comportarse con Paco en esto: NO defender el framework viejo, NO proponer
otra reescritura con la misma visión, NO ofrecer opciones A/B/C — él ya tiene la
visión; hay que ejecutarla (esquematizar → diseñar → construir el motor).

### La RAÍZ de la lentitud del agente: el turno sintético (`async_invocation`) — ag-2026

Síntoma que lo destapó (proyectos panadería/f/a, 2026-08): el agente
`esquematizador-negocio` tardaba ~70s por intento y devolvía vacíos/truncados,
mientras Hermes con el MISMO provider (deepseek-v4-flash) respondía en segundos.
La diferencia NO era el provider — era lo que el agente pagaba ANTES de hablar.

**Causa raíz**: el motor v3 publicaba `llm.complete.request` SIN
`context.async_invocation` → el gateway (`ai-gateway.onLlmCompleteRequest`) lo
trataba como turno REAL del chat → inyectaba TODO el andamiaje (sintonizador +
cantera + biblioteca + índice RPC + propiocepción + memoria resumen + perfil =
55-62K tokens por generación) → provider lento, salidas vacías intermitentes,
truncados. El chat pagaba esos mismos tokens (input 60K+ por turno).

**Fix (PR #161)**: el motor manda
`context: { async_invocation: true, source: 'motor-v3' }` en `llm.complete.request`
Y el gateway DEBE propagar `context` de `onLlmCompleteRequest` a `_executeLLM`
(antes lo descartaba — el flag se perdía en el aire). Con el flag, las ~10
inyecciones del andamiaje se saltan (todas gateadas por `!context?.async_invocation`).

**Optimización del gateway (PR #162)**: además, `_executeLLM` componía el system
prompt con 8 lecturas RPC SECUENCIALES por turno (cantera→biblioteca→propiocepción→
resumen→perfil→rag→empujón→rail, timeout 2-3s c/u) → el turno pagaba la SUMA
(8-20s) antes de llamar al LLM. Fix: `Promise.all` (paga el MÁXIMO ~2-3s) con el
MISMO orden de ensamblado; cache TTL 30s para cantera/biblioteca con invalidación
por `cosecha.promover/crear/patch.response` y `bibliotecario.catalogo.actualizado`
(se cachea también el null para no repetir el castigo del timeout).

**Regla al diagnosticar lentitud de un agente con provider sano**: medir el system
prompt efectivo (si lleva cantera/biblioteca/RPC → el turno NO se marcó sintético),
no culpar al provider. El flag `async_invocation` es la frontera entre "turno real
del chat" y "generación del motor". Mediciones completas (bitácoras, números,
verificación): `references/lecciones-velocidad-agente.md`.

## Pitfalls acumulados

- **fs del agente/chat está scopeado al storage del proyecto** — para escribir en `modules/`
  del sistema la ÚNICA vía es `productor.producir` (módulos) / `productor.skill` (cantera).
  Un agente que "escribe con fs.write" y reporta success probablemente no escribió nada.
- **El deploy borra lo no commiteado**: `rsync --delete` → módulos/skills solo en prod se
  borran. El gate exige `en_repo` (git ls-files). El commit de lo producido lo hace Hermes
  desde ~/3enki (el core no tiene git).
- **Los agentes de proceso (FASE 4/5) trabajan contra el rail** (estados.*): 1 en 1 por
  defecto, "a full" solo si el mandato lo pide explícito. El rail no se duplica: se reutiliza.
- **agent_executions registra "success" aunque el evento sea failed** (conversation-export
  no distingue el cierre) — la verdad está en el evento público y en la bitácora, no en esa tabla.
- **El esquematizador vale para validar diseños**: aplicarlo a un guion técnico ANTES de
  implementar revela piezas faltantes (aquí: JEFE separado del TALLER, BITÁCORA como
  custodio, VITRINA como puente) — ver skill `esquematizador`.
- **HTTP 402 Insufficient Balance ≠ fallo del cimiento**: si un agente/chat falla con
  UNKNOWN_ERROR y el error real es `HTTP 402 Insufficient Balance`, el proveedor del LLM
  está sin saldo (en "c": `deepseek-anthropic`). No tocar el framework: recargar saldo/key.
  El 402 se ve en `agent_executions.error` (columna error) o en `llm.complete.failed`.
- **PASO_FUZZY_NO_VALIDADO con "salida cruda vacía (string vacía)" = el provider devolvió
  content vacío SIN error** (no es 402, no es timeout — sesión panadería 2026-08): el paso
  fuzzy agota sus 3 generaciones porque `llm.complete.response` llega con `content: ''`.
  Señales que lo distinguen: los intentos tardan ~70s (muy por debajo del presupuesto de
  300s), NO hay `llm.complete.failed` ni `*.failed` en el log, y NO hay 402. El MISMO
  pipeline puede verificar 4 veces y fallar 3 con la MISMA config: es el provider
  (deepseek-v4-flash) devolviendo vacío de forma intermitente, no la config ni el
  pipeline. Diagnóstico correcto: abrir la bitácora
  `storage/agentes/bitacoras/<request_id>.json` → pasos "intento N: salida cruda vacía".
  El log `current.jsonl` NO guarda payloads (solo metadata event_flow) — no buscar ahí
  el finish_reason. El sistema se comportó BIEN (bitácora fallida honesta, JEFE no
  certificó éxito vacío). El vacío es del lado del proveedor (deepseek-v4-flash
  intermitente); desde el PR #161 el motor registra el `finish_reason`/`tokens` de
  cada intento en la bitácora, así el motivo real del vacío (length / end_turn /
  stop_reason) queda visible y diagnosticable.
- **Un entregable TRUNCADO pasa la verificación — los gates miden presencia, no
  integridad** (hallazgo proyecto "a", 2026-08): el esquema.md del esquematizador
  quedó cortado a MITAD de la tabla de piezas ("…división, b" — 82 líneas, 7.164
  bytes ≈ ~2.000 tokens) y la bitácora dice `verificado: true`. La regla `existe`
  del JEFE solo comprueba que el archivo esté en disco; `tamano_min` (500) mide
  cantidad, no calidad; el `entregable.min_chars` ni siquiera estaba declarado.
  El truncado NO fue el techo de `max_tokens` (32K): gastó ~6% — el modelo terminó
  su turno a mitad (`end_turn` prematuro) o el provider devolvió un chunk
  incompleto sin avisar. Señal de truncado: el archivo termina a mitad de frase /
  fila de tabla / lista. Y el motivo de corte es INVISIBLE: el motor no persiste
  el `finish_reason`/`usage` del `llm.complete.response`, y `agent_executions`
  deja `tokens/cost/duration_ms` a NULL (solo el metadata del mensaje del chat
  guarda tokens, y esos son los del CHAT — 55-62K por turno — no los del agente).
  Refuerzo HECHO en el PR #161 (2026-08, rama hermes/registro-finish-reason, 30/30
  tests): el motor v3 ahora PROPAGA `finish_reason` + `tokens` desde
  `llm.complete.response` (el gateway YA los mandaba — `ai-gateway._executeLLM`
  devuelve `{content, finish_reason, tokens, model, provider}`; el motor los
  descartaba en `onLlmCompleteResponse`). La bitácora registra cada intento con
  metadatos: `intento 2: válido [finish_reason=end_turn · tokens=32000 (in 1000 /
  out 2000)]`. Y `finish_reason === 'length'` se trata como TRUNCADO → intento NO
  válido + regeneración (mensaje `TRUNCADO (finish_reason=length) — regenerando`);
  un esquema a medias ya no pasa como válido aunque supere tamano_min. Pendiente
  REAL (no hecho): validar secciones clave del esquema (exigir cabeceras finales
  como puertos/principios) y marcar salidas que terminen a mitad de estructura —
  el JEFE sigue sin poder distinguir "completo" de "truncado pero con length≠".
  Al analizar un esquema "verificado": `tail` del archivo — si se corta a mitad,
  el veredicto mintió sobre la completitud, no sobre la existencia.
- **El gateway IGNORABA el `max_tokens` del payload del pipeline → truncado a
  8192 con finish_reason=max_tokens** (PR #164, evidencia bitácora de "b"
  2026-08: `intento 1: válido [finish_reason=max_tokens · tokens=10335 (in 2143 /
  out 8192)]` con el pipeline declarando `max_tokens: 32000`): el motor v3 mandaba
  el tope correctamente en `llm.complete.request`, pero `ai-gateway.onLlmCompleteRequest`
  NO lo leía del payload — solo usaba `settings?.max_tokens` (que el motor no
  manda) → `Math.max(0, 8192)` → el FLOOR de 8192 SIEMPRE. Un esquema que necesita
  >8192 tokens de salida se cortaba a mitad del prisma en CADA reintento (no es
  mala suerte: es el mismo techo). El proveedor reporta `finish_reason='max_tokens'`
  cuando corta por techo — NO 'length'. Fix: (1) el gateway desestructura
  `max_tokens` del payload y lo pasa a `_executeLLM`; `chatOptions.max_tokens =
  Math.max(settings, payloadMaxTokens, 8192)` — el techo declarado del pipeline
  manda, el floor solo sube, nunca baja; (2) el motor trata `finish_reason ===
  'max_tokens'` como TRUNCADO (igual que 'length') → regenera en vez de certificar.
  Al diagnosticar un truncado en la bitácora: si `finish_reason=max_tokens` y
  `out` es un número redondo (8192/4096), sospechar que el gateway ignoró el techo
  del pipeline, no que el modelo "terminó antes". Regla: al tocar el pipeline del
  esquematizador, verificar que el techo llega al provider (smoke: `max_tokens`
  del payload → `_executeLLM`), no asumir que el floor respeta el contrato.
- **"El chat no responde" NO significa que no procesa**: al diagnosticar, el grep de
  `llm.complete` puede dar vacío mientras el sistema trabaja con otros eventos
  (`productor.validar`, `fs.read`, `fs.read.response` = tools del agente/LLM en acción).
  Mirar el log COMPLETO (tail del current.jsonl, eventos productor.*/fs.*), no solo el
  evento que esperas. En la sesión: el "Fase4" sí se procesaba (productor.validar a
  borbotones) mientras el grep de llm.complete no matcheaba.
- **Verificar el frontend build por strings literales, no identificadores**: los nombres
  de función se MINIFICAN (`rehidratarDesdeBitacora` no aparece en build/client — falso
  negativo); los strings del código SÍ (`"Entregable verificado"`, `ENTREGABLE_NO_VERIFICADO`).
  Al verificar que un deploy llevó cambios de frontend, grep por un mensaje/código literal.
- **Bitácora `started → final` sin tool_calls = "el LLM no trabajó" (la firma del humo de fondo)**:
  NO es que el agente sea manco — el fix "tools vacío → TODAS las tools" (comentario
  `LUZ (sombra corregida)`, ~línea 804 de ai-agent-framework/index.js) ya está en
  prod y repo. El LLM RECIBE las tools y aun así responde texto sin invocar ninguna
  (medido 3 veces con el esquematizador, con y sin identidad en el storage). Conclusión:
  no se confía en que el LLM "decida trabajar" — el motor nuevo es pipeline
  determinista precisamente por esto. Al diagnosticar un agente con `started→final`:
  (1) confirma que las tools llegan al LLM (fix LUZ presente), (2) el fallo es del
  trabajador, no del framework. La identidad en el storage ayuda (sin ella el LLM
  tampoco invoca tools) pero NO es suficiente.
- **Respaldo cuando el agente esquematizador falla**: aplicar el MÉTODO del
  esquematizador manualmente (prisma de 5 huecos + disección por formas — el que
  validó el cimiento) y escribir el esquema vía `ui/request/fs/write`. El método es
  reproducible por Hermes; el esquema resultante ES el diseño (ver
  `references/vision-motor-pipelines.md`).
- **`fs.write` por el BUS ya no funciona** (salió de GLOBAL_TOOLS — blindaje tras el
  incidente the-pirate): el módulo filesystem solo lo sirve como ui_handler
  `ui/request/fs/write` con `{ project_id, path, content }` (el core escribe con
  permisos www-data). Hermes NO puede mkdir/escribir en `/opt/enki/data/projects/` sin
  sudo — crear proyectos por `ui/request/project/create` (el core crea el dir).
- **Invocar agentes largos desde Hermes**: agentes como el esquematizador tardan
  >6 minutos. Usar `terminal(background=true, notify_on_complete=true)` y NUNCA pipear
  a `head`/`tail` (bufferiza stdout y oculta los logs del script); el timeout del
  listener debe superar la duración real del agente. El pipe silencioso + timeout
  corto produce falsos "no respondió" cuando el agente sí trabajó (verificar luego
  por bitácora, no por el stdout del script).
- **La verificación del JEFE ya se ve en el proyecto nuevo**: bitácora
  `storage/agentes/bitacoras/<request_id>.json` (estado fallida + veredicto con reglas)
  es la prueba de que el cimiento actuó — aunque el listener MQTT del script haya
  muerto por timeout.
- **Smoke del motor: el mini-bus debe (a) cablear los handlers y (b) reenviar a `*`**.
  En prod el loader del core cablea los `subscribes` del module.json; en los smokes
  hay que `bus.subscribe(evento, e => mod[handler](e))` manualmente o el `_pedir`
  (publish → subscribe al `*.response`) espera timeout. Y el publish del mini-bus
  debe iterar `listeners.get(topic)` Y `listeners.get('*')` — sin el reenvío a `*`,
  el capturador de eventos queda vacío y parece que el motor no responde (falso
  negativo: el flujo SÍ funciona — archivos escritos, bitácoras selladas).
- **Validador del motor: `tamano_min` mide el CONTENIDO, no la forma de la
  canónica** (lecciones 2026-08): el conversor envuelve el texto plano como
  `{content}` → medir `content.length`; un string plano → `length`; un objeto
  MULTI-ARCHIVO (F4 construir-modulos con `{index.js, module.json, slug}`, F7
  construir-interfaz) → **la SUMA de los valores string**, NO `Object.keys`.
  El bug real en vivo (proyecto "b", 2026-08): `construir-modulos` rechazaba
  salidas VÁLIDAS del LLM con `tamaño 3 < mínimo 200` — el LLM había generado
  4.964 tokens de código real en `index.js`, pero el validador medía
  `Object.keys(salida).length` = 3 (las 3 claves del JSON) y lo descartaba (3
  intentos, mismo error, pipeline fallida). El LLM respondía bien; el validador
  medía mal. Fix (2026-08): si el objeto tiene valores string → `tam = suma de
  sus longitudes`; solo si NO tiene strings → `Object.keys`. Regresión
  verificada: string plano ✅, `{content}` ✅, objeto sin strings (claves) ✅.
  Señal de diagnóstico: bitácora con `intento N no valida: tamaño 3 < mínimo
  200` en un pipeline multi-archivo con miles de tokens generados = el validador
  contó claves, no contenido — arreglar el validador, no el pipeline ni el LLM.
- **Resolver el slug del entregable ANTES del loop de pasos**: el paso reflejo
  `escribir` necesita el path resuelto (`<slug>` sustituido) — `entregableReal` se
  calcula al abrir la bitácora, no al final (o `escribir` usa el path con plantilla
  y escribe en la ruta equivocada).
- **Slug de la task: elegir el token no-stopword MÁS LARGO, no el primero** —
  'skill' (palabra común) ganaba a 'planes-y-tiers'. Stopwords ampliadas (skill,
  esquema, genera, plan, construye, escribe…) + candidato por longitud máxima.
  **Al añadir un pipeline nuevo, ampliar las stopwords con el vocabulario de su
  mandato**: 'interfaz' (8 chars) ganaba a slugs cortos reales ('smokef7', 7 chars)
  en `esquematizar-interfaz` — añadir al stop-list: interfaz, interfaces, operativa,
  frontend, panel, store, mqtt, uimodule, manifest, svelte, trío.
- **El nombre del ARCHIVO DE REFERENCIA de la task puede ganar al slug real**
  (proyecto "b", 2026-08): la task decía "hoja H-01 (config)… según el plan de
  construcción en /esquemas/plan-construccion.md" y `_resolverSlug` (token
  no-stopword más largo) eligió `plan-construccion` (16 chars) sobre `config`
  (6 chars) → el módulo se escribió como `modules/plan-construccion/index.js`.
  El nombre del archivo citado como REFERENCIA en la task es ruido para el slug.
  Fix HECHO (PR #165, verificado 2026-08): `_resolverSlug` prioriza el token
  entre paréntesis de la hoja (`H-01 (config)` → `config` — SEÑAL 1, gana
  SIEMPRE sobre la heurística de longitud), normaliza la task ñ→n + tildes
  (sin eso "construcción" se cortaba en "construcci" y escapaba la stop-list),
  amplía la stop-list (construccion, construcciones, plan-construccion, segun,
  esquematizar) y descarta IDs de hoja (`h-01`, `h-02`). La SEÑAL 2 (token
  más largo) queda como respaldo; si no hay candidato → pipelineName. Verificado
  8/8 con los 5 pipelines que usan `<slug>` (construir-modulos, construir-interfaz,
  decidir-interfaz, escribir-skills, esquematizar-interfaz); los 2 sin `<slug>`
  (esquematizador-negocio, planificar-construccion) no les afecta. Al diagnosticar
  "el módulo tiene el nombre del plan": mirar `_resolverSlug` y la task que se
  mandó — el token más largo no siempre es el módulo.
- **El paréntesis SUELTO de la task ganaba al nombre citado → el slug del
  entregable salía con un adjetivo, no con el nombre real** (proyecto "b",
  2026-08 — el fix del PR #165 era INCOMPLETO): la task era `Crear la skill
  "adaptar-a-enki" (Adaptador de Enki). … - Caso idea externa (polivalente): …`
  y `_resolverSlug` devolvió `polivalente` — la SEÑAL 1 (paréntesis) de la v1
  del fix matcheaba CUALQUIER paréntesis con token simple (`\(([a-z][a-z0-9-]{2,40})\)`),
  no solo el patrón de hoja `H-01 (config)`. Resultado: la skill del adaptador
  se creó en `cosecha/cantera/enki/polivalente/` (contenido correcto, frontmatter
  `name: adaptar-a-enki`, directorio mal). Reproducible: ejecutar
  `motor._resolverSlug(taskReal, 'escribir-skills')` con la task de la bitácora
  → `polivalente`. **Fix MERGEADO (PR #172, 2026-08): SEÑAL 0 NUEVA = el
  nombre ENTRE COMILLAS gana sobre todo**
  (`tn.match(/["']([a-z][a-z0-9-]{2,40})["']/)` — el chat cita el nombre exacto
  del módulo/skill: `"Crear la skill \"adaptar-a-enki\""` → `adaptar-a-enki`);
  y la SEÑAL 1 se ANCLA al ID de hoja (`/h-\d+\s*\(\s*([a-z][a-z0-9-]{2,40})\s*\)/`)
  — un paréntesis suelto ya NO puede ganar. Regla durable: **la señal más
  fiable del slug es el nombre citado (comillas), después el paréntesis SOLO
  si sigue a `h-NN`, y la heurística de longitud es el último recurso**. Al
  revisar un entregable con nombre de adjetivo/verbo (polivalente, operativa,
  universal): sospechar que el resolver tomó un paréntesis suelto; añadir la
  palabra a la stop-list Y reforzar el anclaje, no solo ampliar stopwords.
  Además: **borrar una skill creada por el chat con el dir mal** = `git rm
  --cached` + commit (el `rsync --delete` del deploy la limpia de prod) y
  `sudo rm -rf` del dir físico (es www-data, admin no tiene w) — ver pitfall
  de los untracked de www-data.
- **El slug con PREFIJO DE VERTICAL (`"newsletter/banco-ideas"`) no matcheaba
  el regex de comillas → el slug salía `name`** (proyecto "b", 2026-08, PR
  #175 — el eslabón que faltaba tras el #172): la task de la F4 citaba el
  slug del plano del adaptador con prefijo (`CONSTRUYE el módulo
  "newsletter/banco-ideas"… - Slug: newsletter/banco-ideas`) y el regex de
  comillas de la SEÑAL 0 (`["']([a-z][a-z0-9-]{2,40})["']`) NO acepta la
  barra `/` → no matcheaba → caía a las señales débiles → elegía `name`
  (palabra de la task: "usa name") → el motor escribió `modules/name/index.js`
  + `module.json` y los commiteó como "verificado" (bitácora 21:49, JEFE
  `api_real` OK pero en el path equivocado → el chat verificaba en
  `banco-ideas/` y no encontraba nada → ENTREGABLE_NO_VERIFICADO). Razón de
  fondo: un proyecto nuevo NO crea verticales — los módulos viven en
  `modules/<slug>/` plano (los verticales pizzepos/prisma son subsistemas
  EXISTENTES); el prefijo del plano del adaptador es agrupación del documento,
  no estructura real del sistema. Fix (PR #175): (1) SEÑAL 0 ampliada — el
  regex de comillas acepta `/` y `_` (`[a-z][a-z0-9/_-]{2,80}`) y devuelve el
  BASENAME (`split('/').pop()` → `banco-ideas`); (2) SEÑAL 0b NUEVA — el campo
  declarado `Slug: <nombre>` de las hojas del plano del adaptador
  (`/slug\s*[:=]\s*([a-z][a-z0-9/_-]{2,80})/`), tan fiable como las comillas,
  también con basename. Regla durable del slug (orden completo de señales):
  **nombre entre comillas (con barra → basename) > campo `Slug:` declarado >
  paréntesis SOLO si sigue a `h-NN` > token más largo (respaldo)**. Al
  diagnosticar un módulo escrito en un dir absurdo (`name/`, `modulo/`):
  leer la task de la bitácora — si el slug del plano lleva prefijo de
  vertical, el resolver debe quedarse el basename, no el prefijo ni una
  palabra suelta de la task. Y la basura del intento fallido (dir con el slug
  mal, commiteado "verificado" porque `existe` solo comprueba presencia):
  `git rm --cached -r modules/<dir-mal>/` + commit (el deploy con
  `rsync --delete` la limpia de prod) + `sudo rm -rf` del dir físico.
- **El timeout de `invoke_agent` en el gateway CORTABA a agentes vivos — ahora se
  deriva del presupuesto del pipeline** (PR #171, 2026-08, evidencia en vivo
  proyecto "b"): el pipeline `adaptar-a-enki` tardó 181s reales (generó 21.862
  tokens de salida, `finish_reason=end_turn`) y terminó con la bitácora sellada
  `verificada` — pero el chat reportó "timeout, no escribió nada" porque el
  gateway tenía `timeoutMs = toolName === 'invoke_agent' ? 150000` (fijo). El
  pipeline SIGUIÓ trabajando después del timeout del chat y verificó bien: la
  bitácora desmiente al chat. La señal clásica: el chat dice "dio timeout / no
  llegó a escribir" pero la bitácora del request_id dice `verificada` con el
  path absoluto escrito — comprobar SIEMPRE la bitácora antes de creer el
  timeout del chat. **Fix (PR #171): el timeout de `invoke_agent` se consulta el
  PRESUPUESTO real del pipeline en vivo** (`pipeline.obtener.request` por
  subscribe+publish manual — el gateway no tiene `_pedir`; timeout del propio
  timeout 8s) y se calcula `generacion_timeout_ms × generaciones_por_paso +
  30000` (margen para reflejo/JEFE/commit). Fallback 300s si el registro no
  responde ("mejor esperar de más que matar a un agente que trabaja").
  Resultado: adaptar-a-enki/construir-modulos 750s, construir-interfaz/
  esquematizador-negocio 930s (antes: 150s fijos que cortaban a TODOS los
  pipelines pesados). `code.orquestar` mantiene su 65s. Al diagnosticar un
  "timeout" de agente desde el chat: (1) mirar la bitácora del request_id —
  si está sellada verificada, el agente terminó y el timeout era del esperador,
  no del trabajador; (2) el timeout del gateway debe derivarse del presupuesto,
  nunca un fijo pensado para el agente más rápido.
- **El SMOKE de un pipeline con paso `commitar` REAL ensucia la rama**: el reflejo
  commitar hace `git add + commit + push` de verdad — cada ejecución del smoke crea
  un commit "motor: <slug> generado por pipeline <pipeline> (verificado)" en la rama
  actual. Limpiarlo con `git reset --hard <base>` tras el smoke, PERO:
- **`git reset --hard` revierte TAMBIÉN los cambios sin commitear en archivos
  tracked** (motor, verificador, orquestador): si editaste código y el smoke commitea
  después, el reset te deja sin tus ediciones. Orden seguro: (1) reaplicar código →
  (2) verificar → (3) COMMITEAR ANTES del smoke → (4) smoke (crea commits basura) →
  (5) limpiar solo los commits del smoke (`git reset --hard <tu-commit>`) → (6) push
  --force. Alternativa: mockear `_commitar` en el smoke (`modulo._commitar = async () =>
  ({commit:false})`) y verificar `en_repo` aparte.
- **Los commits del smoke rebaseados de vuelta**: si un commit basura ya está en el
  remoto y haces `git pull --rebase`, el rebase lo trae de vuelta debajo de tus
  commits. Limpiar con `git rebase --onto <base-sana> <commit-basura> <rama>` + push
  --force, o verificar el historial antes de push.
- **RAMA SIEMPRE tras un merge**: al terminar un merge (checkout main + pull),
  crear la rama `hermes/<nombre>` del siguiente bloque ANTES de editar y verificar
  `git branch --show-current`. Ocurrió CINCO veces (2026-08): el commit cayó en
  main directamente (violación del flujo hermes/* + PR) — dos veces por editar
  sin rama tras el merge, una por `git commit` desde main sin verificar la
  rama (el commit arrastró además el archivo untracked de www-data), una por
  commit + **PUSH** directos a main (fase 4, 2026-08), y una más por `git rm
  --cached` + commit (borrado de la skill polivalente, 2026-08) — un borrado
  también va en rama + PR, no directo a main. Recuperación SIN push
  hecho: `git reset --soft HEAD~1` (deshace el commit en main SIN tocar el
  working tree) → `git reset HEAD <archivo-www-data>` (saca del staging lo que
  no es tuyo) → `git checkout -b hermes/<nombre>` → commitear solo lo propio
  (re-`git add` de tus archivos). Recuperación CON push ya hecho a main: el
  push reversor `git push origin <sha-anterior>:main` es RECHAZADO (no
  fast-forward) → hay que forzar `git push --force origin <sha-anterior>:main`
  para revertir el remoto, luego `git checkout main && git reset --hard
  <sha-anterior>` en local, y rescatar el commit en la rama con `git cherry-pick
  <sha>`. OJO: el `git reset --hard` se aplica a la rama ACTUAL — verificar
  `git branch --show-current` ANTES, o el reset cae en la rama equivocada y
  main local sigue con el commit (el `git rev-parse main` vs `origin/main`
  desenmascara cuál quedó mal). Otra variante vista en vivo: `git checkout main`
  + `git pull` que dice "Updating X..Y" pero el HEAD NO avanza — el pull lo
  silencia; el error real (untracked de www-data bloqueando el merge) solo se ve
  con `git merge --ff-only origin/main`. Regla: ejecutar `git branch
  --show-current` ANTES de `git commit` Y ANTES de `git reset --hard` — ninguno
  de los dos verifica la rama.
- **Módulo o módulos: varios módulos pequeños por pieza, nunca un monolito** — la
  lección del árbol podrido (un framework de 50K parcheado hasta la podredumbre:
  cúpula + legacy + canónico + cimiento pegado). Reflejos puros en `_shared`,
  custodios en `modules/<mundo>/<dato>/` (único escritor por store), el ejecutor
  aparte. Pieza reemplazable sin tocar las demás — ese fue el criterio de Paco
  para el motor.
- **El LLM del chat puede meter su propio transcript como si fuera código** (lección
  generador-de-informe, 2026-08): el archivo escrito contenía `<tool_thinking>` XML y
  `<tool_calls>` en vez de código de módulo — pasó el `tamano_min` (965 chars) y el
  JEFE lo rechazó con razón. Fix: regla de validación `sin_transcript: true` en el
  validador del motor (rechaza `<tool_thinking>|<tool_calls>|</?invoke|<thinking>`).
  Al añadir un pipeline cuyo fuzzy debe devolver código, declarar `sin_transcript`
  en `valida` — el transcript de agente es la firma de "el LLM no trabajó".
- **El patrón de instrucción del pipeline debe enseñar el patrón REAL que el JEFE
  verifica** (lección construir-modulos, 2026-08): la instrucción decía
  `_atender(evento, contexto, respuesta, siguiente)` pero el patrón real del bus es
  `_atender(event, op, responseEvent, proyeccion)` (mira `modules/_shared/modulo-hibrido-reflejo.js`
  y módulos vivos como `pizzepos/recetas/index.js`). El LLM genera lo que se le
  enseña; si se le enseña una firma distinta de la que valida el JEFE/productor,
  fallará siempre. Al escribir la instrucción de un pipeline, copiar la firma EXACTA
  del patrón real, no una aproximación.
- **Bitácora dice \"escrito en X\" pero X NO existe en disco** (hallazgo proyecto \"f\"\n  2026-08): dos bitácoras de `esquematizador-negocio` con `verificado:true` decían\n  \"escrito en storage/esquemas/esquema.md\" y el archivo NO estaba en el storage del\n  proyecto (solo quedó el que el chat persistió aparte como esquema-obrador-pan.md).\n  La bitácora registra lo que el reflejo intentó; el disco es la realidad. Al\n  analizar un proyecto, LISTAR los archivos reales\n  (`find <proyecto>/storage -type f`) y cruzar con lo que las bitácoras afirman —\n  no fiarse de la palabra de la bitácora ni del veredicto. Posibles causas:\n  rsync --delete, escritura en otra raíz (resolver distinto), o el esquema escrito\n  por el pipeline y el del chat son archivos distintos.\n- **Un proyecto depurado a mano NO es referencia válida del proceso** (corrección de
  Paco, 2026-08): si las fases 4 y 5 se retocaron manualmente hasta que funcionaron,
  "funcionó" no demuestra que el flujo corre solo — demuestra que alguien lo arregló.
  NO sacar conclusiones de proyectos contaminados; la verificación real es un proyecto
  NUEVO limpio (crear con `project/create` + `conversation/create` + `conversation/send`
  con el guión, y ver si el proceso se encadena solo, sin intervención).
- **Antes de proponer un agente nuevo, verificar qué YA existe** (corrección de Paco,
  2026-08: "Es agente o skill. ya existe"): una fase puede estar implementada como skill
  de cantera (F0 identidad-negocio, F2 esquematizar-negocio), como pipeline del registro
  (F3/F4/F5), o como ambos + hook en el orquestador. El mapa del orquestador
  (`modules/proceso-negocio/index.js`: claves `negocio.*`) ES la fuente de verdad de qué
  está encadenado. Un `ls` a la cantera + al registro + grep del mapa responde antes de
  crear nada. La F0 además es CONVERSACIONAL (hace preguntas anti-sesgo al dueño): su
  "agente" es la skill en el chat, no un pipeline que escribe un archivo — no forzar el
  molde pipeline a fases cuyo entregable es una conversación.
- **UN proyecto puede tener DOS directorios físicos: `projects/<slug>/` y
  `projects/<uuid>/` — la causa raíz de "la bitácora dice escrito pero no está"**
  (confirmado en vivo, proyecto panadería/f 2026-08): el CHAT (fs scopeado) y
  `project-profile` escriben en `data/projects/<slug>/storage/` (base_path de la
  BD, por slug), mientras el MOTOR de agentes (`_resolver` con `projects/<project_id>`)
  escribe en `data/projects/<uuid>/storage/` con el UUID. Mismo proyecto, DOS stores
  que no se ven entre sí. Verificado: la F0 (identidad) quedó en
  `projects/panaderia-artesana/storage/prisma/pos/` y la F2 (esquema.md verificado
  por el JEFE) en `projects/<uuid>/storage/esquemas/`. project-manager lo documenta:
  "Hay DOS verdades de dónde vive el proyecto: base_path (BD, dir por slug, puede
  ser NULL o desfasado) y data/projects/<uuid> (fallback del filesystem cuando la
  activación no trae base_path)". Al diagnosticar "el agente escribió pero no veo el
  archivo": `find /opt/enki/data/projects/<slug> /opt/enki/data/projects/<uuid> -type f`
  y comparar; la bitácora imprime el path ABSOLUTO de escritura (fuente de verdad de
  dónde fue el reflejo). El puente slug↔UUID existe en whatsapp-bot
  (`pidPorSlug`/`slugPorPid` desde `project.activated` con `slug = basename(base_path)`).
  Receta de diagnóstico completa (find en ambas raíces, bitácora como fuente de
  verdad, evento de activación): `references/diagnostico-dual-store-slug-uuid.md`.
  **La cadena de IDs (qué project_id viaja):** el frontend llama `project.activate`
  y guarda `activeProjectId = realId` (el UUID real devuelto por el backend —
  `frontend/src/lib/stores/projects.ts:251`); `conversation.send` manda ese UUID;
  `prompt-builder` lo inyecta en el system prompt ("CONTEXTO ACTIVO:
  { project_id: <UUID> }" — `modules/conversacion/prompt-builder/index.js:269`);
  el LLM del chat lo usa al llamar `invoke_agent`. PERO el LLM puede improvisar el
  slug legible en vez del UUID (punto ABIERTO sin resolver en la sesión panadería
  2026-08: Paco afirma que los agentes persisten en slug "donde la cúpula de
  proyecto funciona", mientras el código y las bitácoras de "f" mostraban el UUID).
  Al diagnosticar: leer el path ABSOLUTO de escritura en la bitácora (dice la
  verdad de dónde fue el reflejo) y comparar con dónde el chat dice que busca.
- **`invoke_agent` tenía la lista de pipelines CLAVADA en `_registrarTools`**
  (hallazgo 2026-08; PR #170 FIXEADO y mergeado): `const pipelines =
  ['construir-modulos','escribir-skills','esquematizador-negocio','planificar-construccion']`
  — un pipeline nuevo (adaptar-a-enki, decidir-interfaz, esquematizar-interfaz,
  construir-interfaz) existía en el registro pero el CHAT NO podía invocarlo:
  el enum de `agent_name` del tool lo excluía. Síntoma clásico: el chat dice
  "adaptar-a-enki no existe" y lista SOLO 4 pipelines aunque el registro tenga
  8. **Fix (PR #170): `_registrarTools` es async y lee `pipeline.listar.request`
  EN VIVO** (como `buscar_agente`), con fallback a los 8 conocidos si el
  registro no responde (con warn). El llamador ya hacía `await` (línea ~67).
  Regla: al añadir un pipeline, verificar que `invoke_agent` lo exponga — no
  basta con que el registro lo liste; y al diagnosticar "el chat no ve el
  agente nuevo", mirar si la lista salió del registro en vivo o de un fallback/
  arranque viejo (ver lección del arranque del proceso arriba).
- **FIX del dual-store slug/UUID (PR #160, verificado 2026-08): el motor resuelve
  `storage/` contra el SLUG, no contra el UUID.** El problema (arriba) era que
  `_resolver` construía `data/projects/<project_id>/storage/` con el UUID que el
  LLM saca del "CONTEXTO ACTIVO", mientras chat/cúpula/project-profile escriben en
  `data/projects/<slug>/storage/` (base_path de la BD). El fix en
  `modules/conversacion/ai-agent-framework-v3/index.js` tiene 3 piezas: (1) cache
  `_basePathPorPid` (project_id → base_path) inicializado en el CONSTRUCTOR (no en
  onLoad — si solo vive en onLoad, cualquier uso sin onLoad deja el cache undefined
  y el resolver cae al UUID), poblado con `project.activated` (el evento que ya
  llevaba `{project_id, base_path}` — mismo puente que `pidPorSlug` de whatsapp-bot);
  (2) `_resolver` para `storage/`: `base = cache.get(project_id)` →
  `path.join(base, 'storage', rel)`, con fallback a `projects/<project_id>` si el
  cache no lo tiene (compat, arranque temprano); (3) `_resolverBasePath(project_id)`
  en vivo: si el cache no tiene el proyecto, `project.get.request` → `base_path` y
  lo cachea — llamado con `await` al inicio de `_ejecutarPipeline` ANTES de crear el
  mundo. Verificación: con `project.activated` el motor escribe en
  `projects/<slug>/storage/` y NO crea el dir UUID (smoke + 3 tests: resolver→slug,
  fallback UUID sin cache, _resolverBasePath consulta project-manager). Regla al
  tocar persistencia de agentes: el slug (base_path) es el store canónico del
  proyecto; el UUID es solo fallback de compat. Migración de datos ya bifurcados
 (esquema F2 en el dir UUID de "f"/panadería): copiar a mano al slug si se quiere
 conservar en la cúpula.
 - **La FASE 2 es un CICLO, no un pase único — y el esquematizador busca el foco
 SOLO** (articulación de Paco, PR #163 2026-08, aplicada a skill
 `esquematizar-negocio` + pipeline `esquematizador-negocio`): (1) MANDATO DEL
 FOCO — el agente identifica TÚ MISMO el eslabón limitante del flujo declarado
 (fermentación 24h, horno por hornada, amasado, espacio, ventana, mano de obra)
 y lo expande al máximo (buffer de frío, tandas, lotes mixtos, encadenado); el
 cuello de botella es el CORAZÓN del esquema, no una sección más, y NO espera a
 que el dueño lo señale. (2) LEY DE CERO SUPUESTOS — todo valor no declarado
 (capacidades, kilos, horas, precios, costes, consumos) es PREGUNTA ABIERTA,
 nunca estimación; "no se puede" se pregunta al dueño, no se afirma. (3) CICLO:
 pasada 1 → el CHAT hace las preguntas abiertas al dueño (el agente es turno
 sintético, no conversa — sus dudas salen como preguntas_abiertas del esquema)
 → INVESTIGACIÓN web EXIGIDA de los puntos investigables (horno, consumos, casos
 reales — "más vale que investigue algo a que no investigue nada") →
 replanteamiento → pasada 2 (re-ejecutar el pipeline con el contexto enriquecido).
 (4) El chat DELEGA las decisiones de negocio abiertas al esquematizador en vez
 de opinar (`decision_de_negocio_delega` en base.prompt.json) y MUESTRA el
 entregable real cuando se pide ("muéstramelo" = fs.read del storage + mostrar,
 no resumir — `muestrame_el_entregable`). Regla al tocar el proceso de proyecto:
 la F2 no termina al primer esquema si quedan preguntas abiertas relevantes.
 - **BACKUP en sitio fijo ANTES de modificar skills/agentes del proceso** (directiva
 de Paco, 2026-08): al tocar una skill/pipeline del proceso, copiar el estado
 actual a `/home/admin/hermes-backups/<fecha>-<tema>/` (skills/, pipelines/,
 esquemas/ del trabajo real + `main-sha.txt` + `MANIFIESTO.md` con comandos de
 restauración). El backup NO se toca — es el punto de retorno si los cambios no
 son factibles. Regla: documentar la ubicación al Paco (él exige saber dónde está
 y que no se deje solo en la conversación).
 - **Archivos untracked de www-data (skills creadas EN VIVO por el chat) BLOQUEAN
 el `git pull`/merge del repo local** (sesión 2026-08, proyecto "b"): el core
 (corre como www-data) crea skills en `modules/cosecha/cantera/enki/` del repo
 local (ej. `buscador-de-nichos`, `perfil-de-suscriptor`). Al hacer pull/merge de
 un PR que trae el MISMO archivo commiteado, git aborta con "The following
 untracked working tree files would be overwritten by merge". El `rm -rf` falla
 (Permission denied: el subdirectorio es www-data, admin no tiene w sobre él),
 pero el `mv` del directorio a otro nombre DENTRO del mismo padre SÍ funciona
 (el padre `enki/` es admin:www-data con w para admin). Secuencia: `mv <dir>
 <dir>-movido` → `git merge --ff-only origin/main` → `diff` del movido vs el
 merged (si idéntico, es la misma skill) → dejar el `-movido` anotado para
 `sudo rm -rf` del Paco. Ese trabajo del chat en vivo ES real: suele terminar
 commiteado en el siguiente PR (la skill `perfil-de-suscriptor` viajó en el
 PR #164). Además: si `git pull` dice "Updating X..Y" pero el HEAD NO avanza,
 el error real solo se ve con `git merge --ff-only origin/main` (el pull lo
 silencia) — comprobar `git status` y `git log FETCH_HEAD` antes de asumir.
 - **FASE 4: "el pipeline construyó pero nadie lo ve" — la cadena de 4 eslabones**
 (proyecto "b" radar-de-nichos, 2026-08): la bitácora de `construir-modulos`
 decía `verificado:true` con path `plan-construccion/index.js` y el chat
 afirmaba "no escribió nada en NINGUNA parte". El pipeline SÍ escribió en
 `/opt/enki/modules/` — los 4 eslabones que oscurecen una construcción real son
 independientes entre sí, y arreglar solo uno no salva la cadena:

 1. **Slug mal derivado** — el nombre del archivo de referencia de la task
    (`plan-construccion.md`) ganó al módulo real (`config`) por la heurística
    del token más largo (ver pitfall del slug arriba).
 2. **El commit falla por identidad git de www-data** — `git add` funciona (no
    necesita identidad) pero `git commit` aborta con `Author identity unknown
    (www-data@ubuntu.(none))`: ni el config local del repo ni el global de
    www-data (`/var/www/.gitconfig`, que solo tiene safe.directory) tienen
    `user.name`/`user.email`. Síntoma en la bitácora: paso `commitar_modulo`
    con `"commit":false,"error":"...Author identity unknown..."` → el módulo
    queda sin commiteear → el próximo deploy lo borra. Fix IMPLEMENTADO (PR
    #165, 2026-08): identidad EXPLÍCITA con `-c` en el propio comando del motor
    (`_commitar`): `git -C <repo> -c user.name="Enki Motor" -c
    user.email="motor@enki.local" commit ...` — no depende del config del repo.
    NO usar el config local del repo (`git config --local user.*`) para esto:
    pisa la identidad de admin y TODOS los commits del repo (los de Hermes)
    saldrían como "Enki Motor". El `-c` por comando es quirúrgico: solo los
    commits del motor llevan esa identidad. Verificado: commit de prueba con
    `-c` → autor `Enki Motor <motor@enki.local>` (revertido después con
    `git reset --hard` — cuidado: ese reset revierte también los patches sin
    commitear, reaplicar). Alternativa de 1 vez (si se prefiere el config):
    `sudo -u www-data git -C ~/3enki config user.name "Enki Motor"` +
    `user.email "motor@enki.local"` (el safe.directory ya está).
 3. **La regla `en_repo` del JEFE MIENTE** — usa `git ls-files -- <path>`, que
    lista el ÍNDICE (staging), no los commits. Como el `git add` del eslabón 2
    se ejecutó ANTES de que el commit fallara, el archivo queda en el índice →
    `ls-files` lo ve → `en_repo: ok:true` SIN commit real → el próximo deploy
    (`rsync --delete`) borrará el módulo. La regla creada para proteger del
    deploy no protege nada. Fix: verificar commits reales (`git log --oneline
    -- <path>` o `git rev-parse HEAD:<path>`), no staging.
 4. **El chat busca en el sitio equivocado** — su fs está scopeado al storage
    del proyecto (`fs_get_work_dir` = `data/projects/<slug>/storage`) y
    `modules/` del sistema le es invisible → "no escribió nada" es un falso
    negativo de VISIBILIDAD, no de existencia. El chat no miente: busca donde
    su mundo le deja mirar. El pipeline, en cambio, escribe en
    `/opt/enki/modules/` (vía `_resolver` no-storage).
    FIX IMPLEMENTADO (PR #165, 2026-08): el chat gana visibilidad SOLO-LECTURA
    de `modules/` con dos tools nuevas del módulo filesystem — `fs.list_modules`
    (lista los directorios de módulos del sistema con flags `tiene_module_json`/
    `tiene_index_js`) y `fs.read_module { module, file }` (lee un archivo de un
    módulo, default index.js). Ambas expuestas en `GLOBAL_TOOLS` del ai-gateway
    (junto a fs.read/list/search) y suscritas en el module.json del filesystem
    (`fs.list_modules.request` → `onListModulesRequest`, `fs.read_module.request`
    → `onReadModuleRequest`; `_busDispatch` enruta por `handle` + Capitalize(op),
    así `list_modules` → `handleListModules`). DEFENSA: son de solo lectura —
    `handleReadModule` hace anti-path-traversal (limpia `./`/`../` de module y
    file, rechaza `..`, y verifica `safePath.startsWith(modulesDir + sep)`) y
    aplica MAX_READ_SIZE; el chat NUNCA escribe en modules/ (el motor sigue
    siendo el único escritor). Con esto el chat puede verificar "el módulo
    `config` existe en modules/config/" con evidencia real tras invocar
    construir-modulos, en vez de afirmar "no escribió nada". Al añadir una tool
    de visibilidad del sistema al chat: SOLO lectura + anti-traversal + verificar
    el enrutado del bus (handler por Capitalize) y la exposición en GLOBAL_TOOLS.

 Diagnóstico de la cadena: la bitácora imprime el path ABSOLUTO de escritura
 ("escrito en /opt/enki/modules/plan-construccion/index.js") — es la fuente de
 verdad de dónde fue el reflejo. `find /opt/enki/modules -newermt '<ts>' -type f`
 confirma la escritura real. Regla: ante "el agente no construyó", buscar el
 entregable en TODAS las raíces (modules/ del sistema + storage del proyecto +
 repo) ANTES de concluir que no existe, y leer la bitácora del request_id
 (dice el path absoluto y el detalle del commit).
- **La FASE 3 se replanteó en DOS mitades: PLASMA + ADAPTADOR** (decisión de
  Paco, 2026-08 — REEMPLAZA el intento del PR #166 que se cerró SIN mergear):
  la fase 3 ANTIGUA mezclaba 2 tareas incompatibles — pensar el diseño Y
  traducirlo a Enki en el mismo acto — y el resultado se debilitaba (el plan de
  "b" proponía construir config/contracts/bus cuando el sistema YA tiene
  `_shared/base-module`, motor, eventBus, filesystem, project-profile,
  estados/rail, conversacion/ai-gateway…). El LLM piensa en los estándares de su
  ADN (OOP clásico); Enki rompe esos estándares → forzar la traducción en el
  mismo acto de pensar produce "falso Enki". La separación:
  - **FASE 3 · PLASMA** (PR #167, implementado): el LLM diseña en PSEUDOCÓDIGO
    OOP (clases, objetos, flujos, contratos — su lenguaje natural), SIN conocer
    Enki ni su inventario. REGLA DEL PLASMA en la instrucción: prohibido
    mencionar frameworks/tecnologías/módulos/infraestructura. Entregable:
    `storage/esquemas/diseno-oop.md`. El orquestador encadena F2→F3-plasma con
    gate `planificado` que verifica `diseno-oop.md`; `_progresoPlan` es tolerante
    si plan-construccion.md aún no existe.
  - **FASE 3b · ADAPTADOR X→Enki** (IMPLEMENTADO, PR #168 2026-08 — pipeline
    `adaptar-a-enki` en el registro + espejo): traduce el diseño al sistema
    real. POLIVALENTE: sirve para el diseño de la F3 Y para traer cualquier
    idea/sistema externo al sistema. **Lo que recibe y dónde (estipulado con
    Paco, simplificado al máximo):** (1) el diseño X como texto en la task del
    pipeline (el chat lee `diseno-oop.md` y lo mete en la task, o pega una idea
    externa suelta — \"una app tipo Substack para nichos B2B\"); (2) las
    REBANADAS de arquitectura relevantes, inyectadas por el motor a demanda;
    (3) el INVENTARIO de módulos, inyectado por el motor; (4) produce el PLANO
    DE ACOPLAMIENTO en `storage/esquemas/plan-construccion.md` (reutiliza ·
    construye · adapta — accionable por la FASE 4). La filosofía de Paco que lo
    gobierna: **el adaptador NO se carga el sistema entero — COGE LO QUE
    NECESITA EN CADA MOMENTO** (\"voy a hacer esto → cogo esto, esto, esto\").
    El sistema YA tenía las cúpulas de rebanadas (`arquitectura/cabecera/`:
    patron/, pizzepos/, prisma/, conversacion/, sistema-nervioso/…) y los
    verticales enteros como skill — faltaba el mecanismo de búsqueda (el
    precedente `REBANADA_PATH` de productor-modulos estaba declarado pero
    muerto).
    **Las 2 piezas nuevas del motor v3:**
    - `_buscarRebanadas(tema, max=6)` — escanea `arquitectura/cabecera/`
      recursivo, rankea cada rebanada .md por coincidencia de palabras del tema
      (normalizadas ñ→n + tildes) contra el frontmatter (id/dominio/resumen) +
      cuerpo (primeros 600 chars), devuelve SOLO las rutas relevantes — nunca
      el árbol entero.
    - `_inventarioModulos()` — 146 módulos reales: 1er nivel + verticales
      (`conversacion/ai-gateway`) + `_shared` explícito (no tiene module.json
      pero es la pieza MÁS reutilizable — el plan debe saber que la base existe).
    **Inyección a demanda en el pipeline** (mecanismo general, en el loop de
    pasos del ejecutor): el paso fuzzy declara qué contexto necesita y el motor
    lo resuelve e inyecta en la task ANTES de generar —
    `usa_rebanadas: true` (+ `rebanadas_base: [\"patron/modulo-real.md\",
    \"patron/modulo-hibrido.md\"]` — el ADN de patrón SIEMPRE, + búsqueda por
    tema) y/o `usa_inventario: true`. Cada rebanada se inyecta con slice(0,
    4000) chars. La bitácora registra \"rebanadas inyectadas (N: rutas)\" e
    \"inventario del sistema inyectado (N módulos)\". Mandato al fuzzy: \"usa
    SOLO el contexto inyectado; no inventes módulos ni patrones que no estén en
    las rebanadas o el inventario\". La instrucción del paso `generar_plano_acoplamiento`
    define el MÉTODO (lee X → extrae entidades → mapea contra inventario →
    REUTILIZA/ADAPTA/CONSTRUYE con FORMA y dominio de eventos según el patrón →
    orden y etapas) + REGLA DEL ADAPTADOR (no inventar módulos que existen, no
    inventar patrones, justificar cada construcción). Verificado: 34/34 tests
    (2 nuevos: rebanadas + inventario); inyección real base 2 + tema 3 = 4
    rebanadas + 146 módulos. **Regla al diseñar agentes que traducen a Enki:**
    buscar las rebanadas del tema en vivo (el ADN puede evolucionar) en vez de
    congelar el patrón en la instrucción; el `usa_rebanadas`/`usa_inventario`
    es el mecanismo general de \"contexto del sistema a demanda\" del motor.
  La filosofía de Paco (durable): **separar PENSAR de TRADUCIR**. El plasma
  piensa sin lastre (su ADN); el adaptador traduce con el inventario y los
  patrones Enki delante. Cada uno hace bien lo suyo; mezclarlos debilita el
  resultado. Al tocar la F3: NO inyectar el inventario al fuzzy del plasma
  (eso era el PR #166, descartado) — el inventario es del ADAPTADOR.\n  **LA TRADUCCIÓN DEBE SER EVENT-DRIVEN — el LLM traduce con su ADN estándar\n  (helpers + imports) y Enki es islas que se hablan por eventos** (lección\n  en vivo 2026-08, PR #177): el primer plano del adaptador puso la fórmula de\n  priorización del negocio en `_shared/prioridad.js` (helper compartido) y\n  `banco-ideas` la importaba con `require('../_shared/prioridad')` — 2\n  violaciones del ADN Enki: (1) módulos acoplados por require en vez de\n  eventos; (2) `_shared` contaminado con lógica de negocio (esa carpeta es\n  SOLO infraestructura del sistema: base-module, pos-persistencia, motor —\n  los módulos reales solo requieren infraestructura de ahí, verificado en\n  `estados`/`prisma/*`). El sistema SÍ es event-driven; lo que no lo era era\n  la TRADUCCIÓN. Fix (PR #177): la instrucción del pipeline `adaptar-a-enki`\n  ahora EXPLICA qué y cómo (5 secciones): (1) QUÉ ES UN MÓDULO ENKI (isla\n  event-driven, subscribes/publishes, require de _shared solo infra); (2)\n  CÓMO TRADUCIR CADA PIEZA OOP — clase con estado → CUSTODIO (single-writer,\n  proyecciones internas); clase que solo calcula (fórmula/scorer) → PROYECCIÓN\n  INTERNA del módulo que la consume o CONVERSOR (request/response sin estado);\n  clase que orquesta → ORQUESTADOR/MICRO-AGENTE (pide por eventos, emite\n  resultado); clase externa → PUENTE; dependencia entre clases → EVENTO\n  request/response (nunca import); (3) EJEMPLOS MAL→BIEN (helper de negocio\n  en _shared ❌ → proyección interna ✅; módulo 'helpers' compartido ❌;\n  require entre módulos ❌ → eventos ✅); (4) MÉTODO del plano con pares\n  request/response EXPLÍCITOS (quién pide, quién responde) y orden de\n  dependencias (si A escucha eventos de B, B se construye antes); (5) REGLA:\n  sin lógica de negocio en `_shared`, sin acople por require, slugs SIN\n  prefijo de vertical. Regla durable al diseñar el adaptador: **la lógica de\n  dominio va DENTRO del módulo que la usa (proyección/reflejo interno),\n  NUNCA como helper en `_shared`; si otro módulo necesita el cálculo, lo pide\n  por evento**. Al revisar un plano del adaptador: grep de `_shared/<nombre-de-negocio>`\n  y de `require('..` entre módulos — ambas son señales de traducción estándar,\n  no event-driven.
- **`ui/request/<domain>/<action>` NO es el bus — necesita `ui_handlers` declarados
  en el module.json** (hallazgo 2026-08): `enki-rpc.js rpc pipeline listar` dio
  `404 HANDLER_NOT_FOUND: No handler registered for pipeline.listar.request`
  aunque el módulo `agentes-registro` SÍ tiene el subscribe `pipeline.listar.request`
  y el handler `onPipelineListarRequest`. El puente UI (`core/ui/UIRequestHandler.js`)
  se registra desde `manifest.ui_handlers` (normalizeUIHandlers → wireUIHandlers en
  `core/modules/loader.js`), NO desde los `subscribes` del bus. El registro no
  declara `ui_handlers` → el puente no puede llamar `pipeline.listar`/`obtener`.
  **El motor interno NO usa el puente UI** — usa `_pedir` por el bus (subscribes),
  que sí está cableado → los pipelines funcionan aunque el RPC por ui/request falle.
  Regla: al diagnosticar HANDLER_NOT_FOUND en `ui/request/X/Y`, buscar `ui_handlers`
  en el module.json del módulo (no los subscribes); y para invocar el motor desde
  fuera, usar el envelope del bus (`core/<id>/events/...`), no el puente ui/request.
- **Mandar un mensaje al chat de Enki desde fuera: `conversation/send` con el
  campo `message`, NO `content`** (2026-08): el RPC directo
  `rpc conversation send {project_id, conversation_id, content}` falla con
  `SQLITE_CONSTRAINT: NOT NULL constraint failed: messages.content` — el campo
  que `handleSend` lee es `data?.message ?? data?.user_message` (chat-io/index.js
  línea ~310), no `content`. Y `conversation_id` es OBLIGATORIO (UUID válido) —
  sin él, `INVALID_INPUT: conversation_id is required and must be a UUID`. Para
  lanzar una fase del proceso desde Hermes: (1) `reach <proyecto> <conv>` para
  obtener `project_id` + `conversation_id` del JSON, (2) `rpc conversation send
  {project_id, conversation_id, message: "<orden>"}`. Esto permite arrancar el
  chat (p.ej. la FASE 4 "una hoja a la vez") sin que Paco teclee nada. La orden
  debe incluir el mandato mecánico explícito (una hoja, verificar en disco, parar
  y reportar el error exacto) — el chat tiende a pasarse de ambicioso si no.
- **El chat responde con el código del ARRANQUE del proceso, no con el disco**
  (lección 2026-08, ver sección "Verificar que un deploy llevó los cambios"): un
  deploy puede estar hecho (archivos en /opt/enki/) y el chat seguir viendo el
  sistema viejo porque el motor corre con la memoria del arranque. Antes de
  concluir "el agente no existe en prod", verificar `ps -o lstart` del proceso
  vs el timestamp de la consulta — si el proceso arrancó después, reintentar.
- **FASE 4: la SKILL `construir-modulos` NO existía en la cantera** (hallazgo
  2026-08, PR #169): el orquestador (`proceso-negocio`) empuja `skill:
  'construir-modulos'` al chat tras `negocio.planificado` — pero la cantera no
  tenía esa skill (las demás fases sí: esquematizar-negocio, decidir-interfaz,
  esquematizar-interfaz, construir-interfaz). El chat no tenía guía de fase 4.
  Al verificar la completitud de una fase del proceso: cruzar el MAPA del
  orquestador (`grep "skill: '" modules/proceso-negocio/index.js`) contra `ls
  modules/cosecha/cantera/enki/` — toda skill referenciada debe existir. La
  skill F4 creada consume el plano del ADAPTADOR (reutiliza·construye·adapta):
  REUTILIZA → verifica y salta (NO construye lo que ya existe), ADAPTA → ajusta,
  CONSTRUYE → `invoke_agent('construir-modulos', {task})`; MANDATO MECÁNICO:
  UNA hoja a la vez en orden de etapas, verificar en disco (fs.list_modules/
  fs.read_module — no creer al reporte), cierre por pieza
  (`completar_fase {fase:'construido'}` → F5/F6 por módulo → vuelve) y al final
  `completado`. Lecciones embebidas: no construir hojas REUTILIZA, no creer
  reportes, el patrón real vive en la rebanada `patron/modulo-real.md`.
- **El pipeline F4 `construir-modulos` pasó a MULTI-ARCHIVO (PR #169)**: antes
  generaba SOLO `index.js` (el module.json se improvisaba en el chat) — ahora
  el fuzzy devuelve `{index.js, module.json, slug}` y el entregable declara
  `dir: "<slug>"` + `archivos: ["index.js", "module.json"]` (el patrón
  `dir`+`archivos` de la F7, que resuelve `<slug>` en ambos paths). Regla: el
  multi-archivo YA NO es exclusivo de la FASE 7 — cualquier fase cuyo módulo
  sea un par inseparable (index.js + module.json) lo usa con la misma
  justificación (el artefacto ES múltiple). La instrucción del fuzzy ahora
  pide el par completo con subscribes/publishes del dominio (NO inventar
  eventos del sistema).
- **El reflejo `escribir` multi-archivo NO entendía el formato DIRECTO del F4 →
  escribía el "JSON contenedor" entero en index.js sin module.json** (proyecto
  "b", 2026-08, PR #173): el pipeline F4 `construir-modulos` pide al LLM
  `{ index.js: '...', module.json: '...', slug: '...' }` (objeto DIRECTO —
  formato B), pero el reflejo solo entraba en la rama multi-archivo si
  `salidaUltima.archivos` era objeto (formato A de la F7:
  `{ archivos: { rel: contenido } }`). Con formato B, `salidaUltima.archivos`
  es undefined → caía al else → serializaba el JSON contenedor ENTERO dentro
  de `index.js` (el chat lo reportó en vivo: "index.js como JSON contenedor")
  y NUNCA escribía `module.json` (el commit fallaba: "entregable no existe en
  prod"). Síntoma en la bitácora: `escrito en modules/<slug>/index.js` +
  commit de module.json con `"commit":false` "no existe en prod". Fix (PR
  #173, 34/34 tests): normalizar ANTES del bucle — si `salida.archivos` es
  objeto → formato A; si no, y los basenames de `entregableReal.paths`
  (`index.js`, `module.json`) están entre las claves de la salida → formato B
  (usar la salida directa como mapa de archivos); lookup por `archivosMap[rel]`
  → sin prefijo `frontend/` → sin prefijo `storage/` → por basename. Regla al
  cambiar el formato de salida de un pipeline multi-archivo: alinear
  INSTRUCCIÓN ↔ REFLEJO (el reflejo debe aceptar el formato que la instrucción
  pide, o aceptar ambos), y probar el smoke con el formato EXACTO que devuelve
  el LLM (el de la bitácora), no con el que el reflejo esperaba.
- **`api_real` es regla de CÓDIGO — aplicarla a un `module.json` (o .ts/.svelte)
  falla SIEMPRE y bloquea el par completo con código válido** (proyecto "b",
  2026-08, PR #176 — el eslabón final de la cadena F4): el JEFE aplica TODAS
  las reglas del entregable a CADA path del multi-archivo. `construir-modulos`
  declara `reglas: ["existe", "api_real", "en_repo"]` sobre
  `{index.js, module.json}` → `api_real` (que lee el contenido y busca `require
  _shared` + `_atender 4 args`) se ejecutaba también sobre el module.json (JSON
  puro) → "patrón de módulo no completo (usa _shared: false)" → el veredicto
  salía `ENTREGABLE_NO_VERIFICADO` con el módulo PERFECTO escrito y commiteado
  en disco (bitácora 23:07: index.js ✅ api_real, module.json ❌ api_real). El
  chat (correctamente) reportaba el fallo y paraba; el sistema mentía sobre
  trabajo bien hecho. Fix (PR #176, 34/34 tests): `_apiReal` comprueba primero
  `/\.(js|mjs|cjs)$/i.test(rel)` — si el path NO es código JS, devuelve
  `ok: true` con detalle "api_real es regla de código — no aplica a X (su
  presencia la cubre 'existe')". Regresión: un .js sin patrón SIGUE fallando.
  Regla durable: las reglas del JEFE que inspeccionan CONTENIDO (api_real,
  interfaz_decidida, interfaz_operativa) son específicas por TIPO de archivo —
  al declarar reglas en un multi-archivo, o la regla se auto-limita por
  extensión (como hace api_real) o el pipeline debe declarar reglas por path.
  Al diagnosticar "escribió y commiteó pero el JEFE lo rechaza": leer el
  veredicto completo de la bitácora — qué regla falló en QUÉ path; si el
  detalle es "usa _shared: false" sobre un .json, es la regla mal aplicada,
  no el código.
- **El regex de `_atender` del JEFE rechazaba el patrón REAL de Enki — `api_real` daba "_atender 4 args: false" con código VÁLIDO en disco** (proyecto "b", 2026-08, PR #181 — el eslabón final tras el #176): el regex antiguo era `/_atender\s*\(\s*\w+\s*,\s*\w+\s*,\s*\w+\s*,\s*\w+\s*\)/` — solo aceptaba IDENTIFICADORES simples entre comas. Pero el patrón REAL de los módulos vivos (estados, pizzepos) es `this._atender(e, 'crear', 'estados.crear.response', d => this._crear(d))` — el 2º argumento es un STRING (`'crear'` → `\w+` no matchea las comillas) y el 4º una ARROW FUNCTION (`d => ...` → `\w+` no matchea). Resultado: el JEFE habría rechazado CUALQUIER módulo real de Enki; el LLM de la F4 copió BIEN el patrón de la rebanada y el validador lo bloqueaba (bitácora `ENTREGABLE_NO_VERIFICADO` con el par completo escrito y commiteado). Fix (PR #181, 53/53 tests): regex que solo exige 4 argumentos con contenido razonable: `/_atender\s*\(\s*[^,()]+\s*,\s*[^,()]+\s*,\s*[^,()]+\s*,\s*[^)]+\)/`. Regresión verificada: JS sin patrón sigue fallando. Regla durable: **los regex del JEFE deben escribirse contra el patrón del CÓDIGO VIVO (strings, arrow functions), no contra la firma teórica de la doc** — antes de endurecer una regla de contenido, grep del patrón real en `estados`, `pizzepos/*`, `prisma/*`; y al ver "usa _shared: true, _atender 4 args: false" con el código en disco, sospechar el regex (el LLM copia el patrón real; el validador es el que se quedó en la teoría).
- **El main de Enki evoluciona con trabajo de OTRO agente (Claude) — revisar `git log` del repo local antes de tocar el motor** (2026-08): una sesión detectó que main había avanzado 12 commits sin intervención de Hermes — autores `Claude <noreply@anthropic.com>` (rama `claude/*`) y `Enki Motor` (el propio motor commiteando módulos). Los commits de Claude REFORZABAN el mismo territorio (verificador.js, adaptar-a-enki.json, proceso-negocio): (1) **`requires_resueltos`** — el JEFE comprueba que cada `require` relativo de un .js apunta a un destino que EXISTE en el mundo (pilla el bug de `_shared/prioridad.js` que no existía); (2) **`plan_acoplable`** — el plano debe tener la espina (hojas con slug/forma/eventos) verificable de forma determinista; (3) **`op: 'leer_plan'`** en construir-modulos — el reflejo LEE el plano y lo inyecta al fuzzy (antes era no-op: el generador nunca veía el contrato de la hoja — causa de fondo de módulos sin eventos correctos). Compatibles con el trabajo de Hermes (el #181 convive: 53/53 tests). Regla: si el repo local muestra commits que no hiciste, NO asumir conflicto — `git log --oneline main..` y `git show --stat <sha>` para ver qué cambió; los fixes de otro agente en el mismo archivo suelen ser capas complementarias (ellos verifican el mundo, tú arreglas lo que el JEFE reconoce). El motor commitea con identidad `Enki Motor` (ver pitfall de identidad git) — su trabajo en vivo aparece como commits propios en main.
- **"El contexto de ENTRADA se pierde en los reintentos" era un FALSO POSITIVO —
  el `in` bajo de los intentos 2/3 es CACHE DEL PROVIDER, no pérdida de task**
  (proyecto "b", 2026-08, INVESTIGADO y DESCARTADO como bug): bitácora de
  `construir-modulos` con `intento 1: in 1788 / out 4964` pero `intento 2: in
  124 / out 10160` e `intento 3: in 124 / out 5989`. La hipótesis inicial era
  que el reintento reenviaba solo el system prompt (124 ≈ system sin task).
  Verificación que la descarta: (1) el gateway propaga `messages` INTACTOS —
  `_executeLLM` hace `workingMessages = [{role:'system'}, ...messages]` (el
  payload del motor lleva la task efectiva completa en cada intento); (2) el
  motor llama `_generar(paso, taskEfectiva, pipeline)` con la MISMA task en
  cada intento; (3) los providers tipo Anthropic/DeepSeek reportan
  `cache_read_input_tokens` POR SEPARADO (anthropic-provider.js:392-400) — el
  prompt idéntico del intento 1 se lee de cache y `input_tokens` solo cuenta
  lo no-cacheado (~124) → el LLM SÍ recibe la task completa. El fallo real de
  esa ejecución era el VALIDADOR midiendo `Object.keys` (ver pitfall de
  tamano_min multi-archivo), no el contexto. Regla durable: ante un `in` bajo
  en reintentos, NO asumir pérdida de contexto — verificar primero que el
  gateway propaga `messages` intactos y si el provider reporta
  `cache_read_input_tokens`; un `in` bajo con el MISMO prompt es cache, no bug.
- **El chat verifica en disco ANTES de que el pipeline termine de escribir —
  reporta "no escribió nada" con la bitácora YA `verificada`** (proyecto "b",
  2026-08, visto 2 veces: adaptador 20:08-20:11 y regeneración del plano
  06:13-06:14): el pipeline `adaptar-a-enki` tardó ~3-6 min (genera 20-30K
  tokens; con reintento por TRUNCADO puede duplicarse). El chat invoca
  `invoke_agent`, espera su timeout, verifica en disco y reporta "timeout, no
  escribió nada" — **pero el pipeline SIGUE trabajando y termina escribiendo y
  verificando después**. Medido con timestamps: el chat verificó a las
  06:13:57 y el reflejo escribió a las 06:14:54 — **57 segundos de diferencia**.
  El chat no miente: su verificación fue PREMATURA (el archivo aún no existía
  en ese instante). La bitácora del request_id (sellada `verificada` con el
  path absoluto y el timestamp del `final`) es la fuente de verdad, y el
  timestamp del archivo en disco (`stat -c %y`) desmiente o confirma.
  Diagnóstico: (1) leer la bitácora del request_id — si está `verificada` con
  `final` posterior al mensaje del chat, el agente terminó y el chat fue
  prematuro; (2) `stat -c %y` del entregable vs timestamp del mensaje; (3)
  NO reintentar el pipeline ni tocar nada si la bitácora está verificada —
  solo decirle al chat que RE-VERIFIQUE. Regla durable: al ver un reporte del
  chat de "el pipeline no materializó", comprobar SIEMPRE la bitácora y el
  timestamp del archivo ANTES de concluir — el timeout del esperador no
  mata al trabajador.
- **El chat NO cumple solo el mandato "UNA hoja a la vez" de la skill F4**
  (proyecto "b", 2026-08): el chat invocó `construir-modulos` con una task
  "CONSTRUIR **LOS** MÓDULOS DE LA FASE 4… sigue las 7 fases del plan" — TODO
  el plan de golpe, violando el mandato mecánico de la skill (una hoja por
  invocación, en orden de etapas). El pipeline no rechaza esa task (genera el
  código que le piden) → el fallo posterior se suma al del validador. Regla al
  diagnosticar un fallo de F4 con task gigante: verificar QUÉ se le pasó al
  pipeline (la task de la bitácora) — si el chat pasó el plan entero, el
  problema es la invocación, no el pipeline. La skill F4 manda UNA hoja; el
  orquestador debe empujar hoja a hoja o la skill debe ser más explícita.
