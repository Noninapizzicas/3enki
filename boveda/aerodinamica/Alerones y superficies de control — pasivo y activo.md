---
tipo: componente
sector: aerodinamica
tags: [alerones, flaps, winglets, control-activo, AFC, superficies-de-control]
---
# Alerones y superficies de control — pasivo y activo

## Clasificación de superficies de control

```
SUPERFICIES DE CONTROL
├── PASIVAS (forma fija, accionamiento mecánico)
│   ├── Sustentadoras: flaps, slats, droops
│   ├── De control: alerones, elevadores, timón
│   └── De reducción: spoilers, aerofrenos, speed brakes
├── ACTIVAS (forma variable en vuelo)
│   ├── Winglets adaptativos
│   ├── Alas morfing (ver nota dedicada)
│   └── Control de flujo activo (AFC) — jets de aire, succión
└── PASIVAS-OPTIMIZADAS (forma fija pero optimizada aerodinámicamente)
    ├── Winglets (blended, split scimitar, spiroid, raked)
    └── Riblets, vórtice generators (pasivos)
```

## Alerones

Controlan el **alabeo** (roll). Deflexión opuesta: ala derecha baja → alerón derecho sube, izquierdo baja.

```
ΔCL ≈ CL_α · (dCL/dδ) · δ_aileron

Deflexión típica: ±25°
Posición: ∼60-80% de la envergadura (palanca máxima)
Compromiso: alerones en punta reducen torsión alar en maniobra → "alerón inboard" en aviones de alta velocidad
```

**Tipos:**
- **Frise aileron:** borde delantero sobresale al bajar → genera arrastre que compensa guiñada adversa
- **Diferencial:** mayor recorrido hacia arriba que hacia abajo → reduce guiñada adversa

## Flaps — sustentación en despegue/aterrizaje

| Tipo | ΔCL_max | Complejidad | Uso |
|---|---|---|---|
| Plano (plain) | +0.4 | Muy baja | Aviones ligeros, veleros |
| Hendido (slotted) | +0.7 | Baja | Aviones ligeros, entrenadores |
| Fowler | +0.9 | Media | Aviones regionales, turbohélices |
| Doble Fowler | +1.3 | Alta | Comerciales medianos (A320, B737) |
| Triple hendido | +1.5 | Muy alta | B747, B777 clásico |

**Slats (borde de ataque):** retrasan el stall aumentando α_crítico en +5-8°. En combinación con flaps de Fowler: CL_max ≈ 3.0-3.5 (vs ~1.5 con ala limpia).

## Winglets — reducción de arrastre inducido

El vórtice de punta de ala (tip vortex) es energía cinética rotacional que se pierde. Los winglets
redirigen parte de esa energía hacia adelante (empuje) o simplemente reducen la intensidad del vórtice.

```
Reducción de arrastre inducido: ΔCD_i ≈ -5 a -8%
Ahorro de combustible típico: 3-5% por vuelo
```

### Tipos de winglet (evolución):

| Tipo | Descripción | Ejemplo | Mejora |
|---|---|---|---|
| Winglet clásico (Whitcomb) | Plano inclinado ~75° | Learjet 28 (1977) | +3% |
| Blended winglet | Transición suave, un solo elemento | B737-700/800 | +4% |
| Split Scimitar | Blended + aleta ventral en "S" | B737 NG retrofit | +5-6% |
| Spiroid winglet | Forma de aro cerrado — elimina el vórtice en lugar de redirigirlo | Gulfstream G350 test | +5% con menos flutter |
| Raked wingtip | Sin winglet — punta extendida inclinada | B787, B777X | +2-4% |
| Winglet adaptativo | Ángulo de diedro variable en vuelo | En investigación (2024) | Potencial +2% adicional |

**Patente reciente:** *"Tandem split divergent winglet"* — USPTO #12434818 (publicada 2025):
doble aleta convergente/divergente que mejora rendimiento en múltiples condiciones de vuelo.

## Control de flujo activo (AFC) — la frontera actual

**Concepto:** en lugar de mover superficies sólidas, se inyectan o aspiran chorros de aire para
modificar el flujo alrededor del ala → control sin superficies móviles externas.

### Proyecto X-65 CRANE (DARPA, 2024-2026)

```
Programa CRANE — Control of Revolutionary Aircraft with Novel Effectors
Fabricante: Aurora Flight Sciences (filial Boeing)
Estado: ensamblaje progresivo 2024-2026, primer vuelo previsto 2027

Configuración:
  - Ala en diamante (delta-like)
  - 14 efectores AFC distribuidos por superficies sustentadoras
  - Jets de aire a alta presión en lugar de alerones, timón y elevador
  - Control completo de roll, pitch y yaw sin superficies externas móviles

Beneficios esperados:
  - Reducción de peso (sin actuadores y mecanismos de superficies de control)
  - Menor complejidad mecánica
  - Posibilidad de ala más limpia aerodinámicamente
  - Redundancia: cada efector puede compensar a otro
```

### Tipos de actuadores AFC

| Tipo | Principio | Frecuencia | Aplicación |
|---|---|---|---|
| Steady blowing | Chorro continuo de aire presurizado | DC | Reapego de capa límite |
| Pulsed blowing | Chorro pulsado | 10-1000 Hz | Control de separación |
| Synthetic jet (SJA) | Membrana vibratoria — sin flujo neto | 100-10000 Hz | Turbulencia local |
| Plasma actuator (DBD) | Descarga corona → viento iónico | kHz | Borde de ataque |
| Suction (boundary layer) | Aspiración de capa límite | DC | Control de transición |

**Investigación 2024:** *"Active maneuver load alleviation for a pitching wing via spanwise-distributed camber morphing"* — AIAA Journal 2024. Combinación AFC + morfing reduce cargas de maniobra en un 40%.

## Vortex generators (VG) — pasivos pero eficaces

```
Pequeñas aletas (~5-10 mm de alto) en el extradós, en zigzag.
Inducen turbulencia LOCAL en la capa límite → energizan el flujo
→ retrasan la separación → permiten mayor α de operación.

Posición típica: 10-30% de cuerda
Usados en: palas de turbinas eólicas, aviones que usan perfiles
           laminares sensibles a separación (p. ej. Cessna con NACA 63-series)
```

## Spoilers y aerofrenos

- **Spoilers:** superficie en el extradós que al abrirse destruye sustentación localmente.
  Usado para reducción rápida de CL (aterrizaje, roll diferencial en tierra).
- **Speed brakes / aerofrenos:** aumentan arrastre sin cambiar sustentación.
  Típico en planeadores y jets de combate.
- **Ground spoilers:** se despliegan automáticamente al aterrizaje para maximizar carga sobre el tren
  → mejor frenado.
