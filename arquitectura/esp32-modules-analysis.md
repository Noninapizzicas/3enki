# Análisis de Módulos ESP32 — Paradigma Event-Core

**Fecha:** 2026-04-27  
**Paradigma:** Emite evento. Quien sabe, hace. Tú no sabes cómo.

---

## Resumen Ejecutivo

El ecosistema ESP32 en 2enki consta de 4 módulos backend que cubren **el ciclo completo: desarrollo → compilación → flash → gestión OTA**.

| Módulo | Tier | Dominio | Emite | Escucha |
|--------|------|---------|-------|---------|
| **esp32-dev** | tier_3 | Desarrollo de firmware: templates, scaffolding, compilación | `esp32.project_created`, `esp32.build_*` | (ninguno) |
| **firmware-builder** | tier_3 | Compilación de drivers ESP32 via PlatformIO | `firmware.build_*` | (ninguno) |
| **esp32-flasher** | tier_3 | Grabación en ESP32 via serie + monitor serial | `flash.*` | `firmware.build_completed` |
| **firmware-manager** | tier_3 | Catálogo de firmware + orquestación OTA | `firmware.registered`, `firmware.ota_*` | `shadow.updated`, `device.registered`, `firmware.build_completed`, `esp32.build_completed` |

---

## 1. esp32-dev — Desarrollo

### Identidad
**Responsabilidad única:** Gestionar el ciclo de desarrollo de firmware ESP32 en el contexto de un proyecto.  
**Conoce:** Templates, proyectos de firmware, compilación con PlatformIO  
**NO debería conocer:** SQLite, persistencia, OTA, flash serial, catálogos

### ¿Qué eventos emite?

```json
{
  "esp32.project_created": {
    "project_name": "string",
    "template": "string",
    "board": "string",
    "framework": "string (arduino|espidf)"
  },
  "esp32.build_started": {
    "project_name": "string",
    "board": "string",
    "timestamp": "ISO8601"
  },
  "esp32.build_completed": {
    "project_name": "string",
    "board": "string",
    "binary_path": "string",
    "binary_size": "integer",
    "duration_ms": "integer"
  },
  "esp32.build_failed": {
    "project_name": "string",
    "board": "string",
    "error": "string",
    "exit_code": "integer",
    "duration_ms": "integer"
  }
}
```

### ¿Qué eventos escucha?
**Ninguno.** `esp32-dev` es reactivo vía UI handlers. No orquesta ni espera confirmaciones.

### Flujo de dominio
```
UI: "Crear proyecto" 
  → esp32-dev emite: esp32.project_created
  → (Quien sabe qué pasa después — esp32-dev no le importa)

UI: "Compilar proyecto"
  → esp32-dev emite: esp32.build_started
  → ... compilación PlatformIO ...
  → esp32-dev emite: esp32.build_completed + binary_path
  → (Quien sabe qué pasa después)
```

### ¿Qué está BIEN?
✅ Emite eventos claros con datos de dominio  
✅ No instancia servicios de persistencia  
✅ Delega la compilación a herramientas externas (PlatformIO)  
✅ No controla el flujo post-evento

### ¿Qué está MAL?

❌ **PROBLEMA 1: Falta metadato crítico en `build_completed`**

El evento `esp32.build_completed` incluye `binary_path` pero no:
- `tipo_firmware` → sin esto, `firmware-manager` no sabe qué firmware registrar
- `version` → sin esto, no hay versionado semver
- `sha256` → sin esto, no hay validación de integridad
- `utility` / `description` → sin esto, el firmware no tiene contexto

```javascript
// MAL — incompleto
this.eventBus.publish('esp32.build_completed', {
  project_name: 'print-proxy',
  binary_path: '/data/esp32-dev/projects/print-proxy/build/firmware.bin',
  binary_size: 262144,
  duration_ms: 45000
});
// ¿Qué debería hacer un listener? ¿Registrarlo? ¿Con qué nombre?
```

**SOLUCIÓN:** Enriquecer el evento con metadatos de dominio:
```javascript
// BIEN — completo
this.eventBus.publish('esp32.build_completed', {
  project_name: 'print-proxy',
  framework: 'arduino',
  board: 'esp32dev',
  binary_path: '/data/esp32-dev/projects/print-proxy/build/firmware.bin',
  binary_size: 262144,
  duration_ms: 45000,
  
  // Metadatos para firmware-manager
  firmware_type: 'print-proxy',
  firmware_version: '1.2.0',  // Leer de platformio.ini o manifest
  firmware_utility: 'Gateway de impresora térmica',
  firmware_board: 'esp32dev',
  firmware_capabilities: ['ota', 'mqtt', 'serial-debug']
});
```

---

## 2. firmware-builder — Compilación de Drivers

### Identidad
**Responsabilidad única:** Compilar drivers ESP32 desde código fuente via PlatformIO.  
**Conoce:** Drivers, compilación, PlatformIO  
**NO debería conocer:** Proyectos de usuarios, templates, catálogos, persistencia

### ¿Qué eventos emite?

```json
{
  "firmware.build_started": {
    "driver": "string"
  },
  "firmware.build_completed": {
    "driver": "string",
    "binary_path": "string",
    "binary_size": "integer",
    "duration_ms": "integer"
  },
  "firmware.build_failed": {
    "driver": "string",
    "error": "string",
    "exit_code": "integer"
  }
}
```

### ¿Qué eventos escucha?
**Ninguno.** Reactivo vía UI handlers.

### ¿Qué está MAL?

❌ **PROBLEMA: Duplicación de responsabilidad con `esp32-dev`**

Hay **DOS** módulos que compilan firmware:
- `esp32-dev` → compila proyectos de usuarios
- `firmware-builder` → compila drivers de sistema

Esto viola Event-Core porque:
1. El sistema tiene **dos compiladores** en lugar de **un orquestador**
2. La ruta `esp32-dev → compilar → resultado` y `firmware-builder → compilar → resultado` son paralelas
3. `firmware-manager` debe escuchar **AMBOS** para auto-registrar

**Síntoma visible:** `firmware-manager` escucha tanto `firmware.build_completed` como `esp32.build_completed`:
```javascript
subscribes: [
  { event: "firmware.build_completed", handler: "onBuildCompleted" },
  { event: "esp32.build_completed", handler: "onBuildCompleted" },  // ← compatibilidad
]
```

**SOLUCIÓN ARQUITECTÓNICA:** Unificar bajo un solo dominio. Opciones:

**Opción A (Recomendada):** Eliminar `firmware-builder`, integrar drivers en `esp32-dev`
```
esp32-dev conoce:
  - Proyectos de usuario (templates + custom)
  - Drivers de sistema (directorio separado pero mismo compilador)
  
Resultado: Un único evento `esp32.build_completed` que `firmware-manager` escucha
```

**Opción B:** Integrar ambos bajo un servicio orquestador nuevo `firmware-compiler`
```
firmware-compiler orquesta:
  - esp32-dev: compila proyectos
  - firmware-builder: compila drivers
  - Emite: firmware.compiled (unificado)
  
Pero esto agrega otra capa (no recomendado).
```

**Acción inmediata:** Documentar la **intención** de cada módulo:
- `firmware-builder` → **Legacy**: Compilación aislada de drivers pre-empaquetados
- `esp32-dev` → **Futuro**: Compilación unificada de proyectos + drivers

---

## 3. esp32-flasher — Flash Serial

### Identidad
**Responsabilidad única:** Grabar firmware en ESP32 via puertos serie + monitoreo.  
**Conoce:** Puertos serie, herramientas de flash (esptool, platformio), monitor serial  
**NO debería conocer:** Firmwares, catálogos, OTA, WiFi, registros

### ¿Qué eventos emite?

```json
{
  "flash.started": {
    "flash_id": "string",
    "port": "string",
    "method": "esptool | platformio | esphome | mpremote",
    "binary_path": "string",
    "timestamp": "ISO8601"
  },
  "flash.progress": {
    "flash_id": "string",
    "stage": "connecting | erasing | writing | verifying",
    "percent": "0-100",
    "message": "string"
  },
  "flash.completed": {
    "flash_id": "string",
    "port": "string",
    "method": "string",
    "duration_ms": "integer"
  },
  "flash.failed": {
    "flash_id": "string",
    "port": "string",
    "error": "string"
  },
  "flash.serial_output": {
    "port": "string",
    "line": "string",
    "timestamp": "ISO8601"
  }
}
```

### ¿Qué eventos escucha?

```json
{
  "firmware.build_completed": {
    "handler": "onBuildCompleted",
    "descripción": "Notifica que hay un binario listo para flashear"
  }
}
```

### ¿Qué está BIEN?
✅ Emite eventos detallados de progreso  
✅ Escucha eventos de build para notificar disponibilidad  
✅ No controla catálogos ni persistencia  
✅ Métodos de flash separados (esptool, platformio, esphome, mpremote)

### ¿Qué está MAL?

❌ **PROBLEMA: Ligadura débil en el listener**

El handler `onBuildCompleted` recibe `firmware.build_completed` pero no sabe qué hacer:
```javascript
// En el módulo esp32-flasher
subscribes: [
  {
    event: "firmware.build_completed",
    handler: "onBuildCompleted",
    description: "Notifica que hay un binario listo para flashear"
  }
]
```

**Preguntas sin responder:**
- ¿Qué hace `onBuildCompleted`? ¿Cachea el binario? ¿Crea una recomendación UI?
- ¿Cómo sabe si el binario es "flasheable" (no un driver, no un fragmento)?
- ¿Debería sugerir auto-flash al usuario o esperar comando manual?

**SOLUCIÓN:** Documentar explícitamente la intención:
```json
{
  "event": "firmware.build_completed",
  "handler": "onBuildCompleted",
  "description": "Cachea binario recién compilado para sugerencia rápida en UI",
  "logic": "Si binary_path existe → guardar en memoria con TTL 5m → disponible para flash.start sin re-seleccionar",
  "NO hace": "No inicia flash automático. No valida. No registra en catálogo."
}
```

---

## 4. firmware-manager — Catálogo + OTA

### Identidad
**Responsabilidad única:** Registro y versionado de firmware, orquestación de OTA.  
**Conoce:** Catálogo, versionado semver, checksums, device-shadow, OTA  
**NO debería conocer:** Compilación, flash serial, proyectos, drivers

### ¿Qué eventos emite?

```json
{
  "firmware.registered": {
    "type": "string",
    "version": "semver",
    "sha256": "hex(64)"
  },
  "firmware.ota_requested": {
    "device_id": "string",
    "type": "string",
    "target_version": "semver",
    "firmware_url": "/firmware/...",
    "timestamp": "ISO8601"
  },
  "firmware.ota_completed": {
    "device_id": "string",
    "type": "string",
    "to": "semver",
    "status": "completed",
    "duration_ms": "integer"
  },
  "firmware.ota_failed": {
    "device_id": "string",
    "type": "string",
    "to": "semver",
    "status": "failed",
    "reason": "timeout | version_mismatch | stale_cleanup"
  }
}
```

### ¿Qué eventos escucha?

```json
{
  "shadow.updated": {
    "handler": "onShadowUpdated",
    "descripción": "Detecta cuando reported.firmware cambia (OTA completada)"
  },
  "device.registered": {
    "handler": "onDeviceRegistered",
    "descripción": "Verifica firmware de dispositivos nuevos"
  },
  "firmware.build_completed": {
    "handler": "onBuildCompleted",
    "descripción": "Auto-registra firmware tras build exitoso"
  },
  "esp32.build_completed": {
    "handler": "onBuildCompleted",
    "descripción": "Compatibilidad: auto-registra desde esp32-dev"
  }
}
```

### ¿Qué está BIEN?
✅ Orquesta OTA via device-shadow sin interferir  
✅ Emite eventos de ciclo completo (requested → completed/failed)  
✅ Valida checksums antes de registrar  
✅ Escucha múltiples fuentes de build (firmware-builder + esp32-dev)  
✅ Manejo de timeout y stale builds

### ¿Qué está MAL?

❌ **PROBLEMA 1: Lógica de auto-registro acoplada**

```javascript
subscribes: [
  { event: "firmware.build_completed", handler: "onBuildCompleted" },
  { event: "esp32.build_completed", handler: "onBuildCompleted" }  // ← mismo handler
]
```

El mismo handler `onBuildCompleted` recibe eventos de **dos orígenes diferentes** con **esquemas parcialmente diferentes**:

| Evento | Tiene | No tiene |
|--------|-------|----------|
| `firmware.build_completed` | `driver` | `firmware_type`, `version`, `utility` |
| `esp32.build_completed` | `project_name` | `firmware_type`, `version`, `utility` |

**El handler debe adivinar:**
```javascript
onBuildCompleted(event) {
  const firmware_type = event.driver || event.project_name;  // ← Adivinanza
  const version = ???;  // ← No está en el evento
  const utility = ???;  // ← No está en el evento
}
```

**SOLUCIÓN:** Enriquecer los eventos de build con metadatos de firmware (ver sección esp32-dev).

❌ **PROBLEMA 2: Escucha innecesaria de `device.registered`**

```javascript
{
  event: "device.registered",
  handler: "onDeviceRegistered",
  description: "Verifica firmware de nuevos dispositivos registrados"
}
```

**Pregunta:** ¿Qué hace realmente `onDeviceRegistered`?  
**Probable respuesta:** Nada. Solo registra el dispositivo internamente o verifica que exista en el catálogo.

Esto no debería requerir escucha del evento — es una consulta:
```javascript
// Mejor: device-registry o device-shadow llama a firmware-manager.checkDeviceFirmware()
// No: firmware-manager escucha device.registered
```

**Acción:** Documentar o eliminar este listener.

❌ **PROBLEMA 3: Compatibilidad cruzada fragada**

```javascript
{
  event: "esp32.build_completed",
  handler: "onBuildCompleted",
  description: "Compatibilidad: auto-registra firmware desde legacy esp32-dev"
}
```

La palabra **"Compatibilidad"** es una bandera roja. Indica que:
1. Hubiera dos formas de hacer lo mismo
2. Se generó código para "hacer funcionar" ambas
3. Violación de "un módulo, un evento"

**Acción arquitectónica:** Converger a un único evento. Eliminar "compatibilidad" cuando sea posible.

---

## Matriz de Flujos Actuales

```
┌─────────────────────────────────────────────────────────────────────┐
│ FLUJO 1: esp32-dev → Compilar Proyecto                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  UI → esp32-dev.build                                               │
│  esp32-dev → emite: esp32.build_started                             │
│  esp32-dev → compila con PlatformIO                                 │
│  esp32-dev → emite: esp32.build_completed                           │
│    ├─ Escucha: firmware-manager.onBuildCompleted()                  │
│    │   └─ ??? ¿Registra en catálogo? ¿Con qué version?            │
│    └─ Escucha: esp32-flasher.onBuildCompleted()                     │
│       └─ Cachea binario para sugerencia rápida en UI                │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ FLUJO 2: firmware-builder → Compilar Driver                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  UI → builder.build                                                 │
│  firmware-builder → emite: firmware.build_started                   │
│  firmware-builder → compila con PlatformIO                          │
│  firmware-builder → emite: firmware.build_completed                 │
│    └─ Escucha: firmware-manager.onBuildCompleted()                  │
│       └─ ??? ¿Registra en catálogo? ¿Extrae version de dónde?     │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ FLUJO 3: esp32-flasher → Flash Serial                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  UI → flash.start({ port, binary_path, method })                    │
│  esp32-flasher → emite: flash.started                               │
│  esp32-flasher → escribe en puerto serie                            │
│  esp32-flasher → emite: flash.progress (N veces)                    │
│  esp32-flasher → emite: flash.completed                             │
│                                                                       │
│  NO conectado con firmware-manager OTA                              │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ FLUJO 4: firmware-manager → OTA via Device-Shadow                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  UI → firmware.trigger-ota({ device_id, type, version })            │
│  firmware-manager → escribe desired.firmware en device-shadow        │
│  firmware-manager → emite: firmware.ota_requested                    │
│  device-shadow → device reporta actual via MQTT                     │
│  device-shadow → emite: shadow.updated                              │
│    └─ Escucha: firmware-manager.onShadowUpdated()                   │
│       ├─ Si reported.firmware == desired.firmware                    │
│       │  └─ firmware-manager → emite: firmware.ota_completed        │
│       └─ Si timeout o mismatch                                      │
│          └─ firmware-manager → emite: firmware.ota_failed           │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Análisis de Problemas Según Event-Core

### 🔴 Violaciones Detectadas

**1. Doble compilador (esp32-dev + firmware-builder)**
- **Violación:** Un módulo NO debería tener responsabilidades duplicadas
- **Impacto:** Dos eventos de build, dos listeners, lógica condicional en firmware-manager
- **Acción:** Converger a un único compilador

**2. Auto-registro fragado en firmware-manager**
- **Violación:** firmware-manager recibe eventos incompletos y debe adivinar metadatos
- **Impacto:** Frágil a cambios en esp32-dev o firmware-builder
- **Acción:** Enriquecer eventos de build con all metadatos

**3. Flash serial no conectado con OTA**
- **Violación:** esp32-flasher emite flash.completed pero no lo conecta con firmware-manager
- **Impacto:** No hay visibilidad integrada: ¿el device tiene la versión flashed?
- **Acción:** esp32-flasher debería emitir evento que registre en firmware-manager

---

## Recomendaciones

### Corto Plazo (Implementación Inmediata)

1. **Enriquecer `esp32.build_completed`** con metadatos de firmware:
   ```javascript
   {
     project_name, framework, board,  // ← Actual
     firmware_type, firmware_version, firmware_utility, firmware_board  // ← Nuevo
   }
   ```

2. **Documentar listeners** en CLAUDE.md o arquitectura/firebase-manager.json:
   ```json
   {
     "listener": "onBuildCompleted",
     "handles": ["firmware.build_completed", "esp32.build_completed"],
     "logic": "Si evento contiene binary_path → validar + registrar en catálogo con metadatos del evento"
   }
   ```

3. **Eliminar "compatibilidad"** si es posible:
   - Una sola fuente de verdad: `esp32.build_completed` (unifica esp32-dev + firmware-builder)

### Mediano Plazo (Próximo Sprint)

4. **Crear `arquitectura/esp32-modules.json`** con:
   - Mapa de eventos por módulo
   - Flujos de dominio (qué espera cada módulo del siguiente)
   - Dependencias y acoplamiento

5. **Conectar esp32-flasher con firmware-manager:**
   ```javascript
   // esp32-flasher → al completar flash exitoso
   this.eventBus.publish('firmware.flashed_on_device', {
     device_id: ???,  // ← Necesita extraer del contexto de flash
     type: firmware_type,
     version: firmware_version,
     method: 'serial'
   });
   
   // firmware-manager escucha y actualiza shadow desired
   ```

6. **Documentar intent de cada módulo** en `modules/*/README.md`:
   - esp32-dev: Desarrollo local
   - firmware-builder: Compilación aislada (legacy o drivers)
   - esp32-flasher: Flash serial local
   - firmware-manager: Catálogo + OTA remoto

### Largo Plazo (Refactoring)

7. **Unificar compiladores** (esp32-dev absorbe firmware-builder)
8. **Crear servicio de introspección** que extraiga versión de platformio.ini automáticamente
9. **Integración bidireccional:** Flash serial → register in firmware-manager
10. **Observabilidad:** Métricas de flujo completo (template → build → flash → OTA)

---

## Matriz de Decisiones

| Pregunta | Estado | Acción |
|----------|--------|--------|
| ¿Dos compiladores es intencional? | ❓ | Documentar. Si no, converger. |
| ¿firmware-manager debe auto-registrar builds? | ✅ Sí | Enriquecer eventos. |
| ¿esp32-flasher → firmware-manager feedback? | ❌ No | Añadir listener. |
| ¿device.registered → firmware-manager es útil? | ❓ | Documentar o remover. |
| ¿Hay otras fuentes de firmware que faltan? | ❓ | Esphome, MicroPython, other? |

---

## Conclusión

El sistema **respeta Event-Core en la mayoría de casos**, pero tiene **rozaduras de acoplamiento**:

1. **esp32-dev y firmware-builder son gemelos** que deberían ser uno
2. **firmware-manager adivina metadatos** en lugar de recibirlos
3. **esp32-flasher no retroalimenta** al catálogo

Resolver esto requiere **enriquecer eventos**, no refactoring mayor.

**Recomendación:** Crear `arquitectura/esp32-modules.json` como source of truth para este análisis.
