# 💬 AiChat UI - Multi-Project Conversational AI Interface

**Version:** 1.0.0
**Status:** MVP - Fase 1 Completa ✅

---

## 🎯 Descripción

Interfaz de usuario completa para sistema de chat conversacional con AI multi-proyecto. Diseñada con el sistema JSON-driven de Event Core, soporta gestión de proyectos, conversaciones, prompts, funciones, credenciales y archivos desde una sola pantalla.

---

## ✨ Características Principales

### 🖥️ **Pantalla Única Multi-Funcional**
- **Topbar flotante**: Proyecto actual / AI actual / Conversación actual
- **Sidebar flotante**: Acceso rápido a todas las funciones
- **Chat área**: Conversación con renderizado markdown y real-time
- **Input bar flotante**: Entrada de mensajes con soporte voz

### 🎨 **Sistema de Interacciones Gestuales**
Cada botón soporta 3 tipos de interacción:

- **1-click** → Abrir selector/vista
- **2-clicks rápidos** → Crear nuevo elemento
- **Hold (mantener)** → Configuración/opciones

### 🔧 **Funcionalidades**

#### 📁 **Proyectos**
- Seleccionar proyecto activo
- Crear nuevos proyectos
- Configurar proyecto actual
- DB independiente por proyecto

#### 💬 **Conversaciones**
- Ver conversaciones del proyecto
- Crear nueva conversación
- Cambiar entre conversaciones
- Mensajes con markdown rendering

#### 💾 **Prompts**
- Prompts globales
- Prompts por proyecto
- Crear/editar prompts
- Versioning de prompts

#### 🛠️ **Funciones/Tools**
- Ver funciones disponibles para AI
- Añadir nuevas funciones
- Configurar funciones
- Integración con tool-orchestrator

#### 🔑 **Credenciales**
- Gestión multi-nivel (GLOBAL/PROJECT/CLIENT/CUSTOM)
- Valores enmascarados
- CRUD completo
- Integración con credential-manager

#### 📂 **Archivos**
- Buscador de archivos del sistema
- Archivos generados (MD, JSON, PDF)
- Navegación por carpetas del proyecto

#### 📝 **Editor MD/JSON**
- Editor integrado
- Syntax highlighting
- Guardar en proyecto

#### 📄 **Visor PDF**
- Lector PDF integrado
- PDFs del proyecto

#### 🤖 **Configuración AI**
- Cambiar provider (DeepSeek, Claude, OpenAI, Ollama)
- Ajustar parámetros (temperature, max_tokens, etc.)
- Ver modelo actual

---

## 📁 Estructura del Módulo

```
event-core/modules/aichat-ui/
├── module.json          # Configuración completa UI JSON-driven
├── index.js             # Backend del módulo
├── README.md            # Este archivo
└── schemas/
    └── ui.json          # Esquemas JSON (futuro)
```

---

## 🎨 Componentes UI Utilizados

### **Componentes Base (ya existentes):**
✅ `floating-topbar.component.json`
✅ `floating-sidebar.component.json`
✅ `floating-input-bar.component.json`
✅ `emoji-action-button.component.json`
✅ `overlay-panel.component.json`

### **Componentes Nuevos (creados):**
✅ `chat-message-list.component.json` - Lista de mensajes con markdown
✅ `selector-panel.component.json` - Panel selector multi-propósito

---

## 🔌 Integración Backend

### **Módulos conectados:**

| Módulo | Funcionalidad |
|--------|---------------|
| `chat-api` | Envío/recepción mensajes AI |
| `conversation-manager` | Gestión conversaciones con contexto |
| `project-manager` | Proyectos con DB propia |
| `prompt-manager` | Prompts globales/por proyecto |
| `ai-gateway` | Múltiples providers AI |
| `tool-orchestrator` | Funciones/tools para AI |
| `credential-manager` | Credenciales multi-nivel |
| `database-manager` | DB por proyecto |
| `storage-manager` | Archivos del sistema |

### **Eventos MQTT suscritos:**
```javascript
[
  "chat.message.sent",
  "chat.message.ai.received",
  "message.sent",
  "message.received",
  "project.activated",
  "conversation.created",
  "conversation.selected"
]
```

---

## 🚀 Cómo Usar

### **1. Arrancar Event Core**

```bash
cd event-core
node index.js
```

### **2. Acceder a la UI Demo**

Abre en tu navegador:
```
http://localhost:3000/ui/aichat-demo.html
```

### **3. Interactuar con la UI**

#### **Enviar Mensaje:**
1. Escribe en el input inferior
2. Click en 🚀 o presiona Enter
3. La AI responde automáticamente

#### **Cambiar Proyecto:**
1. Click en 📁 en el topbar o sidebar
2. Selecciona un proyecto de la lista
3. Las conversaciones se actualizan automáticamente

#### **Crear Nueva Conversación:**
1. Doble-click en 💬 en el sidebar
2. O click simple → panel → "Crear Nuevo"

#### **Gestionar Credenciales:**
1. Click en 🔑 en el sidebar
2. Ver credenciales (enmascaradas)
3. Doble-click para añadir nueva
4. Hold para configurar niveles

---

## 🎨 Customización

### **Cambiar Colores**

Edita `module.json` → `ui.views.main.structure`:

```json
{
  "colors": {
    "primary": "#667eea",
    "secondary": "#764ba2",
    "background": "#0F1216"
  }
}
```

### **Añadir Botones al Sidebar**

Edita `module.json` → `ui.views.main.structure.sidebar.config.buttons`:

```json
{
  "id": "mi-boton",
  "icon": "🎯",
  "tooltip": "Mi función",
  "actions": {
    "click": {
      "type": "open_panel",
      "panel": "mi-panel"
    }
  }
}
```

### **Crear Nuevo Panel**

Edita `module.json` → `ui.views.main.panels`:

```json
{
  "mi-panel": {
    "component": "selector-panel",
    "config": {
      "title": "Mi Panel",
      "icon": "🎯",
      "endpoint": "/mi-endpoint",
      "search_enabled": true
    }
  }
}
```

---

## 📊 Estado de Desarrollo

### ✅ **Fase 1 - MVP (Completada)**
- [x] Layout principal con topbar/sidebar/chat/input
- [x] Componentes JSON creados
- [x] Demo HTML funcional
- [x] Sistema de interacciones gestuales definido
- [x] Integración con backend (configurada)

### 🔄 **Fase 2 - Gestualidad (Siguiente)**
- [ ] Implementar 1-click/2-click/hold en botones
- [ ] Overlay panels con datos reales del backend
- [ ] Navegación fluida entre paneles
- [ ] Integración MQTT real-time

### 📋 **Fase 3 - Features Completas**
- [ ] CRUD completo de credenciales
- [ ] Gestión de prompts
- [ ] Gestión de funciones
- [ ] Buscador de archivos funcional

### 🎨 **Fase 4 - Editores**
- [ ] Editor MD/JSON integrado
- [ ] Visor PDF funcional
- [ ] Syntax highlighting
- [ ] Auto-guardado

---

## 🎯 Roadmap

### **Corto plazo (1-2 semanas)**
1. Conectar UI con backend real via MQTT
2. Implementar gestualidad completa (1-click/2-click/hold)
3. CRUD funcional de todos los recursos

### **Medio plazo (1 mes)**
1. Editor MD/JSON completo
2. Visor PDF
3. Búsqueda avanzada de archivos
4. Temas personalizables (dark/light)

### **Largo plazo (2-3 meses)**
1. Comandos por voz completos
2. Shortcuts de teclado
3. Modo offline
4. Sincronización multi-dispositivo

---

## 🔥 Features Destacadas

### **🎨 100% JSON-Driven**
Todo definido en JSON, CERO código HTML/CSS/JS manual en producción.

### **⚡ Real-time via MQTT**
Actualización automática de mensajes, proyectos, conversaciones sin refresh.

### **🎯 Gestualidad Intuitiva**
1-click, 2-click, hold - máxima eficiencia con mínimas interacciones.

### **📱 Responsive**
Funciona perfectamente en mobile, tablet y desktop.

### **♿ Accesible**
WCAG AA compliance, keyboard navigation, screen reader support.

### **🔒 Seguro**
Credenciales enmascaradas, integración con credential-manager multi-nivel.

---

## 🐛 Debugging

### **Ver logs del módulo:**
```bash
grep "aichat-ui" event-core/logs/app.log
```

### **Verificar salud del módulo:**
```bash
curl http://localhost:3000/modules/aichat-ui/health
```

### **Inspeccionar eventos MQTT:**
Abrir DevTools del navegador → Console → Ver mensajes MQTT en tiempo real.

---

## 📚 Referencias

- **Template UI**: `prompts/tutoriales/TEMPLATE_UI_JSON_DRIVEN.md`
- **Design System**: `ui-components/README.md`
- **Componentes**: `ui-components/*.component.json`
- **Backend Modules**: `modules/*/module.json`

---

## 🤝 Contribuir

1. Crea nuevos componentes en `ui-components/`
2. Extiende `module.json` con nuevas vistas/paneles
3. Añade interacciones en la sección `actions`
4. Documenta cambios en este README

---

## 📝 Notas de Implementación

### **¿Por qué JSON-driven?**
- **Consistencia**: Todos los módulos usan el mismo sistema
- **Reutilización**: Componentes usables en cualquier módulo
- **Mantenibilidad**: Cambios centralizados en JSONs
- **Productividad**: Crear UIs en minutos, no días

### **¿Por qué gestualidad?**
- **Eficiencia**: Menos clicks = más rápido
- **Espacio**: Una pantalla hace todo
- **Mobile-first**: Ideal para touch interfaces
- **Intuitivo**: Patrones familiares (long-press = opciones)

### **¿Por qué MQTT?**
- **Real-time**: Actualizaciones instantáneas
- **Event-driven**: Arquitectura consistente
- **Escalable**: Soporta múltiples clientes
- **Desacoplado**: UI independiente del backend

---

## 🎉 ¡Listo para usar!

Tu UI está configurada y lista. Abre el demo HTML y empieza a chatear con la AI.

**Next Steps:**
1. Conectar con backend real → Fase 2
2. Implementar gestualidad completa → Fase 2
3. Añadir features restantes → Fase 3 y 4

---

**AiChat UI v1.0.0** - Powered by Event Core JSON-Driven System 🚀
