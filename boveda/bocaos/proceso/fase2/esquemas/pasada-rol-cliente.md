# PASADA · ROL `cliente` — dos caras en el mismo nombre

> **Heredada de la pasada 2** (`fase2-v2/esquemas/pasada-rol-cliente.md`) y revalidada contra la F0 §7.
> Rol `cliente`. Sin cambios.
> Se reproduce aquí para que `esquemas/` quede completo; los deltas de la tercera pasada
> están en `pasada-2-corte-de-piezas.md` y en `esquema.md` §1.

> El rol "cliente" en este negocio es **dos roles distintos** que la F0 separa a propósito:
> la **tienda**, que es clienta de Bocaos y paga; y el **cliente final**, que no es cliente de
> Bocaos y no paga nada a Bocaos. Esquematizarlos juntos es el error clásico de un marketplace.

## 1 · IDENTIDAD — ¿qué es el negocio para cada cara?
- **Para la tienda**: un proveedor que le da escaparate, pedidos y riders, y al que le paga una
  cuota. Relación comercial, con factura.
- **Para el cliente final**: **nada**. Una web. Ni siquiera un nombre.

## 2 · RESTRICCIONES (freno → empujón)
- **FRENO (tienda)**: no puede cuadrar lo que paga con lo que recibe.
  → **EMPUJÓN**: `estado-cuenta-parte` (Q01) — devengado, cobrado, pendiente y cargos, con
  evidencia. Sin esto, la cuota es un recibo y no un contrato.
- **FRENO (cliente final)**: no tiene dónde reclamar.
  → **EMPUJÓN**: `reclamacion-por-la-tienda` (K01).
- **FRENO (cliente final)**: puede estar pagando lo mismo y esperando más por un enlace que no
  pidió.
  → **EMPUJÓN**: ninguna pieza todavía — es **Q15** y **K03 [ABIERTA]**. El esquema lo deja
  escrito como deuda, no como resuelto.

## 3 · CONTRATO — qué espera VER/ACTUAR
- **Tienda**: ver su cuenta con evidencia y su cocina medida; actuar pagando, subiendo su
  incentivo y marcando listo.
- **Cliente final**: ver su pedido y su hora; actuar pagando y confirmando la entrega.

**La lógica que exige construir**: el **estado de cuenta por parte** (una sola proyección que
junte devengos, cobros y cargos por fallo). Es la pieza que convierte "te cobramos la
coordinación" en algo verificable.

## 4 · NO-OBJETIVOS — lo que NO es de su alcance
- La tienda no administra el mercado ni ve a otras tiendas.
- El cliente final no tiene cuenta, ni historial propio en Bocaos, ni atención de Bocaos.

## 5 · PREGUNTAS ABIERTAS
Q39 (¿invitado? ¿ve el desglose?) · Q15 (¿paga menos si comparte viaje?) · Q20 (¿lo sabe?) ·
Q19 (¿ve el incentivo de la tienda?) · Q27 (¿la tienda acepta el pedido?)

## Piezas que SOLO emergen desde este rol
`estado-cuenta-parte` (REFLEJO)

## El hallazgo de esta pasada
El **cliente final no genera piezas: genera renuncias**. Su prisma no produce módulos, produce
prohibiciones (`guarda-marca-ajena`, `guarda-propiedad-cliente`, y la de no tener app). Eso
confirma que la renuncia del par 6 de la F0 no es una decisión de marketing: es **estructural**.
El día que se construya una pieza para él, el modelo ha cambiado.
