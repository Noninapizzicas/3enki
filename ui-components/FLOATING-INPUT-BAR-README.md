# 📝 Floating Input Bar Component

Barra de entrada de texto flotante de **ancho completo** (20mm de alto) con botón de acción de **10x10mm** en el lado derecho. Ideal para búsquedas globales, chat inputs, comandos rápidos y captura de texto.

## 🎯 Características

- ✅ **Dimensiones exactas**: 20mm alto (76px), botón 10x10mm (38px)
- ✅ **Ancho completo**: Responsive, se adapta al viewport
- ✅ **Flotante**: Position fixed en bottom, siempre accesible
- ✅ **Draggable**: Arrastra para reposicionar verticalmente
- ✅ **Semi-transparente**: Blur backdrop, ves contenido debajo
- ✅ **Voice Integration**: Reconocimiento de voz opcional (Web Speech API)
- ✅ **Keyboard shortcuts**: Enter para enviar, ESC para limpiar
- ✅ **Persistencia**: Recuerda posición en localStorage
- ✅ **Variants**: Search, Chat, Compact, Default
- ✅ **Callbacks**: onSubmit, onChange, onFocus, onBlur, etc.
- ✅ **Responsive**: Móvil, tablet, desktop
- ✅ **Accesible**: ARIA labels, keyboard navigation

## 📦 Archivos

```
ui-components/
├── floating-input-bar.component.json  # Definición JSON
├── floating-input-bar.css             # Estilos completos
├── floating-input-bar.js              # Clase JavaScript
├── floating-input-bar-demo.html       # Demo interactiva
└── FLOATING-INPUT-BAR-README.md       # Esta documentación
```

## 🚀 Uso Básico

### HTML

```html
<!DOCTYPE html>
<html>
<head>
    <link rel="stylesheet" href="floating-input-bar.css">
</head>
<body>
    <script src="floating-input-bar.js"></script>
    <script>
        const inputBar = new FloatingInputBar({
            placeholder: 'Escribe algo...',
            onSubmit: (value) => {
                console.log('Enviado:', value);
            }
        });
    </script>
</body>
</html>
```

### JavaScript

```javascript
// Input bar básica
const inputBar = new FloatingInputBar({
    placeholder: 'Escribe algo...',
    buttonEmoji: '➤',
    onSubmit: (value) => {
        console.log('Valor:', value);
    }
});

// Con reconocimiento de voz
const voiceBar = new FloatingInputBar({
    placeholder: 'Habla o escribe...',
    voiceEnabled: true,
    voiceLanguage: 'es-ES',
    onSubmit: (value) => {
        console.log('Mensaje:', value);
    }
});

// Métodos
inputBar.getValue();           // Obtener texto
inputBar.setValue('Hola');     // Establecer texto
inputBar.clear();              // Limpiar
inputBar.focus();              // Focus
inputBar.show();               // Mostrar
inputBar.hide();               // Ocultar
inputBar.destroy();            // Destruir
```

## ⚙️ API

### Constructor

```javascript
new FloatingInputBar(options)
```

**Opciones:**

```javascript
{
    // Input
    placeholder: 'Escribe algo...',     // Placeholder del input
    maxLength: 500,                     // Longitud máxima
    initialValue: '',                   // Valor inicial
    clearOnSubmit: true,                // Limpiar después de enviar
    submitOnEnter: true,                // Enter para enviar
    escToClear: true,                   // ESC para limpiar

    // Botón
    buttonEmoji: '➤',                   // Emoji del botón
    buttonTooltip: 'Enviar',            // Tooltip del botón
    buttonAction: 'submit',             // 'submit', 'voice', 'search', 'custom'

    // Voice integration
    voiceEnabled: false,                // Habilitar reconocimiento de voz
    voiceLanguage: 'es-ES',             // Idioma para reconocimiento
    voiceContinuous: false,             // Modo continuo

    // Posición
    position: 'bottom',                 // 'bottom' o 'top'
    draggable: true,                    // Permitir drag & drop
    rememberPosition: true,             // Guardar posición
    storageKey: 'input-bar-pos',        // Key para localStorage

    // Visual
    variant: 'default',                 // 'default', 'search', 'chat', 'compact'
    showHandle: true,                   // Mostrar handle de drag
    showCounter: false,                 // Mostrar contador de caracteres
    showTooltip: true,                  // Mostrar tooltips

    // Comportamiento
    autoFocus: false,                   // Auto-focus al cargar
    autoHide: false,                    // Auto-hide al hacer scroll
    loading: false,                     // Estado inicial de loading

    // Callbacks
    onSubmit: (value) => {},            // Callback al enviar
    onChange: (value) => {},            // Callback al cambiar valor
    onFocus: () => {},                  // Callback al hacer focus
    onBlur: () => {},                   // Callback al perder focus
    onVoiceStart: () => {},             // Callback al iniciar voz
    onVoiceEnd: (value) => {},          // Callback al terminar voz
    onError: (error) => {}              // Callback de errores
}
```

### Métodos Públicos

```javascript
// Obtener/Establecer valor
inputBar.getValue()                 // string - Obtener texto actual
inputBar.setValue(value)            // void - Establecer texto
inputBar.clear()                    // void - Limpiar input

// Focus
inputBar.focus()                    // void - Focus en input
inputBar.blur()                     // void - Blur del input

// Visibilidad
inputBar.show()                     // void - Mostrar barra
inputBar.hide()                     // void - Ocultar barra
inputBar.toggle()                   // void - Toggle visibilidad

// Voice (si voiceEnabled: true)
inputBar.toggleVoice()              // void - Toggle reconocimiento

// Estado
inputBar.setLoading(true|false)     // void - Activar/desactivar loading

// Gestión
inputBar.destroy()                  // void - Destruir componente
```

## 🎭 Casos de Uso

### 1. Búsqueda Global

```javascript
const searchBar = new FloatingInputBar({
    placeholder: '🔍 Buscar en toda la app...',
    buttonEmoji: '🔍',
    buttonTooltip: 'Buscar',
    variant: 'search',
    clearOnSubmit: false,
    onSubmit: (query) => {
        // Mostrar loading
        searchBar.setLoading(true);

        // Buscar
        performSearch(query).then(results => {
            showResults(results);
            searchBar.setLoading(false);
        });
    }
});
```

### 2. Chat Input

```javascript
const chatBar = new FloatingInputBar({
    placeholder: '💬 Escribe un mensaje...',
    buttonEmoji: '📤',
    buttonTooltip: 'Enviar',
    variant: 'chat',
    maxLength: 1000,
    showCounter: true,
    clearOnSubmit: true,
    onSubmit: (message) => {
        sendMessage(message);

        // Simular respuesta
        setTimeout(() => {
            showBotResponse('Mensaje recibido!');
        }, 1000);
    }
});
```

### 3. AI Chat Interface

```javascript
const aiChat = new FloatingInputBar({
    placeholder: '🤖 Pregúntame lo que quieras...',
    buttonEmoji: '✨',
    voiceEnabled: true,
    voiceLanguage: 'es-ES',
    maxLength: 2000,
    showCounter: true,
    onSubmit: async (prompt) => {
        aiChat.setLoading(true);

        // Llamar a AI
        const response = await callAI(prompt);

        displayAIResponse(response);
        aiChat.setLoading(false);
    },
    onVoiceEnd: (transcript) => {
        console.log('Transcrito:', transcript);
    }
});
```

### 4. Comandos Rápidos

```javascript
const commandBar = new FloatingInputBar({
    placeholder: '> Comando...',
    buttonEmoji: '⚡',
    clearOnSubmit: true,
    onSubmit: (command) => {
        executeCommand(command);
    }
});

function executeCommand(cmd) {
    const parts = cmd.toLowerCase().trim().split(' ');
    const action = parts[0];

    switch (action) {
        case 'open':
            openApp(parts[1]);
            break;
        case 'search':
            searchFor(parts.slice(1).join(' '));
            break;
        case 'goto':
            navigateTo(parts[1]);
            break;
        default:
            console.log('Comando no reconocido:', cmd);
    }
}
```

### 5. Notas Rápidas con Voz

```javascript
const quickNotes = new FloatingInputBar({
    placeholder: '📝 Nota rápida (texto o voz)...',
    buttonEmoji: '💾',
    voiceEnabled: true,
    voiceContinuous: true,
    maxLength: 5000,
    clearOnSubmit: true,
    onSubmit: (note) => {
        saveNote(note);
        showToast('✓ Nota guardada');
    },
    onVoiceStart: () => {
        console.log('Dictando nota...');
    }
});

function saveNote(text) {
    const notes = JSON.parse(localStorage.getItem('notes') || '[]');
    notes.push({
        text,
        timestamp: new Date().toISOString()
    });
    localStorage.setItem('notes', JSON.stringify(notes));
}
```

### 6. Feedback/Comentarios

```javascript
const feedbackBar = new FloatingInputBar({
    placeholder: '💭 Déjanos tu feedback...',
    buttonEmoji: '📬',
    maxLength: 500,
    showCounter: true,
    onSubmit: async (feedback) => {
        feedbackBar.setLoading(true);

        try {
            await submitFeedback(feedback);
            showSuccess('¡Gracias por tu feedback!');
        } catch (error) {
            showError('Error al enviar feedback');
        } finally {
            feedbackBar.setLoading(false);
        }
    }
});
```

### 7. URL/Link Input

```javascript
const urlBar = new FloatingInputBar({
    placeholder: '🔗 Pega un enlace...',
    buttonEmoji: '🔗',
    clearOnSubmit: true,
    onSubmit: (url) => {
        if (isValidURL(url)) {
            openURL(url);
        } else {
            urlBar.element.classList.add('error');
            setTimeout(() => {
                urlBar.element.classList.remove('error');
            }, 400);
        }
    }
});

function isValidURL(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}
```

### 8. Multi-idioma con Voz

```javascript
const multiLangBar = new FloatingInputBar({
    placeholder: 'Type or speak...',
    voiceEnabled: true,
    voiceLanguage: 'en-US',
    buttonEmoji: '🌐',
    onSubmit: (text) => {
        processText(text, currentLanguage);
    }
});

// Cambiar idioma dinámicamente
function switchLanguage(lang) {
    multiLangBar.destroy();

    multiLangBar = new FloatingInputBar({
        placeholder: lang === 'es' ? 'Escribe o habla...' : 'Type or speak...',
        voiceEnabled: true,
        voiceLanguage: lang === 'es' ? 'es-ES' : 'en-US',
        buttonEmoji: '🌐',
        onSubmit: (text) => processText(text, lang)
    });
}
```

## 🎨 Variants (Variantes)

### Default

```javascript
variant: 'default'  // Estilo estándar
```

### Search

```javascript
variant: 'search'   // Optimizado para búsqueda
```

### Chat

```javascript
variant: 'chat'     // Bordes redondeados para chat
```

### Compact

```javascript
variant: 'compact'  // Versión más pequeña (56px)
```

## 🔗 Integración con Otros Componentes

### Con Floating Topbar

```javascript
// Topbar con botón que activa el input bar
const topbar = new FloatingTopbar({
    align: 'center',
    buttons: [
        {
            emoji: '🔍',
            tooltip: 'Buscar',
            onClick: () => {
                inputBar.show();
                inputBar.focus();
            }
        }
    ]
});

const inputBar = new FloatingInputBar({
    placeholder: '🔍 Buscar...',
    autoFocus: false
});
```

### Con Overlay Panel

```javascript
const inputBar = new FloatingInputBar({
    placeholder: 'Buscar...',
    onSubmit: (query) => {
        // Mostrar resultados en overlay
        const overlay = new OverlayPanel({
            title: `Resultados: "${query}"`,
            content: generateResults(query),
            size: 'large'
        });
        overlay.open();
    }
});
```

### Con Emoji Action Button

```javascript
// Usar EmojiActionButton personalizado como botón
const inputBar = new FloatingInputBar({
    placeholder: 'Mensaje...',
    // El botón por defecto se puede reemplazar con lógica personalizada
});

// Single click: Enviar
// Double click: Limpiar
// Long press: Activar voz
```

## 📱 Responsive

### Mobile (< 768px)

- Width: `calc(100vw - 16px)`
- Bottom: `12px`
- Button: `44x44px` (área táctil ampliada)
- Font-size: `16px` (previene zoom en iOS)

### Tablet (769px - 1024px)

- Max-width: `700px`
- Centrado horizontalmente

### Desktop (> 1025px)

- Max-width: `600px`
- Handle visible al hover

## ♿ Accesibilidad

### ARIA Labels

```javascript
// El input incluye aria-label automáticamente
<input aria-label="Escribe algo...">

// El botón incluye aria-label
<button aria-label="Enviar">➤</button>
```

### Keyboard Navigation

- `Tab`: Focus en input
- `Enter`: Submit
- `Escape`: Clear
- `Tab` desde input: Focus en botón

### Screen Readers

Todos los elementos tienen labels descriptivos para lectores de pantalla.

## 🎨 Personalización CSS

### Variables CSS

```css
:root {
    --floating-input-bar-height: 76px;
    --floating-input-bar-button-size: 38px;
    --floating-input-bar-bg: rgba(26, 29, 36, 0.9);
    --floating-input-bar-border: rgba(55, 65, 81, 0.5);
    --floating-input-bar-text: #e5e7eb;
    --floating-input-bar-focus: #2FBF71;
    --floating-input-bar-blur: 8px;
}
```

### Clases Helper

```css
/* Estado de focus */
.floating-input-bar.focus {
    border-color: var(--floating-input-bar-focus);
}

/* Estado de loading */
.floating-input-bar.loading .floating-input-bar-button {
    /* Spinner animado */
}

/* Dragging */
.floating-input-bar.dragging {
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6);
}
```

## 🔐 Permisos (Voice)

Si usas `voiceEnabled: true`, el navegador pedirá permiso para usar el micrófono.

**HTTPS Requerido**: En producción, tu sitio debe usar HTTPS (localhost está exento).

```javascript
const voiceBar = new FloatingInputBar({
    voiceEnabled: true,
    onError: (error) => {
        if (error === 'not-allowed') {
            alert('Por favor, permite el acceso al micrófono');
        }
    }
});
```

## 🐛 Troubleshooting

### La barra no aparece

**Solución**: La barra se crea con `position: fixed` y se añade al `body`. Verifica que no haya CSS que interfiera.

### El drag no funciona

**Solución**: Asegúrate de que `draggable: true` y `showHandle: true` estén activados.

### El voice no funciona

**Solución**:
1. Verifica que el navegador soporte Web Speech API
2. Asegúrate de estar en HTTPS
3. Verifica que diste permiso al micrófono

### La posición no se guarda

**Solución**: Verifica que `rememberPosition: true` y que localStorage esté disponible.

### El botón no responde

**Solución**: Verifica que el callback `onSubmit` esté definido correctamente.

## 📊 Especificaciones Técnicas

| Propiedad | Valor |
|-----------|-------|
| Altura | 76px (20mm) |
| Ancho | calc(100vw - 32px) |
| Max-width (desktop) | 600px |
| Button size | 38px (10mm) |
| Z-index | 950 |
| Background opacity | 0.9 |
| Backdrop blur | 8px |
| Border radius | 16px |
| Bottom offset | 16px |

## 🎯 Mejores Prácticas

1. **Usa clearOnSubmit: true** para inputs de chat/comandos
2. **Usa clearOnSubmit: false** para búsquedas
3. **Activa showCounter** para inputs con límite visible
4. **Usa variant: 'chat'** para interfaces de mensajería
5. **Activa voiceEnabled** para accesibilidad mejorada
6. **Proporciona feedback visual** en los callbacks (loading, success, error)
7. **Usa placeholder descriptivo** que indique la acción
8. **Maneja errores** con mensajes claros al usuario
9. **Prueba en mobile** (touch targets, zoom, teclado virtual)
10. **Usa HTTPS** si habilitas reconocimiento de voz

## 🔗 Ver También

- [Voice Input](./VOICE-INPUT-README.md) - Reconocimiento de voz standalone
- [Floating Topbar](./FLOATING-TOPBAR-README.md) - Barra superior flotante
- [Emoji Action Button](./EMOJI-BUTTON-README.md) - Botones emoji multi-touch
- [Overlay Panel](./OVERLAY-PANEL-README.md) - Paneles superpuestos

---

**Event Core v1.2.0 "Visual Admin"**
Barra de entrada flotante para captura rápida de texto
