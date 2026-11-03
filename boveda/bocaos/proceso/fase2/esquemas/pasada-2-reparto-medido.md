# PASADA 2 · PUNTO: `reparto-medido`

> **Heredada de la pasada 2** (`fase2-v2/esquemas/pasada-2-reparto-medido.md`) y revalidada contra la F0 §7.
> F. Sin cambios.
> Se reproduce aquí para que `esquemas/` quede completo; los deltas de la tercera pasada
> están en `pasada-2-corte-de-piezas.md` y en `esquema.md` §1.

> Sale del hueco CONTRATO de la pasada 1 (la ejecución). Aquí aparece **el borde fuzzy**: la
> F0 §6 deja entrar a la IA "en el borde (entender un mensaje, redactar, resumir)", y el único
> sitio del negocio donde hay un mensaje libre que entender es la incidencia.

## Prisma de los 5 huecos

### 1 · IDENTIDAD
La ejecución del reparto convertida en hechos con hora: recogida, llegada, entrega, prueba. Es
lo que permite que el mercado se corrija sin que nadie opine — y lo que permite que un enlace
pasado se pueda auditar.

### 2 · RESTRICCIONES (freno → empujón)
- **FRENO**: los hechos se pueden reescribir "para arreglarlos".
  → **EMPUJÓN**: `hechos-del-reparto` append-only. Un hecho corregido es un hecho nuevo.
- **FRENO**: el rider llama al cliente con su número y pierde el suyo.
  → **EMPUJÓN**: `chat-enmascarado` (puente): el mensaje cruza, el número no.
- **FRENO**: la incidencia llega como relato libre ("no encontraba el portal, el chico no
  bajaba, he esperado un montón") y hay que meterla en una cola con campos.
  → **EMPUJÓN**: `lectura-de-incidencia` — **el único fuzzy fuera de la cadena de decisión**.
  Clasifica el relato en los campos que la cola ya tiene; un validador puro rechaza cualquier
  campo inventado. **No adjudica, no puntúa, no decide.**

### 3 · CONTRATO
El rider da: hechos y prueba. Recibe: que su relato se lea y que su espera se mida (G). El
cliente da: instrucciones de acceso y, al final, una confirmación.

### 4 · NO-OBJETIVOS
No predice tiempos · no puntúa riders · no decide culpables · no conserva la traza más de lo
declarado (Q38).

### 5 · PREGUNTAS ABIERTAS
Q38 (traza) · Q30 (si falta prueba, ¿a favor de quién?) · ¿la foto de entrega es obligatoria o
opcional? · ¿qué pasa si el cliente no está?

## Hojas
`hechos-del-reparto` (CUSTODIO) · `prueba-entrega` (CUSTODIO) · `seguimiento-vivo` (REFLEJO) ·
`chat-enmascarado` (PUENTE) · `instrucciones-acceso` (CUSTODIO) · `incidencia-reparto` (PUENTE) ·
`lectura-de-incidencia` (**FUZZY**)
