---
tipo: referencia
sector: metalurgia-diy
tags: [chapa, sheet-metal, pliegue, desarrollo-plano, freecad, dxf]
---
# Chapa — diseño y desarrollo plano

Diseño de piezas de chapa metálica: modelar en 3D, desplegar (unfold) a 2D, exportar DXF para corte láser/plasma y plegar en plegadora.

## FreeCAD SheetMetal Workbench (318 stars)

El workbench de referencia open-source para chapa:

- **Crear base**: extrusión inicial de chapa (espesor uniforme)
- **Añadir pliegues**: bend up/down con radio y ángulo configurables
- **Corner relief**: alivios en esquinas para evitar desgarro al plegar
- **Unfold**: desarrollar la pieza 3D a su forma plana (el patrón de corte)
- **Exportar DXF**: el desarrollo plano listo para corte láser/plasma/CNC

## Conceptos clave

### Factor K y tolerancia de pliegue

Al plegar chapa, la fibra neutra no está en el centro del espesor sino desplazada hacia el interior del pliegue. El **factor K** (0.3–0.5 típico) define esa posición.

```
Longitud desarrollo = longitud_plana_1 + longitud_plana_2 + tolerancia_pliegue
Tolerancia_pliegue = (π/180) × ángulo × (radio + K × espesor)
```

Sin factor K correcto, las piezas quedan largas o cortas tras plegar.

### Radio mínimo de pliegue

| Material | Radio mínimo |
|---|---|
| Acero al carbono | 1× espesor |
| Acero inoxidable | 1× espesor |
| Aluminio (5052) | 1× espesor |
| Aluminio (6061-T6) | 2× espesor |
| Cobre | 0.5× espesor |
| Latón | 1× espesor |

Plegar por debajo del radio mínimo → grietas en el exterior del pliegue.

## OpenSCAD para chapa

El módulo **bend** (MRQ/bend) permite simular pliegues de chapa en OpenSCAD:

- Definir pieza plana con cortes
- Aplicar pliegues paramétricos
- Visualizar el resultado 3D
- Exportar STL para verificación

## Flujo de trabajo

```
1. FreeCAD SheetMetal → modelar pieza 3D con pliegues
2. Unfold → obtener desarrollo plano
3. Exportar DXF
4. Nesting (SVGnest/Deepnest) → optimizar en chapa
5. Corte (láser/plasma/CNC) → la pieza plana
6. Plegar en plegadora (manual o CNC)
```

→ Corte plasma: [[Plasma CNC — máquinas open-source]]
→ Nesting: [[Nesting para metal]]
