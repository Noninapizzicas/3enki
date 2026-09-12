# historial-impresiones — decisiones de interfaz (F7)

> PRÁCTICA (2ª iteración — tras catalogo-modelos): cada fila documenta la cadena
> **evento → contexto → forma → elemento → atributos** y el **por qué**.
> Este documento ES el dataset de patrones para futuras automatizaciones de la fase 7
> (generación de paneles específicos con stores MQTT).
> Fuente de verdad: `modules/historial-impresiones/index.js` (handlers reales),
> `esquema-jefe/esquema-jefe.md` (F6), `esquema-trabajador/esquema-trabajador.md` (F6, #573)
> y `historial-impresiones.blueprint.json` (F6½, #574, con `listar` rol `jefe,trabajador`
> COMPARTIDO y flujo [jefe, trabajador_vigilar]).
> Construido como ingeniero de interfaz de Enki sobre el patrón de
> catalogo-modelos (`CatálogoModelosPanel.svelte` + `stores/catalogo.ts`) y reutilizando
> el patrón de rol TRABAJADOR de cola-impresion (`ColaImpresionPanel.svelte`, #572:
> pestañas jefe|trabajador sobre el MISMO panel — SUMAR, no duplicar).

## Matiz estructural: el jefe y el trabajador son LECTORES (NO escritores)

`historial-impresiones` es un **CUSTODIO puro** (append-only). A diferencia de
catalogo-modelos (donde el jefe registra modelos), aquí **el registro llega solo** por
`impresion.completada` (`onImpresionCompletada`, fire-and-forget) o por RPC de
`ciclo-impresion`. Por eso el panel **NO tiene gesto de alta**. Es una
**cinta cronológica** de impresiones pasadas que se refresca en vivo por la señal de
**ESCRITURA del sistema** `historial.impresion_registrada`. El único `señal-refresh`
es esa — `listar` es lectura pura, sin señal propia.

**Dualidad de rol (esquema-trabajador F6, veredicto del árbitro):** NI el jefe NI el
trabajador escriben; AMBOS leen el MISMO `listar`. No existe proyección "operativa"
separada en `index.js` (solo `_listar` cinta completa y `_registrar` escritura). La
distinción es de FOCO presentacional, no de cara: el jefe lee la cinta con foco de
**gestión/panorama**; el trabajador lee la MISMA cinta con foco **operativo** (resultado ✅/❌
y gasto) + un resumen derivado. Por eso la cara del trabajador se **SUMA** como pestaña al
panel del jefe existente (un solo `HistorialImpresionesPanel.svelte`), nunca duplicándose.

| op | evento (RPC) | contexto | forma | elemento | atributos | por qué |
|---|---|---|---|---|---|---|
| listar | historial.listar.request → .response | muchos registros cronológicos, más reciente primero; cada uno: fecha · modelo_id/nombre · material · filamento_usado · tiempo · resultado · registrado_en | cinta cronológica (ref-select/cinta) COMPARTIDA jefe+trabajador | filas de tarjeta (li.fila) | fecha · modelo_nombre (chip 🧊) · material (🧵) · filamento (🪡) · tiempo (⏱) · resultado (chip-color) | el gesto rey de jefe y trabajador es MIRAR la memoria del taller (jefe: decidir / trabajador: cómo sale la operación); el registro entra por evento, más reciente arriba |
| — cara JEFE (listar) | historial.listar.request → .response | muchos registros, foco gestión/panorama | cinta-estado/cinta (pestaña Jefe) | filas + cabecera de pulso total | fecha · modelo · material · filamento · tiempo · resultado | el jefe ve la cinta como memoria del taller para DECIDIR (quién falla, qué gasta, qué modelo); panorámica |
| — CARA TRABAJADOR (listar MISMA) | historial.listar.request → .response | los MISMOS registros, foco OPERATIVO (qué salió bien/mal, cuánto gasta) | cinta de RESULTADOS (pestaña Trabajador) | filas con emoji-resultado ✅/❌/⚪ + chip-resultado + gasto resaltado (🪡/⏱); borde izquierdo de color=estado | resultado (emoji + chip color) · gasto (filamento "usado" + tiempo) · material · nombre · fecha | el trabajador NO decide gestión: revisa la cinta como informe del taller — detectar fallos recurrentes (❌) y consumos; MISMA cinta, distinto foco (no hay proyección operativa en index.js) |
| resumen operativo (derivado del store) | deriva de $registros (sin RPC propio) | cuántas completadas/fallidas y cuánto filamento total en el historial | tarjeta-resumen/cinta-estado | KPIs (res-kpi) | ✅ completadas · ❌ fallidas · 🪡 total g | el operador sabe cómo va el taller de una pasada (salud operativa), sin consulta nueva — deriva del MISMO listar ya cargado |
| total (listar → total) | historial.listar.request → .response | cuántas impresiones hay registradas del proyecto | cabecera de pulso (cinta-estado) | chip-pulso | {$totalRegistros} impresiones (+ "n en total" en la cara trabajador) | el jefe/trabajador sabe cuánto trabajo ha pasado por el taller de una pasada |
| estado vacío | historial.listar.request → {registros:[],total:0} | store sin entradas aún (no hay error: respuesta 200) | cinta-estado aviso (en AMBAS pestañas) | .vacio (icono 🧭 + texto) | "sin impresiones registradas aún — el ciclo de impresión las registrará" | hueco nombrado, nunca inventado; orienta sin gesto que no existe |
| refresco vivo | (señal) historial.impresion_registrada | una impresión del proyecto acaba de completarse | señal-refresh (en AMBAS pestañas) | la cinta re-lee (debounce 60ms) + confirmación viva 🆕 | la fila nueva aparece arriba del todo, sin recargar (R3) | jefe y trabajador NO tienen botón de recargar: el historial crece solo por el evento del sistema |
| pestaña de rol (jefe\|trabajador) | (UI) rolActivo | el rol activo determina el foco de lectura | tab-list | botones (rol-tab) | 👨‍💼 Jefe · 🧑‍🔧 Trabajador | un solo panel materializa AMBAS caras SUMADAS (convención prisma-universal: sumar, no duplicar/reescribir); el trabajador hereda el MISMO store y la MISMA cinta |

## Señal-refresh (tiempo real, nunca recarga)

| evento publicado | refresh_on | elemento que late | por qué |
|---|---|---|---|
| historial.impresion_registrada | listar | cinta (registro nuevo arriba) + chip-pulso total + confirmación viva — en AMBAS pestañas (jefe y trabajador beben del MISMO store) | la señal de ESCRITURA del sistema re-lee la cinta (R3); jefe y trabajador ven crecer la memoria sin tocar nada |
| historial.registrar.failed | (no aplica a jefe/trabajador) | — | solo importaría en un registro manual [ABIERTO]; el flujo normal (impresion.completada) no falla por UI |

## Cadena completa por op

```
HISTORIAL.IMPRESION_REGISTRADA (señal de ESCRITURA del sistema)
   │   └──> re-lee listar (R3, debounce 60ms) → fila nueva arriba de la cinta + total++
   │        (AFECTA AMBAS pestañas: jefe y trabajador comparten el store → la cinta de
   │         resultados del trabajador y la del jefe se refrescan juntas)
   │
HISTORIAL.LISTAR (RPC, ROL JEFE + TRABAJADOR — LECTORES puros, MISMA cinta)
   │   ├──> PESTAÑA JEFE → cinta cronológica de gestión: fecha · modelo · material ·
   │   │        filamento · tiempo · resultado + cabecera de pulso (n impresiones).
   │   │        Estados: cargando → vacío → datos. Huecos como "desconocido".
   │   └──> PESTAÑA TRABAJADOR → MISMA cinta con foco OPERATIVO:
   │          + resumen del taller (✅ completadas · ❌ fallidas · 🪡 total g)
   │          + cinta de RESULTADOS: emoji ✅/❌/⚪ + chip-color + border-izquierdo de estado
   │            + gasto resaltado (🪡 usado / ⏱) · SIN gesto de escritura.
   │          Estados y refresco: IDÉNTICOS al jefe (mismo store).
   │
HISTORIAL.REGISTRAR (RPC, ROL NEUTRO/SISTEMA — NO es gesto de jefe ni trabajador)
   └──> lo invoca ciclo-impresion (historial.registrar.request) o entra por impresion.completada
        → NOTA: el panel NO lo expone como botón (ley de cero supuestos: solo lo que hay)
```

## Decisiones de arquitectura de la práctica

1. **Store MQTT reflejo (no cálculo).** `stores/historial.ts` sigue el molde canónico:
   `initialState` + `historialStore` (writable) + derivados + acción
   (`loadHistorial` vía `mqttRequest('historial', 'listar', {project_id})`)
   + `initHistorialSubscriptions` (subscribe → debounce → refresh) + `resetHistorial`.
   La UI no tiene lógica de negocio: solo escribe al recibir una lectura RPC (R2).
   **El trabajador NO duplica ni crea un store nuevo:** la pestaña trabajador deriva de
   `$registros`/`$totalRegistros`/`$ultimoRegistrado` del MISMO store del jefe.

2. **Panel específico, no BlueprintForm.** `HistorialImpresionesPanel.svelte` reemplaza
   el envoltorio genérico: cinta cronológica + cabecera de pulso + estados + confirmación
   viva, con lenguaje visual color/icono/texto (🖨️/🧭 entidad, chip-color por resultado,
   chips de material/filamento, pulso total). SIN botón de alta (jefe TRABAJADOR LECTORES).

3. **Dos pestañas de rol sobre UN panel (sumar, no duplicar).** Añadir la cara del
   trabajador NO crea un panel nuevo ni duplica la cinta: `rolActivo` (`'jefe'`|`'trabajador'`)
   cambia el foco presentacional sobre el MISMO `listar`. La pestaña Jefe conserva la cinta
   de gestión; la pestaña Trabajador añade (a) el resumen operativo del taller y (b) la misma
   cinta con énfasis en resultado (✅/❌) y gasto. Es el MISMO patrón de cola-impresion (#572).

4. **Filtro por rol declarado en el blueprint.** `listar` = rol `jefe,trabajador` → cinta
   LECTORA COMPARTIDA (pestañas jefe + trabajador en un solo panel);
   `registrar` = rol neutro/sistema → se excluye del árbol de ambos roles. NI jefe NI
   trabajador DECLARAN.

5. **Refresco por señal de ESCRITURA del sistema (R3), nunca recarga.** No hay botón de
   recargar. `historial.impresion_registrada` re-lee la cinta; el par de fallo
   `historial.registrar.failed` se ignora (solo relevante para un registro manual [ABIERTO]
   que el dueño no ha decidido). Ley de cero supuestos: no se materializa lo que no hay.
   **El trabajador escribe en el MISMO store** → el refresco del jefe llega también a la
   pestaña trabajador sin lógica extra.

6. **Multi-tenant.** El store lee `sessionProjectId`; al cambiar de proyecto
   `resetHistorial()` vacía (sin datos ajenos) y re-carga el activo. Ambas pestañas se
   resetean juntas (comparten el estado del store).

7. **OJO `{@const}` raíz.** El panel derivado del trabajador usa `$:` reactivos sobre el
   store (`completadas`, `fallidas`, `filamentoTotal`, `hayGasto`), NO `{@const}` a nivel
   de raíz del template — `{@const}` solo es válido dentro de bloques `{#...}`. Evita el
   bug de root que ya se sufrió. `filamentoTotal` suma solo valores numéricos; los huecos
   'desconocido' no contaminan el total.

## Dataset de patrones (aprendizaje para automatizar F7)

| forma UI | disparo | elementos recurrentes | plantilla de decisión |
|---|---|---|---|
| cinta cronológica | muchos registros ordenados por fecha, más reciente primero | fila = tarjeta con fecha + cuerpo + chips; pulso total arriba; estados vacío/cargando/datos | ref-label del blueprint (`modelo_nombre`) alimenta la fila; `registrado_en`/`fecha` para el eje temporal |
| pestaña de rol (jefe\|trabajador) | dos roles sobre la MISMA op lectora (listar) | `rolActivo` + tab-list (`rol-tab` jefe/trabajador) + vista condicional | cuando dos roles comparten la MISMA proyección, se SUMA la cara como pestaña del MISMO panel (nunca panel duplicado) — patrón #572 cola-impresion |
| resumen operativo derivado | saber cómo va el taller de una pasada (derivados del store, sin RPC) | KPIs (res-kpi): ✅ completadas · ❌ fallidas · 🪡 total g | derivar de `$registros` (filtro por `resultado` / suma numérica de gasto); NO es un RPC nuevo |
| cinta de RESULTADOS (foco operativo) | el trabajador mira qué salió bien/mal y cuánto gasta | fila + emoji ✅/❌/⚪ + chip-resultado color + border-izquierdo color + gasto resaltado (🪡/⏱) | misma cinta de `listar`, énfasis presentacional en resultado/gasto; sin escritura |
| cabecera de pulso | saber cuánto hay de una pasada | chip con `total` | listar → total: el contador del rol |
| señal-refresh de ESCRITURA del sistema | el/los LECTORES no escriben, la señal la emite otro | subscribe → debounce → re-lectura; confirmación viva 🆕 | el refresco lo da la señal del bus, nunca una recarga manual (R3) |
| estado vacío (sin gesto) | store sin entradas, LECTORES sin escritura | icono + mensaje que orienta + subtexto | hueco nombrado; NO se inventa un botón de alta que el rol no tiene |

**Ley de cero supuestos:** el panel materializa solo lo que el esquema/blueprint declaran.
`registrar` es rol neutro/sistema (no gesto de jefe ni trabajador) → no hay formulario; jefe
y trabajador son LECTORES → cinta pura. Los campos obligatorios salen de `listar.args[].required`
(solo `project_id`, que lo provee la sesión) y los atributos mostrados de las columnas
reales de `_listar`.

> Diferencia con catalogo-modelos (1ª iteración): allí el jefe tenía escritura
> (`registrar` rol jefe → modal de alta). Aquí el jefe es LECTOR y la escritura es del
> sistema → la composición del panel se reduce a VER (listar) + SABER (total) + REFRESCARSE
> (señal). Y a diferencia de cola-impresion (donde el trabajador lee una cinta DISTINTA a la
> del jefe), en historial-impresiones AMBOS roles leen la MISMA cinta → la cara del
> trabajador es la misma cinta con foco operativo + un resumen derivado, sumada como pestaña.
> Esa es la 3ª lección de la práctica: cuando dos roles comparten la misma op lectora, la
> SUMA en pestañas del MISMO panel (con distinto foco presentacional) es más honesta que
> inventar una proyección que `index.js` no soporta.

