---
tipo: componente
sector: aerodinamica
tags: [perfiles, naca, supercritico, airfoil, geometria]
---
# Perfiles aerodinámicos — NACA, supercríticos, modernos

## Geometría de un perfil

```
           extradós (upper surface)
          ____________________________
cuerda  /          camber line        \   ← punto de máxima curvatura (camber)
 (c)  /________________________________\
          intradós (lower surface)

Parámetros:
  c   = longitud de cuerda
  t   = espesor máximo (% c)
  max_camber = curvatura máxima (% c)
  x_camber   = posición de max_camber (% c desde borde de ataque)
  LE radius  = radio del borde de ataque (influye en comportamiento a alto α)
  TE angle   = ángulo del borde de fuga (influye en separación)
```

## Nomenclatura NACA

### NACA 4 dígitos (ej: NACA 2412)
```
2  4  1  2
│  │  └─ espesor máximo = 12% c
│  └──── posición de máx. camber = 40% c
└─────── máx. camber = 2% c

NACA 0012 → simétrico (camber=0), espesor 12% — perfiles de cola, palas de helicóptero
NACA 2412 → camber moderado — ala Cessna 172
NACA 4412 → camber alto — mini eólica, UAV lentos
NACA 4418 → camber alto + espesor — raíz de ala
```

### NACA 5 dígitos (ej: NACA 23012)
```
2  3  0  1  2
│  │  │  │  └─ espesor = 12% c
│  │  └──┴──── posición de máx. camber, con geometría de línea de camber reflexa
│  └────────── 3/2 de la posición de CL_design
└──────────────CL_design = 2/3 × 0.3 = 0.2 × 10 = ... (ver tablas)

Usados en aviation clásica: Piper, algunos Beechcraft.
Mayor CL_max que 4-dígitos a mismo espesor.
```

### NACA 6 series (ej: NACA 63-215)
```
6  3  -  2  1  5
│  │     │  │  └─ espesor = 15% c
│  │     │  └──── CL_design = 0.2
│  └─────┴─────── posición de mínimo arrastre a α=0 = 30% c
└─────────────── serie 6

Optimizados para un CL de diseño → región de bajo arrastre muy estrecha (laminar bucket).
Usados en aviones de alto rendimiento (P-51 Mustang, Learjet): sensibles a rugosidad.
```

## Familias modernas y de aplicación específica

### Perfiles supercríticos (Whitcomb, NASA)
```
Forma característica:
  - extradós casi plano (retrasa la formación del choque normal → menor onda de arrastre)
  - curvatura concentrada en la parte trasera del intradós
  - borde de fuga con ligero remanso ("Whitcomb rear loading")

Beneficio: operación eficiente a Ma 0.75–0.85 frente a Ma 0.65 de NACA clásico
Usados en: A320, B737, B777, A350 — toda la aviación comercial moderna
```

### Perfiles NREL (S-series) — bajo Re para eólica
| Perfil | Re óptimo | Posición en pala | CL_max | Notas |
|---|---|---|---|---|
| S822 | 400k-1M | Raíz | 1.2 | Estructural, más grueso |
| S823 | 200k-600k | Punta | 1.0 | Fino, bajo arrastre |
| S833 | 400k | Media pala | 1.1 | Equilibrio CL/CD |
| SG6043 | 100k-500k | General SWT | 1.3 | Alto CL a Re bajo |

### Perfiles Selig (SG, SA, SD) — UAV y miniatura
```
Base de datos UIUC: ~1600 perfiles en formato .dat
  → m-selig.ae.illinois.edu/ads/coord_database.html

SD7037  → planeadores RC, Re 100k-500k, excelente CL/CD
E387    → planeador de precisión, benchmark de bajo Re
AG35    → planeadores de alto rendimiento (clase F3J)
MH32    → UAV, equilibrio en Re amplio
```

### Perfiles de vela (thin sections) — Re muy bajo y ángulos altos
```
Espesores t/c = 1-5%  (velas de tela, quillas de velero)
Re típico: 10⁴ - 3×10⁵
Operan a α = 10-25° con separación/reapego continuo
La burbuja de separación laminar (laminar separation bubble) es su modo de operación normal
```

## Herramientas de análisis

| Herramienta | Tipo | Uso | Acceso |
|---|---|---|---|
| **XFOIL** | Panel method + BL | Análisis 2D de perfil (Cl, Cd, Cm vs α) | Gratis, MIT, CLI |
| **XFLR5** | GUI sobre XFoil + VLM | Perfil + ala 3D, polar, estabilidad | Gratis, Windows/Linux/Mac |
| **QBlade** | BEM + RANS + LLT | Turbinas eólicas + análisis completo | Gratis, qblade.org |
| **OpenVSP** | VSP + análisis básico | Modelado aerodinámico rápido | NASA, open-source |
| **MSES** | Viscous/inviscid | Multielelemento (perfil + flap) | MIT, académico |

## Comparativa de rendimiento a distintos Re

```
Re = 100.000  (mini drones, palas eólicas pequeñas):
  Mejor: SG6043, SD7037, E387
  Evitar: NACA 6-series (sensibles a rugosidad), NACA 23012

Re = 500.000 (planeadores, UAV medios, turbinas pequeñas):
  Mejor: NACA 4412, AG35, S822/S823
  Bueno: NACA 2412, SG6043

Re = 5.000.000 (aviones ligeros, palas grandes):
  Mejor: NACA 63-215, LS(1)-0417 (NASA General Aviation)
  Bueno: NACA 2412 (robusto, bien documentado)

Re > 10.000.000 (aviación comercial):
  Supercríticos específicos por diseño (propietarios Boeing/Airbus)
```

## Tendencia: perfiles adaptados por IA (2023-2025)

Investigación activa en optimización de perfiles mediante:
- **Algoritmos genéticos + CFD RANS** — parámetros Bézier/CST como genes, CFD como función de fitness
- **Deep Learning surrogates** — redes neuronales que reemplazan CFD para exploración rápida
- **Physics-Informed Neural Networks (PINNs)** — satisfacen Navier-Stokes durante el entrenamiento

Referencia: *"Aerodynamic shape optimization using machine learning"* — literatura activa en
AIAA Journal, Journal of Aircraft y Aerospace Science and Technology (2023-2025).
