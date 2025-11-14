# 🎯 Emoji Action Button

Botón compacto de **10x10mm (38x38px)** optimizado para móviles con **3 tipos de interacción**: click simple, doble click y long press.

## 🎨 Características

- ✅ **Tamaño compacto**: 10x10mm visual (38x38px)
- ✅ **Área táctil expandida**: 56x56px invisible (cumple estándares touch)
- ✅ **3 interacciones**: Single click, double click, long press (3s)
- ✅ **Feedback visual**: Animaciones de marco y barra de progreso
- ✅ **Feedback háptico**: Vibración en dispositivos compatibles
- ✅ **Marco distintivo**: 4 estados (default, active, pressed, critical)
- ✅ **Emoji como contenido**: Soporte completo Unicode
- ✅ **Touch optimizado**: Sin lag, sin conflicts con scroll
- ✅ **Accesibilidad**: ARIA labels, reduced motion support

## 📦 Archivos

```
ui-components/
├── emoji-action-button.component.json  # Definición JSON
├── emoji-action-button.css             # Estilos completos
├── emoji-action-button.js              # Clase JavaScript
├── emoji-action-button-demo.html       # Demo interactiva
└── EMOJI-BUTTON-README.md              # Esta documentación
```

## 🚀 Uso Básico

### HTML

```html
<!DOCTYPE html>
<html>
<head>
    <link rel="stylesheet" href="emoji-action-button.css">
</head>
<body>
    <div id="container"></div>
    <script src="emoji-action-button.js"></script>
    <script>
        const btn = new EmojiActionButton('🗑️', {
            singleClick: () => alert('Mover a papelera'),
            doubleClick: () => alert('Ver papelera'),
            longPress: () => alert('Eliminar permanentemente')
        });

        document.getElementById('container').appendChild(btn.element);
    </script>
</body>
</html>
```

### JavaScript

```javascript
// Botón simple
const homeBtn = new EmojiActionButton('🏠', {
    singleClick: () => console.log('Ver home'),
    doubleClick: () => console.log('Editar home'),
    longPress: () => console.log('Resetear home')
});

// Botón con label
const saveBtn = new EmojiActionButton('💾', {
    singleClick: () => save(),
    doubleClick: () => saveAs(),
    longPress: () => saveAll()
}, {
    label: 'Guardar',
    frameStyle: 'active'
});

// Botón con opciones personalizadas
const deleteBtn = new EmojiActionButton('🗑️', {
    singleClick: () => moveToTrash(),
    doubleClick: () => viewTrash(),
    longPress: () => permanentDelete()
}, {
    doubleClickDelay: 250,      // 250ms entre clicks
    longPressDuration: 2000,    // 2 segundos en lugar de 3
    haptic: true,               // Vibración activada
    showProgress: true,         // Mostrar barra de progreso
    frameStyle: 'critical'      // Marco rojo
});

// Añadir al DOM
document.body.appendChild(homeBtn.element);
document.body.appendChild(saveBtn.element);
document.body.appendChild(deleteBtn.element);
```

## ⚙️ API

### Constructor

```javascript
new EmojiActionButton(emoji, callbacks, options)
```

**Parámetros:**

- `emoji` (string): Emoji Unicode (ej: '🏠', '⚙️', '🗑️')
- `callbacks` (object):
  - `singleClick` (function): Callback para click simple
  - `doubleClick` (function): Callback para doble click
  - `longPress` (function): Callback para press largo
- `options` (object, opcional):
  - `doubleClickDelay` (number): Delay entre clicks en ms (default: 300)
  - `longPressDuration` (number): Duración press largo en ms (default: 3000)
  - `haptic` (boolean): Activar vibración (default: true)
  - `showProgress` (boolean): Mostrar barra de progreso (default: true)
  - `label` (string): Texto debajo del botón (default: null)
  - `frameStyle` (string): Estilo del marco: 'default', 'active', 'pressed', 'critical' (default: 'default')

### Métodos Públicos

```javascript
// Cambiar emoji
btn.setEmoji('❤️');

// Cambiar label
btn.setLabel('Nuevo Texto');

// Cambiar estilo de marco
btn.setFrameStyle('active');  // 'default', 'active', 'pressed', 'critical'

// Habilitar/deshabilitar
btn.enable();
btn.disable();

// Destruir botón
btn.destroy();
```

### Propiedades

```javascript
btn.element     // Elemento DOM (HTMLElement)
btn.button      // Elemento del botón interno (HTMLButtonElement)
btn.emoji       // Emoji actual (string)
btn.callbacks   // Callbacks configurados (object)
btn.options     // Opciones configuradas (object)
```

## 🎨 Estados del Marco

### default
- **Color**: Gris (#6B7280)
- **Uso**: Estado normal, botón inactivo

### active
- **Color**: Verde (#2FBF71)
- **Uso**: Botón activo, seleccionado, éxito

### pressed
- **Color**: Ámbar (#F5B700)
- **Uso**: Mientras se está presionando, pendiente

### critical
- **Color**: Rojo (#E63946)
- **Uso**: Acciones peligrosas, eliminar, error

## 📱 Ejemplos de Uso Real

### Panel de Control

```javascript
const controls = [
    { emoji: '🏠', label: 'Home' },
    { emoji: '📊', label: 'Stats' },
    { emoji: '⚙️', label: 'Config' },
    { emoji: '👤', label: 'Profile' }
];

controls.forEach(config => {
    const btn = new EmojiActionButton(config.emoji, {
        singleClick: () => navigate(config.label),
        doubleClick: () => openInNewTab(config.label),
        longPress: () => showOptions(config.label)
    }, {
        label: config.label,
        frameStyle: 'default'
    });

    document.getElementById('control-panel').appendChild(btn.element);
});
```

### App Launcher (Grid)

```javascript
const apps = [
    '🏠', '📱', '📊', '💬', '📧', '📅',
    '📷', '🎵', '🎮', '🌐', '🔔', '🔒'
];

const grid = document.createElement('div');
grid.className = 'emoji-btn-grid';

apps.forEach(emoji => {
    const btn = new EmojiActionButton(emoji, {
        singleClick: () => launchApp(emoji),
        doubleClick: () => openAppSettings(emoji),
        longPress: () => uninstallApp(emoji)
    });

    grid.appendChild(btn.element);
});

document.body.appendChild(grid);
```

### Gestión de Agentes AI

```javascript
function createAgentButton(agent) {
    return new EmojiActionButton('🤖', {
        singleClick: () => {
            // Ver detalles
            showAgentDetails(agent.id);
        },
        doubleClick: () => {
            // Editar configuración
            editAgent(agent.id);
        },
        longPress: () => {
            // Eliminar agente (sin confirmación)
            if (confirm(`¿Eliminar agente ${agent.name}?`)) {
                deleteAgent(agent.id);
            }
        }
    }, {
        label: agent.name,
        frameStyle: agent.status === 'active' ? 'active' : 'default'
    });
}

// Usar en admin panel
agents.forEach(agent => {
    const btn = createAgentButton(agent);
    agentContainer.appendChild(btn.element);
});
```

### Acciones CRUD

```javascript
const crudButtons = {
    view: new EmojiActionButton('👁️', {
        singleClick: () => viewItem(),
        doubleClick: () => viewFullscreen(),
        longPress: () => viewHistory()
    }, { label: 'Ver' }),

    edit: new EmojiActionButton('✏️', {
        singleClick: () => editItem(),
        doubleClick: () => quickEdit(),
        longPress: () => advancedEdit()
    }, { label: 'Editar' }),

    delete: new EmojiActionButton('🗑️', {
        singleClick: () => moveToTrash(),
        doubleClick: () => viewTrash(),
        longPress: () => permanentDelete()
    }, {
        label: 'Eliminar',
        frameStyle: 'critical',
        longPressDuration: 2000  // 2 segundos
    })
};
```

## 🎭 Casos de Uso

### Single Click (👆)
- Acción principal/más común
- Ver detalles
- Navegar a página
- Abrir menú
- Seleccionar item

### Double Click (👆👆)
- Acción secundaria/alternativa
- Editar
- Abrir en nueva ventana
- Vista rápida
- Toggle estado

### Long Press (👆⏱️)
- Acciones críticas/peligrosas
- Eliminar permanente
- Resetear configuración
- Desinstalar
- Mostrar opciones avanzadas

## 🔧 Personalización CSS

```css
/* Cambiar tamaño del botón */
.emoji-btn {
    width: 44px;   /* En lugar de 38px */
    height: 44px;
    font-size: 24px;  /* Emoji más grande */
}

/* Cambiar colores del marco */
.emoji-btn.frame-custom {
    border-color: #FF6B9D;
    background: rgba(255, 107, 157, 0.1);
}

/* Cambiar barra de progreso */
.emoji-btn-progress {
    height: 5px;  /* Más gruesa */
    background: linear-gradient(90deg, #00FF00, #FF0000);
}

/* Animación personalizada */
@keyframes custom-pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.2) rotate(10deg); }
}

.emoji-btn.custom-feedback {
    animation: custom-pulse 0.5s ease;
}
```

## ♿ Accesibilidad

### ARIA Labels
```javascript
const btn = new EmojiActionButton('🗑️', callbacks, {
    label: 'Eliminar'  // Automáticamente añade aria-label
});
```

### Keyboard Support
Los botones son elementos `<button>` nativos, así que soportan:
- `Enter` / `Space`: Activar
- `Tab`: Navegación
- Screen readers: Completo soporte

### Reduced Motion
```css
@media (prefers-reduced-motion: reduce) {
    .emoji-btn {
        transition: none;
        animation: none;
    }
}
```

## 📊 Especificaciones Técnicas

| Propiedad | Valor | Notas |
|-----------|-------|-------|
| Tamaño visual | 38x38px | Equivalente a 10x10mm |
| Área táctil | 56x56px | Invisible, cumple estándares |
| Double click delay | 300ms | Configurable |
| Long press duration | 3000ms | Configurable |
| Emoji size | 20px | Proporcional al botón |
| Border width | 2px | Visible pero delgado |
| Border radius | 8px | Esquinas suavizadas |
| Progress bar | 3px | Sutil pero visible |

## 🐛 Troubleshooting

### Problema: Los clicks no se detectan
**Solución**: Asegúrate de que no hay overlays o elementos encima del botón.

### Problema: El long press cancela el scroll
**Solución**: El componente usa `{ passive: false }` solo cuando es necesario.

### Problema: La vibración no funciona
**Solución**: La API de vibración solo funciona en HTTPS y no todos los dispositivos la soportan.

### Problema: El botón es demasiado pequeño
**Solución**: Aunque es 38x38px, el área táctil es 56x56px (invisible). Puedes aumentar el tamaño visual en CSS.

## 📄 Licencia

Parte del proyecto Event Core v1.2.0 "Visual Admin"

## 🔗 Ver También

- [UI Components README](./README.md)
- [Admin Panel Module](../modules/admin-panel/)
- [Design System Tokens](../docs/biblioteca_componentes_ui_v1.json)
