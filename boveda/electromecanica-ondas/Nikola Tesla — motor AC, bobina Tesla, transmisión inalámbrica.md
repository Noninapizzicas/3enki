---
tipo: componente
sector: electromecanica-ondas
tags: [Tesla, motor-AC, bobina-Tesla, WPT, Wardenclyffe, resonancia, historia]
---
# Nikola Tesla — motor AC, bobina Tesla, transmisión inalámbrica

## El hilo conductor de Tesla: resonancia como principio universal

Tesla no inventó inventos aislados — exploró una idea central: **la resonancia permite
transferir energía sin contacto**. El motor AC, la bobina Tesla y la transmisión inalámbrica
son tres aplicaciones del mismo principio: campos oscilantes acoplados resonantemente.

## Motor de inducción AC (1887-1888)

El invento de mayor impacto económico de Tesla — la base de toda la industria eléctrica moderna.

```
PROBLEMA que resolvía:
  El motor DC de Edison requería conmutador + escobillas → mantenimiento, chispas, límite de potencia.
  ¿Se puede hacer girar un motor sin contacto mecánico?

SOLUCIÓN — campo magnético rotante:
  Si se aplican corrientes sinusoidales desfasadas 90° (bifásico) o 120° (trifásico) a bobinas
  dispuestas angularmente, el campo magnético resultante GIRA en el espacio.
  El rotor de jaula de ardilla (conductor corto-circuitado) persigue ese campo → gira.

  No hay contacto eléctrico con el rotor → no hay escobillas, no hay conmutador.
  El rotor es inducido: las corrientes en él son inducidas por el campo girante (Faraday).

Deslizamiento (slip):
  El rotor nunca llega a la velocidad del campo — debe ir ligeramente más lento
  para que haya variación de flujo y, por tanto, corriente inducida y par.
  s = (n_campo - n_rotor) / n_campo   típico: 2-5% a carga plena

n_sincronismo = 60f/P   (f = frecuencia red, P = número de pares de polos)
```

**La guerra de las corrientes (1890s):** Edison (DC, 110V local) vs Tesla+Westinghouse (AC trifásico, larga distancia). Las Cataratas del Niágara (1895-1896) sellaron la victoria del AC: 10 MW transmitidos a 40 km a alta tensión, transformados (con transformadores de Tesla/Westinghouse) y distribuidos eficientemente.

## Transformador de Tesla / Bobina Tesla (1891)

```
OBJETIVO: generar tensiones muy altas a frecuencias altas sin transformadores de núcleo de hierro.

CIRCUITO BÁSICO:
  Fuente AC (o DC pulsada) → condensador primario C1 → chispa de disparo (spark gap)
  → circuito LC primario (L1, C1) entra en resonancia → acoplamiento magnético con el secundario
  → circuito LC secundario (L2, C2) en resonancia a la MISMA frecuencia → amplificación por Q alto

  Tensión secundaria = Q × (relación de transformación × tensión primaria)
  Con Q=200 y relación 1:10 → ×2000 amplificación total
```

### Anatomía de una bobina Tesla DIY

```
PRIMARIO:
  10-15 espiras de tubo de cobre (6-12 mm Ø) en espiral plana
  L₁ ≈ 20-50 µH
  C₁ = condensadores MMC (Multiple Mini Capacitors) en serie/paralelo: 0.01-0.05 µF
  f₁ = 1/(2π√L₁C₁) ← debe coincidir con f₂

SPARK GAP (ruptor):
  Electrodo fijo + electrodo ajustable de tungsteno o cobre
  SRSG (Synchronous Rotary Spark Gap): sincronizado a 50Hz → descarga dos veces por ciclo
  SG estático: más ruidoso, desgaste mayor, frecuencia no controlada

SECUNDARIO:
  800-1500 espiras de hilo esmaltado 28-32 AWG sobre tubo PVC Ø 10-15 cm
  L₂ ≈ 20-80 mH
  C₂ = capacidad toroide terminal (el donut de aluminio en la punta)
  Toroide: D_mayor × D_menor → C ≈ ε₀ × 2π²R²/ln(8R/r)  (Nagaoka, aproximado)

CONDICIÓN DE RESONANCIA:
  f₁ = f₂ = 1/(2π√L₁C₁) = 1/(2π√L₂C₂)
  Ajuste: añadir vueltas al primario (baja f₁) o cambiar C₁

FREQUENCIAS TÍPICAS:
  SGTC (Spark Gap TC) DIY: 100-400 kHz
  SSTC (Solid State TC, con IGBT): 50-400 kHz
  DRSSTC (Double Resonant SSTC): el más eficiente de los modernos
```

### Variantes modernas

```
SSTC (Solid State Tesla Coil):
  Sin chispa → IGBT o MOSFET conmutan al doble de la frecuencia de resonancia del secundario
  Más eficiente, más silenciosa, controlable por PWM → música (singing coils)
  Interruptor típico: IGBT IXYS IXGN60N60C2D1 o similar (60A, 600V)

DRSSTC (Double Resonant SSTC):
  Primario Y secundario en resonancia a la misma frecuencia
  Puente completo de IGBT → el estado del arte DIY (2020-2025)
  Eficiencia: 80-90% (vs 40-60% de la SGTC)
  Chispas: 1-3 m con 3-5 kW de entrada en diseños cuidados

OLTC (Oudin-Lecher Tesla Coil):
  Variante compacta de alta frecuencia (1-3 MHz), arcos azul-violeta estéticos
```

## Wardenclyffe Tower — el sueño del WPT global (1901-1917)

```
CONCEPTO: una torre de 57 m con capacitor toroide en la cima + bobina secundaria
gigante enterrada → transmitir electricidad a escala planetaria resonando con la
cavidad Tierra-ionosfera (hoy conocida como resonancia de Schumann, f₀ ≈ 7.83 Hz).

Tesla intuía la resonancia de Schumann décadas antes de que fuera medida (1952).
La frecuencia de la cavidad Tierra-ionosfera: f_n = c/(2πR_tierra) × √(n(n+1)) / √ε_rel

f₁ ≈ 7.83 Hz, f₂ ≈ 14.3 Hz, f₃ ≈ 20.8 Hz, ...

REALIDAD:
  La financiación de J.P. Morgan se cortó en 1903 cuando Marconi transmitió señales de radio
  sin necesidad de la infraestructura de Tesla. La torre fue demolida en 1917.
  El concepto de WPT global con acoplamiento a la tierra sigue siendo teóricamente interesante
  pero impráctico por la disipación en la conductividad de la corteza terrestre.
```

## Transmisión inalámbrica de energía (WPT) — el estado del arte 2025

Lo que Tesla intuía es hoy una tecnología madura en el rango corto y activa investigación en el rango medio.

### WPT por inducción (Qi, corto rango)

```
Base: acoplamiento inductivo (transformador de aire con gap)
Frecuencia: 100-200 kHz (Qi estándar), 6.78 MHz (AirFuel)
Rango: < 1 cm (Qi) hasta 4-5 cm (AirFuel resonante)
Eficiencia: 80-92% (Qi 2.0/3.0)
Potencia: hasta 100W (Qi 2.0), rumores de 300W en 2025

Estándar Qi (Wireless Power Consortium):
  El dominante — iPhones, Samsung, auriculares, relojes
  Frecuencia de la portadora + modulación ASK para comunicación bidireccional
```

### WPT resonante magnético (rango medio)

```
Base: dos bobinas LC acopladas en resonancia — el principio de Tesla
Rango: 0.5-2 m con eficiencia útil
Eficiencia: 40-85% según distancia y Q de las bobinas

Hito histórico: MIT 2007 (Kurs et al., Science) — 60W a 2m, η=40%, "WiTricity"
Patente base: US8629578B2 (MIT/WiTricity)

Aplicaciones activas 2024-2025:
  EV charging (carga inalámbrica de coches): SAE J2954, 3.3-22 kW, 85-94% eficiencia
    (Momentum Dynamics, WiTricity, Plugless Power)
  Medical implants: marcapasos, neuroestimuladores, cochleares — sin cables transdérmicos
  Industrial: robots AGV en fábrica — carga sin conector en parada (HEVO, WiBotic)

Patente reciente — US12362090 (Ericsson, 15 julio 2025):
  "High-efficiency resonant inductance coupling WPT using combined coil structure"
  → mejora el factor Q del acoplador con geometría de bobina compuesta
```

### WPT por campo eléctrico (resonancia capacitiva)

```
Advanced Science (2025): "Arrangement Free Wireless Power Transfer via Strongly Coupled
Electrical Resonances" — WPT eléctrico (capacitivo) que no depende de la orientación
de los electrodos → útil para dispositivos que giran o se mueven aleatoriamente.
```

### WPT de largo rango — laser y microondas

```
WPT por microondas (rectenna):
  Transmitir potencia como haz de microondas + antena rectificadora en el receptor
  Eficiencia: transmisión ~80%, rectificación ~80% → total ~60% en condiciones ideales
  Proyecto: JAXA Space Solar Power (Japón) — satélite solar → Tierra en 5.8 GHz (2025-2030)
  Problema: densidad de potencia en el haz → regulación de seguridad estricta

WPT por laser:
  Alta direccionalidad, no ionizante en IR → para drones, UAV, sensores remotos
  PowerLight Technologies: 400W a 300m para drones en vuelo (2024)
```

## Efecto Corona y plasma — los chispazos de Tesla

```
A tensiones > ~30 kV/cm (campo de ruptura del aire seco a 1 atm):
  El aire se ioniza → plasma → descarga eléctrica visible

En la bobina Tesla:
  Los arcos son columnas de plasma caliente (8000-30000 K) que se forman
  desde el toroide terminal siguiendo el campo eléctrico máximo.
  La longitud máxima ≈ λ/4 de la frecuencia de resonancia → eso limita las "chispas" a tamaño físico.

Aplicaciones industriales del plasma DC/RF (no Tesla pero misma física):
  Tratamiento de superficies (mejora adhesión)
  Esterilización (plasma frío)
  Propulsión iónica (Hall thrusters en satélites)
```

## Cronología clave de Tesla

```
1882  Idea del motor AC de campo rotante (en Budapest, paseando)
1884  Llega a EEUU, trabaja con Edison (despedido o dimite en 1885)
1887  Inventa el motor de inducción polifásico
1888  Vende patentes a Westinghouse
1891  Presenta la bobina Tesla en el AIEE (American Institute of Electrical Engineers)
1893  Ilumina la Exposición de Chicago con AC (Niágara en miniatura)
1895  Primera planta de Niágara Falls: 10 MW, 40 km, 11000 V
1899  Experimentos en Colorado Springs — rayos artificiales de 40 m, 12 MVolt
1901  Inicia Wardenclyffe Tower — J.P. Morgan financia
1903  Marconi transmite el Atlántico → Morgan retira la financiación
1917  Wardenclyffe demolida por deudas
1943  Muere en el New Yorker Hotel. La Corte Suprema de EEUU le reconoce
       la prioridad sobre Marconi en la patente de la radio (US645576)
```
