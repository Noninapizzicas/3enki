# importacion-modelo — decisiones de interfaz (F7)

> PRÁCTICA (5ª iteración): cada fila documenta la cadena
> **evento → contexto → forma → elemento → atributos** y el **por qué**.
> Este caso es el **ÚLTIMO panel de la vertical 3D** y documenta el patrón
> **FORMULARIO DE ACCIÓN** (el jefe que IMPORTA), el 5º del dataset.
> Fuente de verdad: `modules/importacion-modelo/index.js` (handlers reales) y
> `importacion-modelo.blueprint.json` (F6½). Construido como ingeniero de
> interfaz de Enki siguiendo la práctica de pedidos/catalogo-modelos.

## Cadena evento → contexto → forma → elemento → porqué

| op | evento (RPC) | contexto | forma | elemento | atributos | por qué |
|---|---|---|---|---|---|---|
| importar | importacion.importar.request → .response | 1 escritura de entrada multi-campo (editor-bloque), puente stateless | formulario de acción | form editor-bloque (url + select origen + categoría + nombre) | url*(obligatoria), origen(select), categoria, nombre(opcional) | el gesto REY del jefe: decide QUÉ modelo entra al taller; declaración de 1 gesto, no fases; ÚNICA RPC real del módulo |
| feedback en_progreso | tras disparar importar | importación de larga duración (descarga → lee .3mf → registra) | badge transitorio | .feedback-enprogreso (⏳ + spinner) | importando (bool) | refleja que el puente trabaja mientras espera la señal pareada; nunca recarga |
| feedback importada | importacion.importada (señal) | confirmación real del registro en el catálogo | badge terminal (verde) | .feedback-importada (✅) | modelo_id, nombre, origen, archivo3mf | la señal pareada ES la forma con valor de negocio del puente; enlaza a ver el modelo en el catálogo |
| feedback fallida | importacion.importar.failed (señal) | par de fallo con motivo tipado | badge terminal (rojo) | .feedback-fallida (❌) | motivo tipado + mensaje honesto | muestra con honestidad las restricciones del SISTEMA (503 sin descargador / 422 falta_3mf); el jefe reintenta |
| campo origen | declaración | opciones finitas | select | combobox origen | printables/makerworld/cults3d/thingiverse/diseno propio/desconocido | evita tipeo errado en `origen` (default desconocido) |
| campo categoría | declaración | opciones sugeridas | input + datalist | campo categoría | categorías sugeridas, default sin_categoria | decisión [ABIERTO] del dueño (select precargado vs libre); se ofrece datalist de sugerencias |
| campo url | declaración | entrada del repo o diseño propio | input | campo url | url (obligatoria, 400 url_requerida) | es lo REAL: el dueño pega la URL cuando ya eligió (la búsqueda previa delega a busqueda-repositorios, no es handler de este módulo) |

## Señal-refresh (tiempo real, nunca recarga)

| evento publicado | refresh_on | elemento que late | por qué |
|---|---|---|---|
| importacion.importada | estado → importada + resultado | badge del feedback + enlace al catálogo | la señal confirma el registro EN EL CATÁLOGO (R3); el resultado vive en catalogo-modelos |
| importacion.importar.failed | estado → fallida + error/motivo | badge rojo + botón reintentar | par de fallo: todo flujo cierra su círculo |

## Cadena completa por op

```
IMPORTACION.IMPORTAR (RPC, ROL JEFE — única operación del puente)
   │   └──> form editor-bloque: url* + select origen + categoría + nombre
   │        validaciones del SISTEMA visibles en el feedback (no decide la UI):
   │        400 url_requerida · 400 project_id_requerido · 503 DESCARGADOR_NO_CONFIGURADO
   │        502 DESCARGA_FALLIDA · 502 ARCHIVO_VACIO · 422 FALTA_3MF (no se convierte) · 502 REGISTRO_FALLIDO
   │
IMPORTACION.IMPORTADA (señal pareada)
   │   └──> badge terminal ✅ (modelo_id, nombre, origen) + enlace "ver catálogo →"
   │
IMPORTACION.IMPORTAR.FAILED (señal pareada)
   └──> badge terminal ❌ (motivo tipado + mensaje honesto) + "reintentar"
```

## Matiz de honestidad — la búsqueda previa NO es RPC de este módulo

El flujo del dueño es **buscar → elegir → importar**. Pero la búsqueda (`_buscar`)
es una **delegación interna** a `busqueda-repositorios` por `_rpc('busqueda.buscar.request')`:
**NO existe `onBuscarRequest` en index.js** y `module.json.subscribes` SOLO tiene
`importacion.importar.request`. Por LEY DE CERO SUPUESTOS, el panel NO implementa
una caja de búsqueda propia ni llama a un handler que no existe. La forma REAL es
**pegar la URL** (lo que el dueño hace cuando ya eligió en el PC/repo, hueco
[ABIERTO] (a) del esquema-jefe). El RPC `buscar` expuesto vive en
`busqueda-repositorios`, no en este puente.

## Decisiones de arquitectura de la práctica

1. **Store MQTT reflejo (no cálculo).** `stores/importacion.ts` sigue el molde
   canónico: `initialState` + `importacionStore` (writable) + derivados +
   `importarModelo` (acción vía `mqttRequest('importacion-modelo', 'importar', …)`)
   + `initImportacionSubscriptions` (subscribe a las 2 señales → write del estado
   terminal) + `resetImportacion`. La UI no tiene lógica de negocio: el estado
   `importada` SÓLO se escribe al recibir la señal pareada (R2/R3).

2. **Panel específico, no BlueprintForm.** `ImportacionModeloJefePanel.svelte`
   reemplaza el envoltorio genérico: formulario de acción + feedback de estado
   por señal + vacío "listo para empezar", con lenguaje visual color/icono/texto
   (📥 entidad, ✅/❌/⏳ estado).

3. **Filtro por rol declarado en el blueprint.** `importar` es rol jefe y la
   única op. Todo el panel es la cara de declaración de entrada del pipeline.

4. **Multi-tenant.** El store lee `sessionProjectId` y filtra las señales por
   project_id; al cambiar de proyecto `resetImportacion()` vacía.

5. **Feedback honesto de restricciones del sistema.** El módulo decide los
   errores (503 sin descargador / 422 falta_3mf / 502 registro fallido — no la
   UI); el badge fallido los muestra con el motivo tipado y la mensajería real
   del index.js, y deja "reintentar".

## Dataset de patrones (aprendizaje para automatizar F7)

| forma UI | disparo | elementos recurrentes | plantilla de decisión |
|---|---|---|---|
| formulario de acción | 1 operación de larga duración (descarga+registro) de un puente sin lectura propia | url* + select origen + categoría + nombre; sin lista (no hay historial del puente) | 1 gesto editor-bloque que dispara la única RPC; el resultado lo confirma la señal pareada |
| feedback por señal (estados transitorio/terminal) | en_progreso (no terminal) → importada/fallida (terminal) | badge de color (⏳/✅/❌) + mensaje tipado + acción contextual | los estados vienen de blueprint ui.estados (color/icono/terminal); el error muestra el motivo REAL del backend, no uno inventado |

Los campos obligatorios salen de `importar.args[].required`; los select de
`args[].forma === 'select'` con `args[].fuente` → op del dominio. Aquí no hay
campos RPC lectores que alimenten el form (puente sin store): solo el select
origen es finito; categoría se sugiere con datalist [ABIERTO].
