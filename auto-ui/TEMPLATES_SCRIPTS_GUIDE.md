# Auto-UI v2.0 - Templates & Scripts Guide

## 📋 Overview

Esta guía documenta las mejoras en templates HTML, estilos CSS y scripts del cliente implementadas en Auto-UI v2.0.

---

## 🎨 Generator V2 - Templates Mejorados

### Ubicación
`/auto-ui/engine/generator-v2.js`

### Características Principales

#### 1. **Sistema CSS Completo**

**Theme Variables:**
```css
:root {
  /* Colors - 17 variables */
  --bg, --bg-card, --bg-hover, --bg-input
  --text, --text-muted, --text-disabled
  --primary, --primary-hover
  --success, --warning, --danger, --info
  --border, --border-focus, --overlay

  /* Spacing - 6 niveles */
  --space-xs, --space-sm, --space-md, --space-lg, --space-xl, --space-2xl

  /* Border Radius - 6 opciones */
  --radius-none, --radius-sm, --radius-md, --radius-lg, --radius-xl, --radius-full

  /* Typography - 9 variables */
  --font, --font-mono
  --size-xs, --size-sm, --size-base, --size-lg, --size-xl, --size-2xl
  --weight-normal, --weight-medium, --weight-semibold, --weight-bold
  --line-height

  /* Shadows - 5 niveles */
  --shadow-none, --shadow-sm, --shadow-md, --shadow-lg, --shadow-xl

  /* Transitions - 3 velocidades */
  --transition-fast, --transition-normal, --transition-slow
}
```

#### 2. **Componentes Mejorados**

**Buttons:**
- 6 variantes: primary, secondary, success, warning, danger, ghost
- 3 tamaños: sm, md, lg
- Estados: hover, active, disabled
- Transitions suaves
- Soporte para iconos

```html
<button class="btn btn-primary btn-lg">
  <span class="btn-icon">✓</span>
  <span class="btn-label">Guardar</span>
</button>
```

**Cards:**
- Variantes: default, elevated, interactive
- Secciones: header, body, footer
- Hover effects
- Box shadows

**Forms:**
- Estilos consistentes para todos los inputs
- Estados: hover, focus, disabled, error
- Labels con asterisco requerido
- Mensajes de error y ayuda
- Validación visual

**Tables:**
- Headers estilizados
- Row hover effects
- Responsive wrapper
- Borders sutiles

#### 3. **Animaciones**

**6 Keyframes Integrados:**

```css
@keyframes fadeIn
@keyframes slideIn
@keyframes toastIn
@keyframes spin
@keyframes shimmer
@keyframes pulse
```

**Uso:**
- `fadeIn` - Modals, overlays
- `slideIn` - Modals con movimiento
- `toastIn` - Notificaciones
- `spin` - Loading spinners
- `shimmer` - Skeleton loaders
- `pulse` - Estados de loading

#### 4. **Utilities Classes**

**Display:**
```css
.hidden, .block, .inline-block
.flex, .inline-flex, .grid
```

**Flexbox:**
```css
.flex-row, .flex-col, .flex-wrap
.items-start, .items-center, .items-end, .items-stretch
.justify-start, .justify-center, .justify-end, .justify-between, .justify-around
.gap-xs, .gap-sm, .gap-md, .gap-lg
```

**Text:**
```css
.text-left, .text-center, .text-right
.text-xs, .text-sm, .text-base, .text-lg, .text-xl
.font-normal, .font-medium, .font-semibold, .font-bold
.text-muted, .text-primary, .text-success, .text-warning, .text-danger
```

**Spacing:**
```css
.m-0, .mt-xs, .mt-sm, .mt-md, .mt-lg
.mb-xs, .mb-sm, .mb-md, .mb-lg
.p-0, .p-sm, .p-md, .p-lg
```

#### 5. **Responsive Design**

**Mobile Breakpoint (768px):**
- Sidebar collapsible
- Grid adaptativo (1 columna)
- Modal responsive
- Touch-friendly tap targets

```css
@media (max-width: 768px) {
  .sidebar { transform: translateX(-100%); }
  .sidebar.open { transform: translateX(0); }
  .main { margin-left: 0; }
  .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }
}
```

#### 6. **Estados de Loading**

**Loading Spinner:**
```html
<span class="loading"></span>
```

**Skeleton Loaders:**
```html
<div class="skeleton skeleton-text"></div>
<div class="skeleton skeleton-avatar"></div>
```

---

## 📱 Client Scripts - JavaScript Mejorado

### Ubicación
`/auto-ui/client/core.js`

### Características Principales

#### 1. **Toast Notification System**

```javascript
AutoUI.showToast(message, type, duration)
```

**Características:**
- 4 tipos: success, warning, danger, info
- Iconos automáticos por tipo
- Botón de cierre
- Auto-dismiss con tiempo configurable
- Múltiples toasts simultáneos
- Animaciones de entrada/salida

**Uso:**
```javascript
AutoUI.showToast('Guardado correctamente', 'success');
AutoUI.showToast('Campo requerido', 'warning', 5000);
```

#### 2. **Modal System**

```javascript
AutoUI.openModal(content, options)
AutoUI.closeModal(modal)
```

**Características:**
- Focus trap automático
- Click fuera para cerrar (opcional)
- Múltiples modales (stack)
- Animaciones de entrada/salida
- Tamaños configurables
- Persistent mode

**Uso:**
```javascript
AutoUI.openModal(`
  <div class="modal-header">Título</div>
  <div class="modal-body">Contenido...</div>
`, {
  size: 'lg',
  persistent: true
});
```

#### 3. **Action Executor**

```javascript
AutoUI.executeAction(action, params, element)
```

**Acciones soportadas:**
- `navigate` - Navegar a URL
- `back` - Volver atrás
- `refresh` - Recargar página
- `show_toast` - Mostrar notificación
- `open_modal` - Abrir modal
- `close_modal` - Cerrar modal
- `delete` - Eliminar con confirmación
- `submit_form` - Enviar formulario
- `emit` - Emitir evento HTMX
- `custom` - Handler personalizado

**Uso:**
```javascript
AutoUI.executeAction('delete', {
  endpoint: '/api/items/123',
  confirm: '¿Eliminar este elemento?'
}, element);
```

#### 4. **Hold Interaction**

**Características:**
- Progress circular visual
- Duración configurable (default: 2000ms)
- Cancelable al soltar
- Feedback visual al completar
- Smooth animation

**Uso en HTML:**
```html
<button data-hold='{"action":"delete","endpoint":"/api/item/123","duration":2000}'>
  🗑️ Eliminar
</button>
```

**Implementación:**
- Detecta `mousedown` en elementos con `[data-hold]`
- Crea indicador de progreso circular
- Ejecuta acción al completar
- Cleanup automático en `mouseup`/`mouseleave`

#### 5. **Sidebar Toggle**

```javascript
AutoUI.toggleSidebar()
```

**Características:**
- Persiste estado en localStorage
- Animación suave
- Adaptativo mobile

#### 6. **Tab System**

```javascript
AutoUI.switchTab(idx)
```

**Características:**
- ARIA attributes
- Keyboard navigation ready
- Active state management

#### 7. **Accordion System**

```javascript
AutoUI.toggleAccordion(btn, allowMultiple)
```

**Características:**
- Modo single/multiple
- Animaciones suaves
- Max-height transitions

#### 8. **Form Validation**

```javascript
AutoUI.validateForm(form)
AutoUI.validateField(input)
```

**Validaciones soportadas:**
- Required
- Email format
- URL format
- Min/Max length
- Pattern (regex)
- Custom rules via `data-validate`

**Características:**
- Validación en submit
- Validación en blur (opcional)
- Mensajes de error visuales
- Estados CSS

**Uso:**
```html
<form data-validate="true">
  <input type="email" required data-validate-on-blur>
</form>
```

#### 9. **Keyboard Shortcuts**

**Integrados:**
- `Esc` - Cerrar modal
- `Ctrl/Cmd + K` - Focus en search (si existe)

**Extensible:**
```javascript
document.addEventListener('keydown', (e) => {
  // Custom shortcuts
});
```

#### 10. **HTMX Event Handlers**

**Eventos manejados:**
- `htmx:afterSwap` - Log después de swap
- `htmx:responseError` - Toast de error

**Personalizables:**
```javascript
document.body.addEventListener('htmx:beforeRequest', (e) => {
  // Mostrar loading
});
```

#### 11. **Utilities**

```javascript
// Escapar HTML
AutoUI.escapeHtml(str)

// Copiar al portapapeles
AutoUI.copyToClipboard(text)

// Descargar JSON
AutoUI.downloadJSON(data, filename)

// Debounce
AutoUI.debounce(func, delay)
```

---

## 🔧 Integration in Engine v2

### Generator V2 Integration

```javascript
// En index-v2.js
const GeneratorV2 = require('./generator-v2');

this.generator = new GeneratorV2({
  loader: this.loader,
  componentSystem: this.componentSystem,
  widgetFactory: this.widgetFactory,
  logger: this.logger
});
```

### Static File Serving

```javascript
handleStaticJS(res) {
  const clientPath = path.join(__dirname, '..', 'client', 'core.js');

  if (fs.existsSync(clientPath)) {
    const js = fs.readFileSync(clientPath, 'utf-8');
    res.writeHead(200, {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=3600' // 1 hour cache
    });
    res.end(js);
  }
}
```

### Page Template

```javascript
page(title, content, options = {}) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Auto-UI</title>
  <style>${this.generateCSS()}</style>
  <script src="https://unpkg.com/htmx.org@1.9.10" defer></script>
</head>
<body>
  ${options.sidebar !== false ? this.sidebar() : ''}
  <main class="${options.sidebar !== false ? 'main' : ''}">
    ${content}
  </main>
  <div id="modal-container"></div>
  <div class="toast-container" id="toast-container"></div>
  ${options.sse ? this.sseScript() : ''}
  <script src="/auto-ui/js/core.js" defer></script>
</body>
</html>`;
}
```

---

## 📊 Performance Optimizations

### CSS
- ✅ Inline CSS (sin archivos externos)
- ✅ CSS Variables para theming
- ✅ Minificación automática (producción)
- ✅ Critical CSS inline

### JavaScript
- ✅ Deferred loading (`defer` attribute)
- ✅ Cache headers (1 hour)
- ✅ Event delegation
- ✅ Debounced handlers
- ✅ RequestAnimationFrame para animaciones

### HTML
- ✅ Semantic HTML5
- ✅ ARIA attributes
- ✅ Meta tags optimizados
- ✅ Lazy loading preparado

---

## ♿ Accessibility Improvements

### Keyboard Navigation
- ✅ Focus visible en todos los interactivos
- ✅ Tab order lógico
- ✅ Keyboard shortcuts
- ✅ Focus trap en modales

### ARIA
- ✅ `role` attributes
- ✅ `aria-label`, `aria-labelledby`
- ✅ `aria-selected` en tabs
- ✅ `aria-hidden` en paneles
- ✅ `aria-live` para toasts

### Visual
- ✅ Contraste adecuado
- ✅ Focus indicators visibles
- ✅ Error states claros
- ✅ Loading states

---

## 🎨 Theming

### Cambiar Theme
```javascript
// Cargar theme
autoUI.loader.setTheme('my-custom-theme');

// El CSS se regenera automáticamente
```

### Custom Theme
Crear `/auto-ui/config/themes/my-theme.json`:

```json
{
  "name": "my-theme",
  "colors": {
    "primary": "#FF6B6B",
    "bg": "#1a1a2e"
  },
  "spacing": { /* ... */ },
  "typography": { /* ... */ }
}
```

---

## 🧪 Testing

### Manual Testing Checklist

**Templates:**
- [ ] Todos los componentes renderizan correctamente
- [ ] Estilos se aplican en todos los navegadores
- [ ] Responsive funciona en mobile
- [ ] Animaciones son suaves
- [ ] Utilities funcionan

**Scripts:**
- [ ] Toasts aparecen y desaparecen
- [ ] Modales abren y cierran
- [ ] Hold interaction funciona
- [ ] Tabs cambian correctamente
- [ ] Accordion funciona
- [ ] Validación detecta errores
- [ ] Keyboard shortcuts funcionan

**Integration:**
- [ ] HTMX integrado correctamente
- [ ] SSE funciona
- [ ] Real-time updates
- [ ] Navegación SPA

---

## 🚀 Usage Examples

### Toast Notifications
```javascript
// Success
AutoUI.showToast('¡Operación exitosa!', 'success');

// Warning
AutoUI.showToast('Advertencia', 'warning');

// Error
AutoUI.showToast('Error al procesar', 'danger');

// Info (custom duration)
AutoUI.showToast('Procesando...', 'info', 10000);
```

### Modals
```javascript
// Simple modal
AutoUI.openModal(`
  <div class="modal-header">Confirmar</div>
  <div class="modal-body">¿Estás seguro?</div>
  <div class="modal-footer">
    <button class="btn btn-secondary" onclick="AutoUI.closeModal()">Cancelar</button>
    <button class="btn btn-primary">Aceptar</button>
  </div>
`);

// Large modal
AutoUI.openModal(content, { size: 'lg' });

// Persistent (no close on click outside)
AutoUI.openModal(content, { persistent: true });
```

### Form Validation
```html
<!-- Auto-validate on submit -->
<form data-validate="true">
  <input type="email" required>
  <input type="password" required data-validate='{"minLength": 8}'>
  <button type="submit">Enviar</button>
</form>

<!-- Validate on blur -->
<input type="text" required data-validate-on-blur>
```

### Hold to Delete
```html
<button
  class="btn btn-danger"
  data-hold='{
    "action": "delete",
    "endpoint": "/api/items/123",
    "duration": 2000
  }'
  hx-delete="/api/items/123"
  hx-target="closest tr"
  hx-swap="outerHTML"
  hx-confirm="¿Eliminar?">
  🗑️ Mantener para eliminar
</button>
```

---

## 📝 Migration from v1

### CSS
**v1:**
```html
<style>
  /* CSS hardcodeado mezclado */
</style>
```

**v2:**
```javascript
// CSS generado desde theme con GeneratorV2
const css = generator.generateCSS();
```

### Client Scripts
**v1:**
```javascript
// JS inline básico
window.AutoUI = { /* ... */ };
```

**v2:**
```javascript
// Archivo separado con features completos
<script src="/auto-ui/js/core.js" defer></script>
```

### Components
**v1:**
```javascript
// HTML hardcodeado en generator
```

**v2:**
```javascript
// ComponentSystem + GeneratorV2
componentSystem.render('button', props);
```

---

## 🎯 Best Practices

### Templates
1. Usar CSS variables siempre
2. Utility classes para layout
3. Component classes para componentes
4. Evitar estilos inline (excepto dynamic)
5. Mobile-first approach

### Scripts
1. Usar `defer` para scripts
2. Event delegation para mejor performance
3. Debounce para eventos frecuentes
4. RequestAnimationFrame para animaciones
5. localStorage para preferencias

### Performance
1. Inline critical CSS
2. Cache static resources
3. Defer non-critical scripts
4. Lazy load images/components
5. Minimize reflows/repaints

---

**Version:** 2.0.0
**Last Updated:** 2025-11-25
**Author:** Event Core Team
