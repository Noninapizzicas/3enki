# Archivado: módulo `pizzepos/ingredientes` (el cadáver)

**Fecha**: 2026-10-17
**Decisión**: retirar el módulo `ingredientes`. Su contrato UI se rebinda sobre `productos`
(misma proyección de la carta). Su autoridad de precio_extra ya vive en el custodio.

## Qué era y por qué se retira

`ingredientes` se describía a sí mismo como *"Fuente única de precios (precio_extra).
Sincronizado desde carta.actualizada y producto.creado."* No cumplía ninguna de las dos:

- **`producto.creado`**: nadie lo emite (0 emisores en los 30 módulos; `variaciones/index.js`
  lo documenta como *legacy*). El handler `onProductoCreado` era código muerto.
- **`carta.actualizada`**: sí se publica y sí se atiende, pero el handler desestructura
  `{ ingredientes_catalogo, productos }` (`index.js:84`) y el emisor manda
  `{ carta, motivo, correlation_id }` (`carta-manager/index.js:294`). Los dos campos llegan
  `undefined`, los dos `if` se saltan → **no ingesta nada**, sin excepción ni log.
- **`_saveToDisk`** materializaba el catálogo ENTERO en `ingredientes.json`, justo lo que su
  propio documento de diseño (`arquitectura/decisiones/subsistema-catalogo/pseudocodigo/
  ingredientes.md`) pedía dejar de hacer.

Prueba en vivo (canal `ui/request`, `project_id` de the-pirate): `ingredientes.list` → **total 0**.
El fichero `data/projects/the-pirate/storage/pizzepos/ingredientes.json` = `[]` (2 bytes).

## Qué lo sustituye

El catálogo **ya se deriva** de la carta viva, no de un store:

- **`productos._proyectarCatalogoIngredientes(carta)`** (unión de los ingredientes de todos los
  productos, dedup por id). Ahora también emite **`grupos`** = las puertas/categorías donde
  aparece cada ingrediente — el filtro que ya leían `carta-digital` (static-template
  `extrasForGroup`) y el panel. Nace del DATO que viaja en la carta, sin estado nuevo.
- **Su dominio UI (`ingredientes.*`) se REBINDA sobre `productos`** (ver `productos/module.json`
  `ui_handlers`): list / get / get_precio / search / alergenos / update / update_precios /
  health / metrics. El frontend (`lib/modules/ingredientes/`) NO necesita cambiar: los nombres
  domain+action son idénticos.
- **La autoridad de `precio_extra` YA VIVE en el custodio**: `carta.update_extras.request`
  (`carta-manager`) cambia el precio del extra en **TODAS** las apariciones, en **una** versión.
  La implementación del módulo era una segunda copia peor de algo que el custodio ya hacía.

## Principio (filosofía Enki)

*"Un DATO que viaja en el evento gana a estado nuevo o módulo."* Este módulo hacía lo contrario:
copiaba el catálogo a un store y lo materializaba en disco. Dos sitios que saben el catálogo =
divergencia garantizada. Retirarlo deja **una sola fuente** (la carta) y **cero stale**.

## Cómo se cazó

La cúpula de eventos (`scripts/cupula-eventos/vigilante.js`) no lo cantaba porque:
1. los validadores comprueban que los eventos estén DECLARADOS, no que se CUMPLAN;
2. la cúpula cantaba `rpc_fantasma` y `publish_huerfano`, pero NO la tercera clase — un
   **suscriptor cuyo evento nadie emite**. Un oyente muerto no loguea, no lanza, no expira.
3. el cruce era por NOMBRE, no por FORMA (las CLAVES del payload no se miraban).

Los tres agujeros se cerraron en el mismo PR: la cúpula ahora canta `suscriptor_huerfano`,
soporta manifests con `subscribes`/`publishes` en forma dict (antes tumbaban el vigilante con
`subs is not iterable`, y por eso llevaba sin ladrar), y cantó este módulo.

## Tests

- `tests/unit/pizzepos__ingredientes.test.js` → RETIRADO (probaba el módulo muerto).
- `tests/unit/pizzepos__productos-ingredientes.test.js` → el relevo: la proyección emite
  `grupos`, un extra de otra puerta no cae en la pizza, y el dominio `ingredientes` responde
  ya desde `productos`. Enganchado al CI (`npm run test:pizzepos-ingredientes` en validate.yml).
- `tests/unit/cupula-eventos__runtime.test.js` → sigue verde (la cúpula no rompe con dict).

## Lo que la cúpula destapó al revivir (triaje pendiente, NO de este PR)

El vigilante llevaba CRASHANDO en CI (manifest dict de `banco-ideas`), así que el paso
`cupula-eventos` estaba rojo sin informar. Al revivir, canta 6 `rpc_fantasma` PREEXISTENTES
de otros módulos (nadie los atendía, quedaban ocultos tras el crash):

- `cola.longitud.request`, `filamento.listar.request` ← `modules/adaptador-avisos/index.js`
- `notificar.request` ← `modules/cuenta-recurrente/index.js`
- `ciclo-impresion.estado.request` ← `modules/panel-jefe` y `modules/panel-trabajador`
- `recetas.actualizar_precio.request` ← `modules/pizzepos/escandallo/escandallo.blueprint.json`

Cada uno es un `publishAndWait` que espera respuesta de un evento que nadie atiende (timeout).
Arreglarlos es trabajo aparte: hay que decidir el nombre real del evento en cada caso.

