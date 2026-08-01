---
tipo: referencia
sector: carpinteria-cnc
tags: [ensambles, finger-joint, box-joint, mortaja, cnc, laser]
---
# Ensambles CNC — finger joints y más

Uniones diseñadas para ser cortadas por máquina (CNC router o láser), sin necesidad de habilidad manual en carpintería tradicional.

## Tipos de ensamble CNC

### Finger joint (box joint)

El más común en corte láser y CNC. Dedos rectangulares que se entrelazan.

- **Fuerza**: buena (gran superficie de encolado)
- **Complejidad**: mínima — generadores automáticos disponibles
- **Herramientas**: OpenSCAD boxmaker, MakerCase, FreeCAD
- **Material**: contrachapado, MDF, acrílico, madera maciza

### Tab-and-slot (lengüeta y ranura)

Una pieza tiene pestañas que encajan en ranuras de la otra. Más sencillo que finger joint.

- Ideal para cajas que se ensamblan sin cola (presión)
- Combinable con tornillos ocultos

### Mortaja y espiga CNC

La CNC fresa la mortaja (hueco rectangular) y la espiga se corta en la otra pieza.

- Más fuerte que finger joint
- Requiere fresado 3D (no solo contorno)
- Ideal para marcos y estructuras

### Cola de milano (dovetail)

La reina de los ensambles en madera, adaptada a CNC con fresas de cola de milano.

- Requiere fresa especial (ángulo 7°-14°)
- Más lenta de fresar que finger joint
- Resultado estético superior

### T-slot (ranura en T)

Perfil en T que permite ensamblar paneles perpendiculares con tornillo oculto.

- Popular en muebles de tablero (estanterías, escritorios)
- El tornillo queda invisible desde fuera

## Herramientas de generación

| Herramienta | Tipo | Ensambles |
|---|---|---|
| **MakerCase** | Web | Finger joint boxes |
| **lasercut (bmsleight)** | OpenSCAD | Finger joints auto en 3D→2D |
| **boxes.py** | Python/Web | 50+ tipos de cajas paramétricas |
| **FreeCAD Woodworking** | Plugin | Mortaja, espiga, galleta, ensambles |
| **Fusion 360 Dogbone** | Plugin | Esquinas con dogbone para CNC |

## Dogbone y T-bone

Las esquinas interiores en CNC quedan redondeadas (radio = radio de la fresa). Para que las piezas encajen en ángulo recto:

- **Dogbone**: se añade un agujero circular en cada esquina interior
- **T-bone**: se extiende la esquina en una dirección
- **Fileted corner**: se redondea la pieza macho para que coincida

Regla: el dogbone debe tener diámetro ≥ diámetro de la fresa.

→ Diseño paramétrico: [[FreeCAD para carpintería]]
→ Optimizar piezas en tablero: [[Nesting — SVGnest y Deepnest]]
