---
name: verificar-en-vivo
description: No te fíes de la config, los tests ni la lógica — pruébalo contra la realidad; el bug se esconde donde no miras
fuente: enki
dominio: metodo
tags: [verificacion, smoke, no-a-fe, realidad, diagnostico]
---

# Verificar en vivo (no a fe)

La config decía priority 1. El unit test pasaba 10/10. El smoke de API cruda daba 200.
Y aun así el turno real fallaba (404). Solo probar end-to-end contra el sistema vivo
encontró el bug. **La lógica que no tocaste puede mentir; la realidad no.**

## Cuándo usar
Antes de dar por bueno un cambio que "debería" funcionar — especialmente si tocó una
frontera (red, provider, protocolo, entrega) o si un síntoma no cuadra con tu modelo mental.

## Mecanismo
1. **Reproduce el camino real**, no una versión simplificada. El smoke fácil pasa donde
   el path completo rompe (payload más grande, más tools, otra rama de código).
2. **Mide, no asumas.** Si dudas si algo se corta/pierde/cachea, consúltalo en vivo
   (la DB, el endpoint, el bus) y lee el dato crudo. El `finish_reason`, el `usage`, el
   `stop_reason` te dicen la verdad que la intuición esconde.
3. **Si el dato te contradice, gana el dato.** Owned: "mi caveat quedó refutado por la
   medición" es un buen resultado, no una derrota.
4. **El bug vive donde no miras.** El 404 estaba en `new URL(path, base)` descartando un
   segmento — invisible en config y tests, visible en un turno real.

## Anti-patrones
- Subir un número "a ojo" para arreglar un síntoma sin confirmar la causa (parche).
- Fiarse de una etiqueta caduca ("tool-use roto") sin re-verificarla.
- Declarar "hecho" cuando lo único verificado es que compila.

## Procedencia
Nacida del uso real de Enki (sesión deepseek "mismo idioma", 2026-06). Candidata a que
el destilador la selle como ruta cuando el patrón se repita.
