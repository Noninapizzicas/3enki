---
tipo: componente
sector: electromecanica-ondas
tags: [generador, PMG, dinamo, alternador, rectificacion, eolica, flujo-axial]
---
# Generadores y dínamos — PMG axial, alternadores, rectificación

## Tipos de generador — árbol de decisión

```
¿Qué velocidad de entrada tienes?
  Alta (>1000 RPM) → Alternador de automóvil reciclado o generador síncrono
  Baja (<400 RPM)  → PMG de flujo axial (directo, sin multiplicadora)

¿Qué tensión de salida necesitas?
  AC variable para inversor → PMG trifásico + rectificador + inversor
  DC para baterías          → PMG trifásico + rectificador de onda completa

¿Cuánta potencia?
  < 500 W  → PMG axial DIY (Hugh Piggott, Ferrofluid, etc.)
  500W-5kW → PMG axial grande o alternador reciclado
  > 5kW    → Generador síncrono de imanes permanentes (PMSM) industrial
```

## Dinamo vs Alternador vs PMG

```
DINAMO (generador DC clásico):
  Rotor con bobinas + conmutador + escobillas → DC directa en los terminales
  Problema: conmutador se desgasta, límite de potencia y velocidad
  Uso hoy: casi ninguno — sustituido por el alternador + rectificador

ALTERNADOR (AC → rectificado a DC):
  Rotor con bobina de campo (excitación) + estátor con bobinas trifásicas
  La excitación se regula → control de tensión independiente de la velocidad
  Rectificador de 6 diodos integrado → DC en los terminales de carga
  Ventaja: no tiene limitación de potencia por conmutador
  Limitación: requiere corriente de excitación (pérdida del ~5% de la potencia)
  Uso: coches (Bosch, Valeo), tractores, grupos electrógenos de media potencia

PMG (Permanent Magnet Generator):
  Imanes permanentes en el rotor → sin escobillas, sin pérdida de excitación
  Tensión proporcional a la velocidad: V_oc = K_e × ω
  Máxima eficiencia (sin pérdidas de excitación)
  Limitación: no se puede regular la tensión sin convertidor externo
  Uso: eólica, microturbinas hidráulicas, cicloconvertidores de recuperación
```

## PMG de flujo axial — el diseño DIY por excelencia

```
TOPOLOGÍA:
  Dos rotores circulares con imanes pegados (cara a cara, polos opuestos)
  Estátor de bobinas encapsuladas en resina entre los dos rotores
  El flujo magnético viaja axialmente (paralelo al eje) → cruza el bobinado

  Ventajas sobre flujo radial:
    ✓ Sin nucleo de hierro en el estátor → sin pérdidas por histéresis ni corrientes de Foucault
    ✓ Construcción DIY accesible (moldes de madera + resina + imanes + cobre)
    ✓ Diámetro grande → par alto a baja velocidad (ideal para turbinas lentas)
    ✓ Cogging mínimo (el estátor de aire no tiene dientes)
```

### Fórmulas de diseño (método Hugh Piggott)

```
TENSIÓN EN VACÍO (por fase):
  V_oc_fase = 4.44 × f × N × Φ_max

  f = frecuencia eléctrica = (n_RPM × P_polos) / 120   [Hz]
  N = espiras por bobina × bobinas en serie por fase
  Φ_max = B_max × A_polo
  A_polo = área del imán que atraviesa el bobinado

  B_max en el entrehierro: 0.4-0.7 T (según grosor imán, gap y tipo NdFeB)

TENSIÓN DE SALIDA A CARGA (estrella, rectificado):
  V_DC = 1.35 × V_línea_AC    (puente de 3 fases, onda completa)
  V_línea = √3 × V_fase

  Para cargar baterías de 48V: V_DC_min ≈ 55V → V_línea ≈ 41V → V_fase ≈ 24V

PAR RESISTENTE (par que frena la turbina cuando genera):
  T = P_eléctrica / ω = (V × I) / (2π × n/60)

CORRIENTE DE CORTOCIRCUITO (importante para el dimensionado de la turbina):
  I_cc = V_oc / R_fase   (R_fase = resistencia del bobinado de una fase)
```

### Número de polos y bobinas — combinaciones típicas

| Rotores | Imanes/rotor | Polos (P) | Bobinas estátor | Fases | Uso |
|---|---|---|---|---|---|
| 2 | 8 (×2=16) | 16 | 12 | 3 | Piggott 500W-1kW |
| 2 | 12 (×2=24) | 24 | 18 | 3 | Piggott 1-3 kW |
| 2 | 16 (×2=32) | 32 | 24 | 3 | Piggott 3-5 kW |

Regla: N_bobinas / N_polos = 3/4 (o 9/12, 12/16...) para distribución trifásica equilibrada.

## Rectificación — de AC trifásico a DC

### Puente de diodos trifásico (6 diodos)

```
        D1        D3        D5
  A ───┤►├──┬──────────────────→ + (DC)
  B ───┤►├──┘
  C ───┤►├──┐
            │
  A ───┤◄├──┤
  B ───┤◄├──┤
  C ───┤◄├──┘──────────────── → - (DC)
        D4        D6        D2

V_DC = 1.35 × V_línea_RMS
Rizado: 5.7% (6 pulsos por ciclo) → aceptable para carga de baterías

Diodos necesarios:
  I_D_media = I_DC / 3
  V_inversa = √2 × V_línea_pico ≈ 1.41 × 1.35 × V_DC = 1.9 × V_DC
  Margen ×2: V_R_diodo ≥ 3.8 × V_DC

Para PMG 48V: V_R_diodo ≥ 3.8 × 55 = 209V → usar diodos 400V (muy comunes)
```

### Diodos Schottky vs diodos de silicio convencional

```
Silicio convencional (1N5408, BY251, etc.):
  V_forward ≈ 0.7-1.0 V → pérdida × 2 diodos en serie = 1.4-2.0 V
  A 20 A de corriente: P_pérdida = 2 × 20 = 40 W → calor considerable

Schottky (MBR2045, SB1040, etc.):
  V_forward ≈ 0.2-0.4 V → pérdida ≈ 0.4-0.8 V
  A 20 A: P_pérdida = 0.6 × 20 = 12 W → 3× menos calor
  Limitación: tensión inversa máxima ≈ 200V (suficiente para 48V DC)
  Recomendado para PMG DIY en baja tensión
```

## Alternador de automóvil reciclado

```
Potencia: 60-150 A a 14V = 840W-2100W (según modelo)
Velocidad de corte: 1200-1500 RPM (con multiplicadora si la turbina es lenta)
Excitación: 3-5 A a 12V (bobina de campo) → regulada por el regulador externo

Modificaciones para eólica:
  1. Quitar el regulador interno (o puente al máximo)
  2. Rebobinar el estátor con más espiras para bajar la velocidad de corte (opcional)
  3. Añadir regulador de carga externo (shunt o serie) para proteger las baterías

Ventajas: barato (mercado de segunda mano, €20-80), robusto, rodamientos fuertes
Desventajas: excitación consume energía, eficiencia 50-70% (vs 85-92% de PMG NdFeB)

Recurso: proyecto "Chispas" (España) — guía completa de reciclaje de alternadores
```

## Carga de baterías — el regulador de carga

```
El PMG/alternador produce tensión proporcional a la velocidad → sin regulación,
a vientos fuertes la tensión puede superar la de la batería y dañarla.

Opciones de regulación:

SHUNT (desviación):
  Cuando V_batería > V_umbral → el exceso de corriente se desvía a una resistencia de carga
  (calentador de agua, resistencia de disipación)
  Simple, robusto, pero desperdicia energía

CARGA DE VOLCADO (dump load):
  Versión del shunt con carga específica (resistencia de agua caliente)
  El aerogenerador nunca se queda en vacío → protege de sobrevelocidad

MPPT (Maximum Power Point Tracking):
  Busca el punto de máxima potencia del generador ajustando la impedancia de carga
  → extrae hasta 15-30% más de energía que el shunt en condiciones variables
  Más caro y complejo → justificado en instalaciones > 500W
```
