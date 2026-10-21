---
tipo: componente
sector: aerodinamica
tags: [biomimetica, riblets, tuberculos, serrations, bio-inspired, tiburon, buho, ballena]
---
# Biomimética aerodinámica — tiburones, búhos, ballenas, aves

## El principio: la naturaleza como base de datos de soluciones aeronáuticas

Millones de años de selección natural han optimizado estructuras para moverse en fluidos con
eficiencia extrema. La bioinspired aerodynamics extrae esos principios y los traslada a ingeniería.

```
ANIMAL      → ESTRUCTURA → PRINCIPIO FÍSICO        → APLICACIÓN INGENIERIL
──────────────────────────────────────────────────────────────────────────
Tiburón     → denticles   → riblets / drag reduction → fuselajes, palas
Búho        → plumas pec. → trailing-edge serrations → turbinas, UAV silenciosos
Ballena     → aleta pecto → leading-edge tubercles   → palas eólicas, hidro
Vencejo     → ala morph.  → variable sweep + camber  → UAV morphing
Libélula    → alas venosas → multi-wing interference → micro-UAV
Trucha      → cuerpo      → vortex synchronization   → generación hidro pasiva
Delfín      → piel        → compliant wall            → reducción drag sub
```

## Denticles del tiburón — riblets naturales

```
Los denticles cutáneos del tiburón son escamas microscópicas (50-500 µm)
con forma de V alineadas con el flujo → equivalente natural de los riblets industriales.

Mecanismo: las crestas interactúan con los vórtices de pared (near-wall streaks)
  en flujo turbulento → reducen la transferencia de momentum hacia la pared → menos fricción.

Reducción de drag medida en laboratorio:
  - Riblets sintéticos: 3-8% (superficies limpias)
  - Estudio UC Berkeley/MIT Lincoln Lab (2024, Extreme Mechanics Letters):
      · Riblets rectangulares en agua: -5% drag + -14% ruido en sonar remolcado
      · Riblets finos: hasta -25% drag adicional en condiciones específicas

Aplicaciones actuales:
  - Airbus: film con riblets en fuselaje A320/A330 → -1% consumo
  - Boeing: investigación en recubrimientos fotograbados (colaboración con 3M)
  - Natación competitiva: Speedo Fastskin (trajes), retirado de competición olímpica por exceso de ventaja
  - Palas de turbinas eólicas: riblets en borde de fuga → -2-3% arrastre turbulento

Investigación de vanguardia (2024):
  - Springer Nature: "Aerodynamics Investigation on Bio-Inspired Surface Design using
    Shark-Skin Surface on Aircraft Wing" — estudio CFD con denticles escalados a Re de ala
  - Resultado: reducción de CD del 4.3% en zona de flujo turbulento del extradós
```

## Plumas del búho — trailing-edge serrations para reducción de ruido

```
El búho vuela en silencio casi total gracias a tres adaptaciones:
  1. Serrations en el borde de fuga (plumas primarias) — las más estudiadas
  2. Vellosidades en el extradós — amortiguación de turbulencia superficial
  3. Borde de ataque pectinado — ruptura de vórtices de entrada

Mecanismo de las serrations:
  El borde de fuga recto genera ruido por interacción turbulencia-borde (TBL-TE noise).
  Las serrations fragmentan los vórtices coherentes en escala menor → menor presión acústica.
  Reducción de ruido: -3 a -6 dB (mitad de la potencia sonora percibida)

Penalización aerodinámica: +0.5-2% CD (pequeña pero real)

Aplicaciones:
  - Turbinas eólicas: serrations en borde de fuga de palas → 2-3 dB reducción → importante
    para restricciones acústicas en parques eólicos cercanos a poblaciones
  - UAV silenciosos: DARPA y varios proyectos militares/civiles (2022-2024)
  - Ventiladores industriales y de HVAC
  - Investigación 2024: combinación riblets (extradós) + serrations (borde de fuga)
    → reducción simultánea de drag y ruido
```

## Tubérculos de la ballena jorobada — leading-edge tubercles

```
La aleta pectoral de la ballena jorobada (Megaptera novaeangliae) tiene
protuberancias en el borde de ataque (tubercles) espaciadas regularmente.

Mecanismo físico:
  Los tubercles generan vórtices longitudinales que energizan la capa límite
  en los valles entre protuberancias → retardan la separación → mayor α_máximo antes del stall.

  A diferencia de los VGs (post-stall), los tubérculos actúan en toda la envergadura
  y el stall es progresivo y suave en lugar de abrupto.

Datos medidos (Frank Fish, WhalePower Corp.):
  - Aumento del ángulo de stall: +6° (stall a 28° en lugar de 22°)
  - CL_max: +8% superior al perfil liso
  - CD en régimen pre-stall: sin penalización significativa o incluso -4%
  - La mejora es mayor a Re bajo (10⁴ - 10⁶)

Aplicaciones:
  - Palas de turbinas eólicas (especialmente las lentas o VAWT)
  - Hélices de barco
  - Aletas de surf y snowboard de competición
  - Tomas de aire de ventiladores (WhalePower Tubercle Fan — 20% más eficiente)

Patentes:
  - WhalePower Corp. (Canadá): serie de patentes sobre tubercle geometry en palas
  - Siemens Gamesa: investigación en tubercles para palas offshore de gran diámetro (2023-2024)
```

## Alas del vencejo — morphing y sweep variable

```
El vencejo (Apus apus) es el ave de mayor ratio L/D entre aves pequeñas.
  Durante el vuelo ajusta continuamente:
    - Flecha (sweep): 0° a >90° según velocidad
    - Envergadura: extiende/recoge las alas
    - Camber: los músculos del antebrazo ajustan la curvatura

Inspiración directa para drones morphing:
  Investigación activa (arxiv 2403.08598, 2024): "Adaptive morphing of wing and tail
  for stable, resilient, and energy-efficient flight of avian-informed drones"
  → UAV que imita el comportamiento del vencejo reduce consumo un 15-30% en trayectorias mixtas
```

## Alas de la libélula — multi-wing interference y corrugated airfoil

```
Las libélulas tienen 4 alas independientes con:
  1. Perfiles corrugados (sección transversal ondulada) → no son aerodinámicos en sentido clásico
     pero atrapan micro-vórtices que actúan como cojín deslizante → bajo arrastre a Re bajo (10³-10⁴)
  2. Control de interferencia entre pares de alas (desfase de batimiento) → sustentación extra

Para micro-UAV (insect-scale MAV):
  Los perfiles corrugados superan a los perfiles lisos a Re < 5000
  Investigación en flapping-wing MAV (Harvard RoboBee, Delfly, TU Delft) (2022-2025)
```

## Piel del delfín — compliant wall

```
La piel del delfín tiene una estructura elástica multicapa que responde pasivamente
a las fluctuaciones de presión del flujo turbulento → amortigua las estructuras coherentes
que producen arrastre y ruido.

Efecto: reducción de drag hasta 30% en estudios de laboratorio (Kramer, 1960s)
        → las réplicas posteriores dieron resultados mixtos

Estado actual (2024): materiales compliantes con metamateriales y elastómeros celulares
están reviviendo el concepto para sub-acuáticos y tubería de alta velocidad.
```

## Tabla resumen — impacto cuantificado

| Fuente biológica | Estructura | Reducción drag | Reducción ruido | Aumento CL_max |
|---|---|---|---|---|
| Tiburón | Riblets/denticles | 3-8% | — | — |
| Búho | Trailing-edge serrations | 0.5-2% ↑ | 3-6 dB | — |
| Ballena jorobada | Leading-edge tubercles | 0-4% | — | +8% |
| Vencejo | Morphing sweep/camber | 15-30% (sistema completo) | — | variable |
| Libélula | Corrugated profile | — | — | +20% a Re < 5000 |

## PMC / Open Access — artículo de síntesis 2025

*"Bioinspired Morphing in Aerodynamics and Hydrodynamics: Engineering Innovations for Aerospace
and Renewable Energy"* — PMC / NCBI (julio 2025). Revisión completa de riblets, tubercles,
morphing y compliant surfaces con datos de ensayos de túnel de viento y CFD.
URL: pmc.ncbi.nlm.nih.gov/articles/PMC12292994/
