# gestion-filamento — decisiones de interfaz (F7)

> PRÁCTICA (6ª iteración — tras catalogo-modelos, historial, cola, ciclo e
> importacion-modelo). **CASO ESPECIAL**: NO existía panel previo. gestion-filamento
> llegó solo a F6 (esquema-jefe + esquema-trabajador, PR #576) y F6½ (blueprint, PR
> #577), sin F7. Este F7 **CREA el panel desde CERO** con pestañas trabajador + jefe
> (no se suma sobre uno existente). Cada fila documenta la cadena
> **evento → contexto → forma → elemento → atributos** y el **por qué**. Este
> documento ES el dataset de patrones para futuras automatizaciones de la fase 7.
> Fuente de verdad: `modules/gestion-filamento/index.js` (handlers reales),
> `esquema-jefe/esquema-jefe.md` (F6), `esquema-trabajador/esquema-trabajador.md`
> (F6) y `gestion-filamento.blueprint.json` (F6½).
> Construido como ingeniero de interfaz de Enki sobre el patrón de cola-impresion
> (`ColaImpresionPanel.svelte` + `stores/cola.ts`, 3ª iteración) y de ciclo-impresion.

## Matiz estructural: el trabajador es un LECTOR casi puro del stock; solo el jefe registra

`gestion-filamento` es un **CUSTODIO** (single-writer de su store de filamento por
proyecto vía pos-persistencia). `listar` (la cinta del stock) es la lectura que
alimenta a **AMBOS** roles: el **TRABAJADOR/operador** la LEE para operar la
impresora y tener material/repuesto a mano (cuál está activo, cuál está por agotarse);
el **JEFE/dueño** la ve para decidir si repone. `registrar` es la **ÚNICA escritura**
del custodio, exclusiva del **JEFE** (alta de rollo con tipo, color, longitud inicial
y el toggle `activo`). El decremento es del **SISTEMA** (la impresora reporta
`filamento.usado` contra el rollo activo); el panel solo se refresca con sus señales
pareadas, nunca lo dispara. `activar rollo` (marcar activo) es `[ABIERTO]`: hoy solo
se fija como toggle de `registrar`, sin RPC dedicado `onMarcarActivo` — se usa el
toggle del alta del jefe, no se inventa un gesto nuevo. Registro de la práctica:
`module.json` de gestion-filamento NO tenía `ui_handlers` (a diferencia de
catalogo/historial) — como en cola-impresion, se declaran en F7 para que el frontend
`mqttRequest('gestion-filamento', …)` llegue a los handlers reales vía
`ui/request/gestion-filamento/<accion>`.

| op | evento (RPC) | contexto | forma | elemento | atributos | por qué |
|---|---|---|---|---|---|---|
| listar | gestion-filamento/listar.request → .response | muchos rollos del taller con tipo, color, longitud restante, activo y bajo | cinta del stock (tarjetas) + cabecera de pulso | fila de tarjeta (li.fila) + chips | estado (chip-color 🟦/⚠️/🖨️) · tipo (🧵) · color (🎨) · longitud restante (📏) · inicial (🏷️) | el gesto rey de AMBOS roles es VER el stock: el trabajador la lee para operar, el jefe para reponer; una sola cinta alimenta las dos caras |
| listar → pulso | gestion-filamento/listar.request → .response | cuántos rollos hay, cuántos bajo umbral y cuál es el activo | cabecera de pulso (cinta-estado) | chip-pulso rollos · chip bajo · badge activo | {$totalRollos} rollos · ⚠️ {$rollosBajos} bajo · 🖨️ activo (tipo · color) / sin activo | el operador y el dueño saben de una pasada el estado del material para tener repuesto a mano |
| registrar | gestion-filamento/registrar.request → .response (201) | declaración multi-campo del dueño: tipo, color, longitud inicial + toggle activo | editor-bloque (1 modal, no fases) | modal de alta (overlay + panel) | tipo* · color · longitud_inicial (mm) · checkbox activo | es la ESCRITURA clave del custodio (append + filamento.registrado); los obligatorios salen de args[].required; el toggle `activo` es la marca `[ABIERTO]` de qué rollo va cargado |
| (TRABAJADOR) listar → cinta lectora | gestion-filamento/listar.request → .response | el operador junto a la impresora VIGILA el stock (listar) para operar y preparar material/repuesto | cinta-estado / cinta del taller | pestaña "Trabajador": la MISMA cinta del stock + cabecera de pulso | estado (chip-color) · tipo (🧵) · color (🎨) · longitud restante (📏) · badge bajo ⚠️ · badge activo 🖨️ | es un LECTOR casi puro (esquema-trabajador): NO registra (JEFE), NO decrementa (impresora); su operación física del cambio de rollo vive en ciclo-impresion |
| (JEFE) estado vacío | gestion-filamento/listar.request → {filamentos:[], total:0} | store sin rollos aún (no es error: respuesta 200) | cinta-estado aviso | .vacio (icono 🫙 + texto + botón de alta) | "no hay rollos registrados en este taller" | hueco nombrado, nunca inventado; en la cara del JEFE ofrece el gesto que sí existe (registrar); en la del trabajador es lectura pura |

## Estados del rollo (color=estado, del blueprint ui.estados)

| estado | color | icono | derivado | por qué |
|---|---|---|---|---|
| normal | blue | 🟦 | longitud_restante > umbralBajo (5000mm) o desconocida (null) | el rollo está disponible; badge visual en la tarjeta |
| bajo | orange | ⚠️ | longitud_restante <= 5000mm (bajo:true) | 'ten repuesto a mano'; deriva de la proyección _detectarBajo (no es un estado transicionable) |
| activo | green | 🖨️ | activo:true (cargado en la impresora) | el que el sistema decrementa por evento filamento.usado; se fija solo en registrar (JEFE), sin RPC 'marcar activo' [ABIERTO] |

## Señal-refresh (tiempo real, nunca recarga)

| evento publicado | refresh_on | elemento que late | por qué |
|---|---|---|---|
| filamento.registrado | listar | cinta (rollo nuevo) + pulso rollos/bajo/activo | la señal pareada re-lee la cinta (R3); el dueño ve entrar su rollo sin recargar |
| filamento.decrementado | listar | cinta (longitud restante baja) + posibles badges | cada mutación del custodio/impresora emite su señal; la vista re-lee |
| filamento.bajo | listar | cinta (el rollo pasa a ⚠️ bajo) + pulso "n bajo" | alerta reactiva "ten repuesto a mano" cuando un rollo cae bajo el umbral |
| filamento.decrementar.failed | listar | error de cinta (filamentoError) | par de fallo canónico (Invariante 9: 404/409 LONGITUD_DESCONOCIDA); todo flujo cierra su círculo |

## Cadena completa por op

```
FILAMENTO.REGISTRADO (señal de ESCRITURA del jefe)
   │   └──> re-lee listar (R3, debounce 60ms) → rollo nuevo en la cinta + pulso rollos++
   │
FILAMENTO.DECREMENTADO (señal de la impresora por evento filamento.usado)
   │   └──> re-lee listar → longitud restante del rollo activo baja
   │
FILAMENTO.BAJO (señal de la impresora por evento filamento.usado)
   │   └──> re-lee listar → el rollo pasa a ⚠️ bajo + pulso "n bajo umbral"++
   │
FILAMENTO.LISTAR (RPC, las dos caras — la cinta)
   │   └──> cinta del stock: estado · tipo · color · longitud restante · inicial
   │        cabecera de pulso: n rollos · m bajo · cuál activo
   │        estados: cargando → vacío ("no hay rollos") → datos
   │
FILAMENTO.REGISTRAR (RPC, ROL JEFE — ESCRITURA clave)
   └──> editor-bloque modal: tipo* + color + longitud_inicial (mm) + toggle activo
        id duplicado → 409 ALREADY_EXISTS (MqttRequestError → altaError)
        longitud no número > 0 → el rollo nace de longitud desconocida
        (no decrementable, Invariante 9); la señal filamento.registrado refresca
```

## Decisiones de arquitectura de la práctica

1. **CASO ESPECIAL — panel CREADO desde CERO (no sumar sobre uno existente).**
   gestion-filamento llegó solo a F6/F6½. Este F7 crea `frontend/src/lib/modules/
   gestion-filamento/` completo (manifest + index + store + panel + doc) y registra
   el panel en `panels.ts` + `project-pages.ts`. A diferencia de la 3ª/4ª iteración
   (cola/ciclo, donde la cara del trabajador se SUMA a un panel de jefe existente),
   aquí NO había panel: las caras de ambos roles nacen juntas en el MISMO
   `GestionFilamentoPanel.svelte` con pestañas `Trabajador | Jefe`.

2. **`ui_handlers` como puerta del panel.** El `module.json` de gestion-filamento
   NO tenía `ui_handlers` (sus handlers RPC viven en `subscribes` como
   `filamento.registrar.request/listar.request`). Para que el panel F7 hable con el
   reflejo por el canal estándar (`mqttRequest` → `ui/request/<domain>/<action>`),
   F7 declara 2 `ui_handlers` (domain `gestion-filamento`) apuntando a los handlers
   reales (`onListarRequest` para la cinta, `onRegistrarRequest` para la escritura
   del jefe). **No se cablea `decrementar`**: es rol sistema/automatizado (lo dispara
   la impresora por evento `filamento.usado` contra el rollo activo), NO es gesto de
   panel — el panel solo se refresca con `filamento.decrementado`/`filamento.bajo`.
   Es la 2ª vez en la práctica que el registro de `ui_handlers` es parte del
   entregable F7; documenta que el panel F7 puede EXIGIR cablear el módulo.

3. **Store MQTT reflejo (no cálculo).** `stores/filamento.ts` sigue el molde canónico:
   `initialState` + `filamentoStore` (writable) + derivados (`rollosFilamento`,
   `totalRollos`, `rollosBajos`, `rolloActivo`) + acciones (`listarRollos` /
   `registrarRollo` vía `mqttRequest('gestion-filamento', …)`) +
   `initFilamentoSubscriptions` (3 señales → debounce → refresh) + `resetFilamento`.
   La UI no tiene lógica de negocio: solo escribe al recibir una lectura RPC (R2).

4. **Panel específico, no BlueprintForm.** `GestionFilamentoPanel.svelte` reemplaza
   el envoltorio genérico: cinta del stock + cabecera de pulso + modal de alta +
   badges activo/bajo + estados con lenguaje visual color/icono/texto. Un solo
   componente con pestañas de rol.

5. **Filtro por rol declarado en el blueprint.** `registrar` = rol jefe (gesto de
   escritura); `listar` = rol trabajador (lectura que también alimenta al jefe);
   `decrementar` = rol sistema (sin gesto). El trabajador NO ve el botón de alta
   (cara de pura lectura); el jefe sí.

6. **Refresco por señal (R3), nunca recarga.** No hay botón de recargar.
   `filamento.registrado/decrementado/bajo` re-leen la cinta; el par de fallo
   `filamento.decrementar.failed` alimenta el error de cinta (Invariante 9).

7. **Multi-tenant.** El store lee `sessionProjectId`; al cambiar de proyecto
   `resetFilamento()` vacía (sin datos ajenos) y re-carga el activo.

8. **`activar rollo` es [ABIERTO].** `activo` solo se fija como toggle de
   `registrar` en la pestaña del jefe (checkbox "cargar como activo"). NO hay RPC
   `onMarcarActivo` — no se inventa. La cabecera muestra el activo actual o el aviso
   "sin activo" si ningún rollo lo está. Documentado en la nota del panel.

9. **Derivados del trabajador vía `$:` (nunca `{@const}` en la raíz).** No se usan
   `{@const}` en el markup raíz (evita el bug de Svelte 5): los derivados
   (`rollosBajos`, `rolloActivo`) y el estado por rollo (`estadoRollo`/`estadoCls`)
   se calculan en el `<script>` con `$:` o funciones puras. Sin duplicar store ni
   handlers: `registrar`/`listar` son los mismos para ambas pestañas; el frontend NO
   registra handlers nuevos (los 2 `ui_handlers` ya cableados apuntan a los métodos
   reales de `index.js`).

## Dataset de patrones (aprendizaje para automatizar F7)

| forma UI | disparo | elementos recurrentes | plantilla de decisión |
|---|---|---|---|
| cinta del stock (tarjetas) | muchos rollos con estado derivado (activo/bajo) | fila = tarjeta con badge de estado (chip-color) + tipo + color + longitudes + chip aviso "prepara repuesto" | el estado es un FLAG derivado (_detectarBajo), no una transición; badge activo 🖨️ / bajo ⚠️ / normal 🟦 |
| cabecera de pulso + badge activo | saber cuánto queda + cuál está activo | chip rollos · chip bajo + badge activo (o "sin activo") | `listar` devuelve total + por-rollo; el activo se deriva con $rolloActivo |
| editor-bloque modal | 1 escritura multi-campo del jefe | campos de args[].required (tipo) + opcionales (color/longitud_inicial) + toggle activo | 1 modal no fases; el error 409/400 se muestra como altaError; longitud inválida = desconocida (Invariante 9) |
| pestañas de rol (Trabajador\|Jefe) | CREAR panel desde cero con ambas caras | barra .rol-tabs con 2 botones; el contenido se condiciona a rolActivo | un solo Panel.svelte con ambas caras; `rolActivo` filtra: trabajador solo lectura, jefe + botón de alta |
| estado vacío | store sin rollos | icono + mensaje + (jefe) botón de alta | a diferencia de leer-puro, la cara jefe orienta al gesto que existe (registrar); la trabajador es lectura |
| señal-refresh de consumo | stock baja por evento (impresora) | filamento.decrementado/bajo re-leen la cinta | el decremento es del SISTEMA; el panel solo se refresca (R3), nunca lo dispara |
| hueco [ABIERTO] activar rollo | qué rollo va cargado | toggle activo en el alta del jefe; badge activo en cabecera | sin RPC dedicado → se usa el campo de registrar; se documenta sin inventar onMarcarActivo |

**Ley de cero supuestos (matizada):** el panel materializa solo lo que el
esquema/blueprint declaran. Aquí lo clave es la **DUALIDAD trabajador-LECTOR /
jefe-ESCRITOR** en un CUSTODIO donde la escritura es una sola op (`registrar`): la
pestaña trabajador es pura lectura del stock, la pestaña jefe añade el alta. A
diferencia de cola-impresion (el jefe escribe/reordena/dispara), here el jefe solo
**registra**; a diferencia de historial (jefe LECTOR puro), hay UN gesto de escritura
real (`registrar`). La composición del panel refleja eso: cinta compartida + gesto de
alta solo en la cara del jefe.
