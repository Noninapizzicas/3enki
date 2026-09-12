# Esquema maestro — busqueda-repositorios · ROL TRABAJADOR

> Sujeto: la cara de OPERACIÓN del buscador multi-repositorio de modelos 3D para
> el trabajador/operador del taller personal de impresión 3D.
> Objetivo: determinar **qué necesita ver/operar el trabajador sobre la búsqueda
> de modelos 3D en repositorios externos** (Printables, MakerWorld, Cults3D,
> Thingiverse) — o si, como frontera de formato SIN estado cuyo consumo real
> pertenece al flujo de decisión, su cara es **casi nula** y el operador no opera
> ningún panel del conversor.
> Método: esquematizador universal (prisma de 5 huecos) con lente de rol TRABAJADOR.
> Ley: agnosticismo (0 tecnologías nombradas en el análisis).
> Proyecto: 3d — taller personal de impresión 3D, uso propio, no vende (fase 0).
> Fuente de verdad: este módulo ES SOLO una frontera de formato (module.json
> `_doc`): no descarga, no importa, no decide. Busca por `query` en repos externos
> y normaliza los resultados. SIN estado, SIN red en su runtime: el puerto
> `buscar(query)` se cablea con ADAPTADORES inyectados en el puente.

## La lente TRABAJADOR aplicada a busqueda-repositorios

`busqueda-repositorios` es un **CONVERSOR puro** del proyecto 3D (reflejo JS):
una **frontera de formato multi-fuente**. Para el rol TRABAJADOR/OPERADOR, el
análisis corre paralelo al del jefe pero con un matiz decisivo: **el trabajador
NO busca ni importa modelos por su cuenta.** Buscar "qué hay disponible para X
pieza" es un gesto PUNTUAL que pertenece al flujo de decisión del jefe (elegir
algo para importarlo), no a un operador que sostenga una pantalla de
busqueda-repositorios. Concretamente, para el trabajador:

- **No hay nada que OPERAR aquí.** El módulo expone UN solo RPC (`buscar`) que es
  una lectura/transformación pura de frontera. No hay tareas recurrentes, no hay
  cola de cosas pendientes, no hay items que "atender", no hay estado que
  supervisar. Un operador ejecuta, repara, mide, desbloquea — aquí no existe
  ninguno de esos verbos de operación.
- **El trabajador no tiene "trabajo" sobre el conversor.** No desbloquea
  repositorios caídos (eso es del puente/adaptadores en el PC), no re-intenta una
  query, no gestiona resultados (no hay listados guardados: stateless), no
  alimenta ni corrige datos.
- **"Buscar" es una consulta de lectura, no una operación de taller.** La
  distinción jefe/trabajador del esquema-jefe ya lo resolvió: `buscar` es neutro
  (operación de frontera) — la usa quien decide importar. Para el TRABAJADOR,
  además, ese gesto puntual no es un "trabajo a operar": es una lectura que otro
  flujo dispara.
- **El par canónico está completo**: `busqueda.buscar.request` ↔
  `busqueda.buscar.failed` (query_vacia | todos_los_repositorios_caidos). Cierra
  su círculo aunque nadie toque al conversor. La garantía (invariante 12) — un
  repositorio caído no rompe la búsqueda — protege al dueño cuando un repo externo
  va mal, y es exactamente lo que el operador NO tiene que vigilar como tarea:
  la robustez ya está en el conversor.

```
BUSQUEDA-REPOSITORIOS · ROL TRABAJADOR (CONVERSOR — la cara es CASI NULA)
│
├─ CONSUMO REAL (lo que hace el módulo) ─────────────── NO es cara del trabajador
│   ├─ es SOLO frontera de formato: buscar(query) → [resultados] normalizados
│   ├─ sin estado, sin persistencia, sin red en su runtime
│   └─ los adaptadores reales (APIs de repos) se cablean en el puente del PC
│
├─ LO QUE UN OPERADOR "TRABAJARÍA" AQUÍ ─────────────── NO existe
│   ├─ no hay tareas de operación (ejecutar/desbloquear/medir/atender)
│   ├─ no se busca/importa por cuenta del trabajador (eso es del jefe/flujo)
│   └─ sin listados, sin historial, sin cola — nada que operar sobre el conversor
│
└─ VISTA DE "RESULTADOS DE BÚSQUEDA" ─────────────────── sin estado → NO construible
    ├─ no hay listar/guardar/historial (conversor stateless)
    └─ no se puede montar una vista de "búsquedas guardadas" desde sus RPC
```

## Los 3 principios de agilidad (lo que extrae el esquema)

1. **Frecuencia → jerarquía.** No hay gesto frecuente de un operador que
   jerarquizar: el conversor tiene UN solo RPC (`buscar`) y ese es un gesto
   esporádico del jefe (cuando necesita una pieza nueva), no del trabajador. No
   hay jerarquía de tareas de operación porque no hay tareas de operación.
2. **Ninguna operación recarga la vista.** Si algún día una búsqueda se expone en
   una UI, el resultado llega por la respuesta correlada
   (`busqueda.buscar.response`), nunca por recarga ni por estado guardado — y para
   el trabajador ese patrón no cambia nada: no hay vista que él mantenga.
3. **El conversor se ve por su RESULTADO, no por su formato.** Ni el jefe ni el
   trabajador leen "este conversor normalizó N repositorios": leen "para 'conector
   M5' hay 3 modelos en Printables y 1 en MakerWorld". Esa proyección (resultados
   unificados) pertenece al flujo que decide importar; el trabajador no la opera.

## El prisma de 5 huecos con lente TRABAJADOR (verificado contra index.js)

### 1 · IDENTIDAD — ¿Qué hace/opera el TRABAJADOR aquí?

- **Casi nada — y ese "casi nada" es una ausencia estructural, no un pendiente.**
  `buscar` (→ `_buscar`) es el ÚNICO RPC: toma una query (más `repositorios`
  opcional) y devuelve `[resultados]` unificados. No hay op para declarar,
  corregir, ejecutar una tarea, ni desbloquear nada. El trabajador no tiene una
  sola acción operativa sobre este módulo.
- **No hay "trabajo" que el operador atienda.** Sin estado → sin cola, sin
  pendientes, sin listados que supervisar. El verbo del operario (atender,
  desbloquear, medir, alimentar) no tiene objeto aquí.
- **La búsqueda en sí es un gesto puntual del jefe, no del trabajador.** Buscar
  "qué existe para X" y decidir importarlo pertenece al flujo de decisión
  (jefe/importacion-modelo). El trabajador no la inicia ni la sostiene.
- **`project.activated`** (si existiera) sería neutro — pero aquí NO hay handler
  de restauración porque no hay estado [ver verificación].

**Conclusión de identidad**: el rol TRABAJADOR de busqueda-repositorios no tiene
NINGUNA operación que ejecutar. Su cara de operación es **casi nula**; es una
frontera de formato sin estado que responde `buscar` por RPC. No hay
"trabajo de taller" que el operador realice manualmente en este conversor.

### 2 · RESTRICCIONES — ¿Qué NO depende del TRABAJADOR?

- **El conversor es SIN estado y SIN red**: todos los datos los recibe por el RPC
  (`query`, `repositorios`) y los adaptadores inyectados. El trabajador NO
  declara, NO persiste, NO administra repositorios, NO configura adaptadores
  desde aquí (los soportados por defecto son una constante `REPOSITORIOS_DEFECTO`
  en el código).
- **El cableado de adaptadores (APIs de repos) es del PUENTE del PC del dueño**,
  no del trabajador ni del conversor. Sin adaptador cableado ese repositorio se
  marca `caido`. El módulo no abre sockets; el thin bridge del PC resuelve las
  consultas reales. "Reparar un repo caído" NO es trabajo del operador sobre este
  módulo — es del puente/adaptadores.
- **Invariante 12 — un repositorio caído no rompe la búsqueda**: se omite su
  resultado; si TODOS fallan → vacío + `busqueda.buscar.failed` (motivo
  `todos_los_repositorios_caidos`). Esto es una garantía del CONVERSOR, no una
  tarea que el operador supervise: no hay señalización de fallo que el trabajador
  deba desbloquear en una UI.
- **Query inválida (vacía) → 400 + failed (motivo `query_vacia`)**: valida el
  módulo, no la UI. `repositorios` es opcional (si no llega, consulta todos los
  soportados).
- **El resultado se normaliza a forma canónica y se deduplica por
  `(repositorio, id)`** — proyección `_unificar`, estructura interna (7.1 del
  plan), no decisión ni operación del trabajador.
- **El origen del consumo es el flujo de búsqueda→importación**, que decide si un
  resultado se adopta. La mano del trabajador no escribe en este módulo.

### 3 · CONTRATO — ¿Qué necesita VER y qué SEÑAL confirma?

**VER (el trabajador, en el mejor de los casos):**
- No hay ninguna vista de operación que el trabajador necesite "ver": no hay
  listados, colas, métricas de trabajo, ni estado de mantenimiento que consultar.
  Lo único que produce el módulo es el resultado de `buscar(query)` →
  `[resultados]` unificados — y eso es una lectura que pertenece al flujo de
  decisión del jefe, no una pantalla de trabajo del operador.
- No hay listar/guardar/historial → no hay "pendientes" ni "trabajos en curso"
  que el operador pueda ver (y no debería: conversor sin estado). [ABIERTO].

**SEÑALES de confirmación (pareadas, verificadas en index.js):**
| Acción | Señal | Veredicto trabajador |
|---|---|---|
| `buscar` → éxito | `busqueda.buscar.response` (correlada, con resultados) | ✅ `onBuscarRequest → _buscar → return` — consumo del flujo, no del operador |
| `buscar` → query vacía | `busqueda.buscar.failed` (motivo `query_vacia`) | ✅ `_buscar` (400) — validación del módulo |
| `buscar` → todos caídos | `busqueda.buscar.failed` (motivo `todos_los_repositorios_caidos`) | ✅ `_buscar` — garantía del conversor |
| `project.activated` | — (NO existe; sin persistencia que restaurar) | ✅ ausente de index.js |

> Importante para el CONTRATO: incluso si `buscar` se expusiera en una UI, el
> trabajador no tiene una "acción de operación" aquí — `buscar` es una lectura de
> frontera que dispara otro flujo. No hay tarea operativa que el operario confirme
> ni desbloquee.

### 4 · NO-OBJETIVOS — ¿Qué caras NO son del trabajador?

- **Buscar / importar / adoptar un modelo**: es decisión del JEFE dentro del flujo
  de importación (`importacion-modelo`). El trabajador NO busca por cuenta propia.
- **CLIENTE** (elegir/encargar pieza): NO existe — taller de uso propio (fase 0).
- **La búsqueda externa en sí (APIs de repos, red, adaptadores)**: es del PUENTE /
  adaptadores en el PC del dueño, no del conversor ni de una UI del trabajador.
  "Reparar/desbloquear un repo" NO es tarea del operador sobre este módulo.
- **Operación de infraestructura / supervisión de estado**: sin estado y sin
  health que informar — no hay "monitoreo" de operador aquí. La robustez ya está
  en el conversor (invariante 12).
- **Catálogo / cola / ciclo / cúpula / filamento / historial / importación**:
  módulos y caras aparte en el proyecto; este conversor no las toca y el trabajador
  no opera nada de eso desde aquí.
- **Descargar, guardar, historial de búsquedas, "resultados favoritos"**: el
  conversor NO desciende, NO guarda, NO persiste — son no-objetivos estructurales
  (sin estado). Vista de guardados = NO construible desde sus RPC. [ABIERTO]
- **SISTEMA**: sin estado → sin health/persistencia que informar de cara al
  trabajador.

### 5 · PREGUNTAS_ABIERTAS — huecos [ABIERTO] (se nombran, no se cierran)

- (a) **¿Dónde busca el dueño?** — la disyuntiva de fondo del esquema (heredada
  del jefe): ¿busca DESDE Enki (RPC + puente del PC con adaptadores) o directo en
  el PC? Determina si alguna vez hay cara de búsqueda visible. El conversor hoy no
  decide esto: solo expone `buscar`.
- (b) **¿Necesita el trabajador alguna vista de "búsqueda/manutención"?** — hoy NO
  existe ninguna acción operativa sobre este conversor. Si el dueño quisiera que
  alguien vigile repos caídos o ejecute búsquedas programadas, eso sería estado y/o
  lógica de otro sitio (ciclo/scheduling), no de este conversor stateless. Se
  nombra como hueco, no se cierra.
- (c) **Historial / favoritos / cola de resultados** — el conversor no guarda
  nada. Cualquier cara operativa sobre "resultados guardados" exigiría otro módulo
  con persistencia — y probablemente innecesario en un taller de uso propio.
- (d) **Selección de repositorios por gesto** — el dueño puede elegir
  `repositorios` por RPC; es preferencia del jefe, no tarea de operación del
  trabajador. Hoy no hay UI que la exponga.

## Veredicto del ÁRBITRO (lente-roles)

Pregunta árbitro: ¿decide el FUTURO de la búsqueda → JEFE · ¿opera el flujo
(busca / consume resultados) → TRABAJADOR · ¿solo informa → NEUTRO?

| Op | Veredicto | Por qué (lente trabajador) |
|---|---|---|
| `buscar` | neutro (lectura de frontera) | Es un gesto puntual del jefe que dispara la decisión de importar; el trabajador NO lo opera. Lectura pura query → `[resultados]`. |
| buscar/importar un resultado | — (decisión del jefe, no vive aquí) | El trabajador no busca/importa; eso es del flujo de decisión (`importacion-modelo`). |
| operar/desbloquear/atender algo | — (no existe) | Sin estado → sin cola/pendientes/tareas. No hay verbo de operación con objeto aquí. |
| listar/guardar/historial | — (no existe) | Conversor stateless. Vista de "búsquedas guardadas" requeriría otro módulo [ABIERTO]. |
| `project.activated` | — (ausente) | No hay handler en index.js; no hay persistencia que restaurar. |

**Veredicto honesto**: el PANEL del trabajador para busqueda-repositorios es
**casi NULO**. No hay hoja de operación (nada que el trabajador ejecute,
desbloquee, mida ni atienda), no hay hoja de corrección, y la única lectura
(`buscar`) es un gesto puntual del jefe, no trabajo del operador. **No se
materializa un `BusquedaRepositoriosTrabajadorPanel`.** La búsqueda externa se
resuelve por adaptadores en el PC del dueño; el conversor no la pide por UI. Si un
día el dueño quisiera búsquedas programadas o vigilancia de repos (b) cerrado en
sí), la lógica viviría en un módulo con estado/ciclo, no en este conversor.

## Composición de la vista del trabajador (3 capas)

```text
1. OPERAR      — (no aplica): sin tareas de operación sobre el conversor (sin
                 cola, sin pendientes, sin estado). No hay verbo de taller con
                 objeto en busqueda-repositorios.
2. INFORMARSE  — el trabajador no "se informa" para operar aquí: no hay nada que
                 mantener en su estado ideal. La única lectura (buscar) es del
                 flujo de decisión del jefe, no del operador.
3. DECLARAR     — NO HAY hoja-trabajador de declaración: nada que el operador
                 registre, confirme o repare en un conversor stateless.
```

**Frecuencia → jerarquía**: no hay gestos frecuentes del trabajador que
jerarquizar. El conversor tiene UN solo RPC (`buscar`), esporádico y del flujo de
decisión. No hay jerarquía de tareas de operación.

## Formas UI canónicas (disección)

| Hoja (órgano) | Forma canónica | Nota (lente trabajador) |
|---|---|---|
| Resultado de búsqueda (query → resultados unificados) | `cinta-estado` / resultados agregados | `buscar` → `busqueda.buscar.response` — ÚNICA salida útil; se consume donde se decide importar, NO como panel de operación del trabajador |
| "Tareas / pendientes / cola de búsquedas" | — | NO construible: conversor SIN estado, SIN persistencia → [ABIERTO] si el dueño las quisiera (necesitaría otro módulo) |
| "Repos caídos / estado de mantenimiento" | — | NO es tarea del trabajador aquí: robustez del conversor (invariante 12); el cableado es del puente del PC [ABIERTO] |

**Ninguna hoja-trabajador de OPERACIÓN madura aquí** (sin ejecutar, sin
desbloquear, sin estado). No hay `señal-refresh` que dispare una vista: la única
respuesta es la correlada del RPC `buscar`, que es del flujo de decisión.

## Señales pareadas por hoja de operación (verificadas en index.js)

Regla: sin señal, hoja inmadura. Nombres REALES de los publishers del módulo:

```text
buscar (éxito) → busqueda.buscar.response  ✅ (onBuscarRequest → _buscar → return 200)
buscar (query vacía) → busqueda.buscar.failed (query_vacia)  ✅
buscar (todos caídos) → busqueda.buscar.failed (todos_los_repositorios_caidos)  ✅
refresco → — (sin estado; no hay store que refrescar)  ✅
```

## Huecos reales (todos de UI, todos candidatos de lectura — el trabajador NO opera)

1. **Búsqueda manual / programada desde el VPS** — si el dueño quiere una búsqueda
   desde Enki o automatizar búsquedas (ciclo), el puente debe poder responder
   `buscar` (adaptadores) y la lógica de scheduling viviría en otro módulo. No es
   tarea de operación del trabajador sobre el conversor.

`[ABIERTO]` (decisiones del dueño, nombradas NO cerradas):
- (a) ¿Busca el dueño desde Enki (RPC + puente del PC) o en el PC directamente?
- (b) ¿Quiere el trabajador alguna vista de "búsqueda/manutención/scheduling"?
  Hoy NO hay acción operativa sobre el conversor; sería de otro módulo con estado.
- (c) Historial/favoritos/cola de resultados — implicaría estado; probablemente
  innecesario en taller de uso propio.
- (d) Elegir repositorios por gesto de UI vs "todos a la vez" (default) — del jefe,
  no tarea del trabajador.

## El deliverable hacia F7 (spec de construcción)

**NO hay un `BusquedaRepositoriosTrabajadorPanel`.** La cara del trabajador para
busqueda-repositorios es casi nula y se DECLARA AUSENTE de forma deliberada (no se
inventa trabajo donde no lo hay). Concretamente para F7:

- **No materializar un módulo de panel para busqueda-repositorios (rol
  trabajador).** Es un conversor stateless: su único RPC `buscar` lo invoca el
  flujo que decide importar, no un operador desde una pantalla de gestión.
- **El trabajador no busca/importa modelos**: esa es decisión del jefe dentro del
  flujo de importación. No hay tarea de operación que un panel del trabajador
  sirva.
- **La búsqueda externa se resuelve con adaptadores en el PC del dueño** (thin
  bridge). Si el dueño declarara querer búsquedas programadas o vigilancia de
  repos (a)+(b), esa lógica pertenece a un módulo con estado/ciclo, consumiendo
  `buscar` como origen de datos — NO como panel de operación del trabajador.
- **Los resultados del conversor se exponen donde vive el contexto de decisión**
  — en `importacion-modelo` (elegir un resultado de búsqueda para importarlo).
  Esa es la única forma con valor de negocio de los resultados.

> **NOTA hacia F7 (sin materializar aquí):** ningún `ui_handler` se añade a
> module.json en este esquema — ni siquiera para exponer `buscar` como lectura de
> una vista futura. Eso es del F7/registro y solo si el dueño cierra (a)+(b) a
> favor de buscar/automatizar desde Enki.

## Puertos abiertos (cableables por el sitio)

- `consumidor_de_la_búsqueda` → el flujo que decide importar (p.ej.
  `importacion-modelo`) — RPC `busqueda.buscar.request` → `busqueda.buscar.response`
  — el consumidor real del conversor (voz del jefe, no del trabajador).
- `resolución_externa` → adaptadores de repositorios (Printables, MakerWorld,
  Cults3D, Thingiverse) inyectados desde el puente; se cablean en el PC del dueño,
  no en el VPS. Sin adaptador = repositorio caído (invariante 12).
- `señal_de_resultado` → `busqueda.buscar.failed` (motivos `query_vacia` /
  `todos_los_repositorios_caidos`) como par canónico de fallo del RPC.
- `origen_de_datos` → los repositorios externos, vía adaptadores del puente; el
  conversor normaliza y deduplica a forma canónica (proyección `_unificar`).

## Verificación contra index.js (agotado)

- **UN solo handler RPC: `onBuscarRequest` (→ `_buscar`).** No hay
  `listar`, `contar`, `registrar`, `importar`, `delete`, `update`, ni ningún
  handler de operación/ejecución/tarea. No hay `onProjectActivated` — **ausente por
  diseño** (conversor sin estado, nada que restaurar). Esto confirma que no hay
  entidad persistida ni cara de operación del trabajador.
- `_buscar`: valida query (400 + failed motivo `query_vacia` si vacía);
  `repositorios` opcional (default `REPOSITORIOS_DEFECTO` = printables, makerworld,
  cults3d, thingiverse); para cada repo consulta `_adaptadores.get(nombre).buscar(query)`;
  sin adaptador o excepción → repositorio caído (invariante 12); si todos caen →
  vacío + failed motivo `todos_los_repositorios_caidos`; unifica a forma canónica y
  deduplica por `(repositorio, id)` en `_unificar`.
- `registrarAdaptador(nombre, adaptador)`: inyección de adaptadores, la hace el
  puente (no es RPC de UI, ni decisión del jefe, ni tarea del trabajador).
- Par canónico: `busqueda.buscar.failed` con motivos reales `query_vacia` /
  `todos_los_repositorios_caidos`; éxito correlado `busqueda.buscar.response`.
- **Confirmado: busqueda-repositorios es un CONVERSOR sin estado, sin persistencia
  y sin red propia; su cara de trabajador es casi nula.** El único RPC (`buscar`)
  es un gesto puntual del jefe que resuelve la búsqueda real por adaptadores en el
  PC del dueño, y el operador NO tiene ninguna acción de mantenimiento/operación
  sobre él. Por eso este esquema declara AUSENTE el panel del trabajador en vez de
  inventar una interfaz que el módulo no pide.
