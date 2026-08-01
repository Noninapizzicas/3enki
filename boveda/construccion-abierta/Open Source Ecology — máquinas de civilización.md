---
tipo: referencia
sector: construccion-abierta
tags: [open-source-ecology, gvcs, maquinas, civilizacion, fabricacion]
---
# Open Source Ecology — máquinas de civilización

Open Source Ecology (OSE) diseña las 50 máquinas industriales necesarias para construir una civilización pequeña y sostenible, con planos abiertos y replicables.

## Global Village Construction Set (GVCS)

El GVCS es el conjunto de 50 máquinas que OSE considera el kit mínimo para una comunidad autosuficiente. Cada máquina tiene planos abiertos, BOM, instrucciones de construcción y vídeos.

### Máquinas por categoría

| Categoría | Máquinas | Estado |
|---|---|---|
| **Agricultura** | Tractor (LifeTrac), arado, sembradora, cosechadora, molino | LifeTrac v6 construido |
| **Construcción** | Prensa de ladrillos (CEB), hormigonera, retroexcavadora | CEB Press v6 maduro |
| **Fabricación** | Torno, fresadora, cortadora plasma, impresora 3D industrial | Plasma cortadora v2 |
| **Energía** | Generador, turbina eólica, concentrador solar, gasificador | Prototipos varios |
| **Transporte** | Camión, coche modular (OSE Car) | Diseño conceptual |
| **Materiales** | Horno de fundición, aserradero, extrusora de aluminio | Parcialmente documentados |
| **Hábitat** | MicroHouse (vivienda modular), sistema hidráulico | MicroHouse v2 |

### CEB Press (Compressed Earth Block) — la máquina estrella

La prensa de bloques de tierra comprimida es la máquina más madura del GVCS:

| Aspecto | Detalle |
|---|---|
| **Función** | Comprime tierra + 5–10% cemento en bloques estructurales |
| **Producción** | 6 bloques/minuto (~3.000/día) |
| **Bloque** | 300×150×100 mm, resistencia 3–10 MPa |
| **Coste máquina** | ~$4.000 en materiales |
| **Coste bloque** | ~$0.05/bloque (tierra local + cemento) |
| **vs ladrillo** | 10× más barato, sin cocción (huella de carbono baja) |

### LifeTrac — tractor open-source

| Aspecto | Detalle |
|---|---|
| **Potencia** | 18–70 HP (motor diésel estándar) |
| **Hidráulica** | Power cube modular (motor + bomba + tanque) |
| **Coste** | ~$10.000 (vs $30.000+ tractor comercial) |
| **Característica** | Quick-attach para cambiar implementos en minutos |

## Civilization Starter Kit (repo: 111 stars)

Documentación consolidada para replicar el GVCS completo:

- CAD files (FreeCAD + LibreCAD)
- BOM (bill of materials) con proveedores
- Instrucciones de fabricación paso a paso
- Vídeos de construcción y operación

## Filosofía de diseño OSE

| Principio | Significado |
|---|---|
| **Modularidad** | Componentes intercambiables entre máquinas (Power Cube) |
| **Fabricación distribuida** | Construible en un taller con herramientas estándar |
| **Durabilidad** | Diseño para 50+ años, reparable |
| **Coste** | 8× más barato que equivalente comercial (objetivo) |
| **Escalabilidad** | Del taller individual a la fábrica comunitaria |

## Limitaciones y estado real

- **50 máquinas prometidas, ~12 maduras**: la mayoría están en prototipo o diseño conceptual
- **Documentación desigual**: CEB Press excelente, otras máquinas con gaps
- **Requiere taller equipado**: soldadura MIG, CNC plasma, torno básico
- **Comunidad pequeña**: el desarrollo depende de workshops y voluntarios

→ Soldadura para fabricar: ver sector [[metalurgia-diy/Soldadura — procesos y elección]]
→ Corte plasma: [[metalurgia-diy/Plasma CNC — máquinas open-source]]
→ Materiales de construcción: [[Materiales de construcción — comparativa maker]]
