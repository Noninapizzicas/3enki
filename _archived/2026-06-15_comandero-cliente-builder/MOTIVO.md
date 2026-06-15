# comandero-cliente-builder — ARCHIVADO 2026-06-15

Redundante ENTERO. Sus tres patas ya las cubre el subsistema digital nuevo:

| pata del builder              | sustituto canónico                         |
|-------------------------------|--------------------------------------------|
| `comandero-cliente.imagen.subir` (imagenes/{prod}.{ext}) | `contenido.add_imagen` (base audiovisual) |
| `presentacion.json` (imagen_url·descripción·orden·oculto) | `contenido` + carta-manager (orden)        |
| `bundle.generar` (PWA HTML estática)                      | `carta-digital/static-template.js` (superconjunto: carrito·WhatsApp·chat IA·reseñas·ofertas·i18n) |

## Hilo suelto que deja (pieza siguiente, NO motivo para conservarlo)
El export estático de carta-digital (`export-cli.js`) lee la carta cruda del
disco y usa `p.imagen` (vacío en el modelo lean: las imágenes viven en
`contenido`). Debe sourcear de la PROYECCIÓN (`get_carta_publica` / `_proyectarPublica`),
que ya fusiona contenido (imágenes) + marca (branding) + carta. Así la PWA
exportada hereda imágenes y marca sin tocar la carta del POS.
