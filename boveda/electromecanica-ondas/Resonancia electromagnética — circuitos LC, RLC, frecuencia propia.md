---
tipo: componente
sector: electromecanica-ondas
tags: [resonancia, LC, RLC, frecuencia-propia, Q, filtros, antenas, Tesla]
---
# Resonancia electromagnética — circuitos LC, RLC, frecuencia propia

## Por qué importa la resonancia

La resonancia es el fenómeno donde un sistema oscila con amplitud máxima a una frecuencia
específica (la frecuencia propia) con mínima energía de entrada. Es la puerta entre los
circuitos electrónicos y las ondas: una antena es un circuito LC en resonancia con el espacio.
La bobina Tesla es un transformador resonante. Los filtros de radio son RLC.

## Circuito LC — el oscilador puro

```
Condensador (C) almacena energía en campo eléctrico: E = ½ CV²
Bobina (L) almacena energía en campo magnético:       E = ½ LI²

La energía oscila entre los dos: cuando C está cargado, I=0; cuando C está vacío, I es máximo.

Frecuencia de resonancia:
  f₀ = 1 / (2π√LC)     [Hz]
  ω₀ = 1 / √LC         [rad/s]

Impedancia del circuito LC serie en resonancia: Z = 0 (cortocircuito)
Impedancia del circuito LC paralelo en resonancia: Z = ∞ (circuito abierto)

Ejemplos:
  L=10µH, C=100pF → f₀ = 1/(2π√(10×10⁻⁶ × 100×10⁻¹²)) = 5.03 MHz (HF radio)
  L=1mH,  C=1µF   → f₀ = 5.03 kHz  (audio, filtros)
  L=100µH, C=220pF → f₀ = 1.07 MHz  (AM radio, secundario de bobina Tesla pequeña)
```

## Circuito RLC — el oscilador real (con pérdidas)

```
R = resistencia (pérdidas del cobre, ESR del condensador, irradiación)

SERIE (L, C, R en serie):
  Z(ω) = R + j(ωL - 1/ωC)
  En resonancia (ωL = 1/ωC): Z = R  → corriente máxima

PARALELO (L, C, R en paralelo):
  En resonancia: Z = R_paralelo → tensión máxima, corriente mínima de la fuente

Factor de calidad Q — la figura de mérito de la resonancia:
  Serie:    Q = ω₀L/R = 1/(ω₀CR) = (1/R)√(L/C)
  Paralelo: Q = R/(ω₀L) = Rω₀C

  Q alto → resonancia estrecha y pronunciada, amplificación alta de tensión/corriente
  Q bajo  → resonancia ancha y amortiguada

  Q = f₀ / Δf    (Δf = ancho de banda a -3dB)
```

### Tabla de Q típico por aplicación

| Aplicación | Q típico | Δf relativo | Implicación |
|---|---|---|---|
| Bobina inductiva básica | 50-200 | 0.5-2% | Inductor de filtro |
| Resonador de cuarzo (cristal) | 10⁴-10⁶ | ppm | Osciladores de precisión |
| Circuito LC de radio AM | 50-200 | — | Sintonización de canal |
| Bobina Tesla secundario | 100-500 | — | Alta tensión, WPT |
| Antena Yagi (Q de radiación) | 5-15 | — | Ancho de banda de antena |
| Filtro cerámico | 500-2000 | — | IF de radio |
| Resonador dieléctrico microondas | 1000-10000 | — | Telecomunicaciones |

## Amplificación de tensión en resonancia

```
En un circuito RLC serie, la tensión en el condensador o la bobina es Q veces la tensión aplicada:

  V_C = V_L = Q × V_fuente   (en resonancia)

Esto es lo que Tesla aprovechaba: con Q=200 y 1kV aplicado → 200 kV en el secundario.
La bobina Tesla no es solo un transformador de relación de espiras: es un transformador resonante.

Peligro real: condensadores y bobinas en resonancia pueden desarrollar tensiones
muy por encima de la alimentación aunque la corriente de la fuente sea modesta.
```

## Frecuencia de resonancia de una antena

```
Una antena dipolo de media onda (λ/2) puede verse como un circuito LC distribuido
que entra en resonancia cuando su longitud = λ/2.

L_dipolo = λ/2 = c/(2f)   (en el vacío)
Con factor de velocidad del conductor: L_física ≈ 0.95 × λ/2

Para 100 MHz (FM): L = 3×10⁸/(2×10⁸) = 1.5 m → cada brazo = 0.75 m
Para 433 MHz (ISM): L = 0.69 m → cada brazo = 0.34 m
Para 1090 MHz (ADS-B aviones): L = 0.275 m → cada brazo = 13.7 cm
Para 2.4 GHz (WiFi): L = 0.125 m → cada brazo = 6.25 cm

En resonancia, la impedancia de la antena es puramente resistiva (R_radiación ≈ 73 Ω para dipolo).
```

## Acoplamiento resonante — la base de WPT y Tesla

```
Dos circuitos LC con la misma frecuencia de resonancia f₀ intercambian energía
eficientemente aunque no estén físicamente conectados.

Coeficiente de acoplamiento: k = M / √(L₁×L₂)
  M = inductancia mutua
  k = 1 → acoplamiento perfecto (transformador con núcleo)
  k < 0.1 → acoplamiento débil (transferencia inalámbrica de energía)

Condición de máxima transferencia (resonancia acoplada):
  f₁ = f₂ = f₀    Y    Q₁, Q₂ altos

Eficiencia del WPT resonante:
  η = k²Q₁Q₂ / (1 + k²Q₁Q²)²   (aproximada)

  Para k=0.3, Q=100: η ≈ 85%  (WPT de rango corto eficiente)
  Para k=0.01, Q=300: η ≈ 22% (WPT de largo rango — baja eficiencia)
```

## Filtros LC — aplicación directa

```
FILTRO PASO-BAJO (LP):
  L en serie + C a tierra → deja pasar frecuencias < f₀, atenúa las altas
  Uso: eliminar armónicos del PWM, suavizar DC de fuentes conmutadas

FILTRO PASO-ALTO (HP):
  C en serie + L a tierra → deja pasar frecuencias > f₀, atenúa las bajas
  Uso: separar señal de audio del DC de polarización

FILTRO PASO-BANDA (BP):
  LC serie a tierra (o paralelo en serie) → solo deja pasar Δf alrededor de f₀
  Uso: receptor de radio (sintonía), filtro de FI (frecuencia intermedia)

FILTRO RECHAZA-BANDA (Notch):
  Elimina una banda estrecha
  Uso: eliminar 50 Hz (red) en señales de audio, eliminar portadora

Diseño con LTspice:
  Simular el filtro antes de construir → verificar f₀, ancho de banda, atenuación
  Gratis: ltspice.analog.com
```

## Osciladores LC — generación de señal

```
Oscilador Colpitts:
  LC con transistor BJT/FET → realimenta la señal en la proporción correcta para sostener la oscilación
  Frecuencia estable: f₀ = 1/(2π√(L × C_serie))   C_serie = (C1×C2)/(C1+C2)
  Uso: transmisores simples, PLLs, instrumentación

Oscilador Hartley:
  Toma central en L en lugar de condensador dividido
  Más fácil de ajustar la frecuencia (L variable con núcleo de ferrita móvil)

Oscilador de cuarzo:
  El cristal de cuarzo actúa como LC con Q=10⁵-10⁶ → muy estable en temperatura
  Derivados: TCXO (temperatura compensada), OCXO (horno termostatado), VCTCXO

Relevancia para antenas DIY:
  Un oscilador LC + amplificador de RF + antena = transmisor simple
  → Licencia de radioaficionado necesaria para transmitir (aunque sea baja potencia)
```
