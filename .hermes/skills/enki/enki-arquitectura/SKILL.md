---
name: enki-arquitectura
description: >-
  Diagnóstico y ajuste de la arquitectura de Enki: cómo funciona el ModuleLoader
  (config.json enabled/disabled), los nervios del ai-gateway (cantera, rail,
  propiocepción), el ciclo de cierre del rail (estados + juez automático), y las
  decisiones de diseño del dueño (lógica universal desnombrada de hostelería,
  conductor = cantera, no page_id). Úsala cuando el chat "no termina tareas",
  cuando un módulo no se ve en runtime, o antes de añadir cualquier feature nueva
  a un módulo del core.
when-to-use: >-
  Cuando el usuario reporta que el LLM de Enki "se queda atascado", "no enlaza",
  "no termina la tarea"; cuando un módulo/POC no aparece o aparece de más en
  runtime; cuando hay que decidir si una feature nueva va al ai-gateway; cuando
  se trabaja el vertical prisma/pizzepos. Complementa a enki-rebanadas (el
  workflow de edición) con el conocimiento de ARQUITECTURA del sistema.
tags: [enki, arquitectura, loader, rail, nervios, ai-gateway, prisma]
---

# Enki Arquitectura — diagnóstico y ajuste del sistema

> El conocimiento de CÓMO funciona Enki por dentro, para diagnosticar y ajustar
> sin romper ni duplicar. El workflow de edición (rebanadas, rama, PR) vive en
> `enki-rebanadas`; esto es la capa de arquitectura.

## 1. El ModuleLoader: `enabled` ORDENA, `disabled` FILTRA

**Regla de oro: todo lo que tenga `module.json` se CARGA en runtime.**
`config.json → modules.enabled` solo ordena la carga; `modules.disabled` es el
único filtro. El loader identifica por **nombre de DIRECTORIO**, no por
`manifest.name` (un `modules/prisma/carrito/` con name "carrito" se registra como
`carrito`).

Consecuencias prácticas:
- Un POC o módulo a medio hacer en `modules/` **corre en producción** por defecto.
- POCs con `manifest.name` duplicado del real (ej. `ai-gateway-poc` con
  name `ai-gateway`) NO colisionan en el loader (usa el directorio), pero si ambos
  suscriben el mismo evento (`llm.complete.request`) hay doble respuesta.
- `enabled` puede tener fantasmas (nombres sin directorio): no rompen, el sort los
  ignora, pero mienten sobre el sistema. Auditar con un cruce de directorios reales
  vs listas.

**Auditoría del config** (script en `scripts/cruzar-config.py` de esta skill):
recorre `modules/**/module.json`, cruza contra `enabled`/`disabled`, e informa:
fantasmas en enabled, fantasmas en disabled, huérfanos sin declarar, y POCs
suspechosos. Verificado en vivo: 8 fantasmas + 3 POCs cargados en producción.

## 2. Los nervios del ai-gateway — YA EXISTEN, no los dupliques

El ai-gateway inyecta secciones de contexto por turno (todos best-effort, ninguno
bloquea el turno, ninguno corre en turnos sintéticos `async_invocation`):

| Nervio | Método | Qué inyecta |
|---|---|---|
| Sintonía | `sintonizador.seccion()` | la lente del sesgo del humano |
| Cantera | `_leerCantera()` + `_composeCanteraSection()` | inventario REAL de skills (cosecha.listar) + puertas (buscar/traer/promover/crear) |
| Biblioteca | `_leerCatalogoBiblioteca()` | sectores de la bóveda de conocimiento |
| Propiocepción | `_leerPropiocepcion()` | qué pasó en el proyecto desde el último turno |
| Rail | `_leerRailActivo()` + `_composeRailSection()` | la lista activa de estados (el rumbo) |
| Empujón conserje | `_leerEmpujon()` | brechas con intención, una vez |
| Lentes | `_leerCatalogoLentes()` | menú/grafo de lentes (no el cuerpo) |

**Pitfall pagado en sesión:** construí un "nervio cantera" duplicado porque no
grepée primero. En JS de clases la ÚLTIMA definición del método gana
silenciosamente: mi `_composeCanteraSection(features)` quedó pisada por la
existente `_composeCanteraSection(inventario)` y los tests llamaban a la original.
**Regla: antes de añadir un nervio/feature al ai-gateway, grep `_compose<X>` /
`_leer<X>` / `nervio.*<X>` en el módulo.** Si existe → se mejora, no se duplica.

El conductor de cualquier vertical YA VIVE en la cantera: hay una skill por módulo
(`prisma-carrito`, `pizzepos-cocina`, `esquematizador`...) y el nervio cantera las
lista cada turno. No hace falta page_id, ni blueprint monolítico, ni tools en
module.json para que el LLM "sepa conducir" — solo que consulte la cantera.

## 3. El rail se congela con un veredicto stale (el "se queda atascado")

**Síntoma del usuario:** "el LLM hace el trabajo pero no termina la tarea", "se
queda atascado". **Evidencia real** (Regalos): rail `estado=abierta` con el último
paso `pendiente`, pero `ultima_evaluacion={satisfecho:true, razon:"Tanda 4
completada..."}` — el veredicto es STALE: el objetivo cambió (Tanda 3→4) y la
lista se reabrió, pero el juez no re-evalúa.

**Causa raíz:** `ai-gateway/_evaluarRailAuto` hace early-return si
`rail.ultima_evaluacion?.satisfecho` — el primer veredicto "cumplido" bloquea la
re-evaluación PARA SIEMPRE, aunque la lista se reabra (`estados/_anadir` la pasa
de completa→abierta). El trabajo se hace (los reflejos lo verifican), pero el
registro del cierre queda pendiente por un guard que no se invalida.

**Fix (2 archivos):**
1. `modules/estados/index.js`: en `_anadir`/`_marcar`/`_fijarObjetivo`, al reabrir
   la lista (`completa → abierta`), limpiar `lista.ultima_evaluacion = null`.
2. `modules/conversacion/ai-gateway/index.js`: el guard respeta el veredicto SOLO
   si la lista sigue completa:
   ```js
   if (rail.ultima_evaluacion?.satisfecho && rail.estado === 'completa') return;
   ```
   Si la lista está abierta → el veredicto viejo no la congela: re-evaluar.

Detalle completo de reproducción: `references/rail-juez-veredicto-stale.md`.

## 4. Decisiones de diseño del dueño (vertical prisma y generales)

- **La lógica es universal; los nombres de hostelería son instancias.**
  `variaciones` (pizza) = selección con deltas → ya generalizada en
  `prisma/opciones`. Estados de cocina/pedidos → generalizados en
  `prisma/preparar` (pendiente→preparando→listo→entregado/recogido/enviado) con
  PUERTA ABIERTA: el proyecto declara estados custom en
  `/prisma/preparar/config.json` (`{estados:[{id,desde,terminal?}]}`), el freno
  valida BASE ∪ CUSTOM. No cerrar la puerta a ampliar estados.
- **NO tocar `module.json` de los reflejos para declarar tools** (decisión
  explícita del dueño). Las operaciones ya son RPC del bus; el LLM las alcanza con
  `bus.publishAndWait` + la skill de la cantera como método.
- **Conductor = cantera, no page_id.** El chat plano ya recibe TODAS las tools
  (Reja Abierta en `_getTools` — decisión del dueño, el place-scoping se retiró).
  El page_id solo gobierna páginas blueprint (modelo declarativo puro). Una página
  monolítica con 8 cajones de dominios distintos repite el error de sobrecargar al
  LLM; el esquematizador (skill) + la cantera por módulo es el método correcto.
- **Esquematizar cada ELEMENTO del caso, no el proyecto en genérico**: cada
  producto dicta sus pasos (pañuelo=mostrador, tarta=encargo con fecha vía
  calendario). La unidad de esquematización es el producto, no el negocio.
- **Un proyecto puede tener varias verticales** (Regalos: prisma+pizzepos+www);
  cada producto elige la suya por el ProductoUniversal (arquetipo + ejes +
  naturalezas).

## 5. El motor de agentes — la visión correcta (decisión del dueño, 2026-08)

El dueño CORTÓ el framework de agentes viejo ("el árbol está carcomido, lo
cortamos y plantamos uno nuevo"): el patrón "agente = LLM autónomo con bucle de
tools" fracasó (22/22 success falsos; el LLM del agente recibía las tools y
decidía no usarlas). La visión aprobada:

**Un agente = un PIPELINE casi todo determinista, con UNA parte fuzzy acotada y
verificada.** El LLM (fuzzy) NUNCA ejecuta ni decide el flujo: solo GENERA en
los pasos declarados como fuzzy; cada salida fuzzy se valida (checkpoint
determinista) antes de continuar; el entregable se verifica contra el mundo
real (el JEFE) antes del success; reintento QUIRÚRGICO del paso fuzzy con el
veredicto como corrección.

Reglas de construcción (ciclo de obra del diseccionador):
- **Reflejos puros primero** en `modules/_shared/` (con test unitario): el
  validador, el JEFE (con puerto mundo INYECTADO — DI para testear sin fs real)
  y el conversor ya existen en `modules/_shared/motor/` (19/19 tests).
- **Módulos PEQUEÑOS, no un monolito** — la lección: el framework viejo era un
  solo index.js de 50K parcheado hasta pudrirse. Un custodio por store
  (registro de pipelines, bitácora), ejecutor aparte, el fuzzy como CONTRATO
  con el gateway (no un módulo).
- **JS puro + event-driven** (el canon): los reflejos puros en _shared, los
  custodios en modules/<mundo>/<dato>/, las piezas se comunican por eventos,
  nunca import directo. Rust solo tendría sentido para el trío de reflejos
  puros (contratos tipados), nunca para el motor completo.
- **El esquema maestro vive en el repo:** `arquitectura/esquema-motor-agentes/`
  (pasadas + esquema.md con las 10 piezas y sus formas: 4 REFLEJO · 3 CUSTODIO ·
  1 MICRO-AGENTE · 1 CONVERSOR · 1 PUENTE). Resumen condensado + flujo + estado
  de construcción: `references/motor-agentes.md`.

Preferencia del dueño (workflow): **cuando un AGENTE de Enki falla (el LLM del
agente no trabaja), NO insistir con el agente — hacer el trabajo con las SKILLS
de Hermes** (esquematizador, diseccionador, prisma-modelo-universal). Verificado
en vivo: el agente esquematizador falló 3 veces (LLM sin tool_calls); la skill
esquematizador produjo el esquema del motor en minutos.

## 6. Fusión Hermes↔Enki (2026-08-11) — la mente y el cuerpo

El chat conversacional de Enki lo responde HERMES (usuario `hermes`, servicio
systemd `hermes-gateway`). Enki quedó como CUERPO (módulos, bus, stores). La capa
conversacional es imperativa (Hermes); la filosofía event-driven se conserva en
el cuerpo. Decisiones del dueño: Hermes NO es provider del gateway (patrón v2.34
retirado por consumo disparado); el API server de Hermes ejecuta un AGENTE
COMPLETO — un solo salto, no cadena.

Piezas nuevas en `modules/`:
- **`hermes-bridge`** — dispatcher de tools extraído de `ai-gateway._executeToolCall`
  (rutas: bus.publish/publishAndWait universal, ruta directa handler-en-módulo,
  fallback por bus con timeouts graduados 15s/65s/300s). HTTP
  `POST /modules/hermes-bridge/execute` con Bearer token compartido
  (`data/.hermes-bridge-token`, generado al arranque, www-data 600). Catálogo
  OpenAI function-calling (~434 tools) en `/catalog`; `/health` sin auth.
- **`hermes-relay`** — PIPE PURO: `chat.message.saved` → `POST /v1/chat/completions`
  a Hermes → `ai.chat.response`. Cero lógica de agente (ni system prompt, ni
  tools, ni loop). **chat-io SIGUE VIVO** (persistencia SQLite + push al frontend);
  el relay se cuela entre chat-io y Hermes. Config en
  `modules_config.hermes-relay` (`hermes_url`, `hermes_api_key`, `request_timeout_ms`).
- **`hermes/enki_tools/`** — cliente Python del bridge (HTTP, no MQTT raw).

Desactivados (`disabled`): ai-gateway, prompt-builder, ai-agent-framework-v3,
agent-observer, memory-conversation-summary, memory-rag, memory-user-profile.
**REGLA: el disable del sistema viejo es SIEMPRE el último paso, solo tras probar
la cadena nueva con un MENSAJE REAL** (no el health del puente). Un disable
prematuro = prod en modo "primer mensaje = fallo" (pagado en vivo).

Hechos verificados en la integración:
- `:8642` = API server del gateway de Hermes (usuario `hermes`, NO admin).
  `/v1/chat/completions` ejecuta un agente completo (el system del relay se apila
  SOBRE el core de Hermes), auth `API_SERVER_KEY`, soporta
  `X-Hermes-Session-Id`/`X-Hermes-Session-Key`.
- **Slash commands (/model, /new…) NO funcionan por el API server** (viven en el
  CLI y adaptadores de mensajería; 0 `process_command`/`startswith("/")` en
  api_server.py). Cambiar modelo = `modules_config.hermes-relay.hermes_model`.
- MCP Enki (`/opt/enki/mcp/enki-mcp-server.js`) → portal
  (`ui/request/portal/*`, interruptor `portal-mcp` + `portal-mcp-write`). El
  filtro `mcp_servers.enki.tools.include` del gateway limita las tools que el
  agente ve (p.ej. solo 3 `productos.*` de 420 del portal) → el agente recurre a
  terminal crudo. Fix: quitar `tools.include` de la config del usuario hermes +
  restart `hermes-gateway`.
- **Permisos**: módulos generados por el motor (www-data) salen 755 SIN `g+w` →
  el usuario hermes (grupo www-data) no puede escribirlos. Fix:
  `sudo chmod -R g+w /opt/enki/modules/`.
- **Timeout del relay**: trabajo real del agente (tools) puede exceder 300s →
  `HERMES_TIMEOUT` aunque el agente sigue vivo (lección invoke_agent). Subir
  `request_timeout_ms` (900000). Un `HERMES_TIMEOUT` en el chat no significa que
  el agente falló: ver el log del gateway (`/home/hermes/.hermes/logs/agent.log`).

Verificación end-to-end: mensaje real → `chat.message.saved` → `ai.chat.response`
→ `chat.assistant.saved`; la respuesta persistida lleva
`metadata.provider="hermes"`. Revisar con `enki-rpc.js reach <proyecto> <conv>`.

Detalle de la integración (incidente del deploy prematuro, scripts de
activación/reversión, errores vistos en el agente, los DOS Hermes del VPS):
`references/fusion-hermes-enki-2026-08.md`.

## Verificación rápida del estado de prod
```bash
# ¿El módulo está en /opt/enki (deploy hecho)?
ls /opt/enki/modules/prisma/preparar/
# ¿El config de prod tiene el cableado?
python3 -c "import json; en=json.load(open('/opt/enki/config.json'))['modules']['enabled']; print('preparar:', 'preparar' in en)"
# ¿Hay rails atascados? (veredicto satisfecho + lista abierta = bug stale)
python3 - <<'EOF'
import json
d = json.load(open('/opt/enki/data/projects/<proj>/storage/estados/listas.json'))
for lid, l in d.get('listas', {}).items():
    ev = l.get('ultima_evaluacion') or {}
    if ev.get('satisfecho') and l.get('estado') != 'completa':
        print('STALE:', lid, '| estado', l.get('estado'), '| eval', ev.get('razon','')[:60])
EOF
```
