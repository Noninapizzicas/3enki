# Esquema maestro — cola-impresion · ROL TRABAJADOR / OPERADOR

> Sujeto: la cara de **LECTURA / VIGILANCIA de la cinta** de la cola de impresión 3D para el
> **operador del taller (TRABAJADOR)** — quien está físicamente junto a la SPARKX i7 y
> necesita saber **QUÉ viene a continuación** para preparar el material (rollo) y la
> impresora.
> Objetivo: **interfaz de vigilancia de la cola** — VER qué pieza se imprime ahora, QUÉ sigue
> pendiente, CUÁNTAS hay y el MATERIAL de cada una (para preparar el filamento), con lectura
> directa y sin gestos de escritura.
> Método: esquematizador universal (prisma de 5 huecos) con lente de rol TRABAJADOR.
> Ley: agnosticismo (0 tecnologías nombradas en el análisis).
> Proyecto: 3d — taller personal de impresión 3D, uso propio, no vende (fase 0).
> Cuello de botella: una sola impresora SPARKX i7 — una pieza a la vez; la cola
> maximiza su ocupación (esquema fase 2).

## La lente TRABAJADOR aplicada a cola-impresion (contraste con el JEFE)

Para el **JEFE**, `cola-impresion` es donde **DECLARA** (qué entra), **CORRIGE** (reordena la
prioridad) y **DISPARA** (siguiente). Para el **TRABAJADOR/operador**, el mismo módulo es el
**visor de la cinta del taller**: no lo llena ni lo ordena, lo **VIGILA** para preparar la
impresora.

Contraste honesto con la lente JEFE (ya lo intuyó el esquema-jefe): el jefe **DECIDE y ve el
panorama** (entrar / reordenar / siguiente); el trabajador **EJECUTA lo físico y ve lo concreto
de la cinta** — qué pieza está en marcha, qué sigue, cuántas pendientes y qué material lleva
cada una, para tener el rollo correcto puesto y la máquina preparada.

```
COLA-IMPRESION · ROL TRABAJADOR (operador del taller, junto a la impresora)
│
├─ VIGILAR LA CINTA (la cara real del trabajador aquí) ─── 100% del trabajo
│   ├─ Cabecera de pulso (n pendientes · total en cola) · reflejo (longitud)
│   │     → ¿cuánto trabajo hay por delante? (preparar el material)
│   ├─ Cinta de la cola completa (qué viene ahora / qué sigue) · reflejo (listar)
│   │     → pieza en curso (imprimiendo) + pendientes en orden, con material de cada una
│   └─ Material en curso (materialCargado) · reflejo (listar)
│         → qué rollo está cargado, para anticipar el siguiente cambio de filamento
│
├─ (NO hay escritura del trabajador) ──────────────────────── entrar/reordenar son JEFE ❌
│   · el operador no mete piezas ni reordena la prioridad — eso es del dueño
│
└─ LA DECISIÓN DE QUÉ IMPRIMIR ────────────────────────────── es del JEFE / motor ❌
    · 'siguiente' (extraer) no lo dispara el operador — lo hace el dueño (o lo
      encadena ciclo-impresion); el trabajador solo VE el resultado en la cinta
```

## Los 3 principios de agilidad (qué extrae el esquema, lente trabajador)

1. **La cinta ES la instrucción.** El operador no navega ni busca: la cinta de la cola le dice
   qué pieza está en marcha (`imprimiendo`), qué sigue pendiente y con qué material, en el
   orden propuesto por el módulo. Un vistazo → preparar el rollo. Sin formularios, sin decisión.
2. **Lectura directa, cero recargas.** `listar` / `longitud` son RPC de lectura pura: la vista
   re-lee en cada consulta y se refresca por las **señales que emite el jefe/motor**
   (`cola.entrada`, `cola.extraccion`, `cola.reordenada`, `cola.vacia`). El trabajador nunca
   dispara una mutación, solo consume.
3. **El trabajador NO escribe aquí.** No hay gesto de declaración (entrar), de corrección
   (reordenar) ni de disparo (siguiente) — todo eso es **JEFE**. Su cara aquí es de
   **LECTOR de la cinta** para preparar la máquina; la operación física (retirar pieza, cambiar
   filamento, vigilar el progreso de la pieza que imprime) vive en `ciclo-impresion`.

## El prisma de 5 huecos con lente TRABAJADOR (verificado contra index.js)

### 1 · IDENTIDAD — ¿Qué VIGILA/CONSULTA el TRABAJADOR aquí?

- **La cinta de la cola completa** (`listar` → `_listar`): `{items[], total, pendientes,
  materialCargado}` — los items **todos los estados** (`pendiente`, `imprimiendo`, `hecho`,
  `retirada`) ordenados por `orden`, con `estado`, `material`, `urgencia`, `tamano`,
  `creada_en`, `extraida_en`. Es lo que el operador ve para preparar la impresora: qué está en
  curso y qué viene.
- **El pulso de cuánto hay** (`longitud` → `_longitud`): `{pendientes, total}` — cuánto
  trabajo queda por delante. Cabecera de la cinta del taller.
- **El material en curso** (`materialCargado`, dentro de `_listar`) — qué rollo está puesto,
  para anticipar el cambio de filamento cuando la cinta tenga la siguiente pieza de otro
  material.
- **NEUTRO**: `project.activated` (restaura persistencia — sistema, no UI).

### 2 · RESTRICCIONES — ¿Qué NO depende del TRABAJADOR?

- **`entrar` NO es del trabajador** — es la escritura del CUSTODIO del JEFE (append + emite
  `cola.entrada`). El operador no da de alta piezas.
- **`reordenar` NO es del trabajador** — es la mano del dueño sobre la prioridad del motor
  (emite `cola.reordenada`). El operador no corrige el orden.
- **`siguiente` NO es del trabajador** — extrae la pieza que toca según el motor `_ordenar`
  (emite `cola.extraccion` o `cola.vacia`). Lo dispara el **JEFE** y/o lo **encadena
  `ciclo-impresion`** (consumidor). El trabajador NO decide qué imprime.
- La cola **NUNCA decide qué imprimir** (invariante 6): solo ordena lo aprobado. El juez de
  "qué sale primero" es el motor `_ordenar` (puntúa material·urgencia·tamaño·tiempo); el
  trabajador no lo configura.
- **La operación física** (arrancar impresión, retirar pieza, vigilar progreso, cambiar
  filamento, stock) vive en `ciclo-impresion` / stock de filamento — NO en este módulo. El
  operador **pasa por aquí SOLO para ver la cinta** antes de preparar la máquina.
- La persistencia por proyecto es del sistema (pos-persistencia), no del operador.
- Los campos con huecos vienen honestos: `material` default `'desconocido'`, `tamano` default
  `0` (= desconocido), `urgencia` clamp 1..5 — el operador ve el hueco honrado de la pieza, NO
  se le inventa un material u orden.

### 3 · CONTRATO — ¿Qué necesita VER el TRABAJADOR y qué SEÑAL confirma?

**VER (para preparar la impresora):**
- `listar` (`{items[], total, pendientes, materialCargado}`) — la cinta completa de la cola
  con el estado/material/orden de cada pieza: qué está en curso (`imprimiendo`), qué sigue
  (`pendiente`) y qué hacer (`hecho`/`retirada`). Es la cara de vigilancia del trabajador.
- `longitud` (`{pendientes, total}`) — el pulso de cuánto trabajo hay por delante (preparar
  material).

**SEÑALES de confirmación (pareadas, verificadas en index.js):**
| Acción | Señal | Verificado |
|---|---|---|
| `listar` / `longitud` | (lectura) la vista re-lee, nunca recarga | ✅ RPC de lectura puro (`onListarRequest → _listar`, `onLongitudRequest → _longitud`) |
| el trabajador NO muta | (no emite, no recibe señal de refresco de mutación propia) | ✅ sin op de escritura del worker |
| refresco de la cinta | `cola.entrada` / `cola.extraccion` / `cola.reordenada` / `cola.vacia` (las EMITE el JEFE/motor) | ✅ `onEntrarRequest → _entrar → publish`, `onSiguienteRequest → _siguiente → publish`, `onReordenarRequest → _reordenar → publish` — el worker ve cambiar la cinta por esas señales, pero NO las dispara |

### 4 · NO-OBJETIVOS — ¿Qué caras NO son del TRABAJADOR?

- **JEFE** (declarar/corregir/disparar): `entrar` (escribir qué entra), `reordenar` (corregir
  la prioridad del motor) y `siguiente` (extraer el que toca) son del dueño. El trabajo de
  DECISIÓN se separa del árbol del worker.
- **CLIENTE** (elegir/comprar): NO existe — taller de uso propio, no vende (fase 0).
- **SISTEMA**: persistencia, health — informa, no opera.
- **Operación física de la impresora** (retirar pieza, cambiar filamento, vigilar progreso,
  stock): vive en `ciclo-impresion`, NO aquí. Aquí el trabajador SOLO lee la cinta.

### 5 · PREGUNTAS_ABIERTAS — huecos [ABIERTO] (se nombran, no se cierran)

- (a) **Alcance real de la cara del worker** — el operador casi no vive en cola-impresion:
  mira la cinta (`listar`) y pasa a `ciclo-impresion` para ejecutar. ¿La cinta debe embeberse
  en la vista del ciclo (ver qué viene + ejecutar sin cambiar de módulo)? Decisión de sitio.
- (b) **El orden que ve el trabajador NO es el motor en vivo** — `_listar` ordena por el campo
  `orden` almacenado (resultado de entrar + reordenar), NO por el score del motor `_ordenar`,
  que solo se recalcula bajo demanda en `_siguiente`. El operador ve el orden propuesto
  persistido, no necesariamente el mismo que eligirá el motor al extraer. Hueco honesto de
  [ABIERTO]: ¿exponer el orden "vivo" del motor al trabajador o basta el orden almacenado?
- (c) **Filtro de la cinta del worker** — `_listar`/`_longitud` no filtran por material. El
  operador que solo tiene PETG cargado querría ver "qué hay que no sea PETG" (cambios de rollo
  pendientes). Hueco de consulta, no de escritura; mismo hueco (b) del jefe pero con lente
  taller.
- (d) **Material en curso** — `materialCargado` sale en `_listar` y `_siguiente`, pero no hay
  op de "preparar máquina" ni vista previa del cambio de filamento próximo (qué pieza pendiente
  tiene material distinto al cargado). De existir, es de consulta, no de escritura.

## Veredicto del ÁRBITRO (lente-roles) — CLASIFICACIÓN para el TRABAJADOR

Pregunta árbitro: ¿escribe en el store / decide el futuro de la cola → JEFE · ¿lee la cinta a
diario para operar → TRABAJADOR · ¿solo informa → NEUTRO?

| Op | Veredicto | Por qué |
|---|---|---|
| `entrar` | **JEFE** (NO trabajador) | La escritura clave del custodio. El operador NO da de alta piezas — lo decide el dueño. |
| `reordenar` | **JEFE** (NO trabajador) | Mano del dueño sobre la prioridad del motor. El operador NO corrige el orden. |
| `siguiente` | **JEFE** (NO trabajador) | Extrae el que toca (motor `_ordenar`). Lo dispara el dueño manualmente o lo encadena `ciclo-impresion`. El operador NO decide qué imprime. |
| `listar` | **TRABAJADOR** ✅ | La CINTA de la cola completa (estado/material/orden) — lo que el operador ve para preparar la impresora. RPC directo `onListarRequest → _listar`. |
| `longitud` | **TRABAJADOR** ✅ | Pulso "n pendientes · total" — cuánto trabajo hay por delante. RPC directo `onLongitudRequest → _longitud`. |
| `project.activated` | neutro | Restaura persistencia — sistema, no UI. |

**Conclusión del árbitro (honesta y CLAVE):** al igual que en `catalogo-modelos` —y a
diferencia de `ciclo-impresion`, donde el trabajador EJECUTA confirmaciones físicas—, el
trabajador en `cola-impresion` es un **LECTOR casi puro de la cinta**. Sus caras son
`listar` (la cinta completa: qué está en curso, qué sigue, con material/estado/orden) +
`longitud` (el pulso). **NO toca `entrar`, `reordenar` ni `siguiente`** — son las caras de
decisión del JEFE. El operador vigila la cinta para preparar el material y la máquina, pero
no modifica la cola. Su cara ejecutora real (retirar/cambiar filamento/vigilar progreso) NO
vive en este módulo, sino en `ciclo-impresion`.

## Composición de la vista del TRABAJADOR (capa única)

```
1. VIGILAR — la cinta de la cola (capa única):
              · Cabecera de pulso (pendientes · total)  → `longitud`
              · Cinta de la cola completa (estados, orden, material por pieza)
                                                       → `listar`
              · Material en curso (materialCargado)     → dentro de `_listar`
              Toda lectura: RPC puro; la vista re-lee, refrescada por las señales
              cola.entrada / cola.extraccion / cola.reordenada / cola.vacia que
              EMITE el jefe/motor (el worker NO las dispara).
```

### Frecuencia → jerarquía

- El gesto rey del TRABAJADOR es **ver la cinta** (`listar`): qué pieza está en marcha, qué
  sigue, con qué material — lo que desbloquea la preparación del rollo y de la máquina.
- `longitud` es el pulso permanente (cuánto trabajo queda) que acompaña la cinta.
- **NO hay acción de declaración, corrección ni disparo del worker** — no entra, no reordena,
  no extrae. Su "acción" física (retirar, cambiar filamento) vive en `ciclo-impresion`.

## Formas UI canónicas (disección, lente trabajador)

| Hoja (órgano) | Forma canónica | Nota |
|---|---|---|
| Cinta de la cola completa (capa única) | `cinta-estado`/cinta | `listar` — piezas en orden con estado (🖨️ imprimiendo, 🔵 pendiente, ✅ hecho, 🗑️ retirada) y material; lo que el operador lee para preparar la impresora |
| Cabecera de pulso | `cinta-estado` | `longitud` — "n pendientes · total en cola" |
| Material en curso | `cinta-estado`/aviso | `materialCargado` (de `_listar`) — qué rollo está puesto |
| (El worker NO declara) | — | sin `editor-bloque`, sin `confirmador`: el worker no tiene escrituras ni disparos aquí |

## Señales pareadas por hoja (verificadas en index.js)

Regla: sin señal, hoja inmadura. Nombres REALES del módulo (el worker solo LEE):

```
listar      → (lectura) la vista re-lee, nunca recarga ✅  RPC onListarRequest → _listar
longitud    → (lectura) la vista re-lee, nunca recarga ✅  RPC onLongitudRequest → _longitud
(refresco)  → cola.entrada / cola.extraccion / cola.reordenada / cola.vacia  ✅
              EMITIDAS por el JEFE/motor (onEntrar/onSiguiente/onReordenar → publish);
              el worker las recibe para ver cambiar la cinta, pero NO las dispara
entrar      → (NO del worker) ❌  escritura exclusiva del JEFE
reordenar   → (NO del worker) ❌  corrección exclusiva del JEFE
siguiente   → (NO del worker) ❌  disparo exclusivo del JEFE / ciclo-impresion
```

## Huecos reales para el TRABAJADOR (honestos)

El panel del trabajador en cola-impresion es **mínimo**: es una cara de LECTURA de la cinta,
casi sin piel propia. Los huecos reales:

1. **Cinta de la cola** — `cinta-estado` vía `listar`: qué está en curso, qué sigue y el
   material/estado/orden de cada pieza. Cero escrituras.
2. **Cabecera de pulso / material en curso** — `cinta-estado` vía `longitud` +
   `materialCargado`: cuánto trabajo hay y qué rollo está puesto.
3. **[MATIZ] Embebido o autónomo** — dado que el worker casi no vive aquí, la vía más honesta
   puede ser que la cinta (`listar`) se EMBEBA en la vista de `ciclo-impresion` (el operador ve
   qué sigue mientras ejecuta sobre la pieza en curso) en vez de un panel aparte.

`[ABIERTO]` (decisiones del sitio/dueño, NO del worker):
- (a) **Cinta embebida en ciclo-impresion** — ¿panel propio del worker o cinta integrada donde
  el operador ejecuta? Decisión de sitio.
- (b) **Orden vivo del motor** — el worker ve el `orden` almacenado, no el score de `_ordenar`
  (recalculado solo en `_siguiente`). ¿Exponer el orden vivo? 
- (c) **Filtro de la cinta por material** — `_listar`/`_longitud` no filtran; el operador
  querría ver cambios de rollo pendientes.
- (d) **Vista previa del cambio de filamento** — de existir, es de consulta (pieza pendiente
  con material ≠ materialCargado), no de escritura.

## El deliverable hacia F7 (spec de construcción)

El panel del TRABAJADOR para cola-impresion = `ColaWorkerCinta` compuesto por:
- Cabecera de pulso (n pendientes · total) vía `longitud` + material en curso
  (`materialCargado`, de `_listar`).
- Cinta de la cola completa (`listar`): piezas en orden (por `orden`), con estado
  (🖨️ imprimiendo / 🔵 pendiente / ✅ hecho / 🗑️ retirada), material, urgencia, tamaño.
  El item `imprimiendo` se destaca como "en curso"; el siguiente `pendiente` como "a
  continuación".
- **Sin escrituras ni disparos** — el worker NO entra (`entrar` JEFE), NO reordena
  (`reordenar` JEFE), NO extrae (`siguiente` JEFE/motor). Todas las consultas: RPC de lectura;
  la vista re-lee, refrescada por `cola.entrada` / `cola.extraccion` / `cola.reordenada` /
  `cola.vacia` (emitidas por el jefe/motor). Nunca recarga.
- **Posible embebido**: si el sitio decide integrar la cinta en `ciclo-impresion`, este panel
  queda como especificación de la cinta a reutilizar, no como panel independiente.

> **NOTA hacia F7 (sin materializar aquí):** `listar` / `longitud` son RPC request/response de
> lectura (`cola.listar.response` / `cola.longitud.response`) — la vista emite el request y
> re-lee. `entrar` / `reordenar` / `siguiente` NO son caras del worker. **NINGÚN `ui_handler`
> se materializa en module.json en este esquema** (eso es del F7/registro).

## Puertos abiertos (cableables por el sitio) — puertos de LECTURA del worker

- `fuente_de_la_cinta` → hoy: `cola.listar` (la cinta completa con estado/material/orden)
- `pulso_de_la_cola` → hoy: `cola.longitud` (pendientes/total)
- `señal_de_refresco` → hoy: `cola.entrada` · `cola.extraccion` · `cola.reordenada` ·
  `cola.vacia` (recibidas NO emitidas por el worker)
- `escritores_de_la_cola` → NO son del worker: `cola.entrar` · `cola.reordenar` · `cola.siguiente` (JEFE)

## Verificación contra index.js (agotado)

- Handlers reales: `onEntrarRequest`, `onSiguienteRequest`, `onReordenarRequest`,
  `onLongitudRequest`, `onListarRequest`, `onProjectActivated` — todos presentes y mapeados.
- Estados: `['pendiente', 'imprimiendo', 'hecho', 'retirada']` — `_listar` devuelve TODOS los
  estados (a diferencia de `_pendientes`, que filtra solo pendiente). El trabajador ve el ciclo
  completo de cada pieza en la cinta.
- `_listar`: `{project_id, items[], total, pendientes, materialCargado}` — `items` ordenados
  por `orden` (posición almacenada por entrar/reordenar), incluye `estado`, `material`,
  `urgencia`, `tamano`, `creada_en`, `extraida_en`. Es la cara del trabajador.
- `_longitud`: `{pendientes, total}` — lectura pura, sin señal.
- `_entrar` / `_reordenar` / `_siguiente` — las 3 operaciones de ESCRITURA/DECISIÓN, todas del
  JEFE: `_entrar` (append + `cola.entrada`), `_reordenar` (reescribe `orden` + `cola.reordenada`),
  `_siguiente` (pop a `imprimiendo` + ajusta `materialCargado` + `cola.extraccion` o `cola.vacia`).
  **Ninguna es del trabajador.**
- **Invariante 6 (module.json)**: la cola NO decide qué imprimir — solo ordena lo aprobado.
  El motor `_ordenar` (pesos `material:3 · urgencia:2 · tamano:1 · tiempo:1`, bonus al
  material coincidente con `materialCargado`) puntúa solo dentro de `_siguiente` bajo demanda;
  `_listar` NO lo aplica (ordena por `orden` almacenado). **Hallazgo honesto (b):** el orden que
  ve el trabajador en la cinta no es el score en vivo del motor, sino el orden persistido tras
  entrar/reordenar.
- **No hay op de update/delete/retirar del item ni de editar pesos del motor** — la cola se
  modifica solo vía jefe (entrar/reordenar/siguiente). El worker solo LEE una cinta que escribe
  y decide el jefe. Su cara aquí es **casi sin piel (mínima)**: la operación física vive en
  `ciclo-impresion`.
