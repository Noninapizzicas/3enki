---
name: disenador-parametrico-openscad
description: >-
  Diseñador paramétrico: genera STL/3MF y estima tiempo de impresión vía
  OpenSCAD MCP. Escucha generar_stl.request y estimar_tiempo.request, y
  responde con sus pares *.response (o *.failed). Convierte parámetros de
  diseño en geometría imprimible y estima el coste en tiempo del cabezal.
fuente: enki
when-to-use: "Entra encadenada por proceso-negocio (fase 4/5 de impresion-3d) o a mano para generar un modelo 3D paramétrico (STL/3MF) desde parámetros, o para estimar el tiempo de impresión de un modelo. Útil cuando hay que diseñar una pieza a medida para la cola."
dominio: impresion-3d
lente_dominio: diseno
lente_tarea: generar
tags: [impresion-3d, disenador, parametrico, openscad, stl, 3mf, tiempo, bus, fase4, fase5]
---

# Diseñador Paramétrico — impresión 3D

> **Qué es.** El diseñador paramétrico que genera geometría imprimible
> (STL/3MF) desde parámetros y estima el tiempo de impresión, usando OpenSCAD
> MCP como motor. No guarda la cola; solo produce modelos y estimaciones.
>
> Código: `modules/disenador_parametrico/` · habilita `disenador_parametrico.*` por bus.

---

## 1 · Contrato de eventos (bus)

**Escucha:**

| Evento | Qué hace |
|---|---|
| `disenador_parametrico.generar_stl.request` | Genera un STL/3MF desde parámetros de diseño. |
| `disenador_parametrico.estimar_tiempo.request` | Estima el tiempo de impresión de un modelo. |

**Publica:**

| Evento | Cuándo |
|---|---|
| `disenador_parametrico.generar_stl.response` | STL/3MF generado. |
| `disenador_parametrico.generar_stl.failed` | Falló la generación. |
| `disenador_parametrico.estimar_tiempo.response` | Estimación de tiempo. |
| `disenador_parametrico.estimar_tiempo.failed` | Falló la estimación. |

---

## 2 · Flujo

```
parámetros de diseño ──generar_stl.request──▶ OpenSCAD MCP ──▶ STL/3MF
modelo ──estimar_tiempo.request──▶ estimación de tiempo de impresión
```

- **generar_stl**: toma parámetros (dimensiones, forma, etc.), los pasa a
  OpenSCAD y devuelve la geometría imprimible.
- **estimar_tiempo**: calcula cuánto tardará el cabezal en imprimir el modelo.

---

## 3 · Uso típico

1. **Diseñar una pieza** → `disenador_parametrico.generar_stl.request { params }`
2. **Estimar coste en tiempo** → `disenador_parametrico.estimar_tiempo.request { model_id }`
3. El resultado entra a la cola (`cola_modelos`) para imprimirse.

---

## 4 · Pitfalls

- **No guardes la cola**: este módulo produce modelos y estimaciones; la
  cola la gestiona `cola_modelos`.
- **OpenSCAD MCP**: la generación depende del motor OpenSCAD. Si falla, emite
  `*.failed` — no inventes geometría.
- **Parámetros**: valida que los parámetros de diseño sean suficientes antes
  de llamar a OpenSCAD.
- **Verifica en disco**, no creas al reporte: confirma el archivo generado y
  la estimación devuelta.
