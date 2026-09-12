# Esquema maestro — historial-impresiones · ROL TRABAJADOR / OPERADOR

> Sujeto: la cara de **LECTURA OPERATIVA de la cinta de resultados** de impresión 3D para el
> **operador del taller (TRABAJADOR)** — quien está físicamente junto a la SPARKX i7 y revisa
> **qué se ha imprimido y cómo salió** (pieza, material, filamento usado, tiempo, resultado)
> para saber cómo va el taller y detectar fallos recurrentes.
> Objetivo: **interfaz de consulta de la cinta de resultados pasados** — ver cada impresión
> registrada con su gasto y resultado, con lectura directa, sin gestos de escritura, y sin
> recargas (el registro llega solo por `impresion.completada`).
> Método: esquematizador universal (prisma de 5 huecos) con lente de rol TRABAJADOR / OPERADOR.
> Ley: agnosticismo (0 tecnologías nombradas en el análisis).
> Proyecto: 3d — taller personal de impresión 3D, uso propio, no vende (fase 0).
> Contraste: historial-impresiones ya tiene esquema-jefe (F6) y blueprint jefe; aquí se
> esquematiza para el OPERADOR sobre el MISMO custodio.

## La lente TRABAJADOR aplicada a historial-impresiones (contraste con el JEFE)

Para el **JEFE**, `historial-impresiones` es la **memoria de gestión del taller**: la consulta
la para DECIDIR (quién falla mucho, qué material gasta, qué modelo imprimí) y ver el panorama
(total de registros). Para el **TRABAJADOR/operador**, el mismo módulo es la **cinta de
resultados del taller**: no decide gestión, lo **revisa para saber cómo va la operación** —
qué piezas salieron bien, cuáles fallaron, cuánto filamento y tiempo consumió cada una, y si
hay un patrón de fallos que atender.

Contraste honesto y CLAVE: **ambos roles son LECTORES del mismo `listar`. No hay una
proyección distinta para el trabajador en `index.js`.** Lo que cambia es el FOCO de lectura:

- El JEFE ve la cinta como **gestión / panorama** (total, qué decidir para el futuro).
- El TRABAJADOR ve la MISMA cinta como **informe operativo del taller** (qué salió bien/mal,
  cuánto gastó cada pieza, qué falló) para vigilar la salud de la operación.

El trabajador/operador:

- **NO escribe en el historial.** El registro entra solo por `impresion.completada`
  (`onImpresionCompletada`, fire-and-forget → `_registrar`) o por RPC de `ciclo-impresion`
  (`historial.registrar.request`). El operador no teclea ni corrige: es **append-only puro**.
- Es un **LECTOR del historial**: la cara de la cinta de resultados pasados. Su operación
  física (arrancar la impresora, vigilar el progreso, retirar pieza, cambiar filamento) vive
  en `ciclo-impresion` / `cola-impresion` — NO en este módulo. Aquí **pasa a revisar qué se ha
  hecho y cómo salió**, no a operar la máquina.
- A diferencia de `catalogo-modelos` (donde el jefe escribe `registrar` y el worker solo le
  consulta) o `cola-impresion` (donde el jefe entra/reordena y el worker lee la cinta), en
  `historial-impresiones` **ni el jefe ni el trabajador escriben** — el custodio se alimenta
  solo por evento. Así que la cara del trabajador es **el mismo `listar` del jefe**, con foco
  operativo en resultado y gasto.

```ascii
HISTORIAL-IMPRESIONES · ROL TRABAJADOR (operador del taller)
│
├─ LECTURA OPERATIVA DE LA CINTA (la cara real del trabajador aquí) ─ 100% del trabajo
│   ├─ Cinta de resultados pasados (listar) · reflejo ✅ — el gesto rey:
│   │     cada impresión: fecha · modelo · material · filamento usado · tiempo ·
│   │     resultado (completada / fallida) · registrado_en
│   ├─ Foco operativo (sobre la misma cinta): qué salió bien/mal, cuánto gastó cada pieza,
│   │     y detectar fallos recurrentes — leer la cinta como informe del taller
│   └─ Cabecera de pulso (n impresiones registradas) · reflejo ✅ (listar → total)
│
├─ (NO hay escritura del trabajador) ──────────────────────────────── registro es del SISTEMA ❌
│   · el operador no registra, no edita, no borra — append-only; entra por impresion.completada
│
└─ LA OPERACIÓN FÍSICA ─────────────────────────────────────────────── en OTRO módulo
    · arrancar impresión · vigilar progreso · retirar pieza · cambiar filamento
      → vive en ciclo-impresion / cola-impresion, NO en historial-impresiones
```

## Los 3 principios de agilidad (qué extrae el esquema, lente trabajador)

1. **La cinta de resultados ES la revisión.** El operador no busca ni filtra: lee la cinta
   cronológica (más reciente primero) que le dice qué se imprimió, con qué material, cuánto
   gastó y con qué resultado. Un vistazo → saber cómo va el taller. Sin formularios, sin
   decisiones de escritura.
2. **Lectura directa, cero recargas.** `listar` es un RPC de lectura pura (`onListarRequest →
   _listar` → `{ registros[], total }`): la vista re-lee en cada consulta y se refresca por la
   señal de **escritura del sistema** `historial.impresion_registrada` (cuando una impresión
   se completa). El trabajador nunca dispara una mutación; solo consume.
3. **El trabajador NO escribe aquí.** No hay gesto de declaración (registrar lo hace el
   sistema) ni de corrección. Su "acción" operativa real (retirar, cambiar filamento) vive en
   `ciclo-impresion`. Aquí su cara es de **LECTOR de la cinta de resultados**.

## El prisma de 5 huecos con lente TRABAJADOR (verificado contra index.js)

### 1 · IDENTIDAD — ¿Qué LEE / REVISA el TRABAJADOR aquí?

- **La cinta de resultados pasados** (`listar`): cada impresión registrada con `fecha` ·
  `modelo_id`/`modelo_nombre` · `material` · `filamento_usado` · `tiempo` · `resultado` ·
  `registrado_en`, más reciente primero. Es la cara de MEMORIA OPERATIVA del custodio — el
  operador la consulta para saber qué salió bien/mal.
- **El resultado de cada pieza** (`resultado`, dentro de `_listar`): `'completada'` o
  `'fallida'` (o `'desconocido'` si no se informó). Es el dato que el operador lee para medir
  la salud del taller y detectar fallos recurrentes.
- **El gasto de cada pieza** (`filamento_usado`, `tiempo`, dentro de `_listar`): cuánto
  consumió cada impresión — para saber cómo va el consumo material en la práctica.
- **El pulso de cuánto se ha registrado** (`listar → total`): la cantidad de entradas, el
  volumen de trabajo que ha pasado por el taller.
- **El hueco nombrado**: cuando falta un dato (ej. `tiempo` o `resultado` no medidos), el
  operador ve `'desconocido'` (invariante 5) — sabe que no se midió, no que sea cero.
- **NEUTRO**: `onImpresionCompletada` (registro automático — sistema), `project.activated`
  (restaura persistencia — sistema), `registrar` (RPC escritura que invoca `ciclo-impresion` —
  consumo del ciclo, no gesto del operador).

### 2 · RESTRICCIONES — ¿Qué NO depende del TRABAJADOR?

- **El trabajador NO escribe ni corrige el historial.** Append-only puro: una entrada es
  **inmutable** — no hay op `editar` ni `borrar` en `index.js` (`_registrar` solo hace
  `store.unshift`; no existe `_actualizar` ni `_eliminar`).
- **El registro lo dispara el sistema, no el trabajador.** Entra por `impresion.completada`
  (`onImpresionCompletada`, fire-and-forget → `_registrar`) o por RPC de `ciclo-impresion`
  (`historial.registrar.request`). El operador no teclea entradas.
- `project_id` y `modelo_id` son obligatorios para registrar (400 si faltan; si falta
  `modelo_id` emite `historial.registrar.failed`). El custodio valida, no la UI — y el operador
  no registra.
- `registrado_en` es **inmutable** y lo fija el módulo; la UI no lo pasa. El operador no puede
  alterarlo.
- Valores ausentes = `'desconocido'` (invariante 5): huecos nombrados, nunca inventados.
- La persistencia por proyecto es del sistema (pos-persistencia, single-writer), no del operador.
- `ciclo-impresion` es el ORIGEN de los datos (envía `impresion.completada` con fecha, modelo,
  material, filamento, tiempo, resultado), no una cara del operador.
- **No hay proyección "operativa" separada en index.js** — solo `_listar` (cinta completa) y
  `_registrar`. El foco operativo del trabajador se logra sobre el **mismo `listar`**: no hay
  un `obtener`/filtrar por resultado/material que no exista.

### 3 · CONTRATO — ¿Qué necesita VER el TRABAJADOR y qué SEÑAL confirma?

**VER (la cinta de resultados del taller):**
- `listar` (`{ project_id, registros[], total }`) — la cinta completa del historial, más
  reciente primero, con cada entrada: `fecha` · `modelo_id`/`modelo_nombre` · `material` ·
  `filamento_usado` · `tiempo` · `resultado` · `registrado_en`. Es la cara de LECTURA OPERATIVA
  del trabajador. Con `_listar` devolviendo `registros: []` y `total: 0` si el proyecto no
  tiene store aún (estado vacío sin error).

**SEÑALES de confirmación (pareadas, verificadas en index.js):**

| Acción | Señal | Verificado |
|---|---|---|
| impresión nueva (entra por `impresion.completada` o RPC) | `historial.impresion_registrada` | ✅ `onImpresionCompletada/onRegistrarRequest → _registrar → publish` |
| registro → fallo (faltó `modelo_id`) | `historial.registrar.failed` | ✅ `onRegistrarRequest → _registrar → publish` (par de fallo canónico) |
| `listar` → éxito | (lectura) la vista re-lee, nunca recarga | ✅ `onListarRequest → _listar` — sin señal, es lectura pura |
| refresco de la cinta | `historial.impresion_registrada` | ✅ (cuando entra una impresión, la cinta re-lee y el nuevo resultado aparece arriba) |

Nota: como el trabajador solo LEE, su panel se refresca por la señal de ESCRITURA del sistema
(`historial.impresion_registrada`) — el operador ve crecer la cinta de resultados en vivo, sin
tocar nada.

### 4 · NO-OBJETIVOS — ¿Qué caras NO son del TRABAJADOR?

- **JEFE** (leer la cinta para DECIDIR gestión): el jefe también lee el mismo `listar`, pero con
  foco de gestión/panorama. Es el MISMO dato con distinto propósito — no una cara distinta con
  proyección propia. No hay gesto del jefe que el trabajador herede como escritura.
- **CLIENTE** (elegir/encargar pieza): NO existe — taller de uso propio, no vende (fase 0).
- **SISTEMA**: persistencia, health; el registro automático (`onImpresionCompletada`) es del
  sistema, no del operador.
- **Editar / borrar / corregir el pasado**: NO es del alcance — append-only (restricción de
  diseño del custodio, no un gesto que la UI deba "habilitar").
- **Escribir entradas a mano**: NO — el flujo normal es que el sistema registre por
  `impresion.completada`; el operador no teclea.
- **Operación física de la impresora** (arrancar, vigilar progreso, retirar pieza, cambiar
  filamento): vive en `ciclo-impresion` / `cola-impresion`, NO aquí. Aquí el trabajador SOLO
  lee la cinta de resultados.

### 5 · PREGUNTAS_ABIERTAS — huecos [ABIERTO] (se nombran, no se cierran)

- (a) **Filtro operativo por resultado / material / modelo** — `_listar` no filtra. El operador
  querría revisar "¿qué falló?" (filtrar por `resultado='fallida'`) o "¿qué gastó en PETG?"
  (filtrar por `material`). Hueco de consulta, no de escritura; mismo hueco (b) del jefe con
  lente taller. Consulta nueva sobre la misma store.
- (b) **Métricas operativas de gasto** — el operador quiere ver "cuánto gastó el taller" (suma
  filamento/tiempo, conteo por resultado). Hoy `_listar` devuelve el array crudo y `total`; NO
  hay op de agregar. Decisión de diseño abierta (mismo [ABIERTO] (a) del jefe, fase 2 #15).
- (c) **Alcance real de la cara del worker** — el operador casi no vive en historial-impresiones:
  revisa brevemente la cinta y pasa a `ciclo-impresion`/`cola-impresion` para operar. Dado que es
  **el mismo `listar` del jefe**, ¿basta la misma cinta con foco operativo, o se requiere un
  panel aparte del trabajador? Decisión de sitio — el esquema honesto concluye que el trabajador
  ve la MISMA cinta con foco en resultado/gasto.
- (d) **Notificación de fallos** — si el operador quiere que la cinta le avise cuando llegue un
  `resultado='fallida'` (señal `historial.impresion_registrada` lleva `resultado`), es de consulta
  reactiva, no de escritura. Decisión de sitio/dueño.

## Veredicto del ÁRBITRO (lente-roles) — CLASIFICACIÓN para el TRABAJADOR

Pregunta árbitro: ¿escribe en el store / decide el futuro del historial → JEFE · ¿lee la cinta
de resultados a diario para operar → TRABAJADOR · ¿solo informa → NEUTRO?

| Op | Veredicto | Por qué |
|---|---|---|
| `listar` | **TRABAJADOR** ✅ (y JEFE) | La cinta del historial (`onListarRequest → _listar`, `{registros[], total}`). Tanto el jefe (foco gestión) como el trabajador (foco operativo) son lectores de la MISMA cinta — no hay proyección distinta. RPC directo. |
| `registrar` | neutro→sistema | Escritura del custodio, pero en el flujo normal la invoca `ciclo-impresion` (RPC `historial.registrar.request`) — no el trabajador ni el jefe. Solo se usaría en un registro manual [ABIERTO]. No es gesto del worker. |
| `onImpresionCompletada` | neutro (sistema) | Fire-and-forget: registra automáticamente al completarse una impresión. No hay decisión del trabajador aquí. |
| `project.activated` | neutro | Restaura persistencia — sistema, no UI. |

**Conclusión del árbitro (honesta y CLAVE):** a diferencia de `catalogo-modelos` y `cola-impresion`
(donde el JEFE escribe y el worker solo lee una cinta distinta a la del jefe), en
`historial-impresiones` **NI el jefe NI el trabajador escriben** — el custodio se alimenta solo por
`impresion.completada`. Y **ambos roles leen el MISMO `listar`**: no existe (ni tiene sentido
inventar) una proyección "operativa" separada en `index.js`. La distinción es de FOCO, no de cara:
el trabajador lee la misma cinta enfocando **resultado y gasto** (informe del taller, detectar
fallos), mientras el jefe lee la misma cinta con foco de **panorama/gestión** (decisión). La cara
del trabajador es, honestamente, **la misma cinta de `listar` con presentación orientada a la
operación** (destacar resultado completada/fallida y campos de gasto).

## Composición de la vista del TRABAJADOR (capa única)

```
1. LECTURA OPERATIVA — la cinta de resultados del taller (capa única):
                        · Cabecera de pulso (n impresiones registradas)   → `listar` → `total`
                        · Cinta cronológica (más reciente primero)         → `listar` → `registros[]`
                              cada entrada: fecha · modelo · material · filamento usado ·
                              tiempo · resultado (completada/fallida) · registrado_en
                        · Foco operativo: destacar el resultado (✅ completada / ❌ fallida)
                          y el gasto (filamento, tiempo) de cada pieza
                        Toda lectura: RPC puro; la vista re-lee, refrescada por la señal
                        historial.impresion_registrada que EMITE el sistema (el worker NO la dispara).
```

### Frecuencia → jerarquía

- El gesto rey del TRABAJADOR es **ver la cinta de resultados** (`listar`): qué piezas se
  imprimieron, con qué resultado y cuánto gastó cada una — lo que le dice cómo va el taller.
- `listar → total` es el pulso permanente (cuánto se ha registrado) que acompaña la cinta.
- **NO hay acción de declaración ni de escritura del worker** — no registra, no edita, no borra.
  Su "acción" física (retirar, cambiar filamento) vive en `ciclo-impresion`.

## Formas UI canónicas (disección, lente trabajador)

| Hoja (órgano) | Forma canónica | Nota |
|---|---|---|
| Cinta de resultados pasados (capa única) | `ref-select`/cinta o `cinta-estado`/cinta | `listar` — impresiones en orden cronológico (más reciente primero), con resultado (✅ completada / ❌ fallida) y gasto (filamento, tiempo); lo que el operador lee para revisar el taller |
| Cabecera de pulso | `cinta-estado` | `listar → total` — "n impresiones registradas" |
| Detalle de una impresión | `cinta-estado`/informe | al tocar una entrada: todos los campos (fecha, modelo, material, filamento, tiempo, resultado), huecos como `desconocido` |
| Estado vacío | `cinta-estado`/aviso | `listar` → `registros:[] · total:0` → "aún no hay impresiones registradas" |
| (El worker NO declara) | — | sin `editor-bloque`, sin `confirmador`: el worker no tiene escrituras aquí |

## Señales pareadas por hoja (verificadas en index.js)

Regla: sin señal, hoja inmadura. Nombres REALES del módulo (el worker solo LEE):

```
listar     → (lectura) la vista re-lee, nunca recarga ✅  RPC onListarRequest → _listar
(refresco) → historial.impresion_registrada  ✅  EMITIDA por el SISTEMA (onImpresionCompletada/
             onRegistrarRequest → _registrar → publish); el worker la recibe para ver crecer la
             cinta, pero NO la dispara (lleva {project_id, id, modelo_id, resultado})
registrar → (NO del worker) ❌  escritura del SISTEMA / ciclo-impresion (RPC), no gesto del operador
```

El trabajador no DECLARA (no escribe), así que el único `señal-refresh` que alimenta su panel
es `historial.impresion_registrada` (escritura del sistema). No hay señal de `listar` porque es
lectura pura. `historial.registrar.failed` solo importa si existiera un gesto de registro manual
[ABIERTO] del dueño — no es del trabajador.

## Huecos reales para el TRABAJADOR (honestos)

El panel del trabajador en historial-impresiones es **mínimo y compartido con el jefe**: es una
cara de LECTURA de la cinta, sin piel propia de escritura. Los huecos reales:

1. **Cinta de resultados pasados** — `ref-select`/cinta vía `listar`: impresiones en orden
   (más reciente primero) con fecha, modelo, material, filamento, tiempo y resultado. Cero
   escrituras.
2. **Cabecera de pulso / estado vacío** — `cinta-estado` vía `listar`: n registros, y "aún no
   hay impresiones registradas" cuando `registros:[] · total:0`.
3. **[MATIZ] La MISMA cinta del jefe con foco operativo** — dado que tanto el jefe como el
   trabajador leen el mismo `listar`, la vía más honesta es que la cinta del trabajador SEA la
   misma cinta, presentada con foco en resultado (✅/❌) y gasto (filamento/tiempo) — no un panel
   con proyección inventada que `index.js` no soporta.

`[ABIERTO]` (decisiones del sitio/dueño, NO del worker):
- (a) **Filtro por resultado/material/modelo** — `_listar` no filtra; el operador querría
  revisar "¿qué falló?" o "¿qué gastó en PETG?".
- (b) **Métricas operativas de gasto** — suma de filamento/tiempo, conteo por resultado; sin op
  de agregación hoy.
- (c) **Panel propio vs cinta compartida** — es el mismo listar; decisión de sitio si la cinta
  del trabajador se integra en `ciclo-impresion`/`cola-impresion` o se reutiliza la del jefe.
- (d) **Notificación de fallos** — avisar al operador cuando llegue un `resultado='fallida'`.

## El deliverable hacia F7 (spec de construcción)

El panel del TRABAJADOR para historial-impresiones = `HistorialWorkerCinta` compuesto por:
- Cabecera de pulso ("n impresiones registradas") vía `listar` → `total`.
- Cinta de resultados pasados (más reciente primero) vía `listar` → `registros[]`, cada
  entrada mostrando fecha · modelo · material · filamento usado · tiempo · resultado, con los
  huecos como "desconocido" y el **resultado destacado** (✅ completada / ❌ fallida) por su
  foco operativo.
- Estado vacío (registros:[] · total:0 → "aún no hay impresiones registradas").
- Refresco automático por la señal `historial.impresion_registrada` — la vista re-lee, nunca
  recarga.
- **Sin escrituras** — el worker NO registra (`registrar` es del sistema/ciclo-impresion) ni
  edita ni borra (append-only). Todas las consultas: RPC de lectura; la vista re-lee.
- **[MATIZ]** Esta especificación es la de la MISMA cinta que lee el jefe (`listar`), presentada
  con foco operativo. Si el sitio integra la cinta del trabajador en `ciclo-impresion` o reutiliza
  el panel del jefe, queda como especificación del listar compartido, no como una proyección nueva.

> **NOTA hacia F7 (sin materializar aquí):** `listar` es RPC request/response de lectura
> (`historial.listar.request` → `historial.listar.response`); el `ui_handler` `handleUiListar`
> ya existe en index.js como puente, pero NINGÚN `ui_handler` nuevo se materializa en module.json
> en este esquema (eso es del F7/registro).

## Puertos abiertos (cableables por el sitio) — puertos de LECTURA del worker

- `fuente_de_la_cinta_de_resultados` → hoy: `historial.listar` (`{ registros[], total }`, más
  reciente primero) — MISMO puerto que el jefe; el trabajador no tiene uno propio.
- `señal_de_refresco` → hoy: `historial.impresion_registrada` (recibida NO emitida por el worker).
- `escritor_del_historial` → NO es del worker: `historial.registrar` (RPC de `ciclo-impresion`) +
  `onImpresionCompletada` (fire-and-forget del sistema).
- `origen_de_datos` → hoy: `impresion.completada` (emitido por `ciclo-impresion` con fecha,
  modelo, material, filamento, tiempo, resultado) — el trabajador solo lo consume pasivo.

## Verificación contra index.js (agotado)

- Handlers reales: `onRegistrarRequest`, `onListarRequest`, `onImpresionCompletada`,
  `onProjectActivated` — todos presentes y mapeados.
- `_registrar`: valida `project_id` (400) y `modelo_id` (400; si falta `modelo_id` emite
  `historial.registrar.failed`), construye la entrada con `id` (crypto.randomUUID), huecos como
  `DESCONOCIDO` (`modelo_nombre`, `material`, `filamento_usado`, `tiempo`, `resultado`), `fecha`
  (dato transportado o ahora), y `registrado_en` **inmutable**; `store.unshift` (más reciente
  primero) y emite `historial.impresion_registrada` (`{project_id, id, modelo_id, resultado}`).
- `_listar`: si no hay store → `{registros: [], total: 0}` (estado vacío); si no →
  `{registros: store, total: store.length}`. Sin señal — lectura pura.
- `onImpresionCompletada`: fire-and-forget — mapea los datos de la impresión completada (con
  `resultado` default `'completada'`) y delega a `_registrar`. El operador NO interviene.
- Store: `Map<project_id, Array<RegistroImpresion>>` — **append-only, más reciente primero**.
- **HALLAZGO HONESTO y CLAVE:** solo existen DOS proyecciones, `_listar` (cinta completa) y
  `_registrar` (escritura). **NO hay un `obtener` por id ni filtros por `resultado`/`material`/
  `modelo` ni agregación de gasto.** El trabajador (igual que el jefe) lee el MISMO `_listar`.
  No se inventa una proyección "operativa" que index.js no soporta — el foco del trabajador es
  presentacional sobre la misma cinta.
- **No hay op de editar/borrar ni de agregación ni filtros** — son [ABIERTO] de decisión del
  dueño, no defectos de la UI. El trabajador es LECTOR (listar) y la escritura la hace el sistema
  (`onImpresionCompletada` / RPC de `ciclo-impresion`). Su cara operativa real (retirar, cambiar
  filamento) vive en `ciclo-impresion` / `cola-impresion`, no aquí.
