# catalogo-modelos — decisiones de interfaz (F7)

> PRÁCTICA NUEVA (primera iteración): cada fila documenta la cadena
> **evento → contexto → forma → elemento → atributos** y el **por qué**.
> Este documento ES el dataset de patrones para futuras automatizaciones
> de la fase 7 (generación de paneles específicos con stores MQTT).
> Fuente de verdad: `modules/catalogo-modelos/index.js` (handlers reales) y
> `catalogo-modelos.blueprint.json` (F6½). Construido como ingeniero de
> interfaz de Enki sobre el patrón de pedidos (`modules/pedidos/`).

| op | evento (RPC) | contexto | forma | elemento | atributos | por qué |
|---|---|---|---|---|---|---|
| listar | catalogo.listar.request → .response | muchos registros, columnas fijas (id, nombre, categoria, archivo3mf, origen) | tabla/cinta | filas clicables (article.fila) | nombre, categoria, origen | mostrar de un vistazo la cinta del custodio; la fila ES el ref para el detalle |
| registrar | catalogo.registrar.request → .response | 5 campos de alta + metadatos (editor-bloque) | formulario | modal (overlay + panel) | nombre*, categoria(select), archivo3mf, origen, metadatos | sobrepasa el gesto inline; 1 modal no fases es la escritura única del rol jefe |
| categorias | catalogo.categorias.request → .response | opciones de un campo del alta | select | combobox alimentado por `categorias` | lista de valores | evita tipeo errado en `categoria`; alimenta `registrar.categoria` |
| obtener | catalogo.obtener.request → .response | detalle de un registro ya listado | vista detalle | panel (dl) | metadatos, origen, archivo3mf, created_at | no abarrotar la cinta; el detalle alimenta la decisión del jefe |
| obtener · TRABAJADOR | catalogo.obtener.request → .response | ficha técnica de UN modelo ANTES de imprimir (gesto rey del worker) | ficha inline (cinta-estado/informe) | .ficha-trabajador (dl) | .3mf, material, dimensiones, tiempo/peso, origen | el trabajador LEE la pieza que va a tirar; un toque de la cinta abre la ficha — es la consulta que desbloquea la operación |
| listar · TRABAJADOR | catalogo.listar.request → .response | cinta "qué hay disponible" para elegir qué pieza imprimir | tabla/cinta (misma cinta del store) | .worker-cinta filas clicables | nombre, categoria, origen | el worker ve la alacena de piezas imprimibles para elegir; reusa `modelos` sin duplicar store |
| categorias · TRABAJADOR | catalogo.categorias.request → .response | agrupar/ordenar la cinta del worker | select/badge agrupador (derivado) | .worker-filtro select | lista de categorías → filtra `modelosWorker` | localizar la pieza rápido por categoría; mismo `categorias` que alimenta el alta del jefe |

> La fila del rol trabajador ocupa un bloque de 3 (obtener-ficha, listar-cinta operativa, categorias-orden)
> porque las 3 ops comparten el mismo gesto: consultar para imprimir. Es el dataset de la 6ª decisión de
> la fase 7 — SUMAR la cara del LECTOR al panel del jefe, sin crear panel nuevo ni duplicar stores.

## Señal-refresh (tiempo real, nunca recarga)

| evento publicado | refresh_on | elemento que late | por qué |
|---|---|---|---|
| catalogo.modelo_registrado | listar | cinta (fila nueva) + chip-pulso total | la señal pareada re-lee la cinta (R3); confirmación viva en el panel |
| catalogo.registrar.failed | listar | error de cinta (catalogoError) | par de fallo: todo flujo cierra su círculo |

## Cadena completa por op

```
CATALOGO.MODELO_REGISTRADO (señal)
   │   └──> re-lee listar (R3, debounce 60ms) → fila nueva en la cinta
   │
CATALOGO.LISTAR (RPC)
   │   └──> tabla/cinta: columnas nombre · categoria · origen
   │        estados: cargando → vacío ("sin modelos — añade el primero") → datos
   │
CATALOGO.CATEGORIAS (RPC)
   │   └──> combobox del alta (evita tipeo errado)
   │
CATALOGO.REGISTRAR (RPC, ROL JEFE — única escritura)
   │   └──> form modal: nombre* + categoria(select) + archivo3mf + origen + metadatos
   │        duplicado → 409 ALREADY_EXISTS (MqttRequestError → altaError)
   │
CATALOGO.OBTENER (RPC, ROL JEFE — detalle del alta)
   └──> detalle panel: metadatos + origen + archivo + created_at

── CARA DEL TRABAJADOR (SUMA al mismo panel: pestaña "Trabajador", LECTOR) ──
CATALOGO.LISTAR (RPC, ROL TRABAJADOR — cinta operativa)
   └──> .worker-cinta: "qué hay disponible" para elegir qué pieza imprimir
CATALOGO.CATEGORIAS (RPC, ROL TRABAJADOR — orden)
   └──> .worker-filtro select → deriva modelosWorker (agrupa la cinta por categoría)
CATALOGO.OBTENER (RPC, ROL TRABAJADOR — ficha, gesto rey)
   └──> .ficha-trabajador inline: .3mf + material + dimensiones + tiempo/peso + origen
        un toque de la cinta → ficha; SIN escritura (no registra)
```

## Decisiones de arquitectura de la práctica

1. **Store MQTT reflejo (no cálculo).** `stores/catalogo.ts` sigue el molde
   canónico: `initialState` + `catalogoStore` (writable) + derivados + acciones
   (`loadCatalogo`/`obtenerModelo`/`registrarModelo` vía `mqttRequest('catalogo', …)`)
   + `initCatalogoSubscriptions` (subscribe → debounce → refresh) + `resetCatalogo`.
   La UI no tiene lógica de negocio: solo escribe al recibir una lectura RPC (R2).

2. **Panel específico, no BlueprintForm.** `CatalogoModelosPanel.svelte` reemplaza
   el envoltorio genérico: cinta + modal de alta + detalle + señal viva, con
   lenguaje visual color/icono/texto (🧊 entidad, chips de categoría, pulso total).

3. **Filtro por rol declarado en el blueprint.** `registrar` es rol jefe; las
   lecturas son neutras. El alta queda como único gesto de escritura del panel —
   el resto de la superficie solo informa.

4. **Multi-tenant.** El store lee `sessionProjectId`; al cambiar de proyecto
   `resetCatalogo()` vacía (sin datos ajenos) y re-carga el activo.

5. **SUMAR la cara del trabajador al MISMO panel (no crear panel nuevo).**
   `CatalogoModelosPanel.svelte` tiene UN solo panel con DOS pestañas dentro de la
   MISMA vista: **Jefe** (cinta + alta + detalle, conservado) y **Trabajador** (nueva:
   ficha `obtener` + cinta `listar` + orden `categorias`). El registro no cambia —
   sigue siendo `catalogo-modelos-panel`. La cara del worker es de LECTOR casi puro:
   reutiliza el store `stores/catalogo.ts` (sin duplicar — `modelos`, `categorias`,
   `obtenerModelo`), filtra localmente con un derivado `$` (`modelosWorker`) para
   agrupar por categoría, y **NO tiene gesto de escritura** (el trabajador no registra;
   el alta y el detalle-modal siguen siendo del jefe).

## Dataset de patrones (aprendizaje para automatizar F7)

| forma UI | disparo | elementos recurrentes | plantilla de decisión |
|---|---|---|---|
| tabla/cinta | muchos registros, columnas fijas | fila = ref para obtener; estados vacío/cargando/datos | el ref-label del blueprint (`nombre`) alimenta la fila |
| formulario modal | 1 escritura multi-campo | campos del blueprint (args required) + select de categorias | 1 modal no fases si el blueprint no declara flujo de fases |
| select | campo con opciones finitas | alimenta otro campo del mismo formulario | fuente = op `categorias` (distinct de listar) |
| vista detalle | registro ya visible en la cinta | muestra todo el modelo (metadatos) sin abarrotar la lista | id se toma de la fila seleccionada (ref de obtener) |

Los campos obligatorios salen de `registrar.args[].required`; los select de
`args[].forma === 'select'` con `args[].fuente` → op del dominio.
