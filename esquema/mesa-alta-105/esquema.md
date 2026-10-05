# Esquema — Mesa alta 105

> Árbol maestro embebido (no punteros). Método esquematizador, 3 fases.
> Ley de agnosticismo: cero tecnologías del entorno nombradas; todo lo del entorno sale como puerto abierto.

## Identidad del sujeto

Mesa alta de bar, de pie, 105 cm de altura total. Tablero de madera 400 × 1500 × 30 mm.
4 patas de madera 58 × 58 × 1020 mm, retranqueadas 20 mm del borde en ambos ejes (largo y
ancho). 3 travesaños de madera 40 × 40 mm: 2 laterales (a lo largo) + 1 central (a lo ancho,
por encima de los laterales). Laterales a 250 mm del suelo; el central justo encima de los
laterales.

## Árbol maestro

```
MESA ALTA 105
├─ [IDENTIDAD] tablero 400×1500×30
├─ [IDENTIDAD] 4 patas 58×58×1020 (retranqueadas 20mm en ambos ejes)
├─ [IDENTIDAD] 3 travesaños 40×40 (2 laterales + 1 central encima)
├─ GENERADOR DE UNIONES (convergente — sintetiza las 3 uniones, mismo patrón de abrazo)
│   ├─ ATÓMICO · ESCUADRA tablero→pata (×4)      → FORMA: escuadra en L + refuerzo triangular
│   ├─ ATÓMICO · CONECTOR travesaño→pata lateral (×4) → FORMA: canal 40×40 + orejeta a pata
│   └─ ATÓMICO · CONECTOR travesaño→pata central (×2) → FORMA: misma pieza, rotada 90°
└─ [ABIERTO] puertos del dueño
    ├─ fijar(miembro, puntos)   → tornillo madera 4×40 ✓ (confirmado)
    ├─ materializar(pieza)      → impresión 3D en PETG ✓ (confirmado)
    ├─ medir(cota)              → instrumento [ABIERTO]
    ├─ nivelación del suelo     → se decide al terminar [PENDIENTE]
    ├─ retranqueo exacto        → 20 mm ambos ejes ✓ (confirmado)
    └─ altura travesaño central → apoyado encima de los laterales ✓ (confirmado)
```

## Recuento vivo

- **Pasadas del prisma:** 3 (pasada-1 · pasada-2 · pasada-3) + disección.
- **Hojas atómicas:** 3 (escuadra tablero, conector lateral, conector central).
- **Piezas distintas a materializar:** 2 (escuadra + conector).
- **Piezas totales:** 10 (4 escuadras + 4 conectores lateral + 2 conectores central).
- **Puertos abiertos:** 2 (medir, nivelación pendiente).
- **Reparto de formas:** 1 escuadra + 1 conector (el central es el conector rotado).

## Formas (de la disección)

| Hoja | FORMA | Cometido estructural | × |
|---|---|---|---|
| Unión tablero→pata | **ESCUADRA** en L + refuerzo triangular | soporta carga vertical, rigidiza esquina | 4 |
| Unión travesaño→pata lateral | **CONECTOR** canal 40×40 + orejeta | rigidez eje largo, evita apertura | 4 |
| Unión travesaño→pata central | **CONECTOR** (misma pieza rotada 90°) | rigidez eje corto, evita cierre | 2 |

## Puertos abiertos (agnosticismo — se cablean al aterrizar)

- `fijar(miembro, puntos)` → tornillo madera 4×40 ✓ (confirmado)
- `materializar(pieza)` → impresión 3D en PETG ✓ (confirmado)
- `medir(cota)` → instrumento de precisión [ABIERTO]
- Nivelación del suelo → se decide al terminar [PENDIENTE]
- Retranqueo exacto de patas → 20 mm ambos ejes ✓ (confirmado)
- Altura del travesaño central → apoyado encima de los laterales ✓ (confirmado)

## Nota de método

Las 3 uniones son DIMENSIONES interdependientes (rigidizan el mismo conjunto, comparten vocabulario
de fijación y secciones) → se modelaron como INPUTS de un solo generador convergente, no como ramas
separadas (ley de la skill). El prisma tocó suelo en la pasada-3: las uniones son átomos, el generador
las sintetiza, lo demás son puertos del dueño.
