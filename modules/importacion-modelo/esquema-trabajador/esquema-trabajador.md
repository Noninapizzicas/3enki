# Esquema maestro — importacion-modelo · ROL TRABAJADOR / OPERADOR

> Sujeto: la cara del **operador del taller (TRABAJADOR)** sobre el puente de
> importación de modelos 3D — o la ausencia honesta de la misma.
> Objetivo: **determinar qué necesita VER/DECIDIR el operador en
> importacion-modelo** — o, como puente de entrada que dispara el JEFE, si su cara
> es **casi nula** y lo que el trabajador hace de verdad vive en `ciclo-impresion`
> / `cola-impresion`, NO en la importación.
> Método: esquematizador universal (prisma de 5 huecos) con lente de rol
> TRABAJADOR/OPERADOR.
> Ley: agnosticismo (0 tecnologías nombradas en el análisis).
> Proyecto: 3d — taller personal de impresión 3D, uso propio, no vende (fase 0);
> imprime en la SPARKX i7 con PETG.
> Fuente de verdad: importacion-modelo es un **PUENTE** stateless (module.json
> `_doc`): sin store, sin persistencia, sin project.activated; escucha y delega.
> La importación de modelos es la decisión del JEFE (qué entra al catálogo), no
> una tarea operativa del worker.

## La lente TRABAJADOR aplicada a importacion-modelo (contraste con el JEFE)

Para el **JEFE**, `importacion-modelo` es donde **IMPORTA** (pega URL o elige de
la búsqueda, indica origen/categoría, dispara y espera `importacion.importada`):
la única escritura del flujo de entrada de modelos, con cara real (esquema-jefe).

Para el **TRABAJADOR/OPERADOR**, la pregunta honesta es **¿el operador del taller
importa modelos?** En un taller personal como este (fase 0, uso propio), la
respuesta es **NO**:

- **Importar es DECIDIR qué entra al repertorio del taller.** Qué modelos se
  adoptan del repositorio (o del diseño propio) como piezas imprimibles es una
  **decisión del JEFE**, no una tarea operativa del operador.
- **El operador ejecuta lo físico y vigila la máquina**: retira piezas, cambia
  filamento, vigila el progreso de la impresión. Todo eso vive en
  `ciclo-impresion` y `cola-impresion` — **NO en la importación**. El operador no
  baja modelos: los IMPRIME.
- **El puente lo dispara el JEFE** y el descargador real se cablea en el PC del
  dueño (puente thin). El worker no tiene acceso ni motivo para disparar la
  importación desde su puesto junto a la impresora.

```text
IMPORTACION-MODELO · ROL TRABAJADOR (la cara es CASI NULA)
│
├─ LA IMPORTACIÓN (lo que hace el módulo) ─────────────── es del JEFE ❌
│   ├─ importar → decide QUÉ modelo entra al catálogo (decisión del dueño)
│   ├─ dispara el puente, que delega (descarga · lee .3mf · registra)
│   └─ el descargador se cablea en el PC del dueño (no en el puesto del worker)
│
├─ EL TRABAJADOR JUNTO A LA IMPRESORA ────────────────── vive en CICLO/COLA ❌
│   ├─ retirar pieza · cambiar filamento · vigilar progreso  → ciclo-impresion
│   └─ ver qué pieza está en curso / qué sigue con su material → cola-impresion
│
└─ LO ÚNICO QUE EL OPERADOR PODRÍA VER AQUÍ ──────────── es un EFECTO, no una tarea
    └─ "una importación quedó registrada en el catálogo" → se ve en catalogo-modelos,
         no en este puente (no hay historial; puente stateless)
```

## Los 3 principios de agilidad (qué extrae el esquema, lente trabajador)

1. **No hay gesto frecuente del trabajador que jerarquizar aquí.** El operador no
   importa (es del jefe) y no vigila nada de la importación. Ninguna operación del
   módulo toca la rutina del worker junto a la impresora.
2. **Si algún día el operador viera el resultado de una importación**, sería
   porque el modelo entró al catálogo — y eso se ve en `catalogo-modelos`, que es
   el dueño del dato. El puente no persiste, así que no hay "historial de
   importaciones" que mostrarle al worker (ni a nadie) [ABIERTO].
3. **El puente se ve por su ACCIÓN de importación, que es del JEFE.** El
   trabajador no lee "este puente importó N modelos": ese efecto lo consume el
   dueño (o el catálogo) al decidir si imprimir la pieza. No es consumo del worker.

## El prisma de 5 huecos con lente TRABAJADOR (verificado contra index.js)

### 1 · IDENTIDAD — ¿Qué VIGILA/DECIDE el TRABAJADOR aquí?

- **NADA a nivel del rol trabajador.** El único handler RPC del módulo es
  `onImportarRequest` (→ `_importar`, publicación `importacion.importar.response`).
  `importar` es la cara de ENTRADA del pipeline y la ejerce el **JEFE** (esquema-jefe:
  "el jefe decide QUÉ modelo entra al taller"). No hay ninguna lectura pensada para
  el operador: no hay de qué vigilar en un puente stateless de entrada.
- **El worker NO tiene tarea aquí.** Su operación ejecutora real (retirar pieza,
  cambiar filamento, vigilar progreso) vive en `ciclo-impresion`; su vigilancia de
  "qué imprimir / preparar el material" vive en `cola-impresion` (cara `listar` /
  `longitud`). La importación de modelos no es parte de su rutina.
- **NEUTRO**: no hay `project.activated` (puente sin persistencia). Nada del sistema
  que el worker deba operar aquí.

**Conclusión de identidad**: el rol TRABAJADOR de importacion-modelo no tiene
decisión ni vigilancia propia. Su cara es **casi nula** — es un paso del flujo de
entrada que dispara el JEFE, sin proyección de lectura para el operador.

### 2 · RESTRICCIONES — ¿Qué NO depende del TRABAJADOR?

- **`importar` NO es del trabajador** — es la decisión del JEFE de qué modelo entra
  al catálogo (`onImportarRequest → _importar`). El operador no baja piezas, no elige
  origen/categoría, no adopta modelos.
- **`_buscar` NO es del trabajador** — es el paso previo del JEFE (delegación interna
  a `busqueda-repositorios`; el RPC `buscar` vive allí). El worker no busca modelos
  para el repertorio.
- **El descargador se inyecta** (`registrarDescargador`) y lo cablea el puente thin
  del PC del dueño (o un adaptador HTTP). Sin él → `503 DESCARGADOR_NO_CONFIGURADO`.
  Es restricción del SISTEMA, no del worker ni de la UI.
- **El formato `.stl` sin `.3mf` → `422 FALTA_3MF`** (invariante 5, no se convierte).
  El juez del formato es el MÓDULO/no inventa; no es decisión del operador.
- **La operación física NO vive aquí**: retirar pieza, cambiar filamento, vigilar
  progreso son de `ciclo-impresion`; preparar material ante la cinta es de
  `cola-impresion`. El worker pasa por importacion-modelo **cero veces** en su rutina.
- El puente no persiste → no hay estado que el worker consulte ni historial que ver.

### 3 · CONTRATO — ¿Qué necesita VER el TRABAJADOR y qué SEÑAL confirma?

**VER (el operador):** **NADA en este puente.** No hay lectura servida para el
worker y no hay qué consultar en un puente stateless de entrada.

**SEÑALES de confirmación (pareadas, verificadas en index.js):**
| Acción | Señal | ¿Del trabajador? |
|---|---|---|
| `importar` → éxito | `importacion.importada` | ❌ la dispara el JEFE; el worker no la produce ni la espera |
| `importar` → fallo | `importacion.importar.failed` (par canónico) | ❌ el destino del fallo es el JEFE/consola, no el worker |
| `_buscar` (delegado) | `busqueda.buscar.response` | ❌ paso previo del JEFE, no del worker |

> Nota de honestidad: el Efecto de una importación (el modelo quedó registrado) lo
> "ve" el operador recién en `catalogo-modelos` cuando toca imprimir esa pieza — y
> aun así lo consume vía catálogo/ciclo, **no como un panel de importación**. No hay
> señal consumida por el worker en este puente.

### 4 · NO-OBJETIVOS — ¿Qué caras NO son del TRABAJADOR?

- **JEFE** (decidir/importar): `importar` es la cara de decisión exclusiva del dueño.
  No se traspasa al worker.
- **CLIENTE** (elegir/encargar pieza): NO existe — taller de uso propio, no vende (fase 0).
- **Operación física de la impresora** (retirar, cambiar filamento, vigilar) — vive
  en `ciclo-impresion`, no aquí.
- **Vigilancia de la cinta / preparar material** — vive en `cola-impresion`
  (`listar`/`longitud`), no en la importación.
- **SISTEMA**: sin store → sin health/persistencia que informar al worker.

### 5 · PREGUNTAS_ABIERTAS — huecos [ABIERTO] (se nombran, no se cierran)

- (a) **¿Hay algún momento en que el operador ve "el resultado de una importación"?**
  SÍ — cuando el modelo aparece en el catálogo y llega a la cola/ciclo para imprimirse.
  Pero eso lo ve en `catalogo-modelos` (entidad) y `ciclo-impresion` (tarea física),
  NO aquí. El puente no tiene estado que proyectar al worker.
- (b) **¿Importaría el trabajador si el taller creciera?** Hoy (fase 0, uso propio)
  la importación es decisión del jefe. Si el taller tuviera operadores dedicados que
  gestionaran el repertorio, la importación podría repensarse — decisión de NEGOCIO,
  no un requisito de este esquema. Se nombra, no se cierra.
- (c) **Historial de importaciones** — el puente no persiste; no hay nada que el
  worker (ni el jefe) consulte como lista. De quererse, exigiría otro módulo con
  estado [ABIERTO, mismo hueco que esquema-jefe].

## Veredicto del ÁRBITRO (lente-roles) — CLASIFICACIÓN para el TRABAJADOR

Pregunta árbitro: ¿escribe en el pipeline / decide qué entra al catálogo → JEFE ·
¿opera el flujo (importa, busca, vigila una entrada) → TRABAJADOR · ¿solo informa →
NEUTRO?

| Op | Veredicto | Por qué |
|---|---|---|
| `importar` (`onImportarRequest → _importar`) | **JEFE** (NO trabajador) | La única acción del módulo y la única escritura del flujo de entrada. El operador NO baja modelos: eso es decisión del dueño (qué entra al repertorio). |
| `_buscar` (delegación a busqueda-repositorios) | **JEFE** (NO trabajador) | Paso previo del flujo del dueño antes de importar. El worker no busca ni elige modelos para el taller. |
| "Ver el resultado de una importación" | — (no es cara de este puente) | El efecto (modelo registrado) se ve en `catalogo-modelos` y se consume en el ciclo. No hay proyección aquí para el worker. |
| `project.activated` | — (ausente) | No hay handler en index.js; puente sin persistencia (nada que restaurar). |

**Conclusión del árbitro (honesta y CLAVE):** a diferencia de `cola-impresion`,
donde el trabajador al menos LEE la cinta (`listar`/`longitud`) para preparar la
impresora, el **trabajador en importacion-modelo tiene cara CASI NULA**. Su única
tarea concreta y ejecutora — importar, vigilar una importación — no existe para él:
la importación es del JEFE. El operador **no pasa por este puente en ningún punto
de su rutina**.

## Composición de la vista del TRABAJADOR (3 capas)

```text
1. SELECCIONAR  — (no aplica): sin entidades que listar/enumerar de este puente
                  y sin tarea del worker que exija elegir nada aquí.
2. INFORMARSE   — (no aplica): ninguna lectura de importacion-modelo está pensada
                  para el operador; su información de trabajo vive en la cinta
                  (cola-impresion) y en el ciclo/stock.
3. DECLARAR     — NO HAY: el worker no importa (JEFE), no busca (JEFE), no dispara
                  nada en este puente. Cero gestos de escritura del operador.
```

## Formas UI canónicas (disección, lente trabajador)

| Hoja (órgano) | Forma canónica | Nota |
|---|---|---|
| (Ninguna del worker) | — | El único gesto del módulo (`importar`) es JEFE; no hay hoja de lectura ni de escritura del operador aquí |
| "Ver modelos importados / resultado" | — | NO construible en este puente (stateless) y NO del worker: se ve en `catalogo-modelos` [ABIERTO] |

**Ninguna hoja de DECLARACIÓN ni de LECTURA madura para el worker aquí.** No hay
`señal-refresh` que el worker consuma de este módulo.

## Señales pareadas (verificadas en index.js)

Regla: sin señal, hoja inmadura. Nombres REALES del módulo — ninguna es del worker:

```text
importar (éxito)   → importacion.importada        ✅  la dispara el JEFE, no el worker
importar (fallo)   → importacion.importar.failed   ✅  par de fallo canónico del JEFE
_buscar (delegado) → busqueda.buscar.response      ✅  paso previo del JEFE, no del worker
refresco           → importacion.importada / failed ✅  EMITIDAS por el JEFE (onImportarRequest → publish);
                                                     el worker NO las consume en ningun punto de su rutina
```

## Huecos reales para el TRABAJADOR (honestos)

**NO hay huecos de construcción para el worker.** Los huecos de este módulo son
todos del rol JEFE (editor de importación + búsqueda previa, ya esquematizados en
`esquema-jefe.md`). El trabajador no tiene panel que materializar aquí.

`[ABIERTO]` (decisiones de dueño/sitio, NO del worker):
- (a) El resultado de la importación "lo ve" el worker indirectamente en el catálogo.
- (b) Si el negocio cambia de modelo de operación (operadores que gestionen el
  repertorio), la importación podría repensarse; hoy es JEFE.
- (c) Historial de importaciones — requeriría estado y otro módulo; hoy improbable.

## El deliverable hacia F7 (spec de construcción)

**NO hay un `ImportacionModeloTrabajadorPanel`.** La cara del TRABAJADOR de
importacion-modelo es **casi nula** y se DECLARA **AUSENTE** de forma deliberada
(no se inventa una tarea operativa de importación que no existe). Concretamente
para F7:

- **No materializar ningún panel del worker para importacion-modelo.** El único RPC
  (`importar`) es del JEFE (decisión de qué entra al catálogo) y ya tiene su cara
  en `esquema-jefe` (`ImportacionModeloJefePanel`).
- **Lo que el operador ve de una importación** (que una pieza entró al catálogo y
  está lista para imprimir) lo consume en `catalogo-modelos` (entidad) y
  `ciclo-impresion` (tarea física) — no es un panel de este puente.
- **El trabajador del taller personal** no pasa por importacion-modelo: su rutina
  (vigilar la cinta, preparar material, retirar, cambiar filamento) vive en
  `cola-impresion` / `ciclo-impresion`.

> **NOTA hacia F7 (sin materializar aquí):** NINGÚN `ui_handler` del rol trabajador
> se añade a module.json en este esquema. El `ui_handler` existente del módulo
> (`action: importar`, zone `barra_modulos`, cara jefe) se mantiene tal cual — es del
> JEFE, no se duplica ni se rota al worker.

## Puertos abiertos (cableables por el sitio)

- `accion_de_importacion` → hoy: `importacion.importar.request` (único RPC) —
  **consumido por el JEFE**, jamás por el worker.
- `señal_de_resultado` → hoy: `importacion.importada` / `importacion.importar.failed`
  (pareadas al gesto del jefe; el worker no las escucha para operar).
- `descargador` → hoy: puerto inyectado `registrarDescargador({ descargar(url) })`
  cableado por el puente thin del PC del dueño; sin él → `503`.
- `lector_de_3mf` / `destino_del_registro` → `adaptador-slicing.leer_3mf.request` /
  `catalogo.registrar.request` (delegaciones internas de `_importar`).
- **Ningún puerto de LECTURA del trabajador expuesto por este módulo** — el worker
  se sirve de `cola-impresion.listar/longitud` y de `ciclo-impresion`, no de aquí.

## Verificación contra index.js (agotado)

- **UN solo handler RPC: `onImportarRequest` (→ `_importar`), parado a
  `importacion.importar.response`.** No hay `listar`, `contar`, `obtener`,
  `historial`, `update`, `delete` — no existe NINGUNA proyección de lectura que un
  rol trabajador pudiera consumir. No hay `onProjectActivated` (puente sin estado).
- **`importar` NO tiene componente operativo para el worker**: valida `url`/`project_id`
  (400), sin descargador → `503 DESCARGADOR_NO_CONFIGURADO`, descarga fallida →
  `502 DESCARGA_FALLIDA`, `.stl` → `422 FALTA_3MF` (invariante 5, no se convierte),
  registro rechazado por catálogo → `502 REGISTRO_FALLIDO`. Todo el flujo es del JEFE
  y del sistema; ninguna ruta toca el puesto del operador.
- **`_buscar` NO es handler RPC del módulo**: es delegación interna a
  `busqueda.buscar.request` (el RPC `buscar` vive en busqueda-repositorios). Es el
  paso previo del JEFE, no trabajo del worker.
- **Publicadores reales**: `importacion.importada` y `importacion.importar.failed`
  (par de fallo canónico). Emitidos desde `_importar`, que solo dispara el JEFE.
- **Confirmado: importacion-modelo es un PUENTE stateless cuya única acción
  (`importar`) es del JEFE.** El trabajador/operador del taller NO importa modelos
  (esa es la decisión de qué entra al catálogo, del dueño) y NO tiene proyección de
  lectura aquí — su rutina ejecutora y de vigilancia vive en `ciclo-impresion` /
  `cola-impresion`. Por eso este esquema declara **AUSENTE** el panel del trabajador,
  igual que `cupula-gcode`/`busqueda-repositorios` declararon ausente el del jefe,
  en lugar de inventar una interfaz que el rol no pide.
