---
tipo: componente
sector: electromecanica-ondas
tags: [simulacion, FEMM, LTspice, OpenEMS, FEA, FEM, circuitos, electromagnética]
---
# Simulación — FEMM, LTspice, OpenEMS

## Por qué simular antes de construir

El coste de un error en un motor de 2 kW o un filtro de RF mal diseñado es mucho mayor
que el tiempo de montar el modelo. Estas herramientas cubren tres capas distintas:

| Capa | Herramienta | Qué resuelve |
|---|---|---|
| Circuito concentrado | LTspice | Filtros, fuentes, amplificadores, transitorios |
| Campo magnético 2D | FEMM | Imanes, motores, transformadores, inductancias |
| Electromagnética 3D | OpenEMS | Antenas, microtiras, cavidades, SWR real |
| Fluido + campo (avanzado) | COMSOL / Ansys Maxwell | Industria — licencias de pago |
| Aeroacústica / RF | OpenFOAM + OpenEMS acoplado | Investigación open-source |

---

## LTspice — el simulador de circuitos maker

```
Gratis: ltspice.analog.com (Analog Devices)
OS: Windows nativo, Mac + Wine/CrossOver en Linux

QUÉ SIMULA:
  Transitorios (`.tran`) → respuesta al escalón, ondulación de salida, carga/descarga de batería
  AC (.ac) → diagramas de Bode, respuesta en frecuencia de filtros LC/RLC
  DC (.op) → punto de trabajo, corrientes en reposo
  Param sweep → barrer valores de componentes y ver la familia de curvas

MODELOS INCLUIDOS:
  Miles de MOSFETs, BJTs, diodos (Schottky incluidos), OpAmps, reguladores LDO
  Transformadores ideales e imperfectos (inductancia de dispersión, resistencia de cobre)
  Fuentes de tensión/corriente: sinusoidal, PWL (pieza lineal para formas arbitrarias), PULSE

COMPONENTES ELECTROMECÁNICOS:
  Inductores con núcleo: B-H no lineal mediante `.flux` o tabla de permeabilidad
  Motor BLDC simplificado: fuente BEMF + resistencia + inductancia de bobina
  Filtro EMI de entrada: LISN (Line Impedance Stabilization Network) para medir CE
```

### Flujo de trabajo LTspice — filtro LC paso-bajo para PMG

```
Objetivo: filtrar el rizado del puente trifásico (≈ 5.7%) antes de entrar a las baterías

1. Nuevo esquemático: L=470 µH + C=4700 µF entre el rectificador y la batería
2. Fuente: V1 = PULSE(0, 55, 0, 1u, 1u, 5.7ms, 16.67ms) → simula rizado 5.7% a 300 Hz (6 pulsos/50Hz)
3. Análisis .ac 1 10 10000 → ver Bode del filtro (f_corte = 1/(2π√LC) = 160 Hz → atenúa 300 Hz)
4. Análisis .tran 0.1 0.5 → ver la tensión suavizada en la batería
5. Ajustar C hasta V_rizado < 1% → balance coste/tamaño

Resultado esperado:
  f_corte = 1/(2π√(470e-6 × 4700e-6)) = 107 Hz
  A 300 Hz: atenuación = 20 log(f_corte/f) × 2 = -9 dB → rizado <1.8%
  Añadir R_serie = 0.05Ω (ESR del condensador) → ver el efecto real
```

### Simulación de bobina Tesla en LTspice

```
MODELO EQUIVALENTE DE LA TC:
  Primario:  L1=30µH, C1=30nF, R1=0.1Ω (resistencia de cobre del primario)
  Chispa:    Vt=10kV pulsada, Z=1Ω (gap cerrado durante la descarga)
  Acoplamiento: K=0.15 (coeficiente de acoplamiento primario-secundario)
  Secundario: L2=30mH, C2=12pF (capacidad del toroide), R2=50Ω (pérdidas)

DIRECTIVA: .tran 0 2ms 0 10ns

MEDIR:
  V(secundario) → amplificación = Q × √(L2/L1) × V_cap_primario
  I(L1) → corriente de pico en el primario (sobredimensionar la chispa)
  Resonancia: f = 1/(2π√(L2×C2)) → el tick de resonancia en la forma de onda
```

---

## FEMM — Finite Element Method Magnetics

```
Gratis: femm.info
OS: Windows nativo, Linux con Wine
Versión: 4.2 (estable, mantenida activamente)

QUÉ SIMULA:
  Magnetostática 2D → distribución de B, H, densidad de flujo, fuerza en imanes
  Electrostática 2D → distribución de campo E, capacidades
  Transferencia de calor 2D → disipación en bobinados, temperatura de los imanes
  Corriente alterna (eddy currents) → corrientes de Foucault en núcleos, skin effect

LIMITACIÓN: solo 2D axisimétrico o plano → las geometrías complejas 3D requieren Maxwell/Opera
SOLUCIÓN MAKER: la mayoría de geometrías de motores y transformadores son axisimétricas → FEMM sufice
```

### Flujo de trabajo FEMM — PMG axial con 12 imanes

```
1. GEOMETRÍA:
   Modo: Planar (sección transversal del PMG, plano medio entre los dos rotores)
   Dibujar: imanes NdFeB rectangulares 40×20mm, alternando N-S
   Dibujar: bobinas de cobre 30 espiras AWG 18 (sección rectangular equivalente)
   Dibujar: región de aire (entrehierro 10mm) y la carcasa externa

2. MATERIALES:
   Imanes: NdFeB N42 → B_r=1.29T, µ_r=1.05, H_c=~1020 kA/m (tabla en FEMM)
   Cobre: conductividad σ=58 MS/m
   Aire: µ_r=1

3. CONDICIONES DE CONTORNO:
   Exterior de la región: A=0 (Dirichlet) → campo cero en el borde

4. MALLADO: auto, refinado en el entrehierro (campo cambia rápido)

5. RESULTADOS:
   Post-proc: B en el entrehierro → comparar con diseño Piggott (objetivo: 0.5T)
   Integración de línea: flujo Φ por bobina → comprobar V_oc = N × dΦ/dt
   Fuerza en los imanes: cuantificar la atracción/repulsión rotor-estátor

Parámetro de salida clave:
  B_medio_entrehierro × A_polo = Φ_max → entrar en la fórmula de Piggott: V_oc = 4.44 × f × N × Φ_max
```

### FEMM para cálculo de inductancia de bobina Tesla

```
Modelo axisimétrico del secundario (tubo PVC + espiras):
  Geometría: cilindro de 75mm radio, 450mm altura, 1000 espiras (modeladas como bloque)
  Material: cobre (σ=58 MS/m) + aire
  Excitación: corriente unitaria I=1A en el bloque de bobina

Resultado: L = 2×E_magnética / I² → integrar la energía del campo
  Típico secundario DIY (Ø150mm, 450 espiras AWG 28): L ≈ 30-60 mH → verificar con fórmula Wheeler

Inductancia mutua M:
  Simular también el primario (10 espiras tubo cobre) → M = L_total(I1+I2) - L1 - L2 / 2
  k = M / √(L1×L2)  → el objetivo de diseño es 0.1-0.2
```

---

## OpenEMS — simulador de EM 3D open-source

```
Gratis, open-source: openEMS.de
Licencia: LGPL
OS: Linux (paquetes APT/RPM), Windows (binarios precompilados), Mac (homebrew)
Motor: FDTD (Finite Difference Time Domain) — resuelve las ecuaciones de Maxwell en el tiempo
Interfaz: Octave/MATLAB (scripting) o Python (pyOpenEMS)

QUÉ SIMULA:
  Antenas (ganancia, patrón de radiación, SWR, impedancia de entrada)
  Microtiras y líneas de transmisión (S11, S21, pérdida de retorno)
  Cavidades resonantes
  Blindaje EMC (campo dentro/fuera de cajas metálicas)

VENTAJA: resultados validados vs mediciones reales en literatura científica
CURVA DE APRENDIZAJE: alta — requiere conocimiento de FDTD y manejo de scripts
```

### Flujo de trabajo OpenEMS — dipolo λ/2 a 144 MHz

```
% Script Octave (openEMS)
close all; clear; clc;

f0 = 144e6;          % frecuencia central [Hz]
c0 = 3e8;
lambda = c0/f0;      % 2.08 m

% Geometría del dipolo
L_brazo = lambda/2 * 0.95 / 2;   % factor de velocidad 0.95, cada brazo
dia_cobre = 2e-3;                 % diámetro del conductor 2 mm

% Definir el espacio de simulación (caja FDTD)
% Celda: lambda/20 = 10.4 mm (mínimo para capturar la geometría)
% Absorbing boundary: PML (capa absorbente en los bordes)

% El script completo:
%  1. Crear la estructura FDTD
%  2. Añadir el dipolo (línea de cobre)
%  3. Definir el puerto de excitación (fuente de corriente en el punto de alimentación)
%  4. Correr la simulación → extraer S11 en el tiempo
%  5. FFT → S11 en frecuencia → SWR = (1+|S11|)/(1-|S11|)
%  6. Near-to-far field transform → patrón de radiación en 3D

% Resultado esperado para dipolo λ/2 a 144 MHz:
%   SWR mínimo en 144 MHz ≈ 1.05 (casi perfecto)
%   Impedancia ≈ 73 + j×0 Ω (resistencia de radiación pura)
%   Ganancia = 2.15 dBi (el dónut toroidal clásico)
```

### AppCSXCAD — visualizador de geometría para OpenEMS

```
Incluido con OpenEMS. Permite ver la geometría FDTD antes de correr la simulación
→ detectar errores de mallado o solapamientos de materiales.

Flujo:
  1. Correr el script parcialmente hasta la definición de la geometría
  2. Llamar a AppCSXCAD(CSX) en Octave → ventana 3D
  3. Verificar que el dipolo y los puertos están bien posicionados
  4. Ajustar la malla si la celda es demasiado gruesa en zonas de interés
  5. Correr la simulación completa
```

---

## Salome + Code_Aster — FEA estructural (para diseño de rotores)

```
Gratis, open-source. Suite mantenida por EDF (Francia).
Uso en electromecánica: no electromagnético, sino MECÁNICO

Aplicación práctica PMG DIY:
  Rotor de PMG axial con imanes pegados → ¿aguanta la fuerza centrífuga a 500 RPM?
  Simular el disco de fibra de vidrio como material ortótropo
  Condición de contorno: velocidad angular ω=52.4 rad/s (500 RPM)
  Resultado: tensión de Von Mises → comparar con resistencia del material
  Margen de seguridad ≥ 3 para aplicación doméstica

Salome: modelado de geometría y mallado
Code_Aster: solver FEA (estático, dinámico, fatiga)
```

---

## KiCad — PCB y esquemáticos (no simulación, pero complementario)

```
Gratis, open-source: kicad.org
Versión 8 (2024): el gran salto en usabilidad

Para electromecánica:
  Diseñar la PCB del driver TMC2209 o del puente H del BLDC
  Footprints de conectores para bobinas (XT60, Anderson PP45, XLR)
  Simulación SPICE integrada (modo básico via ngspice) → verificar el driver antes de fabricar
  Reglas de diseño DRC → separación entre trazas de potencia y señal

Servicio de fabricación: JLCPCB, PCBWay (entrega en 1 semana, desde 2€ por 5 PCBs)
```

---

## Tabla resumen — cuándo usar cada herramienta

| Problema | Herramienta | Tiempo setup | Curva aprendizaje |
|---|---|---|---|
| Diseñar filtro LC/RLC | LTspice | 10 min | Baja |
| Simular fuente conmutada | LTspice | 30 min | Baja |
| Calcular inductancia bobina Tesla | FEMM | 20 min | Media |
| Verificar B en entrehierro PMG | FEMM | 45 min | Media |
| SWR real de antena Yagi | OpenEMS | 2-4 h | Alta |
| Patrón de radiación 3D | OpenEMS | 2-4 h | Alta |
| Resistencia mecánica rotor | Salome+Code_Aster | 3 h | Alta |
| Diseño PCB driver motor | KiCad | 1-2 h | Media |

---

## Recursos de aprendizaje

```
LTspice:
  Linear Technology (Analog Devices) — tutoriales oficiales en ltspice.analog.com
  Libro: "Demystifying Switching Power Supplies" — Matthew Lau (LTspice intensivo)
  YouTube: "Afrotechmods" — tutoriales prácticos de circuitos con simulación

FEMM:
  Manual oficial: femm.info/wiki/HomePage
  Ejemplos incluidos: en la carpeta de instalación (motores, transformadores, imanes)
  Foro: edaboard.com/forum/femm (comunidad activa)

OpenEMS:
  Documentación: openEMS.de/index.php/Main_Page
  Tutoriales en YouTube: "openems tutorial" — antenas dipolo, parche, Yagi
  Repositorio de ejemplos: github.com/thliebig/openEMS

Simulación complementaria (antenas):
  4NEC2: nec2.org — simulador NEC2 con interfaz gráfica (Windows, gratuito)
    NEC2 es el estándar histórico de la NASA para antenas de hilo
    Muy usado en radioafición para diseñar Yagis y verticales optimizadas
  MMANA-GAL: mmana-gal.org — NEC2 con interfaz amigable, múltiples idiomas
```
