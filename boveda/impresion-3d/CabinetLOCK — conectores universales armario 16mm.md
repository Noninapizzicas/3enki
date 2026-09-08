---
tipo: proyecto
sector: impresion-3d
tags: [cabinetlock, conectores, armario, snap-fit, PETG, 16mm, OpenSCAD, ensamblaje]
---
# CabinetLOCK — conectores universales armario 16mm

> Montar un armario de tablero de 16mm sin tornillos, sin cola, sin herramientas: solo piezas impresas en PETG que encajan a presión y sujetan los tableros con snap-fit cantilever + nervios anti-rotación. Diseñado para melamina, contrachapado, MDF y aglomerado.

---

## El sistema — 7 piezas, 1 parámetro rector

```
UN SOLO ARCHIVO OPENSCAD (cabinetlock.scad) genera todas las piezas.
El parámetro que gobierna todo: ESPESOR_TABLERO = 16mm.
Cambiar ese número (a 18 o 19) adapta TODO el set automáticamente.

PIEZAS:
  ESQUINA-L ........... 2 tableros a 90° (la más usada — 4 por esquina de armario)
  ESQUINA-3D .......... 3 tableros perpendiculares (esquinas con suelo/techo)
  T-INTERIOR .......... tablero pasante + balda perpendicular
  SOPORTE-BALDA ....... pin 5mm europeo + labio (baldas ajustables)
  RECTO ............... prolonga 2 tableros en línea
  TAPÓN ............... cierra el canto visible de un tablero
  UNIÓN-VERTICAL ...... conecta suelo/techo con lateral

TORRE DE CALIBRACIÓN .. 8 ranuras (0.05mm a 0.40mm de juego) + tablero de prueba
  → imprimir PRIMERO para validar la tolerancia real de tu máquina
```

---

## Mecanismo de sujeción — snap-fit cantilever en PETG

```
EL PRINCIPIO: un brazo flexible (cantilever) con un gancho al final. Al insertar
  el tablero, el chaflán de entrada (25°) deflecta el brazo suavemente. Cuando
  el tablero pasa el gancho, el brazo vuelve a su posición y el ángulo de
  retención (80°) impide que salga sin herramienta.

NÚMEROS DEL SNAP-FIT:
  Largo del brazo cantilever: 6mm
  Espesor del brazo: 2.4mm
  Deflexión máxima: 1.2mm
  Ángulo de entrada: 25° (inserción suave, ~15N de fuerza)
  Ángulo de retención: 80° (extracción difícil, ~40N de fuerza)
  Ancho del brazo: 8mm
  Ciclos de vida en PETG: >500 inserciones sin fatiga visible

POR QUÉ PETG Y NO PLA: el PLA es rígido y quebradizo — un snap-fit en PLA
  aguanta 10-50 ciclos antes de fisurar. El PETG es tenaz (absorbe energía
  elástica sin romperse) y resiste mejor la fatiga cíclica. El PETG también
  resiste mejor la humedad y temperatura que el PLA (Tg ~80°C vs ~60°C).
```

---

## Tolerancias y ajuste — los números que hacen que funcione

```
ANCHO DEL CANAL: ESPESOR_TABLERO + 2 × TOLERANCIA = 16 + 2 × 0.15 = 16.3mm
  → el tablero entra con juego suave, sin forzar ni bailar

TOLERANCIA POR LADO: 0.15mm (punto medio entre 0.1 y 0.2mm recomendados)
  → Menor de 0.1mm: riesgo real de que no entre
  → Mayor de 0.2mm: la pieza queda floja

NERVIOS ANTI-ROTACIÓN: 0.3mm de interferencia dentro del canal
  → 2 nervios por cara interior × 15mm de largo × 1mm de ancho
  → crean fricción lateral para que el tablero no gire dentro del conector
  → se deforman ligeramente al insertar (la interferencia es elástica en PETG)

SHRINKAGE PETG: 0.3-0.7% — en piezas de ~40mm = ~0.12-0.28mm
  → está dentro del margen de la tolerancia de 0.15mm/lado
  → para piezas >100mm, compensar escalando al 100.5% en el slicer

TORRE DE CALIBRACIÓN: SIEMPRE imprimir antes del set completo
  → 8 ranuras con juegos de 0.05mm en 0.05mm (de 0.05 a 0.40)
  → insertar un trozo de tablero de 16mm en cada ranura
  → la que encaja "justo" (ni fuerza ni holgura) da tu tolerancia real
  → ajustar TOLERANCIA_LADO en el .scad con ese valor
```

---

## Dimensiones de las piezas principales

```
ESQUINA-L:
  Ancho exterior: 22.3mm (16.3 canal + 2 × 3mm pared)
  Largo de cada brazo: 40mm
  Alto: 23mm (20mm canal + 3mm base)
  Peso estimado: ~22g en PETG (30% gyroid)

ESQUINA-3D:
  Cuerpo base: 40 × 22.3 × 23mm (como esquina-L)
  Columna añadida: 22.3 × 22.3 × 43mm (doble canal en Z)
  Peso estimado: ~32g

T-INTERIOR:
  Canal pasante: 22.3 × 40 × 23mm
  Brazo perpendicular: 40mm desde el cuerpo
  Peso estimado: ~18g

SOPORTE-BALDA:
  Base: Ø15mm × 3mm
  Pin: Ø4.9mm × 8mm (estándar europeo 5mm con -0.1mm)
  Labio: Ø15mm × 3mm (media luna)
  Peso estimado: ~2g
```

---

## Orientación de impresión y ajustes

```
ORIENTACIÓN: TODAS las piezas se imprimen planas sobre su cara mayor
  → las capas quedan paralelas al esfuerzo principal (la presión del tablero
    empuja las paredes lateralmente, no entre capas)
  → CERO soportes necesarios (no hay voladizos >45°)
  → la cara contra la cama es la parte interna (no visible)

AJUSTES DE IMPRESIÓN (SPARKX i7, PETG):
  Altura de capa: 0.2mm (equilibrio velocidad/resistencia)
  Perímetros: 3 (= 1.2mm de pared sólida por los 3mm de diseño)
  Relleno: 30-40% gyroid (estructura isótropa, resiste en todas direcciones)
  Temperatura: 240°C boquilla / 80°C cama
  Velocidad: 45 mm/s perímetros / 60 mm/s relleno
  Soportes: NINGUNO
  Adhesión: brim 5mm (retira después con cúter)
  Enfriamiento: 50-70% ventilador (PETG no tolera 100%)

FILLETS: 1.5mm en todas las esquinas internas de esfuerzo
  → reduce concentración de tensión y riesgo de rotura por fatiga
```

---

## Coste por armario típico (60×60×180 cm)

```
  Pieza              Uds.    Tiempo      PETG
  ─────────────────  ────    ─────────   ─────
  ESQUINA-3D           8     7h 20min    176g
  T-INTERIOR           4     2h 40min     60g
  SOPORTE-BALDA        8     1h 04min     16g
  ─────────────────  ────    ─────────   ─────
  TOTAL               20     ~11h        ~252g

  Coste material: ~7€ (bobina PETG 1kg a ~28€)
  Coste herramental: 0€ (no necesita taladro, tornillos ni cola)
  Tiempo de montaje: ~15 min por armario (encajar a presión)
```

---

## Flujo de trabajo

```
1. CALIBRAR — imprimir torre de calibración, anotar tolerancia real
2. AJUSTAR — cambiar TOLERANCIA_LADO en cabinetlock.scad
3. RENDERIZAR — en OpenSCAD: cambiar PIEZA → F6 → exportar STL
4. LAMINAR — en CrealityPrint: cargar STL, aplicar perfil PETG, generar gcode
5. IMPRIMIR — enviar a la SPARKX i7
6. MONTAR — insertar tableros en los conectores a presión (sin herramientas)

CONSEJO: imprimir primero 1× ESQUINA-L + 1× torre de calibración como prueba.
  Si el encaje es correcto, lanzar el lote completo del armario.
```

---

## Notas de diseño

```
→ El archivo OpenSCAD es 100% paramétrico: cambiar ESPESOR_TABLERO adapta
  todas las piezas. Pensado para tableros de 15, 16, 18 o 19mm.
→ Los snap-fits están diseñados para ser desmontables (se puede desarmar y
  remontar el armario, útil para mudanzas). Para fijación permanente, añadir
  una gota de cianoacrilato en el canal antes de insertar.
→ Para armarios con carga pesada (>15kg por balda), duplicar los conectores
  T-INTERIOR (2 por unión en vez de 1) o usar ESQUINA-3D en los extremos
  de la balda.
→ El sistema es compatible con los agujeros de balda estándar europeo (5mm
  cada 32mm) — el SOPORTE-BALDA encaja en esos agujeros si el armario
  los tiene pretaladrados.
→ Ver también: [[Diseño para impresión — tolerancias, ensamblajes, orientación]]
  y [[Proyectos — Gridfinity, enclosures, jigs y piezas funcionales]]
```
