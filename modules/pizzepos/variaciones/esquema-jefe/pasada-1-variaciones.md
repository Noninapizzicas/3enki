# Pasada 1 — Prisma sobre «variaciones»

Sujeto crudo: **la modificación de un producto en el momento de elegirlo** (quitar/añadir componentes, con reglas y precio).

---

## Hueco 1 · IDENTIDAD

**Qué es**: el conjunto de REGLAS que dice qué se puede modificar de un producto, más el ACTO de aplicar esas reglas a una elección concreta.

**Qué vende**: personalización segura — el cliente consigue lo que quiere sin romper el negocio (precio, disponibilidad, límites).

**Cómo lo elabora**: un producto declara (o se le derivan) OPCIONES; cada opción tiene un MODO que define cómo se elige; un MOTOR valida la selección y pone el precio; el resultado viaja con el item elegido.

Sub-productos que salen del prisma:
1. **Reglas** — qué es posible quitar/añadir, límites, precios extra.
2. **Motor** — valida + precia una selección contra las reglas.
3. **Captura** — el momento UI donde alguien elige (la variación nace aquí).
4. **Resultado** — la variación validada que acompaña al item (y su rechazo).

## Hueco 2 · RESTRICCIONES

- **El dato de reglas vive FUERA** (fuente única en la carta): este sujeto solo LEE reglas, no las escribe. → `[ABIERTO]` quién las edita es otra pieza (ver pasada 2).
- **Dinero entero**: nada de decimales flotando; el precio es un entero de unidad mínima.
- **La verdad del precio es del lado del que tasa**: la UI puede estimar, pero solo la evaluación del motor es verdad.
- **Sin reglas no hay variación**: producto sin opciones configuradas = producto sin modificación posible (no error, ausencia).
- **Estado en memoria con re-arranque**: las reglas cargadas se re-obtienen al (re)activar el entorno; la fuente persistente nunca es este sujeto.

## Hueco 3 · CONTRATO

- **Entra**: identificador de producto + selección (qué quitar, qué añadir, en qué cantidad).
- **Sale**: dictamen (válida/rechazada + motivo) + precio desglosado (base + extras) + composición final.
- **Señales de vida**: variación validada / variación rechazada — alguien más arriba las observa.
- **Puertos abiertos** (agnosticismo):
  - `fuente_de_reglas` — quién provee las opciones [ABIERTO: la cablea el sitio]
  - `precios` — consulta de precio/disponibilidad de cada valor [ABIERTO]
  - `captura` — el control UI por modo [ABIERTO]
  - `destino_del_resultado` — a qué viaja la variación validada [ABIERTO]

## Hueco 4 · NO-OBJETIVOS

- No EDITA la fuente de reglas (solo la lee y la deriva).
- No tasa el pedido completo (solo el delta de la variación).
- No decide precios: los consulta.
- No conoce cocinas, tickets ni canales: emite su dictamen y punto.

## Hueco 5 · PREGUNTAS_ABIERTAS

- ¿Quién ES el que edita las reglas y con qué cara UI? → se abre en pasada 2 (ROL JEFE).
- ¿La captura por modo es una sola pieza o emerge del modo? → pasada 2.

**Productos para la ronda 2**: Reglas · Motor · Captura · Resultado — los cuatro pasan al prisma otra vez.