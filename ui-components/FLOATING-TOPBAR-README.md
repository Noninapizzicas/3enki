# 📊 Floating Topbar Component

Barra horizontal superior flotante para botones emoji de 10x10mm. Posicionable en **top** con alineación izquierda/centro/derecha, semi-transparente con blur, draggable y colapsable.

## 🎯 Características

- ✅ **Alineación flexible**: Izquierda, Centro, Derecha
- ✅ **Grupos con separadores**: Organiza botones relacionados
- ✅ **Draggable**: Arrastra para reposicionar
- ✅ **Colapsable**: Minimiza la barra para más espacio
- ✅ **Semi-transparente**: Fondo con blur (ves el contenido debajo)
- ✅ **Scroll interno**: Muchos botones sin problema
- ✅ **Auto-hide**: Se oculta al hacer scroll down (opcional)
- ✅ **Tooltips**: Etiquetas al hacer hover
- ✅ **Badges**: Notificaciones en botones
- ✅ **Remember Position**: Guarda posición en localStorage
- ✅ **Responsive**: Vertical en móviles
- ✅ **Integración**: Funciona con EmojiActionButton y OverlayPanel

## 📦 Archivos

```
ui-components/
├── floating-topbar.component.json  # Definición JSON
├── floating-topbar.css             # Estilos completos
├── floating-topbar.js              # Clase JavaScript
├── floating-topbar-demo.html       # Demo interactiva
└── FLOATING-TOPBAR-README.md       # Esta documentación
```

## 🚀 Uso Básico

### HTML

```html
<!DOCTYPE html>
<html>
<head>
    <link rel="stylesheet" href="emoji-action-button.css">
    <link rel="stylesheet" href="floating-topbar.css">
</head>
<body>
    <script src="emoji-action-button.js"></script>
    <script src="floating-topbar.js"></script>
    <script>
        const topbar = new FloatingTopbar({
            align: 'center',
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
// Topbar simple
const topbar = new FloatingTopbar({
    align: 'center',  // 'left', 'center', 'right'
    buttons: [
        { emoji: '🏠', tooltip: 'Home' },
        { emoji: '📊', tooltip: 'Estadísticas', badge: '3' },
        { emoji: '⚙️', tooltip: 'Configuración' }
    ]
});

// Topbar con grupos y separadores
const topbar = new FloatingTopbar({
    align: 'center',
    groups: [
        {
            label: 'Archivo',
            buttons: [
                { emoji: '📄', tooltip: 'Nuevo' },
                { emoji: '📁', tooltip: 'Abrir' },
                { emoji: '💾', tooltip: 'Guardar' }
            ]
        },
        {
            label: 'Editar',
            buttons: [
                { emoji: '↩️', tooltip: 'Deshacer' },
                { emoji: '↪️', tooltip: 'Rehacer' },
                { emoji: '📋', tooltip: 'Copiar' }
            ]
        }
    ]
});

// Topbar con callbacks
const topbar = new FloatingTopbar({
    align: 'left',
    buttons: [
        {
            emoji: '➕',
            tooltip: 'Añadir',
            onClick: () => console.log('Añadir clicked')
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
new FloatingTopbar(options)
```

**Opciones:**

```javascript
{
    align: 'center',               // 'left', 'center', 'right' (default: 'center')
    buttons: [],                   // Array de configuración de botones
    groups: null,                  // Array de grupos con separadores (alternativa a buttons)
    collapsible: true,             // boolean - Mostrar botón de colapso (default: true)
    draggable: true,               // boolean - Permitir drag & drop (default: true)
    showHandle: true,              // boolean - Mostrar handle de drag (default: true)
    showTooltips: true,            // boolean - Mostrar tooltips (default: true)
    rememberPosition: true,        // boolean - Guardar posición (default: true)
    storageKey: 'topbar-pos',      // string - Key para localStorage (default: 'floating-topbar-position')
    compact: false,                // boolean - Modo compacto (default: false)
    autoHide: false,               // boolean - Auto-hide on scroll down (default: false)
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

**Configuración de Grupos:**

```javascript
groups: [
    {
        label: 'Archivo',          // string - Nombre del grupo (opcional)
        buttons: [                 // Array - Botones del grupo (requerido)
            { emoji: '📄', tooltip: 'Nuevo' },
            { emoji: '📁', tooltip: 'Abrir' }
        ]
    },
    {
        label: 'Editar',
        buttons: [
            { emoji: '↩️', tooltip: 'Deshacer' },
            { emoji: '↪️', tooltip: 'Rehacer' }
        ]
    }
]
```

### Métodos Públicos

```javascript
// Añadir botón dinámicamente
topbar.addButtonDynamic({
    emoji: '🎯',
    tooltip: 'Nuevo',
    onClick: () => console.log('Nuevo botón')
});

// Remover botón por índice
topbar.removeButton(2);

// Limpiar todos los botones
topbar.clearButtons();

// Cambiar alineación
topbar.setAlign('right'); // 'left', 'center', 'right'

// Toggle collapse
topbar.toggleCollapse();

// Mostrar/Ocultar topbar
topbar.show();
topbar.hide();

// Marcar botón como activo
topbar.setActiveButton(0);

// Añadir/quitar badge
topbar.setBadge(0, '5');   // Añadir
topbar.setBadge(0, null);  // Quitar

// Destruir topbar
topbar.destroy();
```

## 🎨 Posicionamiento

### Alineación Horizontal

```javascript
// Izquierda
align: 'left'      // Alineado a la izquierda

// Centro (default)
align: 'center'    // Centrado horizontalmente

// Derecha
align: 'right'     // Alineado a la derecha
```

### Posición Vertical

La topbar siempre se posiciona en **top: 16px** del viewport.

## 🎭 Casos de Uso

### 1. Editor de Texto/Código

```javascript
const editorTopbar = new FloatingTopbar({
    align: 'center',
    groups: [
        {
            label: 'Archivo',
            buttons: [
                { emoji: '📄', tooltip: 'Nuevo', onClick: () => newFile() },
                { emoji: '📁', tooltip: 'Abrir', onClick: () => openFile() },
                { emoji: '💾', tooltip: 'Guardar', onClick: () => saveFile() }
            ]
        },
        {
            label: 'Editar',
            buttons: [
                { emoji: '↩️', tooltip: 'Deshacer', onClick: () => undo() },
                { emoji: '↪️', tooltip: 'Rehacer', onClick: () => redo() },
                { emoji: '📋', tooltip: 'Copiar', onClick: () => copy() },
                { emoji: '✂️', tooltip: 'Cortar', onClick: () => cut() },
                { emoji: '📌', tooltip: 'Pegar', onClick: () => paste() }
            ]
        },
        {
            label: 'Ver',
            buttons: [
                { emoji: '🔍', tooltip: 'Buscar', onClick: () => search() },
                { emoji: '⚙️', tooltip: 'Preferencias', onClick: () => settings() }
            ]
        }
    ]
});
```

### 2. Navegación Principal

```javascript
const navigationTopbar = new FloatingTopbar({
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
            emoji: '⚙️',
            tooltip: 'Settings',
            onClick: () => navigateTo('/settings')
        },
        {
            emoji: '👤',
            tooltip: 'Profile',
            onClick: () => navigateTo('/profile')
        }
    ]
});
```

### 3. Status Bar con Indicadores

```javascript
const statusBar = new FloatingTopbar({
    align: 'right',
    compact: true,
    buttons: [
        {
            emoji: '🔔',
            tooltip: 'Notificaciones',
            badge: '5',
            onClick: () => showNotifications()
        },
        {
            emoji: '📧',
            tooltip: 'Email',
            badge: '3',
            onClick: () => showEmails()
        },
        {
            emoji: '🌐',
            tooltip: 'Conectado',
            onClick: () => showNetworkStatus()
        },
        {
            emoji: '🔋',
            tooltip: 'Batería: 85%',
            onClick: () => showBatteryStatus()
        }
    ]
});

// Actualizar badges dinámicamente
function updateNotifications(count) {
    statusBar.setBadge(0, count > 0 ? count : null);
}
```

### 4. Barra de Herramientas de Diseño

```javascript
const designToolbar = new FloatingTopbar({
    align: 'center',
    groups: [
        {
            label: 'Formas',
            buttons: [
                { emoji: '⬜', tooltip: 'Rectángulo' },
                { emoji: '🔴', tooltip: 'Círculo' },
                { emoji: '🔺', tooltip: 'Triángulo' },
                { emoji: '⭐', tooltip: 'Estrella' }
            ]
        },
        {
            label: 'Texto',
            buttons: [
                { emoji: '🆃', tooltip: 'Añadir Texto' },
                { emoji: '🅱️', tooltip: 'Bold' },
                { emoji: '🅸', tooltip: 'Italic' }
            ]
        },
        {
            label: 'Capas',
            buttons: [
                { emoji: '⬆️', tooltip: 'Traer al frente' },
                { emoji: '⬇️', tooltip: 'Enviar atrás' }
            ]
        }
    ]
});
```

### 5. Integración con Admin Panel

```javascript
// Topbar para gestionar agentes AI
const aiTopbar = new FloatingTopbar({
    align: 'left',
    buttons: [
        {
            emoji: '🤖',
            tooltip: 'Ver Agentes',
            badge: agents.length,
            onClick: () => {
                const overlay = OverlayPanel.info(
                    'Agentes AI',
                    generateAgentsList(),
                    'large'
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
        },
        {
            emoji: '📊',
            tooltip: 'Métricas',
            onClick: () => showMetrics()
        }
    ]
});
```

### 6. Auto-Hide para Más Espacio

```javascript
const fullscreenTopbar = new FloatingTopbar({
    align: 'center',
    autoHide: true,  // Se oculta al hacer scroll down
    buttons: [
        { emoji: '🎥', tooltip: 'Video' },
        { emoji: '🎵', tooltip: 'Audio' },
        { emoji: '🖼️', tooltip: 'Imagen' },
        { emoji: '📄', tooltip: 'Documento' }
    ]
});

// Útil para visualizadores de contenido fullscreen
// La topbar se oculta al consumir contenido
// Y reaparece al hacer scroll up
```

## 🎨 Personalización CSS

### Variables CSS

```css
.floating-topbar {
    --topbar-height: 62px;
    --topbar-bg: rgba(26, 29, 36, 0.85);
    --topbar-blur: 8px;
    --topbar-border: rgba(55, 65, 81, 0.5);
    --topbar-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}
```

### Clases Helper

```css
/* Modo compacto */
.floating-topbar.compact {
    height: 50px;
    padding: 8px;
}

/* Auto-hide activado */
.floating-topbar.auto-hide.hidden {
    transform: translateY(-100%);
    opacity: 0;
}

/* Estado activo en botón */
.floating-topbar .emoji-btn.active {
    border-color: #2FBF71;
    background: rgba(47, 191, 113, 0.15);
}
```

## 📱 Responsive

### Desktop/Tablet
Barra horizontal en la parte superior

### Mobile (< 768px)
Automáticamente cambia a:
- **Posición**: Bottom center (igual que FloatingSidebar)
- **Width**: Casi full screen (con max-width)
- **Altura**: Se ajusta al contenido
- **Scroll**: Horizontal si hay muchos botones

```css
@media (max-width: 768px) {
    .floating-topbar {
        top: auto !important;
        bottom: 16px !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        width: calc(100% - 32px);
        max-width: 400px;
    }
}
```

## ♿ Accesibilidad

### ARIA Labels
```javascript
// Automáticamente añade aria-label al botón de colapso
<button aria-label="Collapse topbar">▼</button>
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
/* Slide-in desde arriba */
animation: slide-in-top 0.3s ease-out;
```

### Auto-Hide
```css
/* Transición suave al ocultar/mostrar */
transition: transform 0.3s ease, opacity 0.3s ease;
```

### Colapso/Expansión
```css
/* Transición suave de width */
transition: width 0.2s ease;
```

### Drag
```css
/* Scale up mientras se arrastra */
.floating-topbar.dragging {
    transform: scale(1.02);
}
```

## 💾 Persistencia

### LocalStorage

El topbar guarda automáticamente la posición:

```javascript
// Se guarda en localStorage con la key especificada
{
    storageKey: 'my-topbar-pos'
}

// Estructura guardada:
{
    x: 100,
    y: 16,
    align: 'center'
}
```

### Deshabilitar Persistencia

```javascript
const topbar = new FloatingTopbar({
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

const topbar = new FloatingTopbar({
    align: 'center',
    buttons: [btn]  // Pasar el objeto directamente
});
```

### Con Overlay Panel

```javascript
const topbar = new FloatingTopbar({
    align: 'center',
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

### Con Floating Sidebar

```javascript
// Topbar para acciones globales
const topbar = new FloatingTopbar({
    align: 'center',
    buttons: [
        { emoji: '🏠', tooltip: 'Home' },
        { emoji: '📊', tooltip: 'Dashboard' }
    ]
});

// Sidebar para acciones contextuales
const sidebar = new FloatingSidebar({
    position: 'right',
    buttons: [
        { emoji: '➕', tooltip: 'Añadir' },
        { emoji: '✏️', tooltip: 'Editar' }
    ]
});

// Ambos funcionan juntos sin conflictos
// Z-index: Topbar = 900, Sidebar = 900
```

## 🐛 Troubleshooting

### La topbar no se ve
**Solución**: El topbar se crea con `opacity: 0` y se muestra automáticamente. Asegúrate de que `show()` se llama (lo hace automáticamente en el constructor).

### El drag no funciona
**Solución**: Verifica que `draggable: true` y `showHandle: true` estén activados.

### Los tooltips no aparecen
**Solución**: Asegúrate de que `showTooltips: true` y que los botones tienen propiedad `tooltip`.

### La posición no se guarda
**Solución**: Verifica que `rememberPosition: true` y que localStorage está disponible.

### Los grupos no se ven separados
**Solución**: Usa la propiedad `groups` en lugar de `buttons`, y los separadores se añadirán automáticamente.

### El auto-hide no funciona
**Solución**: Verifica que `autoHide: true` y que tienes contenido con scroll en la página.

## 📊 Especificaciones Técnicas

| Propiedad | Valor |
|-----------|-------|
| Height (desktop) | 62px |
| Height (compact) | 50px |
| Button size | 38x38px (10x10mm) |
| Button gap | 12px |
| Padding | 12px |
| Z-index | 900 |
| Background opacity | 0.85 |
| Backdrop blur | 8px |
| Border radius | 16px |
| Max width | calc(100vw - 32px) |
| Top offset | 16px |

## 🔗 Ver También

- [Emoji Action Button](./EMOJI-BUTTON-README.md) - Botones emoji multi-touch
- [Overlay Panel](./OVERLAY-PANEL-README.md) - Paneles superpuestos
- [Floating Sidebar](./FLOATING-SIDEBAR-README.md) - Barra lateral flotante
- [Admin Panel Module](../modules/admin-panel/) - Panel de administración

---

**Event Core v1.2.0 "Visual Admin"**
Barra superior flotante para acceso rápido a acciones
