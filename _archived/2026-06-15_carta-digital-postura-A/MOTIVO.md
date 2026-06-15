# carta-digital "Postura A" — ARCHIVADO 2026-06-15

4 paneles work-bar (carta-config, carta-preview, carta-export, carta-stats) que
servían la carta-digital VIEJA (blueprint + agente + snapshot /carta-digital.json).
Reliquias tras reescribir el backend a PROYECTOR (v2.0.0) y el frontend a la
"Postura B" (módulo carta-digital con 3 zonas: Identidad/Opciones/CartaCompuesta).

Promoción A→B: el módulo nuevo pasó de la ruta aislada /carta1 a /carta-digital;
estos 4 se retiran. Qué hacía cada uno y quién lo sustituye:

| panel viejo  | apuntaba a (muerto)                       | sustituto (Postura B)              |
|--------------|-------------------------------------------|------------------------------------|
| carta-config | fs.write /carta-digital.json (branding)   | IdentidadZone (marca, RO) + OpcionesZone (cartadigital.update_config) |
| carta-preview| fs.read /carta-digital.json (snapshot)    | CartaCompuestaZone (get_carta_publica, proyección al vuelo) |
| carta-export | agent.execute cartadigital-pwa-builder (agentes aparcados) | export-cli.js (carta-digital/static-template) |
| carta-stats  | op `stats` inexistente en el blueprint    | — (stub, sin sustituto: nadie lo pedía) |

## Hilo suelto (pieza siguiente)
"Publicar PWA desde el frontend" no tiene op de backend viva (carta-export
disparaba un agente muerto). El export hoy es CLI offline (export-cli.js). Si se
quiere botón "Publicar" en OpcionesZone, hace falta un ui_handler de carta-digital
que corra generateStaticHTML server-side y escriba el bundle (o dispare cf-worker deploy).
