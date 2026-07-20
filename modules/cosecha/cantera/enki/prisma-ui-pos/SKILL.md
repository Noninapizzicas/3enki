---
name: prisma-ui-pos
description: El KNOW-HOW para CREAR la superficie POS de un proyecto prisma — la UI de venta que REFLEJA el backend (no calcula) y cuya FORMA emerge del ProductoUniversal (no se teclea por comercio). Cimiento (store que refleja el bus) → muro (componentes data-driven cuyo control nace de opciones[].modo) → coser (ruta/pantalla). El backend POS (carrito·cobro·cuenta·cierre) ya existe y es la verdad; la skill lo COSE, no lo reconstruye. El precio lo fija el backend (opciones.evaluar); la superficie nunca tasa en el cliente.
when-to-use: Cuando un proyecto prisma necesita su superficie de venta OPERABLE (tocar producto → personalizar → sumar → cobrar). NO para el backend POS (ya existe, prisma-puro). NO para el escaparate (público, read-only, no escribe). NO para agenda/cita (eso es el órgano del tiempo, otra pieza). NO para margen/beneficio (eso es prisma-pos-valor, escucha cobro.procesado).
fuente: enki
dominio: comercio
lente_dominio: prisma
lente_tarea: crear-ui-pos
tags: [prisma, pos, ui, frontend, svelte, reflejo, data-driven, producto-universal, carrito, cobro, testigo]
---

# Prisma · UI-POS — crear la superficie de venta de un proyecto prisma

> Parcela: **la SUPERFICIE, no el backend.** El POS (carrito·cobro·cuenta·cierre) ya vive y es
> la verdad; esta skill teje la pantalla que lo opera. Si aparece "tasar en el cliente / guardar
> carrito propio / bundle servido por Caddy" → te saliste de la parcela.
>
> Referencia técnica viva: `arquitectura/decisiones/propuestas/prisma-ui-pos.md` (el guión disecionado).
> **Testigo** (primera ejecución de esta receta): `frontend/src/lib/components/prisma-pos/` +
> `frontend/src/lib/stores/prisma-pos.ts` + `frontend/src/routes/[project_id]/pos/+page.svelte`.

## El corte maestro (todo lo demás se ordena detrás)

```
la UI REFLEJA, no calcula. La verdad de PRECIO, CARRITO y COBRO vive en el BACKEND.
  · NO tasa en el cliente     → el precio lo fija carrito.add_item (opciones.evaluar, céntimos)
  · NO guarda carrito propio  → el buffer es del backend; la pantalla lo refleja desde la respuesta RPC
  · NO embebe el catálogo     → lo lee VIVO del proyector; se refresca por vista.actualizada
```

## De dónde NACE la forma (la pregunta que fija el techo — tres nacimientos, un substrato)

```
LA FORMA  (qué pantallas · qué controles)   nace del ProductoUniversal → proyector → COMPONENTES GENÉRICOS data-driven
                                            techo = universalidad del molde · una lámpara/servicio salen con CERO código nuevo
EL LOOK   (color · tipografía)              nace de la MARCA → teñido (hoy: piel fija prisma-skin · mañana: --accent por carta-marketing)
EL GUSTO  (layout compuesto · jerarquía)    nace de un taller generativo (lentes-diseño) → FUTURO, no se especula en el vacío
```
Escribir componentes genéricos a mano NO traiciona la emergencia: la emergencia vive en la PROYECCIÓN, no en los píxeles.

## Espinazo — el orden de obra (cimientos primero)

```
CIMIENTO (store) → LEER (vista) → DERIVAR (forma) → CAPTURAR (opciones) → REFLEJAR (carrito) → COBRAR (círculo) → COSER (ruta)
```

## CIMIENTO — el store que REFLEJA el backend (la sesión NACE de una cuenta)

```
store  frontend/src/lib/stores/prisma-pos.ts  (patrón STORES del repo: writable + derived + subs)
  · la venta NACE de una cuenta (cuenta.crear) — sin cuenta no hay carrito (el carrito se llavea por cuenta_id)
  · acciones = mqttRequest a los RPCs prisma + actualizar el estado DESDE la respuesta (que trae el carrito entero)
  · suscripciones = coherencia entre superficies (otro operador toca la misma cuenta) → re-sync por carrito.get
  · helpers PUROS aislados (sumaCantidades · carritoDeRespuesta · formatEuros) — lo testable, sin red
```

## LEER — la forma emerge de la vista del proyector

```
mqttRequest('vista','completa',{project_id})  →  { categorias, productos[vista], catalogo_id }
  el proyector APLANA el ProductoUniversal a la vista de consumo (SIN store; deriva del catálogo activo).
  la vista expone lo que la forma necesita:
    { id, nombre, que_es, arquetipo, categoria_id, atributos, opciones, verdades_obligatorias,
      ejes, naturalezas, madurez, listo_para_vender, requiere_tiempo, precio_base_centimos? }
```

## DERIVAR — badges, precio y controles NACEN del dato (no se teclea "pizza")

```
BADGE     naturalezas.origen ('elaborado'|'de_reventa') · requiere_tiempo → 'cita' · madurez≠listo → 'borrador'
PRECIO    precio_base_centimos → €  ·  ausente → "Consultar" (dato NOMBRADO, no inventado)
CONTROL   ¿opciones.length? → franja "Opciones" · si no → añadir directo
LÍMITE    requiere_tiempo (eje tiempo≠ninguno) → FUERA del POS v1 (necesita agenda, otra pieza): avisa, no lo añade
```

## CAPTURAR — el control EMERGE de opciones[].modo (un molde, N formas)

```
ELEGIR_UNO     → radio  (single; default = primer valor ofrecible)
ELEGIR_VARIOS  → check  (multi)
QUITAR         → chip   ("sin X")
LIBRE          → texto  (v1 viaja como `notas`; tarifar lo libre = follow-up)
valores        → solo disponible !== false ; delta como HINT (+€) — la verdad la fija el backend al añadir
```

## REFLEJAR — el carrito muestra lo que el backend dice

```
carrito.add_item {cuenta_id, project_id, producto_id, catalogo_id, selecciones, cantidad} → el backend TASA (opciones.evaluar)
  → la respuesta trae { carrito:{items, total_centimos} } → el store lo refleja. La UI NO suma precios.
quitar / cambiar cantidad / vaciar  → mismos RPCs; el estado se actualiza desde la respuesta.
método de pago  → elección local (no toca backend hasta cobrar).
```

## COBRAR — CIERRA el círculo real (el backend reacciona solo)

```
1 · cobro.crear   {cuenta_id, project_id, metodo_pago, monto_recibido_centimos?, desglose?}  → cobro_id
2 · cobro.confirmar {id: cobro_id}  → emite cobro.procesado
    ⇒ cuenta reacciona: pagada + estado 'cobrada'   ·   cierre reacciona: acumula la venta en el cuadre
3 · la UI abre cuenta nueva (limpia el carrito reflejando el cierre real) → lista para la siguiente venta

FALLO al confirmar → error NOMBRADO (posError), la venta NO se marca cerrada. JAMÁS se finge cobrado.
```

## COSER — la ruta/pantalla (patrón de página del repo)

```
ruta   frontend/src/routes/[project_id]/pos/+page.svelte  → projectId = $activeProjectId || $page.params.project_id → <PosScreen {projectId}>
pantalla PosScreen  onMount: initPrismaPosSubscriptions() + initPrismaPos(projectId) + cargarVista() + subscribe('vista.actualizada')
                    onDestroy: cleanup + resetPrismaPos()
teñido  las vars de prisma-skin (--color-*). Idioma del repo: Svelte clásico (export let · $: · createEventDispatcher), NO runes.
DESCUBRIMIENTO (opcional)  módulo lazy modules/prisma-pos/ (manifest+index.ts, zona work-bar) = follow-up si se quiere botón en la barra.
```

## Anti-patrones

```
· copiar los componentes de comandero      → forma pizza-shaped; cada arquetipo nuevo = reescribir. DERIVA del molde, no copies.
· tasar en el cliente                       → dos verdades de precio → drift. La única fuente es opciones.evaluar (vía carrito).
· embeber el catálogo en la página          → se queda viejo. Léelo vivo del proyector, refresca por vista.actualizada.
· bundle autónomo servido por Caddy         → eso es el ESCAPARATE (público, read-only). El POS escribe: necesita el bus.
· fingir cobrado si confirmar falla          → prohibido; NOMBRA el fallo y no cierres la venta.
· generar la UI con LLM en el vacío          → especular la UX antes de que el comercio exista. La forma emerge del DATO; el gusto (lentes) es futuro.
```

## LA TRAMOYA que esta skill COSE (reflejos backend + testigo frontend)

```
BACKEND POS — prisma-puro, EVENT-DRIVEN, persistente (NO se reconstruye; se consume)
  [EXISTE]  prisma/carrito    buffer por cuenta_id · add_item TASA con opciones.evaluar (céntimos) · get/remove/update/vaciar/list
  [EXISTE]  prisma/cobro       efectivo/tarjeta/bizum/transf/mixto · crear→confirmar→(reembolsar) · emite cobro.procesado
  [EXISTE]  prisma/cuenta      ticket abierta→cobrada→cerrada · reacciona a cobro.procesado (pagada)
  [EXISTE]  prisma/cierre      cuadre del día por método · acumula cobro.procesado · cerrar_caja
  [EXISTE]  prisma/proyector   vista.completa/productos/producto/buscar · re-emite vista.actualizada al cambiar catálogo
  [EXISTE]  prisma/opciones    evaluar.request → valida + precia la selección (Strategy por modo · céntimos)
FRONTEND GENÉRICO — se HEREDA sin tocar infra
  [EXISTE]  MqttClient · mqtt-request (ui/request/<dom>/<accion> → ui/response) · patrón STORES · rutas /[project_id]/<pantalla> · prisma-skin
TESTIGO — la primera ejecución de esta receta (referencia, no dogma)
  [TESTIGO] stores/prisma-pos.ts          el cimiento (store que refleja)
  [TESTIGO] components/prisma-pos/         tipos · OpcionesSheet · ProductoCard · ProductoGrid · CarritoPanel · PosScreen
  [TESTIGO] routes/[project_id]/pos/       la ruta
```

## Filosofía (una frase)

La UI POS no se inventa por comercio: se DERIVA del ProductoUniversal y se COSE al backend que ya
sabe vender. La forma emerge del dato, el precio lo dice el backend, el cobro cierra su círculo —
la pantalla solo refleja y dispara. La skill teje; el reflejo guarda, tasa y cobra.
