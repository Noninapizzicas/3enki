# Disección — Servilletero The Pirate (formas físicas)

Cada hoja atómica del esquema pasa por el diseccionador y se le fija la FORMA
física. Para muebles las formas son físicas (escuadra, conector, zapata, placa,
pared, pestaña, relieve).

## Hoja 1 — BASE
- **Forma**: placa plana (prisma rectangular) 150×80×5.
- **Ranuras**: 2, una en cada extremo del ancho (X), talladas con `difference()`
  restando un cubo de `(lat_grosor + holgura)` de ancho × `pestana_h` de alto ×
  `base_fondo` de fondo. La ranura abraza el lateral en TODO su ancho.
- **Tope trasero**: reborde de 5 mm de alto en el borde trasero (Y=80), para que
  las servilletas no se salgan por detrás.
- **FORMA**: placa + 2 ranuras + reborde trasero.

## Hoja 2 — LATERAL (izquierdo y derecho, mismo diseño)
- **Forma**: pared 150×150×5 con esquinas redondeadas (r=15) vía
  `minkowski(){ cube([w-2r,h-2r,t],center=true); cylinder(r=r,h=0.001); }`.
- **Pestaña inferior**: `cube([w-2r, pestana_h, t])` que entra en la ranura de la
  base. Tope: la pestaña no atraviesa la base (queda al ras o ligeramente corta).
- **Sello The Pirate en relieve** (cara exterior):
  - Doble anillo circular (2 cilindros concéntricos, el exterior más alto).
  - Calavera estilizada: cráneo (cilindro/esfera aplanada) + cuencas + nariz
    (rebajes, no pasantes) + mandíbula.
  - Dos cucharas de pizza cruzadas a 45° (prismas alargados con cabeza ovalada).
  - Relieve positivo de 2.5 mm sobre el fondo del lateral.
- **Espejo**: el lateral derecho se espeja `mirror([1,0,0])` para que el sello
  mire hacia fuera en ambos lados.

## Recuento de diseños
- 2 diseños distintos (base, lateral) → 3 piezas totales (1 base + 2 laterales).
- El lateral derecho es el izquierdo espejado (mismo `.scad`, selector o mirror).

## Verificación de piezas separadas
- `analyze_model` → `Volumes: N` (3 piezas → 5 volúmenes: 2 laterales + 1 base
  + 2 sellos). Ese `Volumes` prueba que no se fundieron en un solo cuerpo.
- Bbox total (piezas separadas en el plano) confirma cotas: laterales 150×150,
  base 150×80.
