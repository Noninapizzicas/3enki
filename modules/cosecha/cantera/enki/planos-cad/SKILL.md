---
name: planos-cad
description: >-
  Generar planos CAD (DXF + SVG) con medidas desde una descripción en lenguaje
  natural: baldas, tableros, piezas, muebles, taladros. Traduce la intención
  del usuario a entidades JSON (rect/circulo/linea/arco/texto) y llama a la
  tool planos.generar. Devuelve el SVG para visualizar + DXF para exportar.
fuente: enki
dominio: diseno
tags: [planos, cad, dxf, svg, medidas, diseno, taller, carpinteria, cnc]
---

# Planos CAD

> **Qué es.** El módulo `planos` convierte un JSON de entidades con medidas en
> archivos CAD reales: **DXF R12** (formato abierto: AutoCAD, LibreCAD, Fusion 360,
> CNC) + **SVG** (para visualizar en el navegador/chat). Reflejo puro — una
> respuesta correcta computable, sin LLM intermedio.
>
> Código: `modules/planos/index.js` · v`0.1.0`

---

## 1 · LÓGICA

### Cuándo usar esta tool

ÚSALA siempre que el usuario pida **algo con medidas que dibujar**: baldas,
tableros, piezas de mueble, estanterías, agujeros/taladros, planos de taller,
cualquier diseño que haya que VER con sus dimensiones.

NO la uses para: fotos, recetas, texto — es solo dibujo técnico.

### Entidades soportadas

```jsonc
// Todas llevan capa (opcional) + coordenadas en las unidades del plano
{ "tipo": "rect",    "capa": "corte",   "x": 0, "y": 0, "ancho": 800, "alto": 200 }
{ "tipo": "circulo", "capa": "taladro", "cx": 400, "cy": 100, "radio": 5 }
{ "tipo": "linea",   "capa": "corte",   "x1": 0, "y1": 0, "x2": 800, "y2": 0 }
{ "tipo": "arco",    "capa": "corte",   "cx": 400, "cy": 100, "radio": 50, "angulo_inicio": 0, "angulo_fin": 180 }
{ "tipo": "texto",   "capa": "corte",   "x": 250, "y": 60, "valor": "BALDA A", "altura": 24 }
```

### Capas (opcional pero recomendado)

Separa por función para que el dibujo se entienda:
`corte` (rojo), `taladro` (azul), `cota` (ámbar — se añade sola con cotas:true).

---

## 2 · EVENTOS

| Evento | Dirección | Contrato |
|---|---|---|
| `planos.generar.request` | escucha | `{ plan, formato }` |
| `planos.generar.response` | publica | `{ ok, nombre, entidades, archivos:[{formato, archivo, url, svg?}] }` |
| `planos.generado` | publica | audit — la propiocepción lo capta |

---

## 3 · FUNCIONES

### `planos.generar` — la tool única

**Input:**
```jsonc
{
  "plan": {
    "nombre": "estanteria",        // va al nombre del archivo
    "unidades": "mm",              // mm | cm | m
    "capas": [                     // opcional
      { "nombre": "corte",   "color": "#dc2626" },
      { "nombre": "taladro", "color": "#2563eb" }
    ],
    "entidades": [ ... ],          // las de arriba
    "cotas": true                  // dibuja las MEDIDAS automáticamente
  },
  "formato": "ambos"               // dxf | svg | ambos
}
```

**Output:** `{ ok: true, nombre, entidades: N, archivos: [{ formato, archivo, url, bytes, svg? }] }`
— el SVG vuelve inline (`archivos[].svg`) para que el usuario lo vea ya.

---

## 4 · FLUJO — del lenguaje natural al plano

### Traducción de intención → entidades

1. **Escucha la medida que da el usuario** (80×20 = ancho×alto, Ø10 = diámetro).
2. **Construye el JSON**: cada pieza → `rect`; cada agujero → `circulo` (radio = diámetro/2); refuerzos/guías → `linea`; etiquetas → `texto`.
3. **Activa `cotas: true`** SIEMPRE que el usuario quiera ver las medidas (es el caso típico). Así las dimensiones se dibujan solas.
4. **Posiciona** las piezas en el espacio: primera en (0,0), siguientes desplazadas en Y (apiladas) o X (lado a lado), con separación de al menos 50 unidades.
5. **Nombra** el plano con algo legible: `estanteria-balda`, `panel-lateral`, `mesa-120x70`.
6. **Llama** `planos.generar` con `formato: "ambos"` (SVG para ver + DXF para exportar).
7. **Presenta el resultado**: muestra el SVG (viene inline) y di dónde quedó el DXF.

### Ejemplo completo

Usuario: *"hazme el plano de una balda de 80×20 con 2 taladros a los lados y un refuerzo central"*

```jsonc
{
  "plan": {
    "nombre": "balda-80x20",
    "unidades": "mm",
    "capas": [
      { "nombre": "corte",   "color": "#dc2626" },
      { "nombre": "taladro", "color": "#2563eb" }
    ],
    "entidades": [
      { "tipo": "rect",    "capa": "corte",   "x": 0, "y": 0, "ancho": 800, "alto": 200 },
      { "tipo": "circulo", "capa": "taladro", "cx": 40,  "cy": 100, "radio": 5 },
      { "tipo": "circulo", "capa": "taladro", "cx": 760, "cy": 100, "radio": 5 },
      { "tipo": "linea",   "capa": "corte",   "x1": 400, "y1": 0, "x2": 400, "y2": 200 },
      { "tipo": "texto",   "capa": "corte",   "x": 300, "y": 160, "valor": "BALDA 800x200", "altura": 25 }
    ],
    "cotas": true
  },
  "formato": "ambos"
}
```

### Errores que debes evitar

- **No inventes medidas** que el usuario no dio — si faltan, pregunta (ancho/alto/radio).
- **Radio vs diámetro**: un taladro "de 10" es `radio: 5` (el plano lo muestra como Ø10).
- **Unidades**: si el usuario no las dice, usa `mm` (default) y dilo en la respuesta.
- **No prometas G-code/CNC**: el DXF se exporta, pero el corte es cosa de la máquina.

### Respuesta esperada

```jsonc
{
  "status": 200,
  "data": {
    "ok": true,
    "nombre": "balda-80x20",
    "unidades": "mm",
    "entidades": 12,
    "archivos": [
      { "formato": "dxf", "archivo": "data/planos/balda-80x20.dxf", "url": null, "bytes": 942 },
      { "formato": "svg", "archivo": "data/planos/balda-80x20.svg", "url": null, "bytes": 1456, "svg": "<?xml..." }
    ]
  }
}
```

Error canónico: `422 PLAN_INVALIDO` con `errores[]` (entidad mal formada, plano vacío, formato desconocido).
