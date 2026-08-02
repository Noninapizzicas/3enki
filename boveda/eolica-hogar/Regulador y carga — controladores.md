---
tipo: componente
sector: eolica-hogar
tags: [controlador, regulador, dump-load, mppt]
---
# Regulador y carga — controladores

## Diferencia clave: eólica ≠ solar

La turbina **siempre debe tener carga conectada**. Desconectar la carga (batería llena, fallo de cable) deja la turbina girando libre → embalamiento → destrucción mecánica. La carga de descarga (dump load) es **obligatoria**, no opcional.

## Tipos de controlador

### Dump load (resistencias de disipación)
- El más simple: cuando la batería está llena, el exceso se desvía a resistencias calefactoras (aire o agua).
- Conmutación por relé o MOSFET. Escalonado (varios niveles de carga) mejor que todo-o-nada.
- **Dimensionar la resistencia** para absorber ≥100% de la potencia nominal de la turbina.
- Fiable, barato, estándar en DIY.

### PWM (modulación por ancho de pulso)
- Regula el voltaje cortando la señal DC rectificada. Común en controladores solares.
- Para eólica: menos eficiente que MPPT a baja velocidad de viento.

### MPPT (seguimiento de máximo punto de potencia)
- Ajusta la impedancia de carga para extraer máxima potencia a cada velocidad de viento.
- **Booster MPPT eólico**: funciona bien incluso a baja velocidad → extrae energía que PWM perdería.
- Más caro pero recupera la inversión en producción adicional.

## Controladores híbridos eólica+solar

Combinan MPPT para viento + PWM para solar en un solo equipo. Ejemplo: Pikasola 1400W (800W eólico + 600W solar, 12/24V). Gestionan la prioridad: solar de día, viento de noche, dump load cuando ambos producen y la batería está llena.

## Rectificación

El generador produce AC (normalmente 3 fases). El controlador recibe DC.

```
Generador 3φ AC → Rectificador puente (6 diodos) → DC → Controlador → Batería
                                                         ↓
                                                    Dump load (cuando batería llena)
```

Diodos: Schottky para menor caída de voltaje (0.3V vs 0.7V silicio → 5-10% más eficiencia en sistemas 12V).

## Frenado eléctrico

Cortocircuitar las fases del generador (con interruptor o relé) → alto par resistente → frena el rotor. Es el freno de emergencia más simple. El controlador puede activarlo automáticamente si detecta sobreviento o fallo.

Ver [[Baterías y almacenamiento]] para el sistema de acumulación.
