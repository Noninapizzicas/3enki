# Blueprint subscribers asíncronos — el LLM interpreta handlers de eventos del bus

> **Documento de patrón canonizado (2026-05-24).** Cierra el gap arquitectónico
> detectado durante el frente 2.4 (deuda escandallo): los blueprints no tenían
> forma de actuar como subscribers asíncronos del bus. Este documento describe
> el mecanismo implementado y los caminos de evolución futura.
>
> **Implementación viva**: `modules/conversacion/ai-gateway/index.js::_wireBlueprintAsyncSubscribers` + `_handleBlueprintAsyncEvent` (commit `6cb2082c`).
> **Primer caso de uso**: `recetas` v1.1.0 escucha `escandallo.coste.calculado` (commit `d4adf697`).

Fecha: 2026-05-24.

---

## 1 · El gap que cerramos

Hasta ahora, los blueprints del subsistema-recetario se ejecutaban de dos formas:

1. **Por chat del usuario**: `chat.prompt.ready → ai-gateway → LLM → blueprint`. Síncrono dentro del agentic loop del LLM.
2. **Por `publishAndWait` desde otro blueprint**: request/response correlacionado por `request_id`, dentro del agentic loop del LLM caller.

**Lo que no había**: que un blueprint reaccionara **autónomamente** a un evento del bus emitido por otro módulo. El campo `eventos_que_escucho` existía en los blueprints hijos pero siempre vacío. Cualquier patrón de "publish + subscribe" entre blueprints requería:
- O bien hardcodearlo via `publishAndWait` (procedural disfrazado, NO event-core).
- O bien que el publisher escribiera directamente en el storage del subscriber (anti-patrón `no_explorar_estado_ajeno`).

Caso testigo: escandallo escribía directo `/recetas.json` porque no había forma de notificar a recetas event-core puro.

## 2 · Por qué el LLM, y no un parser JS

El paradigma del sistema ya tiene **un único intérprete del pseudocódigo**: el LLM. Construir un parser JS paralelo sería **reinventar lo que el LLM ya hace** — y limitar la expresividad del pseudocódigo (no soportaría `<TU eliges...>` y otras instrucciones de razonamiento).

La pregunta del usuario que cerró la decisión: *"¿cómo y quién interpreta el pseudocódigo en un módulo ahora?"*. Respuesta: el LLM. Por tanto, para handlers asíncronos también es el LLM.

**Coste asumido**: tokens por cada evento + latencia 5-25s. Aceptable para eventos de baja frecuencia (operaciones deliberadas del usuario que disparan un calcular/crear/etc.). NO apto para streaming alta-frecuencia. Para ese caso, ver §5.

## 3 · Mecanismo implementado (v1)

### 3.1 Declaración en el blueprint hijo

```json
"eventos_que_escucho": [
  {
    "evento": "escandallo.coste.calculado",
    "handler": "_aplicar_coste_calculado",
    "_descripcion": "..."
  }
]
```

Acepta también la forma corta `["evento.nombre.aqui"]` — el handler se auto-deriva como `_on_<evento_con_underscores>`.

**Convención de nomenclatura**: handlers asíncronos llevan prefijo `_` para indicar "operación interna, no expuesta como cajón al LLM en el chat normal". Solo se invocan via subscriber.

### 3.2 Wire-up en ai-gateway

`_wireBlueprintAsyncSubscribers()` (en `onLoad`, después de `_loadBlueprints`):

1. Para cada blueprint cargado, lee `child.eventos_que_escucho`.
2. Para cada entry valida que el handler existe en `operaciones[handler_name]`.
3. Suscribe al `eventBus` al evento declarado.
4. Guarda la unsub en `asyncSubscriptions: Map<event_name, [{page_id, handler_name, unsub}]>` para `onUnload`.

### 3.3 Invocación al recibir evento

`_handleBlueprintAsyncEvent({page_id, handler_name, evento, event_payload})`:

1. **Loop-guard**: si `event.source.module_id === page_id` (auto-publicación), descarta sin procesar. Evita recursión infinita.
2. Construye conversación sintética:
   - `conversation_id`: nuevo UUID por invocación (aislamiento total entre eventos).
   - `project_id`, `correlation_id`: del payload del evento si vienen.
   - `user_id: 'async-subscriber'`.
   - `page_id`: el del blueprint subscriber.
3. Prompt sintético al LLM (como user message):
   ```
   [sistema interno — invocacion async]
   Has recibido el evento canonico `<evento>`.
   Ejecuta el handler `<handler_name>` de tu blueprint siguiendo SU pseudocodigo paso a paso.
   El payload del evento es el INPUT del handler.
   payload: <JSON>
   IMPORTANTE: NO respondas al usuario en lenguaje natural — esta es una
   invocacion automatica del bus. Solo ejecuta el pseudocodigo del handler
   y termina (los publish/publishAndWait que haga el handler son tu output
   efectivo).
   ```
4. Invoca `_executeLLM` con esos parámetros. El system prompt (inyectado automáticamente al ver page_id) trae el blueprint del subscriber. El LLM lee el handler y lo ejecuta.
5. **Fire-and-forget desde la perspectiva del publisher**: si el handler falla, se loggea `ai-gateway.async-handler.failed` pero NO se propaga al publisher (no hay request_id que correlacionar).

### 3.4 Tests POC2 (cubiertos en `tests/unit/ai-gateway-cajones.test.js`)

- `_wireBlueprintAsyncSubscribers` ignora blueprints sin `eventos_que_escucho`.
- Acepta forma objeto `{evento, handler}` y forma string (auto-derivación).
- Omite si el handler no existe en operaciones.
- Loop-guard descarta eventos auto-publicados.
- `_handleBlueprintAsyncEvent` construye prompt sintético correcto.
- Fire-and-forget: errors no propagan.
- `onUnload` libera todas las subscripciones.

## 4 · Garantías y limitaciones de v1

| Garantía | Comportamiento |
|---|---|
| Aislamiento entre invocaciones | Sí — cada evento → conversation_id nuevo. Cero contexto compartido. |
| Loop-guard | Sí — auto-publicaciones se descartan. |
| Tolerancia a fallos del LLM | Sí — fire-and-forget desde publisher; logueo del fallo del handler. |
| Trazabilidad | correlation_id se propaga del evento al handler y de ahí a los publishes downstream. |
| Determinismo | **No** — el LLM es probabilístico. Mismo evento puede producir comportamiento ligeramente distinto. |
| Latencia controlada | **No** — handler tarda 5-25s típico del LLM. |
| Rate-limit | **No (v1)** — sin protección contra bursts. Si alguien publica 1000 eventos/s, se intentan 1000 conversaciones sintéticas. Mitigación pendiente. |
| Eventual consistency | Sí — el publisher devuelve antes de que el subscriber haya aplicado. Si el usuario consulta inmediatamente, puede ver datos sin la actualización. Coherente con event-core puro. |

## 5 · Trabajo futuro

### 5.1 Rate-limit (deuda v1)

Sin protección contra bursts hoy. Plan:
- `Map<event_name, timestamps[]>` con timestamps de últimas invocaciones.
- Si > N en últimos M ms, log warn + descarta o encola.
- N y M configurables por evento o globales (default ~10/minuto/blueprint).

### 5.2 Cross-check estructural en validador

`llm-runtime-discipline.validate.js` o `subsistema-recetario.validate.js`:
- Verificar que cada entry de `eventos_que_escucho` apunta a operación que existe.
- Verificar convención: handlers asíncronos empiezan por `_`.
- Verificar que el evento declarado en `eventos_que_escucho` está en `eventos_publicados` de algún otro blueprint del repo (no es evento fantasma).

### 5.3 Parser JS para handlers determinísticos (opcional)

Si el coste LLM se vuelve prohibitivo para algún caso de alta frecuencia, considerar implementar un parser JS para handlers marcados como `executor: "deterministic"`. Esto permite que el mismo blueprint declare:
- Handlers de razonamiento → LLM.
- Handlers triviales (aplicar campos al store) → parser determinista.

**No urgente**: hoy el único caso (`recetas._aplicar_coste_calculado`) es de baja frecuencia (1 invocación por receta calculada).

### 5.4 Persistencia de eventos no procesados

Si ai-gateway está reiniciando cuando llega un evento, se pierde. Para casos donde la entrega garantizada importa (ej. mutaciones financieras), considerar event store con replay. **No urgente** — el sistema actual ya acepta eventual consistency.

### 5.5 Convergencia con el patrón de los 66 módulos POC2 del horizontal

Los módulos POC2 normales también escuchan eventos del bus (declarados en `module.json.subscribes[]`, handlers JS). Para blueprints, ahora hay un mecanismo análogo (declarados en `eventos_que_escucho`, handlers en pseudocódigo ejecutados por LLM). **El sistema tiene 2 caminos** para subscribers:

| Mecanismo | Donde se declara | Quién ejecuta |
|---|---|---|
| Módulo POC2 (los 66 del horizontal) | `module.json.subscribes[]` | JS de la clase del módulo (BaseModule + helpers POC2) |
| Blueprint subscriber (este patrón, v1) | `<modulo>.blueprint.json::eventos_que_escucho` | LLM en conversación sintética leyendo el handler del blueprint |

No hay drift entre los dos — cada uno aplica al tipo de módulo correspondiente. Documentar esta convergencia en `CLAUDE.md` cuando se valide v1 en runtime estable.

## 6 · Caso testigo — recetas v1.1.0 + escandallo v3.0.0

Flujo end-to-end del primer caso de uso del patrón:

1. Usuario en chat `page_id=escandallo` pide *"calcula el escandallo de la receta X"*.
2. ai-gateway invoca al LLM en modo cajones. LLM abre `cajon.abrir({nombre:'calcular'})`.
3. LLM ejecuta pseudocódigo de `calcular`:
   - `publishAndWait('recetas.obtener.request', {receta_id})` → recetas devuelve la receta con ingredientes.
   - Razonamiento + llamadas a `mercadona.categorias.listar.request`, `mercadona.producto.obtener.request`.
   - Calcula `coste_total`, `coste_porcion`, etc.
   - **`publish('escandallo.coste.calculado', {7 campos + meta})`** ← fire-and-forget.
4. Devuelve response al usuario con los costes.
5. **En paralelo**, ai-gateway recibió `escandallo.coste.calculado` (suscripto via `_wireBlueprintAsyncSubscribers` porque recetas.blueprint declara escucharlo).
6. ai-gateway crea conversación sintética con page_id=recetas, prompt sintético "ejecuta `_aplicar_coste_calculado` con este payload".
7. LLM lee el handler `_aplicar_coste_calculado` del blueprint de recetas y lo ejecuta:
   - `fs.read /recetas.json` (propio, legítimo).
   - Encuentra receta por id, aplica los 7 campos.
   - `fs.write /recetas.json`.
   - `publish('receta.actualizada', {campos_actualizados, origen:'escandallo.coste.calculado'})`.
8. UI de recetas (si está abierta y suscrita a `receta.actualizada`) refleja los costes.

**Latencia entre paso 4 y 8**: ~5-25s típica (paso 6-7 es invocación LLM completa). Eventual consistency aceptada.

**Coste por escandallo calculado**: ~$0.001 con deepseek (~500 tokens input + ~50 output para el handler).

## 7 · Cuándo NO usar este patrón

- **Eventos de muy alta frecuencia** (>1/s sostenido). Coste LLM se acumula.
- **Handlers timing-sensitive** (requieren respuesta < 1s). La latencia del LLM lo impide.
- **Handlers que necesitan determinismo estricto** (mismo input → exactamente mismo output). El LLM es probabilístico.
- **Handlers que requieren llamadas a recursos nativos** (sharp, pdfjs, libs binarias) que el LLM no puede invocar — usar módulo JS dedicado (patrón de menu-generator, filesystem, etc.).

Para esos casos, mantener módulo POC2 normal con handler JS (no blueprint subscriber).

## 8 · Cómo añadir un nuevo blueprint subscriber

Receta paso a paso:

1. En el blueprint hijo, añadir a `eventos_que_escucho`:
   ```json
   { "evento": "<event_name>", "handler": "_nombre_del_handler", "_descripcion": "..." }
   ```
2. En `operaciones`, añadir el handler con prefijo `_`:
   ```json
   "_nombre_del_handler": {
     "_descripcion": "Operacion INTERNA — handler asincrono del evento '<event_name>'. NO se expone como cajon. Ejecutado por el LLM cuando llega el evento (mecanismo blueprint-subscribers-asincronos).",
     "input": "{...payload del evento...}",
     "pseudocodigo": ["...pasos..."],
     "reglas_clave": ["fire-and-forget desde el publisher", "no inventar valores", "..."],
     "errores_posibles": ["INVALID_INPUT", "..."]
   }
   ```
3. Asegurarse de que el evento que escuchas está en `eventos_publicados` de algún otro blueprint del repo (no fantasma).
4. Verificar manualmente que el handler respeta `estado_persistente` declarado (si lee/escribe paths, deben estar declarados).
5. Bump version del blueprint (cambio funcional aunque sea no destructivo).
6. Reiniciar ai-gateway (el wire-up sucede en `onLoad`).
7. Test runtime: provocar el evento y verificar que el handler se ejecuta (log `ai-gateway.async-subs.wired` al arrancar + `ai-gateway.async-handler.completed` al procesar).

## 9 · Referencias

- Mecanismo: `modules/conversacion/ai-gateway/index.js::_wireBlueprintAsyncSubscribers` + `_handleBlueprintAsyncEvent` (commit `6cb2082c`).
- Primer caso: `modules/pizzepos/recetas/recetas.blueprint.json` v1.1.0 + `modules/pizzepos/escandallo/escandallo.blueprint.json` v3.0.0 (commit `d4adf697`).
- Tests POC2: `tests/unit/ai-gateway-cajones.test.js` (8 tests específicos del mecanismo, 65/65 verdes).
- Contrato afectado: `arquitectura/decisiones/_contratos/llm-runtime-discipline.contract.json::no_explorar_estado_ajeno` (escandallo ya lo respeta tras v3).
- Doc de la deuda original: `arquitectura/decisiones/propuestas/escandallo-aislamiento-store.md`.
- Frente del retoma: `arquitectura/decisiones/propuestas/cajones-frentes-abiertos-retomar.md::2.4`.
