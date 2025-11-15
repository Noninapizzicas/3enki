# 📝 Vista Comandero

Vista completa de toma de pedidos para sistemas POS. Integra los componentes `producto-button` y `sidebar-button` en una interfaz funcional.

---

## 📋 Características

✅ **Header** con nombre de cuenta y resumen del pedido
✅ **Topbar** con categorías horizontales scrollables
✅ **Grid adaptativo** de productos (2 columnas, alineación dinámica)
✅ **Sidebar flotante** con acciones rápidas (cobrar, crear cuenta, etc.)
✅ **Sección de cobro** con resumen y listado de items
✅ **Modals** para variaciones, mitad y mitad, pizza al gusto
✅ **Toast notifications** para feedback del usuario
✅ **WebSocket** para actualizaciones en tiempo real
✅ **Responsive design** (desktop, tablet, mobile)
✅ **Impresión** optimizada de la cuenta

---

## 🎨 Componentes UI Integrados

### producto-button
- Grid de productos por categoría
- Click izquierdo (30%) → Mostrar variaciones
- Click derecho (70%) → Añadir a orden
- Estados: oferta, destacado, nuevo, vegano, picante

### sidebar-button
- Botones de acción flotantes
- Cobrar, ver cuentas, crear nueva cuenta
- Navegación y acciones rápidas
- Tipos: success, warning, info, primary

---

## 📂 Estructura de Archivos

```
views/comandero/
├── view.json              # Configuración de la vista
├── index.html             # Estructura HTML
├── comandero.css          # Estilos de la vista
├── comandero.js           # Controlador de la vista
└── README.md              # Esta documentación
```

---

## 🚀 Uso

### Instalación

```bash
# Desde la raíz del proyecto
cd views/comandero

# Abrir en navegador
python3 -m http.server 8080
# Visitar: http://localhost:8080
```

### Configuración

Edita `view.json` para configurar:

```json
{
  "layout": {
    "columns_per_row": 2,     // Columnas en el grid
    "gap": "12px",            // Espacio entre productos
    "padding": {              // Padding de la vista
      "top": "20px",
      "right": "70px"         // Extra para el sidebar
    }
  },
  "categorias": [             // Categorías de productos
    {
      "id": "pizzas",
      "nombre": "Pizzas",
      "emoji": "🍕",
      "color": "#f97316"
    }
  ],
  "sidebar": {
    "position": "right",      // Posición del sidebar
    "draggable": true,        // Permitir drag (futuro)
    "buttons": [...]          // Botones del sidebar
  },
  "api": {                    // Endpoints de API
    "load_cuenta": "/modules/comandero/cuentas/:id",
    "load_productos": "/modules/comandero/productos",
    "add_item": "/modules/comandero/cuentas/:id/items"
  }
}
```

---

## 💻 API del Controlador

### Inicialización

```javascript
// La vista se inicializa automáticamente
const comandero = new ComanderoView();

// Acceso global
window.comandero
```

### Métodos Principales

```javascript
// Añadir producto a la orden
comandero.addToOrder({
  id: 'pizza-1',
  nombre: 'Margarita',
  precio: 8.50,
  categoria: 'pizzas'
});

// Seleccionar categoría
comandero.selectCategory('pizzas');

// Scroll a cobro
comandero.scrollToCobro();

// Crear nueva cuenta
comandero.createNewCuenta('local');  // local | delivery | llevar

// Mostrar toast
comandero.showToast('Producto añadido', 'success');

// Abrir/cerrar modal
comandero.openModal('modalVariaciones');
comandero.closeModal('modalVariaciones');
```

### Propiedades

```javascript
// Estado actual
comandero.cuentaId          // ID de la cuenta activa
comandero.cuentaNombre      // Nombre de la cuenta
comandero.cuentaTipo        // Tipo: local | delivery | llevar
comandero.orderItems        // Array de items en la orden
comandero.productos         // Array de productos disponibles
comandero.categorias        // Array de categorías
comandero.selectedCategory  // Categoría seleccionada

// Componentes UI
comandero.productoButtons   // Map de ProductoButton
comandero.sidebarButtons    // Map de SidebarButton
comandero.categoryButtons   // Map de botones de categoría
```

---

## 🎯 Flujo de Uso

### 1. Vista Inicial

```
┌────────────────────────────────────┬───┐
│ 📝 Mesa 1 │ Local    3 items €45.50│ 💰│
├────────────────────────────────────┤   │
│ 🍕 Pizzas │ 🥤 Bebidas │ 🍰 Postres│ 🍕│
├────────────────────────────────────┤   │
│ ┌──────┐  ┌──────┐                │ 🎨│
│ │Marga.│  │Carbon│                │   │
│ │€8.50 │  │€10.50│                │───│
│ └──────┘  └──────┘                │ 📋│
│ ┌──────┐  ┌──────┐                │───│
│ │Veget.│  │4Queso│                │🍽️ │
│ │€9.50 │  │€11.50│                │🛵 │
│ └──────┘  └──────┘                │🥡 │
└────────────────────────────────────┴───┘
```

### 2. Añadir Productos

1. **Click en producto** (zona derecha 70%) → Añade directamente
2. **Click izquierdo** (zona 30%) → Muestra modal de variaciones
3. **Actualización automática** del resumen en header
4. **Toast notification** confirma la acción

### 3. Variaciones

```
┌─────────────────────────────────┐
│ Variaciones de Margarita     ✕ │
├─────────────────────────────────┤
│ Selecciona la variación:        │
│                                 │
│ [ Pequeña (€6.80)            ] │
│ [ Mediana (€8.50)            ] │
│ [ Grande (€11.05)            ] │
│                                 │
├─────────────────────────────────┤
│            [Cancelar] [Añadir] │
└─────────────────────────────────┘
```

### 4. Cobro

Click en botón "💰 Cobrar" del sidebar → Scroll automático a sección de cobro

```
┌─────────────────────────────────┐
│ 💰 Cobrar Cuenta                │
├─────────────────────────────────┤
│ Subtotal:           €37.19      │
│ IVA (21%):          €7.81       │
│ ─────────────────────────────   │
│ Total:              €45.00      │
├─────────────────────────────────┤
│ • Margarita × 2    €17.00       │
│ • Carbonara × 1    €10.50       │
│ • Coca-Cola × 3    €7.50        │
│ • Tiramisú × 2     €9.00        │
├─────────────────────────────────┤
│ [    Cobrar    ] [ Imprimir ]   │
└─────────────────────────────────┘
```

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
      "comandero/+/cuenta/updated",
      "comandero/+/producto/stock_changed"
    ]
  }
}
```

### Mensajes

**Actualización de cuenta:**
```json
{
  "topic": "comandero/mesa-1/cuenta/updated",
  "payload": {
    "items": [...],
    "total": 45.00
  }
}
```

**Cambio de stock:**
```json
{
  "topic": "comandero/productos/stock_changed",
  "payload": {
    "productoId": "pizza-1",
    "stock": 0,
    "disponible": false
  }
}
```

---

## 🎨 Layout Responsivo

### Desktop (> 1024px)

```
Grid de productos: 2 columnas
Sidebar: Visible (derecha)
Categorías: Scroll horizontal
```

### Tablet (768px - 1024px)

```
Grid de productos: 2 columnas
Sidebar: Visible (derecha)
Header: Simplificado
```

### Mobile (< 768px)

```
Grid de productos: 1 columna
Sidebar: Oculto (menú hamburguesa)
Categorías: Scroll horizontal
Header: Compacto
```

---

## 🎯 Próximas Mejoras

- [ ] **Drag & drop** del sidebar para reposicionar
- [ ] **Filtros** de productos (buscar, precio, disponibilidad)
- [ ] **Historial** de órdenes anteriores
- [ ] **Notas** por producto (sin cebolla, extra queso, etc.)
- [ ] **Descuentos** y promociones
- [ ] **División de cuenta** entre comensales
- [ ] **Propinas** integradas
- [ ] **Múltiples formas de pago**
- [ ] **Impresión** automática en cocina
- [ ] **Voz** para toma de pedidos

---

## 🐛 Troubleshooting

### Los componentes no se cargan

```javascript
// Verificar rutas en index.html
<link rel="stylesheet" href="../../ui-components/producto-button/producto-button.css">
<script src="../../ui-components/producto-button/producto-button.js"></script>
```

### WebSocket no conecta

```javascript
// Verificar que el servidor WS esté corriendo
// Cambiar URL en view.json si es necesario
"websocket": {
  "url": "ws://localhost:9883"  // Puerto correcto
}
```

### Los productos no aparecen

```javascript
// Verificar en consola del navegador
console.log(comandero.productos);

// Cargar productos manualmente
await comandero.loadProductos();
comandero.renderProductos();
```

---

## 📄 Licencia

Misma licencia que Event Core.

---

## 🙏 Créditos

**Vista creada con:** Integración de componentes UI (producto-button + sidebar-button)
**Versión:** 1.0.0
**Fecha:** 2025-01-15
**Autor:** Event Core Team

---

**¿Necesitas ayuda?** Consulta la documentación de los componentes UI o abre un issue en el repositorio.

📝 **¡Buena toma de pedidos!**
