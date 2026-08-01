---
tipo: referencia
sector: carpinteria-cnc
tags: [freecad, cad, parametrico, carpinteria, muebles, cut-list]
---
# FreeCAD para carpintería

FreeCAD (32k stars) es el CAD paramétrico open-source de referencia. Para carpintería, sus workbenches especializados permiten diseñar muebles con cut-list automática.

## Workbenches de carpintería

### Woodworking (dprojects)

El más completo para muebles:

- **magicGlue**: posiciona piezas con restricciones (flush, offset, centered)
- **Cut-list automática**: exporta lista de corte con dimensiones de cada pieza
- **BOM (Bill of Materials)**: listado de materiales con cantidades
- **Joinery**: ejemplos de ensambles (mortaja-espiga, cola de milano, galleta)
- **Panel Cutter**: optimiza el corte de piezas en tableros estándar

### Sheet Metal (shaise, 318 stars)

Para trabajo en chapa, pero útil en carpintería cuando se trabaja con tablero:

- Pliegues y desarrollos planos
- Exportación DXF para CNC/láser
- Corner reliefs automáticos

### Path Workbench (integrado)

El CAM nativo de FreeCAD:

- Genera trayectorias de fresado (G-code) desde el modelo 3D
- Operaciones: perfil, vaciado, taladrado, grabado
- Post-procesadores para Grbl, LinuxCNC, Mach3
- Simulación 3D de la operación de fresado

## Flujo de trabajo

```
1. Part Design → modelar cada pieza (tablero, listón, panel)
2. Assembly → ensamblar piezas con restricciones
3. Woodworking → generar cut-list y BOM
4. Path → generar G-code para CNC
5. Exportar → DXF (láser) o G-code (CNC)
```

## Alternativas

| Software | Tipo | Ventaja |
|---|---|---|
| **OpenSCAD** | Programático | Diseños paramétricos por código, ideal para cajas y jigs |
| **Fusion 360** | Freemium | CAM integrado más pulido que FreeCAD Path |
| **SketchUp** | Freemium | Fácil de aprender, plugin CutList |
| **SolveSpace** | Open-source | Ultraligero, 2D/3D paramétrico |

→ Piezas optimizadas en tablero: [[Nesting — SVGnest y Deepnest]]
→ Controladores CNC: [[Controladores — Grbl, LinuxCNC, FluidNC]]
