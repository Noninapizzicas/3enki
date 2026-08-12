---
tipo: componente
sector: aerodinamica
tags: [velas, wingsail, flettner, propulsion-eolica, barcos, magnus]
---
# Velas y propulsión eólica — velamen blando, ala rígida, rotor Flettner

## Principio de propulsión a vela

Una vela no empuja al barco: **lo succiona**. A ángulos cerrados (ceñida), la vela actúa como un
ala generando sustentación casi perpendicular al viento. La componente hacia adelante de esa fuerza
es el empuje neto.

```
       VIENTO REAL (TWA = True Wind Angle)
           ↓
     velocidad barco →    + viento real ↓  = VIENTO APARENTE (AWA)
                                               (más cerrado y más fuerte al avanzar)

En ceñida (TWA ≈ 45°):
  La vela trabaja como un ala → CL alto, CD bajo → empuje hacia proa
  La quilla contrarresta la fuerza lateral (deriva)

En popa (TWA ≈ 150-180°):
  La vela actúa como placa → CD alto, CL bajo → empuje puro
  Aquí los rotores Flettner son menos eficientes
```

## Tipos de superficies de propulsión eólica

### 1. Velamen blando (soft sail)

```
Tela plana que toma forma de ala bajo la tensión del viento.
  Perfiles: t/c ≈ 5-15% (variable con la escota)
  CL_max ≈ 1.5-2.0  (con camber óptimo)
  Ventaja: plegable, ligero, bajo coste
  Desventaja: requiere tripulación, no automatizable fácilmente, desgaste UV

Aplicaciones: veleros deportivos, competición (velas de carbono preformadas en
  clases como IMOCA 60, Ocean Race, Volvo Ocean Race)
```

### 2. Ala rígida (rigid wingsail / hard sail)

```
Perfil aerodinámico rígido — funciona como un ala de avión vertical.
  Sección: perfiles tipo NACA 0015-0020 o supercríticos adaptados
  CL_max ≈ 2.0-3.5  (con flap auxiliar)
  Ratio L/D ≈ 20-40 (muy superior al velamen blando)

Configuraciones:
  - Monoelemental: perfil único, más simple, menor CL_max
  - Multielemento: perfil principal + flap → aumenta CL_max ~26% (estudio ScienceDirect 2025)
  - Triple ala en tándem: propulsión de barcos auxiliados por viento (investigación 2025)
```

**Empresas activas (2024-2025):**

| Empresa | Tecnología | Estado |
|---|---|---|
| **AYRO (Francia)** | Oceanwings — ala plegable automatizable, 36 m² | Instalada en varios cargueros |
| **Bound4blue (España)** | eSAIL® — vela rígida vertical autoajustable | Acuerdo Maersk Tankers 2024 |
| **BAR Technologies (UK)** | WindWings — ala rígida para bulk carriers | Testada con Cargill en Pyxis Ocean |
| **Norsepower (Finlandia)** | Rotor Flettner (ver abajo) | Líderes en instalaciones |
| **Computed Wing Sail** | Ala computada dinámica | Concepto avanzado |

**Investigación reciente (2025):**
- *"Aerodynamics and parameter investigation of a triple-wing sail"* — Ocean Engineering (ScienceDirect 2025)
- *"Investigation of aerodynamic performance and operational optimization of wing sails at varying spacings"* — múltiples velas en tándem reducen rendimiento individual; espaciado óptimo ≈ 3-4 × cuerda
- Configuraciones de doble perfil aumentan coeficiente de empuje ~26% y eficiencia propulsiva ~20%

### 3. Rotor Flettner (efecto Magnus)

```
Un cilindro giratorio en una corriente de aire genera sustentación
por el efecto Magnus: la rotación arrastra el fluido → desimetría de presiones.

F_Magnus = ρ · v_∞ · Γ · L    (Γ = 2πR²ω = circulación)

Parámetros:
  Spin ratio = v_punta / v_viento = ωR / v∞
  CL_max ≈ 9-10  a spin ratio ≈ 4-5 (¡muy superior a un ala convencional!)
  CD_Magnus ≈ 2-3  (también alto — pero la relación L/D útil sigue siendo positiva)

Dimensiones típicas:
  Altura: 15-30 m
  Diámetro: 3-5 m
  Potencia motor giro: 50-150 kW (vs. centenares de kW del motor principal que ahorra)
```

**Ventajas del rotor Flettner sobre wingsail:**
- Sin superficies de control complejas
- Funciona en todos los ángulos de viento (incluida popa)
- Bajo mantenimiento
- Fácil retrofit en barcos existentes

**Estado del mercado (2025):**
- ~75% de las instalaciones WAPS (Wind-Assisted Propulsion Systems) son retrofit
- Rotores Flettner dominan en tankers y bulk carriers (54% de cuota de mercado)
- Ahorro típico: 5-30% combustible según ruta y condiciones de viento
- IMO CII (Carbon Intensity Indicator) es el driver regulatorio principal

**Paisaje de patentes (Patsnap 2024):**
- Pico de filing en 2022: 31 patentes/año
- 2024: 8 filing declaradas (+ pendientes por lag de 18-24 meses de publicación)
- Foco emergente: fabricación de cilindros en composite y sistemas de control automático

### 4. Kite (cometa de tracción)

```
Superficie alar en altura (100-300 m) donde el viento es más fuerte y constante.
  Sistema: kite + líneas de tracción + winch controlado automáticamente
  CL_max kite dinámico: 0.5-1.5 (área efectiva grande compensa)
  Empresa líder: Airseas (filial Airbus) — sistema Seawing, testado 2024

Ventaja: aprovecha capas altas sin mástil rígido
Desventaja: complejidad operativa, riesgo en maniobra portuaria
```

## Comparativa global de sistemas WAPS

| Sistema | CL_max | Automatización | Coste instalación | Ahorro combustible |
|---|---|---|---|---|
| Velamen blando | 2.0 | Baja | Bajo | 5-15% |
| Ala rígida | 3.5 | Alta | Alto | 10-25% |
| Rotor Flettner | 9.0* | Alta | Medio | 5-20% |
| Kite | variable | Media | Medio | 5-15% |

*CL alto pero CD también alto — la eficiencia real depende del ángulo de viento

## Conexión con eólica terrestre

Los mismos principios (perfil alar, CL/CD, Re, BEM) se aplican en:
- Palas de turbinas eólicas → [[Perfiles aerodinámicos — NACA, supercríticos, modernos]]
- Diseño BEM (Blade Element Momentum) → sector eolica-hogar
- Efecto Magnus → turbinas tipo Savonius modificadas
