---
name: generar-ui-web
description: "Dado un proyecto, genera su interfaz web completa en ui/index.html. Analiza el proyecto, detecta su estructura, y produce un HTML autocontenido con navegación, contenido, datos mock y estilo. Soporta inputs opcionales de marca (colores, logo, fuentes), pautas UX (accesibilidad, responsividad) y perfil de audiencia. A más inputs, más matizada la UI. A menos inputs, genérica pero funcional."
when-to-use: "Cuando necesites generar una interfaz web para cualquier proyecto desde su código. Úsala para prototipar UIs, visualizar APIs, documentar CLIs, o inspeccionar la estructura de un proyecto event-driven. No la uses cuando la UI requiera backend real, autenticación, o datos vivos — la UI generada es frontend puro con datos mock."
fuente: enki
dominio: desarrollo
lente_dominio: ui
lente_tarea: generar-ui
tags: [ui, web, generacion, frontend, html, prototipado, proyecto, analisis]
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

### Fase 1: Analizar el proyecto (reflejo)

1. Detecta el tipo: API, CLI, app-web, librería, event-driven, o genérico
2. Lee `package.json`, `README.md`, estructura de directorios
3. Busca puntos de entrada: rutas de API, comandos CLI, rutas SvelteKit/Next, eventos MQTT
4. Genera un JSON resumen con: nombre, tipo, endpoints[], commands[], routes[], funciones[], eventos[], estructura_arbol

### Fase 2: Recopilar inputs adicionales

Si el usuario proveyó marca, UX o audiencia, intégralos. Si no, usa defaults:
- **Marca default:** Paleta neutra, tipografía sistema, sin logo
- **UX default:** WCAG AA, mobile-first, densidad media
- **Audiencia default:** Técnico medio, escritorio+móvil

### Fase 3: Sintetizar la UI (agente)

Con todos los inputs disponibles, genera el HTML completo. Debe incluir:

1. **Navegación:** Menú lateral colapsable con las secciones del proyecto
2. **Layout:** Adaptado al tipo de proyecto
3. **Contenido:** Datos reales del proyecto + descripciones narrativas
4. **Datos mock:** Ejemplos funcionales que usen nombres reales del proyecto
5. **Estilo:** CSS variable-driven con colores de marca (o neutros), responsive, tema claro/oscuro

Reglas:
- HTML semántico con roles ARIA
- Sin dependencias externas
- Sin backend — todo frontend puro
- Los datos del proyecto son reales; las respuestas son mock

### Fase 4: Escribir (reflejo)

Crea `ui/index.html` en la raíz del proyecto.

## Arquitectura (convergente)

No hay capas separadas de navegación, contenido y estilo. El generador recibe todos los inputs (proyecto ± marca ± UX ± audiencia) y produce un solo HTML que lo sabe todo junto. A más inputs, más matizada la UI. A menos inputs, genérica pero funcional.

**Formas:** 13 REFLEJO + 2 MICRO-AGENTE. El núcleo es mayoritariamente determinista.
