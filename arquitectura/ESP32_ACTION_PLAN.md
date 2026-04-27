# Plan de Acción — Módulos ESP32 Firmware

**Fecha:** 2026-04-27  
**Estado:** Análisis completado. Acciones recomendadas.

---

## Resumen Ejecutivo

Los 4 módulos ESP32 existentes **respetan el paradigma Event-Core en general**, pero tienen **3 problemas de acoplamiento** que requieren correcciones puntuales:

| Problema | Severidad | Acción | Esfuerzo |
|----------|-----------|--------|----------|
| Metadatos incompletos en `build_completed` | 🔴 ALTA | Enriquecer eventos con `firmware_*` metadata | 2-3h |
| Doble compilador (esp32-dev + firmware-builder) | 🔴 ALTA | Converger o documentar claramente | 4-6h |
| Sin retroalimentación de flash → firmware-manager | 🔴 ALTA | esp32-flasher emite evento nuevo | 2-3h |
| Listeners sin documentación | 🟡 MEDIA | Documentar qué hace cada listener | 1h |

---

## Análisis Detallado

Se han creado 4 documentos de arquitectura bajo `arquitectura/`:

1. **esp32-modules-analysis.md** — Análisis completo con flujos y problemas
2. **esp32-dev.json** — Mapa del módulo esp32-dev
3. **esp32-flasher.json** — Mapa del módulo esp32-flasher
4. **firmware-manager.json** — Mapa del módulo firmware-manager
5. **firmware-builder.json** — Mapa del módulo firmware-builder

Cada uno contiene:
- Responsabilidad única y dominio
- Eventos que emite y escucha
- Flujos de dominio paso a paso
- Problemas detectados y soluciones

---

## 🚨 PROBLEMA 1: Metadatos Incompletos en build_completed

### Síntoma
```javascript
// Evento incompleto
esp32.build_completed {
  project_name: 'print-proxy',
  binary_path: '/data/.../firmware.bin',
  binary_size: 262144,
  duration_ms: 45000
  // Faltan: firmware_type, firmware_version, utility, board, capabilities
}

// firmware-manager debe adivinar
const firmware_type = event.project_name;  // ← Adivinanza frágil
const version = ???;  // ← No sabe extraer
```

### Impacto
- firmware-manager no puede auto-registrar binarios confiablemente
- Si esp32-dev cambia estructura, auto-registro falla silenciosamente
- No hay versionado semver garantizado

### Solución
**Enriquecer `esp32.build_completed` y `firmware.build_completed` con metadata:**

```javascript
// Nuevo schema completo
esp32.build_completed {
  // Actuales
  project_name: 'print-proxy',
  board: 'esp32dev',
  binary_path: '/data/.../firmware.bin',
  binary_size: 262144,
  duration_ms: 45000,
  
  // NUEVOS — metadatos de firmware
  framework: 'arduino',  // o 'espidf'
  firmware_type: 'print-proxy',  // Extraído de platformio.ini [env] o manifest.json
  firmware_version: '1.2.0',  // CRÍTICO: semver extraído de platformio.ini
  firmware_utility: 'Gateway de impresora térmica',  // De manifest.json
  firmware_board: 'esp32dev',  // Confirm del board compilado
  firmware_capabilities: ['ota', 'mqtt', 'serial-debug']  // De manifest.json
}
```

**Cómo extraer versión en esp32-dev:**

1. **Preferencia:** Leer de `firmware/drivers/{project_name}/manifest.json` si existe
2. **Alternativa:** Leer de `platformio.ini` → `build_flags = -DVERSION=\"X.Y.Z\"`
3. **Fallback:** Usar hash del commit o timestamp

**Acción inmediata:**
- [ ] Actualizar schema en `modules/esp32-dev/schemas/events.json`
- [ ] Actualizar schema en `modules/firmware-builder/schemas/events.json`
- [ ] Modificar handlers en esp32-dev para extraer metadata
- [ ] Modificar handlers en firmware-builder para extraer metadata
- [ ] Actualizar `firmware-manager.onBuildCompleted()` para usar nuevos campos

**Esfuerzo:** 2-3 horas

---

## 🚨 PROBLEMA 2: Doble Compilador (esp32-dev + firmware-builder)

### Síntoma
Dos módulos independientes que hacen lo mismo:
- `esp32-dev` → compila proyectos de usuario
- `firmware-builder` → compila drivers pre-empaquetados

Ambos emiten eventos de build con nombres diferentes:
- `esp32.build_completed` → esp32-dev
- `firmware.build_completed` → firmware-builder

firmware-manager debe escuchar AMBOS:
```javascript
subscribes: [
  { event: "firmware.build_completed", handler: "onBuildCompleted" },
  { event: "esp32.build_completed", handler: "onBuildCompleted" }  // ← Duplicación
]
```

### Impacto
- Lógica de compilación duplicada
- Handlers acoplados a dos esquemas similares
- Si alguien cambia uno, puede romper el otro
- Confusión sobre cuándo usar cada uno

### Solución

**OPCIÓN A (Recomendada): Integrar drivers en esp32-dev**

```
firmware-builder → DEPRECADO
esp32-dev → absorbe `firmware/drivers/` como tipo especial de "proyecto"

Estructura nueva:
data/esp32-dev/projects/
  ├── user-project-1/        ← Proyecto de usuario (templates)
  ├── user-project-2/
  └── drivers/               ← Drivers del sistema
      ├── print-proxy/
      ├── gateway-ble/
      └── ...

Evento único: esp32.build_completed (para todo)
firmware-manager escucha un solo evento
```

**Ventajas:**
- Un compilador, una lógica
- Un evento, sin duplicación
- Escala fácil

**OPCIÓN B (Alternativa): Documentar claramente**

Si firmware-builder debe existir para motivos históricos o organizacionales:
- Documentar explícitamente cuándo usar cada uno
- Crear esquema de eventos IDÉNTICO
- Renombrar eventos para claridad: `esp32.built` (unificado)
- Dejar firmware-builder como "legacy" con EOL

### Recomendación Inmediata
Crear documento `arquitectura/compiler-strategy.md` que:
1. Explique por qué existen dos compiladores
2. Documento si es intencional o deuda técnica
3. Roadmap: ¿cuándo convergemos?

**Acción pendiente:**
- [ ] Decidir: OPCIÓN A o OPCIÓN B
- [ ] Si OPCIÓN A: Refactor (día completo)
- [ ] Si OPCIÓN B: Documentación (2h)

**Esfuerzo:** 4-6 horas (OPCIÓN A) o 2h (OPCIÓN B)

---

## 🚨 PROBLEMA 3: Sin Retroalimentación de Flash → firmware-manager

### Síntoma
El flujo de flash serial está **aislado** del flujo de OTA:

```
FLUJO 1: Flash Serial (esp32-flasher)
┌────────────────────┐
│ Flash via USB      │
│ esp32-flasher      │
│ flash.completed    │
└────────────────────┘
        ↓
      [Nadie escucha]
        
FLUJO 2: OTA Remoto (firmware-manager)
┌────────────────────┐
│ OTA via MQTT       │
│ device-shadow      │
│ ota_completed      │
└────────────────────┘

Sin visibilidad integrada: ¿Tuvo éxito el flash?
```

### Impacto
- No hay forma de saber si device tiene la versión correcta flashed (vs. OTA)
- UI no puede mostrar versión actual del device si fue flashed localmente
- firmware-manager no sabe que ocurrió un flash

### Solución
**esp32-flasher emite nuevo evento que firmware-manager escucha:**

```javascript
// esp32-flasher → tras flash exitoso
flash.device_updated {
  device_id: string,  // REQUIERE: contexto que sabe qué device es
  firmware_type: string,
  firmware_version: string,
  method: 'serial'
}

// firmware-manager.subscribes
{
  event: "flash.device_updated",
  handler: "onDeviceUpdated",
  logic: "Actualizar device-shadow desired.firmware para que reported sincronice"
}
```

**Desafío:** esp32-flasher no sabe el device_id. Solución:
1. **UI pasa device_id en flash.start()**
2. **esp32-flasher cachea device_id durante la sesión**
3. **Al completar, emite con device_id**

```javascript
// UI
flash.start({
  port: '/dev/ttyUSB0',
  binary_path: '...',
  device_id: 'esp32-001'  // ← NUEVO: contexto
})

// esp32-flasher
this.eventBus.publish('flash.device_updated', {
  device_id: sessionContext.device_id,
  firmware_type: 'print-proxy',
  firmware_version: '1.2.0',
  method: 'serial'
})
```

**Acción inmediata:**
- [ ] Actualizar `flash.start()` handler para aceptar `device_id` (opcional)
- [ ] Crear nuevo evento `flash.device_updated` en esp32-flasher
- [ ] Actualizar firmware-manager para escuchar y reaccionar
- [ ] Tests

**Esfuerzo:** 2-3 horas

---

## 🟡 PROBLEMA 4: Listeners sin Documentación

### Síntoma
Algunos listeners existen pero no tienen propósito claro documentado:

| Listener | Describe | Propósito Real |
|----------|----------|----------------|
| `firmware-manager.onDeviceRegistered` | "Verifica firmware de nuevos dispositivos" | ??? |
| `esp32-flasher.onBuildCompleted` | "Notifica que hay un binario listo para flashear" | Cache 5m? Suggeste? |

### Impacto
- Confusión para próximos desarrolladores
- Riesgo de que listeners se eliminen accidentalmente
- No está claro si son esenciales

### Solución
**Documentar EXPLÍCITAMENTE en cada módulo:**

```javascript
// En modules/firmware-manager/index.js
// LISTENER: onDeviceRegistered
// Propósito: Validar que nuevo device tiene firmware compatible
// Lógica: 1) Busca device_type en registry
//         2) Busca firmware compatible en catálogo
//         3) Si no existe → log de advertencia
// NO hace: No asigna firmware automáticamente
// TODO: ¿Es realmente necesario? ¿O es consulta directa?
```

**Acción inmediata:**
- [ ] Añadir comentarios en cada listener documentando propósito + lógica
- [ ] Actualizar `arquitectura/*.json` con secciones de listeners

**Esfuerzo:** 1 hora

---

## 📋 Orden de Implementación (Recomendado)

### Corto Plazo (Esta semana)

1. **Documentación** (2h)
   - [x] Crear análisis (DONE)
   - [x] Crear mapas de arquitectura (DONE)
   - [ ] Commit y push a rama

2. **Problema 4** (1h) — Listeners sin documentación
   - [ ] Documentar cada listener en código
   - [ ] Test que todos los listeners existan y sean alcanzables

3. **Problema 1** (2-3h) — Metadatos en build_completed
   - [ ] Crear schema enriquecido
   - [ ] Actualizar esp32-dev para extraer metadata
   - [ ] Actualizar firmware-builder para extraer metadata
   - [ ] Tests unitarios
   - [ ] Actualizar firmware-manager.onBuildCompleted()

### Mediano Plazo (Próxima 2 semanas)

4. **Problema 3** (2-3h) — Flash → firmware-manager retroalimentación
   - [ ] Modificar flash.start() para aceptar device_id
   - [ ] Crear nuevo evento flash.device_updated
   - [ ] Actualizar firmware-manager para escuchar
   - [ ] Tests

5. **Problema 2** (4-6h) — Decisión sobre compiladores
   - [ ] Crear documento `arquitectura/compiler-strategy.md`
   - [ ] Decidir OPCIÓN A o B en reunión de equipo
   - [ ] Implementar según decisión

### Largo Plazo (Refactoring)

6. Metrics y observabilidad
7. Integración bidireccional entre todos los módulos

---

## Documentos Creados

- ✅ `arquitectura/esp32-modules-analysis.md` — Análisis completo
- ✅ `arquitectura/esp32-dev.json` — Mapa esp32-dev
- ✅ `arquitectura/esp32-flasher.json` — Mapa esp32-flasher  
- ✅ `arquitectura/firmware-manager.json` — Mapa firmware-manager
- ✅ `arquitectura/firmware-builder.json` — Mapa firmware-builder
- ✅ `arquitectura/ESP32_ACTION_PLAN.md` — Este documento (plan de acción)

---

## Próximos Pasos

1. **Revisar este análisis** — ¿Están de acuerdo los hallazgos?
2. **Priorizar problemas** — ¿Cuál atacamos primero?
3. **Decidir sobre firmware-builder** — ¿OPCIÓN A o B?
4. **Crear branch** — `feature/fix-esp32-architecture`
5. **Implementar cambios** — Problema por problema
6. **Tests** — Asegurar que flujos funcionan
7. **PR y review** — Documentar cambios

---

## Conclusión

El ecosistema ESP32 **está bien conceptualmente** pero tiene **rozaduras de acoplamiento** que degradan mantenibilidad. Las correcciones son **puntuales y no requieren refactor mayor**.

**Tiempo total estimado:** 10-14 horas (incluyendo tests y documentación)

El paradigma Event-Core está **presente y se respeta**. Solo necesita **enriquecimiento de eventos** y **convergencia de compiladores**.
