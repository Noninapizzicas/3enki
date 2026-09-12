# cola-impresion — decisiones de interfaz (F7)

> PRÁCTICA (3ª iteración — tras catalogo-modelos y historial-impresiones): cada
> fila documenta la cadena **evento → contexto → forma → elemento → atributos** y
> el **por qué**. Este documento ES el dataset de patrones para futuras
> automatizaciones de la fase 7 (generación de paneles específicos con stores MQTT).
> Fuente de verdad: `modules/cola-impresion/index.js` (handlers reales),
> `esquema-jefe/esquema-jefe.md` (F6) y `cola-impresion.blueprint.json` (F6½).
> Construido como ingeniero de interfaz de Enki sobre el patrón de
> historial-impresiones (`HistorialImpresionesPanel.svelte` + `stores/historial.ts`).

## Matiz estructural: el jefe ESCRIBE + REORDENA + DISPARA

`cola-impresion` es un **CUSTODIO** (single-writer de su cola). A diferencia de
catalogo-modelos (jefe registrador ÚNICO) y historial-impresiones (jefe LECTOR
puro), aquí el dueño tiene **TRES gestos de decisión reales** (esquema-jefe rol
JEFE): `entrar` (la escritura clave del custodio), `reordenar` (la mano del dueño
sobre la prioridad que el motor `_ordenar` propone) y `siguiente` (disparador de
la cara de decisión fría "qué imprime ahora"). `longitud` + `listar` son lecturas
neutras que las alimentan. La cola NUNCA decide qué imprimir (invariante 6): solo
ordena lo aprobado — la cinta muestra el **ORDEN PROPUESTO** del motor, no una
lista cruda; el item cabeza es "siguiente a imprimir". Registro de la práctica:
`module.json` de cola-impresion NO tenía `ui_handlers` (a diferencia de
catalogo/historial) — se declaran en F7 para que el frontend
`mqttRequest('cola-impresion', …)` llegue a los handlers reales vía
`ui/request/cola-impresion/<accion>`.

| op | evento (RPC) | contexto | forma | elemento | atributos | por qué |
|---|---|---|---|---|---|---|
| listar | cola-impresion/listar.request → .response | muchos items en su orden (pendiente/imprimiendo/hecho/retirada) con estado, material, urgencia, tamaño | cinta de la cola | filas de tarjeta (li.fila) + cabecera de pulso | estado (chip-color) · nombre (🧊) · material (🧵) · urgencia (⚡ n/5) · tamaño (📐 mm³) · orden | el gesto rey del jefe es MIRAR qué espera la cola y en qué orden; la fila cabeza (pendiente 1) es "siguiente a imprimir" |
| longitud (pulso) | cola-impresion/longitud.request → .response | cuántos pendientes hay y total vivos | cabecera de pulso (cinta-estado) | chip-pulso pendientes · total + badge materialCargado | {$pendientesCola.length} pendientes · {$totalCola} en cola · 🧵 materialCargado | el jefe sabe de una pasada cuánto trabajo queda y qué filamento hay cargado (evita cambio) |
| entrar | cola-impresion/entrar.request → .response (201) | declaración multi-campo del dueño: modelo_id, nombre, material, urgencia (1..5), tamaño | editor-bloque (1 modal, no fases) | modal de alta (overlay + panel) | modelo_id* · nombre* · material · urgencia · tamaño | sobrepasa el gesto inline; es la ESCRITURA clave del jefe (append + cola.entrada); los obligatorios salen de args[].required |
| reordenar | cola-impresion/reordenar.request → .response | la mano del dueño corrige la prioridad que el motor propone | control subir/bajar a posición (confirmador-nombrado) | botones ▲/▼ por pendiente | item_id · pos (1-based dentro de pendientes, clamp 1..len) | SOLO pendientes (409 si no); señal cola.reordenada refresca el orden propuesto en vivo |
| siguiente | cola-impresion/siguiente.request → .response | decisión fría "qué imprime ahora" según el motor _ordenar | acción nombrada | botón "Siguiente a imprimir" (btn-jefe) | solo project_id | cola.extraccion confirma y avanza; cola.vacia avisa si no hay trabajo (dueño decide si entra más) |
| estado vacío | cola-impresion/listar.request → {items:[], total:0} | store sin piezas aún (no es error: respuesta 200) | cinta-estado aviso | .vacio (icono 🧭 + texto + botón) | "cola vacía — entra la primera pieza" | hueco nombrado, nunca inventado; orienta al gesto que sí existe (entrar) |

## Estados de pieza (color=estado, del blueprint ui.estados)

| estado | color | icono | terminal | por qué |
|---|---|---|---|---|
| pendiente | blue | 🔵 | no | espera ser impreso; es la que se reordena |
| imprimiendo | orange | 🖨️ | no | la pieza en curso (pop de `siguiente`) |
| hecho | green | ✅ | sí | impresión completada (la consume otro módulo) |
| retirada | gray | 🗑️ | sí | pieza retirada (no se transiciona por este módulo) |

## Señal-refresh (tiempo real, nunca recarga)

| evento publicado | refresh_on | elemento que late | por qué |
|---|---|---|---|
| cola.entrada | listar | cinta (fila nueva) + pulso pendientes | la señal pareada re-lee la cinta (R3); el dueño ve entrar su pieza sin recargar |
| cola.extraccion | listar | cinta (la pieza pasa a imprimiendo/avanza) + badge materialCargado | cada mutación del custodio emite su señal; la vista re-lee |
| cola.reordenada | listar | cinta (el orden propuesto se actualiza) | el gesto de corrección del dueño refresca en vivo |
| cola.vacia | listar | aviso "cola vacía — no hay nada que imprimir" | el dueño decide, sin recargar, si entra más |
| cola.entrar.failed | listar | error de cinta (colaError) | par de fallo canónico: todo flujo cierra su círculo |

## Cadena completa por op

```
COLA.ENTRADA (señal de ESCRITURA del jefe)
   │   └──> re-lee listar (R3, debounce 60ms) → fila nueva en la cinta + pulso pendientes++
   │
COLA.EXTRACCION (señal)
   │   └──> re-lee listar → la pieza extraída pasa a imprimiendo + materialCargado actualizado
   │
COLA.REORDENADA (señal)
   │   └──> re-lee listar → el orden propuesto se actualiza (subir/bajar en vivo)
   │
COLA.VACIA (señal)
   │   └──> aviso "cola vacía" → el dueño decide si entra más
   │
COLA.LISTAR (RPC, ROL JEFE — la CINTA)
   │   └──> cinta de la cola: estado · nombre · material · urgencia · tamaño · orden
   │        cabecera de pulso: n pendientes · total + 🧵 materialCargado
   │        estados: cargando → vacío ("cola vacía — entra la primera pieza") → datos
   │
COLA.ENTRAR (RPC, ROL JEFE — ESCRITURA clave)
   │   └──> editor-bloque modal: modelo_id* + nombre* + material + urgencia + tamaño
   │        duplicado pendiente → 409 ALREADY_EXISTS (MqttRequestError → altaError)
   │        modelo inexistente en catálogo → 404 (RPC best-effort del módulo)
   │
COLA.REORDENAR (RPC, ROL JEFE — MANO DEL DUEÑO)
   │   └──> control ▲▼ a posición por pendiente (SOLO pendientes, 409 si no)
   │        señal cola.reordenada re-lee el orden propuesto
   │
COLA.SIGUIENTE (RPC, ROL JEFE — DISPARADOR)
   └──> botón "Siguiente a imprimir" → extrae el que toca según el motor _ordenar
        cola.extraccion confirma y avanza; cola.vacia si no hay trabajo
```

## Decisiones de arquitectura de la práctica

1. **`ui_handlers` como puerta del panel (lección nueva).** `cola-impresion`'s
   `module.json` NO tenía `ui_handlers` (sus handlers RPC viven en `subscribes`
   como `cola.entrar.request`). Para que el panel F7 hable con el reflejo por el
   canal estándar del frontend (`mqttRequest` → `ui/request/<domain>/<action>`),
   F7 declara los 5 `ui_handlers` (domain `cola-impresion`) apuntando a los
   handlers reales (`onEntrarRequest`, `onSiguienteRequest`, `onReordenarRequest`,
   `onLongitudRequest`, `onListarRequest`). Es la 1ª vez en la práctica que el
   registro de `ui_handlers` es parte del entregable F7 (catalogo/historial ya los
   tenían); documenta que el panel F7 puede EXIGIR cablear el módulo.

2. **Store MQTT reflejo (no cálculo).** `stores/cola.ts` sigue el molde canónico:
   `initialState` + `colaStore` (writable) + derivados + acciones
   (`loadCola`/`entrarPieza`/`siguientePieza`/`reordenarPieza` vía
   `mqttRequest('cola-impresion', …)`) + `initColaSubscriptions`
   (4 señales → debounce → refresh) + `resetCola`. La UI no tiene lógica de
   negocio: solo escribe al recibir una lectura RPC (R2).

3. **Panel específico, no BlueprintForm.** `ColaImpresionPanel.svelte` reemplaza
   el envoltorio genérico: cinta de la cola + cabecera de pulso + modal de alta +
   control ▲▼ + botón siguiente + estados con lenguaje visual color/icono/texto.

4. **Filtro por rol declarado en el blueprint.** `entrar`/`reordenar`/`siguiente`
   = rol jefe (gestos); `listar`/`longitud` = rol neutro (lecturas que alimentan).
   El panel del jefe expone SOLO los gestos del jefe + las lecturas que los nutren.

5. **Refresco por señal (R3), nunca recarga.** No hay botón de recargar.
   `cola.entrada/extraccion/reordenada/vacia` re-leen la cinta; el par de fallo
   `cola.entrar.failed` alimenta el error de cinta.

6. **Reordenar usa la posición dentro de pendientes.** El módulo `_reordenar`
   toma `pos` como 1-based dentro de la lista de pendientes `_pendientes`
   (clamp 1..len), NO el `orden` global del store. La UI calcula `pos` desde el
   índice en `$pendientesCola` (que refleja el orden propuesto por el motor), no
   desde `item.orden`.

7. **Multi-tenant.** El store lee `sessionProjectId`; al cambiar de proyecto
   `resetCola()` vacía (sin datos ajenos) y re-carga el activo.

## Dataset de patrones (aprendizaje para automatizar F7)

| forma UI | disparo | elementos recurrentes | plantilla de decisión |
|---|---|---|---|
| cinta de la cola (orden propuesto) | muchos items en el orden del motor, no cronológico | fila = tarjeta con estado (chip-color) + nombre + chips (material/urgencia/tamaño) + orden; cabeza = siguiente | el orden no es el del store, es el que propone el motor; `listar` lo proyecta y el chip-estado distingue el ciclo |
| cabecera de pulso + badge | saber cuánto queda + qué filamento hay | chip pendientes · total + badge materialCargado | `listar` devuelve pendientes/total/materialCargado en un solo read |
| editor-bloque modal | 1 escritura multi-campo del jefe | campos de args[].required (modelo_id, nombre) + opcionales (material/urgencia/tamaño) | 1 modal no fases; los errores 409/404 se muestran como altaError |
| control subir/bajar a posición | gesto de CORRECCIÓN sobre una fila | botones ▲/▼ + pos calculada dentro de pendientes | solo pendientes; la señal re-lee el orden propuesto |
| acción nombrada (jefe disparador) | decisión fría "qué sigue" | botón + aviso vacío | cola.vacia avisa; el dueño decide si entra más (no hay gesto destructivo [ABIERTO]) |
| estado vacío (con gesto) | store sin piezas, jefe SÍ escribe | icono + mensaje + botón de alta | a diferencia de historial (sin gesto), aquí el vacío ORIENTA al gesto que existe (entrar) |

**Ley de cero supuestos (matizada):** el panel materializa solo lo que el
esquema/blueprint declaran, PERO cuando el jefe tiene escritura real (como aquí),
el vacío ofrece el gesto. Diferencia clave con historial-impresiones (2ª
iteración): allí el jefe era LECTOR puro → cinta sin botón; aquí el jefe es
**ESCRITOR-REORDENADOR-DISPARADOR** → la cinta lleva control ▲▼ en cada pendiente,
botón de alta y botón "siguiente". Esa es la 3ª lección de la práctica: la
presencia de gestos de ESCRITURA/CORRECCIÓN/DISPARO del jefe condiciona la
composición del panel tanto como su ausencia.
