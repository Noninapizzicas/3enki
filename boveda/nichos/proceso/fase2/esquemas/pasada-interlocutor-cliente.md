# PASADA · INTERLOCUTOR: `cliente` (el pagador del nicho)

> Actor externo-relacional del mapa cerrado en F0. No es uno fijo: **"el cliente
> final lo decide el nicho elegido"**. Empresas (solución para un sector) o
> personas (suscripción). El sujeto del cobro: sin él no hay salud financiera.

---

## Prisma de los 5 huecos DESDE la silla del cliente

### 1 · IDENTIDAD — ¿qué es el negocio PARA el cliente?
Un **proveedor/servicio útil** para su problema del nicho. Para el cliente el
sistema no es "nichos autónomos": es la solución concreta que le resuelve algo por
un precio. No ve buscador ni validación: ve el producto/servicio final y el canal
por el que se le entrega.

### 2 · RESTRICCIONES — ¿qué le limita AL CLIENTE en esta relación?
- **FRENO**: cada nicho tiene su propio pagador → las reglas de cobro/entrega
  cambian por nicho. → **EMPUJON**: perfil de cobro/entrega por nicho declarado en
  el constructor (modelo de negocio) — el puerto es uno, los contratos varían.
- **FRENO**: el cliente no confía en algo que "aparece" sin entender → desconfianza
  de adquisición. → **EMPUJON**: propuesta de valor clara + canal de llegada propio
  del nicho (estudio-competencia también enseña cómo se gana la confianza en ese
  territorio).
- **FRENO**: pagar es fricción (si el cobro es torpe, abandona). → **EMPUJON**:
  cobro ágil del motor-cobro (plataformas del nicho, opciones de pago).
- **FRENO**: el valor debe ser demostrable ANTES de comprometerse. → **EMPUJON**:
  en validación se midió disposición a pagar real → el negocio solo entra donde el
  pagador ya muestra intención (no vender en frío).

### 3 · CONTRATO — qué intercambia con el negocio
- DA: pago real (el ingreso que mide la salud financiera) por el valor recibido.
- RECIBE: la solución al problema del nicho, entregada por su canal, servida y
  cobrada limpio (operador-cobro → canal-distribucion).

### 4 · NO-OBJETIVOS — qué NO quiere el cliente
- NO quiere sorpresas de cobro (cargos ocultos, modelos confusos) → el modelo de
  cobro por nicho debe ser claro.
- NO quiere soluciones genéricas que ignoran su problema real del nicho.
- NO quiere fricción para pagar o recibir.

### 5 · PREGUNTAS ABIERTAS (cero supuestos)
- Quiénes son los clientes exactos NO se sabe hasta que el nicho emerge (por
  diseño, F0 no lo fija) → es un hueco que el nicho llenará.
- ¿Cada nicho exige su propia integración de pago/distribución, o hay un set común
  de plataformas para empezar?
- ¿Cómo se mide "disposición a pagar" de forma fiable en el estudio de mercado?

## PIEZAS que emergen SOLO desde el cliente (se añaden al árbol)
- `perfil-cobro-entrega-por-nicho` (el contrato de cada pagador del nicho → lo alimenta el constructor).
- `propuesta-valor-canal` (cómo se gana la confianza/compra del pagador en ese territorio → alimenta canal-distribucion).
