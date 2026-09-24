# PASADA · ROL: `cliente` (función interna: lo que se recibe y se cobra)

> El ROL cliente es la función interna del RECIBIR: la cara por la que el sistema
> sirve al pagador del nicho y ejecuta la compra. Aunque el pagador sea externo y
> cambiante (lo decide el nicho), el SISTEMA necesita una cara interna de cliente
> consistente: un perfil de cobro/entrega y el contrato de valor por nicho. En un
> taller personal no aplica que el dueño sea cliente, pero aquí el rol cliente es
> la pieza que materializa el lado de demanda del negocio.

---

## Prisma de los 5 huecos DESDE la silla del rol cliente + LÓGICA que exige

### 1 · IDENTIDAD — ¿qué es el negocio para el rol cliente?
La **oferta** que paga la solución: algo concreto (empresa o persona según el
nicho) por un precio claro, servido por el canal del nicho. Para el sistema este
rol es el que cierra el flujo: sin su cara de cobro/entrega no hay caja.

### 2 · RESTRICCIONES — ¿qué le limita al ROL cliente?
- **FRENO**: pagador distinto por nicho → el contrato de valor cambia.
  → **EMPUJON**: perfil de cobro/entrega por nicho (declarado en el constructor),
  el puerto es uno, el contenido varía.
- **FRENO**: cobrar/entregar torpe = abandono. → **EMPUJON**: canal-distribucion y
  motor-cobro ágiles, plataformas del nicho.
- **FRENO**: el valor debe demostrarse antes de comprometer pago. → **EMPUJON**:
  disposición a pagar YA medida en validación → el sistema solo opera donde el
  pagador mostró intención real.

### 3 · CONTRATO — qué espera VER y ACTUAR el rol cliente
- VER: el producto/servicio final, su precio claro, su canal de entrega.
- ACTUAR: pagar (ejecutar el cobro), recibir la solución, y confirmar el valor
  (que el proyecto no engañe → realimenta la salud por nicho).

### LÓGICA DE DOMINIO que el rol cliente exige construir
- `perfil-cobro-entrega-por-nicho` (contrato de pago/entrega por pagador del nicho).
- `propuesta-valor-canal` (cómo gana la confianza/compra en ese territorio).
- `confirmacion-valor-recibido` (feedback del pagador → ajusta el flujo del nicho).

### 4 · NO-OBJETIVOS del rol cliente
NO administra ni decide portafolio (jefe); NO opera la cadena (trabajador).
Solo recibe y paga por el valor — y con su pago alimenta la medida maestra.

### 5 · PREGUNTAS ABIERTAS del rol cliente
- ¿Cómo se recoge "valor recibido / satisfacción" del pagador por nicho, si es que
  se recoge (¿se usa o es solo cobro)? (no declarado — pregunta al dueño si el
  cliente tiene voz post-compra).
- ¿Qué nivel de self-service de entrega espera cada tipo de pagador?

## PIEZAS que emergen SOLO desde el rol cliente → al árbol
- `perfil-cobro-entrega-por-nicho` (refuerza la pieza del interlocutor cliente).
- `propuesta-valor-canal` (refuerza).
- `confirmacion-valor-recibido`.
