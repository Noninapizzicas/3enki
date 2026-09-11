# Esquema maestro — historial-impresiones · ROL JEFE

> Sujeto: la cara de MEMORIA del taller de impresión 3D para el dueño (JEFE).
> Objetivo: **interfaz de consulta del historial** — ver qué se imprimió en el pasado
> (fecha, modelo, material, filamento usado, tiempo, resultado), cuánto se ha impreso
> (total), y saber que el registro llega solo (por `impresion.completada`), sin que el
> jefe tenga que hacer nada más que mirar, sin recargas.
> Método: esquematizador universal (prisma de 5 huecos) con lente de rol JEFE.
> Ley: agnosticismo (0 tecnologías nombradas en el análisis).
> Proyecto: 3d — taller personal de impresión 3D, uso propio, no vende (fase 0).
> Rol del dato: puro registro append-only — **NO necesita conexión a impresora**
> (solo lee/lista registros; el registro entra por evento, no lo escribe el jefe).

## La lente JEFE aplicada a historial-impresiones

`historial-impresiones` es un **CUSTODIO puro** del proyecto 3D: es el **único
escritor** de su store (por proyecto, vía pos-persistencia). Para el JEFE eso
significa:

- **El jefe NO escribe en el historial.** El registro de una impresión NO lo teclea
  el dueño: entra automáticamente cuando el ciclo de impresión emite
  `impresion.completada` (`onImpresionCompletada`, fire-and-forget → `_registrar`), o
  por RPC desde `ciclo-impresion` (`historial.registrar.request`). El jefe solo **lee**.
- El historial es la **memoria del taller**: la evidencia de qué se imprimió, cuándo,
  con qué material/filamento y con qué resultado. El jefe la consulta para decidir
  (quién falla mucho, qué material gasta, qué modelo imprimí en el pasado).
- Es **append-only puro** (invariante de module.json): una entrada es **inmutable**,
  nunca se edita ni se borra. El jefe no corrige ni depura el pasado — lo mira y lo
  interpreta.
- Cada entrada queda identificada por un `id` único y un `registrado_en` inmutable
  (marca de cuándo entró al store). La fecha de la impresión (`fecha`) es un dato
  transportado por la entrada, distinto de cuándo se registró.
- Los huecos de datos (ej. `tiempo` no medido) quedan como `'desconocido'`
  (invariante 5: dato ausente nombrado, **nunca inventado**). El jefe ve el hueco
  nombrado, no un número falso.

```
HISTORIAL-IMPRESIONES · ROL JEFE
│
├─ VISTA VIVA (el historial) ─────────────────── el 100% del trabajo del jefe está aquí
│   ├─ Cinta cronológica de registros (más reciente primero) · reflejo ✅ (listar)
│   │      · cada entrada: fecha · modelo (id/nombre) · material · filamento usado ·
│   │        tiempo · resultado · registrado_en
│   ├─ Cabecera de pulso (n registros en total) · reflejo ✅ (listar → total)
│   └─ Huecos mostrados como "desconocido" (dato ausente nombrado, nunca inventado)
│
├─ GESTO INLINE (lo que hace ÁGIL al panel) ──── el jefe NO tiene gesto de escritura
│   └─ ⛔ NO hay botón de registrar para el jefe: el registro llega automáticamente
│          por `impresion.completada` (fire-and-forget). El jefe solo mira y, si lo
│          desea [ABIERTO], un "registro manual" puntual vía `registrar` (RPC).
│
├─ REFRESCO AUTOMÁTICO ─────────────────────────  1 registro nuevo → la cinta se actualiza
│   └─ Cuando se emite `historial.impresion_registrada`, la vista re-lee el historial
│          (nunca recarga) y el nuevo registro aparece arriba del todo.
│
└─ SABER CUÁNTO Y QUÉ ─────────────────────────── la cara de decisión fría
    ├─ Total de registros (listar → total) — pulso del jefe
    └─ [ABIERTO] métricas agregadas (filamento total, tiempo, errores) — fase 2
          pregunta abierta #15 — hoy NO hay op de agregación en el módulo
```

## Los 3 principios de agilidad (lo que extrae el esquema)

1. **Frecuencia → jerarquía.** El gesto rey del JEFE aquí es **mirar** el historial
   (cinta cronológica) y **saber cuánto hay** (pulso). No es una tabla aburrida: es la
   memoria del taller, ordenada de más reciente a más antiguo. No hay formularios — el
   jefe no escribe.
2. **Ninguna operación recarga la vista.** El refresco lo hace la señal del bus
   (`historial.impresion_registrada`), no una recarga manual. Cuando entra un registro
   nuevo, la cinta se re-ordena sola (la vista re-lee, nunca recarga).
3. **El historial visible ES la memoria completa.** No hay paginación, filtros ni
   agregación hoy (el módulo solo lista el array completo, `{registros[], total}`). El
   jefe ve TODO el registro disponible y la cantidad total de una pasada.

## El prisma de 5 huecos con lente JEFE (verificado contra index.js)

### 1 · IDENTIDAD — ¿Qué DECIDE / QUÉ VE el JEFE aquí?

- **Qué se imprimió en el pasado** (`listar`): la cinta completa de registros
  (fecha, modelo id/nombre, material, filamento usado, tiempo, resultado, registrado_en),
  más reciente primero. Es la cara de MEMORIA del custodio — el jefe la consulta.
- **Cuánto se ha registrado** (`listar → total`): la cantidad de entradas, el pulso de
  cuánto trabajo ha pasado por el taller.
- **El hueco nombrado**: cuando falta un dato (ej. tiempo exacto), el jefe ve
  `'desconocido'` (invariante 5) — sabe que el dato no se midió, no que sea cero.
- **NEUTRO (para el jefe)**: `onImpresionCompletada` (registro automático — sistema),
  `project.activated` (restaura persistencia — sistema), `registrar` (RPC que invoca
  `ciclo-impresion` — consumo del ciclo, no gesto del jefe).

### 2 · RESTRICCIONES — ¿Qué NO depende del JEFE?

- **El jefe NO escribe ni corrige el historial.** Append-only puro: una entrada una vez
  registrada es **inmutable** — no hay op `editar` ni `borrar` en `index.js` (`_registrar`
  solo hace `store.unshift`; no existe `_actualizar` ni `_eliminar`).
- **El registro lo dispara el sistema, no el jefe.** Entra por `impresion.completada`
  (`onImpresionCompletada`, fire-and-forget → `_registrar`) o por RPC de
  `ciclo-impresion` (`historial.registrar.request`). El jefe no teclea entradas.
- `project_id` y `modelo_id` son obligatorios para registrar (400 si faltan; si falta
  `modelo_id` emite `historial.registrar.failed`). El custodio valida, no la UI.
- `registrado_en` es **inmutable** y lo fija el módulo (siempre `new Date().toISOString()`
  al registrar); la UI no lo pasa. El jefe no puede alterarlo.
- Valores ausentes = `'desconocido'` (invariante 5): huecos nombrados, nunca inventados.
- La persistencia por proyecto es del sistema (pos-persistencia, single-writer), no de la UI.
- `ciclo-impresion` es el ORIGEN de los datos (envía `impresion.completada` con fecha,
  modelo, material, filamento, tiempo, resultado), no una cara del jefe.

### 3 · CONTRATO — ¿Qué necesita VER y qué SEÑAL confirma?

**VER (listar el historial):**
- `listar` (`{ project_id, registros[], total }`) — la cinta completa del historial,
  más reciente primero, y el total de entradas. Con `_listar` devolviendo `registros: []`
  y `total: 0` si el proyecto no tiene store aún (estado vacío sin error).

**SEÑALES de confirmación (pareadas, verificadas en index.js):**
| Acción | Señal | Verificado |
|---|---|---|
| registro nuevo (entra por `impresion.completada` o RPC) | `historial.impresion_registrada` | ✅ `onImpresionCompletada/onRegistrarRequest → _registrar → publish` |
| registro → fallo (faltó `modelo_id`) | `historial.registrar.failed` | ✅ `onRegistrarRequest → _registrar → publish` (par de fallo canónico) |
| `listar` → éxito | (lectura) la vista re-lee, nunca recarga | ✅ `onListarRequest → _listar` — sin señal, es lectura pura |
| refresco del panel | `historial.impresion_registrada` | ✅ (cuando entra un registro, la cinta re-lee y el nuevo aparece arriba) |

Nota: como el jefe solo LEE, su panel se refresca por la señal de ESCRITURA
(`historial.impresion_registrada`) que llega del sistema cuando una impresión se
completa — el jefe ve el historial crecer en vivo sin tocar nada.

### 4 · NO-OBJETIVOS — ¿Qué caras NO son del JEFE?

- **CLIENTE** (elegir/encargar pieza): NO existe — taller de uso propio, no vende (fase 0).
- **TRABAJADOR / taller** (arrancar la impresora, ver progreso físico, retirar pieza,
  cambiar filamento): vive en `ciclo-impresion` y la cola, NO aquí. El historial solo
  guarda evidencia pasada; no opera la máquina.
- **SISTEMA**: persistencia, health — informa, no decide. El registro automático
  (`onImpresionCompletada`) es del sistema, no del jefe.
- **Editar / borrar / corregir el pasado**: NO es del alcance — append-only (restricción
  de diseño del custodio, no un gesto que la UI deba "habilitar").
- **Escribir entradas a mano** (salvo un registro manual puntual [ABIERTO]) — el flujo
  normal es que el sistema registre; el jefe no teclea.

### 5 · PREGUNTAS_ABIERTAS — huecos [ABIERTO] (se nombran, no se cierran)

- (a) **Métricas agregadas** — fase 2 pregunta abierta #15 (¿el dueño quiere historial
  con métricas? filamento total, piezas, tiempo, errores). Hoy `_listar` devuelve el
  array crudo y `total`; NO hay op de agregar (filamento usado acumulado, tiempo total,
  conteo por resultado/material). Si el jefe quiere ese cuadro, es decisión de dueño
  sobre una proyección nueva (no un defecto de la UI).
- (b) **Filtros de consulta** — `_listar` no filtra por `modelo_id`, `material`,
  `resultado` ni rango de fechas. Solo lista todo. ¿El jefe quiere poder consultar
  "¿qué pasó en PETG?" o "¿qué falló?"? [ABIERTO] — consulta nueva sobre la misma store.
- (c) **Registro manual** — el flujo normal registra por evento. ¿Quiere el dueño poder
  añadir una entrada a mano (ej. una impresión hecha fuera del ciclo)? El `registrar`
  RPC existe; exponerlo en la UI del jefe como gesto es decisión del dueño.
- (d) **Consumo del historial por otros módulos** — el esquema fase 2 pregunta abierta #15
  sugiere métricas que otros módulos (gestion-filamento, etc.) podrían consumir de aquí.
  Dónde vive la agregación (¿aquí o en el consumidor?) es decisión de diseño abierta.

## Veredicto del ÁRBITRO (lente-roles)

Pregunta árbitro: ¿decide el FUTURO del historial (escribe en el store vía custodio) →
JEFE · ¿consulta la memoria a diario → JEFE/consulta · ¿solo informa → NEUTRO?

| Op | Veredicto | Por qué |
|---|---|---|
| `listar` | **JEFE (lector)** | La cara de consulta del jefe: la cinta del historial + total. `onListarRequest → _listar` ({registros[], total}). El jefe es el lector natural de la memoria del taller. |
| `registrar` | neutro→sistema | Escritura del custodio, pero en el flujo normal la invoca `ciclo-impresion` (RPC `historial.registrar.request`) — no el jefe. El jefe solo la usaría en un registro manual [ABIERTO]. No es el gesto rey del jefe. |
| `onImpresionCompletada` | neutro (sistema) | Fire-and-forget: registra automáticamente al completarse una impresión. No hay decisión del jefe aquí. |
| `project.activated` | neutro | Restaura persistencia — sistema, no UI. |

**El panel del jefe se compone de una hoja-jefe-lector (`listar`) + la señal de ESCRITURA
del sistema (refresco).** A diferencia de catalogo-modelos/cola-impresion (donde el jefe
escribe: registrar / entrar-reordenar), aquí **el jefe no tiene escritura** — el historial
se alimenta solo. Así que la composición del panel es más simple: VER (listar) + SABER
(total) + REFRESCARSE (señal). Los RPC de escritura (`registrar`) y el fire-and-forget
(`onImpresionCompletada`) son del SISTEMA, se separan del árbol del jefe.

## Composición de la vista del jefe (3 capas)

```
1. SELECCIONAR  — ver la cinta cronológica del historial (listar, más reciente primero).
                  tocar una entrada para ver el detalle completo del registro
                  (fecha · modelo · material · filamento · tiempo · resultado).
2. INFORMARSE   — total de registros (listar → total) · estado vacío ("aún no hay
                  impresiones registradas", registros:[] · total:0) · huecos como
                  "desconocido" (dato ausente nombrado).
3. DECLARAR     — NINGUNA. El jefe NO escribe el historial; la única "entrada" es la
                  señal del sistema `historial.impresion_registrada` que refresca la
                  cinta al completarse una impresión. (Un registro manual [ABIERTO]
                  sería la única escritura posible del jefe.)
```

### Frecuencia → jerarquía

- El gesto rey del JEFE es **mirar** (listar) y **saber cuánto hay** (total). La cinta
  cronológica es la vista viva.
- No hay acciones destructivas ni de edición en este módulo (append-only, sin ciclo de
  estados). El historial solo crece por el evento del sistema.
- `registrar` (RPC) existe pero es consumo del ciclo, no gesto del jefe — queda fuera
  del árbol del jefe salvo que el dueño decida un registro manual [ABIERTO].

## Formas UI canónicas (disección)

| Hoja (órgano) | Forma canónica | Nota |
|---|---|---|
| Cinta del historial (lista) | `ref-select`/cinta | `listar` — entradas cronológicas, más reciente primero; cada una: fecha · modelo · material · filamento · tiempo · resultado · registrado_en |
| Cabecera de pulso | `cinta-estado` | "n registros en total" (listar → total) |
| Detalle de un registro | `cinta-estado`/informe | al tocar una entrada: todos los campos de la entrada, huecos como `desconocido` |
| Estado vacío | `cinta-estado`/aviso | `listar` → `registros:[] · total:0` → "aún no hay impresiones registradas" |
| Registro manual (si el dueño lo decide) | `editor-bloque` | [ABIERTO] el único gesto de escritura posible del jefe; señal pareada `historial.impresion_registrada` |
| TODAS las de declaración (si existe registro manual) | `señal-refresh` | **pareadas** (tabla abajo) |

## Señales pareadas por hoja de declaración (verificadas en index.js)

Regla: sin señal, hoja inmadura. Nombres REALES de los publishers del módulo:

```
registro (auto/impresion.completada) → historial.impresion_registrada ✅ (onImpresionCompletada/onRegistrarRequest → _registrar → publish)
registro → fallo (falta modelo_id)   → historial.registrar.failed   ✅ (par de fallo canónico, module.json)
listar                              → (lectura) la vista re-lee, nunca recarga ✅
refresco del panel                  → historial.impresion_registrada ✅ (el nuevo registro aparece arriba de la cinta)
editar/borrar entrada               → (NO existe) ⚠️ append-only sin op en index.js — no es una hoja
```

El jefe no DECLARA (no escribe), así que el único `señal-refresh` que alimenta su panel
es `historial.impresion_registrada` (escritura del sistema). No hay señal de
`listar` porque es lectura pura.

## Huecos reales (todos de UI, todos del rol jefe/lector)

1. **Cinta del historial** — panel-jefe: cinta cronológica vía `listar`
   (fecha, modelo, material, filamento, tiempo, resultado) con refresco automático por
   `historial.impresion_registrada`. Es la única hoja del jefe (más el total y el
   estado vacío).

`[ABIERTO]` (decisiones del dueño, nombradas NO cerradas):
- (a) **Métricas agregadas** — filamento total, tiempo, errores (fase 2 #15), sin op hoy.
- (b) **Filtros de consulta** — por material/modelo/resultado/fecha; `_listar` no filtra.
- (c) **Registro manual** — `registrar` RPC existe; exponerlo en la UI del jefe es decisión.
- (d) **Consumo por otros módulos** — dónde vive la agregación que el resto consuma.

## El deliverable hacia F7 (spec de construcción)

El panel del jefe para historial-impresiones = `HistorialJefePanel` compuesto por:
- Cabecera de pulso ("n registros en total") vía `listar` → `total`.
- Cinta cronológica del historial (más reciente primero) vía `listar` → `registros[]`,
  cada entrada mostrando fecha · modelo · material · filamento · tiempo · resultado,
  con huecos como "desconocido".
- Estado vacío (registros:[] · total:0 → "aún no hay impresiones registradas").
- Refresco automático por la señal `historial.impresion_registrada` — la vista re-lee,
  nunca recarga.
- (Opcional) Gesto de "registro manual" [ABIERTO] que delega a `registrar`, si el dueño
  lo decide.
- La señal de fallo `historial.registrar.failed` solo aplica si existe ese gesto manual.

> **NOTA hacia F7 (sin materializar aquí):** `listar` es RPC request/response
> (`historial.listar.request` → `historial.listar.response`); `registrar`
> (`historial.registrar.request` → `historial.registrar.response`); el `ui_handler`
> `handleUiListar`/`handleUiRegistrar` ya existe en index.js como puente, pero NINGÚN
> `ui_handler` nuevo se materializa en module.json en este esquema (eso es del F7/registro).

## Puertos abiertos (cableables por el sitio)

- `fuente_del_historial` → hoy: `historial.listar` (`{ registros[], total }`, más reciente primero).
- `escritor_del_historial` → hoy: `historial.registrar` (RPC, lo invoca `ciclo-impresion`)
  + `onImpresionCompletada` (fire-and-forget del sistema) — NINGUNA de las dos es del jefe.
- `señal_de_refresco` → hoy: `historial.impresion_registrada` + `historial.registrar.failed`
  (el fallo solo importa si hay registro manual).
- `origen_de_datos` → hoy: `impresion.completada` (emitido por `ciclo-impresion` con
  fecha, modelo, material, filamento, tiempo, resultado) — el jefe solo lo consume pasivo.

## Verificación contra index.js (agotado)

- Handlers reales: `onRegistrarRequest`, `onListarRequest`, `onImpresionCompletada`,
  `onProjectActivated` — todos presentes y mapeados.
- `_registrar`: valida `project_id` (400) y `modelo_id` (400; si falta `modelo_id` emite
  `historial.registrar.failed`), construye la entrada con `id` (crypto.randomUUID), huecos
  como `DESCONOCIDO` (`modelo_nombre`, `material`, `filamento_usado`, `tiempo`,
  `resultado`), `fecha` (dato transportado o ahora), y `registrado_en` **inmutable**
  (siempre `new Date().toISOString()`); `store.unshift` (más reciente primero) y emite
  `historial.impresion_registrada` (`{project_id, id, modelo_id, resultado}`).
- `_listar`: si no hay store → `{registros: [], total: 0}` (estado vacío); si no →
  `{registros: store, total: store.length}`. Sin señal — lectura pura.
- `onImpresionCompletada`: fire-and-forget — lee `d.project_id`, mapea los datos de la
  impresión completada (con `resultado` default `'completada'`) y delega a `_registrar`
  (el par de fallo se emite dentro de `_registrar`). El jefe NO interviene.
- Store: `Map<project_id, Array<RegistroImpresion>>` — **append-only, más reciente primero**.
- Invariantes: `project_id` y `modelo_id` obligatorios (400); huecos → `'desconocido'`
  (nunca inventado); `registrado_en` inmutable; id único; sin editar ni borrar.
- **No hay op de editar/borrar, ni de agregar métricas, ni filtros** — son [ABIERTO] de
  decisión del dueño, no defectos de la UI. El jefe es LECTOR (listar) y la escritura
  la hace el sistema (`onImpresionCompletada` / RPC de `ciclo-impresion`).
