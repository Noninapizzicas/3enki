# PASADA 2 · PUNTO: `adjudicacion-fallos` (BOCAOS NO JUZGA, MIDE)

> Sale del hueco RESTRICCIONES de la pasada 1 y del eslabón limitante: la espera es lo
> que hace que el rider se vaya. Este punto es **la razón por la que el rider se queda**.

## Prisma de los 5 huecos

### 1 · IDENTIDAD
La mesa donde el fallo se paga **sin que nadie opine**: tres relojes y tres reglas.
Si la espera supera N y el pedido no estaba listo → paga la tienda. Si el cliente no
baja en N → paga el cliente. Si el rider acepta y no llega → pierde el pedido. Todo
dato medido, ninguna valoración. La adjudicación no busca culpables: **traslada el coste
a quien lo causó** para que el mercado lo corrija solo.

### 2 · RESTRICCIONES (freno → empujón)
- **FRENO**: sin las N no hay regla, solo buena voluntad. → **EMPUJÓN**: `ventana-espera`
  declarable por el jefe y cambiable en caliente (`umbral-mercado`).
- **FRENO**: sin prueba no hay cargo, y sin cargo la regla es decorativa. → **EMPUJÓN**:
  `hecho-verificado` sobre `reparto-medido` + `trazabilidad-fallo` (el cargo lleva su
  evidencia pegada).
- **FRENO**: Bocaos no toca el dinero, así que **no puede cobrar el cargo por su cuenta**.
  → **EMPUJÓN**: `cargo-fallo` deja el asiento y la efectividad se resuelve por pago
  directo o compensación contra la cuota de gestión — **mecanismo sin declarar (el hueco
  más grande del esquema)**.
- **FRENO**: alguien siempre discute. → **EMPUJÓN**: `disputa-fallo` a la sala con el
  acta delante; el humano **aplica**, no re-juzga de cero.
- **FRENO**: si el rider no llega, el pedido queda secuestrado y el cliente paga la
  espera de un tercero. → **EMPUJÓN**: `liberacion-por-abandono` inmediata + la
  consecuencia sobre el rider declarada (hoy: "pierde el pedido", sin cuantificar).

### 3 · CONTRATO
- La parte que causó el fallo **paga** a la parte que lo sufrió (no a Bocaos).
- Bocaos **da**: la medida, el asiento y la trazabilidad. **Recibe**: nada por el fallo
  (no es juez ni aseguradora; si cobra por gestionarlo, hay que declararlo).
- El rider **recibe**: que su espera se le pague. **Da**: su reloj y su prueba.

### 4 · NO-OBJETIVOS
- NO juzga intención ni valora calidad ("la comida estaba fría" no es un fallo de reloj).
- NO compensa con dinero propio ni hace de aseguradora.
- NO arbitra una discusión de palabra: sin hecho medido no hay cargo.
- NO sanciona al rider por no llegar más allá de lo declarado (pierde el pedido).

### 5 · PREGUNTAS ABIERTAS
- **Las N**: minutos de espera en tienda, en el portal y para llegar tras aceptar (F0 q2
  da el principio; falta el número).
- **Mecanismo**: ¿pago directo entre partes, compensación contra la cuota semanal, fianza?
  ¿quién ejecuta el cargo? (F0 q2).
- ¿Qué pasa si el fallo es **de Bocaos** (la plaza caída, la oferta que no se emitió)?
  No declarado — y es la pregunta que más caro sale si se ignora.
- ¿Quién decide una disputa: el trabajador de la sala o el dueño? ¿hay segunda instancia?
- ¿Un fallo repetido de la misma tienda tiene consecuencia en el mercado (salir de la
  plaza, perder prioridad)? No declarado.

## Hojas que salen (→ pasada 3)
`ventana-espera` · `hecho-verificado` · `regla-pago-fallo` · `cargo-fallo` ·
`disputa-fallo` · `trazabilidad-fallo`
