# Esquema maestro — cola-impresion · ROL JEFE

> Sujeto: la cara de DECISIÓN de la cola de impresión 3D para el dueño (JEFE).
> Objetivo: **interfaz de gestión de la cola** — meter piezas aprobadas
> (el dueño es quien da de alta), reordenarlas cuando cambia la prioridad,
> ver la cola viva, saber cuál sigue, y saber cuánto hay pendiente, con el
> mínimo de gestos y sin recargas.
> Método: esquematizador universal (prisma de 5 huecos) con lente de rol JEFE.
> Ley: agnosticismo (0 tecnologías nombradas en el análisis).
> Proyecto: 3d — taller personal de impresión 3D, uso propio, no vende (fase 0).
> Cuello de botella: una sola impresora SPARKX i7 — una pieza a la vez; la cola
> maximiza su ocupación (esquema fase 2).

## La lente JEFE aplicada a cola-impresion

`cola-impresion` es un **CUSTODIO** del proyecto 3D (reflejo JS): es el **único
escritor** de su store de cola (por proyecto, vía pos-persistencia). Para el
JEFE eso significa:

- **Entrar piezas es la escritura clave** del módulo (append + emite `cola.entrada`).
  Es una de las pocas decisiones de declaración del dueño: qué entra a la cola.
- **El dueño reordena** (sube/baja una pendiente a una posición) — es su mano para
  corregir la prioridad que el motor de ordenación propone.
- **Saber cuál sigue** (extracción) y **cuánto hay pendiente** (longitud) son las
  caras de INFORMACIÓN del jefe: el motor le dice el orden, él lo confirma.
- **La cola NUNCA decide qué imprimir** (invariante 6 del module.json): solo ordena
  lo aprobado. El juez de "qué sale primero" es el motor de ordenación `_ordenar`;
  la decisión de prioridad de una pieza la ajusta el dueño vía `reordenar`.
- El motor de ordenación es **parametrizable y se ajusta con el uso**: las
  variables (material, urgencia, tamaño, tiempo) y el peso de cada una viven en el
  store (`pesos`, `materialCargado`), NO en la UI. Hoy no hay op para que el JEFE
  edite los pesos desde la interfaz — es un hueco [ABIERTO], no un defecto.

```
COLA-IMPRESION · ROL JEFE
│
├─ VISTA VIVA (la cola) ─────────────────────────── el 90% del trabajo ocurre aquí
│   ├─ Cola de pendientes (qué pieza sigue, en orden del motor) · reflejo (leer)
│   │     · la cola NO es la lista cruda: es el orden propuesto por _ordenar
│   ├─ Cabecera de pulso (n pendientes · total en cola) · reflejo (longitud)
│   └─ Detalle del item (material, urgencia, tamaño, antigüedad) · reflejo (leer)
│
├─ GESTO INLINE (lo que hace ÁGIL al panel) ──────── 1 toque, feedback inmediato
│   └─ ➕ Entrar pieza (botón "+ pieza" → editor-bloque) · puente al custodio
│          · entrar existe ✅ — la CAPTURA es el hueco (declaración multi-campo)
│
├─ MANO DEL JEFE (reordenar la prioridad) ────────── el gesto de corrección
│   ├─ Subir/Bajar una pendiente a una posición · puente a reordenar ✅
│   │   · SOLO sobre pendientes (409 si no está pendiente)
│   └─ La señal que emite refresca el orden propuesto — nunca recarga
│
└─ SABER QUÉ SIGUE ────────────────────────────────── la cara de decisión fría
    ├─ "Siguiente a imprimir" (extraer) · puente a siguiente ✅
    ├─ Longitud (pendientes + total) · puente a longitud ✅
    └─ Cola vacía → señal cola.vacia (el dueño decide si entra más)
```

## Los 3 principios de agilidad (lo que extrae el esquema)

1. **Frecuencia → jerarquía.** El gesto que más hace el JEFE al día es *entrar
   piezas* (editor-bloque multi-campo) y *saber cuál sigue*. La cola es la vista
   viva; el alta es un gesto desde la vista, no un formulario en fases.
2. **Ninguna operación recarga la vista.** El refresco lo hace la señal del bus
   (`cola.entrada`, `cola.extraccion`, `cola.reordenada`, `cola.vacia`), no una
   recarga. La vista re-lee, nunca recarga.
3. **La cola visible ES la propuesta de orden.** El jefe no lee la lista cruda de
   items: lee el ORDEN que el motor propone. Su único control sobre ese orden es
   `reordenar` (y, aguas abajo, el ajuste automático de pesos/material cargado que
   hace el módulo al extraer).

## El prisma de 5 huecos con lente JEFE (verificado contra index.js)

### 1 · IDENTIDAD — ¿Qué DECIDE el JEFE aquí?

- **Qué entra a la cola** (`entrar`): modelo_id + nombre, con material, urgencia
  (1..5), tamaño (mm³). Es la cara de EDICIÓN del custodio — una de las pocas
  escrituras del módulo (append + emite `cola.entrada`). Valida que el modelo
  existe en el catálogo (RPC `catalogo.obtener.request`, best-effort) y que no haya
  duplicado pendiente.
- **Qué prioridad tiene cada pieza** (`reordenar`): sube/baja una pendiente a una
  posición. Es la mano del JEFE para corregir el orden del motor.
- **Saber cuál sigue** (`siguiente`): extrae la siguiente pieza según el motor de
  ordenación — es la cara de decisión fría de quién imprimir ahora.
- **Cuánto hay pendiente** (`longitud`): pendientes + total en cola — pulso del jefe.
- **NEUTRO**: `project.activated` (restaura persistencia — sistema, no UI).

### 2 · RESTRICCIONES — ¿Qué NO depende del JEFE?

- **La cola NUNCA decide qué imprimir** (invariante 6): solo ordena lo aprobado. El
  JEFE aprueba en otro módulo (catalogo/aprobación); aquí solo entra lo ya aprobado.
- El motor de ordenación **es el módulo**, no la UI. El JEFE ajusta prioridad con
  `reordenar`, pero los PESOS del motor y el `materialCargado` que re-prioriza
  (evitar cambios de filamento) se ajustan con el uso internamente — no hay op de
  editar pesos desde la interfaz (hoy).
- `project_id`, `modelo_id` y `nombre` son obligatorios en `entrar` (400 si faltan);
  el custodio valida, no la UI.
- **No duplicados**: un mismo `modelo_id` no puede estar pendiente 2 veces (409
  `ALREADY_EXISTS`) — el juez es el módulo, no la UI.
- **Solo se reordena una pieza pendiente** (409 `CONFLICT_STATE` si está
  imprimiendo/hecho/retirada) — el ciclo de estados está en el módulo.
- La persistencia por proyecto es del sistema (pos-persistencia), no de la UI.
- El motor de ordenación **no persiste el orden**: lo calcula bajo demanda (`_ordenar`
  re-puntúa cada vez). La UI muestra un orden propuesto, no un orden almacenado.
- `ciclo-impresion` (que arranca al terminar) es CONSUMIDOR del `siguiente`, no una
  cara del jefe: el JEFE dispara el siguiente manualmente (o el ciclo lo encadena).

### 3 · CONTRATO — ¿Qué necesita VER y qué SEÑAL confirma?

**VER (antes de entrar/decidir):**
- `longitud` (pendientes + total) — para saber si la cola tiene hueco y está viva.
- La propia cola pendiente (orden propuesto) — para no duplicar y ver qué sigue.
- `catalogo.obtener` (RPC indirecto) — confirma que el modelo que entra existe.

**SEÑALES de confirmación (pareadas, verificadas en index.js):**
| Acción | Señal | Verificado |
|---|---|---|
| `entrar` → éxito | `cola.entrada` | ✅ `onEntrarRequest → _entrar → publish` |
| `entrar` → fallo | `cola.entrar.failed` | ✅ par de fallo canónico (module.json) |
| `siguiente` → pieza | `cola.extraccion` | ✅ `onSiguienteRequest → _siguiente → publish` |
| `siguiente` → vacía | `cola.vacia` | ✅ `onSiguienteRequest → _siguiente` (no hay pendientes) |
| `reordenar` → éxito | `cola.reordenada` | ✅ `onReordenarRequest → _reordenar → publish` |
| `longitud` | (lectura) la vista re-lee, nunca recarga | ✅ |
| refresco del panel | `cola.entrada` / `cola.extraccion` / `cola.reordenada` / `cola.vacia` | ✅ (toda mutación emite señal; la vista re-lee) |

### 4 · NO-OBJETIVOS — ¿Qué caras NO son del JEFE?

- **CLIENTE** (elegir/encargar): NO existe — taller de uso propio, no vende (fase 0).
- **TRABAJADOR / taller** (arrancar la impresora, ver progreso físico, cambiar
  filamento): vive en ciclo-impresion, NO aquí. La cola solo entrega el siguiente al
  ciclo; el progreso/impresora no son de este módulo.
- **SISTEMA**: persistencia, health — informa, no decide.
- **Aprobar modelos** (que un modelo entre a la cola): es decisión del dueño en
  catalogo-modelos/aprobación, ANTES de cola. Aquí solo se entra lo ya aprobado.
- **Gestión de filamento** (stock, rollos): módulo aparte; aquí solo el material del
  item alimenta el motor.

### 5 · PREGUNTAS_ABIERTAS — huecos [ABIERTO] (se nombran, no se cierran)

- (a) **Edición de pesos del motor** — los pesos (`material:3, urgencia:2, tamano:1,
  tiempo:1`) y el `urgencia` por pieza viven en el store; NO hay op para que el JEFE
  ajuste los pesos desde la interfaz (solo reordenar una a una). ¿Quiere el dueño
  afinar el motor (más peso al material, menos a tamaño) vía UI? Decisión de dueño.
- (b) **Quitar/retirar pieza** — no hay op de sacar/eliminar un item pendiente
  (solo entrar, reordenar, extraer siguiente). Estados `hecho`/`retirada` NO se
  transicionan desde este módulo (los consume otro). ¿El dueño quiere poder retirar
  una pendiente sin imprimirla? [ABIERTO].
- (c) **Pausar la cola** — el esquema fase 2 pregunta abierta #16: ¿el dueño quiere
  poder pausar/apagar la cola remotamente, no solo reordenar? Hoy no hay op.
- (d) **Vacío / idle** — cuando la cola está vacía (`cola.vacia`) solo se avisa;
  el "modo idle" (qué hace el sistema sin trabajo) es pregunta abierta viva del
  esquema fase 2 (#3).

## Veredicto del ÁRBITRO (lente-roles)

Pregunta árbitro: ¿decide el FUTURO de la cola (escribe en el store vía custodio, o
decide la prioridad) → JEFE · ¿opera el flujo a diario (arranca/retira/observa la
impresora) → TRABAJADOR · ¿solo informa → NEUTRO?

| Op | Veredicto | Por qué |
|---|---|---|
| `entrar` | **JEFE** | Escritura del custodio: da de alta una pieza aprobada en la cola (append + emite `cola.entrada`). Decide el FUTURO de la cola. |
| `reordenar` | **JEFE** | Mano del dueño sobre la prioridad: corrige el orden del motor. Decisión de JEFE. |
| `siguiente` | **JEFE (disparador)** | Extrae la pieza que toca. Es la cara de decisión fría; también lo encadena `ciclo-impresion` (consumidor). El JEFE la dispara manualmente al decidir "imprimir ahora". |
| `longitud` | neutro→jefe | Lectura que alimenta la vista del jefe (pulso pendientes/total). RPC `onLongitudRequest`. |
| leer cola (orden propuesto) | neutro→jefe | La proyección del motor (`_ordenar` + `_pendientes`) que el jefe ve como "cuál sigue". No hay op RPC de listar cola completa: la vista se arma de `siguiente` + `longitud`. |
| `project.activated` | neutro | Restaura persistencia — sistema, no UI. |

**El panel del jefe se compone SOLO de hojas-jefe + hojas-neutro que las alimentan.**
`entrar` y `reordenar` son las dos escrituras de JEFE; `siguiente` + `longitud`
son la cara de información que cierra el círculo (ver qué sigue, ver cuánto queda).
La operación física (arrancar, retirar, cambiar filamento) es TRABAJADOR y vive en
ciclo-impresion — se separa del árbol del jefe.

## Composición de la vista del jefe (3 capas)

```
1. SELECCIONAR  — ver la cola pendiente (orden propuesto del motor) + longitud.
                  tocar un item pendiente para ver detalle (material, urgencia, tamaño).
2. INFORMARSE   — longitud (pulso "n pendientes · total") + "cuál sigue" (siguiente)
                  + cola.vacia (aviso si no hay trabajo).
3. DECLARAR     — las ÚNICAS escrituras del jefe:
                  · entrar (editor-bloque: modelo_id, nombre, material, urgencia,
                    tamaño) — la señal pareada cola.entrada refresca, nunca recarga.
                  · reordenar (subir/bajar una pendiente a una posición) — SOLO
                    pendientes; la señal cola.reordenada refresca el orden propuesto.
```

### Frecuencia → jerarquía

- El gesto rey del JEFE es **entrar** (editor-bloque multi-campo) y **saber cuál
  sigue** (siguiente). La cola es la vista viva (el orden propuesto), no una tabla
  que abre formularios.
- `reordenar` es el gesto de CORRECCIÓN: el motor propone un orden, el dueño lo
  sube/baja cuando la realidad (una pieza que se vuelve urgente) lo exige.
- `longitud` + `siguiente` son el pulso permanente (cuánto hay, qué toca).
- **No hay op destructiva de retirar** ni edición de pesos en este módulo (hoy) —
  son [ABIERTO] de decisión del dueño, no hojas.

## Formas UI canónicas (disección)

| Hoja (órgano) | Forma canónica | Nota |
|---|---|---|
| VISTA COLGANTE: la cola / "cuál sigue" | `ref-select`/cinta | `siguiente` + proyección del motor `_ordenar` — el siguiente en cabecera, el resto como cinta de pendientes propuestas |
| Cola de pendientes (orden del motor) | `cinta-estado` | "n pendientes · total en cola" (longitud) + el item cabeza como "siguiente a imprimir" |
| Cabecera de pulso | `cinta-estado` | `longitud` — pendientes / total |
| Entrar pieza (JEFE) | `editor-bloque` | declaración multi-campo (modelo_id, nombre, material, urgencia, tamaño) — 1 gesto, no fases |
| Reordenar pendiente (JEFE) | `confirmador-nombrado` + control de posición | subir/bajar a una posición (1-based), SOLO pendientes; señala cada reorden en vivo |
| Detalle del item | `cinta-estado`/informe | material, urgencia, tamaño, antigüedad (created/espera) — alimenta la decisión de reordenar/siguiente |
| Cola vacía | `cinta-estado`/aviso | `cola.vacia` → el dueño decide si entra más (nada que confirmar hoy) |
| TODAS las de declaración | `señal-refresh` | **pareadas** (tabla abajo) |

## Señales pareadas por hoja de declaración (verificadas en index.js)

Regla: sin señal, hoja inmadura. Nombres REALES de los publishers del módulo:

```
entrar      → cola.entrada      ✅ (onEntrarRequest → _entrar → publish)
entrar      → cola.entrar.failed ✅ (par de fallo canónico, module.json)
siguiente   → cola.extraccion   ✅ (onSiguienteRequest → _siguiente → publish)
siguiente   → cola.vacia        ✅ (onSiguienteRequest → _siguiente, sin pendientes)
reordenar   → cola.reordenada   ✅ (onReordenarRequest → _reordenar → publish)
longitud    → (lectura) la vista re-lee, nunca recarga ✅
refresco    → cola.entrada / cola.extraccion / cola.reordenada / cola.vacia ✅
             (toda mutación emite su señal; la vista re-lee el orden propuesto)
editar pesos del motor → (transición de configuración) ⚠️ [ABIERTO] sin op UI en index.js
```

## Huecos reales (todos de UI, todos del rol jefe)

1. **Editor de entrada de pieza** — panel-jefe: editor-bloque para `entrar`
   (modelo_id, nombre, material, urgencia, tamaño) con señal pareada `cola.entrada`.
2. **Vista de la cola / "cuál sigue"** — la cinta del orden propuesto por el motor
   (`_ordenar` sobre `_pendientes`) + `siguiente` como cabeza + `longitud` como pulso.
3. **Reordenar pendiente** — control de subir/bajar a posición sobre una pieza
   pendiente, con señal pareada `cola.reordenada`.

`[ABIERTO]` (decisiones del dueño, nombradas NO cerradas):
- (a) **Edición de pesos del motor** (material/urgencia/tamaño/tiempo y su peso) —
  hoy solo se ajusta con el uso; sin op UI.
- (b) **Retirar/eliminar una pendiente** — no hay op destructiva de sacar un item.
- (c) **Pausar la cola** — esquema fase 2 pregunta abierta #16.
- (d) **Modo idle** cuando la cola está vacía — esquema fase 2 pregunta abierta #3.

## El deliverable hacia F7 (spec de construcción)

El panel del jefe para cola-impresion = `ColaJefePanel` compuesto por:
- Cabecera de pulso (n pendientes · total) vía `longitud` + señal `cola.vacia`.
- Cinta de la cola = el **orden propuesto del motor** (proyección de los items
  pendientes) + el item cabeza destacado como "siguiente a imprimir".
- Botón "+ pieza" (editor-bloque de entrada) — delega a `entrar`.
- Control de reordenar (subir/bajar a posición) sobre cada pendiente — delega a
  `reordenar`; señal `cola.reordenada` refresca el orden.
- Acción "siguiente" (extraer el que toca) — delega a `siguiente`; `cola.extraccion`
  confirma y avanza el orden.
- Todas las mutaciones: emitir → señal refresca → la vista ES el feedback.

> **NOTA hacia F7 (sin materializar aquí):** `entrar` / `reordenar` / `siguiente`
> son RPC request/response de cola (`cola.*.response`) — la vista emite el request
> y espera su par de señal; NINGÚN `ui_handler` se materializa en module.json en este
> esquema (eso es del F7/registro).

## Puertos abiertos (cableables por el sitio)

- `fuente_de_la_cola` → hoy: `cola.siguiente` (el que toca) + `cola.longitud`
  (pendientes/total); la proyección del orden propuesto del motor sobre `_pendientes`
  se sirve desde la vista.
- `escritores_de_la_cola` → hoy: `cola.entrar` (dar de alta) + `cola.reordenar`
  (corregir prioridad) — custodia, ambas de JEFE.
- `señal_de_refresco` → hoy: `cola.entrada` · `cola.entrar.failed` · `cola.extraccion`
  · `cola.vacia` · `cola.reordenada`.
- `origen_de_datos` → hoy: `catalogo.obtener.request` (valida que el modelo existe,
  RPC best-effort desde `_entrar`) y `project.activated` (restaura el store).

## Verificación contra index.js (agotado)

- Handlers reales: `onEntrarRequest`, `onSiguienteRequest`, `onReordenarRequest`,
  `onLongitudRequest`, `onProjectActivated` — todos presentes y mapeados.
- Estados: `['pendiente', 'imprimiendo', 'hecho', 'retirada']` — la cola reordena SOLO
  `pendiente` (409 `CONFLICT_STATE` si no); `hecho`/`retirada` no se transicionan aquí.
- `_entrar`: valida `project_id`/`modelo_id`/`nombre` (400), no duplica (409
  `ALREADY_EXISTS` por `modelo_id` pendiente), RPC `catalogo.obtener` best-effort
  (404 si no existe, no bloquea si el catálogo no responde), urgencia clamp 1..5,
  emite `cola.entrada`.
- `_siguiente`: si no hay pendientes emite `cola.vacia` y devuelve `vacia:true`; si
  no, `_ordenar` + pop a `imprimiendo`, ajusta `materialCargado` (el material de la
  pieza extraída pasa a cargado → evita cambio de filamento), emite `cola.extraccion`.
- `_reordenar`: valida `project_id`/`item_id` (400), item existe (404), estado
  pendiente (409), pos clamp 1..len; reescribe `orden` y emite `cola.reordenada`
  (+ `pos`, `total_pendientes`).
- `_longitud`: devuelve `{ pendientes, total }` — sin señal (es lectura pura).
- Motor `_ordenar`: pesos default `material:3 · urgencia:2 · tamano:1 · tiempo:1`,
  material coincidente con `materialCargado` recibe bonus; urgencia 1..5; tamaño
  pequeño primero; antigüedad (horas) suma. Se ajusta con el uso (`pesos` y
  `materialCargado` persistidos por proyecto).
- Invariante 6 (module.json): **la cola NO decide qué imprimir — solo ordena lo
  aprobado**; `entrar` valida que el modelo existe antes de aceptar.
- **No hay op de editar pesos, retirar/eliminar una pendiente, ni pausar** — son
  [ABIERTO] de decisión del dueño, no defectos de la UI.
