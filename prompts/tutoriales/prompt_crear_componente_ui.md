# 🎨 Prompt Maestro — Crear Componente UI Funcional (Event Core)

**Rol activo:**
**Especialista en Desarrollo de Componentes UI Reutilizables (Monoespecialista)**
Encargado de crear componentes de interfaz gráfica completos y funcionales con HTML, CSS y JavaScript vanilla, totalmente integrados con Event Core.

---

## 🎯 Objetivo General
Implementar un **componente UI totalmente funcional** para Event Core con HTML semántico, CSS modular, JavaScript vanilla, integración con APIs REST, eventos MQTT en tiempo real, y documentación completa.

Debes crear:
- Especificación JSON del componente
- HTML semántico y accesible
- CSS modular con estados y transiciones
- JavaScript vanilla con gestión de estado
- Integración con Event Core (APIs + MQTT)
- Documentación completa con ejemplos
- Tests de funcionalidad

---

## 🧱 1. Estructura esperada del componente

```
ui-components/[NOMBRE_COMPONENTE]/
├── component.json           ← Especificación del componente
├── [nombre].html           ← Template HTML
├── [nombre].css            ← Estilos del componente
├── [nombre].js             ← Lógica JavaScript
├── assets/                 ← Assets del componente (opcional)
│   ├── icons/
│   └── images/
├── examples/               ← Ejemplos de uso
│   └── index.html
├── tests/                  ← Tests del componente
│   └── component.test.js
└── README.md               ← Documentación completa
```

---

## ⚙️ 2. Fases de implementación

### **Fase 1 — Especificación JSON del componente**

1. Crear archivo `component.json` con estructura completa:
   ```json
   {
     "component": "nombre-componente",
     "version": "1.0.0",
     "description": "Descripción del componente",
     "author": "Event Core Team",
     "dimensions": {
       "width": "300px",
       "height": "auto",
       "responsive": true
     },
     "props": {
       "required": ["id", "data"],
       "optional": ["theme", "callbacks"]
     },
     "states": {
       "idle": "Estado inicial",
       "loading": "Cargando datos",
       "success": "Operación exitosa",
       "error": "Error en operación"
     },
     "events": {
       "emits": ["component:ready", "component:change"],
       "listens": ["data:update", "state:change"]
     },
     "api": {
       "endpoints": [],
       "mqtt": []
     },
     "accessibility": {
       "aria": true,
       "keyboard": true,
       "screenReader": true
     }
   }
   ```

2. Definir props requeridos y opcionales con validación
3. Definir estados posibles del componente
4. Definir eventos que emite y escucha
5. Especificar integración con APIs y MQTT

**Complejidad:** 2 Story Points
**Tiempo estimado:** 30 minutos

---

### **Fase 2 — HTML semántico y accesible**

1. Crear template HTML con:
   - Estructura semántica (usar tags apropiados: `<button>`, `<nav>`, etc.)
   - ARIA labels para accesibilidad
   - Data attributes para hooks JavaScript
   - Slots para contenido dinámico
   - Comentarios documentando secciones

2. Ejemplo de estructura:
   ```html
   <div class="component-container" data-component="nombre-componente">
     <!-- Header Section -->
     <header class="component-header" role="banner">
       <h2 class="component-title" id="component-title">{{title}}</h2>
       <button
         class="component-action"
         aria-label="Acción principal"
         data-action="primary">
         {{actionLabel}}
       </button>
     </header>

     <!-- Main Content -->
     <main class="component-body" role="main" aria-labelledby="component-title">
       <div class="component-content" data-slot="content">
         <!-- Contenido dinámico -->
       </div>
     </main>

     <!-- Footer Section (opcional) -->
     <footer class="component-footer" role="contentinfo">
       <div class="component-meta">
         <span class="component-status" data-bind="status">{{status}}</span>
       </div>
     </footer>

     <!-- Loading Overlay -->
     <div class="component-loading" data-state="loading" hidden>
       <div class="loading-spinner" role="status" aria-live="polite">
         <span class="sr-only">Cargando...</span>
       </div>
     </div>
   </div>
   ```

3. Incluir clases para estados visuales
4. Agregar elementos ocultos para screen readers (.sr-only)
5. Usar roles ARIA apropiados

**Complejidad:** 3 Story Points
**Tiempo estimado:** 1-2 horas

---

### **Fase 3 — CSS modular con estados y transiciones**

1. Crear archivo CSS con:
   - Variables CSS para tematización
   - Reset/normalize específico del componente
   - Estilos base del componente
   - Estados visuales (hover, active, focus, disabled)
   - Transiciones y animaciones
   - Responsive design
   - Dark mode (opcional)

2. Ejemplo de estructura CSS:
   ```css
   /* ==========================================
    * Variables del Componente
    * ========================================== */
   :root {
     --component-bg: #ffffff;
     --component-text: #1f2937;
     --component-primary: #3b82f6;
     --component-success: #10b981;
     --component-error: #ef4444;
     --component-border-radius: 8px;
     --component-transition: all 0.3s ease;
   }

   /* Dark Mode */
   [data-theme="dark"] {
     --component-bg: #1f2937;
     --component-text: #f9fafb;
   }

   /* ==========================================
    * Componente Base
    * ========================================== */
   .component-container {
     background: var(--component-bg);
     color: var(--component-text);
     border-radius: var(--component-border-radius);
     box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
     transition: var(--component-transition);
   }

   /* ==========================================
    * Estados del Componente
    * ========================================== */
   .component-container[data-state="loading"] {
     opacity: 0.6;
     pointer-events: none;
   }

   .component-container[data-state="error"] {
     border: 2px solid var(--component-error);
   }

   .component-container[data-state="success"] {
     border: 2px solid var(--component-success);
   }

   /* ==========================================
    * Interacciones
    * ========================================== */
   .component-action {
     background: var(--component-primary);
     border: none;
     padding: 0.5rem 1rem;
     border-radius: 4px;
     cursor: pointer;
     transition: var(--component-transition);
   }

   .component-action:hover {
     transform: translateY(-2px);
     box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
   }

   .component-action:active {
     transform: translateY(0);
   }

   .component-action:focus-visible {
     outline: 2px solid var(--component-primary);
     outline-offset: 2px;
   }

   /* ==========================================
    * Animaciones
    * ========================================== */
   @keyframes fadeIn {
     from { opacity: 0; transform: translateY(10px); }
     to { opacity: 1; transform: translateY(0); }
   }

   .component-container {
     animation: fadeIn 0.3s ease;
   }

   /* ==========================================
    * Responsive
    * ========================================== */
   @media (max-width: 768px) {
     .component-container {
       padding: 1rem;
     }
   }

   /* ==========================================
    * Accessibility
    * ========================================== */
   .sr-only {
     position: absolute;
     width: 1px;
     height: 1px;
     padding: 0;
     margin: -1px;
     overflow: hidden;
     clip: rect(0, 0, 0, 0);
     white-space: nowrap;
     border-width: 0;
   }
   ```

3. Usar CSS Grid/Flexbox para layout
4. Incluir estados :hover, :focus, :active, :disabled
5. Transiciones suaves (0.2-0.3s)

**Complejidad:** 5 Story Points
**Tiempo estimado:** 2-3 horas

---

### **Fase 4 — JavaScript vanilla con gestión de estado**

1. Crear clase del componente con:
   - Constructor con validación de props
   - Sistema de estado interno
   - Event emitters
   - Métodos públicos
   - Métodos privados
   - Lifecycle hooks
   - Event listeners
   - Integración con API

2. Ejemplo de estructura JavaScript:
   ```javascript
   /**
    * NombreComponente
    * Descripción del componente
    */
   class NombreComponente {
     // ==========================================
     // Constructor
     // ==========================================
     constructor(config = {}) {
       // Validar configuración requerida
       this.validateConfig(config);

       // Props
       this.id = config.id;
       this.containerId = config.containerId || 'component-container';
       this.endpoint = config.endpoint;
       this.mqttTopic = config.mqttTopic;

       // Estado interno
       this.state = {
         status: 'idle',
         data: null,
         error: null,
         loading: false
       };

       // Referencias DOM
       this.container = null;
       this.elements = {};

       // Event listeners registry
       this.listeners = new Map();

       // Inicializar componente
       this.init();
     }

     // ==========================================
     // Lifecycle Methods
     // ==========================================
     async init() {
       try {
         // Obtener referencia al contenedor
         this.container = document.getElementById(this.containerId);
         if (!this.container) {
           throw new Error(`Container ${this.containerId} not found`);
         }

         // Renderizar HTML
         this.render();

         // Cachear referencias DOM
         this.cacheElements();

         // Registrar event listeners
         this.registerEventListeners();

         // Conectar a MQTT si está configurado
         if (this.mqttTopic) {
           this.connectMQTT();
         }

         // Cargar datos iniciales
         await this.loadData();

         // Emitir evento de componente listo
         this.emit('component:ready', { id: this.id });

       } catch (error) {
         this.handleError(error);
       }
     }

     destroy() {
       // Limpiar event listeners
       this.listeners.forEach((listener, element) => {
         element.removeEventListener(listener.event, listener.handler);
       });
       this.listeners.clear();

       // Desconectar MQTT
       if (this.mqttClient) {
         this.mqttClient.disconnect();
       }

       // Limpiar DOM
       if (this.container) {
         this.container.innerHTML = '';
       }

       this.emit('component:destroyed', { id: this.id });
     }

     // ==========================================
     // Rendering
     // ==========================================
     render() {
       this.container.innerHTML = `
         <div class="component-container" data-component="nombre-componente">
           <header class="component-header">
             <h2 class="component-title">Título</h2>
           </header>
           <main class="component-body">
             <div class="component-content" data-slot="content"></div>
           </main>
           <div class="component-loading" hidden>
             <div class="loading-spinner"></div>
           </div>
         </div>
       `;
     }

     cacheElements() {
       this.elements = {
         title: this.container.querySelector('.component-title'),
         content: this.container.querySelector('[data-slot="content"]'),
         loading: this.container.querySelector('.component-loading'),
         container: this.container.querySelector('.component-container')
       };
     }

     // ==========================================
     // State Management
     // ==========================================
     setState(newState) {
       const prevState = { ...this.state };
       this.state = { ...this.state, ...newState };

       // Actualizar DOM según estado
       this.updateDOM();

       // Emitir evento de cambio de estado
       this.emit('state:change', {
         prev: prevState,
         current: this.state
       });
     }

     updateDOM() {
       // Actualizar clases según estado
       if (this.elements.container) {
         this.elements.container.setAttribute('data-state', this.state.status);
       }

       // Mostrar/ocultar loading
       if (this.elements.loading) {
         this.elements.loading.hidden = !this.state.loading;
       }
     }

     // ==========================================
     // Event System
     // ==========================================
     on(eventName, callback) {
       if (!this.eventListeners) {
         this.eventListeners = {};
       }
       if (!this.eventListeners[eventName]) {
         this.eventListeners[eventName] = [];
       }
       this.eventListeners[eventName].push(callback);
     }

     emit(eventName, data) {
       // Emitir evento interno
       if (this.eventListeners && this.eventListeners[eventName]) {
         this.eventListeners[eventName].forEach(callback => {
           callback(data);
         });
       }

       // Emitir evento DOM
       const event = new CustomEvent(eventName, {
         detail: data,
         bubbles: true
       });
       this.container.dispatchEvent(event);
     }

     registerEventListeners() {
       // Ejemplo: Click en botón
       const actionButton = this.container.querySelector('[data-action="primary"]');
       if (actionButton) {
         const handler = this.handleAction.bind(this);
         actionButton.addEventListener('click', handler);
         this.listeners.set(actionButton, { event: 'click', handler });
       }
     }

     // ==========================================
     // API Integration
     // ==========================================
     async loadData() {
       try {
         this.setState({ loading: true, status: 'loading' });

         const response = await fetch(this.endpoint);
         if (!response.ok) {
           throw new Error(`HTTP ${response.status}: ${response.statusText}`);
         }

         const data = await response.json();

         this.setState({
           loading: false,
           status: 'success',
           data: data,
           error: null
         });

         this.renderData(data);

       } catch (error) {
         this.handleError(error);
       }
     }

     async saveData(data) {
       try {
         this.setState({ loading: true });

         const response = await fetch(this.endpoint, {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify(data)
         });

         if (!response.ok) {
           throw new Error(`HTTP ${response.status}`);
         }

         const result = await response.json();

         this.setState({ loading: false, status: 'success' });
         this.emit('data:saved', result);

       } catch (error) {
         this.handleError(error);
       }
     }

     // ==========================================
     // MQTT Integration
     // ==========================================
     connectMQTT() {
       // Conectar al Event Bus MQTT
       this.mqttClient = new MQTTClient({
         host: window.location.hostname,
         port: 1883
       });

       this.mqttClient.subscribe(this.mqttTopic, (message) => {
         this.handleMQTTMessage(message);
       });
     }

     handleMQTTMessage(message) {
       try {
         const data = JSON.parse(message);
         this.setState({ data: data });
         this.renderData(data);
         this.emit('mqtt:message', data);
       } catch (error) {
         console.error('Error parsing MQTT message:', error);
       }
     }

     // ==========================================
     // Handlers
     // ==========================================
     handleAction(event) {
       event.preventDefault();
       this.emit('component:action', {
         action: event.target.dataset.action
       });
     }

     handleError(error) {
       console.error(`[${this.id}] Error:`, error);

       this.setState({
         loading: false,
         status: 'error',
         error: error.message
       });

       this.emit('component:error', {
         error: error.message,
         timestamp: new Date().toISOString()
       });
     }

     // ==========================================
     // Public API
     // ==========================================
     async refresh() {
       await this.loadData();
     }

     show() {
       if (this.container) {
         this.container.style.display = 'block';
       }
     }

     hide() {
       if (this.container) {
         this.container.style.display = 'none';
       }
     }

     // ==========================================
     // Validation
     // ==========================================
     validateConfig(config) {
       const required = ['id', 'endpoint'];
       const missing = required.filter(key => !config[key]);

       if (missing.length > 0) {
         throw new Error(`Missing required config: ${missing.join(', ')}`);
       }
     }

     renderData(data) {
       // Implementar renderizado específico
       if (this.elements.content) {
         this.elements.content.innerHTML = JSON.stringify(data, null, 2);
       }
     }
   }

   // ==========================================
   // Export
   // ==========================================
   if (typeof module !== 'undefined' && module.exports) {
     module.exports = NombreComponente;
   } else {
     window.NombreComponente = NombreComponente;
   }
   ```

3. Implementar validación de props
4. Gestión de estado reactiva
5. Sistema de eventos personalizado
6. Integración con APIs REST
7. Integración con MQTT para tiempo real

**Complejidad:** 13 Story Points
**Tiempo estimado:** 1-2 días

---

### **Fase 5 — Integración con Event Core**

1. Registrar componente en UI Gateway:
   ```javascript
   // core/ui-gateway/components.js
   const components = {
     'nombre-componente': {
       path: '/ui-components/nombre-componente',
       version: '1.0.0',
       dependencies: []
     }
   };
   ```

2. Crear endpoint de configuración:
   ```javascript
   // GET /ui/components/nombre-componente/config
   async handleGetComponentConfig(req, context) {
     return {
       status: 200,
       data: require('./ui-components/nombre-componente/component.json')
     };
   }
   ```

3. Agregar a module.json del módulo que lo usa:
   ```json
   {
     "ui": {
       "components": ["nombre-componente"],
       "views": {
         "dashboard": {
           "type": "custom",
           "component": "nombre-componente",
           "config": {
             "endpoint": "/modules/mi-modulo/data",
             "mqttTopic": "/events/data.updated"
           }
         }
       }
     }
   }
   ```

**Complejidad:** 5 Story Points
**Tiempo estimado:** 2-3 horas

---

### **Fase 6 — Documentación y ejemplos**

1. Crear README.md completo con:
   - Descripción del componente
   - Instalación/setup
   - Props y configuración
   - Ejemplos de uso
   - API pública
   - Eventos emitidos
   - Estados posibles
   - Personalización (CSS variables)
   - Accesibilidad
   - Troubleshooting

2. Crear archivo de ejemplos:
   ```html
   <!-- examples/index.html -->
   <!DOCTYPE html>
   <html lang="es">
   <head>
     <meta charset="UTF-8">
     <meta name="viewport" content="width=device-width, initial-scale=1.0">
     <title>Ejemplos - Nombre Componente</title>
     <link rel="stylesheet" href="../nombre-componente.css">
   </head>
   <body>
     <h1>Ejemplos de Uso</h1>

     <!-- Ejemplo 1: Básico -->
     <section>
       <h2>Ejemplo 1: Uso Básico</h2>
       <div id="example-1"></div>
     </section>

     <!-- Ejemplo 2: Con MQTT -->
     <section>
       <h2>Ejemplo 2: Con MQTT en Tiempo Real</h2>
       <div id="example-2"></div>
     </section>

     <script src="../nombre-componente.js"></script>
     <script>
       // Ejemplo 1
       const comp1 = new NombreComponente({
         id: 'comp-1',
         containerId: 'example-1',
         endpoint: 'https://api.example.com/data'
       });

       // Ejemplo 2
       const comp2 = new NombreComponente({
         id: 'comp-2',
         containerId: 'example-2',
         endpoint: 'https://api.example.com/data',
         mqttTopic: '/events/data.updated'
       });
     </script>
   </body>
   </html>
   ```

**Complejidad:** 3 Story Points
**Tiempo estimado:** 1-2 horas

---

## 🧠 3. Buenas prácticas (Best Practices)

✅ **HTML Semántico** - Usar tags apropiados (`<button>`, `<nav>`, `<article>`)
✅ **Accesibilidad** - ARIA labels, keyboard navigation, screen reader support
✅ **CSS Modular** - Variables CSS, BEM naming, scoped styles
✅ **JavaScript Vanilla** - No frameworks, código portable
✅ **Estado Reactivo** - Actualizar DOM cuando cambia el estado
✅ **Event-Driven** - Sistema de eventos para comunicación
✅ **API First** - Integración con Event Core APIs
✅ **Real-time** - MQTT para actualizaciones en tiempo real
✅ **Responsive** - Mobile-first, funciona en todos los dispositivos
✅ **Performance** - Lazy loading, debouncing, throttling
✅ **Error Handling** - Try/catch, mensajes útiles, estados de error
✅ **Documentación** - README completo con ejemplos

---

## 📋 4. Checklist de entrega

**Especificación:**
- [ ] component.json completo con todas las secciones
- [ ] Props requeridos y opcionales documentados
- [ ] Estados del componente definidos
- [ ] Eventos definidos (emits + listens)
- [ ] Integración API/MQTT especificada

**HTML:**
- [ ] Estructura semántica con tags apropiados
- [ ] ARIA labels para accesibilidad
- [ ] Data attributes para hooks JavaScript
- [ ] Comentarios documentando secciones
- [ ] Slots para contenido dinámico

**CSS:**
- [ ] Variables CSS para tematización
- [ ] Estilos base del componente
- [ ] Estados visuales (hover, focus, active, disabled)
- [ ] Transiciones suaves (0.2-0.3s)
- [ ] Responsive design (mobile-first)
- [ ] Dark mode (opcional)
- [ ] Clases .sr-only para accesibilidad

**JavaScript:**
- [ ] Clase del componente con constructor
- [ ] Sistema de estado interno
- [ ] Event emitters y listeners
- [ ] Lifecycle hooks (init, destroy)
- [ ] Integración con API REST
- [ ] Integración con MQTT (opcional)
- [ ] Validación de configuración
- [ ] Manejo de errores completo
- [ ] API pública documentada

**Integración:**
- [ ] Registrado en UI Gateway
- [ ] Endpoint de configuración creado
- [ ] Agregado a module.json
- [ ] Probado en contexto real

**Documentación:**
- [ ] README.md completo
- [ ] Ejemplos de uso funcionales
- [ ] API pública documentada
- [ ] Props y eventos documentados
- [ ] Troubleshooting incluido

**Testing:**
- [ ] Componente funciona standalone
- [ ] Integración con Event Core funciona
- [ ] MQTT updates en tiempo real
- [ ] Accesibilidad verificada
- [ ] Responsive en mobile/desktop
- [ ] Estados visuales correctos

---

## 🧾 5. Ejemplo de component.json completo

```json
{
  "component": "cuenta-button",
  "version": "1.0.0",
  "description": "Botón de cuenta para POS/Comandero con estados visuales",
  "author": "Event Core Team",
  "created": "2025-01-14",
  "license": "MIT",
  "dimensions": {
    "width": "40mm",
    "height": "30mm",
    "width_px": 151,
    "height_px": 113,
    "responsive": true,
    "minWidth": "150px",
    "minHeight": "100px"
  },
  "props": {
    "required": [
      "id",
      "nombre",
      "tipo",
      "estado"
    ],
    "optional": [
      "emojis",
      "callbacks",
      "theme"
    ],
    "types": {
      "id": "string",
      "nombre": "string",
      "tipo": "enum['local','delivery','llevar']",
      "estado": "enum['pendiente','preparacion','listo','entregado','pagado','problema','cancelado']",
      "emojis": "object",
      "callbacks": "object",
      "theme": "string"
    }
  },
  "states": {
    "pendiente": {
      "name": "Pendiente",
      "color": "#fbbf24",
      "description": "Cuenta creada, esperando preparación"
    },
    "preparacion": {
      "name": "En Preparación",
      "color": "#fb923c",
      "description": "Pedido en cocina"
    },
    "listo": {
      "name": "Listo",
      "color": "#4ade80",
      "description": "Pedido listo para entregar"
    },
    "entregado": {
      "name": "Entregado",
      "color": "#60a5fa",
      "description": "Pedido entregado al cliente"
    },
    "pagado": {
      "name": "Pagado",
      "color": "#34d399",
      "description": "Cuenta cobrada"
    },
    "problema": {
      "name": "Problema",
      "color": "#f87171",
      "description": "Hay un problema con el pedido"
    },
    "cancelado": {
      "name": "Cancelado",
      "color": "#94a3b8",
      "description": "Pedido cancelado"
    }
  },
  "events": {
    "emits": [
      "cuenta:click-left",
      "cuenta:click-right",
      "cuenta:long-press",
      "cuenta:double-tap",
      "cuenta:state-change"
    ],
    "listens": [
      "cuenta:update",
      "cuenta:delete"
    ]
  },
  "api": {
    "endpoints": [
      {
        "method": "GET",
        "path": "/modules/comandero/orders/:id",
        "description": "Obtener datos de la cuenta"
      },
      {
        "method": "POST",
        "path": "/modules/comandero/orders/:id/state",
        "description": "Actualizar estado de la cuenta"
      }
    ],
    "mqtt": [
      {
        "topic": "/events/order.updated",
        "description": "Escuchar actualizaciones de pedidos"
      },
      {
        "topic": "/events/order.state.changed",
        "description": "Escuchar cambios de estado"
      }
    ]
  },
  "accessibility": {
    "aria": true,
    "keyboard": true,
    "screenReader": true,
    "minTouchTarget": "44px",
    "contrastRatio": "4.5:1"
  },
  "dependencies": [],
  "browser": {
    "modern": true,
    "ie11": false,
    "mobile": true
  },
  "performance": {
    "lazy": false,
    "bundle": "standalone"
  }
}
```

---

## 📦 6. Convenciones del Agente Núcleo

- **Nomenclatura:** kebab-case para archivos y clases (ej: `cuenta-button`)
- **Clases CSS:** BEM naming (`component-name__element--modifier`)
- **Variables CSS:** Prefijo `--component-` (ej: `--component-bg`)
- **Data attributes:** `data-component`, `data-state`, `data-action`
- **Event names:** dot notation (`component:ready`, `state:change`)
- **API responses:** Siempre JSON con estructura `{ status, data }`
- **MQTT topics:** slash notation (`/events/entity.action`)
- **Accessibility:** ARIA labels obligatorios, keyboard navigation
- **Responsive:** Mobile-first, breakpoints estándar (768px, 1024px)
- **Performance:** Debouncing en eventos frecuentes (scroll, resize)

---

## 🧭 7. Formato de salida esperado

Debes retornar:

1. **Resumen ejecutivo**
   - Nombre del componente creado
   - Funcionalidades implementadas
   - Integración con Event Core

2. **Lista de archivos creados**
   - Ruta completa de cada archivo
   - Propósito del archivo
   - Número de líneas aproximado

3. **Contenido completo de archivos**
   - `component.json` completo
   - `nombre-componente.html` completo
   - `nombre-componente.css` completo
   - `nombre-componente.js` completo
   - `README.md` completo

4. **Ejemplos de uso**
   - HTML de inicialización
   - Configuración JavaScript
   - Casos de uso comunes

5. **Integración con Event Core**
   - Configuración en module.json
   - Endpoints API usados
   - Topics MQTT escuchados

6. **Testing**
   - Comandos para probar el componente
   - Casos de prueba cubiertos
   - Screenshots o descripciones visuales

7. **Checklist completado**
   - Marcar cada ítem como ✅ o ❌

---

## 🧩 8. Reglas operativas

- **HTML semántico** - Usar tags apropiados, no solo `<div>`
- **CSS modular** - Variables para tematización, no hardcodear colores
- **JavaScript vanilla** - No usar frameworks, código portable
- **Estado reactivo** - El DOM se actualiza cuando cambia el estado
- **Event-driven** - Comunicación por eventos, no callbacks directos
- **Accesibilidad** - Obligatoria, no opcional
- **Responsive** - Mobile-first, funciona en todos los dispositivos
- **Error handling** - Try/catch, no dejar que falle silenciosamente
- **Documentación** - README completo, ejemplos funcionales
- **Performance** - Optimizar eventos, lazy loading cuando aplique
- **No side effects** - Componente no debe modificar estado global

---

## 🔄 9. Capa de Consolidación (al finalizar)

### **Estado del componente**
- ✅ Completo y funcional
- ✅ Integrado con Event Core
- ✅ Accesible y responsive
- ⚠️ Testing pendiente (o completo)

### **Pendientes**
- Tests unitarios automatizados
- Tests de integración
- Tests de accesibilidad (axe, lighthouse)
- Optimización de performance
- Documentación de API completa

### **Próximos pasos**
- Agregar variantes del componente
- Crear temas personalizados
- Implementar lazy loading
- Agregar más ejemplos de uso
- Crear storybook del componente

### **Métricas de implementación**
- Total de líneas: ~XXX
- Archivos creados: X
- Story Points: XX
- Props soportados: X
- Estados: X
- Eventos: X

---

**Versión del prompt:** 1.0.0
**Fecha:** 2025-01-14
**Compatible con:** Event Core v0.5.0+
