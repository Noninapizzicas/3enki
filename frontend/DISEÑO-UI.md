# Diseño UI - Event Core Frontend

## Principios Fundamentales

1. **Pantalla única** - Todo el trabajo fluye en una sola vista, sin navegación
2. **Lenguaje visual** - Mínimo texto, máximo uso de iconos y colores
3. **Iconos dinámicos** - Los botones reflejan el estado actual (no genéricos)
4. **Colores = identidad** - Cada proyecto tiene un color distintivo
5. **1 clic = 1 panel** - Sin doble-clic ni long-press

---

## Layout de Pantalla

```
┌─────────────────────────────────────────────────────────────────┐
│ BARRA SUPERIOR (contexto)                                        │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐                              │
│ │proj│ │prov│ │prmp│ │cred│ │hist│                              │
│ └────┘ └────┘ └────┘ └────┘ └────┘                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│                     ÁREA DE CHAT                                 │
│                   (mensajes AI + usuario)                        │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│ INPUT: [____________________________] [➤]                        │
├─────────────────────────────────────────────────────────────────┤
│ BARRA INFERIOR (herramientas)                                    │
│ ┌────┐ ┌────┐ ┌────┐      [adjuntos: file.pdf ✕]                │
│ │file│ │edit│ │ pdf│                                            │
│ └────┘ └────┘ └────┘                                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Módulos (9 total)

### Barra Superior (Contexto)

| Módulo | Icono Base | Icono Dinámico | Backend |
|--------|------------|----------------|---------|
| project | 📁 | 🟢🔵🟣🟠 (color del proyecto) | project-manager |
| provider | 🔌 | 🤖🧠🔮🦙 (icono del provider) | ai-gateway |
| prompts | 📝 | ✨ si hay preset activo | prompt-manager |
| credentials | 🔐 | ✓ ok / ⚠️ falta | credential-manager |
| history | 💬 | badge con número | conversation-manager |

### Área Central

| Módulo | Función | Backend |
|--------|---------|---------|
| chat | Mensajes + input + envío | conversation-manager, ai-gateway |

### Barra Inferior (Herramientas)

| Módulo | Icono | Función | Backend |
|--------|-------|---------|---------|
| files | 📂 | Explorador, adjuntar archivos | file-browser |
| editor | 📄 | Editor texto/código (Monaco) | text-editor |
| pdf | 📕 | Visor PDF | pdf-viewer |

---

## Sistema Visual

### Colores de Proyecto

```typescript
const projectColors = [
  { id: 'green',  hex: '#22c55e', emoji: '🟢' },
  { id: 'blue',   hex: '#3b82f6', emoji: '🔵' },
  { id: 'purple', hex: '#a855f7', emoji: '🟣' },
  { id: 'orange', hex: '#f97316', emoji: '🟠' },
  { id: 'red',    hex: '#ef4444', emoji: '🔴' },
  { id: 'yellow', hex: '#eab308', emoji: '🟡' },
  { id: 'cyan',   hex: '#06b6d4', emoji: '🩵' },
  { id: 'pink',   hex: '#ec4899', emoji: '🩷' },
];
```

### Iconos de Provider

```typescript
const providerIcons = {
  openai:    '🤖',  // ChatGPT, GPT-4
  anthropic: '🧠',  // Claude
  deepseek:  '🔮',  // DeepSeek
  ollama:    '🦙',  // Modelos locales
};
```

### Badges y Estados

- **Número**: cantidad (ej: 5 conversaciones)
- **✓**: estado OK
- **⚠️**: requiere atención
- **Barra de color**: indicador visual del proyecto activo

---

## Comunicación MQTT

### Frontend Publica

```
provider/selected        → { providerId, modelId }
project/activate         → { projectId }
conversation/send        → { conversationId, content, attachments }
ui/panel/open            → { panelId }
ui/panel/close           → {}
```

### Frontend Suscribe

```
provider/state           → estado actual del provider
project/activated        → proyecto activo cambió
conversation/+/message   → mensajes nuevos
ai/chat/stream/+         → streaming de respuestas
credential/resolved      → credenciales disponibles
file/list/response       → lista de archivos
editor/saved             → archivo guardado
pdf/extract/response     → texto extraído de PDF
```

---

## Flujo de Adjuntar Archivos

1. Usuario clica 📂 (files)
2. Panel muestra explorador del proyecto
3. Selecciona archivo(s)
4. Aparecen en barra inferior: `[doc.pdf ✕] [code.js ✕]`
5. Al enviar mensaje, archivos van incluidos
6. Backend procesa según tipo (extrae texto de PDF, incluye código, etc.)

---

## Paneles

- Posición: **parte superior**
- Tamaño: **max 33vh** (1/3 de pantalla)
- Contenido: lista de opciones o tabs si es complejo
- Cierre: clic fuera o selección

---

## Tecnologías Frontend

- **Framework**: SvelteKit
- **Estado**: Svelte stores (writable, derived)
- **Comunicación**: MQTT sobre WebSocket (puerto 9001)
- **Editor**: Monaco Editor (para text-editor)
- **PDF**: PDF.js (para pdf-viewer)

---

## Decisiones de Arquitectura

1. ❌ NO fallback local - solo MQTT directo al broker
2. ❌ NO endpoints /ui/* adicionales - frontend transforma datos
3. ❌ NO doble-clic ni long-press - solo clic simple
4. ✅ Iconos dinámicos que reflejan estado actual
5. ✅ Colores como identidad de proyecto
6. ✅ Todo en una pantalla, paneles superpuestos
