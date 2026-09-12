# Esquema maestro — gestion-filamento · ROL JEFE

> Sujeto: la cara de DECISIÓN de la gestión de filamento del taller para el dueño
> (JEFE).
> Objetivo: **interfaz de gestión de los rollos de filamento** — dar de alta un
> rollo (tipo, color, longitud inicial), ver el stock restante de cada uno,
> saber cuál es el activo (cargado en la impresora) y cuál está bajo el umbral,
> con el mínimo de gestos y sin recargas.
> Método: esquematizador universal (prisma de 5 huecos) con lente de rol JEFE.
> Ley: agnosticismo (0 tecnologías nombradas en el análisis).
> Proyecto: 3d — taller personal de impresión 3D, uso propio, no vende (fase 0);
> imprime con PETG en la SPARKX i7; la impresora reporta `filament_used` en mm.
> Cuello de botella: el filamento es consumible finito — un rollo se agota; el
> taller debe saber si queda filamento para la pieza que toca imprimir (esquema
> fase 2).

## La lente JEFE aplicada a gestion-filamento

`gestion-filamento` es un **CUSTODIO** del proyecto 3D (reflejo JS): es el
**único escritor** de su store de filamento (`Map<id,Filamento>`, por proyecto,
vía pos-persistencia). Para el JEFE eso significa:

- **Registrar es la escritura clave del módulo** (append + emite
  `filamento.registrado`). Es EL gesto de declaración del dueño: qué rollo entra
  al taller, con qué tipo, color y longitud inicial, y si está activo (cargado en
  la impresora). Con `longitud_inicial` opcional: si no se declara, el rollo nace
  de **longitud desconocida** (`null`) y **no podrá decrementarse** (invariante 9).
- **Lo que el jefe declara en el alta es lo que el módulo consume** para
  decrementar (`filamento.usado` de la impresora) y para avisar de bajo
  (`filamento.bajo`).
- **El decremento por evento es del SISTEMA, no del jefe.** La impresora reporta
  `filament_used` en mm (`onFilamentoUsado`, fire-and-forget) y el módulo
  decrementa el **rollo activo**. El jefe NO decrementa a mano: él ve el stock
  reflejado después de que la impresora imprime. Esto es esencial para no
  inventar una hoja de "decrementar" en la cara del jefe.
- **El jefe ve el stock y detecta riesgos**: `listar` le devuelve cada rollo con
  `longitud_restante`, `activo` (cuál está cargado) y `bajo` (si cae bajo el
  umbral). Es la cara de INFORMACIÓN que cierra el círculo de decidir "¿hay
  filamento para la siguiente pieza?".
- **El campo `activo` (cuál rollo va cargado en la impresora) es parte del
  `registrar`** — no hay un RPC "marcar_activo" en index.js. Si el jefe quiere
  cambiar qué rollo es el activo (porque cargó otro), hoy tendría que volver a
  pasar por el registro — es un hueco [ABIERTO], no un defecto (documentado al
  final).

```
GESTION-FILAMENTO · ROL JEFE
│
├─ VISTA VIVA (el stock de rollos) ────────────────── el 90% del trabajo ocurre aquí
│   ├─ Cinta de rollos (tipo, color, longitud restante, activo, bajo) · reflejo ✅ (listar)
│   ├─ Cinta de pulso (n rollos · en uso / bajo umbral) · reflejo ✅ (listar)
│   ├─ Badge "activo" (el rollo cargado en la impresora) · reflejo ✅ (listar → activo)
│   └─ Badge "bajo" (rollo por debajo del umbral) · reflejo ✅ (listar → bajo)
│
├─ GESTO INLINE (lo que hace ÁGIL al panel) ──────── 1 toque, feedback inmediato
│   └─ ⭐ Alta de rollo (botón "+ rollo" → editor-bloque) · puente al custodio
│          · registrar existe ✅ — la CAPTURA es el hueco (alta multi-campo)
│          · incluye tipo, color, longitud_inicial y el toggle "activo"
│
└─ AVISO DE BAJO ─────────────────────────────────── la cara de alerta reactiva
    ├─ "Rollo X por debajo del umbral" · señal filamento.bajo ✅ (el jefe decide reponer)
    ├─ Umbral hoy fijo en 5000mm (constructor) · [ABIERTO] configuración del dueño
    └─ Decremento por evento (impresora) → el stock refresca solo, sin gesto del jefe
```

## Los 3 principios de agilidad (lo que extrae el esquema)

1. **Frecuencia → jerarquía.** El gesto rey del JEFE es `registrar` (editor-bloque
   multi-campo: tipo, color, longitud inicial + activo). La cinta del stock es la
   vista viva; el alta es un gesto desde la vista, no un formulario en fases.
2. **Ninguna operación recarga la vista.** El refresco lo hace la señal del bus
   (`filamento.registrado`, `filamento.decrementado`, `filamento.bajo`,
   `filamento.decrementar.failed`), no una recarga. La vista re-lee, nunca recarga.
3. **El stock visible ES el estado del taller.** El jefe no opera el decremento a
   mano: lee lo que la impresora va consumiendo. Su único control es qué entra
   (`registrar`). Todo lo demás es reflejo en vivo de lo que pasa en la máquina.

## El prisma de 5 huecos con lente JEFE (verificado contra index.js)

### 1 · IDENTIDAD — ¿Qué DECIDE el JEFE aquí?

- **Qué rollos entran al taller** (`registrar`): tipo, color, longitud inicial (mm,
  opcional), y si está `activo` (cargado en la impresora). Es la cara de EDICIÓN
  del custodio — la ÚNICA escritura del módulo (append + emite
  `filamento.registrado`).
- **Ver el stock para decidir "¿queda filamento?"** (`listar`): cada rollo con su
  `longitud_restante`, `activo` y `bajo`. Es la cara de decisión fría de reponer
  o no antes de la próxima pieza.
- **Saber cuál es el rollo activo** — el que la impresora está gastando
  (`listar → activo`). Decisión implícita en el momento del alta (`activo` en
  `registrar`).
- **Detectar los rollos bajo umbral** — `listar → bajo` y la señal `filamento.bajo`
  (cualquier rollo que caiga bajo 5000mm). El jefe decide si repone.
- **NEUTRO**: `project.activated` (restaura persistencia — sistema, no UI).

### 2 · RESTRICCIONES — ¿Qué NO depende del JEFE?

- **El decremento NO lo dispara el jefe a mano**: llega por evento `filamento.usado`
  de la impresora (`onFilamentoUsado`) contra el **rollo activo**. Es del SISTEMA.
  Si no hay rollo activo, no se decrementa (honesto, `if (!activo) return`).
- **Invariante 9**: el filamento NO se decrementa sin rollo o con longitud
  desconocida — devuelve `filamento.decrementar.failed` (404 `RESOURCE_NOT_FOUND`
  si el rollo no existe en el proyecto; 409 `LONGITUD_DESCONOCIDA` si
  `longitud_restante === null`). El juez es el módulo, no la UI.
- **Un rollo con longitud desconocida NO podrá decrementarse nunca** (invariante 9)
  — el jefe debería declarar `longitud_inicial` al registrar si quiere poder
  gastarlo. El alta con longitud omitida solo sirve para inventariar.
- El custodio del store es el PROPIO módulo (`Map<id,Filamento>`). El JEFE **no
  edita ni borra** un rollo ya registrado: el `id` se genera (409 `ALREADY_EXISTS`
  si se repite) y no hay op de update/delete. Append-only hoy.
- `tipo` y `project_id` son obligatorios (400 si faltan); `color` default
  `desconocido`; `longitud_inicial` pasa a `null` y `longitud_restante` a `null`
  si no es número > 0 — el módulo valida, no la UI.
- El rollo activo por proyecto es **único** de facto (el último registrado con
  `activo:true` gana por re-escritura del Map; `_rolloActivo` devuelve el primero
  que encuentre en orden de iteración) — no hay RPC para desactivar el anterior.
- El umbral de filamento bajo (5000mm) es una constante del constructor (pregunta
  abierta 5 del plan) — el jefe NO lo ajusta desde la interfaz hoy. [ABIERTO].
- La persistencia por proyecto es del sistema (pos-persistencia), no de la UI.
- La operación física de cambiar filamento en la impresora **no vive aquí** — es
  del taller/ciclo de impresión, no de este custodio.

### 3 · CONTRATO — ¿Qué necesita VER y qué SEÑAL confirma?

**VER (antes de decidir/registrar):**
- `listar` (rollos del proyecto, `{filamentos[], total}`) — para no duplicar y
  para ver qué hay, qué está activo y qué está bajo el umbral (cada item trae
  `tipo`, `color`, `longitud_inicial`, `longitud_restante`, `activo`, `bajo`).

**SEÑALES de confirmación (pareadas, verificadas en index.js):**
| Acción | Señal | Verificado |
|---|---|---|
| `registrar` → éxito | `filamento.registrado` | ✅ `onRegistrarRequest → _registrar → publish` |
| `registrar` → fallo | `filamento.registrar.failed` | ✅ par de fallo canónico (module.json) |
| `decrementar` (sistema, impresora) → éxito | `filamento.decrementado` | ✅ `onDecrementarRequest → _decrementar → publish` |
| `decrementar` → bajo umbral | `filamento.bajo` | ✅ `_decrementar → _detectarBajo → publish` |
| `decrementar` → fallo | `filamento.decrementar.failed` | ✅ par de fallo (404/409 invariante 9) |
| `listar` | (lectura) la vista re-lee, nunca recarga | ✅ |
| refresco del panel | `filamento.registrado` / `filamento.decrementado` / `filamento.bajo` / `filamento.decrementar.failed` | ✅ (toda mutación emite señal; la vista re-lee) |

Nota de honestidad: `filamento.decrementado` y `filamento.bajo` los dispara la
IMPRESORA (evento `filamento.usado`), no un botón del jefe. El panel del jefe se
REFRESCA con ellos (la cinta del stock se actualiza sola tras cada impresión),
pero el jefe no los dispara: son el reflejo del consumo físico. Sobre el
`filamento.decrementar.failed` (p.ej. rollo activo con longitud desconocida), el
jefe debería ver un aviso de que no se pudo decrementar y por qué — sin poder
forzarlo desde la UI.

### 4 · NO-OBJETIVOS — ¿Qué caras NO son del JEFE?

- **CLIENTE** (comprar filamento / pedir piezas): NO existe — taller de uso
  propio, no vende (fase 0).
- **TRABAJADOR / taller** (cambiar físicamente el rollo, arrancar la impresora,
  ver la boquilla): vive en ciclo-impresion/adaptador-impresora, NO aquí. Este
  módulo solo lleva la contabilidad del filamento.
- **SISTEMA**: el decremento por evento de la impresora (`filamento.usado`),
  la persistencia (`project.activated`, pos-persistencia) — informa/ejecuta, no
  decide.
- **Comprar filamento automáticamente** — fuera de alcance del esquema fase 2
  (no-objetivo del prisma de negocio).
- **Pesar filamento** — solo longitud, no peso (fase 2).
- **Detección de falta física de filamento** (`filament_detected`) — es del
  adaptador de impresora / sensor, no de este custodio (fase 2, sub-producto
  2f.4 REF).

### 5 · PREGUNTAS_ABIERTAS — huecos [ABIERTO] (se nombran, no se cierran)

- (a) **Marcar el rollo ACTIVO sin re-registrar** — `activo` solo se fija en
  `registrar`; NO hay op RPC "marcar_activo"/"cambiar activo" en index.js. Cuando
  el jefe carga otro rollo en la impresora, hoy no puede re-marcarlo sin volver a
  pasar por el alta (o sin un RPC nuevo). Decisión de dueño sobre cómo representar
  "el rollo que está cargado ahora".
- (b) **Configurar el umbral de filamento bajo** — hoy 5000mm fijo en el
  constructor. NO hay op UI para que el jefe lo ajuste (pregunta abierta 5 del
  plan y fase 2 #2). ¿Lo quiere configurar desde la interfaz?
- (c) **Longitud inicial** — ¿la declara el dueño al registrar o se infiere del
  fabricante (fase 2 #1)? Hoy el jefe la declara manualmente en el alta; el rollo
  puede nacer de longitud desconocida (que no se podrá decrementar).
- (d) **Corrección/ajuste manual de longitud** — no hay op de actualizar
  `longitud_restante` a mano (append-only; solo el decremento por evento lo baja).
  ¿El jefe quiere poder corregir una longitud mal declarada?
- (e) **Edición/borrado de rollos** — no hay op de eliminar un rollo ni editarlo.
  El historial de consumo es append-only. ¿Retirar un rollo agotado del stock
  activo sin borrarlo del histórico?
- (f) **Quién dispara `registrar` con `activo:true`** — si más de un origen
  (el jefe o un flujo automático que detecta la carga de filamento) puede marcar
  el activo, hay que decidir la fuente de verdad de "cuál está cargado".

## Veredicto del ÁRBITRO (lente-roles)

Pregunta árbitro: ¿decide el FUTURO del stock (escribe en el store vía custodio) →
JEFE · ¿opera el flujo a diario (cambia el rollo físicamente, observa la máquina) →
TRABAJADOR · ¿solo informa/automatiza → NEUTRO?

| Op | Veredicto | Por qué |
|---|---|---|
| `registrar` | **JEFE** | La ÚNICA escritura del custodio: da de alta un rollo (append + emite `filamento.registrado`), con tipo, color, longitud inicial y el toggle `activo`. Decide el FUTURO del stock. |
| `listar` | neutro→jefe | Lectura que alimenta la vista del jefe (cinta del stock + badges activo/bajo). RPC directo `onListarRequest`. |
| `decrementar` | **NEUTRO (automatizado)** | Lo dispara la impresora por evento `filamento.usado` contra el rollo activo (`onFilamentoUsado`), no el jefe. Emite `filamento.decrementado`/`filamento.bajo`. El jefe NO lo ejerce como op de UI. |
| `activar rollo` (marcar activo) | JEFE (decisión) — hoy **sin RPC propio** | Es decisión del jefe qué rollo está cargado, pero hoy `activo` vive SOLO como campo de `registrar`. No hay onMarcarActivo. [ABIERTO]. |
| `project.activated` | neutro | Restaura persistencia — sistema, no UI. |

**El panel del jefe se compone SOLO de hojas-jefe + hojas-neutro que las
alimentan.** `registrar` es la escritura de JEFE; `listar` es la lectura que la
alimenta y que muestra el stock. El decremento es del SISTEMA (impresora) — el
jefe lo ve reflejado, no lo dispara. La operación física (cambiar el rollo) es
TRABAJADOR y vive en ciclo-impresion — se separa del árbol del jefe.

## Composición de la vista del jefe (3 capas)

```
1. SELECCIONAR — ver el stock: listar (cinta de rollos: tipo, color, longitud
                 restante, activo, bajo) · tocar un rollo para ver detalle
2. INFORMARSE  — listar (cinta + pulso "n rollos · cuántos bajo umbral") +
                 badges "activo" y "bajo" por rollo · señal filamento.bajo como
                 alerta reactiva (un rollo se agota sin que el jefe toque nada)
3. DECLARAR    — la ÚNICA escritura del jefe:
                 · registrar (editor-bloque: tipo, color, longitud_inicial +
                   toggle "activo") — la señal pareada filamento.registrado
                   refresca, nunca recarga.
                 · (activar rollo) — [ABIERTO]: si existe un RPC para re-marcar
                   el activo, es la segunda declaración del jefe; hoy no existe.
```

### Frecuencia → jerarquía

- El gesto rey del JEFE es `registrar` (editor-bloque multi-campo: tipo, color,
  longitud inicial, activo). La cinta del stock es la vista viva, no una tabla
  que abre formularios.
- `listar` es el pulso permanente: qué hay, qué está activo, qué está bajo.
- **No hay op destructiva** (no editar, no borrar, no decrementar a mano) ni
  transición de estados en este módulo (el rollo no tiene ciclo de vida de
  estados — solo alta + consumo por evento). El `bajo` es un FLAG derivado de
  `longitud_restante` frente al umbral, no un estado transicionable por el jefe.

## Formas UI canónicas (disección)

| Hoja (órgano) | Forma canónica | Nota |
|---|---|---|
| Cinta del stock (capa 1) | `ref-select`/cinta | `listar` — rollos tipo/color/longitud restante; badges `activo` y `bajo` en cada tarjeta; el ref-select queda expuesto en la cinta |
| Cinta de pulso | `cinta-estado` | "n rollos · m activo · k bajo umbral" (listar) |
| Registrar rollo (JEFE) | `editor-bloque` | declaración multi-campo (tipo, color, longitud inicial + toggle activo) — 1 gesto, no fases |
| Badge "rollo activo" | `ref-select`/badge | `listar → activo` — cuál está cargado en la impresora |
| Badge "rollo bajo" | `cinta-estado`/aviso | `listar → bajo` + señal `filamento.bajo` — alerta reactiva para reponer |
| Detalle del rollo | `cinta-estado`/informe | tipo, color, longitud_inicial/restante, activo, bajo, created_at |
| TODAS las de declaración | `señal-refresh` | **pareadas** (tabla abajo) |

## Señales pareadas por hoja de declaración (verificadas en index.js)

Regla: sin señal, hoja inmadura. Nombres REALES de los publishers del módulo:

```
registrar      → filamento.registrado      ✅ (onRegistrarRequest → _registrar → publish)
registrar      → filamento.registrar.failed ✅ (par de fallo canónico, module.json)
decrementar    → filamento.decrementado     ✅ (onFilamentoUsado/onDecrementarRequest → _decrementar → publish)
decrementar    → filamento.bajo             ✅ (_decrementar → _detectarBajo → publish)
decrementar    → filamento.decrementar.failed ✅ (invariante 9: 404 / 409 LONGITUD_DESCONOCIDA)
listar         → (lectura) la vista re-lee, nunca recarga ✅
refresco       → filamento.registrado / filamento.decrementado / filamento.bajo /
                    filamento.decrementar.failed ✅
                 (cualquier mutación emite su señal; la vista re-lee el stock)
activar rollo (marcar activo) → ⚠️ [ABIERTO] sin op RPC ni evento en index.js
```

## Huecos reales (todos de UI, todos del rol jefe)

1. **Editor de alta de rollo** — panel-jefe: editor-bloque para `registrar` (tipo,
   color, longitud inicial + toggle "activo") con señal pareada
   `filamento.registrado`.
2. **Cinta del stock** — `cinta-estado` vía `listar` + badges `activo`/`bajo`
   (la vista viva del jefe: qué hay, qué está cargado, qué está por agotarse).

`[ABIERTO]` (decisiones del dueño, nombradas NO cerradas):
- (a) **Marcar/cambiar el rollo ACTIVO** — hoy solo en `registrar`, sin RPC propio.
- (b) **Configurar el umbral de filamento bajo** (hoy 5000mm fijo en el constructor).
- (c) **Longitud inicial** — declarada a mano vs inferida del fabricante.
- (d) **Ajuste manual de `longitud_restante`** — no hay op de corregir.
- (e) **Edición/borrado de rollos** — append-only hoy; retirar un rollo agotado.
- (f) **Fuente de verdad de "qué rollo está cargado"** — quién dispara `activo:true`.

## El deliverable hacia F7 (spec de construcción)

El panel del jefe para gestion-filamento = `GestionFilamentoJefePanel` compuesto por:
- Cinta de pulso (n rollos · m activo · k bajo umbral) vía `listar` + señal
  `filamento.bajo` como alerta reactiva.
- Cinta del stock (`listar`): tarjetas con tipo, color, longitud_restante,
  badge "activo" y badge "bajo".
- Botón "+ rollo" (editor-bloque de alta) — delega a `registrar`; incluye el
  toggle "activo".
- Detalle del rollo al tocar una tarjeta.
- Todas las mutaciones: emitir → señal refresca → la vista ES el feedback.

> **NOTA hacia F7 (sin materializar aquí):** `registrar` / `listar` son RPC
> request/response de filamento (`filamento.*.response`) — la vista emite el
> request y espera su par de señal. El `decrementar` NO es un gesto del panel del
> jefe (lo dispara la impresora por evento); el panel solo se REFRESCA con
> `filamento.decrementado`/`filamento.bajo`. NINGÚN `ui_handler` se materializa en
> module.json en este esquema (eso es del F7/registro).

## Puertos abiertos (cableables por el sitio)

- `fuente_del_stock` → hoy: `filamento.listar` (cinta del stock con activo/bajo)
- `escritor_del_stock` → hoy: `filamento.registrar` (custodio, única escritura
  directa del jefe; el decremento llega por evento `filamento.usado`)
- `señal_de_refresco` → hoy: `filamento.registrado` · `filamento.registrar.failed`
  · `filamento.decrementado` · `filamento.bajo` · `filamento.decrementar.failed`
- `origen_de_datos` → hoy: `filamento.usado` (la impresora reporta `filament_used`
  en mm → decrementa el rollo activo) y `project.activated` (restaura el store)

## Verificación contra index.js (agotado)

- **Handlers reales**: `onRegistrarRequest`, `onDecrementarRequest`,
  `onListarRequest`, `onFilamentoUsado` (fire-and-forget), `onProjectActivated` —
  todos presentes y mapeados (verify module.json `subscribes`).
- **`_registrar`**: valida `tipo`+`project_id` (400), id único (409
  `ALREADY_EXISTS`), `longitud_inicial` pasa a `null` (y `longitud_restante` a
  `null`) si no es número > 0; **`activo: input.activo === true`** (campo del
  registrar, no op propia); setea en el store, `marcarDirty`, emite
  `filamento.registrado`.
- **`_decrementar`**: valida `rollo_id`+`project_id` (400), rollo existe en el
  proyecto (404 `RESOURCE_NOT_FOUND`); `filament_used` mm >= 0 (400
  `INVALID_INPUT`); **Invariante 9**: si `longitud_restante === null` devuelve 409
  `LONGITUD_DESCONOCIDA` (→ `filamento.decrementar.failed`) SIN decrementar.
  Resta con piso 0 (`_decrementarStock`), detecta bajo (`_detectarBajo`, `<= 5000`),
  emite `filamento.decrementado` (+ `filamento.bajo` si procede).
- **`onFilamentoUsado`** (fire-and-forget): toma el rollo ACTIVO del proyecto y
  lo decrementa con el `filament_used` reportado; si no hay rollo activo,
  retorna sin efecto (honesto — no decrementa nada).
- **`_listar`**: devuelve `{filamentos[], total}`, cada rollo con `tipo`, `color`,
  `longitud_inicial`, `longitud_restante`, `activo`, `bajo` (derivado vs umbral).
- **`_rolloActivo(pid)`**: primer rollo del proyecto con `activo:true` (único de
  facto por re-escritura del Map al registrar).
- **Invariantes**: el decremento solo con rollo y longitud conocida (9); `tipo`+
  `project_id` obligatorios; color default `desconocido`; longitud no declarada =
  desconocida (no decrementable); umbral fijo 5000mm (configurable, pregunta
  abierta 5).
- **No hay op de marcar/cambiar activo ni de configurar el umbral ni de
  editar/borrar un rollo** — son [ABIERTO] de decisión del dueño, no defectos de
  la UI. El decremento a mano por el jefe NO existe por diseño (solo por evento de
  la impresora).
