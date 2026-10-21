---
tipo: componente
sector: aerodinamica
tags: [CFD, simulacion, openfoam, xfoil, xflr5, ansys, SU2, qblade]
---
# CFD y herramientas de simulación

## Árbol de herramientas por caso de uso

```
ANÁLISIS AERODINÁMICO
├── 2D — perfil solo
│   ├── XFOIL          → análisis rápido, gratis, CLI, método panel + BL
│   └── MSES           → multielelemento (perfil + flap), viscoso/invíscido
│
├── 3D — ala o avión completo (métodos potenciales, rápidos)
│   ├── XFLR5          → GUI sobre XFOIL + VLM/LLT, polar de ala 3D, gratis
│   ├── OpenVSP        → modelado + análisis básico, NASA open-source
│   └── AVL (Athena)   → VLM ligero, estabilidad y control, MIT/gratis
│
├── CFD RANS (Reynolds-Averaged Navier-Stokes)
│   ├── OpenFOAM       → solver de referencia, gratis, open-source, CLI
│   ├── SU2            → Stanford, open-source, optimización integrada
│   ├── SimScale       → OpenFOAM en la nube, interfaz web, freemium
│   └── ANSYS Fluent   → industrial, propietario, más robusto y soporte
│
├── CFD de alta fidelidad (LES / DNS) — investigación
│   ├── OpenFOAM LES   → Smagorinsky, WALE, dynamic k-equation SGS
│   ├── Nek5000        → DNS espectral, muy eficiente en HPC
│   └── CharLES (Cadence) → propietario, referencia industrial
│
└── Dominio específico
    ├── QBlade         → perfil + BEM + turbinas eólicas (HAWT/VAWT)
    ├── OpenFAST       → turbina eólica completa (NASA/NREL), aero-servo-elástico
    └── HELIOS         → helicópteros y rotores (US Army / blade-element)
```

## XFOIL — el punto de entrada

```
Tipo: método de paneles + capa límite integral (Drela, MIT 1986)
Licencia: gratis, código Fortran libre
Input: coordenadas del perfil (.dat) + Re + Ma + α (o CL target)
Output: CL, CD, CM, Cp(x/c), posición de transición, punto de separación

Cuándo usarlo:
  → comparar perfiles rápidamente
  → obtener la polar CL vs CD para un Re dado
  → identificar el punto de transición laminar→turbulento
  → validar un perfil antes de ir a CFD

Limitaciones:
  → no modela la capa límite en separación masiva (post-stall)
  → perfiles con curvatura inversa o TE muy obtuso → inestabilidad
  → flujo incompresible (Ma < 0.3 aproximadamente)

Acceso: web.mit.edu/drela/Public/web/xfoil/
```

## XFLR5 — GUI 3D sobre XFOIL

```
Tipo: VLM (Vortex Lattice Method) + LLT (Lifting Line Theory) + análisis de estabilidad
Licencia: gratis, open-source
Plataformas: Windows, Linux, Mac

Flujo típico:
  1. Importar perfiles .dat (desde UIUC o diseño propio)
  2. Definir geometría del ala (planta, diedro, torsión, perfil por sección)
  3. Análisis de polar: CL vs α, CL vs CD, eficiencia vs velocidad
  4. Análisis de estabilidad longitudinal y lateral

Idóneo para:
  → diseño de alas de planeador, UAV, mini-turbina
  → verificar equilibrio y estabilidad antes de construir
  → comparar winglets y variaciones de planta alar
```

## OpenFOAM — el CFD open-source de referencia

```
Tipo: FVM (Finite Volume Method), RANS + LES + DNS
Licencia: GPL (gratuito)
Distribuciones principales:
  - OpenFOAM Foundation (openfoam.org) — rama comunitaria original
  - OpenCFD / ESI (openfoam.com) — rama comercial, features adicionales
  - foam-extend — para investigación avanzada

Flujo típico para un perfil (solver simpleFoam — RANS estacionario):
  1. Generar malla: snappyHexMesh (3D) o blockMesh + Gmsh (2D/extruido)
  2. Condiciones de contorno: velocidad lejana, slip en paredes exteriores, no-slip en perfil
  3. Modelo de turbulencia: k-ω SST (más robusto para aerodinámica con gradiente adverso)
  4. Solver: simpleFoam → iteraciones hasta convergencia (residuos < 10⁻⁵)
  5. Post-proceso: paraFoam (ParaView) → Cp, flujo de líneas, y+, separación

Modelo de turbulencia recomendado para aerodinámica:
  k-ω SST (Menter): combina k-ω en la capa límite (robusto) con k-ε en flujo libre
  → mejor predicción de separación y gradiente adverso que k-ε estándar

Calidad de malla — regla de oro:
  y+ ≈ 1  para resolución directa de la subcapa viscosa (Low-Re wall treatment)
  y+ ≈ 30-300  para wall functions (más rápido, menos preciso en separación)
```

## SU2 — optimización integrada

```
Tipo: FVM + adjoint para optimización de forma
Licencia: LGPL (gratis), Stanford University
Ventaja única: gradiente de la función objetivo (CL, CD) respecto a la geometría
               calculado por el método adjunto → optimización eficiente de perfiles/alas

Flujo de optimización de perfil:
  1. Parameterizar la geometría (Hicks-Henne bumps, NACA 4-digit, Bézier/CST)
  2. CFD primal → CL, CD
  3. CFD adjunto → ∂CD/∂x_i para todos los puntos de control geométrico
  4. Algoritmo de gradiente (SLSQP, L-BFGS) → nueva geometría
  5. Iterar hasta convergencia

Usado activamente en: optimización de alas para A320neo (DLR), palas de turbina (NREL)
```

## SimScale — CFD en la nube (accesible)

```
Plataforma: web browser, sin instalación local
Motor: OpenFOAM + Code_Aster (estructural)
Licencia: freemium — plan Community: 3000 core-h/año gratis

Cuándo usarlo:
  → primer contacto con CFD (interfaz visual amigable)
  → validación rápida sin HPC local
  → proyectos maker / educativos

Limitaciones:
  → depende de conectividad y servidor
  → menos control sobre la malla que OpenFOAM directo
  → los casos grandes requieren plan de pago
```

## QBlade — turbinas eólicas completo

```
Tipo: BEM (Blade Element Momentum) + LLT + RANS de perfil + aero-servo-elástico
Licencia: gratis (QBlade CE), propietario (QBlade EE para industria)
Web: qblade.org

Pipeline completo:
  1. Diseñar/importar perfil → análisis XFOIL integrado (polares)
  2. Definir geometría de pala (distribución de cuerda, torsión, perfil por sección)
  3. Simulación BEM → curva de potencia Cp vs λ (tip speed ratio)
  4. Simulación LLT → efectos 3D, vórtice de punta
  5. Tiempo transitorio → rafagas, cambios de paso
  6. Exportar: curva de potencia, cargas en la raíz, distribución de presiones
```

## OpenFAST — turbina eólica completa (NASA/NREL)

```
Sistema de simulación aero-servo-hidro-elástica:
  - AeroDyn: aerodinámica de la pala (BEM + correcciones)
  - ElastoDyn: dinámica estructural de la torre y pala
  - ServoDyn: control del generador y paso de pala
  - HydroDyn: cargas hidro (offshore)
  - SubDyn: subestructura (monopile, jacket)

Estándar de la industria para certificación de turbinas eólicas (IEC 61400-1)
Gratis, open-source: github.com/OpenFAST
```

## Flujo de trabajo recomendado por proyecto

```
Mini-dron o UAV pequeño (Re 10⁴-10⁵):
  1. Seleccionar perfil: UIUC DB → SD7037 / E387 / MH32
  2. XFOIL: polar CL-α, CL-CD a Re operativo
  3. XFLR5: ala 3D, estabilidad, polar completa
  4. (opcional) OpenFOAM 2D con LES si hay separación dominante

Turbina eólica pequeña (Re 10⁵-10⁶):
  1. Perfiles: SG6043, S822/S823
  2. XFOIL: polares
  3. QBlade: diseño BEM + curva de potencia
  4. OpenFAST: validación dinámica

Ala de avión o vela rígida (Re 10⁶-10⁷):
  1. XFLR5: geometría 3D + estabilidad
  2. OpenFOAM (k-ω SST): validación CFD RANS
  3. SU2: optimización de forma si se busca maximizar L/D

Investigación / alta fidelidad (papers, túnel):
  1. OpenFOAM LES o Nek5000 DNS
  2. Malla con y+ ≈ 1, resolución de vorticidad
  3. Validación contra datos experimentales (XFOIL/túnel)
```
