# 🎓 Tutoriales Event Core - Prompts Maestros

Bienvenido a la colección de **Prompts Maestros** para Event Core. Estos tutoriales están diseñados para ser usados como plantillas de instrucciones completas que guían paso a paso en la implementación de cada aspecto del sistema.

## 📖 ¿Qué son los Prompts Maestros?

Los **Prompts Maestros** son guías estructuradas que proporcionan:
- ✅ **Objetivo claro** de lo que se va a implementar
- ✅ **Fases de implementación** con complejidad estimada
- ✅ **Ejemplos de código completos** y funcionales
- ✅ **Buenas prácticas** y patrones recomendados
- ✅ **Checklist de entrega** para verificar completitud
- ✅ **Comandos de prueba** con curl y herramientas
- ✅ **Referencias** a documentación oficial

Cada tutorial es **genérico y reutilizable**, enfocado en los conceptos y patrones del sistema, no en casos de uso específicos.

---

## 🗂️ Índice de Tutoriales

### 1️⃣ [Crear Módulos con APIs](./01_CREAR_MODULOS_CON_APIS.md)
**Objetivo:** Implementar módulos funcionales con APIs REST, eventos y hooks.

**Temas cubiertos:**
- Estructura de un módulo Event Core
- Definición de APIs en `module.json`
- Implementación de handlers CRUD
- Publicación de eventos MQTT
- Registro de métricas
- Buenas prácticas de seguridad

**Nivel:** Básico → Avanzado
**Story Points:** 3 → 13 (según fase)
**Ejemplos:** TODO List, User Management

**Cuándo usar:**
- Crear un nuevo módulo desde cero
- Agregar APIs REST a un módulo existente
- Implementar operaciones CRUD
- Integrar eventos y métricas

---

### 2️⃣ [Sistema de Validación](./02_SISTEMA_VALIDACION.md)
**Objetivo:** Implementar validación completa usando JSON Schema (AJV).

**Temas cubiertos:**
- Schemas JSON Schema reutilizables
- Validación automática en HTTP Gateway
- Validación manual en módulos
- Validadores personalizados
- Mensajes de error estructurados
- Sanitización de datos

**Nivel:** Básico → Avanzado
**Story Points:** 2 → 8 (según fase)
**Tecnología:** AJV 8.12.0

**Cuándo usar:**
- Validar input de usuarios
- Crear schemas reutilizables
- Implementar validadores complejos
- Garantizar integridad de datos

---

### 3️⃣ [MQTT y Event Bus](./03_MQTT_EVENT_BUS.md)
**Objetivo:** Implementar comunicación basada en eventos usando MQTT pub/sub.

**Temas cubiertos:**
- Publicación de eventos desde módulos
- Suscripción a eventos de otros módulos
- Trazabilidad con correlation IDs
- Patrones pub/sub, request/response, broadcast
- Dead Letter Queue (DLQ)
- Manejo de errores y reintentos

**Nivel:** Básico → Avanzado
**Story Points:** 2 → 13 (según fase)
**Protocolo:** MQTT 3.1.1

**Cuándo usar:**
- Desacoplar módulos
- Crear flujos reactivos
- Implementar integraciones entre servicios
- Rastrear operaciones distribuidas

---

### 4️⃣ [UI JSON-Driven](./04_UI_JSON_DRIVEN.md)
**Objetivo:** Crear interfaces gráficas automáticas usando configuración JSON.

**Temas cubiertos:**
- Vistas automáticas (table, form, detail, dashboard)
- Formularios con validación
- Acciones CRUD
- Navegación automática
- Widgets de dashboard
- Temas personalizables

**Nivel:** Básico → Avanzado
**Story Points:** 5 → 13 (según fase)
**Tecnología:** JSON-Driven UI

**Cuándo usar:**
- Crear UI sin escribir HTML/CSS/JS
- Generar dashboards de monitoreo
- Implementar CRUDs visuales rápidamente
- Prototipar interfaces

---

### 5️⃣ [Logging y Métricas](./05_LOGGING_METRICAS.md)
**Objetivo:** Implementar observabilidad completa con logging estructurado y métricas.

**Temas cubiertos:**
- Logging estructurado en JSON
- Métricas de negocio (counters, gauges, timings)
- Trazabilidad con correlation IDs
- Health checks
- Dashboards de monitoreo
- Exportación a sistemas externos

**Nivel:** Básico → Avanzado
**Story Points:** 2 → 8 (según fase)
**Formato:** JSON structured logging

**Cuándo usar:**
- Monitorear módulos en producción
- Rastrear operaciones distribuidas
- Detectar problemas de performance
- Crear dashboards de negocio

---

### 6️⃣ [Sistema de Hooks](./06_SISTEMA_HOOKS.md)
**Objetivo:** Implementar interceptores para funcionalidad cross-cutting.

**Temas cubiertos:**
- Hooks de ciclo de vida (onLoad, onUnload)
- Hooks de request (beforeRequest, afterRequest)
- Hooks de eventos (beforePublish, afterPublish)
- Hooks personalizados
- Autenticación y autorización
- Rate limiting

**Nivel:** Intermedio → Avanzado
**Story Points:** 2 → 8 (según fase)
**Patrón:** Chain of Responsibility

**Cuándo usar:**
- Implementar autenticación
- Agregar rate limiting
- Transformar requests/responses
- Validar permisos
- Logging centralizado

---

## 🚀 Cómo usar estos tutoriales

### Opción 1: Como guía paso a paso
1. Lee el tutorial completo para entender el alcance
2. Sigue las fases de implementación en orden
3. Implementa los ejemplos de código
4. Prueba con los comandos proporcionados
5. Completa el checklist de entrega

### Opción 2: Como prompt para IA
1. Copia el contenido completo del tutorial
2. Úsalo como prompt para un asistente IA (Claude, GPT, etc.)
3. Proporciona contexto específico de tu caso de uso
4. El asistente implementará siguiendo la estructura del tutorial

### Opción 3: Como referencia
1. Consulta el tutorial cuando necesites implementar esa funcionalidad
2. Adapta los ejemplos a tu caso específico
3. Usa el checklist para verificar completitud

---

## 📊 Matriz de Complejidad

| Tutorial | Nivel Inicial | Nivel Final | Story Points | Tiempo Estimado |
|----------|---------------|-------------|--------------|-----------------|
| 01. Módulos con APIs | Básico | Avanzado | 3-13 | 1h - 2 días |
| 02. Validación | Básico | Avanzado | 2-8 | 30min - 5h |
| 03. MQTT/Event Bus | Básico | Avanzado | 2-13 | 30min - 2 días |
| 04. UI JSON-Driven | Básico | Avanzado | 5-13 | 2h - 2 días |
| 05. Logging/Métricas | Básico | Avanzado | 2-8 | 30min - 5h |
| 06. Hooks | Intermedio | Avanzado | 2-8 | 30min - 5h |

---

## 🎯 Rutas de aprendizaje recomendadas

### Para principiantes
1. **01. Crear Módulos con APIs** (Fase 1: TODO List básico)
2. **02. Sistema de Validación** (Fase 1: Validación inline)
3. **05. Logging y Métricas** (Fase 1-2: Logging básico)
4. **03. MQTT y Event Bus** (Fase 1-2: Publicar/suscribir eventos)

### Para desarrolladores intermedios
1. **01. Crear Módulos con APIs** (Fase 2: User Management)
2. **06. Sistema de Hooks** (Fase 1-3: Autenticación y autorización)
3. **02. Sistema de Validación** (Fase 3-4: Validación avanzada)
4. **04. UI JSON-Driven** (Fase 1-3: Vistas automáticas)

### Para desarrolladores avanzados
1. **01. Crear Módulos con APIs** (Fase 3: Con persistencia)
2. **03. MQTT y Event Bus** (Fase 4: Patrones avanzados)
3. **04. UI JSON-Driven** (Fase 4: Dashboards personalizados)
4. **05. Logging y Métricas** (Fase 5: Dashboard completo)

---

## 🏗️ Stack Tecnológico

- **Runtime:** Node.js 18+
- **Framework:** Event Core (custom event-driven architecture)
- **Protocolo:** MQTT 3.1.1 (Mosquitto)
- **Validación:** AJV 8.12.0 (JSON Schema)
- **Logging:** Winston / Pino (JSON structured)
- **Métricas:** Prometheus compatible
- **UI:** JSON-Driven UI (custom)
- **Compresión:** gzip / brotli
- **Cache:** LRU Cache

---

## 📚 Referencias adicionales

### Documentación oficial
- [`docs/GUIA_CREAR_MODULO.md`](../docs/GUIA_CREAR_MODULO.md) - Guía completa de módulos
- [`docs/GUIA_EVENT_BUS.md`](../docs/GUIA_EVENT_BUS.md) - Sistema de eventos
- [`docs/GUIA_HOOKS.md`](../docs/GUIA_HOOKS.md) - Sistema de hooks
- [`docs/UI_DEVELOPER_GUIDE.md`](../docs/UI_DEVELOPER_GUIDE.md) - UI JSON-Driven
- [`docs/API_SYSTEM.md`](../docs/API_SYSTEM.md) - Sistema de APIs REST

### Módulos de ejemplo
- [`modules/echo/`](../modules/echo/) - Módulo simple de echo
- [`modules/file-watcher/`](../modules/file-watcher/) - Módulo con eventos
- [`modules/ai-gateway/`](../modules/ai-gateway/) - Módulo avanzado

### Código del core
- [`core/gateway/http.js`](../core/gateway/http.js) - HTTP Gateway
- [`core/event-bus/index.js`](../core/event-bus/index.js) - Event Bus
- [`core/validation/manager.js`](../core/validation/manager.js) - ValidationManager
- [`core/logger/index.js`](../core/logger/index.js) - Logger
- [`core/metrics/index.js`](../core/metrics/index.js) - Metrics

---

## 🤝 Contribuir

¿Encontraste un error o tienes una mejora?

1. Crea un issue describiendo el problema o mejora
2. Si quieres contribuir código, haz un fork y crea un PR
3. Asegúrate de seguir el formato de Prompt Maestro
4. Incluye ejemplos funcionales y probados

---

## 📝 Formato de los Prompts Maestros

Todos los tutoriales siguen esta estructura:

1. **Rol activo** - Especialista en el tema
2. **Objetivo general** - Qué se va a implementar
3. **Estructura esperada** - Organización de archivos
4. **Fases de implementación** - Paso a paso con Story Points
5. **Buenas prácticas** - Patrones recomendados
6. **Checklist de entrega** - Verificación de completitud
7. **Ejemplos completos** - Código funcional
8. **Pruebas** - Comandos curl y verificación
9. **Referencias** - Links a documentación oficial

Este formato garantiza que cada tutorial sea **completo, práctico y reutilizable**.

---

## 🔄 Versionado

Estos tutoriales siguen el versionado del sistema Event Core.

**Versión actual:** 1.0.0
**Última actualización:** 2025-01-14
**Compatible con:** Event Core v0.5.0+

---

## ⚖️ Licencia

Los tutoriales están bajo la misma licencia que Event Core.

---

## 👥 Autores

**Event Core Team**

¿Preguntas o sugerencias? Abre un issue en el repositorio.

---

**¡Feliz coding! 🚀**
