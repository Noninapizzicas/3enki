# PASADA 3 · DESGLOSE del punto `oferta-reparto` (el cuello, segunda vuelta)

> El prisma no se para en la ronda 2. Los cuatro sub-puntos del cuello que **todavía se
> parten** vuelven al prisma; los que son atómicos o abiertos se quedan y se marcan.

## 3.1 · `aceptacion-atomica` → SE PARTE en 3
- **IDENTIDAD**: el acto de aceptar es un contrato puntual con hora. ¿Qué lo parte? Que
  hay carrera: dos riders mirando la misma oferta.
- **RESTRICCIONES**: si dos aceptan, uno trabaja gratis y no vuelve. → **EMPUJÓN**: el
  pedido se bloquea al primer aceptante y el segundo recibe "ya cogido" **sin coste**.
- **Sub-hojas**:
  - `bloqueo-de-pedido` — ATÓMICA. Un pedido tiene un solo aceptante en un instante.
  - `rechazo-por-carrera` — ATÓMICA. El segundo no pierde nada; se le devuelve a la oferta.
  - `hora-de-aceptacion` — ATÓMICA (hecho con hora → alimenta `hechos-del-reparto`).
- **PREGUNTA ABIERTA**: ¿"el que está cerca gana" (F0) es solo elegibilidad, o hay
  preferencia por distancia en la adjudicación? Si hay preferencia, hay puntuación — y
  la F0 dice que no hay puntuación oculta. **Decide el dueño.**

## 3.2 · `enlazado-viaje` → SE PARTE en 4
- **IDENTIDAD**: el producto. Tres pedidos, tres importes, un trayecto.
- **RESTRICCIONES**: enlazar de más enfría la comida y retrasa al cliente que pidió
  primero; enlazar de menos quema kilómetros y el rider gana menos por hora.
- **Sub-hojas**:
  - `compatibilidad-geografica` — ATÓMICA. Misma zona / mismo sentido de trayecto.
  - `compatibilidad-temporal` — ATÓMICA. La ventana de recogida del segundo pedido cae
    dentro del viaje del primero.
  - `tope-enlace` — **ABIERTA**. La F0 dice 2–3; el tope exacto y quién lo fija, no.
  - `coste-de-enlazar` — ATÓMICA. Cada pedido conserva **su** importe y **su** reloj: el
    enlace no diluye la tarifa ni la espera de nadie.
- **PREGUNTA ABIERTA**: ¿se pueden enlazar pedidos de **tiendas distintas**? La F0 dice
  "2–3 pedidos del mismo viaje" sin decirlo. Cambia el alcance del producto.

## 3.3 · `espera-declarada` → SE PARTE en 3
- **IDENTIDAD**: lo que el rider sabe **antes** de aceptar: cuánto va a esperar.
- **Sub-hojas**:
  - `espera-prevista-tienda` — ATÓMICA. Hora comprometida por la tienda frente a la hora
    estimada de llegada del rider. Si es negativa, se muestra como retraso.
  - `espera-prevista-portal` — **ABIERTA**. No hay dato del cliente (no hay app, no hay
    histórico propio de la dirección). ¿Se estima por el histórico de esa dirección en
    esa tienda? No declarado: **no se inventa**.
  - `ventana-de-recogida` — ATÓMICA. La hora a la que la tienda se compromete a tenerlo.
- **EMPUJÓN**: mostrar la espera prevista **convierte el riesgo en información**, y la
  información es lo único que el rider pide para aceptar.

## 3.4 · `liberacion-por-abandono` → SE PARTE en 2
- **IDENTIDAD**: el rider aceptó y no aparece. El pedido no puede quedar secuestrado.
- **Sub-hojas**:
  - `timeout-de-llegada` — ATÓMICA (un reloj: aceptó, no llegó en N). El valor de N, abierto.
  - `reemision-de-oferta` — ATÓMICA. El pedido vuelve a la oferta con su histórico intacto
    (que el segundo rider vea que ya hubo un abandono).
- **ABIERTA**: qué significa exactamente "pierde el pedido" (F0 q4): ¿pierde la tarifa,
  la prioridad, o solo el pedido? No declarado.

## 3.5 · Los otros cuatro ya son hojas
`elegibilidad-rider` (atómica: regla de distancia/capacidad), `visibilidad-oferta`
(atómica: la misma vista para todos los elegibles), `historico-restaurante` (custodio de
hechos medidos), `oferta-sin-rider` (puente: dispara a la sala).

## SUELO DE ESTA RAMA
De 8 sub-puntos: **5 atómicos**, **2 abiertos**, **1 repetido** (`espera-declarada`
alimenta también `adjudicacion-fallos`). La rama no se parte más.
