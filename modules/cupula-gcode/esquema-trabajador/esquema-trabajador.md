# Esquema maestro — cupula-gcode · ROL TRABAJADOR / OPERADOR

> Sujeto: la cara de **operación física del taller** de la cúpula de gcode para el
> **trabajador/operador** (quien prepara la impresora y vigila el ciclo de impresión).
> Objetivo: determinar **qué necesita ver/consultar el operador sobre el almacén de
> gcode sliceado** (indexado por (modelo, material)) para operar físicamente la
> máquina — **o si, como CACHÉ INTERNO del ciclo, su cara aquí es CASI NULA y la
> operación real vive en ciclo/cola**, no en esta cúpula.
> Método: esquematizador universal (prisma de 5 huecos) con lente de rol TRABAJADOR.
> Ley: agnosticismo (0 tecnologías nombradas en el análisis).
> Proyecto: 3d — taller personal de impresión 3D, uso propio, no vende (fase 0).
> Fuente de verdad del gcode: si un modelo no tiene gcode aquí, NO se puede imprimir
> (module.json `_doc`). Es la razón de ser del módulo — pero el TRABAJADOR **no opera
> la cúpula: el que decide reutilizar vs slicear es el ciclo, y el que vigila la pieza
> física es el operador en `ciclo-impresion`/`cola-impresion`.

## La lente TRABAJADOR aplicada a cupula-gcode (contraste con el JEFE)

Para el **JEFE**, `cupula-gcode` es donde el esquema-jefe ya determinó un **CACHÉ INTERNO
sin cara de decisión** (el jefe no escribe gcode; lo escribe el ciclo tras slicear). Para el
**TRABAJADOR/operador**, el mismo módulo es todavía más invisible: la operación física del
taller (preparar filamento, vigilar la pieza que imprime, retirar la pieza) vive en
`ciclo-impresion` y `cola-impresion`, NO en la cúpula de gcode.

Contraste honesto con la lente JEFE (y con la lente TRABAJADOR de módulos operativos reales
como `cola-impresion`): el jefe **decide y ve el panorama** (pero en cupula-gcode tampoco —
cara casi nula también para el jefe); el trabajador, en un módulo operativo, **EJECUTA lo
físico y ve lo concreto de la cinta** (qué pieza está en marcha, qué sigue, qué material lleva).
En cupula-gcode **no hay cinta, no hay piezas en curso, no hay material cargado a la vista** —
hay un almacén interno de bytes de gcode servido por RPC al ciclo. Ese almacén **no se opera
ni se vigila desde una UI del trabajador**.

```
CUPULA-GCODE · ROL TRABAJADOR (la cara es CASI NULA — no es un módulo operativo)
│
├─ CONSUMO REAL (lo que hace el módulo) ─────────────── NO es cara del trabajador
│   ├─ ciclo-impresion → _obtenerGcode llama cupula.buscar/almacenar por RPC
│   └─ el almacén se llena por el pipeline de slicing, no por gestos del operador
│
├─ LO QUE AL OPERADOR LE IMPORTA ─────────────────────── es un EFECTO, no una pantalla
│   └─ "¿podemos imprimir esta pieza ya?" → la responde el CICLO, no una vista de la cúpula
│         · si falta gcode → la pieza no arranca → el operador lo ve en ciclo/cola
│         · vigilar la pieza física (filamento, progreso, retirar) = ciclo/cola
│
└─ VISTA DE OPERACIÓN / VIGILANCIA ───────────────────── AUSENTE por diseño
    ├─ no hay cinta que vigilar (sin listar/contar el caché con las RPC actuales)
    ├─ no hay gesto de escritura del operador (no sube gcode a mano)
    └─ se DECLARA AUSENTE: no se inventa una interfaz que el módulo no pide
```

## Los 3 principios de agilidad (qué extrae el esquema, lente trabajador)

1. **El operador NO opera la cúpula — opera el CICLO.** La preparación física (rollo puesto,
   máquina lista para la siguiente pieza) se lee de la cinta de `cola-impresion` y del progreso
   de `ciclo-impresion`, NO de un almacén interno de gcode. cupula-gcode no participa en el
   gesto físico del taller.
2. **El gcode se consume por su EFECTO, no por sus bytes.** El operador no lee un almacén de
   contenido gcode: lee "esta pieza está lista para imprimir" (la contesta el ciclo con
   `buscar`) o "la máquina está ocupada con X" (la contesta el ciclo/cola). La cúpula es
   infraestructura intermedia, no una superficie que el operador toque.
3. **Sin lectura ni escritura del trabajador aquí — la cara es casi nula.** Las dos únicas
   operaciones (`almacenar`, `buscar`) las dispara **el ciclo por RPC**, no la mano del
   operador. Para el trabajador, este módulo es transparente: no hay listado, no hay gesto de
   vigilancia, no hay decisión física que tome contra la cúpula.

## El prisma de 5 huecos con lente TRABAJADOR (verificado contra index.js)

### 1 · IDENTIDAD — ¿Qué VIGILA/CONSULTA el TRABAJADOR aquí?

- **Casi nada — y lo poco útil lo consume el CICLO, no el operador.** `buscar` (→ `_buscar`)
  es la única lectura (`{encontrado: bool}`), pero responde "¿este modelo tiene gcode
  cacheado?" — una pregunta que **decide el cicle** (`_obtenerGcode` decide reutilizar vs
  slicear), no una que el operador formule mirando una pantalla. El trabajador no hace
  "buscar gcode de X": el ciclo lo hace por él.
- **`almacenar` (→ `_almacenar`) NO es del trabajador** — es la escritura del CUSTODIO que
  invoca **el ciclo por RPC** tras slicear. El operador no sube gcode a mano, ni tiene por qué:
  no hay gesto de "subir el gcode de la pieza que voy a imprimir" en un taller donde el
  slicing lo produce el pipeline automáticamente.
- **NEUTRO**: `project.activated` (restaura persistencia — sistema, no UI).
- **NO existe op de listar/contar el caché** → no hay forma de que el trabajador monte un
  "estado del caché / qué modelos tienen gcode" desde las proyecciones actuales. Hueco [ABIERTO].

**Conclusión de identidad**: el rol TRABAJADOR/operador de cupula-gcode **no tiene qué
VIGILAR ni CONSULTAR aquí**. El módulo es un CACHÉ INTERNO del ciclo (single-writer vía
PosPersistencia) que se llena y se lee por RPC, y la operación física del taller vive en
`ciclo-impresion`/`cola-impresion`. La cara del trabajador es **casi nula**.

### 2 · RESTRICCIONES — ¿Qué NO depende del TRABAJADOR?

- **`almacenar` NO es del trabajador** — escritura del CUSTODIO del JEFE (upsert + emite
  `cupula.gcode_almacenado`), disparada por el CICLO tras slicear. El operador no escribe gcode.
- **`buscar` NO es del trabajador** — lectura del CICLO en `_obtenerGcode` (reutilizar vs
  slicear). El operador no consulta la cúpula para preparar la máquina.
- **La cúpula es el ÚNICO escritor del store** (single-writer vía PosPersistencia) — el
  trabajador NO persiste, NO hidrata, NO decide el índice `(modelo, material)`.
- **Invariante 10 — gcode vacío/corrupto NO se guarda**: `_almacenar` rechaza (400) si `gcode`
  falta/vacío (motivo `gcode_vacio`) o `trim().length < 16` (motivo `gcode_corrupto`), emite
  `cupula.almacenar.failed`. El juez del byte es el MÓDULO, garantizado para el ciclo, no una
  decisión del operador.
- **`project_id`/`modelo_id` obligatorios** (400 si faltan) en ambos RPC — valida el módulo.
- **El origen del gcode es el pipeline de slicing** (adaptador-slicing → ciclo), NO la mano
  del operador. `cupula.almacenar` lo llama el ciclo tras slicear.

### 3 · CONTRATO — ¿Qué necesita VER y qué SEÑAL confirma?

**VER (el trabajador/operador, en el mejor de los casos):**
- **Prácticamente NADA del módulo.** El único dato útil (`buscar` → `encontrado: bool`, que
  contesta "¿este modelo TIENE gcode cacheado?") lo consume el CICLO en `_obtenerGcode`, no
  una vista del operador. La preparación física del taller se lee de la CINTA de la cola y del
  PROGRESO del ciclo, no de la cúpula.
- No hay op de listar/contar el caché → el trabajador no puede ver "qué tengo cacheado" con
  las RPC actuales. [ABIERTO] — y aun así, no es un dato que el operador necesite para operar
  la impresora.

**SEÑALES de confirmación (pareadas, verificadas en index.js):**
| Acción | Señal | Verificado |
|---|---|---|
| `almacenar` → éxito | `cupula.gcode_almacenado` | ✅ `onAlmacenarRequest → _almacenar → publish` (la dispara el CICLO, no el operador) |
| `almacenar` → fallo | `cupula.almacenar.failed` | ✅ par canónico (module.json; motivos `gcode_vacio`/`gcode_corrupto`) |
| `buscar` | (lectura) `{ encontrado: bool }` — sin señal | ✅ `onBuscarRequest → _buscar` |
| `project.activated` | (restaura persistencia) | ✅ neutro |

> Importante para el CONTRATO: **no hay señal que el trabajador dispare** aquí. Las únicas
> señales de mutación (`cupula.gcode_almacenado`, `cupula.almacenar.failed`) las emite el
> CICLO al escribir, nunca el operador desde una UI.

### 4 · NO-OBJETIVOS — ¿Qué caras NO son del trabajador?

- **CLIENTE** (elegir/encargar pieza): NO existe — taller de uso propio, no vende (fase 0).
- **La pieza física / vistazo de impresión** (`ciclo-impresion`): vigilar progreso, filamento,
  tiempo restante, fallo de impresión — es del CICLO, la cara operativa real del trabajador.
- **La cinta / preparación del material** (`cola-impresion`): qué pieza viene, qué material
  lleva, cuántas pendientes — es de la COLA, para preparar el rollo.
- **El pipeline de slicing / obtención de gcode** (`_obtenerGcode` del ciclo decide reutilizar
  vs slicear): es del CICLO, no de la cúpula ni del operador. cupula-gcode solo almacena y
  devuelve.
- **SISTEMA**: persistencia, health — informa, no opera.
- **Editar/borrar/limpiar el caché, subir gcode a mano, re-slicear forzando overwrite**: no hay
  op del operador (upsert-only del ciclo); no hay cara de trabajador de "gestionar el almacén".
  [ABIERTO] si el dueño quisiera purgar gcode obsoleto — pero es decisión de dueño, no tarea
  de operador.

### 5 · PREGUNTAS_ABIERTAS — huecos [ABIERTO] (se nombran, no se cierran)

- (a) **Vista de imprimibilidad / estado del caché** — no hay RPC `listar`/`contar` el gcode
  por proyecto. ¿Quiere el dueño ver "qué modelos tienen gcode cacheado" (integrado en el ciclo
  o en catalogo)? Decisión de dueño; **el operador no la necesita** — para él basta saber en
  ciclo/cola por qué una pieza no arranca. Hoy la única lectura es `buscar` per-modelo.
- (b) **Subir/re-almacenar gcode a mano (operador)** — hoy `almacenar` es upsert del CICLO;
  no hay cara manual, ni del operador ni del jefe. Probablemente innecesario (el reslicing lo
  decide el ciclo), se nombra.
- (c) **Purgar/limpiar la cúpula** — no hay op de borrado; overwrite implícito con `almacenar`
  basta hoy. Es decisión de DUEÑO, no gesto de operador.
- (d) **Ocupación/límite del caché** — existe gauge `cupula-gcode.gcode.count` en
  observabilidad pero sin lectura ni política de retención; taller pequeño lo hace no-crítico.
  Operativamente irrelevante para el trabajador.

## Veredicto del ÁRBITRO (lente-roles)

Pregunta árbitro: ¿decide el FUTURO del caché (escribe en el store vía custodio, o decide su
calidad) → JEFE · ¿opera el flujo (consulta si hay gcode / lo provee / vigila la pieza física)
→ TRABAJADOR/CICLO · ¿solo informa → NEUTRO?

| Op | Veredicto | Por qué |
|---|---|---|
| `almacenar` | **JEFE (escritura) — pero automatizada** | Escritura del custodio (upsert + emite `cupula.gcode_almacenado`), de clase JEFE. PERO la invoca el CICLO tras slicear, no el operador ni el dueño a mano. No hay ruta de operador que teclee gcode. |
| `buscar` | neutro (operación del CICLO) | Lectura pura `{ encontrado: bool }` — la usa el ciclo en `_obtenerGcode` para decidir reutilizar vs slicear. NO es un gesto que el trabajador formule contra una vista. |
| listar/contar caché | — (no existe) | Sin RPC de listar/contar. Cualquier "estado del caché" requeriría proyección nueva [ABIERTO] — pero no es dato del operador. |
| `project.activated` | neutro | Restaura persistencia — sistema, no UI. |

**Veredicto honesto**: el PANEL del trabajador/operador para cupula-gcode es **casi NULO**.
No hay cinta que vigilar (sin listar/contar), no hay gesto de escritura (almacenar es del
ciclo), y la única lectura útil (`buscar`, imprimibilidad) la consume el CICLO, no una vista
del operador. **No se materializa un `CupulaGcodeTrabajadorPanel`.** La operación física del
taller la ve el trabajador en CICLO (progreso de la pieza) y en COLA (qué viene, qué material),
NO en una pantalla de la cúpula.

## Composición de la vista del trabajador (3 capas)

```text
1. SELECCIONAR  — (no aplica): no hay ref de entidades de la cúpula que el operador elija
                  desde un list (no hay listar).
2. INFORMARSE   — la única lectura es buscar (per-modelo, encontrado: bool), y la hace el
                  CICLO, no el operador. No basta para montar una vista de caché, y el
                  operador no la necesita → [ABIERTO], decisión de dueño.
3. DECLARAR     — NO HAY hoja de operación del trabajador: ni escribir gcode, ni
                  reordenar, ni disparar nada. almacenar es del ciclo; no hay gesto del
                  operador en este módulo.
```

**Frecuencia → jerarquía**: ninguna operación del trabajador a diario en la cúpula. El gesto
rey del operador ("¿está lista la pieza / qué viene?") lo responden CICLO y COLA, no esta
cúpula. No hay jerarquía de gestos que diseñar.

## Formas UI canónicas (disección)

| Hoja (órgano) | Forma canónica | Nota |
|---|---|---|
| Progreso de la pieza en curso / filamento / tiempo restante | (del CICLO, no de la cúpula) | La vigilancia física del taller vive en `ciclo-impresion`; cupula-gcode no participa. |
| Cinta de la cola / qué viene / qué material | (de la COLA, no de la cúpula) | La preparación del material vive en `cola-impresion`; cupula-gcode no participa. |
| Estado del caché / "qué modelos tienen gcode" | `cinta-estado` | NO construible con las RPC actuales (sin listar/contar) → [ABIERTO] decisión de dueño; el operador no la necesita. |
| Subir/re-almacenar gcode a mano | `formulario-puntual` | [ABIERTO] — hoy lo hace el ciclo por RPC; no hay cara manual del operador (ni del jefe). |

**Ninguna hoja de DECLARACIÓN del trabajador madura aquí** (sin escribir, sin vigilar, sin
disparar). Las únicas señales de mutación (`cupula.gcode_almacenado`, `cupula.almacenar.failed`)
las dispara el CICLO, no una vista del operador.

## Señales pareadas por hoja de declaración (verificadas en index.js)

Regla: sin señal, hoja inmadura. Nombres REALES de los publishers del módulo:

```text
almacenar → cupula.gcode_almacenado  ✅ (onAlmacenarRequest → _almacenar → publish) — lo dispara el CICLO
almacenar → cupula.almacenar.failed   ✅ (par canónico de fallo; motivos)              — lo dispara el CICLO
buscar    → (lectura) sin señal       ✅ (onBuscarRequest → _buscar → encontrado: bool) — lo hace el CICLO en _obtenerGcode
refresco  → cupula.gcode_almacenado   ✅ (nunca lo dispara una vista del operador)
```

## Huecos reales (todos de UI, todos candidatos de lectura, ninguno exigido por el operador)

1. **Estado de imprimibilidad / caché por modelo** — `buscar` da `encontrado`, pero no hay
   listar/contar para montar "qué tengo cacheado". Si el DUEÑO quiere verlo (no el operador),
   la proyección de lectura debe existir. [ABIERTO], decisión de dueño.

`[ABIERTO]` (decisiones del dueño, nombradas NO cerradas — ninguna es tarea del operador):
- (a) Vista de imprimibilidad/estado del caché — sin RPC de listar hoy.
- (b) Subir/re-almacenar gcode a mano (operador o jefe) — probablemente innecesario; el cicle
  lo decide.
- (c) Purgar/limpiar la cúpula — sin op de borrado; overwrite implícito basta hoy.
- (d) Ocupación/límite del caché — existe gauge `gcode.count` pero sin lectura ni política de
  retención; taller pequeño lo hace no-crítico y operativamente irrelevante.

## El deliverable hacia F7 (spec de construcción)

**NO hay un `CupulaGcodeTrabajadorPanel`.** La cara del trabajador/operador para cupula-gcode
es casi nula y se DECLARA AUSENTE de forma deliberada (no se inventa necesidad donde no la
hay). Concretamente para F7:

- **No materializar un módulo de panel para cupula-gcode.** El almacén se llena y se consulta
  por RPC del ciclo (`cupula.almacenar/buscar.request`); el operador no lo toca.
- La operación física del taller se ve **donde ya vive el contexto del operador**:
  - en `ciclo-impresion`: el progreso de la pieza en curso (filamento, tiempo, fallo).
  - en `cola-impresion`: qué pieza viene, qué material lleva, cuántas pendientes (para
    preparar el rollo).
- Lo que la cúpula aporta al operador es **solo como dato de origen**: "¿esta pieza tiene
  gcode?" lo responde `buscar` y lo decide el CICLO para arrancar la pieza — no es una vista
  de un panel de la cúpula.
- Si el DUEÑO declara querer una vista de "qué tengo cacheado", se añade una proyección de
  lectura (listar/contar) al custodio y entonces sí un sub-panel, pero es decisión de dueño
  [ABIERTO], no un requisito de este esquema ni del operador.

> **NOTA hacia F7 (sin materializar aquí):** ningún `ui_handler` se añade a module.json en
> este esquema — ni siquiera para exponer `buscar` como lectura de una vista futura. Eso es
> del F7/registro y solo si el dueño cierra (a).

## Puertos abiertos (cableables por el sitio)

- `consumidor_del_caché` → `ciclo-impresion._obtenerGcode` (RPC
  `cupula.buscar/almacenar.request`) — el consumidor real de la cúpula; el ciclo decide
  reutilizar vs slicear.
- `lectura_de_imprimibilidad` → hoy: `cupula.buscar` (`encontrado: bool`), vía RPC desde ciclo
  o catalogo detalle; NO hay listar (hueco que el sitio cablearía si el dueño cierra (a)).
- `señal_de_refresco` → `cupula.gcode_almacenado` + `cupula.almacenar.failed` (disparadas por
  el ciclo, no por una UI del operador).
- `origen_de_datos` → el pipeline de slicing (ciclo/adaptador-slicing) que produce el gcode y
  lo almacena; `project.activated` restaura el store.
- `superficie_operativa_del_taller` → `ciclo-impresion` / `cola-impresion` (donde el operador
  vigila la pieza física y prepara el material) — NO en la cúpula.

## Verificación contra index.js (agotado)

- Handlers reales: `onAlmacenarRequest` (→ `_almacenar`), `onBuscarRequest` (→ `_buscar`),
  `onProjectActivated` — las DOS únicas operaciones de negocio, más la restauración de
  persistencia. **No hay `listar`, `contar`, `delete`, `update`** (solo upsert en `almacenar`).
- `_almacenar`: valida `project_id`/`modelo_id` (400); rechaza `gcode` ausente/vacío (motivo
  `gcode_vacio`, 400) y < 16 chars (motivo `gcode_corrupto`, 400); indexa por clave
  `${modeloId}::${material || material_por_defecto}`; `perfil` default `desconocido`; marca
  `sliceado_en` y `actualizado_en`; emite `cupula.gcode_almacenado` y devuelve
  `{ reutilizable: true }`.
- `_buscar`: valida `project_id`/`modelo_id` (400); si no hay store → `encontrado:false`;
  busca por clave exacta o `material_por_defecto` como fallback; devuelve
  `{ encontrado, gcode }` o vacío. Es lectura pura, sin señal.
- Store: `Map<project_id, Map<clave, Gcode>>` interno — NO expuesto a listar. Persistencia
  single-writer vía PosPersistencia (json-file-per-project `3d/cupula-gcode`).
- Par canónico: `cupula.almacenar.failed` con motivos reales `gcode_vacio`/`gcode_corrupto`
  (module.json `events.publishes` + `_almacenar`).
- **Confirmado: cupula-gcode es un CACHÉ INTERNO servido por RPC; su cara de trabajador es
  casi nula.** Las dos operaciones las invoca `ciclo-impresion` por RPC, no el operador desde
  una UI — por eso este esquema declara AUSENTE el panel del trabajador en vez de inventar una
  interfaz que el módulo no pide. La operación física del taller vive en CICLO/COLA.
