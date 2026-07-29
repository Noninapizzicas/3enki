---
name: ui-lenguaje-visual
description: >-
  Filosofía de diseño: COLOR + ICONO + TEXTO como tres canales que transmiten
  el mismo mensaje. Captura cómo el POS pizzepos usa el lenguaje visual como
  código semántico (no decoración): colores de estado en cocina, iconos por
  tipo de cuenta, skins por tipo de proyecto, alertas visuales por inactividad.

  ACTIVAR cuando diseñes interfaces POS — comandero, cocina, cuentas — o
  cuando quieras explicar por qué un elemento tiene cierto color/icono.
  Complementa a pos-frontend-construction (arquitectura) y ux-flujo-cuenta
  (usabilidad). DENTRO de la cúpula interfaces/.
fuente: 3enki
dominio: interfaces
tags: [visual, lenguaje, color, icono, ux, diseño, pos, semaforo, cupula-interfaces]
---

# UI · Lenguaje Visual

> Color + icono + texto. Tres canales. Un mensaje.

La interfaz del POS no es decorativa. Cada color, cada icono, cada variación
cromática es **código semántico** que el camarero o cocinero procesa de un
vistazo, sin leer.

---

## 1 · Los tres canales

| Canal | Función | Ejemplo POS |
|-------|---------|-------------|
| 🟡🔵🟢 **Color** | Estado: alerta/progreso/resuelto | Tarjetas cocina: pendiente/preparando/listo |
| 🍕🛵🥡 **Icono** | Identidad: qué tipo de entidad | Tipo de cuenta: local/delivery/llevar |
| **Texto** | Precisión: datos que no admiten ambigüedad | Nombre del producto, precio, cantidad |

Los tres canales SIEMPRE refuerzan el mismo mensaje. Si el color dice
"pendiente" y el texto dice "entregado", hay un bug.

---

## 2 · Sistema de colores POS

### Estados de preparación (cocina + comandero)

```css
/* Los colores son un semáforo: todos lo entienden sin leer */
.pendiente   { border-left: 4px solid #f59e0b; }  /* 🟡 amarillo = espera */
.preparando  { border-left: 4px solid #3b82f6; }  /* 🔵 azul = en proceso */
.listo       { border-left: 4px solid #22c55e; }  /* 🟢 verde = terminado */

/* La alerta es roja: algo requiere atención */
.alerta      { border-left: 4px solid #ef4444; }  /* 🔴 rojo = acción urgente */
```

### Botones especiales (comandero)

Cada botón especial tiene su propio color para que el camarero lo ubique
por la mancha de color, no por leer la etiqueta:

```typescript
const botonesEspeciales = [
  { id: 'mitad',   label: 'Mitad',    icon: '🍕½', color: '#8b5cf6' },  // 🟣 lila
  { id: 'algusto', label: 'Al gusto', icon: '🎨',   color: '#ec4899' },  // 🩷 rosa
  { id: 'porcion', label: 'Porción',  icon: '🍕',   color: '#0ea5e9' },  // 🔵 azul claro
];
```

### Tipos de cuenta (cuentas)

```typescript
const TIPO_COLORS = {
  local:    '#3b82f6',   // azul
  delivery: '#f59e0b',   // ámbar
  llevar:   '#22c55e',   // verde
  glovo:    '#FF6B00',   // naranja
};
```

---

## 3 · Sistema de iconos POS

Cada entidad tiene un icono que la identifica al instante:

| Entidad | Icono | Donde aparece |
|---------|-------|---------------|
| Cuenta local (mesa) | 🍕 | CuentasScreen, sidebar |
| Delivery | 🛵 | CuentasScreen |
| Llevar | 🥡 | CuentasScreen |
| Enviar a cocina | 🍳 | Comandero sidebar |
| Cobro | 💶 | Comandero sidebar, CobroPanel |
| Imprimir | 🖨️ | Comandero sidebar, CobroPanel |
| Cuenta/detalle | 📄 | Comandero sidebar |
| Salir | ↩️ | Comandero sidebar |
| Método efectivo | 💵 | CobroPanel |
| Método tarjeta | 💳 | CobroPanel |
| Método bizum | 📱 | CobroPanel |
| Link de pago | 🔗 | CobroPanel |
| QR | 📲 | CobroPanel |
| Propina | 💝 | CobroPanel |

---

## 4 · Skins por tipo de proyecto

Cada tipo de proyecto cambia la **paleta completa** para que el usuario sepa
dónde está sin mirar la URL:

```typescript
// pizzepos → azul-neutro (default, no necesita skin explícita)
// prisma → verde-petróleo/teal
const PRISMA_SKIN = {
  '--color-bg': '#0d1512',
  '--color-primary': '#14b8a6',
  '--color-text': '#eaf2ef',
  // ... ~20 variables
};
```

El root se marca con `data-ui="prisma"` para que cualquier CSS pueda
reaccionar. Al salir del proyecto se restaura el tema del usuario.

---

## 5 · Reglas del lenguaje visual

1. **Cada canal es autosuficiente** — el color solo ya debería comunicar
   (un daltónico puede no verlo, pero el icono + texto lo cubren)
2. **Consistencia sobre creatividad** — mismo color = mismo significado
   en toda la app. No reutilices 🔴 para "pendiente" en una pantalla
   y para "urgencia" en otra.
3. **El texto es el respaldo** — cuando el color y el icono no bastan
   (precio, cantidad, nombre), el texto da la precisión.
4. **Los estados vacíos también son lenguaje** — una pantalla sin cuentas
   no está "vacía", está "lista para empezar" con un icono '+' y un hint.
5. **La alerta es el color más fuerte** — úsalo solo cuando necesites
   atención inmediata (>30 min inactividad, error, pedido listo hace rato).
6. **Prueba en escala de grises** — si la interfaz no se entiende sin color,
   depende demasiado del color y falla para daltónicos o monitores B/N.

---

## 6 · Referencia: el semáforo de cocina

El ejemplo más puro de lenguaje visual en el POS:

```
┌────────────────────────────────┐
│ [🟡 Pendientes] [🔵 En proceso] │ Filtros por estado
│ [🟢 Listos]                     │
├────────────────────────────────┤
│ ┌── Pedido ── [borde 🟡] ──┐   │
│ │ 🍕 Margarita ×2          │   │
│ │    [▶️ Preparar]          │   │ ← botón accesible
│ │ 🥗 César ×1              │   │
│ │    [🔵 Preparando...]     │   │ ← estado visible
│ └──────────────────────────┘   │
└────────────────────────────────┘
```

Un cocinero que no hable español entiende:
- Borde amarillo = pedido fresco, sin tocar
- Borde azul = alguien ya lo está cocinando
- Borde verde = listo para servir
- El icono 🍕 le dice qué producto es
- El botón ▶️ le dice qué hacer

Todo sin leer una palabra.
