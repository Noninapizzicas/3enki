# PASADA 2 · PUNTO: `sala-mercado`

> Sale del hueco PREGUNTAS_ABIERTAS de la pasada 1 ("¿quién atiende la sala?"). Con el matiz
> gana una función nueva: **la revisión humana de decisiones automáticas**, que la Directiva
> (UE) 2024/2831 hace exigible incluso para no asalariados (art. 8, extendido por el art. 10).

## Prisma de los 5 huecos

### 1 · IDENTIDAD
La operación humana mínima del mercado: dar de alta, ver el estado, atender la excepción,
sancionar con acta. Y — nuevo — **revisar a mano lo que el reflejo decidió**, cuando alguien
lo pide.

### 2 · RESTRICCIONES (freno → empujón)
- **FRENO**: sin cola única, las excepciones se pierden en tres bandejas.
  → **EMPUJÓN**: `cola-sala` (custodio, una sola cola).
- **FRENO**: la revisión humana puede convertirse en "el humano aprueba lo que dijo el
  sistema".
  → **EMPUJÓN**: `dictamen-revision` con firmante y motivo; su efecto es un **hecho**, no una
  re-optimización. Si el dictamen rehiciera la propuesta, el humano sería un planificador — y
  no hay planificador.
- **FRENO**: la sala no puede saber si el mercado respira sin agregados.
  → **EMPUJÓN**: `salud-mercado` + `tablero-fricciones` (los 8 pares de la F0, medidos).

### 3 · CONTRATO
Da: la mano humana donde el reflejo no llega. Recibe: una cola priorizada por hechos (tiempo
esperando, pedidos afectados), no por quién grita más.

### 4 · NO-OBJETIVOS
No re-juzga lo que ya mide la tabla · no decide a quién se propone (eso es el reflejo) · no
opera el negocio de la tienda.

### 5 · PREGUNTAS ABIERTAS
Q25 (¿se construye la revisión desde el día uno?) · Q26 (quién firma el dictamen) · Q40 (quién
atiende la sala, horario y manos) · Q34 (qué acredita el rider y quién lo verifica)

## Hojas
`alta-tienda` (CUSTODIO) · `alta-rider` (CUSTODIO) · `estado-tienda` (CUSTODIO) ·
`estado-rider` (CUSTODIO — **aquí vive la pausa que el propio rider declara**) ·
`salud-mercado` (REFLEJO) · `tablero-fricciones` (REFLEJO) · `aviso-sala` (PUENTE) ·
`terminos-parte` (CUSTODIO)
