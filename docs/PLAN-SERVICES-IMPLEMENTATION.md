# Plan de Implementación - Arquitectura de Servicios

**Fecha:** 2026-01-10
**Estado:** Propuesto - Pendiente de análisis
**Referencia:** `contexto/services.json`

---

## Resumen

Implementar la arquitectura de servicios que separa:
- **Providers externos** (Google, Anthropic, ElevenLabs, Telegram) → APIs HTTP
- **Servicios locales** (PDF, CSV, XLSX, Tesseract) → Sin dependencia externa
- **Módulos existentes** → Se mantienen (ai-gateway, telegram-service, etc.)

---

## Fases de Implementación

### Fase 1: Core Infrastructure

**Objetivo:** Crear el sistema de descubrimiento y ejecución de providers.

**Archivos a crear:**

| Archivo | Descripción |
|---------|-------------|
| `core/providers/loader.js` | Descubre providers en `services/providers/` |
| `core/providers/registry.js` | Registro de providers y funciones disponibles |
| `core/providers/executor.js` | Ejecuta funciones (HTTP para externos, directo para locales) |

**Tareas:**

1. **loader.js**
   - Escanear `services/providers/`
   - Leer `provider.json` de cada carpeta externa
   - Leer `functions/*.json` de cada provider
   - Leer `index.js` de cada servicio local
   - Registrar todo en el registry

2. **registry.js**
   - Mantener Map de providers
   - Verificar disponibilidad de credenciales
   - Exponer método `getFunction(provider, function)`
   - Exponer método `listProviders()`

3. **executor.js**
   - Para externos: construir HTTP request desde template, ejecutar, parsear response
   - Para locales: llamar función del index.js
   - Manejar errores y timeouts
   - Publicar eventos response

**Integración en startup (`index.js`):**

```javascript
// Después de cargar módulos
const providerLoader = require('./core/providers/loader');
await providerLoader.discover('./services/providers');
await providerLoader.registerEventHandlers(eventBus);
logger.info('providers.loaded', { count: providerLoader.count() });
```

**Estimación:** Complejidad media

---

### Fase 2: Estructura de Directorios

**Objetivo:** Crear la estructura de carpetas para providers.

```bash
mkdir -p services/providers/google/functions
mkdir -p services/providers/anthropic/functions
mkdir -p services/providers/elevenlabs/functions
mkdir -p services/providers/telegram/functions
mkdir -p services/providers/local/pdf
mkdir -p services/providers/local/csv
mkdir -p services/providers/local/xlsx
mkdir -p services/providers/local/tesseract
```

**Estimación:** Trivial

---

### Fase 3: Providers Externos

**Objetivo:** Implementar los providers de APIs externas.

#### 3.1 Google Provider

**Archivos:**
- `services/providers/google/provider.json`
- `services/providers/google/functions/vision.json`
- `services/providers/google/functions/tts.json`
- `services/providers/google/functions/translate.json`

**Dependencias:** Ninguna adicional (usa HTTP nativo)

**Credencial:** `GOOGLE_API_KEY`

#### 3.2 Anthropic Provider (Vision)

**Archivos:**
- `services/providers/anthropic/provider.json`
- `services/providers/anthropic/functions/vision.json`

**Nota:** Solo vision. El chat sigue en ai-gateway.

**Credencial:** `ANTHROPIC_API_KEY`

#### 3.3 ElevenLabs Provider

**Archivos:**
- `services/providers/elevenlabs/provider.json`
- `services/providers/elevenlabs/functions/tts.json`

**Credencial:** `ELEVENLABS_API_KEY`

#### 3.4 Telegram Provider

**Archivos:**
- `services/providers/telegram/provider.json`
- `services/providers/telegram/functions/send_message.json`
- `services/providers/telegram/functions/send_photo.json`
- `services/providers/telegram/functions/get_file.json`

**Nota:** Define las funciones HTTP. `telegram-service` puede usarlas internamente o seguir con su implementación actual.

**Credencial:** `TELEGRAM_BOT_TOKEN` (dinámico por bot)

**Estimación:** Complejidad baja (solo JSON)

---

### Fase 4: Servicios Locales

**Objetivo:** Implementar los servicios que corren localmente.

#### 4.1 PDF Service

**Archivo:** `services/providers/local/pdf/index.js`

**Funciones:**
- `create` - Crear PDF desde texto/HTML/template

**Dependencia:** `pdfkit` (añadir a package.json)

**Templates:** `services/providers/local/pdf/templates/` (opcional)

#### 4.2 CSV Service

**Archivo:** `services/providers/local/csv/index.js`

**Funciones:**
- `create` - Crear CSV desde array de objetos
- `parse` - Leer CSV a array de objetos

**Dependencias:** `csv-parser`, `csv-writer` (añadir a package.json)

#### 4.3 XLSX Service

**Archivo:** `services/providers/local/xlsx/index.js`

**Funciones:**
- `create` - Crear Excel con múltiples hojas
- `parse` - Leer Excel a datos

**Dependencia:** `exceljs` (añadir a package.json)

#### 4.4 Tesseract Service

**Archivo:** `services/providers/local/tesseract/index.js`

**Funciones:**
- `extract` - OCR de imagen

**Dependencia:** `tesseract.js` (ya existe en el proyecto)

**Nota:** Ya implementado en `services/providers/local/tesseract/`

**Estimación:** ✅ Completado

---

### Fase 5: Testing

**Objetivo:** Verificar que todo funciona.

**Tests a crear:**

| Test | Descripción |
|------|-------------|
| `tests/unit/provider-loader.test.js` | Descubrimiento de providers |
| `tests/unit/provider-registry.test.js` | Registro y consulta |
| `tests/unit/provider-executor.test.js` | Ejecución de funciones |
| `tests/integration/providers.test.js` | Flujo completo con eventos |

**Tests manuales:**

```javascript
// Test Google Vision
eventBus.publish('google.vision.extract.request', {
  request_id: 'test-1',
  image: base64Image,
  hint: 'TEXT_DETECTION'
});

// Test Local PDF
eventBus.publish('local.pdf.create.request', {
  request_id: 'test-2',
  type: 'from_text',
  content: 'Hola mundo',
  filename: 'test.pdf'
});
```

**Estimación:** Complejidad media

---

### Fase 6: Migración Opcional

**Objetivo:** Migrar módulos existentes para usar el nuevo sistema (opcional).

#### 6.1 OCR (✅ Completado)

**Estado:** El módulo `ocr-service` fue eliminado. OCR ahora usa providers:
- `services/providers/local/tesseract/` - OCR local
- `services/providers/google/functions/vision.extract.json` - Google Vision
- `services/providers/anthropic/functions/vision.extract.json` - Anthropic Vision

**Beneficio:** Consistencia con arquitectura de providers, menos código duplicado

#### 6.2 telegram-service

**Estado actual:** Implementación completa con polling, estado, cola

**Decisión:** NO migrar. El provider `telegram/` es para uso directo si alguien quiere, pero `telegram-service` sigue siendo el módulo principal.

**Estimación:** Opcional / Futuro

---

## Dependencias a Añadir

```json
// package.json
{
  "dependencies": {
    "pdfkit": "^0.13.0",
    "csv-parser": "^3.0.0",
    "csv-writer": "^1.6.0",
    "exceljs": "^4.3.0"
    // tesseract.js ya existe
  }
}
```

---

## Orden de Implementación Recomendado

| # | Fase | Prioridad | Dependencia |
|---|------|-----------|-------------|
| 1 | Fase 2: Estructura de directorios | Alta | Ninguna |
| 2 | Fase 1: Core Infrastructure | Alta | Fase 2 |
| 3 | Fase 4.4: Tesseract local | Media | Fase 1 |
| 4 | Fase 4.1: PDF local | Media | Fase 1 |
| 5 | Fase 4.2: CSV local | Media | Fase 1 |
| 6 | Fase 4.3: XLSX local | Media | Fase 1 |
| 7 | Fase 3.1: Google provider | Media | Fase 1 |
| 8 | Fase 3.2: Anthropic provider | Baja | Fase 1 |
| 9 | Fase 3.3: ElevenLabs provider | Baja | Fase 1 |
| 10 | Fase 3.4: Telegram provider | Baja | Fase 1 |
| 11 | Fase 5: Testing | Alta | Fases 1-4 |
| 12 | Fase 6: Migración | Opcional | Todo |

---

## Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| APIs externas cambian | Baja | Media | functions.json fácil de actualizar |
| Dependencias con vulnerabilidades | Media | Media | npm audit, versiones fijas |
| Performance de servicios locales | Baja | Media | Tesseract probado en services/providers/local/ |
| Conflicto con módulos existentes | Baja | Alta | Los módulos existentes no cambian |

---

## Criterios de Éxito

1. **Descubrimiento automático:** Al añadir un provider, el sistema lo detecta sin cambiar código
2. **Eventos funcionan:** `{provider}.{function}.request` → `{provider}.{function}.response`
3. **Módulos pueden usar:** Un módulo puede llamar cualquier provider con `sendRequest()`
4. **AI puede descubrir:** `contexto/services.json` se mantiene actualizado
5. **No breaking changes:** Módulos existentes siguen funcionando igual

---

## Siguiente Paso

Revisar este plan y decidir:
1. ¿Empezamos con Fase 1 + 2?
2. ¿Priorizamos algún servicio específico?
3. ¿Hay algo que falte o sobre?

---

*Documento generado: 2026-01-10*
