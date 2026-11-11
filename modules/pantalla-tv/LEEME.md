# pantalla-tv — la base, no la pantalla de nadie

Una pantalla de calle que **no sabe de pizzas**. Sirve para cualquier negocio: recibe
piezas ya hechas y las coloca. Lo específico de cada proyecto vive en **un solo fichero
de cableado** que está en su storage, no en el código.

```
BLOQUE  = dueño de una fuente y de una forma. Ej: carta, porciones, promos, servicio, marca.
PIEZA   = átomo neutro que cruza la frontera. Lo único que la pantalla entiende.
ZONA    = geometría (A..F). No sabe qué hay dentro.
```

La pantalla **no lee discos, ni cartas, ni precios**. Solo pinta piezas. Si un dato no
cabe en una pieza, cambia el BLOQUE — nunca el render.

## Quién hace qué

| Pieza del sistema | De quién es | Qué hace |
|---|---|---|
| `render/pantalla.html` | este módulo | pinta piezas. Fondo/acento/texto los tiñe con `presentacion.colores`; la paleta por defecto es neutra, no es la marca de nadie |
| `construir.js` | este módulo | **puro**: cableado + datos → piezas. No toca disco, no conoce rutas |
| `fuentes/*.js` | este módulo | un bloque = una fuente + una forma + su curación |
| `index.js` | este módulo | el **timbre**: escucha el bus, lee por `fs.read` con el `project_id` del evento, escribe `index.html` + `bloques.json` |
| `pantalla-tv/cableado.json` | **el proyecto** | qué bloques entran, en qué zona, con qué curación, y dónde se publica |

## Formas de pieza

| forma | qué es |
|---|---|
| `cabecera` | marca · estado (abierto/cerrado) · logos |
| `cinta` | una línea que corre |
| `foto` | imagen grande + nombre + precio |
| `ficha` | tipografía: nombre, argumento, etiquetas, precio |
| `cifra` | un dato solo, grande (promo) |
| `contacto` | dónde y cómo pedir (fijo, no rota) |
| `franja` | piezas pequeñas en fila (trozos) |

## Cadencia (cada bloque la declara)

- `fijo` — no cambia (marca, contacto, estado).
- `dia` — cambia con la fecha, no con el reloj (zona del día).
- `tanda` — rota en el carrusel.

## Zonas (1920×1080)

| zona | medida | qué es |
|---|---|---|
| A | 96 px | cabecera: sello a los dos lados, estado en el centro |
| F | 34 px | cinta que corre |
| B | 452 px | zona del día |
| C | 1fr (≈1,2:1) | carrusel, casi cuadrado |
| D | 342 px | contacto + QR (no rota) |
| E | 104 px | franja inferior (trozos). **Se colapsa si no hay dato** |

## Cómo se engancha (por evento, no por vigilante)

El módulo escucha lo que el sistema **ya emite**: `carta.actualizada`, `carta.editada`,
`carta.borrada`, `contenido.actualizado`, `marketing.perfil.actualizado`,
`servicio.cambiado` y `cartadigital.publicado` (la republicación del dueño). Agrupa los
eventos con un rebote de 4 s —una edición de precios emite N eventos— y hornea una vez.

No barre ficheros ni mira fechas de modificación: si el dato cambia, alguien lo dice.
Puerta manual y recuperación tras un reinicio: `pantalla-tv.construir.request`
(`{ project_id }`).

**El nombre del evento viaja en `event_type`** en el bus de Enki, no en `event`: leer el
campo equivocado deja el enganche mudo sin dar ningún error.

## Reglas de honestidad (las que no se saltan)

- **Carta en borrador**: no se publica nada. La pantalla se queda con la última buena.
  Precios viejos, nunca; precios de un borrador, jamás.
- **Proyecto sin cableado**: no hay pantalla. Es opt-in, no un efecto colateral.
- **Bloque sin fuente** (`porciones`, y `promos` mientras no haya quincena aprobada):
  cero piezas y la franja se colapsa. Ni un hueco ni un precio de relleno — un «— €»
  en el escaparate es peor que no enseñar la franja.
- **Promo sin aprobación**: no se anuncia. La oferta (`pizzepos/promos.json`) solo entra
  si en el calendario de marketing hay una entrada `programado`/`ejecutado`, del canal
  declarado en `cableado.promos.canal_id` y con fecha dentro de la quincena vigente
  (1-15 o 16-fin). Un borrador es una idea, y una idea no se pone en la calle.
- **Dato de ayer** (porciones): no se pinta.
- **La misma foto no se repite**: si el fichero es idéntico, la segunda pasa a ficha. Si
  son remotas, dos URLs distintas son dos fotos (el bug de «solo hay una foto» con cuatro
  fotos reales venía de hashear un fichero local que no existía).

## Añadir un bloque nuevo (el caso porciones, cuando exista el módulo)

1. Crear `fuentes/<nombre>.js` con `{ id, forma, piezas(ctx), requiere? }`.
2. Declararlo en el cableado del proyecto con su zona.
3. Si aún no hay fuente: devolver `[]` y declarar `requiere`. **Nunca** un relleno.

### Contrato que pide el bloque porciones (y nada más)

```json
{ "fecha": "YYYY-MM-DD", "precio_porcion": 3.00,
  "pizzas": [ { "producto_id": "...", "nombre": "...", "imagen": "..." } ],
  "bundle": { "cada": 4, "precio": 10.50 } }
```

El fichero es `pizzepos/porciones.json` del proyecto y lo escribirá **el módulo
porciones**, no la pantalla.

## Verificación (sin desplegar)

```
node modules/pantalla-tv/test/construir.test.js        # reglas del constructor (sin datos reales)
node modules/pantalla-tv/test/modulo.test.js           # camino completo del módulo, con bus de mentira y datos reales
node modules/pantalla-tv/scripts/verificar-vivo.js     # lo construido contra lo que sirve la calle, pieza a pieza
```

`verificar-vivo` es la prueba que importa: lee los datos del proyecto, construye con el
código versionado y compara con el `bloques.json` publicado. Si el port cambió una pieza
—precio, forma, orden, foto degradada a ficha— canta y sale con 1.

## Las imágenes (sello, QR)

No las genera el módulo: son del proyecto. El cableado apunta a su URL (`logo_url`,
`qr_url`); si `qr_url` es null se usa `qr.png` relativo al destino. El módulo solo escribe
`index.html` y `bloques.json`.
