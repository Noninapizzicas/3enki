# Esquema maestro — gestion-filamento · ROL TRABAJADOR / OPERADOR

> Sujeto: la cara de **LECTURA / OPERACIÓN del STOCK de filamento** para el
> **operador del taller (TRABAJADOR)** — quien está físicamente junto a la
> SPARKX i7, cambia el rollo de la impresora y necesita saber **lo que queda en
> el taller** para tener material a mano.
> Objetivo: **interfaz de VISOR del stock** — VER qué rollos hay (tipo, color,
> longitud restante), cuál está bajo el umbral (para tener repuesto a mano),
> cuál es el activo (cargado en la impresora) y si hay material para la pieza
> que toca imprimir, con lectura directa y sin gestos de escritura.
> Método: esquematizador universal (prisma de 5 huecos) con lente de rol
> TRABAJADOR.
> Ley: agnosticismo (0 tecnologías nombradas en el análisis).
> Proyecto: 3d — taller personal de impresión 3D, uso propio, no vende (fase 0);
> imprime con PETG en la SPARKX i7; la impresora reporta `filament_used` en mm.
> Cuello de botella: el filamento es consumible finito — un rollo se agota; el
> operador debe saber si queda filamento para la pieza en curso y cuándo el
> rollo activo está por agotarse (esquema fase 2).

## La lente TRABAJADOR aplicada a gestion-filamento (contraste con el JEFE)

Para el **JEFE**, `gestion-filamento` es donde **DECLARA** (registrar un rollo
nuevo: alta con tipo, color, longitud inicial y el toggle de activo) y **ve el
panorama** (el stock para decidir si repone). Para el **TRABAJADOR/operador**,
el mismo módulo es el **visor del stock del taller**: no da de alta rollos, lo
**VIGILA** para operar la impresora.

Contraste honesto con la lente JEFE (ya lo intuyó el esquema-jefe, y es lo mismo
que en `cola-impresion`): el jefe **DECIDE y gestiona el inventario** (qué rollo
entra, cuál carga); el trabajador **EJECUTA lo físico y ve lo concreto del
stock** — qué rollos hay, cuánto queda de cada uno, cuál está por agotarse y
cuál es el activo, para tener el repuesto correcto y saber si el rollo cargado
alcanza para la próxima pieza.

```
GESTION-FILAMENTO · ROL TRABAJADOR (operador del taller, junto a la impresora)
│
├─ VER EL STOCK (la cara real del trabajador aquí) ─────── 100% del trabajo
│   ├─ Cinta de rollos (tipo, color, longitud restante) · reflejo (listar)
│   │     → ¿qué hay en el taller? ¿alcanza para la pieza que toca?
│   ├─ Badge "bajo" (rollo por debajo del umbral, ≤5000mm) · reflejo (listar → bajo)
│   │     → qué rollo está por agotarse, para tener repuesto a mano
│   ├─ Badge "activo" (rollo cargado en la impresora) · reflejo (listar → activo)
│   │     → qué rollo está gastando la máquina ahora (lo que decrementa el sistema)
│   └─ Cinta de pulso (n rollos · k bajo · cuál activo) · reflejo (listar)
│
├─ (NO hay escritura del trabajador) ──────────────────────── registrar es JEFE ❌
│   · el operador NO da de alta rollos — eso es del dueño
│   · el decremento es AUTOMÁTICO (por evento filamento.usado de la impresora) —
│     el trabajador NO decrementa a mano
│
└─ DECIDIR EL ACTIVO (qué rollo va cargado) ────────────────── es del JEFE ❌
    · 'activo' vive SOLO como campo de registrar, sin RPC propio — [ABIERTO]
    · el trabajador VE cuál es el activo, pero hoy NO puede re-marcarlo él
```

## Los 3 principios de agilidad (qué extrae el esquema, lente trabajador)

1. **El stock ES la instrucción.** El operador no navega ni busca: la cinta de
   rollos le dice qué hay, cuánto queda y cuál está por agotarse (`bajo` →
   tener repuesto), y qué rollo está consumiendo la impresora (`activo`). Un
   vistazo → saber si el material alcanza para la próxima pieza y cuándo
   cambiar el rollo. Sin formularios, sin decisión.
2. **Lectura directa, cero recargas.** `listar` es un RPC de lectura pura: la
   vista re-lee en cada consulta y se refresca por las **señales que emite el
   sistema/impresora y el jefe** (`filamento.registrado`, `filamento.decrementado`,
   `filamento.bajo`, `filamento.decrementar.failed`). El trabajador nunca
   dispara una mutación, solo consume — igual que en `cola-impresion`.
3. **El stock visible ES el estado del taller.** El operador no opera el
   decremento (lo hace la impresora por evento); no da de alta rollos (lo hace
   el jefe). Su cara aquí es de **LECTOR del stock** para operar la impresora;
   la operación de cambio físico del rollo en la máquina es del taller (no vive
   en este custodio).

## El prisma de 5 huecos con lente TRABAJADOR (verificado contra index.js)

### 1 · IDENTIDAD — ¿Qué VIGILA/CONSULTA el TRABAJADOR aquí?

- **El stock completo de rollos** (`listar` → `_listar`): `{filamentos[], total}`,
  cada rollo con `tipo`, `color`, `longitud_inicial`, `longitud_restante`,
  `activo`, `bajo`. Es lo que el operador ve para operar: qué hay, cuánto queda,
  qué está por agotarse y cuál está cargado.
- **Qué rollo está BAJO el umbral** (`listar → bajo`), derivado de
  `longitud_restante <= umbralBajo` (5000mm) — para tener el repuesto correcto a
  mano antes de que se agote el rollo cargado.
- **Qué rollo está ACTIVO (cargado en la impresora)** (`listar → activo`) — el
  que el sistema decrementa cuando la impresora reporta `filament_used`; le dice
  cuál va a gastar para planificar el siguiente cambio.
- **Si hay material para la próxima pieza** — cruzar el `longitud_restante` del
  rollo correcto (tipo/color) contra lo que necesita la pieza (que vive en
  cola/ciclo), para saber si el rollo activo alcanza o si hay que preparar otro.
- **NEUTRO a la acción**: el trabajador no registra, no decrementa, no marca
  activo — solo VE el stock y actúa físicamente sobre la impresora.

### 2 · RESTRICCIONES — ¿Qué NO depende del TRABAJADOR?

- **`registrar` NO es del trabajador** — es la escritura del CUSTODIO del JEFE
  (append + emite `filamento.registrado`). El operador no da de alta rollos.
- **El decremento NO lo dispara el trabajador a mano**: llega por evento
  `filamento.usado` de la impresora (`onFilamentoUsado`) contra el **rollo
  activo**. Es del SISTEMA. Si no hay rollo activo, no se decrementa (honesto,
  `if (!activo) return`). El trabajador solo ve el stock reflejado después.
- **Invariante 9**: el filamento NO se decrementa sin rollo o con longitud
  desconocida — devuelve `filamento.decrementar.failed` (404 `RESOURCE_NOT_FOUND`
  si el rollo no existe; 409 `LONGITUD_DESCONOCIDA` si `longitud_restante === null`).
  El juez es el módulo, no la UI del trabajador.
- **`activo` (qué rollo va cargado) es decisión del JEFE** y hoy solo se fija
  como **campo de `registrar`** (`activo: input.activo === true`). NO hay RPC
  `marcar_activo`/`cambiar_activo` en index.js. El trabajador VE cuál es el
  activo, pero no tiene gesto para re-marcarlo — **es un hueco [ABIERTO]**, no
  un defecto (documentado abajo).
- El custode del store es el PROPIO módulo (`Map<id,Filamento>`). El trabajador
  **no edita ni borra** un rollo (append-only, sin op de update/delete).
- El umbral de filamento bajo (5000mm) es una constante del constructor
  (pregunta abierta 5 del plan) — el trabajador NO lo ajusta desde la
  interfaz. [ABIERTO].
- La persistencia por proyecto es del sistema (pos-persistencia), no de la UI.
- La operación física de cambiar el rollo en la impresora **no vive aquí** — es
  del taller/ciclo de impresión (en `ciclo-impresion` vive la confirmación
  `filamento_cambiado`), no de este custodio.

### 3 · CONTRATO — ¿Qué necesita VER el TRABAJADOR y qué SEÑAL confirma?

**VER (para operar la impresora):**
- `listar` (`{filamentos[], total}`) — el stock del proyecto: cada rollo con
  `tipo`, `color`, `longitud_inicial`, `longitud_restante`, `activo` (cuál está
  cargado) y `bajo` (cuál cae bajo el umbral). Es la cara de vigilancia del
  trabajador: qué hay, cuánto queda y qué está por agotarse/activo.

**SEÑALES de confirmación (pareadas, verificadas en index.js):**
| Acción | Señal | Verificado |
|---|---|---|
| `listar` | (lectura) la vista re-lee, nunca recarga | ✅ RPC de lectura puro (`onListarRequest → _listar`) |
| el trabajador NO muta | (no emite, no recibe señal de refresco de mutación propia) | ✅ sin op de escritura del worker |
| refresco del stock | `filamento.registrado` / `filamento.decrementado` / `filamento.bajo` / `filamento.decrementar.failed` | ✅ emitidas por el MODULO/impresora (`_registrar → publish`, `_decrementar → publish`, `_detectarBajo → publish`) — el worker las recibe para ver cambiar el stock, pero NO las dispara |

Nota de honestidad: `filamento.decrementado` y `filamento.bajo` los dispara la
IMPRESORA (evento `filamento.usado`), no un botón del trabajador ni del jefe. El
panel del operador se REFRESCA con ellos (la cinta del stock se actualiza sola
tras cada impresión y avisa cuando un rollo cae bajo el umbral), pero el
trabajador no los dispara: son el reflejo del consumo físico que él ve para
preparar el repuesto. Sobre el `filamento.decrementar.failed` (p.ej. rollo
activo con longitud desconocida), el operador debería ver un aviso de que el
stock no pudo decrementarse — pero es información, no una acción suya.

### 4 · NO-OBJETIVOS — ¿Qué caras NO son del TRABAJADOR?

- **JEFE** (declarar/gestionar inventario): `registrar` (dar de alta rollos con
  tipo/color/longitud/activo) es del dueño. La **decisión de qué rollo va
  cargado** (`activo` en `registrar`) también es del jefe. El trabajo de
  DECISIÓN se separa del árbol del worker.
- **CLIENTE** (comprar filamento / pedir piezas): NO existe — taller de uso
  propio, no vende (fase 0).
- **SISTEMA**: el decremento por evento de la impresora (`filamento.usado`), la
  persistencia (`project.activated`, pos-persistencia) — informa/ejecuta, no
  opera.
- **Operación física del cambio de rollo / arranque de la impresora / vigilancia
  del progreso**: vive en `ciclo-impresion` (confirmación `filamento_cambiado`),
  NO aquí. Aquí el trabajador SOLO lee el stock de filamento para tener material.
- **Comprar filamento automáticamente / pesar filamento** — fuera de alcance
  (misma restricción que el jefe).

### 5 · PREGUNTAS_ABIERTAS — huecos [ABIERTO] (se nombran, no se cierran)

- (a) **El TRABAJADOR podría necesitar "marcar activo" físicamente** — cuando el
  operador monta otro rollo en la impresora después de un cambio de filamento
  (confirmado en `ciclo-impresion`), hoy `activo` solo lo fija el jefe vía
  `registrar` (no hay RPC `marcar_activo`). Decisión del dueño: ¿debe el
  operador poder re-marcar qué rollo está cargado, o eso siempre cae en
  `registrar` del jefe? [ABIERTO] (mismo hueco (a) del jefe).
- (b) **Fuente de verdad de "qué rollo está cargado"** — si tanto el jefe
  (`registrar` con `activo:true`) como un flujo del taller (cambio físico de
  rollo) pueden marcar el activo, hay que decidir quién es la fuente de verdad
  de "cuál está en la impresora" (mismo hueco (f) del jefe).
- (c) **Configurar el umbral de filamento bajo** — hoy 5000mm fijo en el
  constructor; el trabajador tampoco lo ajusta. [ABIERTO] (pregunta del dueño).
- (d) **El stock solo decrementa por evento** — un rollo con longitud
  desconocida (`null`) nunca se podrá decrementar (invariante 9). El trabajador
  podría querer corregir una longitud mal declarada o ver el rollo que queda
  "congelado"; no hay op de actualizar `longitud_restante` a mano. [ABIERTO]
  (mismo (d) del jefe).
- (e) **Rollo agotado (longitud 0)** — no hay op de retirar un rollo agotado del
  stock ni marcarlo como gastado sin borrarlo. El operador lo ve con
  `bajo:true`/`longitud_restante:0`. ¿Retirarlo del stock activo? [ABIERTO]
  (mismo (e) del jefe).
- (f) **Stock frente a pieza en curso** — el trabajador necesita saber si el
  rollo activo (tipo/color) alcanza para la pieza que toca (vive en cola/ciclo).
  Aquí solo ve el `longitud_restante`; el cruce "necesito X mm para la pieza Y"
  es del esquema fase 2 / otros módulos. ¿Presentar ese cruce aquí o vivirlo en
  la vista de ciclo? Decisión de sitio.

## Veredicto del ÁRBITRO (lente-roles) — CLASIFICACIÓN para el TRABAJADOR

Pregunta árbitro: ¿escribe en el store / decide el futuro del stock → JEFE ·
¿lee el stock a diario para operar → TRABAJADOR · ¿solo informa → NEUTRO?

| Op | Veredicto | Por qué |
|---|---|---|
| `registrar` | **JEFE** (NO trabajador) | La ÚNICA escritura del custodio: da de alta un rollo (append + emite `filamento.registrado`). El operador NO da de alta rollos — lo decide el dueño. |
| `decrementar` | **NEUTRO (automatizado)** | Lo dispara la impresora por evento `filamento.usado` contra el rollo activo (`onFilamentoUsado`), no el trabajador (ni el jefe). Emite `filamento.decrementado`/`filamento.bajo`. El trabajador NO lo ejerce como op de UI. |
| `listar` | **TRABAJADOR** ✅ | El STOCK del taller (tipo/color/longitud restante/activo/bajo) — lo que el operador ve para operar la impresora. RPC directo `onListarRequest → _listar`. |
| `activar rollo` (marcar activo) | JEFE (decisión) — hoy **sin RPC propio** | Es decisión del jefe qué rollo está cargado, pero hoy `activo` vive SOLO como campo de `registrar`. No hay `onMarcarActivo`. El trabajador VE el activo pero no lo re-marca. [ABIERTO]. |
| `project.activated` | neutro | Restaura persistencia — sistema, no UI. |

**Conclusión del árbitro (honesta y CLAVE):** al igual que en `cola-impresion`
—y a diferencia de `ciclo-impresion`, donde el trabajador EJECUTA
confirmaciones físicas—, el trabajador en `gestion-filamento` es un **LECTOR
casi puro del stock**. Su cara es `listar` (la cinta de rollos del taller: qué
hay, cuánto queda, cuál está bajo y cuál activo). **NO toca `registrar`** (alta
del jefe) **ni `decrementar`** (lo hace la impresora por evento). No hay op RPC
para marcar el activo — eso es del jefe y hoy solo vive en `registrar`
[ABIERTO]. El operador vigila el stock para preparar el material y saber qué
rollo poner/cambiar en la impresora, pero no modifica el inventario ni decide
cuál está cargado. Su cara ejecutora real (confirmar el cambio de filamento
físico) NO vive en este módulo, sino en `ciclo-impresion`.

## Composición de la vista del TRABAJADOR (capa única)

```
1. VER — el stock del taller (capa única):
          · Cinta de rollos (tipo, color, longitud restante, "bajo", "activo")
                                       → `listar`
          · Badge "activo"              → dentro de `_listar` (activo)
          · Badge "bajo"                → dentro de `_listar` (bajo)
          · Cabecera de pulso (n rollos · k bajo) → `listar`
          Toda lectura: RPC puro; la vista re-lee, refrescada por las señales
          filamento.registrado / filamento.decrementado / filamento.bajo /
          filamento.decrementar.failed que EMITE el módulo/impresora (el worker
          NO las dispara).
```

### Frecuencia → jerarquía

- El gesto rey del TRABAJADOR es **ver el stock** (`listar`): qué rollos hay,
  cuánto queda del activo, cuál está por agotarse (`bajo`) — lo que desbloquea
  la preparación del repuesto y del cambio de rollo.
- El **badge "bajo"** es la parte reactiva: un rollo que cae bajo el umbral
  debería avisarle al operador "prepara repuesto" (señal `filamento.bajo`).
- **NO hay acción de declaración ni de decisión del worker** — no registra
  (JEFE), no decrementa (impresora), no marca activo (JEFE, [ABIERTO]). Su
  "acción" física (cambiar el rollo) vive en `ciclo-impresion`.

## Formas UI canónicas (disección, lente trabajador)

| Hoja (órgano) | Forma canónica | Nota |
|---|---|---|
| Cinta del stock (capa única) | `cinta-estado`/cinta | `listar` — rollos con tipo/color/longitud restante; badges `activo` y `bajo` en cada tarjeta; lo que el operador lee para operar |
| Cabecera de pulso | `cinta-estado` | `listar` — "n rollos · m bajo umbral" |
| Badge "rollo activo" | `ref-select`/badge | `listar → activo` — cuál está cargado en la impresora (lo que el sistema está gastando) |
| Badge "rollo bajo" | `cinta-estado`/aviso | `listar → bajo` + señal `filamento.bajo` — alerta reactiva "ten repuesto a mano" |
| Detalle del rollo | `cinta-estado`/informe | tipo, color, longitud_inicial/restante, activo, bajo, created_at |
| (El worker NO declara) | — | sin `editor-bloque`, sin `confirmador`: el worker no tiene escrituras ni disparos aquí (ese editor `registrar` es del JEFE) |

## Señales pareadas por hoja (verificadas en index.js)

Regla: sin señal, hoja inmadura. Nombres REALES del módulo (el worker solo LEE):

```
listar      → (lectura) la vista re-lee, nunca recarga ✅  RPC onListarRequest → _listar
(refresco)  → filamento.registrado / filamento.decrementado / filamento.bajo /
              filamento.decrementar.failed  ✅
              EMITIDAS por el módulo/impresora (_registrar/_decrementar/_detectarBajo
              → publish); el worker las recibe para ver cambiar el stock, pero NO las dispara
registrar   → (NO del worker) ❌  escritura exclusiva del JEFE
decrementar → (NO del worker) ❌  lo dispara la impresora por evento filamento.usado
activar rollo (marcar activo) → ⚠️ [ABIERTO] sin op RPC ni evento en index.js
```

## Huecos reales para el TRABAJADOR (honestos)

El panel del trabajador en gestion-filamento es **mínimo**: es una cara de
LECTURA del stock, casi sin piel propia. Los huecos reales:

1. **Cinta del stock** — `cinta-estado` vía `listar`: qué rollos hay (tipo,
   color, longitud restante), qué está bajo el umbral y cuál es el activo. Cero
   escrituras.
2. **Alerta de "rollo bajo"** — señal `filamento.bajo` como aviso reactivo
   ("ten repuesto a mano"): el operador ve cuándo un rollo (normalmente el
   activo) cae bajo el umbral sin tocar nada.
3. **[MATIZ] Ausencia de "marcar activo"** — si el operador cambia el rollo en
   la impresora (y lo confirma en `ciclo-impresion`), hoy NO tiene gesto para
   decirle al custodio "ahora el activo es este otro"; eso solo lo puede el jefe
   vía `registrar`. En un taller de uso propio jefe=operador=dueño, el panel del
   jefe puede mostrar el alta con el toggle `activo`; el del worker es SOLO ver
   el stock. Si se da al operador la marca del activo, sería un RPC nuevo
   [ABIERTO].
4. **[MATIZ] Embebido o autónomo** — el operador aquí solo lee el stock; la
   vía más honesta puede ser que la cinta de filamento (`listar`) se integre en
   la vista de `ciclo-impresion` (ver si el rollo activo alcanza mientras se
   ejecuta / cambia el rollo) en vez de un panel aparte.

`[ABIERTO]` (decisiones del sitio/dueño, NO del worker):
- (a) **Marcar el rollo ACTIVO sin re-registrar** — hoy solo en `registrar` del
  jefe, sin RPC propio. ¿El operador puede re-marcar qué está cargado tras un
  cambio físico de rollo?
- (b) **Fuente de verdad de "qué rollo está cargado"** — jefe (`activo:true` en
  registrar) vs flujo del cambio físico en el taller.
- (c) **Configurar el umbral de filamento bajo** (hoy 5000mm fijo en el
  constructor).
- (d) **Ajuste manual de `longitud_restante`** — no hay op de corregir un rollo
  con longitud desconocida (que no se puede decrementar).
- (e) **Retirar un rollo agotado** del stock activo sin borrarlo del histórico.
- (f) **Cruce stock ↔ pieza en curso** — ¿presentar aquí si el rollo activo
  alcanza para la pieza que toca o vivirlo en la vista de ciclo?

## El deliverable hacia F7 (spec de construcción)

El panel del TRABAJADOR para gestion-filamento = `FilamentoWorkerStock` compuesto por:
- Cabecera de pulso (n rollos · m bajo umbral) vía `listar`.
- Cinta del stock (`listar`): tarjetas con tipo, color, longitud_restante,
  badge "activo" (lo que gasta la impresora) y badge "bajo" (ten repuesto a
  mano).
- Detalle del rollo al tocar una tarjeta.
- **Alerta reactiva de "bajo"** — señal `filamento.bajo` como aviso de preparar
  repuesto.
- **Sin escrituras ni disparos** — el worker NO registra (`registrar` JEFE), NO
  decrementa (impresora), NO marca activo (JEFE, [ABIERTO]). Todas las
  consultas: RPC de lectura; la vista re-lee, refrescada por `filamento.registrado`
  / `filamento.decrementado` / `filamento.bajo` / `filamento.decrementar.failed`
  (emitidas por el módulo/impresora). Nunca recarga.
- **Posible embebido**: si el sitio decide integrar la cinta de filamento en
  `ciclo-impresion`, este panel queda como especificación de la cinta a
  reutilizar, no como panel independiente.

> **NOTA hacia F7 (sin materializar aquí):** `listar` es un RPC request/response
> de lectura (`filamento.listar.response`) — la vista emite el request y
> re-lee. `registrar` / `decrementar` NO son caras del worker (JEFE / sistema).
> **NINGÚN `ui_handler` se materializa en module.json en este esquema** (eso es
> del F7/registro).

## Puertos abiertos (cableables por el sitio) — puertos de LECTURA del worker

- `fuente_del_stock` → hoy: `filamento.listar` (la cinta de rollos con
  tipo/color/longitud restante/activo/bajo)
- `señal_de_refresco` → hoy: `filamento.registrado` · `filamento.decrementado` ·
  `filamento.bajo` · `filamento.decrementar.failed` (recibidas NO emitidas por el
  worker)
- `escritores_del_stock` → NO son del worker: `filamento.registrar` (JEFE);
  `filamento.decrementar` / `filamento.usado` (sistema/impresora)
- `marcador_del_activo` → hoy: NO existe como RPC (el activo solo se fija en
  `registrar` del jefe) — [ABIERTO]

## Verificación contra index.js (agotado)

- **Handlers reales**: `onRegistrarRequest` (JEFE), `onDecrementarRequest`
  (sistema/impresora), `onListarRequest` (TRABAJADOR), `onFilamentoUsado`
  (fire-and-forget; decrementa el rollo activo), `onProjectActivated` (restaura
  persistencia) — todos presentes y mapeados (module.json `subscribes`).
- **`_listar`** (la cara del trabajador): devuelve `{filamentos[], total}`, cada
  rollo con `tipo`, `color`, `longitud_inicial`, `longitud_restante`, `activo` y
  `bajo` (derivado vs `umbralBajo`). Lectura pura, sin señal — la vista re-lee.
- **`_registrar`** (JEFE): valida `tipo`+`project_id` (400), id único (409
  `ALREADY_EXISTS`), `longitud_inicial` pasa a `null` (y `longitud_restante` a
  `null`) si no es número > 0; **`activo: input.activo === true`** (campo del
  registrar, no op propia); emite `filamento.registrado`. NO es del trabajador.
- **`_decrementar`** (sistema): valida `rollo_id`+`project_id` (400), rollo
  existe (404 `RESOURCE_NOT_FOUND`); **Invariante 9**: longitud desconocida → 409
  `LONGITUD_DESCONOCIDA` (→ `filamento.decrementar.failed`) SIN decrementar;
  resta con piso 0 (`_decrementarStock`), detecta bajo (`_detectarBajo`,
  `<= 5000`), emite `filamento.decrementado` (+ `filamento.bajo` si procede). El
  trabajador solo VE el resultado de esto en el stock.
- **`onFilamentoUsado`** (fire-and-forget): toma el rollo ACTIVO del proyecto y
  lo decrementa con el `filament_used` reportado; si no hay rollo activo, retorna
  sin efecto (honesto — no decrementa nada).
- **`_rolloActivo(pid)`**: primer rollo del proyecto con `activo:true` (único de
  facto por re-escritura del Map al registrar).
- **No hay RPC `marcar_activo` / `cambiar_activo` ni op de configurar el umbral
  ni de editar/borrar un rollo ni de corregir `longitud_restante`** — todos son
  [ABIERTO] de decisión del dueño, no defectos de la UI. El trabajador es un
  LECTOR del stock (`listar`); no registra (JEFE), no decrementa (impresora por
  evento) y no marca el activo (JEFE vía `registrar`, [ABIERTO]).
