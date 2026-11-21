# marketing-publicador · el panel de publicacion por proyecto (bloque 20a)

Un panel por proyecto, en su area de marketing:

```
https://enki-ai.online/a/<proyecto>/publicador/
```

El proyecto **sale de la ruta**. No hay selector: el panel de `laura` es
`/a/laura/publicador/` y no puede publicar en otro sitio, porque la carpeta que
lee y la API a la que llama son las de `laura`.

## Que hace

| Pieza | Que hace |
|---|---|
| `GET /modules/marketing-publicador/material/:proyecto` | Recorre `<public>/<proyecto>/media/` **en profundidad** y devuelve `{nombre, url, bytes, tipo, mime, modificado}` de **cada** fichero. Sin lista blanca de extensiones y sin tope de tamano. |
| `POST /modules/marketing-publicador/publicar` | Body `{proyecto, fichero, texto, destino}`. Comprueba que el fichero esta **dentro** del material, construye la orden, la emite al bus y devuelve `{id, estado:'enviado', orden}`. |
| `GET /modules/marketing-publicador/estado/:proyecto/:id` | `{estado, motivo, detalle, momento}`. El motivo, **tal cual** lo dijo el aparato. |
| `panel/` | `index.html` + `app.js` + `estilo.css`, a pelo (sin frameworks ni CDN). Se copia a `<public>/<proyecto>/publicador/` en `onLoad` (idempotente) o con `POST /panel/instalar/:proyecto`. |

El panel pinta la rejilla con **todo**: imagenes con miniatura, videos con su
icono, y cualquier otro formato con su nombre y su extension. Nada se esconde
por formato ni por tamano — el limite lo pone el aparato, no el panel.

## La orden (contrato con el aparato)

```text
topic:   core/<coreId>/events/bridge/orden/publicar
payload: {"id":"pub-…","accion":"publicar","red":"instagram",
          "destino":"historia"|"publicacion"|"reels",
          "texto":"…","media":{"url":"https://…/a/<p>/media/foto.jpg"},
          "archivo":"foto.jpg","proyecto":"<p>","simulacion":false}
```

Tres cosas que **no** son adornos:

1. **Va en crudo, no dentro de un sobre del bus.** `Orden::desde_payload`
   (`modules/instagram-bridge/crate/src/canal/bucle.rs`) lee el payload como la
   orden misma: con un sobre, al payload le falta `accion` en la raiz y el
   aparato contesta `campo_ausente`. Por eso se publica con
   `eventBus.mqtt.publish(topic, JSON.stringify(orden))`, no con
   `eventBus.emit` (que envuelve).
2. **`simulacion:false` es obligatoria.** Ausente se lee como simulacion y el
   aparato no mueve un dedo (verificado en el bloque 19d).
3. **`id`** es lo que empareja la respuesta con su orden. Sin el, el resultado
   llega y no se sabe de que publicacion habla.

## La vuelta: el resultado

El aparato contesta en `core/<coreId>/events/bridge/resultado` con
`{id, accion, red, ok, motivo, detalle, gestos}` **en crudo**, sin sobre. El bus
de JS descarta ese mensaje al validar el sobre (`EventEnvelope.validate` exige
`event_id`, `event_type`, `timestamp`, `source`), asi que el modulo escucha por
**dos puertas**:

- la suscripcion `bridge/resultado` del `module.json` (por si algun dia viene
  envuelto), y
- el topic MQTT crudo, en `onLoad`.

Las dos entran en el mismo normalizador (`_mapearResultado`) y aplicar dos veces
el mismo resultado no cambia nada.

## Los cuatro estados

| Estado | Cuando |
|---|---|
| `enviado` | La orden salio al bus y nadie ha contestado aun. |
| `recibido` | El aparato contesto algo que **no afirma** que se publico (un acuse, un resultado sin `ok`). Se nombra el hueco (`resultado_sin_ok`, `resultado_sin_cuerpo`). |
| `publicado` | `ok:true` con `simulacion != true`. **No se degrada**: publicar es irreversible y un resultado posterior no lo desmiente. |
| `fallo` | `ok:false`, o `ok:true` con `simulacion:true` (contradiccion: manda lo segundo). El `motivo` viaja **tal cual**. |

El motivo **no se traduce**. `servicio_no_activo` (hay que reactivar el servicio
de accesibilidad en el movil), `ancla_no_encontrada` (Instagram cambio un boton),
`campo_vacio` (el aparato exige texto) y `mano_sin_respuesta` (Kotlin no contesta
en 10 s) se arreglan de cuatro formas distintas: un "error generico" no deja
arreglar ninguna.

## Decisiones que se ven en el codigo

- **Sin filtro de formato ni de tamano.** No hay lista blanca: lo que no es
  imagen/video/audio/pdf/texto se lista como `otro` con su extension. Tampoco se
  sigue un enlace simbolico (sacaria la lista del proyecto), pero eso no es un
  filtro de contenido.
- **El texto va tal cual, aunque vaya vacio.** El minimo no lo pone el panel: lo
  pone el contrato del aparato, y si lo incumple se lee su `campo_vacio`. El
  panel lo avisa al lado del campo en vez de bloquear el boton por su cuenta.
- **Un panel por proyecto, sin selector.** Proyecto invalido o con `/` -> 400;
  el estado de un id de otro proyecto -> 404. El panel de un proyecto no asoma a
  lo de otro.
- **El panel se instala solo.** `onLoad` copia `panel/` a cada proyecto que ya
  tenga carpeta publica, y crea `media/` si falta. Idempotente: solo escribe lo
  que cambio. Si no puede escribir, avisa y sigue.
- **El publicador del bus es inyectable** (`context.publicador.publicar`): los
  tests no tocan la red y un multi-core podria hablarle a su propio core.

## Verificacion (real, en este servidor)

```bash
node modules/marketing-publicador/tests/panel.test.js
# [marketing-publicador] OK 14/14

for f in modules/instagram-bridge/tests/*.test.js; do node "$f" >/dev/null || echo "FALLO $f"; done
# ninguna linea FALLO: las 52 suites siguen OK

node <scratch>/panel-navegador.js     # chromium headless sobre el panel real
# [panel-navegador] OK 13/13
```

La prueba de navegador comprueba lo que ve el dueño: las cuatro tarjetas
(incluido un `.zip` con su nombre y un video con su icono), el boton que se
habilita, la orden que sale con `fichero` y `destino`, y el `fallo` con el
motivo `servicio_no_activo` **literal** en pantalla.

Lo que **no** se puede verificar aqui: que el aparato publique de verdad (eso es
el bloque 20b, con el movil en la mano) y que Caddy sirva el panel en
`/a/<proyecto>/publicador/` (el modulo lo copia; la ruta publica ya existe).
