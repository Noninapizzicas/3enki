# Esquema maestro — busqueda-repositorios · ROL JEFE

> Sujeto: la cara de DECISIÓN del buscador multi-repositorio de modelos 3D para
> el dueño (JEFE) del taller personal de impresión 3D.
> Objetivo: determinar **qué necesita ver/decidir el jefe sobre la búsqueda de
> modelos 3D en repositorios externos** (Printables, MakerWorld, Cults3D,
> Thingiverse) — o si, como frontera de formato SIN estado, su cara es casi nula
> y el consumo real lo hacen otros flujos por RPC con la búsqueda resuelta en el
> PC del dueño.
> Método: esquematizador universal (prisma de 5 huecos) con lente de rol JEFE.
> Ley: agnosticismo (0 tecnologías nombradas en el análisis).
> Proyecto: 3d — taller personal de impresión 3D, uso propio, no vende (fase 0).
> Fuente de verdad de la búsqueda: este módulo ES SOLO una frontera de formato
> (module.json `_doc`): no descarga, no importa, no decide. Busca en repos
> externos y normaliza los resultados. Y crucialmente, SIN estado, SIN red en su
> runtime: el puerto `buscar(query)` se cablea con ADAPTADORES inyectados en el
> puente, no aquí.

## La lente JEFE aplicada a busqueda-repositorios

`busqueda-repositorios` es un **CONVERSOR puro** del proyecto 3D (reflejo JS):
una **frontera de formato multi-fuente**. A diferencia de `catalogo-modelos`
(`registrar`) o `gestion-filamento` (`registrar`), que son módulos de decisión
del negocio con estado propio que el dueño declara a mano, **busqueda-repositorios
no tiene estado, no persiste, no es dueño de ninguna entidad persistida**. Para el
JEFE eso significa:

- **El módulo no aloja NADA que el jefe declare**: no hay listar/registrar/
  persistencia. No existe ni puede existir una vista de "resultados guardados"
  porque el conversor no guarda nada — normaliza en el aire y devuelve.
- **La búsqueda real ocurre FUERA del VPS**: el conversor consume adaptadores
  inyectados (`_adaptadores` map de `{ nombre, buscar(query) → Promise }`); los
  adaptadores concretos a las APIs de los repositorios se cablean en el puente,
  no en el módulo. El runtime del VPS no habla con internet para esto (invariante:
  sin red). **La resolución real de la consulta ocurre del lado donde viven los
  adaptadores — el PC del dueño (thin bridge).**
- **Lo que al jefe le importa es el RESULTADO, no el conversor**: "encuentro un
  modelo para X pieza" es un gesto de búsqueda. Ese gesto vive en el flujo que
  alimenta a `importacion-modelo` (y eventualmente a `catalogo-modelos`), no en
  una pantalla de gestión de un conversor.
- **El par canónico está completo**: `busqueda.buscar.request` ↔
  `busqueda.buscar.failed` (query_vacia | todos_los_repositorios_caidos). El flujo
  cierra su círculo aunque el jefe nunca toque el conversor directamente. La
  garantía (invariante 12) — un repositorio caído no rompe la búsqueda — es
  exactamente lo que protege al dueño cuando un repo externo va mal.

```
BUSQUEDA-REPOSITORIOS · ROL JEFE (CONVERSOR — la cara es CASI NULA)
│
├─ CONSUMO REAL (lo que hace el módulo) ─────────────── NO es cara del jefe
│   ├─ es SOLO frontera de formato: buscar(query) → [resultados] normalizados
│   ├─ sin estado, sin persistencia, sin red en su runtime
│   └─ los adaptadores reales (APIs de repos) se cablean en el puente del PC
│
├─ LO QUE EL JEFE HARÍA AQUÍ ─────────────────────────── es un GESTO de búsqueda
│   └─ "¿qué modelo existente sirve para X?" → buscar(query) → resultados
│         · pero la búsqueda externa se resuelve en el PC (adaptadores),
│           no en el VPS directamente con este conversor solo
│
└─ VISTA DE "RESULTADOS DE BÚSQUEDA" ─────────────────── sin estado → NO construible
    ├─ no hay listar/guardar/historial (conversor stateless)
    └─ no se puede montar una vista de "búsquedas guardadas" desde sus RPC
```

## Los 3 principios de agilidad (lo que extrae el esquema)

1. **Frecuencia → jerarquía.** El jefe busca modelos de vez en cuando (cuando
   necesita una pieza nueva), no a diario con gestos repetidos. No hay gesto
   frecuente que jerarquizar en el conversor; hay UN solo RPC (`buscar`).
2. **Ninguna operación recarga la vista.** Si algún día una búsqueda se expone en
   una UI, el resultado llega por la respuesta correlada (`busqueda.buscar.response`),
   nunca por recarga ni por estado guardado.
3. **El conversor se ve por su RESULTADO, no por su formato.** El jefe no lee
   "este conversor normalizó N repositorios": lee "para 'conector M5' hay 3
   modelos en Printables y 1 en MakerWorld". Esa proyección (resultados unificados)
   es la única forma con valor de negocio, y la usa el flujo que decide importar.

## El prisma de 5 huecos con lente JEFE (verificado contra index.js)

### 1 · IDENTIDAD — ¿Qué DECIDE el JEFE aquí?

- **Casi nada a nivel de módulo — y la búsqueda misma no es una decisión de
  panel, es un gesto puntual.** `buscar` (→ `_buscar`) es el ÚNICO RPC: toma una
  query (más `repositorios` opcional) y devuelve `[resultados]` unificados. No hay
  op para declarar, corregir ni gestionar nada — no hay entidad que administrar.
- **El conversor no persiste, no es dueño.** No hay decisión de negocio que el
  jefe tome sobre un almacén de búsquedas, porque no existe tal almacén.
- **La decisión de fondo del dueño del taller (fase 0) es NEGOCIO, no búsqueda**:
  "este modelo me sirve para la pieza que necesito" → se importa y entra al
  pipeline (importacion-modelo → catalogo). Esa decisión de adopción la toma el
  dueño en el flujo de IMPORTACIÓN, no en una pantalla de busqueda-repositorios.
- **`project.activated`** (si existiera el handler) sería neutro — pero aquí NO
  hay restauración de persistencia porque no hay estado [ver verificación].

**Conclusión de identidad**: el rol JEFE de busqueda-repositorios no tiene
DECISIÓN propia. Su cara de decisión es **casi nula**; es una frontera de formato
sin estado que responde `buscar` por RPC. No hay "decisión del futuro de una base
de búsquedas" que el jefe tome manualmente (no hay base).

### 2 · RESTRICCIONES — ¿Qué NO depende del JEFE?

- **El conversor es SIN estado y SIN red**: todos los datos los recibe por el
  RPC (`query`, `repositorios`) y los adaptadores inyectados. El jefe NO declara,
  NO persiste, NO administra repositorios desde aquí. Registrar/sincronizar listas
  de repositorios NO es responsabilidad del conversor (los soportados por defecto
  son una constante `REPOSITORIOS_DEFECTO` en el código).
- **La conexión a los repos externos NO la hace el módulo**: los adaptadores
  (`adaptador.buscar(query)`) se inyectan desde el puente. Sin adaptador cableado
  ese repositorio se marca `caido`. El módulo no abre sockets; el PC del dueño
  (thin bridge) resuelve las consultas reales.
- **Invariante 12 — un repositorio caído no rompe la búsqueda**: se omite su
  resultado; si TODOS fallan → vacío + `busqueda.buscar.failed` (motivo
  `todos_los_repositorios_caidos`). Esto es una garantía del CONVERSOR, no una
  decisión del jefe.
- **Query inválida (vacía) → 400 + failed (motivo `query_vacia`)**: valida el
  módulo, no la UI. `repositorios` es opcional (si no llega, consulta todos los
  soportados).
- **El resultado se normaliza a forma canónica y se deduplica por
  `(repositorio, id)`** — proyección `_unificar`, estructura interna (7.1 del
  plan), no decisión del jefe.
- **El origen del consumo es el flujo de búsqueda→importación**, que decide si un
  resultado se adopta. La mano del dueño no escribe en este módulo.

### 3 · CONTRATO — ¿Qué necesita VER y qué SEÑAL confirma?

**VER (el jefe, en el mejor de los casos):**
- El resultado de `buscar(query)` → `[resultados]` unificados con `repositorio`,
  `titulo`, `url`, `autor`, `licencia`, `descargas`, `valoracion`, más `total`,
  `repositorios_consultados` y `repositorios_caidos`. Esto es lo ÚNICO útil que
  produce el módulo, y es exactamente "¿qué hay disponible en los repos para X?".
- No hay listar/guardar/historial → el jefe no puede ver "búsquedas previas" con
  las RPC actuales (y no debería: conversor sin estado). [ABIERTO].

**SEÑALES de confirmación (pareadas, verificadas en index.js):**
| Acción | Señal | Verificado |
|---|---|---|
| `buscar` → éxito | `busqueda.buscar.response` (correlada, con resultados) | ✅ `onBuscarRequest → _buscar → return` |
| `buscar` → query vacía | `busqueda.buscar.failed` (motivo `query_vacia`) | ✅ `_buscar` (400) |
| `buscar` → todos caídos | `busqueda.buscar.failed` (motivo `todos_los_repositorios_caidos`) | ✅ `_buscar` |
| `project.activated` | — (NO existe; sin persistencia que restaurar) | ✅ ausente de index.js |

> Importante para el CONTRATO: incluso si se expusiera una búsqueda en una UI, el
> jefe no tiene una "acción de confirmación" aquí — `buscar` es una lectura de
> frontera. La única decisión que confirma algo es la de ADOPTAR el resultado
> (importacion-modelo), no el conversor.

### 4 · NO-OBJETIVOS — ¿Qué caras NO son del jefe?

- **CLIENTE** (elegir/encargar pieza): NO existe — taller de uso propio (fase 0).
- **La búsqueda externa en sí (APIs de repos, red, adaptadores)**: es del PUENTE /
  adaptadores en el PC del dueño, no del conversor ni de una UI del jefe.
- **Importación / adopción de un modelo encontrado** (`importacion-modelo`): es el
  paso siguiente; el conversor solo devuelve resultados, no decide cuál importar.
- **Catálogo / cola / ciclo / cúpula / filamento / historial**: módulos y caras
  aparte en el proyecto; este conversor no las toca.
- **Descargar, guardar, historial de búsquedas, "resultados favoritos"**: el
  conversor NO desciende, NO guarda, NO persiste — son no-objetivos estructurales
  (sin estado). Vista de guardados = NO construible desde sus RPC. [ABIERTO]
- **SISTEMA**: sin estado → sin health/persistencia que informar.

### 5 · PREGUNTAS_ABIERTAS — huecos [ABIERTO] (se nombran, no se cierran)

- (a) **¿Dónde busca el dueño?** — la disyuntiva de fondo de este esquema: ¿el
  dueño busca DESDE Enki (VPS), dispara `buscar` por RPC y el puente del PC con los
  adaptadores resuelve la consulta y le devuelve resultados normalizados? ¿O la
  búsqueda es del usuario directamente EN el PC (abre el navegador de un repo, o
  una UI local) y Enki/el conversor solo se usa para flujos automatizados
  (p.ej. ciclo/búsquedas programadas)? La respuesta define si alguna vez hay cara
  de jefe. Hoy el conversor NO decide esto: solo expone `buscar`.
- (b) **Panel de búsqueda en el VPS** — ¿quiere el dueño una pantalla donde teclear
  una query y ver resultados agregados de los 4 repos? Solo tiene sentido si el
  puente del PC puede responder `buscar` en vivo desde el VPS (a) cerrado en sí).
  Si la búsqueda ocurre en el PC, el panel es innecesario. Decisión de dueño.
- (c) **Historial / favoritos de resultados** — el conversor no guarda nada.
  ¿Quiere el dueño recordar búsquedas y resultados? Eso sería estado, y exigiría un
  módulo distinto (no este conversor) y probablemente innecesario en un taller de
  uso propio (fase 0). Se nombra.
- (d) **Selección de repositorios por gesto** — el dueño puede elegir `repositorios`
  por RPC; ¿quiere elegir por gesto de UI o le basta "todos a la vez" (default)?
  Es preferencia menor; hoy no hay UI que la exponga.

## Veredicto del ÁRBITRO (lente-roles)

Pregunta árbitro: ¿decide el FUTURO de la búsqueda (adminitra una colección /
decide su calidad) → JEFE · ¿opera el flujo (busca / consume resultados) →
TRABAJADOR · ¿solo informa → NEUTRO?

| Op | Veredicto | Por qué |
|---|---|---|
| `buscar` | neutro (operación de frontera) | Lectura/transformación pura: query → `[resultados]`. La usa quien decida importar; NO decide nada el jefe sobre una entidad. |
| adoptar/importar un resultado | — (no vive aquí) | La decisión de adoptar es de `importacion-modelo`, no de este conversor. |
| listar/guardar/historial | — (no existe) | Sin estado: conversor stateless. Cualquier "resultados guardados" requeriría otro módulo y persistencia [ABIERTO]. |
| `project.activated` | — (ausente) | No hay handler en index.js; no hay persistencia que restaurar. |

**Veredicto honesto**: el PANEL del jefe para busqueda-repositorios es **casi NULO**.
No hay hoja-jefe de declaración (nada que registrar), ni de corrección (nada que
editar), y la única lectura (`buscar`) es un gesto puntual que normalmente dispara
otro flujo. **No se materializa un `BusquedaRepositoriosJefePanel`.** La búsqueda
externa se resuelve por adaptadores en el PC del dueño; el conversor no la pide por
UI. Si el dueño quiere una búsqueda manual desde Enki (a)+(b) cerrados en sí), la
UI sería del flujo que llama `buscar` y decide importar, no un panel del conversor.

## Composición de la vista del jefe (3 capas)

```text
1. SELECCIONAR  — (no aplica): sin entidades persistidas que listar/enumerar en
                  un list. No hay qué seleccionar desde un catálogo de la cúpula.
2. INFORMARSE   — la única lectura es buscar(query) → [resultados]. Útil solo si
                  se expone en el lugar donde el dueño decide importar; no es un
                  listado de algo guardado.
3. DECLARAR     — NO HAY hoja-jefe de declaración: no hay nada que el dueño
                  registre o declare en un conversor stateless.
```

**Frecuencia → jerarquía**: la búsqueda es un gesto esporádico (cuando se necesita
una pieza nueva), no un flujo diario. No hay jerarquía de gestos que diseñar:
existe UN solo RPC (`buscar`).

## Formas UI canónicas (disección)

| Hoja (órgano) | Forma canónica | Nota |
|---|---|---|
| Resultado de búsqueda (query → resultados unificados) | `cinta-estado` / resultados agregados | `buscar` → `busqueda.buscar.response` · es la ÚNICA salida útil; se consume donde se decide importar, no como panel del conversor |
| "Búsquedas guardadas" / historial | — | NO construible: conversor SIN estado, sin persistencia → [ABIERTO] si el dueño la quisiera (necesitaría otro módulo) |
| Selección de repositorios / búsqueda manual en VPS | `formulario-puntual` | [ABIERTO] — solo si (a)+(b) se resuelven a favor de buscar desde Enki; hoy no hay UI que la exponga |

**Ninguna hoja-jefe de DECLARACIÓN madura aquí** (sin escribir, sin corregir, sin
estado). No hay `señal-refresh` que dispare una vista: la única respuesta es la
correlada del RPC `buscar`.

## Señales pareadas por hoja de declaración (verificadas en index.js)

Regla: sin señal, hoja inmadura. Nombres REALES de los publishers del módulo:

```text
buscar (éxito) → busqueda.buscar.response  ✅ (onBuscarRequest → _buscar → return 200)
buscar (query vacía) → busqueda.buscar.failed (query_vacia)  ✅
buscar (todos caídos) → busqueda.buscar.failed (todos_los_repositorios_caidos)  ✅
refresco → — (sin estado; no hay store que refrescar)  ✅
```

## Huecos reales (todos de UI, todos candidatos de lectura del rol jefe)

1. **Búsqueda manual desde el VPS** — si el dueño quiere teclear una query desde
   Enki y ver resultados de los 4 repos, el puente debe poder responder `buscar`
   en vivo (adaptadores) y la UI viviría en el flujo que decide importar. No hay
   requisito de que sea un panel del conversor.

`[ABIERTO]` (decisiones del dueño, nombradas NO cerradas):
- (a) ¿Busca el dueño desde Enki (RPC + puente del PC) o en el PC directamente?
- (b) ¿Quiere una pantalla de búsqueda desde el VPS? Solo si (a) = "desde Enki".
- (c) Historial/favoritos de resultados — implicaría estado; probablemente
  innecesario en taller de uso propio.
- (d) Elegir repositorios por gesto de UI vs "todos a la vez" (default).

## El deliverable hacia F7 (spec de construcción)

**NO hay un `BusquedaRepositoriosJefePanel`.** La cara del jefe para
busqueda-repositorios es casi nula y se DECLARA AUSENTE de forma deliberada (no se
inventa necesidad donde no la hay). Concretamente para F7:

- **No materializar un módulo de panel para busqueda-repositorios.** Es un
  conversor stateless: su único RPC `buscar` lo invoca un flujo (p.ej. el que
  alimenta a importacion-modelo), no el dueño desde una pantalla de gestión.
- **La búsqueda externa se resuelve con adaptadores en el PC del dueño** (thin
  bridge). Si el dueño declara querer buscar desde Enki (a)+(b), la UI de búsqueda
  pertenece al flujo que llama `buscar` y presenta resultados + decisión de
  importar — consumiendo `buscar` como origen de datos, NO como módulo de panel.
- **Los resultados del conversor se exponen donde vive el contexto de decisión**
  — en `importacion-modelo` (elegir un resultado de búsqueda para importarlo). Esa
  es la única forma con valor de negocio de los resultados.

> **NOTA hacia F7 (sin materializar aquí):** ningún `ui_handler` se añade a
> module.json en este esquema — ni siquiera para exponer `buscar` como lectura de
> una vista futura. Eso es del F7/registro y solo si el dueño cierra (a)+(b) a
> favor de buscar desde Enki.

## Puertos abiertos (cableables por el sitio)

- `consumidor_de_la_búsqueda` → el flujo que decide importar (p.ej.
  `importacion-modelo`) — RPC `busqueda.buscar.request` → `busqueda.buscar.response`
  — el consumidor real del conversor.
- `resolución_externa` → adaptadores de repositorios (Printables, MakerWorld,
  Cults3D, Thingiverse) inyectados desde el puente; se cablean en el PC del dueño,
  no en el VPS. Sin adaptador = repositorio caído (invariante 12).
- `señal_de_resultado` → `busqueda.buscar.failed` (motivos `query_vacia` /
  `todos_los_repositorios_caidos`) como par canónico de fallo del RPC.
- `origen_de_datos` → los repositorios externos, vía adaptadores del puente; el
  conversor normaliza y deduplica a forma canónica (proyección `_unificar`).

## Verificación contra index.js (agotado)

- **UN solo handler RPC: `onBuscarRequest` (→ `_buscar`).** No hay
  `listar`, `contar`, `registrar`, `importar`, `delete`, `update`. No hay
  `onProjectActivated` — **ausente por diseño** (conversor sin estado, nada que
  restaurar). Esto confirma que no hay entidad persistida ni cara de listado.
- `_buscar`: valida query (400 + failed motivo `query_vacia` si vacía); `repositorios`
  opcional (default `REPOSITORIOS_DEFECTO` = printables, makerworld, cults3d,
  thingiverse); para cada repo consulta `_adaptadores.get(nombre).buscar(query)`;
  sin adaptador o excepción → repositorio caído (invariante 12: no rompe la
  búsqueda); si todos caen → vacío + failed motivo `todos_los_repositorios_caidos`;
  unifica a forma canónica y deduplica por `(repositorio, id)` en `_unificar`.
- `registrarAdaptador(nombre, adaptador)`: inyección de adaptadores, la hace el
  puente (no es RPC de UI, ni decisión del jefe). Acepta solo si el adaptador
  expone `buscar` como función.
- Par canónico: `busqueda.buscar.failed` con motivos reales `query_vacia` /
  `todos_los_repositorios_caidos`; éxito correlado `busqueda.buscar.response`.
- **Confirmado: busqueda-repositorios es un CONVERSOR sin estado, sin persistencia
  y sin red propia; su cara de jefe es casi nula.** El único RPC (`buscar`) es un
  gesto puntual que resuelve la búsqueda real por adaptadores en el PC del dueño.
  Por eso este esquema declara AUSENTE el panel del jefe en vez de inventar una
  interfaz que el módulo no pide.
