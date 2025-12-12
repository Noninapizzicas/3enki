# Event-Core Frontend

Frontend moderno para Event-Core construido con **SvelteKit 2** + **Tailwind CSS**.

## Stack

- **SvelteKit 2** - Framework web
- **Svelte 5** - UI reactiva
- **Tailwind CSS** - Estilos utilitarios
- **MQTT.js** - Comunicación real-time con Event-Core
- **TypeScript** - Type safety

## Estructura

```
frontend/
├── src/
│   ├── lib/
│   │   ├── components/     # Componentes reutilizables
│   │   │   ├── ui/         # Button, Input, Card, etc.
│   │   │   ├── data/       # Table, StatCard, EventStream
│   │   │   ├── feedback/   # Toast, Modal, Alert
│   │   │   └── layout/     # Sidebar, Header
│   │   ├── stores/         # Estado global (MQTT, modules, toast)
│   │   └── utils/          # Helpers
│   ├── routes/             # Páginas SvelteKit
│   │   ├── +layout.svelte  # Layout principal
│   │   ├── +page.svelte    # Dashboard
│   │   ├── modules/        # Lista y detalle de módulos
│   │   └── events/         # Monitor de eventos
│   └── app.css             # Estilos globales + Tailwind
├── tailwind.config.js      # Theme de Event-Core
└── package.json
```

## Instalación

```bash
cd frontend
npm install
```

## Desarrollo

```bash
# Iniciar Event-Core (en otra terminal)
cd ..
npm start

# Iniciar frontend
npm run dev
```

El frontend estará disponible en `http://localhost:5173`

## Build

```bash
npm run build
npm run preview
```

## Características

### Componentes UI
Migrados desde Auto-UI JSON a componentes Svelte:
- **Button** - Con variantes, tamaños y hold interaction
- **Input** - Con validación y estados
- **Card** - Container con header/footer slots
- **Table** - Con sorting, acciones y real-time via MQTT
- **Modal** - Con focus trap y animaciones
- **Toast** - Sistema de notificaciones

### Integración MQTT
Conexión directa al broker MQTT de Event-Core:
```typescript
import { connect, events, publish } from '$stores/mqtt';

// Conectar
connect('ws://localhost:1883', 'core-a');

// Escuchar eventos
$: console.log($events);

// Publicar
publish('my.event', { data: 'hello' });
```

### Rutas Dinámicas
- `/` - Dashboard con stats y event stream
- `/modules` - Lista de módulos cargados
- `/modules/[name]` - Detalle de módulo con APIs
- `/events` - Monitor de eventos en tiempo real

## Theme

El tema está basado en `auto-ui/config/theme.json` y convertido a Tailwind:

```javascript
// tailwind.config.js
colors: {
  bg: '#0f1216',
  primary: '#3b82f6',
  success: '#22c55e',
  // ...
}
```
