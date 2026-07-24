---
name: generar-ui-web
description: "Dado un proyecto, genera su interfaz web completa en ui/index.html. Analiza el proyecto, detecta su estructura, y produce un HTML autocontenido con navegación, contenido, datos mock y estilo. Soporta inputs opcionales de marca (colores, logo, fuentes), pautas UX (accesibilidad, responsividad) y perfil de audiencia. A más inputs, más matizada la UI. A menos inputs, genérica pero funcional."
---

# Generar UI Web

Dado un proyecto en disco, produce su interfaz web completa en `ui/index.html`.
Un solo archivo HTML autocontenido que se abre en navegador.

## Inputs

| Input | Requerido | Formato |
|---|---|---|
| Ruta del proyecto | Sí | Path absoluto o relativo |
| Marca | No | Archivo JSON o parámetros: colores, logo SVG, fuentes, tono |
| UX | No | Pautas: accesibilidad (AA/AAA), responsive (mobile/desktop-first), densidad |
| Audiencia | No | Perfil: desarrollador, usuario final, admin; nivel técnico |

## Proceso

### Fase 1: Descubrir el proyecto y sus capacidades (reflejo)

Consulta las cúpulas del sistema para obtener toda la información disponible del proyecto:

1. **`cupulas.vista_proyecto.request`** → identidad del proyecto: nombre, dominio, marca (colores, fuentes, logo), configuración, y todos los dominios vivos
2. **`cupulas.listar_cupulas.request`** → catálogo de cúpulas disponibles: skills, agentes, eventos, handlers, blueprints...
3. **Buscar skills de backend** en la cantera: `modules/cosecha/cantera/enki/prisma-*` que describan módulos con eventos (carrito, cobro, cuenta, etc.)
4. **`cupulas.buscar.request`** → busca información adicional relevante para la UI
5. **Como fallback**, si no hay acceso a cúpulas: lee `package.json`, `README.md`, estructura de directorios y busca puntos de entrada del proyecto

Genera un JSON con todo: nombre, dominio, marca, backend_disponible[], cupulas[], eventos[], endpoints[]

### Fase 2: Recopilar inputs adicionales

Si el usuario proveyó marca, UX o audiencia, intégralos. Si no, usa defaults:

- **Marca default:** Paleta neutra (grises #f5f5f5/#333, azul #0066cc), tipografía sistema (system-ui, sans-serif), sin logo
- **UX default:** WCAG AA, mobile-first, densidad media
- **Audiencia default:** Técnico medio, escritorio+móvil

### Fase 3: Sintetizar la UI (agente)

Con todos los inputs disponibles, genera el HTML completo. La UI debe incluir:

1. **Navegación:** Menú lateral colapsable con las secciones del proyecto
2. **Layout:** Adaptado al tipo de proyecto (tabla para APIs, detalle para funciones, etc.)
3. **Contenido:** Datos reales del proyecto + descripciones narrativas coherentes
4. **Datos mock:** Ejemplos funcionales que usen nombres reales del proyecto
5. **Estilo:** CSS variable-driven con colores de marca (o neutros), responsive, tema claro/oscuro automático

**Si se descubrieron cúpulas (skills, eventos, agentes):**
- Usa la identidad del proyecto (`vista_proyecto`) para marca, colores, fuentes, logo — sin preguntar al usuario
- Lee las skills de backend descubiertas y genera UI que llame a sus eventos reales (carrito, cobro, cuenta...)
- Consulta `cupula-eventos` para conocer todos los eventos disponibles y mostrar operaciones reales
- Si hay agentes disponibles, ofrece activarlos desde la UI
- Usa datos reales del sistema en lugar de mocks siempre que sea posible

Reglas:
- HTML semántico con roles ARIA
- Sin dependencias externas (no CDN, no npm)
- Sin backend — todo frontend puro
- Los datos del proyecto son reales; las respuestas/ejecuciones son mock
- El logo de marca va en el header si se proporcionó

### Fase 4: Entregar el HTML

Produce el HTML completo en la respuesta. La persistencia la hace el entorno que ejecuta la skill — no es responsabilidad del agente. El contrato es: el HTML existe como string, listo para escribirse donde corresponda.

## Output

```
┌─────────────────────────────────────────────┐
│  HTML completo y autocontenido              │
│  (todo en un solo archivo)                  │
│                                             │
│  ├── Navegación (menú colapsable)           │
│  ├── Layout (adaptado al tipo de proyecto)  │
│  ├── Contenido (datos reales + narrativa)   │
│  ├── Datos mock (ejemplos funcionales)      │
│  └── Estilo (CSS variable-driven, temas)    │
└─────────────────────────────────────────────┘
```

La skill no decide dónde se escribe, con qué nombre, ni qué technology usa el runner para persistir. Proporciona el HTML; el entorno lo aterriza.

## Entradas

| Input | Requerido | Descripción |
|---|---|---|
| Ruta/anatomía del proyecto | Sí | Path o resumen del proyecto con: nombre, tipo, endpoints[], commands[], routes[], funciones[], eventos[], estructura_arbol |
| Marca | No | Colores, logo SVG, fuentes, tono. Por defecto: paleta neutra, tipografía sistema, sin logo |
| UX | No | Pautas de usabilidad: accesibilidad (AA/AAA), responsive (mobile/desktop-first), densidad (baja/media/alta). Por defecto: AA, mobile-first, media |
| Audiencia | No | Perfil de usuario: nivel técnico, dispositivo, contexto. Por defecto: técnico medio, escritorio+móvil |

Cada input modula el resultado. A más inputs, más matizada la UI. A menos inputs, genérica pero funcional. Siempre produce algo utilizable.

## Formas (del esquema)

El generador se compone de:

- **REFLEJO** (13): Analizador de proyecto, extractor de marca, defaults, selector UX, generación de navegación/layouts/CSS/datos/mocks, entregable
- **MICRO-AGENTE** (2): Tono del contenido según audiencia, prompt del agente sintetizador

## Errores a evitar

- **No generar capas separadas** — la navegación, el estilo y los datos no se construyen por separado y luego se ensamblan. El agente produce un solo HTML que lo sabe todo junto.
- **No inventar datos del proyecto** — los nombres de endpoints, rutas, funciones y comandos deben ser reales. Solo los valores de ejemplo (respuestas mock) son sintéticos.
- **No cargar recursos externos** — ni CDN, ni Google Fonts, ni imágenes externas. El logo debe ir como SVG inline si se proporciona. El HTML debe funcionar sin conexión a internet.
