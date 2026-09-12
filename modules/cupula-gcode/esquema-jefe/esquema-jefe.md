# Esquema maestro — cupula-gcode · ROL JEFE

> Sujeto: la cara de DECISIÓN de la cúpula de gcode para el dueño (JEFE).
> Objetivo: determinar **qué necesita ver/decidir el jefe sobre el almacén de
> gcode sliceado** (indexado por (modelo, material)) — o si, como caché interno,
> su cara es casi nula y el consumo real lo hace el ciclo de impresión por RPC.
> Método: esquematizador universal (prisma de 5 huecos) con lente de rol JEFE.
> Ley: agnosticismo (0 tecnologías nombradas en el análisis).
> Proyecto: 3d — taller personal de impresión 3D, uso propio, no vende (fase 0).
> Fuente de verdad del gcode: si un modelo no tiene gcode aquí, NO se puede
> imprimir (module.json `_doc`). Es la razón de ser del módulo y el matiz central
> de este esquema (invariante 3: gcode reusable — no reslicear en cada impresión).

## La lente JEFE aplicada a cupula-gcode

`cupula-gcode` es un **CUSTODIO** del proyecto 3D (reflejo JS): el **único escritor**
de su store de gcode (Map interno clave `${modeloId}::${material}`). Pero a
diferencia de `cola-impresion` (`entrar`/`reordenar`) o `catalogo-modelos`
(`registrar`), **cupula-gcode no es un módulo de decisión del negocio: es un
CACHÉ interno servido por RPC al ciclo de impresión**. Para el JEFE eso significa:

- **El almacén NO se declara a mano**: el jefe no escribe gcode. El gcode lo
  produce el pipeline de slicing (adaptador-slicing → ciclo) y el ciclo lo guarda
  en la cúpula vía `cupula.almacenar.request`. La escritura `almacenar` existe,
  pero en la práctica quien la dispara es el CICLO, no el jefe desde una UI.
- **Lo que al jefe le importa es el EFECTO, no la cúpula**: "si un modelo no tiene
  gcode aquí, no se puede imprimir" (invariante implícita del `_doc`). Eso es un
  problema de NEGOCIO visible como cola bloqueada / modelo no imprimible, NO una
  pantalla de gestión de un almacén de bytes.
- **La cara de información útil** (qué modelos tienen gcode cacheado, si un
  modelo es imprimible) **NO está servida por el módulo hoy**: no hay op de
  `listar`/`contar`; el store es un Map interno y las únicas proyecciones son
  `_buscar` (per-modelo, devuelve `encontrado: bool`) y `_almacenar`. No hay RPC
  que liste el caché → una vista de "estado del caché" no se puede montar desde
  este módulo solo con sus RPC actuales. Es un hueco de lectura [ABIERTO], no un
  defecto de la UI.
- **El par canónico está completo**: `cupula.almacenar.request` ↔
  `cupula.almacenar.failed` (rechaza gcode vacío/corrupto). El flujo cierra su
  círculo incluso cuando el jefe nunca toca la cúpula directamente.

```
CUPULA-GCODE · ROL JEFE (la cara es CASI NULA — no es un módulo de decisión)
│
├─ CONSUMO REAL (lo que hace el módulo) ─────────────── NO es cara del jefe
│   ├─ ciclo-impresion → _obtenerGcode llama cupula.buscar/almacenar por RPC
│   └─ el almacén se llena por el pipeline de slicing, no por teclado del jefe
│
├─ LO ÚNICO QUE AL JEFE LE IMPORTA ───────────────────── es un EFECTO, no una pantalla
│   └─ "¿este modelo TIENE gcode cacheado?" → si no, no se puede imprimir
│         · buscar (encontrado bool) alimenta esa pregunta — pero hoy la
│           responde el ciclo, no una vista del jefe
│
└─ VISTA DE IMPRIMIBILIDAD ──────────────────────────── [ABIERTO] sin op RPC hoy
    ├─ no hay RPC listar/contar el caché por proyecto
    └─ no se puede montar "estado del caché" desde las proyecciones actuales
```

## Los 3 principios de agilidad (lo que extrae el esquema)

1. **Frecuencia → jerarquía.** El jefe NO opera la cúpula a diario. El gesto de
   escribir (almacenar) y de leer (buscar) lo hace el ciclo de impresión, no la
   mano del dueño. No hay gesto frecuente que jerarquizar aquí.
2. **Ninguna operación recarga la vista.** Si algún día hay una vista de
   imprimibilidad, la refresca la señal del bus (`cupula.gcode_almacenado` /
   `cupula.almacenar.failed`), nunca una recarga.
3. **El caché se ve por su EFECTO, no por sus bytes.** El jefe no lee el almacén:
   lee "este modelo se puede imprimir / este modelo no". Esa proyección (estado de
   imprimibilidad) es la única forma con valor de negocio, y hoy no existe como RPC.

## El prisma de 5 huecos con lente JEFE (verificado contra index.js)

### 1 · IDENTIDAD — ¿Qué DECIDE el JEFE aquí?

- **Casi nada — la decisión de llenar/consultar la cúpula es del CICLO**, no del
  jefe. `almacenar` es una escritura del custodio (upsert + emite
  `cupula.gcode_almacenado`), y `buscar` una lectura (devuelve `encontrado`), pero
  ambas las invoca `ciclo-impresion` por RPC al obtener el gcode de un modelo.
- **La única decisión de fondo del dueño aquí es NEGOCIO, no caché**: que una
  pieza sin gcode (o sin .3mf para slicear) no se imprime — y enterarse de POR QUÉ
  su cola/impresión se detiene. Eso lo decide/ve el dueño en `ciclo-impresion` y
  `cola-impresion`, NO en una pantalla de cupula-gcode.
- **`project.activated`** (restaura persistencia) es neutro — sistema, no UI.

**Conclusión de identidad**: el rol JEFE de cupula-gcode no tiene DECISIÓN propia.
Su cara de decisión es **casi nula**; es un CACHÉ INTERNO con single-writer (la
cúpula) que se llena y se lee por RPC del ciclo. No hay "decisión del futuro de la
cúpula" que el jefe tome manualmente.

### 2 · RESTRICCIONES — ¿Qué NO depende del JEFE?

- **La cúpula es el ÚNICO escritor del store de gcode** (single-writer vía
  PosPersistencia). El jefe NO persiste, NO hidrata, NO decide el índice.
- **El gcode se indexa por (modelo, material)**: clave `${modeloId}::${material}`.
  Si la búsqueda no declara material, se cae a `material_por_defecto`; `_buscar`
  también prueba `material_por_defecto` como fallback. Es estructura interna del
  módulo (5.3 del esquema fase 2), no decisión del jefe.
- **Invariante 10 — el gcode corrupto/vacío NO se guarda**: `almacenar` rechaza
  (400) si `gcode` falta/vacío (motivo `gcode_vacio`) o si `trim().length < 16`
  (motivo `gcode_corrupto`), emite `cupula.almacenar.failed`. El juez de la
  calidad del byte es el MÓDULO, no la UI.
- **`project_id` y `modelo_id` son obligatorios** (400 si faltan) en ambos RPC —
  el módulo valida, no la UI.
- **`perfil` es opcional** con default `desconocido`; `material` opcional con
  default `material_por_defecto`. Los huecos se nombran, no se inventan.
- **El origen del gcode es el pipeline de slicing** (adaptador-slicing), NO la
  mano del jefe. `cupula.almacenar` lo llama el ciclo tras slicear.

### 3 · CONTRATO — ¿Qué necesita VER y qué SEÑAL confirma?

**VER (el jefe, en el mejor de los casos):**
- `cupula.buscar` (RPC per-modelo) — `encontrado: bool` → contesta "¿este modelo
  tiene gcode cacheado?". Es la ÚNICA lectura del módulo hacia el jefe, y hoy la
  usa el ciclo en `_obtenerGcode`, no una vista.
- No hay op de listar/contar el caché → el jefe no puede ver "qué tengo cacheado"
  con las RPC actuales. [ABIERTO].

**SEÑALES de confirmación (pareadas, verificadas en index.js):**
| Acción | Señal | Verificado |
|---|---|---|
| `almacenar` → éxito | `cupula.gcode_almacenado` | ✅ `onAlmacenarRequest → _almacenar → publish` |
| `almacenar` → fallo | `cupula.almacenar.failed` | ✅ par canónico (module.json; motivos `gcode_vacio`/`gcode_corrupto`) |
| `buscar` | (lectura) `{ encontrado: bool }` — sin señal | ✅ `onBuscarRequest → _buscar` |
| `project.activated` | (restaura persistencia) | ✅ neutro |

> Importante para el CONTRATO: incluso si se construyera una vista de
> imprimibilidad, el jefe no tiene una "acción de confirmar" aquí. La única señal
> de mutación (`cupula.gcode_almacenado`) la dispara el ciclo, no el dueño.

### 4 · NO-OBJETIVOS — ¿Qué caras NO son del jefe?

- **CLIENTE** (elegir/encargar pieza): NO existe — taller de uso propio, no vende (fase 0).
- **El pipeline de slicing / obtención de gcode** (`_obtenerGcode` de
  ciclo-impresion decide reutilizar vs slicear): es del CICLO, no del jefe ni de
  la cúpula. cupula-gcode solo almacena y devuelve.
- **SISTEMA**: persistencia, health — informa, no decide.
- **Gestión de modelos fuente, aprobación, filamento, historial**: módulos/caras
  aparte en el proyecto; la cúpula no las toca.
- **Editar/borrar/limpiar el caché**: el custodio es upsert-only (no hay op de
  delete ni de listar); no hay cara de jefe de "limpiar caché" hoy. [ABIERTO] si
  el dueño quisiera purgar gcode obsoleto.

### 5 · PREGUNTAS_ABIERTAS — huecos [ABIERTO] (se nombran, no se cierran)

- (a) **Vista de imprimibilidad / estado del caché** — no hay RPC `listar`/`contar`
  el gcode por proyecto. ¿Quiere el dueño ver "qué modelos tienen gcode cacheado"
  (p.ej. integrado en el panel de ciclo o en catalogo), o le basta saber por qué
  una pieza no arranca? Decisión de dueño — hoy la única lectura es `buscar`
  per-modelo.
- (b) **Almacenar manual** — ¿podría el jefe querer subir/re-almacenar un gcode a
  mano (p.ej. re-slicear con otro perfil y forzar overwrite)? Hoy `almacenar` es
  upsert por RPC del ciclo; no hay cara manual del jefe. Probablemente innecesario
  (el reslicing lo decide el ciclo), pero se nombra.
- (c) **Purgar/limpiar la cúpula** — no hay op de borrar o limpiar gcode viejo.
  ¿Overwrite implícito con `almacenar` basta, o hace falta un gesto de limpieza
  cuando se cambia de filamento/perfil? [ABIERTO].
- (d) **Límite/ocupación del caché** — la métrica `cupula-gcode.gcode.count`
  (gauge) existe en observabilidad, pero no hay lectura que la exponga al jefe ni
  política de retención. ¿Importa la ocupación? Taller pequeño de uso propio —
  probablemente no hoy. Se nombra.

## Veredicto del ÁRBITRO (lente-roles)

Pregunta árbitro: ¿decide el FUTURO del caché (escribe en el store vía custodio, o
decide su calidad) → JEFE · ¿opera el flujo (consulta si hay gcode / lo provee) →
TRABAJADOR/CICLO · ¿solo informa → NEUTRO?

| Op | Veredicto | Por qué |
|---|---|---|
| `almacenar` | **JEFE (escritura) — pero automatizada** | Es escritura del custodio (upsert + emite `cupula.gcode_almacenado`), de clase JEFE. PERO en la práctica la invoca el CICLO tras slicear (no el dueño a mano). No hay ruta UI donde el jefe teclee gcode. |
| `buscar` | neutro | Lectura pura `{ encontrado: bool }` — la usa el ciclo en `_obtenerGcode`; alimentaría una hipotética vista de imprimibilidad, no una decisión del jefe. |
| listar/contar caché | — (no existe) | Sin RPC de listar/contar. Cualquier "estado del caché" requeriría proyección nueva [ABIERTO]. |
| `project.activated` | neutro | Restaura persistencia — sistema, no UI. |

**Veredicto honesto**: el PANEL del jefe para cupula-gcode es **casi NULO**. No hay
hoja-jefe de declaración que el dueño use a diario (almacenar es del ciclo), ni
hoja-jefe de corrección (no hay reordenar/editar), y la única lectura útil
(`buscar`, imprimibilidad) no está expuesta como listado. **No se materializa un
`cupula-gcode` como módulo de panel para el jefe.** Lo que el dueño necesita ver
(imprimibilidad) pertenece a la vista de CICLO/COLA (por qué una pieza no arranca)
o al detalle de CATALOGO ("este modelo tiene gcode?") — no a un panel de la cúpula.

## Composición de la vista del jefe (3 capas)

```text
1. SELECCIONAR  — (no aplica): no hay ref de entidades de la cúpula que el
                  jefe elija desde un list (no hay listar).
2. INFORMARSE   — la única lectura es buscar (per-modelo, encontrado: bool).
                  No basta para montar una vista de caché → [ABIERTO].
3. DECLARAR     — NO HAY hojas-jefe de declaración que el dueño use a mano.
                  almacenar es del ciclo; no hay editor del jefe en este módulo.
```

**Frecuencia → jerarquía**: ninguna operación del jefe a diario en la cúpula.
El gesto rey (si existiera) sería "saber si un modelo es imprimible", y esa
respuesta hoy la da el ciclo. No hay jerarquía de gestos que diseñar.

## Formas UI canónicas (disección)

| Hoja (órgano) | Forma canónica | Nota |
|---|---|---|
| Vista de imprimibilidad (por modelo) | `cinta-estado`/informe | `buscar` (`encontrado: bool`) — "este modelo tiene gcode" · [ABIERTO] sin listar; hoy se consume en el detalle del modelo (catalogo) o el ciclo |
| Estado del caché / "qué tengo cacheado" | `cinta-estado` | NO construible con las RPC actuales (sin listar/contar) → [ABIERTO] si el dueño la quiere |
| Almacenar/reeslicear gcode (JEFE) | `confirmador-nombrado` | [ABIERTO] — hoy lo hace el ciclo por RPC; no hay cara manual del dueño |

**Ninguna hoja-jefe de DECLARACIÓN madura aquí** (sin escribir a mano, sin
decisión de corrección). El único `señal-refresh` del módulo (`cupula.gcode_almacenado`)
dispara el ciclo, no una vista del jefe.

## Señales pareadas por hoja de declaración (verificadas en index.js)

Regla: sin señal, hoja inmadura. Nombres REALES de los publishers del módulo:

```text
almacenar → cupula.gcode_almacenado  ✅ (onAlmacenarRequest → _almacenar → publish)
almacenar → cupula.almacenar.failed   ✅ (par canónico de fallo; motivos)
buscar    → (lectura) sin señal       ✅ (onBuscarRequest → _buscar → encontrando bool)
refresco  → cupula.gcode_almacenado   ✅ (lo dispara el CICLO, no el jefe)
```

## Huecos reales (todos de UI, todos candidatos de lectura del rol jefe)

1. **Estado de imprimibilidad / caché por modelo** — `buscar` da `encontrado`,
   pero no hay listar/contar para montar "qué tengo cacheado". Si el dueño quiere
   verlo, la proyección debe existir (proyección de lectura del single-writer).

`[ABIERTO]` (decisiones del dueño, nombradas NO cerradas):
- (a) Vista de imprimibilidad/estado del caché — sin RPC de listar hoy.
- (b) Almacenar/re-slicear manual — probablemente innecesario; el ciclo lo decide.
- (c) Purgar/limpiar la cúpula — sin op de borrado; overwrite implícito basta hoy.
- (d) Ocupación/límite del caché — existe gauge `gcode.count` pero sin lectura ni
  política de retención; taller pequeño lo hace no-crítico hoy.

## El deliverable hacia F7 (spec de construcción)

**NO hay un `CupulaGcodeJefePanel`.** La cara del jefe para cupula-gcode es casi
nula y se DECLARA AUSENTE de forma deliberada (no se inventa necesidad donde no la
hay). Concretamente para F7:

- **No materializar un módulo de panel para cupula-gcode.** El almacén se llena y
  se consulta por RPC del ciclo (`cupula.almacenar/buscar.request`).
- Lo que el dueño ve de la cúpula se expone **donde ya vive el contexto de negocio**:
  - en `ciclo-impresion`: por qué una pieza no arranca (falta gcode / falta .3mf).
  - en `catalogo-modelos` (detalle del modelo): "¿este modelo tiene gcode?"
    — consumiendo `buscar` como origen de datos, NO como módulo de panel.
- Si el dueño declara querer una vista de "qué tengo cacheado", se añade una
  proyección de lectura (listar/contar) al custodio y entonces sí un sub-panel,
  pero es decisión de dueño [ABIERTO], no un requisito de este esquema.

> **NOTA hacia F7 (sin materializar aquí):** ningún `ui_handler` se añade a
> module.json en este esquema — ni siquiera para exponer `buscar` como lectura de
> una vista futura. Eso es del F7/registro y solo si el dueño cierra (a).

## Puertos abiertos (cableables por el sitio)

- `consumidor_del_caché` → `ciclo-impresion._obtenerGcode` (RPC
  `cupula.buscar/almacenar.request`) — el consumidor real de la cúpula.
- `lectura_de_imprimibilidad` → hoy: `cupula.buscar` (`encontrado: bool`), vía RPC
  desde catalogo detalle o ciclo; NO hay listar (hueco que el sitio cablearía si el
  dueño cierra (a)).
- `señal_de_refresco` → `cupula.gcode_almacenado` + `cupula.almacenar.failed`
  (disparadas por el ciclo, no por una UI del jefe).
- `origen_de_datos` → el pipeline de slicing (ciclo/adaptador-slicing) que produce
  el gcode y lo almacena; `project.activated` restaura el store.

## Verificación contra index.js (agotado)

- Handlers reales: `onAlmacenarRequest` (→ `_almacenar`), `onBuscarRequest`
  (→ `_buscar`), `onProjectActivated` — las DOS únicas operaciones de negocio, más
  la restauración de persistencia. **No hay `listar`, `contar`, `delete`, `update`**
  (solo upsert en `almacenar`).
- `_almacenar`: valida `project_id`/`modelo_id` (400); rechaza `gcode` ausente/
  vacío (motivo `gcode_vacio`, 400) y < 16 chars (motivo `gcode_corrupto`, 400);
  indexa por clave `${modeloId}::${material || material_por_defecto}`; `perfil`
  default `desconocido`; marca `sliceado_en` y `actualizado_en`; emite
  `cupula.gcode_almacenado` y devuelve `{ reutilizable: true }`.
- `_buscar`: valida `project_id`/`modelo_id` (400); si no hay store → `encontrado:false`;
  busca por clave exacta o `material_por_defecto` como fallback; devuelve
  `{ encontrado, gcode }` o vacío. Es lectura pura, sin señal.
- Store: `Map<project_id, Map<clave, Gcode>>` interno — NO expuesto a listar.
  Persistencia single-writer vía PosPersistencia (json-file-per-project `3d/cupula-gcode`).
- Par canónico: `cupula.almacenar.failed` con motivos reales `gcode_vacio`/
  `gcode_corrupto` (module.json `events.publishes` + `_almacenar`).
- **Confirmado: cupula-gcode es un CACHÉ INTERNO servido por RPC; su cara de
  jefe es casi nula.** Las dos operaciones las invoca `ciclo-impresion` por RPC,
  no el dueño desde una UI — por eso este esquema declara AUSENTE el panel del
  jefe en vez de inventar una interfaz que el módulo no pide.
