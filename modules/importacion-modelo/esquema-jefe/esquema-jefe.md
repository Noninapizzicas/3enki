# Esquema maestro — importacion-modelo · ROL JEFE

> Sujeto: la cara de DECISIÓN del puente de importación de modelos 3D para el
> dueño (JEFE) del taller personal de impresión 3D.
> Objetivo: **interfaz del jefe para importar modelos 3D al taller** — pegar una
> URL (o elegir de la búsqueda previa), indicar origen y categoría, disparar la
> importación y ver el resultado registrado en el catálogo, con el mínimo de
> gestos y sin recargas.
> Método: esquematizador universal (prisma de 5 huecos) con lente de rol JEFE.
> Ley: agnosticismo (0 tecnologías nombradas en el análisis).
> Proyecto: 3d — taller personal de impresión 3D, uso propio, no vende (fase 0);
> imprime en la SPARKX i7 con PETG; el modelo entra por este puente y se registra
> en el catálogo.

## La lente JEFE aplicada a importacion-modelo

`importacion-modelo` es un **PUENTE** del proyecto 3D (reflejo JS): **sin store,
sin persistencia, escucha y delega**. A diferencia de `catalogo-modelos`
(`registrar`) que es un CUSTODIO con store propio, y de `cupula-gcode`/
`busqueda-repositorios` que son conversores donde la cara del jefe es casi nula,
**ESTE módulo SÍ aloja una acción que el jefe ejerce de verdad: IMPORTAR un modelo
al taller.** Para el JEFE eso significa:

- **Importar es la ÚNICA escritura del flujo de entrada de modelos.** El jefe pega
  una `url` (o la trae de la búsqueda previa), indica `origen` y `categoria`, y el
  puente hace el resto (descarga → detecta formato → lee el .3mf → registra en el
  catálogo). Es un gesto de DECLARACIÓN real — no como los conversores, donde no
  había nada que declarar.
- **El jefe NO gestiona entidades aquí** — el puente no aloja un store. Los
  modelos importados VIVEN en `catalogo-modelos` (registrar), no en una lista
  propia. No existe ni puede existir una vista de \"historial de importaciones\"
  porque el puente no persiste. Lo que el jefe hace al importar es ENTRAR un
  modelo al pipeline, y el catálogo es el dueño de ese dato.
- **Buscar es el paso previo del flujo del dueño** — antes de importar, el jefe
  busca en los repositorios. Ese gesto delega a `busqueda-repositorios` por el
  puerto `_buscar(query)`; **no es un handler RPC expuesto del módulo** (vive como
  RPC propio en busqueda-repositorios); aquí es una delegación interna que prepara
  la elección del jefe.
- **El resultado de la importación lo confirma la señal** `importacion.importada`
  — el par de fallo `importacion.importar.failed` cierra el círculo si algo no va.
- **El juez del formato y de la config es el MÓDULO, no la UI**: si el descargador
  no está cableado → `503 DESCARGADOR_NO_CONFIGURADO`; si el origen es `.stl` sin
  `.3mf` → `422 FALTA_3MF`. No se inventa (invariante 5).

```text
IMPORTACION-MODELO · ROL JEFE (PUENTE — el jefe SÍ importa)
│
├─ FLUJO DEL DUEÑO (lo que el jefe hace de verdad) ──── acción REAL del jefe
│   ├─ 1. BUSCAR (paso previo, delegado a busqueda-repositorios)
│   │     · query → resultados unificados de los 4 repos · puerto interno _buscar
│   │     · NO es handler RPC expuesto del módulo (el RPC buscar vive en
│   │       busqueda-repositorios; aquí es delegación interna del flujo)
│   └─ 2. ELEGIR + IMPORTAR (la acción REY del jefe)
│         · pegar url (o elegir de la búsqueda) + origen + categoria
│         · dispara importacion.importar.request → descarga → lee .3mf
│           → registra en catalogo-modelos → importacion.importada
│
├─ RESTRICCIONES DEL PUENTE ────────────────────────── NO decide la UI
│   ├─ sin descargador cableado → 503 DESCARGADOR_NO_CONFIGURADO
│   ├─ origen .stl sin .3mf → 422 FALTA_3MF (no se convierte, no se inventa)
│   ├─ url/project_id requeridos → 400 (url_requerida / project_id_requerido)
│   └─ el resultado vive en catalogo-modelos (NO hay historial propio)
│
└─ VISTA DE \"RESULTADOS IMPORTADOS\" ────────────────── sin store → NO construible
    ├─ no hay listar/historial/persistencia (puente stateless)
    └─ los modelos importados se ven en catalogo-modelos (cara de catálogo)
```

## Los 3 principios de agilidad (lo que extrae el esquema)

1. **Frecuencia → jerarquía.** El jefe importa cuando necesita una pieza nueva
   (no a diario con gestos repetidos), pero es una ACCIÓN real con feedback
   esperado. El gesto rey es el **importar** (editor-bloque: url + origen +
   categoría); el **buscar** es el paso previo que alimenta la elección. El
   resultado de la importación se confirma con la señal, no recargando.
2. **Ninguna operación recarga la vista.** Tras disparar `importar`, la vista
   espera el evento `importacion.importada` (o el par de fallo) — nunca una
   recarga. El resultado registrado se refleja en la vista del catálogo (cara de
   catalogo-modelos), no en un historial propio de este puente.
3. **El puente se ve por su ACCIÓN de importación, no por un listado.** El jefe
   no lee \"este puente importó N modelos\": lee \"importé 'conector M5' desde
   Printables, entró al catálogo\". Esa confirmación (la señal pareada) es la
   única forma con valor de negocio del módulo, y la consume el mismo jefe.

## El prisma de 5 huecos con lente JEFE (verificado contra index.js)

### 1 · IDENTIDAD — ¿Qué DECIDE el JEFE aquí?

- **QUÉ modelo entra al taller** (`importar`, el ÚNICO handler RPC expuesto →
  `onImportarRequest`): `url` (obligatoria), `origen` (default `desconocido`) y
  `categoria` (default `sin_categoria`); opcional `nombre`. Es la cara de
  ENTRADA del pipeline — el jefe decide qué pieza adopta del repositorio o del
  diseño propio.
- **DÓNDE busca antes de importar** (`_buscar`, delegación interna a
  `busqueda-repositorios`): el jefe dispara una query y vé resultados unificados
  para elegir cuál importar. Es un gesto PUNTUAL del flujo, no una hoja de
  gestión (no administra nada: solo resuelve una consulta de frontera).
- **NEUTRO/sistema**: Nada más — no hay `project.activated` (sin persistencia
  que restaurar), no hay alta manual de entidad, no hay corrección de datos.

### 2 · RESTRICCIONES — ¿Qué NO depende del JEFE?

- **El módulo es PUENTE sin store ni persistencia.** El jefe NO lista, NO gestiona
  un historial, NO corrige datos desde aquí — no existe almacén propio. Los
  modelos importados VIVEN en `catalogo-modelos` (registrar), que es el dueño del
  dato.
- **El descargador se inyecta** (`registrarDescargador`), lo cablea el puente thin
  del PC del dueño (o un adaptador HTTP). Si no está cableado, **toda importación
  falla con `503 DESCARGADOR_NO_CONFIGURADO`** — es una restricción del SISTEMA,
  no una decisión del jefe ni un defecto de la UI.
- **El formato no se inventa (invariante 5)**: si el archivo descargado es `.stl`,
  el slicer necesita `.3mf` y el módulo NO convierte — avisa `422 FALTA_3MF`. La
  conversión es responsabilidad del dueño/slicer, no del puente ni de la UI.
- **`url` y `project_id` son requeridos** (400 `INVALID_INPUT` + motivo
  `url_requerida` / `project_id_requerido`) — valida el módulo, no la UI.
- **El resultado del registro lo decide `catalogo-modelos`**: si el catálogo
  rechaza (p.ej. `409 ALREADY_EXISTS` de `registrar`), el puente falla con
  `502 REGISTRO_FALLIDO`. El juez de unicidad es el catálogo, no este puente.
- **Buscar delega a `busqueda-repositorios`**: si no responde → `502`
  `BUSQUEDA_FALLO` (motivo tipado). La búsqueda real se resuelve con los
  adaptadores en el PC del dueño (el runtime del VPS no abre internet para esto).
- **Ni alta manual, ni edición, ni borrado aquí** — son no-objetivos estructurales
  del puente (sin store). Toda gestión de modelos ya importados es del catálogo.

### 3 · CONTRATO — ¿Qué necesita VER y qué SEÑAL confirma?

**VER (el jefe, para importar):**
- El **resultado de la búsqueda** `_buscar(query)` → `{resultados[], total}`
  (unificados de busqueda-repositorios) — para elegir qué modelo importar por su
  URL. Es el informe previo que abre la decisión.
- La **URL a importar** + `origen` + `categoria` (y opcional `nombre`) — lo que el
  jefe declara en el editor de importación.

**SEÑALES de confirmación (pareadas, verificadas en index.js):**
| Acción | Señal | Verificado |
|---|---|---|
| `importar` → éxito | `importacion.importada` (`{modelo_id, nombre, origen, archivo3mf}`) | ✅ `onImportarRequest → _importar → publish` |
| `importar` → fallo | `importacion.importar.failed` (par de fallo canónico) | ✅ `_importar` pública en cada fallo |
| `buscar` (delegado) → éxito | `busqueda.buscar.response` (correlada, con resultados) | ✅ vía RPC a `busqueda.buscar.request` |
| `buscar` (delegado) → fallo | `502 BUSQUEDA_FALLO` (motivo `busqueda_fallo`) | ✅ `_buscar` si no responde |
| refresco del panel | `importacion.importada` / `importacion.importar.failed` | ✅ (toda mutación emite su señal; la vista re-lee el catálogo, nunca recarga) |

> Nota de honestidad: la señal de éxito `importacion.importada` confirma el
> registro EN EL CATÁLOGO (`catalogo-modelos`), que es donde vive el modelo. La
> vista de importación espera esa señal para dar el feedback; la VISTA del
> resultado importado (los modelos en sí) es la del catálogo, no una lista propia
> de este puente.

### 4 · NO-OBJETIVOS — ¿Qué caras NO son del JEFE?

- **CLIENTE** (elegir/encargar pieza): NO existe — taller de uso propio, no vende
  (fase 0).
- **La búsqueda externa en sí (APIs de repos, red, adaptadores)**: es del PUENTE/
  adaptadores en el PC del dueño (via busqueda-repositorios + su puerto), no de
  una UI del jefe de importación.
- **Descargar, leer el .3mf, registrar en catálogo**: pasos automatizados del
  propio `_importar` — los ejerce el puente, no el jefe manualmente.
- **Gestión de los modelos ya importados** (listar, editar, borrar catálogo): es
  del CUSTODIO `catalogo-modelos`, no de este puente. La cara de \"qué tengo\"
  está en el catálogo.
- **Listado/historial de importaciones**: el puente NO persiste — cualquier vista
  de \"importaciones previas\" no es construible desde sus RPC. [ABIERTO].
- **SISTEMA**: sin store → sin health/persistencia que informar.

### 5 · PREGUNTAS_ABIERTAS — huecos [ABIERTO] (se nombran, no se cierran)

- (a) **¿Busca el dueño desde Enki (VPS) o en el PC directamente?** De igual modo
  que en busqueda-repositorios: si el jefe busca DESDE Enki (dispara `_buscar` por
  el flujo de importación y el puente del PC resuelve), la caja de búsqueda en la
  vista de importación tiene sentido. Si busca en el PC con el navegador de un
  repo, la caja es innecesaria (basta pegar la URL). Decisión de dueño.
- (b) **Origen y categoría en la importación** — el jefe indica `origen`
  (printables/makerworld/cults3d/thingiverse/diseño propio) y `categoria`
  (default `sin_categoria`). ¿Se ofrecen desde un select precargado (de
  `catalogo-modelos.categorias`) o texto libre? Preferencia de dueño menor.
- (c) **Historial de importaciones** — el puente no persiste. ¿Quiere el dueño
  recordar qué importó y cuándo? Eso sería estado y exigiría otro módulo (no este
  puente); probablemente innecesario en taller de uso propio (fase 0). Se nombra.
- (d) **`.stl` como entrada** — hoy se avisa `falta_3mf` y NO se convierte. ¿Quiere
  el dueño que el sistema convierta `.stl`→`.3mf` (decisión de alcance que hoy
  queda fuera del puente, responsabilidad del dueño/slicer)?

## Veredicto del ÁRBITRO (lente-roles)

Pregunta árbitro: ¿decide el FUTURO del catálogo (introduce un modelo nuevo, escribe
en el pipeline vía registrar) → JEFE · ¿opera el flujo (busca, consulta) →
TRABAJADOR · ¿solo informa/automatiza → NEUTRO?

| Op | Veredicto | Por qué |
|---|---|---|
| `importar` (`onImportarRequest → _importar`) | **JEFE** | **La ÚNICA acción real del módulo y la ÚNICA escritura del flujo de entrada**: el jefe decide QUÉ modelo entra al taller (URL + origen + categoría), dispara la importación y espera `importacion.importada`. Decide el FUTURO del catálogo (vía registrar). |
| `_buscar` (delegación a busqueda-repositorios) | **JEFE (paso previo del flujo)** | Gesto puntual del jefe antes de importar: busca, elige entre resultados. Aunque NO es handler RPC expuesto del módulo, es el paso previo de la decisión del dueño. Delega por RPC a `busqueda.buscar.request`. |
| adoptar/registrar el modelo en catálogo | — (vive en catalogo-modelos) | El registro lo hace el CUSTODIO `catalogo-modelos`; el puente solo lo deletoga. No es op de UI del puente. |
| listar/historial de importaciones | — (sin store) | Puente stateless: no existe lista propia. Cualquier \"historial\" exigiría otro módulo y persistencia [ABIERTO]. |
| `project.activated` | — (ausente) | No hay handler en index.js; no hay persistencia que restaurar (puente). |

**Veredicto honesto**: a diferencia de `cupula-gcode`/`busqueda-repositorios`
(panel casi nulo), **el jefe de importacion-modelo SÍ tiene interfaz**: el gesto
rey `importar` (editor-bloque) + el paso previo `buscar` (que alimenta la elección).
**Sí se materializa un `ImportacionModeloJefePanel`** — el último módulo de la
vertical 3D cierra el flujo de entrada de modelos con la cara real del dueño.

## Composición de la vista del jefe (3 capas)

```text
1. SELECCIONAR  — elegir el modelo a importar: o bien se pega la URL directa, o
                  se hace una búsqueda previa (_buscar → resultados unificados) y
                  se toca un resultado para llevarse su URL al editor.
2. INFORMARSE   — el resultado de la búsqueda (query → [resultados] con
                  repositorio/título/url/valoración) que alimenta la decisión de
                  elegir; la URL a importar + origen + categoría que se declaran.
3. DECLARAR     — la ÚNICA escritura del jefe:
                  · importar (editor-bloque: url + origen + categoria [+ nombre])
                    → dispara importacion.importar.request → la señal pareada
                    importacion.importada confirma (o el par de fallo avisa).
                  · (buscar es paso previo de lectura, no declaración).
```

### Frecuencia → jerarquía

- El gesto rey del JEFE es `importar` (editor-bloque: url + origen + categoría).
  La búsqueda (`_buscar`) es el informe previo que abre la decisión.
- Tras importar, la señal `importacion.importada` confirma y la vista del
  resultado (los modelos) vive en catalogo-modelos — este panel no acumula
  historial.
- No hay acciones destructivas ni transiciones de estado aquí: el puente solo
  ENTRADA (importar) + lectura previa (buscar).

## Formas UI canónicas (disección)

| Hoja (órgano) | Forma canónica | Nota |
|---|---|---|
| Importar modelo (JEFE) | `editor-bloque` | declaración multi-campo (url + origen + categoria [+ nombre]) — 1 modal, no fases; dispara `importacion.importar.request` |
| Buscar antes de importar (paso previo) | `formulario-puntual` / búsqueda inline | `_buscar(query)` → `busqueda.buscar.response` con resultados unificados; el jefe toca un resultado y lleva su URL al editor |
| Campo origen | `select` (printables/makerworld/cults3d/thingiverse/diseño propio) | default `desconocido` — declaración del jefe de de dónde viene |
| Campo categoría | `select` (desde `catalogo-modelos.categorias` o libre) | default `sin_categoria` — declaración del jefe |
| Confirmación de importación | `señal-refresh` | `importacion.importada` (éxito) / `importacion.importar.failed` (fallo tipado) — pareada a la hoja de declaración |
| "Historial de importaciones" | — | NO construible: puente sin store → [ABIERTO] (los modelos importados se ven en catalogo-modelos) |

**Toda hoja de DECLARACIÓN lleva su `señal-refresh` pareada** — aquí la
`importacion.importada` / `importacion.importar.failed`.

## Señales pareadas por hoja de declaración (verificadas en index.js)

Regla: sin señal, hoja inmadura. Nombres REALES de los publishers del módulo:

```text
importar (éxito) → importacion.importada  ✅ (onImportarRequest → _importar → publish 201)
importar (fallo) → importacion.importar.failed ✅ (par de fallo canónico; motivos tipados:
                   url_requerida · project_id_requerido · descarga_fallida ·
                   descargador_no_configurado · archivo_vacio · falta_3mf · registro_fallido)
buscar (delegado, éxito) → busqueda.buscar.response ✅ (vía RPC a busqueda.buscar.request)
buscar (delegado, fallo) → 502 BUSQUEDA_FALLO ✅ (_buscar si no responde)
refresco → importacion.importada / importacion.importar.failed ✅
```

## Huecos reales (todos de UI, todos del rol jefe)

1. **Editor de importación** — panel-jefe: editor-bloque para `importar` (url +
   origen + categoria [+ nombre]) con señal pareada `importacion.importada` /
   `importacion.importar.failed`. Es el ÚLTIMO eslabón real de la vertical 3D: el
   jefe introduce el modelo al taller.
2. **Búsqueda previa en la vista de importación** — caja de búsqueda
   (`_buscar(query)`) con resultados unificados, para que el jefe elija cuál
   importar sin salir del flujo (delega a `busqueda-repositorios`).

`[ABIERTO]` (decisiones del dueño, nombradas NO cerradas):
- (a) ¿Busca el dueño desde Enki o en el PC directamente? (define si la caja de
  búsqueda vive en la vista de importación).
- (b) Origen/categoría como select precargado (de catalogo-modelos.categorias) o
  texto libre.
- (c) Historial de importaciones — implicaría estado; probablemente innecesario.
- (d) Conversión `.stl`→`.3mf` — fuera de alcance hoy (solo se avisa `falta_3mf`).

## El deliverable hacia F7 (spec de construcción)

El panel del jefe para importacion-modelo = `ImportacionModeloJefePanel` compuesto
por:
- Editor de importación (`editor-bloque`): url + origen (select) + categoría
  (select) [+ nombre opcional] → dispara `importacion.importar.request`.
- Búsqueda previa inline (`formulario-puntual`): query → resultados unificados
  (delegado a `_buscar`/`busqueda.buscar.request`); tocar un resultado lleva su
  URL al editor.
- Señal pareada `importacion.importada` (feedback de éxito) y
  `importacion.importar.failed` (feedback de fallo con el motivo tipado, p.ej.
  `503 DESCARGADOR_NO_CONFIGURADO`, `422 FALTA_3MF`).
- El resultado (los modelos importados) se ve en la vista del catálogo
  (`catalogo-modelos`), no en una lista propia de este puente.

> **NOTA hacia F7 (sin materializar aquí):** `importar` es el ÚNICO handler RPC de
> `importacion-modelo` (`importacion.importar.request`). `_buscar` NO es un RPC
> expuesto del módulo — es una delegación interna que usa `busqueda.buscar.request`
> (el RPC `buscar` vive en `busqueda-repositorios`). Ningún `ui_handler` se
> materializa en module.json en este esquema (eso es del F7/registro).

## Puertos abiertos (cableables por el sitio)

- `accion_de_importacion` → hoy: `importacion.importar.request` (único RPC del
  módulo) → `importacion.importada` / `importacion.importar.failed`
- `delegado_de_busqueda` → hoy: `busqueda.buscar.request` (via `_buscar`, interno;
  el RPC buscar vive en busqueda-repositorios)
- `descargador` → hoy: puerto inyectado `registrarDescargador({ descargar(url) })`
  cableado por el puente thin del PC del dueño; sin él → `503`
- `lector_de_3mf` → hoy: `adaptador-slicing.leer_3mf.request` (metadatos del .3mf;
  si falla, quedan `null`)
- `destino_del_registro` → hoy: `catalogo-modelos.registrar.request` (el CUSTODIO
  que persiste el modelo; de ahí `catalogo.modelo_registrado`)
- `señal_de_resultado` → hoy: `importacion.importada` (éxito) /
  `importacion.importar.failed` (par de fallo, motivos tipados)

## Verificación contra index.js (agotado)

- **UN solo handler RPC: `onImportarRequest` (→ `_importar`), parado a
  `importacion.importar.response`.** No hay `listar`, `contar`, `registrar` propio,
  `obtener`, `historial`, `delete`, `update`. No hay `onProjectActivated` —
  **ausente por diseño** (puente sin estado/persistencia). Esto confirma que no hay
  entidad persistida ni cara de listado propia.
- **`_buscar` NO es handler RPC expuesto del módulo**: es una proyección interna
  (`_atender` no la registra; `module.json` `subscribes` solo tiene
  `importacion.importar.request`). Delega por `_rpc('busqueda.buscar.request')`;
  valida query (400 `INVALID_INPUT` si vacía); si `busqueda-repositorios` no
  responde → `502 BUSQUEDA_FALLO`. **El RPC `buscar` expuesto vive en
  `busqueda-repositorios`; aquí es delegación interna del flujo del dueño.**
- **`_importar`**: valida `url` (400 `url_requerida`) y `project_id` (400
  `project_id_requerido`); sin `_descargador` → `503 DESCARGADOR_NO_CONFIGURADO`;
  `descargador.descargar` lanza → `502 DESCARGA_FALLIDA`; sin archivo → `502
  ARCHIVO_VACIO`; formato `.stl` → `422 FALTA_3MF` (invariante 5, no se convierte);
  lee metadatos por `adaptador-slicing.leer_3mf.request` (metadatos `null` si
  falla → nombre `desconocido`); registra por `catalogo.registrar.request` (si no
  201 → `502 REGISTRO_FALLIDO`); éxito → `201` + `{modelo, importada:true}` + `publish
  importacion.importada`.
- **Publicadores reales**: `importacion.importada` (éxito, con `modelo_id`,
  `nombre`, `origen`, `archivo3mf`) y `importacion.importar.failed` (par de fallo
  canónico, motivos reales: `url_requerida`, `project_id_requerido`,
  `descarga_fallida`, `descargador_no_configurado`, `archivo_vacio`, `falta_3mf`,
  `registro_fallido`).
- **Invariantes**: `url`+`project_id` obligatorios (400); sin descargador → 503;
  `.stl` no se convierte → 422 `FALTA_3MF` (nunca se inventa); metadatos ausentes
  → `null`/`desconocido`; registro rechazado por el catálogo → 502; par de fallo
  siempre presente (todo flujo cierra su círculo).
- **Confirmado: importacion-modelo es un PUENTE sin estado ni persistencia, pero
  aloja la ÚNICA acción real de entrada de modelos del taller**: `importar`. Por
  eso este esquema declara SÍ una interfaz del jefe (`ImportacionModeloJefePanel`),
  a diferencia de `cupula-gcode`/`busqueda-repositorios` (conversores sin cara). El
  jefe importa de verdad: pega URL (o elige de la búsqueda), indica origen y
  categoría, y confirma el resultado con la señal pareada.
