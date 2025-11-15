# 💰 Vista Cobro

Vista completa de cobro y pago para sistemas POS. Permite gestionar el pago de cuentas con múltiples formas de pago, descuentos, propinas y cálculos automáticos de IVA.

---

## 📋 Características

✅ **Header** con nombre de cuenta y total destacado
✅ **Resumen del pedido** con items editables (aumentar/disminuir cantidad, eliminar)
✅ **Totales automáticos** con subtotal, descuento, propina e IVA (21%)
✅ **Descuento porcentual** configurable
✅ **Propina** con presets (€0, €1, €2, €5) + monto personalizado
✅ **4 formas de pago**: Efectivo, Tarjeta, Mixto, Bizum
✅ **Efectivo** con cálculo automático de vuelto
✅ **Pago mixto** con división efectivo/tarjeta
✅ **Modal de confirmación** antes de procesar pago
✅ **Validaciones** de monto y forma de pago
✅ **Impresión** optimizada de ticket
✅ **WebSocket** para actualizaciones en tiempo real
✅ **Toast notifications** para feedback del usuario
✅ **Sidebar flotante** con navegación rápida
✅ **Responsive design** (desktop, tablet, mobile)

---

## 🎨 Componentes UI Integrados

### sidebar-button
- Navegación rápida entre vistas
- Botones de acción (volver, cuentas, nueva cuenta)
- Tipos: success, warning, info, primary

---

## 📂 Estructura de Archivos

```
views/cobro/
├── view.json              # Configuración de la vista
├── index.html             # Estructura HTML
├── cobro.css              # Estilos de la vista
├── cobro.js               # Controlador de la vista
└── README.md              # Esta documentación
```

---

## 🚀 Uso

### Instalación

```bash
# Desde la raíz del proyecto
cd views/cobro

# Abrir en navegador
python3 -m http.server 8080
# Visitar: http://localhost:8080?cuenta_id=mesa-1
```

### Configuración

Edita `view.json` para configurar:

```json
{
  "layout": {
    "type": "single-column",
    "max_width": "600px",
    "centered": true
  },
  "sections": {
    "resumen_pedido": {
      "editable": true,
      "show_variaciones": true,
      "show_notas": true,
      "item_controls": {
        "increase": true,
        "decrease": true,
        "delete": true
      }
    },
    "totales": {
      "show_subtotal": true,
      "show_descuento": true,
      "show_propina": true,
      "show_iva": true,
      "iva_porcentaje": 21
    },
    "formas_pago": {
      "metodos": ["efectivo", "tarjeta", "mixto", "bizum"]
    }
  },
  "api": {
    "load_cuenta": "/modules/cobro/cuentas/:id",
    "update_item": "/modules/cobro/items/:id",
    "delete_item": "/modules/cobro/items/:id",
    "process_payment": "/modules/cobro/pagar"
  }
}
```

---

## 💻 API del Controlador

### Inicialización

```javascript
// La vista se inicializa automáticamente
const cobro = new CobroView();

// Acceso global
window.cobro
```

### Métodos Principales

```javascript
// Modificar cantidad de item
cobro.increaseQuantity('item-1');  // Aumentar cantidad
cobro.decreaseQuantity('item-1');  // Disminuir cantidad
cobro.deleteItem('item-1');        // Eliminar item

// Aplicar descuento
cobro.descuentoPorcentaje = 10;    // 10% descuento
cobro.calculateTotals();

// Aplicar propina
cobro.propina = 5.00;              // €5.00 propina
cobro.calculateTotals();

// Seleccionar forma de pago
cobro.selectMetodoPago('efectivo');  // efectivo | tarjeta | mixto | bizum

// Procesar pago
cobro.procesarPago();

// Mostrar toast
cobro.showToast('Pago procesado', 'success');

// Abrir/cerrar modal
cobro.openModal('modalConfirmar');
cobro.closeModal('modalConfirmar');

// Imprimir ticket
cobro.imprimir();

// Volver a vista anterior
cobro.volver();
```

### Propiedades

```javascript
// Estado actual
cobro.cuentaId          // ID de la cuenta
cobro.cuentaNombre      // Nombre de la cuenta
cobro.cuentaTipo        // Tipo: local | delivery | llevar
cobro.orderItems        // Array de items en el pedido

// Cálculos
cobro.subtotal          // Subtotal sin IVA
cobro.descuentoPorcentaje  // % de descuento
cobro.descuentoMonto    // Monto del descuento
cobro.propina           // Monto de propina
cobro.iva               // Monto del IVA
cobro.total             // Total final

// Forma de pago
cobro.metodoPago        // Método seleccionado
cobro.efectivoRecibido  // Monto recibido en efectivo
cobro.vuelto            // Vuelto a devolver
cobro.mixtoEfectivo     // Parte en efectivo (pago mixto)
cobro.mixtoTarjeta      // Parte en tarjeta (pago mixto)

// Componentes UI
cobro.sidebarButtons    // Map de SidebarButton
```

---

## 🎯 Flujo de Uso

### 1. Vista Inicial

```
┌────────────────────────────────┐
│ 💰 Mesa 1 │ Local    €35.00   │
├────────────────────────────────┤
│ 📋 Resumen del Pedido          │
│                                │
│ ┌─────────────────────────┐   │
│ │ Margarita (Mediana)     │   │
│ │ €8.50 c/u               │   │
│ │ [ - ] 2 [ + ]    €17.00 │ 🗑│
│ └─────────────────────────┘   │
│                                │
│ ┌─────────────────────────┐   │
│ │ Carbonara (Grande)      │   │
│ │ €10.50 c/u              │   │
│ │ 📝 Sin cebolla          │   │
│ │ [ - ] 1 [ + ]    €10.50 │ 🗑│
│ └─────────────────────────┘   │
├────────────────────────────────┤
│ 💶 Totales                     │
│                                │
│ Subtotal:           €28.93     │
│ Descuento: [ 0 ] %  -€0.00     │
│ Propina:            +€0.00     │
│ [€0][€1][€2][€5][ Otro ]       │
│ IVA (21%):          €6.07      │
│ ─────────────────────────────  │
│ Total Final:        €35.00     │
├────────────────────────────────┤
│ 💳 Forma de Pago               │
│                                │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐   │
│ │ 💵 │ │ 💳 │ │ 🔄 │ │ 📱 │   │
│ └────┘ └────┘ └────┘ └────┘   │
│ Efectivo Tarjeta Mixto Bizum  │
├────────────────────────────────┤
│ [🔙 Volver] [🖨️ Imprimir]      │
│       [✅ Confirmar y Cerrar]  │
└────────────────────────────────┘
```

### 2. Editar Items

**Aumentar cantidad:**
1. Click en botón `+` del item
2. Cantidad aumenta en 1
3. Precio total se recalcula automáticamente
4. Totales se actualizan

**Disminuir cantidad:**
1. Click en botón `-` del item
2. Cantidad disminuye en 1 (mínimo 1)
3. Precio total se recalcula
4. Totales se actualizan

**Eliminar item:**
1. Click en botón 🗑️ del item
2. Item se elimina del pedido
3. Toast de confirmación
4. Totales se actualizan

### 3. Aplicar Descuento

```
┌──────────────────────────────┐
│ Descuento: [ 10 ] %          │
│            -€2.89            │
└──────────────────────────────┘
```

1. Introducir porcentaje de descuento (0-100%)
2. Descuento se aplica sobre el subtotal
3. Totales se recalculan automáticamente

### 4. Añadir Propina

**Presets:**
```
[€0] [€1] [€2] [€5]
```

1. Click en preset deseado
2. Propina se aplica al total
3. Preset queda marcado como activo

**Monto personalizado:**
```
[ 3.50 ] €
```

1. Introducir monto en campo "Otro"
2. Presets se desactivan
3. Propina se suma al total

### 5. Seleccionar Forma de Pago

#### Efectivo

```
┌────────────────────────────┐
│ Recibido: [ 50.00 ] €      │
│ Vuelto:   €15.00           │
└────────────────────────────┘
```

1. Click en botón "💵 Efectivo"
2. Introducir monto recibido
3. Vuelto se calcula automáticamente

#### Tarjeta

1. Click en botón "💳 Tarjeta"
2. Listo para confirmar

#### Mixto

```
┌────────────────────────────┐
│ Efectivo: [ 20.00 ] €      │
│ Tarjeta:  [ 15.00 ] €      │
└────────────────────────────┘
```

1. Click en botón "🔄 Mixto"
2. Introducir parte en efectivo
3. Parte en tarjeta se calcula automáticamente
4. O viceversa (introducir tarjeta, calcula efectivo)

#### Bizum

1. Click en botón "📱 Bizum"
2. Listo para confirmar

### 6. Confirmar Pago

```
┌─────────────────────────────┐
│ 💰 Confirmar Pago        ✕ │
├─────────────────────────────┤
│ Total a cobrar:   €35.00    │
│ Forma de pago:    💵 Efectivo│
│                             │
│ ¿Confirmar pago y cerrar    │
│  cuenta?                    │
├─────────────────────────────┤
│       [Cancelar] [Confirmar]│
└─────────────────────────────┘
```

1. Click en "✅ Confirmar y Cerrar"
2. Modal de confirmación aparece
3. Revisar total y forma de pago
4. Click en "Confirmar"
5. Pago se procesa
6. Toast de éxito
7. Redirección a vista comandero

---

## 🔄 WebSocket (Tiempo Real)

### Conexión

```javascript
// Configuración en view.json
"realtime": {
  "enabled": true,
  "websocket": {
    "url": "ws://localhost:9883",
    "topics": [
      "cobro/+/cuenta/updated",
      "cobro/+/pago/processed"
    ]
  }
}
```

### Mensajes

**Actualización de cuenta:**
```json
{
  "topic": "cobro/mesa-1/cuenta/updated",
  "payload": {
    "items": [...],
    "total": 35.00
  }
}
```

**Pago procesado:**
```json
{
  "topic": "cobro/mesa-1/pago/processed",
  "payload": {
    "cuenta_id": "mesa-1",
    "total": 35.00,
    "metodo": "efectivo",
    "timestamp": "2025-01-15T10:30:00Z"
  }
}
```

---

## 📊 Cálculos

### Fórmulas

```
Subtotal (sin IVA) = Total con IVA / (1 + IVA%)
Descuento Monto = Subtotal × (Descuento% / 100)
Base Imponible = Subtotal - Descuento Monto
IVA = Base Imponible × (IVA% / 100)
Total Final = Base Imponible + IVA + Propina
```

### Ejemplo

```
Items con IVA incluido: €35.00
IVA al 21%

Subtotal = €35.00 / 1.21 = €28.93
Descuento 10% = €28.93 × 0.10 = €2.89
Base Imponible = €28.93 - €2.89 = €26.04
IVA = €26.04 × 0.21 = €5.47
Propina = €2.00
Total Final = €26.04 + €5.47 + €2.00 = €33.51
```

---

## 🎨 Layout Responsivo

### Desktop (> 1024px)

```
Layout: Single column centered (max-width 600px)
Sidebar: Visible (derecha)
Formas de pago: 2 columnas
Acciones: 3 columnas
```

### Tablet (768px - 1024px)

```
Layout: Single column full-width
Sidebar: Visible (derecha)
Formas de pago: 2 columnas
Acciones: 2 columnas
```

### Mobile (< 768px)

```
Layout: Single column full-width
Sidebar: Oculto
Formas de pago: 1 columna
Acciones: 1 columna
Items: Stack vertical
```

---

## 🎯 Validaciones

### Pre-confirmación

- ✅ Debe haber al menos 1 item en el pedido
- ✅ Debe seleccionar una forma de pago
- ✅ Efectivo: monto recibido ≥ total
- ✅ Mixto: efectivo + tarjeta = total (±€0.01 tolerancia)

### Durante Edición

- ✅ Descuento: 0% - 100%
- ✅ Propina: ≥ 0
- ✅ Cantidad: ≥ 1
- ✅ Efectivo recibido: ≥ 0
- ✅ Mixto efectivo/tarjeta: ≥ 0

---

## 🎯 Próximas Mejoras

- [ ] **División de cuenta** entre comensales
- [ ] **Notas** editables por item
- [ ] **Historial** de pagos anteriores
- [ ] **Tickets** personalizables (logo, datos fiscales)
- [ ] **Propinas** por porcentaje (10%, 15%, 20%)
- [ ] **Descuentos** por item individual
- [ ] **Múltiples IVAs** (10%, 21%, etc.)
- [ ] **Pagos parciales** (señas, adelantos)
- [ ] **Facturación electrónica** integrada
- [ ] **QR code** para Bizum automático

---

## 🐛 Troubleshooting

### Los componentes no se cargan

```javascript
// Verificar rutas en index.html
<link rel="stylesheet" href="../../ui-components/sidebar-button/sidebar-button.css">
<script src="../../ui-components/sidebar-button/sidebar-button.js"></script>
```

### WebSocket no conecta

```javascript
// Verificar que el servidor WS esté corriendo
// Cambiar URL en view.json si es necesario
"websocket": {
  "url": "ws://localhost:9883"  // Puerto correcto
}
```

### Los items no aparecen

```javascript
// Verificar en consola del navegador
console.log(cobro.orderItems);

// Cargar cuenta manualmente
await cobro.loadCuenta();
cobro.render();
```

### Los cálculos no son correctos

```javascript
// Verificar IVA en view.json
"totales": {
  "iva_porcentaje": 21  // Debe ser correcto
}

// Recalcular manualmente
cobro.calculateTotals();
```

### El pago no se procesa

```javascript
// Verificar validaciones
console.log({
  items: cobro.orderItems.length,
  metodo: cobro.metodoPago,
  total: cobro.total
});

// Verificar endpoint API
console.log(cobro.config.api.process_payment);
```

---

## 🔗 Integración con Comandero

La vista de cobro se integra con la vista comandero:

**Flujo:**
1. Usuario toma pedido en vista comandero
2. Click en botón "💰 Cobrar" del sidebar
3. Navegación a vista cobro con `?cuenta_id=X`
4. Usuario procesa pago
5. Redirección a vista comandero

**Navegación:**
```javascript
// Desde comandero a cobro
window.location.href = `../cobro/index.html?cuenta_id=${cuentaId}`;

// Desde cobro a comandero
window.location.href = `../comandero/index.html?cuenta_id=${cuentaId}`;
```

---

## 📄 Licencia

Misma licencia que Event Core.

---

## 🙏 Créditos

**Vista creada con:** Prompt Maestro para Vistas UI
**Versión:** 1.0.0
**Fecha:** 2025-01-15
**Autor:** Event Core Team

---

**¿Necesitas ayuda?** Consulta la documentación de los componentes UI o abre un issue en el repositorio.

💰 **¡Buen cobro!**
