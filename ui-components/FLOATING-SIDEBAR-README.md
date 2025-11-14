# 📱 Floating Sidebar Component

Barra vertical lateral flotante para botones emoji de 10x10mm. Posicionable a **izquierda o derecha**, semi-transparente con blur, draggable y colapsable.

## 🎯 Características

- ✅ **Posicionamiento flexible**: Izquierda/Derecha, Top/Center/Bottom
- ✅ **Draggable**: Arrastra para reposicionar
- ✅ **Colapsable**: Minimiza la barra para más espacio
- ✅ **Semi-transparente**: Fondo con blur (ves el contenido debajo)
- ✅ **Scroll interno**: Muchos botones sin problema
- ✅ **Tooltips**: Etiquetas al hacer hover
- ✅ **Badges**: Notificaciones en botones
- ✅ **Remember Position**: Guarda posición en localStorage
- ✅ **Responsive**: Horizontal en bottom en móviles
- ✅ **Integración**: Funciona con EmojiActionButton y OverlayPanel

## 📦 Archivos

```
ui-components/
├── floating-sidebar.component.json  # Definición JSON
├── floating-sidebar.css             # Estilos completos
├── floating-sidebar.js              # Clase JavaScript
├── floating-sidebar-demo.html       # Demo interactiva
└── FLOATING-SIDEBAR-README.md       # Esta documentación
```

## 🚀 Uso Básico

### HTML

```html
<!DOCTYPE html>
<html>
<head>
    <link rel="stylesheet" href="emoji-action-button.css">
    <link rel="stylesheet" href="floating-sidebar.css">
</head>
<body>
    <script src="emoji-action-button.js"></script>
    <script src="floating-sidebar.js"></script>
    <script>
        const sidebar = new FloatingSidebar({
            position: 'left',
            buttons: [
                { emoji: '🏠', tooltip: 'Home' },
                { emoji: '📊', tooltip: 'Stats' },
                { emoji: '⚙️', tooltip: 'Settings' }
            ]
        });
    </script>
</body>
</html>
```

### JavaScript

```javascript
// Sidebar simple
const sidebar = new FloatingSidebar({
    position: 'left',  // 'left' o 'right'
    align: 'center',   // 'top', 'center', 'bottom'
    buttons: [
        { emoji: '🏠', tooltip: 'Home' },
        { emoji: '📊', tooltip: 'Estadísticas', badge: '3' },
        { emoji: '⚙️', tooltip: 'Configuración' }
    ]
});

// Sidebar con callbacks
const sidebar = new FloatingSidebar({
    position: 'right',
    buttons: [
        {
            emoji: '➕',
            tooltip: 'Añadir',
            onClick: () => console.log('Añadir clicked')
        },
        {
            emoji: '✏️',
            tooltip: 'Editar',
            onClick: () => console.log('Editar clicked')
        }
    ],
    onButtonClick: (button, index) => {
        console.log('Button clicked:', button.emoji, index);
    }
});
```

## ⚙️ API

### Constructor

```javascript
new FloatingSidebar(options)
```

**Opciones:**

```javascript
{
    position: 'left',              // 'left' o 'right' (default: 'left')
    align: 'center',               // 'top', 'center', 'bottom' (default: 'top')
    buttons: [],                   // Array de configuración de botones
    collapsible: true,             // boolean - Mostrar botón de colapso (default: true)
    draggable: true,               // boolean - Permitir drag & drop (default: true)
    showHandle: true,              // boolean - Mostrar handle de drag (default: true)
    showTooltips: true,            // boolean - Mostrar tooltips (default: true)
    rememberPosition: true,        // boolean - Guardar posición (default: true)
    storageKey: 'sidebar-pos',     // string - Key para localStorage (default: 'floating-sidebar-position')
    compact: false,                // boolean - Modo compacto (default: false)
    onButtonClick: (btn, idx) => {}// callback cuando se hace click en botón
}
```

**Configuración de Botones:**

```javascript
buttons: [
    {
        emoji: '🏠',               // string - Emoji (requerido)
        tooltip: 'Home',           // string - Texto del tooltip (opcional)
        badge: '3',                // string|number - Badge de notificación (opcional)
        active: false,             // boolean - Marcar como activo (opcional)
        onClick: () => {}          // function - Callback específico del botón (opcional)
    },
    // O usar EmojiActionButton directamente:
    new EmojiActionButton('📊', {...}),
    // O simplemente emoji:
    '⚙️'
]
```

### Métodos Públicos

```javascript
// Añadir botón dinámicamente
sidebar.addButtonDynamic({
    emoji: '🎯',
    tooltip: 'Nuevo',
    onClick: () => console.log('Nuevo botón')
});

// Remover botón por índice
sidebar.removeButton(2);

// Limpiar todos los botones
sidebar.clearButtons();

// Cambiar posición
sidebar.setPosition('right', 'bottom');

// Toggle collapse
sidebar.toggleCollapse();

// Mostrar/Ocultar sidebar
sidebar.show();
sidebar.hide();

// Marcar botón como activo
sidebar.setActiveButton(0);

// Añadir/quitar badge
sidebar.setBadge(0, '5');   // Añadir
sidebar.setBadge(0, null);  // Quitar

// Destruir sidebar
sidebar.destroy();
```

## 🎨 Posicionamiento

### Posiciones Disponibles

```javascript
// Izquierda
position: 'left'   // Left side, offset 16px

// Derecha
position: 'right'  // Right side, offset 16px
```

### Alineación Vertical

```javascript
// Top
align: 'top'       // Top offset 80px

// Center
align: 'center'    // Centrado verticalmente

// Bottom
align: 'bottom'    // Bottom offset 80px
```

### Ejemplo de Combinaciones

```javascript
// Top left (default)
{ position: 'left', align: 'top' }

// Center right
{ position: 'right', align: 'center' }

// Bottom left
{ position: 'left', align: 'bottom' }
```

## 🎭 Casos de Uso

### 1. Navegación Principal

```javascript
const navigationSidebar = new FloatingSidebar({
    position: 'left',
    align: 'center',
    buttons: [
        {
            emoji: '🏠',
            tooltip: 'Home',
            onClick: () => navigateTo('/home')
        },
        {
            emoji: '📊',
            tooltip: 'Dashboard',
            badge: '3',
            onClick: () => navigateTo('/dashboard')
        },
        {
            emoji: '💬',
            tooltip: 'Messages',
            badge: '12',
            onClick: () => navigateTo('/messages')
        },
        {
            emoji: '👤',
            tooltip: 'Profile',
            onClick: () => navigateTo('/profile')
        }
    ]
});
```

### 2. Acciones Rápidas (CRUD)

```javascript
const actionsSidebar = new FloatingSidebar({
    position: 'right',
    align: 'top',
    buttons: [
        {
            emoji: '➕',
            tooltip: 'Crear Nuevo',
            onClick: () => createNew()
        },
        {
            emoji: '🔍',
            tooltip: 'Buscar',
            onClick: () => openSearch()
        },
        {
            emoji: '✏️',
            tooltip: 'Editar',
            onClick: () => editCurrent()
        },
        {
            emoji: '🗑️',
            tooltip: 'Eliminar',
            onClick: () => {
                const confirm = OverlayPanel.confirm({
                    title: '¿Eliminar?',
                    message: '¿Estás seguro?',
                    danger: true,
                    onConfirm: () => deleteCurrent()
                });
                confirm.open();
            }
        }
    ]
});
```

### 3. Editor de Texto/Código

```javascript
const editorToolbar = new FloatingSidebar({
    position: 'left',
    align: 'top',
    compact: true,
    buttons: [
        { emoji: '💾', tooltip: 'Guardar' },
        { emoji: '📁', tooltip: 'Abrir' },
        { emoji: '↩️', tooltip: 'Deshacer' },
        { emoji: '↪️', tooltip: 'Rehacer' },
        { emoji: '📋', tooltip: 'Copiar' },
        { emoji: '✂️', tooltip: 'Cortar' },
        { emoji: '📌', tooltip: 'Pegar' },
        { emoji: '🔍', tooltip: 'Buscar' }
    ],
    onButtonClick: (btn, idx) => {
        console.log('Editor action:', btn.tooltip);
    }
});
```

### 4. Integración con Admin Panel

```javascript
// Sidebar para gestionar agentes AI
const agentsSidebar = new FloatingSidebar({
    position: 'left',
    buttons: [
        {
            emoji: '🤖',
            tooltip: 'Ver Agentes',
            badge: agents.length,
            onClick: () => {
                const overlay = OverlayPanel.info(
                    'Agentes AI',
                    generateAgentsList(),
                    'medium'
                );
                overlay.open();
            }
        },
        {
            emoji: '➕',
            tooltip: 'Crear Agente',
            onClick: () => {
                const overlay = new OverlayPanel({
                    title: 'Crear Agente',
                    content: createAgentForm(),
                    size: 'large'
                });
                overlay.open();
            }
        },
        {
            emoji: '🔌',
            tooltip: 'Plugins',
            badge: plugins.length,
            onClick: () => showPlugins()
        }
    ]
});
```

### 5. Badges Dinámicos

```javascript
const sidebar = new FloatingSidebar({
    position: 'right',
    buttons: [
        { emoji: '🔔', tooltip: 'Notificaciones' },
        { emoji: '📧', tooltip: 'Mensajes' },
        { emoji: '👥', tooltip: 'Amigos' }
    ]
});

// Actualizar badges dinámicamente
function updateNotifications(count) {
    sidebar.setBadge(0, count > 0 ? count : null);
}

function updateMessages(count) {
    sidebar.setBadge(1, count > 0 ? count : null);
}

// Llamar cuando cambian los datos
updateNotifications(5);
updateMessages(12);
```

## 🎨 Personalización CSS

### Variables CSS

```css
.floating-sidebar {
    --sidebar-width: 62px;
    --sidebar-bg: rgba(26, 29, 36, 0.85);
    --sidebar-blur: 8px;
    --sidebar-border: rgba(55, 65, 81, 0.5);
    --sidebar-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}
```

### Clases Helper

```css
/* Modo compacto */
.floating-sidebar.compact {
    width: 50px;
    padding: 8px;
}

/* Modo expandido */
.floating-sidebar.expanded {
    width: 80px;
}

/* Estado activo en botón */
.floating-sidebar .emoji-btn.active {
    border-color: #2FBF71;
    background: rgba(47, 191, 113, 0.15);
}
```

## 📱 Responsive

### Desktop/Tablet
Barra vertical en el lateral (left/right)

### Mobile (< 768px)
Automáticamente cambia a:
- **Posición**: Bottom center
- **Orientación**: Horizontal
- **Width**: Casi full screen (con max-width)
- **Scroll**: Horizontal si hay muchos botones

```css
@media (max-width: 768px) {
    .floating-sidebar {
        bottom: 16px;
        left: 50%;
        transform: translateX(-50%);
        flex-direction: row;
    }
}
```

## ♿ Accesibilidad

### ARIA Labels
```javascript
// Automáticamente añade aria-label al botón de colapso
<button aria-label="Collapse sidebar">◀</button>
```

### Keyboard Navigation
- `Tab`: Navegar entre botones
- `Enter` / `Space`: Activar botón
- Tooltips visibles en focus

### Touch Targets
- Botones: 38x38px (10x10mm)
- Área táctil expandida: 56x56px (automática)

## 🎭 Animaciones

### Entrada
```css
/* Slide-in desde el lado */
animation: slide-in-left 0.3s ease-out;
```

### Colapso/Expansión
```css
/* Transición suave de width */
transition: width 0.2s ease;
```

### Drag
```css
/* Scale up mientras se arrastra */
.floating-sidebar.dragging {
    transform: scale(1.02);
}
```

## 💾 Persistencia

### LocalStorage

El sidebar guarda automáticamente la posición:

```javascript
// Se guarda en localStorage con la key especificada
{
    storageKey: 'my-sidebar-pos'
}

// Estructura guardada:
{
    x: 16,
    y: 80,
    side: 'left',
    align: 'top'
}
```

### Deshabilitar Persistencia

```javascript
const sidebar = new FloatingSidebar({
    rememberPosition: false  // No guardar posición
});
```

## 🔧 Integración

### Con Emoji Action Button

```javascript
// Usar EmojiActionButton directamente
const btn = new EmojiActionButton('🤖', {
    singleClick: () => viewDetails(),
    doubleClick: () => editDetails(),
    longPress: () => deleteItem()
}, {
    label: 'Agent'
});

const sidebar = new FloatingSidebar({
    position: 'left',
    buttons: [btn]  // Pasar el objeto directamente
});
```

### Con Overlay Panel

```javascript
const sidebar = new FloatingSidebar({
    position: 'right',
    buttons: [
        {
            emoji: '📄',
            tooltip: 'Detalles',
            onClick: () => {
                const overlay = new OverlayPanel({
                    title: 'Detalles',
                    content: '<p>Contenido aquí</p>',
                    size: 'medium'
                });
                overlay.open();
            }
        }
    ]
});
```

## 🐛 Troubleshooting

### La sidebar no se ve
**Solución**: El sidebar se crea con `opacity: 0` y se muestra automáticamente. Asegúrate de que `show()` se llama (lo hace automáticamente en el constructor).

### El drag no funciona
**Solución**: Verifica que `draggable: true` y `showHandle: true` estén activados.

### Los tooltips no aparecen
**Solución**: Asegúrate de que `showTooltips: true` y que los botones tienen propiedad `tooltip`.

### La posición no se guarda
**Solución**: Verifica que `rememberPosition: true` y que localStorage está disponible.

### Los badges no se ven
**Solución**: Usa `setBadge(index, value)` después de crear el sidebar.

## 📊 Especificaciones Técnicas

| Propiedad | Valor |
|-----------|-------|
| Width (desktop) | 62px |
| Width (compact) | 50px |
| Button size | 38x38px (10x10mm) |
| Button gap | 12px |
| Padding | 12px |
| Z-index | 900 |
| Background opacity | 0.85 |
| Backdrop blur | 8px |
| Border radius | 16px |
| Max height | calc(100vh - 160px) |

## 🔗 Ver También

- [Emoji Action Button](./EMOJI-BUTTON-README.md) - Botones emoji multi-touch
- [Overlay Panel](./OVERLAY-PANEL-README.md) - Paneles superpuestos
- [Admin Panel Module](../modules/admin-panel/) - Panel de administración

---

**Event Core v1.2.0 "Visual Admin"**
Barra lateral flotante para acceso rápido a acciones
