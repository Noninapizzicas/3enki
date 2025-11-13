# 📱 Overlay Panel Component

Panel superpuesto semi-transparente que **mantiene visible la pantalla anterior como referencia**. Ideal para ver detalles sin perder contexto.

## 🎯 Características

- ✅ **Fondo semi-transparente**: Ves la pantalla debajo con efecto blur
- ✅ **3 tamaños predefinidos**: Pequeño (320px), Mediano (480px), Grande (640px)
- ✅ **Scroll interno**: Contenido extenso sin problema
- ✅ **Animaciones suaves**: Slide-in desde abajo
- ✅ **Cierre múltiple**: Botón ×, click fuera, tecla ESC
- ✅ **Focus trap**: Navegación con Tab contenida
- ✅ **Responsive**: Full screen en móviles
- ✅ **Stackable**: Hasta 3 overlays apilados
- ✅ **Redimensionable**: Opcional con handle
- ✅ **Accesible**: ARIA labels, keyboard navigation

## 📦 Archivos

```
ui-components/
├── overlay-panel.component.json  # Definición JSON
├── overlay-panel.css             # Estilos completos
├── overlay-panel.js              # Clase JavaScript
├── overlay-panel-demo.html       # Demo interactiva
└── OVERLAY-PANEL-README.md       # Esta documentación
```

## 🚀 Uso Básico

### HTML

```html
<!DOCTYPE html>
<html>
<head>
    <link rel="stylesheet" href="overlay-panel.css">
</head>
<body>
    <button onclick="showDetails()">Ver Detalles</button>

    <script src="overlay-panel.js"></script>
    <script>
        function showDetails() {
            const overlay = new OverlayPanel({
                title: 'Detalles del Agente',
                content: '<p>Información completa aquí</p>',
                size: 'medium'
            });

            overlay.open();
        }
    </script>
</body>
</html>
```

### JavaScript

```javascript
// Overlay simple
const overlay = new OverlayPanel({
    title: 'Mi Panel',
    content: '<div>Contenido HTML</div>',
    size: 'medium' // small, medium, large
});

overlay.open();

// Overlay con footer y botones
const overlay = new OverlayPanel({
    title: 'Editar Configuración',
    content: document.getElementById('config-form'),
    size: 'large',
    showFooter: true,
    footerButtons: [
        {
            label: 'Guardar',
            type: 'primary',
            onClick: () => saveConfig()
        },
        {
            label: 'Cancelar',
            type: 'secondary'
        }
    ]
});

overlay.open();
```

## ⚙️ API

### Constructor

```javascript
new OverlayPanel(options)
```

**Opciones:**

```javascript
{
    title: 'Título del Panel',           // string (requerido)
    content: '<div>HTML</div>',          // string o HTMLElement (requerido)
    size: 'medium',                      // 'small', 'medium', 'large' (default: 'medium')
    closeOnBackdrop: true,               // boolean - Cerrar al click fuera (default: true)
    closeOnEscape: true,                 // boolean - Cerrar con ESC (default: true)
    showFooter: false,                   // boolean (default: false)
    footerButtons: [],                   // array de botones para footer
    onOpen: () => {},                    // callback cuando se abre
    onClose: () => {},                   // callback cuando se cierra
    resizable: false,                    // boolean - Handle de resize (default: false)
    level: 1                             // number - Nivel de apilamiento (default: 1)
}
```

**Footer Buttons:**

```javascript
footerButtons: [
    {
        label: 'Texto del Botón',       // string (requerido)
        type: 'primary',                // 'primary', 'secondary', 'danger' (default: 'secondary')
        onClick: () => {},              // callback function
        closeOnClick: true              // boolean - Cerrar al hacer click (default: true)
    }
]
```

### Métodos Públicos

```javascript
// Abrir overlay
overlay.open();

// Cerrar overlay
overlay.close();

// Cambiar título
overlay.setTitle('Nuevo Título');

// Cambiar contenido
overlay.setContent('<div>Nuevo contenido</div>');
// o con HTMLElement
overlay.setContent(document.getElementById('mi-contenido'));

// Cambiar tamaño
overlay.setSize('large'); // 'small', 'medium', 'large'

// Destruir overlay
overlay.destroy();
```

### Métodos Helper

```javascript
// Overlay de confirmación
const confirm = OverlayPanel.confirm({
    title: '¿Eliminar?',
    message: '¿Estás seguro?',
    danger: true,
    confirmLabel: 'Sí, Eliminar',
    cancelLabel: 'Cancelar',
    onConfirm: () => console.log('Confirmado'),
    onCancel: () => console.log('Cancelado')
});
confirm.open();

// Overlay de información
const info = OverlayPanel.info(
    'Título',
    '<p>Contenido informativo</p>',
    'medium' // size
);
info.open();

// Overlay de detalles con secciones
const details = OverlayPanel.details({
    title: 'Detalles del Agente',
    size: 'medium',
    sections: [
        {
            title: 'Información General',
            items: [
                { label: 'Nombre', value: 'Code Reviewer' },
                { label: 'Estado', value: 'Activo' },
                { label: 'Provider', value: 'DeepSeek' }
            ]
        },
        {
            title: 'Estadísticas',
            items: [
                { label: 'Ejecuciones', value: '1,234' },
                { label: 'Tokens', value: '456,789' }
            ]
        }
    ],
    showFooter: true,
    footerButtons: [
        { label: 'Editar', type: 'primary' },
        { label: 'Cerrar', type: 'secondary' }
    ]
});
details.open();
```

## 📱 Tamaños

| Tamaño | Ancho | Max Height | Uso Ideal |
|--------|-------|------------|-----------|
| Small  | 320px | 50vh       | Confirmaciones, alertas |
| Medium | 480px | 70vh       | Detalles, configuración |
| Large  | 640px | 85vh       | Edición, contenido extenso |

**Responsive:**
- En móviles (< 768px): Full width, slide desde abajo

## 🎨 Estilos Personalizados

### CSS Variables

```css
.overlay-panel {
    --overlay-backdrop-bg: rgba(0, 0, 0, 0.7);
    --overlay-backdrop-blur: 6px;
    --overlay-panel-bg: #1a1d24;
    --overlay-border-color: #374151;
}
```

### Clases CSS Helper

```html
<!-- Secciones de contenido -->
<div class="overlay-section">
    <div class="overlay-section-title">Título</div>
    <!-- contenido -->
</div>

<!-- Grid de información -->
<div class="overlay-info-grid">
    <div class="overlay-info-item">
        <div class="overlay-info-label">Label</div>
        <div class="overlay-info-value">Value</div>
    </div>
</div>

<!-- Código -->
<div class="overlay-code">
    { "code": "here" }
</div>

<!-- Lista -->
<ul class="overlay-list">
    <li class="overlay-list-item">Item 1</li>
    <li class="overlay-list-item">Item 2</li>
</ul>
```

## 💡 Integración con Emoji Action Button

```javascript
// Emoji button que abre overlay con detalles
const agentBtn = new EmojiActionButton('🤖', {
    singleClick: () => {
        // Ver detalles en overlay
        const overlay = OverlayPanel.details({
            title: 'Code Reviewer Agent',
            sections: [
                {
                    title: 'Info',
                    items: [
                        { label: 'Estado', value: 'Activo' },
                        { label: 'Provider', value: 'DeepSeek' }
                    ]
                }
            ]
        });
        overlay.open();
    },
    doubleClick: () => {
        // Editar en overlay grande
        const overlay = new OverlayPanel({
            title: 'Editar Agente',
            content: '<form>...</form>',
            size: 'large'
        });
        overlay.open();
    },
    longPress: () => {
        // Confirmar eliminación
        const confirm = OverlayPanel.confirm({
            title: '¿Eliminar Agente?',
            message: 'Esta acción no se puede deshacer',
            danger: true,
            onConfirm: () => deleteAgent()
        });
        confirm.open();
    }
}, {
    label: 'Agent'
});
```

## 🔥 Casos de Uso

### 1. Detalles de Agente AI

```javascript
function viewAgentDetails(agentId) {
    fetch(`/api/agents/${agentId}`)
        .then(r => r.json())
        .then(agent => {
            const overlay = OverlayPanel.details({
                title: agent.name,
                sections: [
                    {
                        title: 'General',
                        items: [
                            { label: 'ID', value: agent.id },
                            { label: 'Estado', value: agent.status },
                            { label: 'Provider', value: agent.provider }
                        ]
                    },
                    {
                        title: 'Config',
                        items: [
                            { label: 'Subscribes', value: agent.subscribes.join(', ') },
                            { label: 'Timeout', value: `${agent.timeout}ms` }
                        ]
                    }
                ],
                showFooter: true,
                footerButtons: [
                    {
                        label: 'Editar',
                        type: 'primary',
                        onClick: () => editAgent(agentId)
                    },
                    { label: 'Cerrar', type: 'secondary' }
                ]
            });
            overlay.open();
        });
}
```

### 2. Editor de Prompt

```javascript
function editPrompt(promptId) {
    const overlay = new OverlayPanel({
        title: 'Editar Prompt',
        content: `
            <div class="overlay-section">
                <label>Contenido:</label>
                <textarea id="prompt-content" style="width: 100%; height: 300px;">
                    ${currentPrompt.content}
                </textarea>
            </div>
        `,
        size: 'large',
        resizable: true,
        showFooter: true,
        footerButtons: [
            {
                label: 'Guardar',
                type: 'primary',
                onClick: () => {
                    const content = document.getElementById('prompt-content').value;
                    savePrompt(promptId, content);
                }
            },
            {
                label: 'Preview',
                type: 'secondary',
                closeOnClick: false,
                onClick: () => previewPrompt()
            },
            { label: 'Cancelar', type: 'secondary' }
        ]
    });

    overlay.open();
}
```

### 3. Confirmación de Eliminación

```javascript
function confirmDelete(itemType, itemId) {
    const confirm = OverlayPanel.confirm({
        title: `¿Eliminar ${itemType}?`,
        message: `Esta acción no se puede deshacer. El ${itemType} será eliminado permanentemente.`,
        danger: true,
        confirmLabel: 'Sí, Eliminar',
        cancelLabel: 'Cancelar',
        onConfirm: () => {
            deleteItem(itemType, itemId)
                .then(() => {
                    const success = OverlayPanel.info(
                        'Eliminado',
                        `${itemType} eliminado exitosamente.`,
                        'small'
                    );
                    success.open();
                });
        }
    });

    confirm.open();
}
```

### 4. Overlays Apilados

```javascript
// Nivel 1: Lista de agentes
const listOverlay = new OverlayPanel({
    title: 'Agentes AI',
    content: generateAgentList(),
    size: 'medium',
    level: 1
});
listOverlay.open();

// Nivel 2: Detalles de agente (abierto desde Nivel 1)
const detailsOverlay = new OverlayPanel({
    title: 'Detalles',
    content: generateDetails(),
    size: 'medium',
    level: 2
});
detailsOverlay.open();

// Nivel 3: Editar (abierto desde Nivel 2)
const editOverlay = new OverlayPanel({
    title: 'Editar',
    content: generateEditForm(),
    size: 'small',
    level: 3
});
editOverlay.open();
```

## ♿ Accesibilidad

### Focus Trap
El focus queda contenido dentro del overlay mientras está abierto.

### Keyboard Navigation
- `Tab` / `Shift+Tab`: Navegar entre elementos
- `ESC`: Cerrar overlay
- `Enter`: Activar botón enfocado

### ARIA Labels
```javascript
// Automáticamente añade aria-label al botón de cerrar
<button aria-label="Cerrar">×</button>
```

### Screen Readers
Todos los elementos son accesibles para lectores de pantalla.

## 🎭 Animaciones

### Entrada
- Backdrop: Fade in (300ms)
- Panel: Slide in desde abajo + scale (300ms)

### Salida
- Backdrop: Fade out (200ms)
- Panel: Slide out hacia abajo + scale (200ms)

### Móvil
- Slide desde el bottom (like bottom sheet)

### Reduced Motion
```css
@media (prefers-reduced-motion: reduce) {
    /* Sin animaciones */
}
```

## 🐛 Troubleshooting

### El overlay no se ve
**Solución**: Asegúrate de llamar a `.open()` después de crear el overlay.

### El backdrop no hace blur
**Solución**: Algunos navegadores no soportan `backdrop-filter`. Es un progressive enhancement.

### El scroll del body no se bloquea
**Solución**: La clase `overlay-active` se añade automáticamente a `<body>`, verifica que no la estés removiendo.

### El overlay no se cierra con ESC
**Solución**: Asegúrate de que `closeOnEscape: true` (es el default).

## 📊 Especificaciones Técnicas

| Propiedad | Valor |
|-----------|-------|
| Z-index base | 1000 |
| Backdrop opacity | 0.6 |
| Backdrop blur | 4px |
| Panel border radius | 16px |
| Header height | 56px |
| Animation duration | 300ms (in), 200ms (out) |
| Max overlays stacked | 3 niveles |

## 🔗 Ver También

- [Emoji Action Button](./EMOJI-BUTTON-README.md) - Para triggers compactos
- [Admin Panel Module](../modules/admin-panel/) - Uso en panel de admin
- [UI Components README](./README.md) - Sistema completo

---

**Event Core v1.2.0 "Visual Admin"**
Panel superpuesto que mantiene el contexto visual
