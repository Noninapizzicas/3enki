# Motor de Agentes (ai-agent-framework-v3) — el árbol nuevo

> La visión (decidida en sesión 2026-08-06 tras cortar el framework viejo):
> **un agente en Enki = un PIPELINE casi todo determinista con un punto fuzzy
> acotado y verificado.** El LLM NUNCA ejecuta ni decide el flujo: solo GENERA
> en los pasos fuzzy declarados; cada salida fuzzy se valida antes de continuar;
> el JEFE verifica el entregable contra el mundo real antes del success.
> Esquema completo: `arquitectura/esquema-motor-agentes/` en el repo.

## Las 10 piezas (del esquema — 9 deterministas, 1 fuzzy)

| Pieza | Forma | Módulo / lib |
|---|---|---|
| P1 Ejecutor | REFLEJO | `modules/conversacion/ai-agent-framework-v3/` |
| P2 Registro | CUSTODIO | `modules/agentes/registro/` |
| P3 Validador | REFLEJO | `modules/_shared/motor/validador.js` |
| P4 JEFE (verificador) | REFLEJO | `modules/_shared/motor/verificador.js` |
| P5 Puerto LLM (fuzzy) | MICRO-AGENTE | contrato `llm.complete.request` → gateway |
| P6 Bitácora | CUSTODIO | `modules/agentes/bitacora/` |
| P7 Rail | CUSTODIO | reutilizar `estados.*` (no duplicar) |
| P8 Vitrina | PUENTE | los `agent.execute.progress` ya alimentan el marco |
| P9 Reanudador | REFLEJO | `onAgentExecuteResumeRequest` (vive en el ejecutor) |
| P10 Conversor | CONVERSOR | `modules/_shared/motor/conversor.js` |

## Eventos del motor (request → response con request_id)

```
pipeline.declarar.request  { request_id, pipeline }  → pipeline.declarado | pipeline.declarar.failed
pipeline.obtener.request   { request_id, nombre }    → pipeline.obtener.response | pipeline.obtener.failed
pipeline.listar.request    { request_id }            → pipeline.listar.response
bitacora.abrir.request     { request_id, project_id, agent_name, task } → bitacora.abierta
bitacora.paso.request      { request_id, project_id, paso, message?, tool_invoked? } → bitacora.paso.registrado
bitacora.sellar.request    { request_id, project_id, veredicto, duracion_ms } → bitacora.sellada
bitacora.leer.request      { request_id, project_id } → bitacora.leer.response
agent.execute.request      → agent.execute.progress (por paso) → agent.execute.response | agent.execute.failed
invoke_agent.request       → ALIAS del mismo pipeline (el chat no cambia; responde invoke_agent.response)
```

## Formato de pipeline (el contrato del registro)

```json
{
  "name": "construir-modulos",
  "pasos": [
    { "paso": "leer_plan_y_rail", "tipo": "reflejo" },
    { "paso": "generar_codigo", "tipo": "fuzzy",
      "instruccion": "…qué genera el LLM…",
      "valida": { "tamano_min": 200, "campos": ["name"] } },
    { "paso": "escribir_modulo", "tipo": "reflejo", "op": "escribir" }
  ],
  "entregable": { "tipo": "fs", "path": "<slug>/index.js", "reglas": ["existe", "api_real", "en_repo"] },
  "presupuesto": { "generaciones_por_paso": 3, "max_tokens": 64000 }
}
```

- `<slug>` se resuelve de la task: el token no-stopword MÁS LARGO (stopwords
  ampliadas: verbos de proceso, skill, plan, etc.) — no el primero.
- `op: "escribir"` (reflejo) escribe la salida fuzzy en el entregable resuelto
  (`{content}` → texto plano; objeto → JSON pretty).
- Los pipelines de proceso viven en `arquitectura/esquema-motor-agentes/pipelines/`
  y se declaran en el registro con `node scripts/seed-pipelines.js` (vía el
  custodio — nunca escribiendo el store del registro a mano).

## El flujo de una ejecución

```
agent.execute.request → registro obtiene el pipeline (P2) → bitácora abrir (P6)
  → por cada paso: reflejo → determinista (op) o no-op registrado
                   fuzzy → llm.complete.request → conversor (P10) → validador (P3)
                           → reintento QUIRÚRGICO del mismo paso (presupuesto.generaciones_por_paso)
  → JEFE (P4) verifica el entregable contra el MUNDO REAL (mundo inyectable)
  → verificado → agent.execute.response { verificado:true } + bitácora 'verificada'
  → NO verificado → agent.execute.failed ENTREGABLE_NO_VERIFICADO + bitácora 'fallida'
  → fuzzy agotado → PASO_FUZZY_NO_VALIDADO honesto
```

## Verificar que el motor está vivo en prod

Vía LOG (rápida): el client MQTT anónimo no puede suscribirse (bus-guard):

```bash
grep "pipeline.obtener.request" /opt/enki/data/logs/current.jsonl | tail
# → receive:pipeline.obtener.request ... y la línea siguiente
#   publish:pipeline.obtener.response con outcome:success  = el registro respondió
```

Vía INTERACTIVA (recibir la respuesta real): patrón de 2 clients — anónimo
PUBLICA el request, client observe (`enki:cert:<b64 de /opt/enki/data/ca/ca-cert.pem>`,
username `enki`) SUSCRIBE a `core/#` (¡el topic de las respuestas es
`core/*/events/<evento>` con `*` LITERAL!) y filtra por request_id. Ejemplo
verificado en vivo (2026-08-06): `pipeline.obtener.request` → respuesta con el
pipeline completo (3 pasos, entregable, reglas). Script genérico:
`scripts/verificar-modulo-enki.js` de la skill enki-bus-invocacion.

Los archivos del motor se verifican repo↔prod con diff (9 archivos clave:
`_shared/motor/*`, `agentes/registro/*`, `agentes/bitacora/*`,
`ai-agent-framework-v3/*`).

**PITFALL de diagnóstico de logs:** los greps con comillas escapadas dentro de
`bash -c` (p.ej. `grep -oE "\\"msg\\":..."`) fallan SILENCIOSAMENTE y dan
"(vacío)" aunque las líneas existan. Vía fiable: greps directos del timestamp
(`grep "T00:07" archivo`) o `grep -c "texto"`. El log `current.jsonl` se rota
en cada deploy (el ts de la primera línea = el arranque) — las franjas
anteriores al deploy viven en `logs/2026-08-06.jsonl`.

## Estado (2026-08-06)

- En main (`#144` + commit de pipelines/seed). Desplegado y VIVO en prod.
- Tests: `_shared/motor/test.js` (19/19) · smokes de custodios y ejecutor
  (registro+bitácora reales en /tmp + gateway mock + mundo inyectado).
- **PRUEBA CON LLM REAL HECHA (sandbox, sin tocar prod):** el pipeline
  `construir-modulos` ejecutó con deepseek-v4-flash real (API key de
  `/opt/enki/data/.env` → `DEEPSEEK_API_KEY_GLOBAL`, endpoint
  `https://api.deepseek.com/anthropic/v1/messages`, headers x-api-key +
  anthropic-version 2023-06-01). Generó el código (53.9s/5601 tokens) →
  conversor → validador → reflejo escribió el módulo → JEFE verificado:true
  (`existe` + `api_real` + `en_repo` no bloquea). Script: `/tmp/motor-real.js`.
- PITFALL de la API deepseek-anthropic: `content` es un array de bloques
  `[thinking, text]` — el texto real está en el bloque `type:'text'`.
  Leer `content[0].text` devuelve VACÍO (el bloque thinking no tiene `.text`).
  El gateway real del core ya lo maneja; los smokes con gateway propio deben
  filtrar `b.type === 'text'`.
- **FASE DE CORTE HECHA (#145, 2026-08-06):** el framework viejo ya NO
  ejecuta los agentes con pipeline en el registro — `_agenteDelMotor(agent_name)`
  (fs.existsSync de `agentes/registro/store/<nombre>.json`, síncrono; si no
  puede leer → ejecuta, seguro) en `onAgentExecuteRequest` y `onInvokeAgent`
  (el resume pasa por el canónico). Loguea `ai-agent-framework.delegado.motor.v3`
  y no responde — el v3 responde al mismo request_id. Los agentes legacy sin
  pipeline seguían con el viejo (hasta la PODA #147, que los borró con él).
  Los pipelines se COMMITEAN en el store
  (`agentes/registro/store/*.json` — #146): el deploy usa rsync --delete y un
  clon limpio sin el store borraría los pipelines de prod.
- Pendiente: rail (reutilizar estados.*), verificación en vivo del corte tras
  deploy (el log debe mostrar `delegado.motor.v3` y el veredicto del JEFE en
  la bitácora del v3).
- **PODA COMPLETADA (#147, mergeada y DESPLEGADA):** `modules/conversacion/ai-agent-framework/`
  borrado entero (−127.640 líneas; el `rsync --delete` del deploy lo eliminó de
  prod — el viejo NO existe en repo ni prod). El v3 es el ÚNICO framework:
  registra las tools de catálogo `invoke_agent` + `buscar_agente` (catálogo =
  `pipeline.listar` del registro, en vivo — `onBuscarAgente` consulta y filtra
  por query) en `moduleLoader.toolsRegistry` (onLoad guarda `context.moduleLoader`;
  el subscribe de `buscar_agente.request` va en el module.json del v3).
  `activar/desactivar/crear_agente/crear_agente_desde_caso` se DESCARTAN
  (visión vieja: crear sin verificación; en el motor, crear un agente =
  declarar un pipeline con contrato, lo hace el proceso de proyecto).
  **Verificación en vivo de la cúpula en prod:** `buscar_agente.request` por
  el bus (patrón 2-client) → response con el catálogo real del registro
  (`activo:true`, 0 resultados sin humo) = v3 cargado + suscrito + sirviendo.
- **Antes de borrar un módulo: verificar dependencias con grep** — los
  "imports" de conversation-export/admin-panel/chat-io eran SOLO comentarios;
  lo que de verdad se pierde: las tools registradas en `toolsRegistry` (6:
  invoke_agent, buscar_agente, activar, desactivar, crear, crear_desde_caso) y
  los manifests de la biblioteca. Un `grep -rn "nombre-módulo" modules/` distingue
  imports reales de menciones en comentarios/descriptions.
- **PITFALL ESTRUCTURAL: el motor escribe en prod, el deploy sincroniza DESDE el repo**
  (`rsync --delete` de `~/3enki` → `/opt/enki`). Son DOS árboles con sync de UNA
  sola dirección: lo que el motor genera en `/opt/enki/modules/<slug>` NUNCA
  vuelve al repo → el próximo deploy lo BORRA (hojas 17, 16, 19: construidas,
  verificadas por el JEFE y perdidas). El `--delete` borra de prod lo que no
  está en el ORIGEN (el repo). **La solución: el reflejo `commitar`.**
- **REFLEJO COMMITAR (#150, 2026-08-07): el motor refleja su producción en el repo.**
  `_commitar(relPath, pipelineName, project_id)` (en el v3): si el path NO
  empieza con `storage/` → copia el entregable de `/opt/enki/...` al repo
  `~/3enki/...`, `git -C <repoDir> add -- <rel>` + `commit -m "motor: <slug>
  generado por pipeline <pipeline> (verificado)"` + `push origin HEAD`
  (best-effort: si el push falla, el commit LOCAL ya protege del rsync — el
  archivo está en el origen → el `--delete` no lo borra). `storage/` → SKIP
  (data/ excluida del rsync — sobrevive sin commit). Pipelines
  `construir-modulos` y `escribir-skills`: paso reflejo `{ paso: "commitar_*",
  tipo: "reflejo", op: "commitar" }` después de `escribir`. El store del
  registro se regenera con `node scripts/seed-pipelines.js`.
  **Requisito de permisos (una vez, sudo):** el core corre como www-data y
  `~/3enki` es de admin — para que el git funcione:
  `sudo chown -R admin:www-data ~/3enki && sudo chmod -R g+w ~/3enki &&
  sudo -u www-data git -C ~/3enki config user.name "motor-enki" && ... user.email`.
  El token del push ya vive en `~/3enki/.git/config` (remote con token embebido) —
  legible por www-data tras el chown.
- **FIX #148 (2026-08-07): el contrato del chat es `invoke_agent` SIN `.request`**
  — el chat (chat-io) publica el evento con el NOMBRE DE LA TOOL. El v3 se
  suscribía solo a `invoke_agent.request` → el request del chat se publicó y
  NADIE lo escuchó (silencio del bus) → el chat narró "el agente falló". El v3
  ahora escucha AMBOS (`invoke_agent` + `invoke_agent.request`) → mismo handler
  `onInvokeAgentRequest`. Diagnóstico en vivo: el log mostró\n  `event_flow:publish:invoke_agent` a las 00:05:09 SIN `receive:` — publish sin\n  receive = suscripción con nombre equivocado, NO fallo del agente. (Detalle\n  completo del diagnóstico en el SKILL.md, sección 3.)\n- **FIX #149 (2026-08-07): `_pedir` escucha el par `*.failed` del bus.**\n  Verificado en vivo: el v3 pidió `pipeline.obtener` al registro, el registro\n  respondió `pipeline.obtener.failed` (pipeline inexistente), pero el `_pedir`\n  solo escuchaba el `.response` → el error real nunca llegaba → TIMEOUT genérico\n  (10s) en vez de \"pipeline no encontrado\". Ahora `_pedir` se suscribe al\n  `.response` Y al `.failed` derivado\n  (`eventoResponse.replace(/\\.response$/, '.failed')`), filtra por request_id\n  y rechaza con `data.error.message`/`code` del custodio. Aplica a todas las\n  integraciones del v3 (pipeline.*, bitacora.*).\n  **Cobertura de errores del flujo del chat completa:** #148 (el evento\n  llega) + #149 (el error llega) = \"Fase 4\" → invoke_agent → v3 → registro →\n  pipeline → veredicto, y los fallos llegan al chat con el error exacto.
- **PITFALL `en_repo` en PROD (lección de las hojas 17/16/19):** el pipeline
  `construir-modulos` declara `reglas: [existe, api_real, en_repo]` — en prod el
  JEFE comprueba `git ls-files` contra `/home/admin/3enki` y un módulo recién
  generado NO está en git → `en_repo` falla → veredicto NO verificado (failed
  honesto). Correcto por diseño — y AHORA el reflejo `commitar` (#150, ver
  arriba) lo resuelve: el entregable se commitea ANTES del JEFE → `en_repo`
  verifica → el trabajo sobrevive al deploy.
- **FIX #151 (2026-08-07): contrato del puerto fuzzy — el ai-gateway exige
  `request_id` (NO `llm_request_id`).** La PRIMERA prueba real del pipeline en
  prod (invoke_agent → construir-modulos) falló: 5 generaciones reales con
  `[generar_codigo] intento N error: generación timeout` — el v3 publicaba
  `llm.complete.request` con `llm_request_id` (contrato del framework viejo),
  pero el gateway (Entry 2, `onLlmCompleteRequest`) hace
  `if (!request_id) { warn('invalid_payload'); return; }` — SILENCIO total, sin
  response ni failed. Fix en el v3: el evento lleva `request_id: llm_request_id`
  (la clave interna de `_generacionEsperas` se mantiene) y los handlers
  `onLlmCompleteResponse/Failed` filtran por `data.request_id || data.llm_request_id`.
  **Lección doble:** (a) los contratos del gateway REAL difieren de los del
  framework viejo — verificar el código del gateway antes de asumir; (b) los
  smokes con gateway mock pasan aunque el contrato esté roto (el mock acepta
  cualquier clave) — la prueba REAL con el gateway es la que descubre el
  contrato. La cadena de contratos completa: #148 (evento del chat sin
  `.request`) + #149 (`*.failed`) + #151 (`request_id` del gateway).
- Pendiente: rail (reutilizar estados.*). El reflejo `commitar` requiere el
  setup de permisos de www-data en el repo (una vez, sudo — ver arriba) antes
  de probar en prod.
