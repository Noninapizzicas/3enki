---
tipo: componente
sector: eolica-hogar
tags: [inversor, grid-tie, red, autoconsumo]
---
# Conexión a red e inversores

## Inversor eólico vs solar

El inversor eólico debe tolerar:
- **Rango de tensión de entrada mucho más amplio** (la turbina fluctúa con el viento: 0V – Vmax)
- **Entrada AC** (muchos grid-tie eólicos aceptan AC trifásica directa del generador, con rectificación interna)
- **Variabilidad rápida** de potencia (ráfagas)

Un inversor solar espera DC estable en un rango estrecho. **NO usar un inversor solar directamente con una turbina eólica** sin rectificador + regulador intermedio.

## Modos de operación

### Off-grid (aislado)
```
Turbina → Rectificador → Controlador+DumpLoad → Banco baterías → Inversor onda pura → Cargas AC
```
- Inversor de onda senoidal pura (no modificada — los electrodomésticos sensibles fallan con onda modificada)
- Dimensionar inversor para la potencia pico de arranque de los electrodomésticos (nevera: 3× nominal)

### Grid-tie (conectado a red)
```
Turbina → Rectificador → Inversor grid-tie → Red eléctrica
                                ↓
                          Anti-isla (obligatorio)
```
- El inversor sincroniza frecuencia/fase con la red y vierte el excedente
- **Protección anti-isla obligatoria**: si la red cae, el inversor debe desconectarse en <2 segundos (evita electrocutar a técnicos de la compañía)
- En España: RD 244/2019 permite autoconsumo con excedentes ≤15 kW sin permiso de acceso

### Híbrido (baterías + red)
La configuración más versátil: almacena en baterías y vierte excedentes a la red. El inversor híbrido gestiona ambos flujos.

## Autoconsumo en España

- **Sin excedentes**: toda la producción se consume internamente. Más simple de tramitar.
- **Con excedentes ≤15 kW**: se puede compensar en la factura (compensación simplificada). Sin permiso de acceso.
- **>15 kW**: requiere permiso de acceso y conexión, registro como productor. Trámites largos (~1 año para eólica).

La compensación de excedentes eólicos funciona igual que la solar bajo RD 244/2019, pero los trámites municipales (licencia de obra, impacto visual, ruido) pueden complicar la instalación.

Ver [[Normativa España — minieólica]] para el marco regulatorio completo.
