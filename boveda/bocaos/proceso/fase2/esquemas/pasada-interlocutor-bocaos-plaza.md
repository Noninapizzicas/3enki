# PASADA · INTERLOCUTOR `Bocaos` — desde la silla de LA PLAZA

> **No es un interlocutor nuevo.** El mapa de la FASE 0 está cerrado con cuatro actores (cliente,
> restaurante, repartidor, Bocaos). La F0 §7 declara que Bocaos tiene **dos sillas** —la plaza y el
> nacional— y esta pasada pasa al mismo actor por las dos, una por ficha. Eso no amplía el mapa:
> lo mira con la lente que el propio dueño puso en la §7.

## Los 5 huecos, desde la silla del que opera una plaza

### 1 · IDENTIDAD — ¿qué es el negocio para él?

**Un mercado con su propio balance, en una ciudad, con sus propias reglas.** Para el operador de
la plaza, Bocaos no es una marca: es **su** mercado. Él responde de que haya riders suficientes el
sábado, de que las tiendas cumplan, de que la caja cuadre. Y no puede echar la culpa hacia arriba,
porque arriba no hay nadie que opere.

Lo que ve cuando mira el negocio:

```
mi mercado     mis tiendas, mis riders, mis umbrales, mi cobertura, mi semana
mi salud        propuestas por aceptación, esperas, fallos, devengado
mi límite       no tengo riders contratados, no capturo clientes, no ordeno el mercado
mi arriba       un registro que me da marca y software, y al que no le debo los pedidos
```

### 2 · RESTRICCIONES (freno → empujón)

- **FRENO: no tiene riders propios.** No puede garantizar capacidad. Protege que el rider sea
  autónomo (y con él, la legalidad).
  → **EMPUJÓN**: `politica-densidad` (mide riders por zona frente a pedidos por zona) + `salud-mercado`.
  Su trabajo no es tener riders: es **medir si los hay** y decírselo al mercado.
- **FRENO: no puede captar al cliente.** No tiene app ni cuenta ni marca frente a él.
  → **EMPUJÓN**: `plaza-publica` + `filtro-por-cobertura`. Su crecimiento es **más tiendas que
  reparten bien**, no más usuarios registrados.
- **FRENO: no puede heredar el histórico de otra plaza** (r.2), ni los umbrales, ni los riders.
  Protege que cada plaza sea un mercado real.
  → **EMPUJÓN**: `hueco-de-medida` explícito + la política de arranque (Q51). Lo que no puede hacer
  es fingir que mide cuando no ha medido.
- **FRENO: no puede tocar el dinero del ticket ni del reparto.**
  → **EMPUJÓN**: `guarda-no-retencion` + `cobro-gestion` (cobra **su** cuota, nada más).
- **FRENO: si el nacional desaparece, tiene que seguir repartiendo.**
  → **EMPUJÓN**: cero dependencia. Es un requisito, no una aspiración: la plaza no pide
  configuración, ni catálogo, ni permiso para operar.

### 3 · CONTRATO

```
da       su mercado, su operación, su censo, su devengo cerrado, su plaza.viva
recibe   marca, software, soporte, registro — y el derecho a operar sin pedir permiso
NO recibe  pedidos de otra plaza · riders de otra plaza · umbrales de otra plaza · clientes
```

### 4 · NO-OBJETIVOS

No quiere que el nacional le ordene el mercado · no quiere depender del nacional para cobrar · no
quiere que le lleguen pedidos de fuera de su cobertura (**no los puede servir, y un pedido que no
se puede servir es una reseña de una estrella**) · no quiere que el nacional hable con sus tiendas
por encima de él · no quiere que su config sea "la de por defecto".

### 5 · PREGUNTAS ABIERTAS

Q3 · Q43 · Q47 · Q50 (¿es el dueño, un socio o un franquiciado?) · Q51 · Q52 · Q55.
Y una propia de esta silla: **¿el operador de la plaza puede ser distinto del dueño del software?**
Si sí, la federación tiene tres partes (dueño de la marca, operador de la plaza, dueño del
software) y el esquema de hoy las funde en dos.

## Piezas que solo se ven desde esta silla

`politica-densidad` · `salud-mercado` · `tablero-fricciones` · `simulador-de-umbrales` ·
`simulador-tramos` · `acta-decisiones` · `estado-de-plaza` *(la vive el nacional, la sufre la
plaza)* · y el **derecho a no depender**: no es una pieza, es una condición que se verifica
apagando el nacional un día (auditoría 4 de `pasada-2-corte-de-piezas.md` §5).
