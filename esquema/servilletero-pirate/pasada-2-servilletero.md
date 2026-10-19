# Pasada 2 — Sub-productos del servilletero (prisma recursivo)

## Sujeto A — EL ENSAMBLAJE (unión laterales ↔ base)

### IDENTIDAD
El método de unión que hace el servilletero desmontable. Debe ser a presión,
sin pegamento ni tornillos, y permitir montar/desmontar repetido.

### RESTRICCIONES
- 2 laterales + 1 base, todos impresos en PETG.
- La base es fina (5 mm) — la unión no debe debilitarla.
- El lateral es una pared de 5 mm con esquinas redondeadas.
- Impresión en SPARKX i7 (cama ~220×220): las piezas caben de pie.

### CONTRATO
- Unir firmemente cada lateral a la base (perpendicular).
- Soportar el peso de las servilletas sin que los laterales se abran.
- Montarse/desmontarse a mano, repetido, sin degradarse.
- No requerir piezas extra (tornillos, pasadores).

### NO-OBJETIVOS
- NO es una bisagra (no gira).
- NO es un encaje permanente (debe desmontarse).
- NO usa pegamento ni tornillería.

### PREGUNTAS_ABIERTAS
- ¿Ranura en la base + pestaña en el lateral? (patrón verificado en la skill)
- ¿La pestaña debe tener un tope para que el lateral no atraviese la base?
- ¿Hace falta un refuerzo en la base bajo la ranura para que no se parta?

### DECISIÓN (cierre de puerto)
Ranura en la base (profundidad = grosor lateral + holgura) + pestaña inferior
en el lateral. La pestaña entra en la ranura. Holgura 0.3 mm = encaje a presión.
La pestaña NO atraviesa la base (tope: la pestaña es más corta que la ranura
en profundidad, o la ranura es pasante y la pestaña queda al ras). Para que el
lateral no se abra con el peso, la ranura abraza el lateral en TODO su ancho
(no solo un punto).

## Sujeto B — EL SELLO (relieve de marca en el lateral)

### IDENTIDAD
La imagen de marca The Pirate (sello circular: calavera + cucharas cruzadas +
doble anillo) materializada en la cara exterior de cada lateral.

### RESTRICCIONES
- Monocolor (PETG negro) — el sello se distingue por RELIEVE, no por color.
- El lateral es una pared de 5 mm — el relieve no debe debilitarla ni crear
  puentes imposibles de imprimir.
- Impresión en PETG: los detalles finos (cuencas de la calavera) deben ser
  imprimibles sin soporte.

### CONTRATO
- El sello es reconocible como The Pirate (calavera + cucharas + doble anillo).
- Sobresale de la cara exterior del lateral (relieve positivo).
- No crea voladizos que necesiten soporte (los huecos de la calavera se
  imprimen como huecos, no como puentes colgantes).

### NO-OBJETIVOS
- NO es un grabado en hueco (es relieve positivo).
- NO es multi-color.
- NO es una calavera cartoon — es el sello estilizado de la marca.

### PREGUNTAS_ABIERTAS
- ¿Relieve de 2.5 mm sobre pared de 5 mm? (queda 2.5 mm de pared — ¿suficiente?)
- ¿Los huecos de la calavera (cuencas, nariz) se imprimen como huecos pasantes
  o como rebajes? (pasantes = más fáciles de imprimir, pero debilitan)

### DECISIÓN (cierre de puerto)
Relieve positivo de 2.5 mm sobre la cara exterior. Los huecos de la calavera
(cuencas, nariz) se modelan como rebajes (no pasantes) para no debilitar la
pared y evitar puentes. El doble anillo y las cucharas se modelan como
prismas/volúmenes que sobresalen del fondo del lateral.

## Sujeto C — LA BASE (estabilidad y tope)

### IDENTIDAD
La pieza horizontal que sostiene las servilletas y da estabilidad al conjunto.

### RESTRICCIONES
- 8 cm × 15 cm (fondo × ancho), grosor 5 mm.
- Recibe las 2 ranuras de ensamblaje (una en cada extremo del ancho).
- Las servilletas se apoyan sobre ella.

### CONTRATO
- Estable en la mesa (no vuelca con el peso de las servilletas).
- Las servilletas quedan de pie, apoyadas en la base y contra los laterales.
- No se salen por detrás (¿tope trasero?).

### NO-OBJETIVOS
- NO es una bandeja (no lleva borde perimetral completo).
- NO es un cajón.

### PREGUNTAS_ABIERTAS
- ¿Tope trasero para que las servilletas no se salgan por detrás?
- ¿El peso de las servilletas (apiladas de pie) es suficiente para la
  estabilidad, o hace falta una base más pesada/amplia?

### DECISIÓN (cierre de puerto)
La base es plana (150×80×5). Las servilletas se apoyan de pie contra los
laterales. Para que no se salgan por detrás, se añade un pequeño reborde
trasero en la base (tope de 5 mm de alto). La estabilidad la dan los dos
laterales (150 de alto) + el peso de las servilletas; la base plana y ancha
(150×80) da el apoyo.
