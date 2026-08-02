---
tipo: componente
sector: eolica-hogar
tags: [generador, pmg, imanes, alternador]
---
# Generador PMG — flujo axial

El generador de imanes permanentes de flujo axial (AFPM) es el estándar DIY para mini-eólica. Diseño Hugh Piggott / Scoraig: dos discos rotor con imanes + un estátor plano de bobinas entre ellos.

## Configuración típica

```
DOBLE ROTOR, ESTÁTOR ÚNICO (sandwich):

  disco rotor superior (imanes)
         ↓ flujo magnético
  estátor (bobinas en resina)
         ↑ flujo magnético
  disco rotor inferior (imanes)

Los discos giran solidarios con el eje; el estátor está fijo.
```

## Especificaciones por tamaño (guías Piggott / Practical Action)

| Rotor eólico | Polos mag. | Bobinas | Hilo AWG | Conexión | V salida | P nominal | RPM nominal |
|---|---|---|---|---|---|---|---|
| 1.2 m (4 ft) | 8 | 6 | 16 AWG | Estrella | 12 V | 100 W | 600 |
| 1.8 m (6 ft) | 12 | 9 | 14 AWG | Estrella | 12 V | 200 W | 400 |
| 2.4 m (8 ft) | 12 | 9 | 12 AWG | Estrella/Delta | 24 V | 500 W | 300 |
| 3.6 m (12 ft) | 16 | 12 | 10 AWG | Delta | 48 V | 1000 W | 200 |
| 4.2 m (14 ft) | 20 | 15 | 8 AWG | Delta | 48 V | 2000 W | 150 |

## Imanes

**Neodimio (NdFeB)**: más potentes (BHmax ~40 MGOe), más caros, temperatura máx ~80°C (N35), sensibles a corrosión → necesitan recubrimiento (Ni-Cu-Ni). Grado N35-N42 típico.

**Ferrita**: mucho más baratos, BHmax ~3.5 MGOe (10× menos que NdFeB), necesitan imanes más grandes y más polos para la misma potencia. Resistentes a corrosión y temperatura. Usados en diseños Piggott para reducir coste (16 imanes de 50×50×20 mm ferrita ≈ 12 imanes de 46×30×10 mm NdFeB en potencia, a 1/5 del coste).

## Reducción del cogging torque

El cogging (resistencia magnética al giro sin carga) dificulta el arranque a baja velocidad de viento.

- **Skewing de imanes**: desalinear ~1 paso de ranura. Reduce cogging hasta 81.5% (skew continuo) o 75% (step-skew).
- **Número de polos/ranuras**: relación no-entera (ej: 12 polos / 9 ranuras) reduce cogging vs relación entera.
- **Entrehierro**: separar los rotores reduce cogging pero también voltaje inducido — compromiso.

## Relación RPM ↔ Voltaje

```
V_pico ≈ (N_bobinas × N_vueltas × B × A_iman × ω) / √3   (conexión estrella)

Para un generador dado, V es proporcional a RPM.
Ejemplo: generador diseñado para 12V a 300 RPM
  → a 150 RPM produce ~6V (insuficiente para cargar batería 12V)
  → a 450 RPM produce ~18V (exceso → disipado por controlador)

Cut-in eléctrico: la velocidad de viento mínima que genera V > V_batería.
```

## Fases y rectificación

- **3 fases** (estándar): más suave, mejor aprovechamiento del cobre. Rectificador trifásico de puente completo (6 diodos) → DC.
- **Estrella vs Delta**: estrella da más voltaje (×√3), delta da más corriente. Estrella para sistemas de bajo voltaje (12V); delta para alto voltaje (48V) o vientos fuertes.

Ver [[Alternadores y motores reciclados]] para alternativas al PMG casero.
