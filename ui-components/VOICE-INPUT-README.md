# 🎤 Voice Input Component

Input de texto con reconocimiento de voz (Speech-to-Text) mediante **Web Speech API**. Convierte tu voz en texto automáticamente con soporte multi-idioma y feedback visual en tiempo real.

## 🎯 Características

- ✅ **Web Speech API**: Reconocimiento de voz nativo del navegador
- ✅ **Multi-idioma**: Soporte para 9 idiomas (español, inglés, portugués, francés, alemán, italiano)
- ✅ **Tiempo Real**: Resultados provisionales mientras hablas (interim results)
- ✅ **Modo Continuo**: Escucha continua sin parar después de cada frase
- ✅ **Visual Feedback**: Animaciones de ondas, indicadores de estado, efectos visuales
- ✅ **Auto-activación**: Opcional al hacer focus en el input
- ✅ **Input o Textarea**: Soporte para campos cortos o largos
- ✅ **Edición Manual**: Permite escribir a mano además de dictar
- ✅ **Responsive**: Funciona en móvil y escritorio
- ✅ **Accesible**: ARIA labels, keyboard navigation
- ✅ **Sin Dependencias**: No requiere librerías externas

## 📦 Archivos

```
ui-components/
├── voice-input.component.json  # Definición JSON
├── voice-input.css             # Estilos completos
├── voice-input.js              # Clase JavaScript (Web Speech API)
├── voice-input-demo.html       # Demo interactiva
└── VOICE-INPUT-README.md       # Esta documentación
```

## 🚀 Uso Básico

### HTML

```html
<!DOCTYPE html>
<html>
<head>
    <link rel="stylesheet" href="voice-input.css">
</head>
<body>
    <div id="my-voice-input"></div>

    <script src="voice-input.js"></script>
    <script>
        const voiceInput = new VoiceInput('#my-voice-input');
    </script>
</body>
</html>
```

### JavaScript

```javascript
// Voice Input básico
const voiceInput = new VoiceInput('#container', {
    language: 'es-ES',
    placeholder: 'Presiona 🎤 para hablar...'
});

// Obtener valor
const text = voiceInput.getValue();
console.log('Texto:', text);

// Establecer valor
voiceInput.setValue('Hola mundo');

// Limpiar
voiceInput.clear();

// Resetear
voiceInput.reset();
```

## ⚙️ API

### Constructor

```javascript
new VoiceInput(container, options)
```

**Parámetros:**

- `container`: String (selector CSS) o HTMLElement
- `options`: Objeto de configuración (opcional)

**Opciones:**

```javascript
{
    // Configuración de idioma
    language: 'es-ES',              // Idioma por defecto

    // Comportamiento del reconocimiento
    continuous: false,              // true = no para después de cada frase
    interimResults: true,           // true = muestra resultados mientras hablas
    maxLength: 5000,                // Longitud máxima del texto

    // UI
    placeholder: 'Texto...',        // Placeholder del input
    textarea: false,                // true = textarea, false = input
    showLanguageSelector: true,     // Mostrar selector de idiomas
    showClearButton: true,          // Mostrar botón de limpiar
    showWaveform: true,             // Mostrar animación de ondas

    // Auto-activación
    autoActivateOnFocus: false,     // Auto-activar micrófono al focus

    // Callbacks
    onResult: (data) => {},         // Callback con resultados
    onStart: () => {},              // Callback al iniciar
    onEnd: (text) => {},            // Callback al terminar
    onError: (error, msg) => {}     // Callback de errores
}
```

### Métodos Públicos

```javascript
// Control del micrófono
voiceInput.startListening()         // Iniciar escucha
voiceInput.stopListening()          // Detener escucha
voiceInput.toggleListening()        // Toggle on/off

// Gestión del valor
voiceInput.getValue()               // Obtener texto actual
voiceInput.setValue(text)           // Establecer texto
voiceInput.clear()                  // Limpiar texto

// Configuración
voiceInput.setLanguage('en-US')     // Cambiar idioma

// Estado
voiceInput.reset()                  // Resetear componente
voiceInput.destroy()                // Destruir componente
```

### Callbacks

```javascript
// onResult: Se ejecuta cuando hay nuevos resultados
onResult: (data) => {
    console.log('Final:', data.final);      // Texto final confirmado
    console.log('Interim:', data.interim);  // Texto provisional
    console.log('Complete:', data.complete); // true si es resultado final
}

// onStart: Se ejecuta al activar el micrófono
onStart: () => {
    console.log('Micrófono activado');
}

// onEnd: Se ejecuta al desactivar el micrófono
onEnd: (finalText) => {
    console.log('Texto final:', finalText);
}

// onError: Se ejecuta cuando hay un error
onError: (errorCode, errorMessage) => {
    console.error('Error:', errorCode, errorMessage);
    // Errores posibles:
    // - 'no-speech': No se detectó voz
    // - 'audio-capture': Micrófono no disponible
    // - 'not-allowed': Permiso denegado
    // - 'network': Error de red
    // - 'aborted': Reconocimiento cancelado
}
```

## 🌐 Idiomas Soportados

```javascript
const languages = {
    'es-ES': 'Español (España)',
    'es-MX': 'Español (México)',
    'es-AR': 'Español (Argentina)',
    'en-US': 'English (US)',
    'en-GB': 'English (UK)',
    'pt-BR': 'Português (Brasil)',
    'fr-FR': 'Français',
    'de-DE': 'Deutsch',
    'it-IT': 'Italiano'
};

// Cambiar idioma dinámicamente
voiceInput.setLanguage('en-US');
```

## 🎭 Casos de Uso

### 1. Búsqueda por Voz

```javascript
const searchInput = new VoiceInput('#search', {
    placeholder: '🔍 Buscar... (Presiona 🎤 para hablar)',
    continuous: false,
    onResult: (data) => {
        if (data.complete) {
            performSearch(data.final);
        }
    }
});

function performSearch(query) {
    console.log('Buscando:', query);
    // Tu lógica de búsqueda aquí
}
```

### 2. Notas Rápidas

```javascript
const notesInput = new VoiceInput('#notes', {
    textarea: true,
    continuous: true,
    placeholder: 'Tus notas...',
    onResult: (data) => {
        // Auto-guardar mientras hablas
        autoSaveNote(data.final);
    }
});

function autoSaveNote(text) {
    localStorage.setItem('note', text);
}
```

### 3. Transcripción de Reuniones

```javascript
const transcriptionInput = new VoiceInput('#transcription', {
    textarea: true,
    continuous: true,
    interimResults: true,
    onStart: () => {
        console.log('Transcripción iniciada:', new Date());
        startTimer();
    },
    onResult: (data) => {
        updateWordCount(data.final);
    },
    onEnd: (finalText) => {
        console.log('Transcripción finalizada');
        saveTranscription(finalText);
    }
});
```

### 4. Formulario con Dictado

```javascript
const formInput = new VoiceInput('#message', {
    placeholder: 'Tu mensaje...',
    textarea: true,
    continuous: false,
    onResult: (data) => {
        if (data.complete) {
            validateMessage(data.final);
        }
    }
});

function validateMessage(text) {
    if (text.length < 10) {
        alert('El mensaje es demasiado corto');
    }
}
```

### 5. Comandos por Voz

```javascript
const commandInput = new VoiceInput('#commands', {
    placeholder: 'Di un comando...',
    continuous: false,
    onResult: (data) => {
        if (data.complete) {
            executeCommand(data.final);
        }
    }
});

function executeCommand(command) {
    const cmd = command.toLowerCase().trim();

    if (cmd.includes('abrir configuración')) {
        openSettings();
    } else if (cmd.includes('guardar')) {
        save();
    } else if (cmd.includes('ayuda')) {
        showHelp();
    }
}
```

### 6. Auto-activar al Focus

```javascript
const quickInput = new VoiceInput('#quick-input', {
    placeholder: 'Click para hablar...',
    autoActivateOnFocus: true,  // Auto-activa el micro al hacer click
    continuous: false
});

// El micrófono se activa automáticamente cuando el usuario
// hace click en el input (sin necesidad de presionar botón)
```

### 7. Multi-idioma Dinámico

```javascript
const multiLangInput = new VoiceInput('#multi-lang', {
    language: 'es-ES',
    showLanguageSelector: true
});

// El usuario puede cambiar el idioma con el botón 🌐
// O cambiar programáticamente:
document.getElementById('btn-english').addEventListener('click', () => {
    multiLangInput.setLanguage('en-US');
});

document.getElementById('btn-spanish').addEventListener('click', () => {
    multiLangInput.setLanguage('es-ES');
});
```

### 8. Integración con Overlay Panel

```javascript
// Crear un overlay con voice input para notas rápidas
function openVoiceNoteOverlay() {
    const overlay = new OverlayPanel({
        title: '🎤 Nota de Voz',
        content: '<div id="voice-note-container"></div>',
        size: 'medium',
        onOpen: () => {
            // Crear voice input dentro del overlay
            const voiceNote = new VoiceInput('#voice-note-container', {
                textarea: true,
                continuous: true,
                placeholder: 'Presiona 🎤 y dicta tu nota...',
                onResult: (data) => {
                    console.log('Nota:', data.final);
                }
            });
        }
    });

    overlay.open();
}
```

### 9. Estadísticas en Tiempo Real

```javascript
const statsInput = new VoiceInput('#stats-input', {
    textarea: true,
    continuous: true,
    onResult: (data) => {
        updateStats(data.final);
    }
});

function updateStats(text) {
    const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
    const chars = text.length;
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;

    document.getElementById('word-count').textContent = words;
    document.getElementById('char-count').textContent = chars;
    document.getElementById('sentence-count').textContent = sentences;
}
```

## 🎨 Personalización CSS

### Variables CSS

```css
:root {
    --voice-input-bg: #1a1d24;
    --voice-input-border: #374151;
    --voice-input-text: #e5e7eb;
    --voice-input-placeholder: #6b7280;
    --voice-input-focus: #2FBF71;
    --voice-input-listening: #E63946;
    --voice-input-success: #2FBF71;
    --voice-input-error: #F59E0B;
}
```

### Clases Helper

```css
/* Wrapper en estado listening */
.voice-input-wrapper.listening {
    border-color: var(--voice-input-listening);
    animation: pulse-border 1.5s ease-in-out infinite;
}

/* Botón de micro activo */
.voice-btn-mic.listening {
    background: var(--voice-btn-active);
    animation: pulse-button 1.5s ease-in-out infinite;
}

/* Waveform animado */
.voice-waveform.active {
    opacity: 1;
}
```

## 🌐 Soporte de Navegadores

| Navegador | Soporte | Notas |
|-----------|---------|-------|
| Chrome | ✅ | Completo |
| Edge | ✅ | Completo |
| Safari | ✅ | Completo (webkit prefix) |
| Firefox | ❌ | No soportado nativamente |
| Mobile Chrome | ✅ | Completo |
| Mobile Safari | ✅ | Completo |

### Detección de Soporte

```javascript
const voiceInput = new VoiceInput('#container');

if (!voiceInput.isSupported) {
    console.warn('Tu navegador no soporta Speech Recognition');
    // Mostrar mensaje al usuario
}
```

## 🔐 Permisos

El navegador solicitará permiso para usar el micrófono la primera vez que se activa el reconocimiento.

**HTTPS Requerido**: En producción, tu sitio debe usar HTTPS para que funcione el micrófono (excepto en localhost).

```javascript
// Manejo de permiso denegado
const voiceInput = new VoiceInput('#container', {
    onError: (error, message) => {
        if (error === 'not-allowed') {
            alert('Por favor, permite el acceso al micrófono en la configuración del navegador');
        }
    }
});
```

## ♿ Accesibilidad

### ARIA Labels

```javascript
// Los botones incluyen aria-label automáticamente
<button aria-label="Activar reconocimiento de voz">🎤</button>
<button aria-label="Limpiar texto">🗑️</button>
<button aria-label="Selector de idioma">🌐</button>
```

### Keyboard Navigation

- `Tab`: Navegar entre botones
- `Enter` / `Space`: Activar botón
- Input acepta entrada de teclado normal

### Reducción de Movimiento

```css
@media (prefers-reduced-motion: reduce) {
    .voice-input-wrapper,
    .voice-btn,
    .voice-waveform {
        animation: none;
        transition: none;
    }
}
```

## 📱 Responsive

### Desktop
- Input de ancho completo con botones a la derecha
- Waveform visible
- Tooltips en hover

### Mobile
- Input optimizado para touch (font-size: 16px para prevenir zoom en iOS)
- Botones táctiles de 44x44px
- Waveform responsivo

```css
@media (max-width: 768px) {
    .voice-input-field {
        font-size: 16px; /* Prevenir zoom automático en iOS */
    }

    .voice-btn {
        width: 44px;
        height: 44px;
    }
}
```

## 🎭 Animaciones

### Pulse Border (mientras escucha)

```css
@keyframes pulse-border {
    0%, 100% {
        box-shadow: 0 0 0 3px rgba(230, 57, 70, 0.4);
    }
    50% {
        box-shadow: 0 0 0 6px rgba(230, 57, 70, 0.4);
    }
}
```

### Pulse Button (botón de micro activo)

```css
@keyframes pulse-button {
    0%, 100% {
        transform: scale(1);
        box-shadow: 0 0 0 0 rgba(230, 57, 70, 0.7);
    }
    50% {
        transform: scale(1.05);
        box-shadow: 0 0 0 8px rgba(230, 57, 70, 0);
    }
}
```

### Waveform (ondas de audio)

```css
@keyframes wave {
    0%, 100% {
        height: 8px;
    }
    50% {
        height: 20px;
    }
}
```

## 🔧 Integración con Otros Componentes

### Con Floating Topbar

```javascript
// Añadir botón de voz en topbar que abre overlay con voice input
const topbar = new FloatingTopbar({
    align: 'center',
    buttons: [
        {
            emoji: '🎤',
            tooltip: 'Nota de Voz',
            onClick: () => openVoiceNoteOverlay()
        }
    ]
});

function openVoiceNoteOverlay() {
    const overlay = new OverlayPanel({
        title: 'Nota de Voz',
        content: '<div id="voice-container"></div>',
        onOpen: () => {
            new VoiceInput('#voice-container', {
                textarea: true,
                continuous: true
            });
        }
    });
    overlay.open();
}
```

### Con Emoji Action Button

```javascript
// Usar EmojiActionButton para control avanzado
const micButton = new EmojiActionButton('🎤', {
    singleClick: () => voiceInput.toggleListening(),
    doubleClick: () => voiceInput.clear(),
    longPress: () => voiceInput.setLanguage('en-US')
}, {
    label: 'Voice Control'
});
```

### Con Admin Panel

```javascript
// Voice input en admin panel para crear prompts por voz
const promptVoiceInput = new VoiceInput('#prompt-input', {
    textarea: true,
    continuous: true,
    placeholder: 'Dicta tu prompt...',
    onResult: (data) => {
        if (data.final.length > 100) {
            savePromptDraft(data.final);
        }
    }
});
```

## 🐛 Troubleshooting

### El micrófono no se activa

**Solución**:
1. Verifica que estás en HTTPS (o localhost)
2. Verifica que el navegador soporta Web Speech API
3. Verifica que diste permiso al micrófono
4. Verifica que el micrófono está funcionando en tu sistema

### No reconoce bien mi voz

**Solución**:
1. Habla más claramente y despacio
2. Acércate más al micrófono
3. Reduce ruido de fondo
4. Verifica que seleccionaste el idioma correcto
5. Usa Chrome/Edge que tienen mejor reconocimiento

### Resultados en idioma incorrecto

**Solución**:
```javascript
// Asegúrate de establecer el idioma correcto
voiceInput.setLanguage('es-ES');  // Español
```

### El texto desaparece al hablar de nuevo

**Solución**:
```javascript
// Usa continuous: true para no resetear el texto
const voiceInput = new VoiceInput('#container', {
    continuous: true  // Acumula el texto
});
```

### Error: "not-allowed"

**Solución**: El usuario debe dar permiso al micrófono. Muestra instrucciones:
```javascript
onError: (error) => {
    if (error === 'not-allowed') {
        alert(`
            Por favor, permite el acceso al micrófono:
            1. Click en el icono de candado (🔒) en la barra de direcciones
            2. Busca "Micrófono"
            3. Selecciona "Permitir"
            4. Recarga la página
        `);
    }
}
```

## 📊 Especificaciones Técnicas

| Propiedad | Valor |
|-----------|-------|
| Input height | 48px |
| Button size | 40x40px |
| Max length | 5000 caracteres (configurable) |
| Border radius | 12px |
| Languages | 9 idiomas |
| Browser support | Chrome, Edge, Safari, Mobile |
| Dependencies | Ninguna |
| File size (CSS) | ~8 KB |
| File size (JS) | ~12 KB |

## 🎯 Mejores Prácticas

1. **Siempre proporciona un placeholder** que indique que se puede usar voz
2. **Usa continuous: false** para inputs cortos (búsquedas)
3. **Usa continuous: true** para inputs largos (transcripciones)
4. **Muestra feedback visual** mientras escucha (waveform, status)
5. **Maneja errores** con mensajes claros al usuario
6. **Permite edición manual** (el usuario puede escribir también)
7. **Proporciona selector de idioma** si tu audiencia es multiidioma
8. **Usa HTTPS** en producción
9. **Verifica soporte del navegador** antes de mostrar funcionalidad
10. **Guarda automáticamente** con `onResult` para no perder datos

## 🔗 Ver También

- [Emoji Action Button](./EMOJI-BUTTON-README.md) - Botones emoji multi-touch
- [Overlay Panel](./OVERLAY-PANEL-README.md) - Paneles superpuestos
- [Floating Topbar](./FLOATING-TOPBAR-README.md) - Barra superior flotante
- [Admin Panel Module](../modules/admin-panel/) - Panel de administración

---

**Event Core v1.2.0 "Visual Admin"**
Input con reconocimiento de voz para dictado manos libres
