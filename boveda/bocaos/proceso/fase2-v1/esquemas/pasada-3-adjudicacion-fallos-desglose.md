# PASADA 3 · DESGLOSE del punto `adjudicacion-fallos`

> BOCAOS NO JUZGA, MIDE. Esta pasada baja las tres reglas a relojes y comprueba dónde
> el esquema se queda sin dato — que es donde hay que preguntar, no suponer.

## 3.1 · `ventana-espera` → SE PARTE en 3 ventanas
- `ventana-tienda` (N_t) — **ABIERTA**: minutos que el rider espera en tienda antes de
  que la espera pase a cargo del restaurante. Valor no declarado.
- `ventana-portal` (N_c) — **ABIERTA**: minutos que el cliente tiene para bajar antes de
  que la espera pase a su cargo. Valor no declarado.
- `ventana-aceptacion` (N_a) — **ABIERTA**: minutos que el rider tiene para llegar a la
  tienda tras aceptar antes de perder el pedido. Valor no declarado.
- **EMPUJÓN**: las tres son **declarables y cambiables en caliente** (`umbral-mercado`):
  el dueño afina el mercado sin tocar una línea de código. Es el freno convertido en
  capacidad de gobierno.

## 3.2 · `regla-pago-fallo` → SE PARTE en 3 reglas
- `regla-espera-tienda` — ATÓMICA. Espera > N_t **y** el pedido no estaba listo en la
  hora comprometida → el coste de la espera lo paga la tienda al rider.
- `regla-espera-cliente` — ATÓMICA. Rider en el portal > N_c y el cliente no baja → lo
  paga el cliente al rider.
- `regla-abandono-rider` — ATÓMICA. Rider acepta y no llega en N_a → pierde el pedido
  (consecuencia exacta: **ABIERTA**, F0 q4).
- Las tres son **deterministas**: mismo hecho, mismo resultado, siempre. Un test las
  afirma. Aquí no hay agente que opine — ese es el corazón del negocio.

## 3.3 · `hecho-verificado` → SE PARTE en 3
- `cruce-de-relojes` — ATÓMICA. Compara los hechos de `reparto-medido` con la ventana.
- `cruce-de-listo` — ATÓMICA. ¿El pedido estaba listo antes de que el rider llegara?
  (hora de listo ≤ hora de llegada a tienda).
- `fallo-sin-prueba` — **ABIERTA**. Si falta un hecho (sin foto, sin posición, sin hora de
  bajada): ¿se presume a favor del rider, de la tienda o del cliente? **No declarado.**
  Sin esta respuesta, la regla se cae en el primer caso raro.

## 3.4 · `cargo-fallo` → SE PARTE en 2
- `asiento-cargo` — ATÓMICA. Quién debe cuánto a quién, por qué hecho y con qué evidencia.
- `efectividad-cargo` — **ABIERTA Y CRÍTICA**. Cómo se hace efectivo el cargo si Bocaos
  no toca el dinero: ¿pago directo entre partes, compensación contra la cuota semanal,
  fianza retenida? Es el hueco que puede dejar toda la adjudicación en decorativa.

## 3.5 · `disputa-fallo` y `trazabilidad-fallo`
- `disputa-fallo` — PUENTE a la sala (no re-adjudica: se aplica o se corrige con el acta).
- `trazabilidad-fallo` — ATÓMICA. Todo cargo viaja con su evidencia; sin evidencia, no
  hay cargo.

## SUELO DE ESTA RAMA
De 6 sub-puntos: **4 atómicos**, **4 abiertos** (las tres N + efectividad + sin prueba),
**0 repetidos**. La rama baja hasta el dato que falta: **el esquema queda a la espera del
dueño, no de más diseño.**
