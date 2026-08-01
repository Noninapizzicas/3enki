---
tipo: referencia
sector: electronica-maker
tags: [pcb, fabricacion, prototipo, jlcpcb, fresado, serie-corta]
---
# Fabricación de PCB — del prototipo a la serie corta

Opciones para fabricar PCBs: desde fresado CNC en casa hasta servicios de ensamblaje completo.

## Métodos de fabricación

### Servicios online (el estándar maker)

| Servicio | PCB 2 capas (100×100mm, 5 uds) | Ensamblaje SMD | Tiempo |
|---|---|---|---|
| **JLCPCB** | $2–$5 | Sí (PCBA desde $8 setup) | 3–7 días + envío |
| **PCBWay** | $5–$10 | Sí | 3–7 días + envío |
| **OSH Park** | $15–$25 | No | 12 días (incluye envío USA) |
| **Aisler** | $8–$15 | Sí | 5–10 días (EU) |
| **PCBGOGO** | $5–$10 | Sí | 3–5 días + envío |

### Fresado CNC local (prototipo rápido)

| Aspecto | Detalle |
|---|---|
| **Máquina** | CNC 3018 ($200), Bantam ($3.000), o cualquier CNC con husillo ER11 |
| **Fresa** | V-bit 0.1 mm (aislamiento) + fresa 0.8 mm (contorno) + broca 0.8 mm (vías) |
| **Software** | FlatCAM (open-source) → Gerber a G-code |
| **Capas** | Realista: 1 cara. Posible: 2 caras con alineación manual |
| **Precisión** | ±0.1 mm (pistas de 0.2 mm son viables) |
| **Ventaja** | PCB en 30 minutos, sin esperar envío |
| **Desventaja** | Sin máscara de soldadura, sin serigrafía, sin vías metalizadas |

### Método fotosensible (transferencia UV)

```
1. Imprimir fotolito (transparencia) con el layout (impresora láser)
2. Exponer PCB fotosensible a UV (3–5 min)
3. Revelar en NaOH diluido (1%)
4. Atacar en FeCl₃ o persulfato de amonio (5–15 min)
5. Limpiar y perforar
```

Coste: $1–$3 por PCB. Calidad buena para THT, aceptable para SMD 0805+.

## Comparativa de métodos

| Método | Coste/PCB | Tiempo | Mín. pista | Vías | Máscara | Mejor para |
|---|---|---|---|---|---|---|
| **JLCPCB** | $1–$2 | 5–15 días | 0.09 mm | Sí | Sí | Serie corta, SMD fino |
| **Fresado CNC** | $2–$5 | 30 min | 0.2 mm | Manual | No | Prototipo urgente |
| **Fotosensible** | $1–$3 | 1 hora | 0.15 mm | Manual | No | Prototipo sin CNC |
| **Toner transfer** | $0.50 | 1 hora | 0.3 mm | Manual | No | Hobby, THT |

## PCBA (ensamblaje completo)

JLCPCB y PCBWay ofrecen ensamblaje SMD:

| Paso | Qué necesitas |
|---|---|
| **Gerbers** | Archivos de fabricación de KiCad |
| **BOM** | CSV con referencia, valor, footprint, designador |
| **Pick-and-place** | CSV con posición X/Y, rotación, lado (top/bottom) |

KiBot (CI/CD) puede generar los tres archivos automáticamente desde KiCad en un pipeline de GitHub Actions.

### Coste orientativo PCBA (JLCPCB)

| Concepto | Coste |
|---|---|
| Setup | $8 (una vez) |
| Componentes básicos (R, C, LED) | $0.001–$0.01/ud |
| ICs comunes (STM32, ESP32) | Precio de mercado |
| Ensamblaje | $0.0017/pad |
| **Total 10 PCBs con 50 componentes** | **~$30–$80** |

## Proveedores de componentes

| Proveedor | Tipo | Envío |
|---|---|---|
| **LCSC** | Integrado con JLCPCB, catálogo enorme | Desde China |
| **DigiKey** | Catálogo completo, datasheets | 1–3 días (USA/EU) |
| **Mouser** | Similar a DigiKey | 1–3 días |
| **TME** | Alternativa europea, buen precio | 2–5 días (EU) |
| **AliExpress** | Precio mínimo, calidad variable | 15–30 días |

→ Diseño: [[Diseño de PCB — flujo KiCad]]
→ Ensamblaje DIY: [[Pick and place open-source — LumenPnP]]
