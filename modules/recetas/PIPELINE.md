# Pipeline de Ingestion y Procesamiento

## Flujo Eventos-Driven

```
┌─────────────────────────────────────────────────────────────────────────┐
│ INICIO: Usuario/API inicia ingestion                                    │
│ handleIngestar({ projectId, fuente: 'pdf', archivo, ... })             │
└────────────────────────┬────────────────────────────────────────────────┘
                         │ Crea task, publica evento
                         ▼
    ┌────────────────────────────────────────────────────┐
    │ STEP 1: Intake                                     │
    │ - Valida tipo de fuente                            │
    │ - Crea ingestion_id único                          │
    │ - Guarda metadatos (fuente, referencia)            │
    └────────────────────┬───────────────────────────────┘
                         │ receta.ingestion.started
                         ▼
    ┌────────────────────────────────────────────────────┐
    │ STEP 2: Download                                   │
    │ - Si URL: descarga archivo                         │
    │ - Si local: copia a workspace temporal             │
    │ - Resume-capable: checkpoints guardados            │
    └────────────────────┬───────────────────────────────┘
                         │ status: downloaded
                         ▼
    ┌────────────────────────────────────────────────────┐
    │ STEP 3: Prepare OCR                                │
    │ - Detecta tipo (PDF vs imagen vs JSON)             │
    │ - Si PDF: extrae imágenes                          │
    │ - Si imagen: redimensiona, normaliza               │
    │ - Usa: sharp (facturas)                            │
    └────────────────────┬───────────────────────────────┘
                         │ status: prepared
                         ▼
    ┌────────────────────────────────────────────────────┐
    │ STEP 4: OCR Extraction                             │
    │ - Ejecuta Google Vision (u otra API)               │
    │ - Extrae texto: ocrText                            │
    │ - Usa: ServiceExecutor (facturas)                  │
    │ - Result: texto crudo + confianza                  │
    └────────────────────┬───────────────────────────────┘
                         │ status: ocr_completed
                         ▼
    ┌────────────────────────────────────────────────────┐
    │ STEP 5: Normalize & Extract                        │
    │ - Parse ocrText con heurísticas                    │
    │ - Extrae: nombre, ingredientes, instrucciones      │
    │ - Crepa: tiempo aproximado                         │
    │ - Resultado: datosNormalizados                     │
    └────────────────────┬───────────────────────────────┘
                         │ receta.ingestion.completed
                         │ publica evento con:
                         │ - ocrText (raw)
                         │ - datosNormalizados
                         │ - ingestion_id
                         ▼
    ┌─────────────────────────────────────────────────────────────┐
    │ Agent 1: RECIPE STRUCTURER                                  │
    │ Escucha: receta.ingestion.completed                        │
    │ Transforma: ocrText → JSON estructura válida               │
    │ Valida: nombre, ingredientes, instrucciones, metadata      │
    │ Genera: ID único (rec_pasta-carbonara_1713090000)          │
    │ Valida: contra schema.json                                 │
    │ Marca: estado_estructura, confianza (alta/media/baja)      │
    └────────────────────┬─────────────────────────────────────────┘
                         │ receta.structuring.completed
                         │ publica evento con:
                         │ - receta (JSON válido)
                         │ - confianza
                         │ - campos_incompletos
                         ▼
    ┌─────────────────────────────────────────────────────────────┐
    │ Agent 2: RECIPE ANALYZER                                    │
    │ Escucha: receta.structuring.completed                       │
    │ Consulta: catálogo de ingredientes (precios, alérgenos)   │
    │ Calcula: costes (total + por porción)                      │
    │ Detecta: alérgenos (gluten, huevo, lactosa, etc.)         │
    │ Valida: tiempos (consistencia pasos vs tiempo)             │
    │ Calcula: dificultad real (basada en pasos + técnicas)      │
    │ Evalúa: viabilidad (alta/media/baja)                       │
    │ Genera: flags (tiempo_bajo, coste_alto, etc.)              │
    │ Marca: confianza del análisis                              │
    └────────────────────┬─────────────────────────────────────────┘
                         │ receta.analysis.completed
                         │ publica evento con:
                         │ - receta (del structurer)
                         │ - analisis (viabilidad, costes, alérgenos)
                         │ - confianza
                         ▼
    ┌─────────────────────────────────────────────────────────────┐
    │ Agent 3: RECIPE CURATOR                                     │
    │ Escucha: receta.analysis.completed                          │
    │ Valida: análisis completo (viabilidad, costes, alérgenos)  │
    │ Busca: ¿Existe receta con este nombre? (duplicados)        │
    │ Decide: CREATE (nuevo) vs UPDATE (nueva versión)           │
    │ Guarda: SQLite con versionado completo                      │
    │ Actualiza: receta_search_index (denormalizado)             │
    │ Audita: registra cambios (usuario, timestamp)               │
    │ Estados posibles:                                           │
    │   - activa: viabilidad >= media                             │
    │   - borrador: viabilidad baja (requiere revisión manual)    │
    │   - error: falló guardado                                   │
    └────────────────────┬─────────────────────────────────────────┘
                         │
                    ┌────┴────┐
                    │          │
         success    ▼          ▼ error
    ┌────────────────────┐ ┌──────────────────┐
    │ receta.creada      │ │ receta.curation  │
    │ estado: activa     │ │ .failed          │
    │ o borrador         │ │ estado: borrador │
    └────────────────────┘ └──────────────────┘
```

## State Machine de Ingestion

```
[PENDING]
   │
   └─→ [DOWNLOADING] ─→ [DOWNLOADED] ─→ [PREPARING] ─→ [PREPARED]
                                           │
                                           └─→ [PREPARE_FAILED] (retry posible)
                         
[PREPARED] ─→ [OCR_PROCESSING] ─→ [OCR_COMPLETED]
                   │
                   └─→ [OCR_FAILED] (retry posible)

[OCR_COMPLETED] ─→ [NORMALIZING] ─→ [NORMALIZED]
                       │
                       └─→ [NORMALIZE_FAILED]

[NORMALIZED] ─→ [WAITING_STRUCTURER] ─→ [STRUCTURING_STARTED]
                                              │
                                              ├─→ [STRUCTURING_COMPLETED]
                                              └─→ [STRUCTURING_FAILED]

[STRUCTURING_COMPLETED] ─→ [WAITING_ANALYZER] ─→ [ANALYZING_STARTED]
                                                    │
                                                    ├─→ [ANALYSIS_COMPLETED]
                                                    └─→ [ANALYSIS_FAILED]

[ANALYSIS_COMPLETED] ─→ [WAITING_CURATOR] ─→ [CURATION_STARTED]
                                                 │
                                                 ├─→ [CURATION_COMPLETED]
                                                 │   - estado: activa o borrador
                                                 └─→ [CURATION_FAILED]
                                                     - estado: error
```

## Eventos Publicados

### 1. `receta.ingestion.started`
**Cuándo:** Comienza pipeline de ingestion
```json
{
  "ingestion_id": "ing_abc123",
  "projectId": "proj_123",
  "fuente": "pdf",
  "timestamp": 1713090000000,
  "status": "downloading"
}
```

### 2. `receta.ingestion.completed`
**Cuándo:** OCR finaliza, listo para structurer
```json
{
  "ingestion_id": "ing_abc123",
  "projectId": "proj_123",
  "ocrText": "Pasta a la Carbonara\nIngredientes:\n- 400g pasta\n...",
  "datosNormalizados": {
    "texto_crudo": "...",
    "campos_candidatos": {
      "nombre": "Pasta a la Carbonara",
      "ingredientes_crudos": ["400g pasta", "150g jamón", ...],
      "instrucciones_crudas": ["Hierve agua", ...],
      "tiempo_aproximado": 20
    }
  },
  "tipo": "pdf",
  "fuente_referencia": null,
  "timestamp": 1713090005000
}
```

### 3. `receta.structuring.completed`
**Cuándo:** Structurer termina, listo para analyzer
```json
{
  "receta_id": "rec_pasta-carbonara_1713090000",
  "projectId": "proj_123",
  "receta": {
    "id": "rec_pasta-carbonara_1713090000",
    "nombre": "Pasta a la Carbonara",
    "porciones": 4,
    "tiempo_preparacion": 20,
    "ingredientes": [
      {"nombre": "Pasta", "cantidad": 400, "unidad": "g"}
    ],
    "elaboracion": ["Hierve agua con sal", ...],
    "estado_estructura": "validado"
  },
  "confianza": "alta",
  "timestamp": 1713090010000
}
```

### 4. `receta.analysis.completed`
**Cuándo:** Analyzer termina, listo para curator
```json
{
  "receta_id": "rec_pasta-carbonara_1713090000",
  "projectId": "proj_123",
  "receta": { /* igual a structuring */ },
  "analisis": {
    "viabilidad": "alta",
    "razon_viabilidad": "Todos ingredientes disponibles, coste moderado",
    "costes": {
      "coste_total": 18.50,
      "coste_porcion": 4.62
    },
    "alerge nos": ["gluten", "huevo", "lactosa"],
    "tiempos": {
      "estimado_original": 20,
      "estimado_analizado": 22,
      "consistencia": "alta"
    },
    "dificultad": {
      "estimado_original": 6,
      "estimado_analizado": 6
    },
    "flags": [],
    "recomendaciones": ["Tener todo preparado (mise en place)"]
  },
  "confianza": "alta",
  "timestamp": 1713090020000
}
```

### 5. `receta.creada` (SUCCESS)
**Cuándo:** Curator guarda exitosamente
```json
{
  "receta_id": "rec_pasta-carbonara_1713090000",
  "projectId": "proj_123",
  "nombre": "Pasta a la Carbonara",
  "version": 1,
  "estado": "activa",
  "operacion": "created",
  "indexed": true,
  "timestamp": 1713090025000
}
```

### 6. `receta.ingestion.failed`
**Cuándo:** Error en pipeline (download, ocr, normalize)
```json
{
  "ingestion_id": "ing_abc123",
  "projectId": "proj_123",
  "error": "OCR confidence too low (0.23 < 0.5)",
  "paso": "ocr_processing",
  "timestamp": 1713090015000,
  "reintento_posible": true
}
```

### 7. `receta.structuring.failed`
**Cuándo:** Structurer encuentra error crítico
```json
{
  "receta_id": "ing_abc123",
  "projectId": "proj_123",
  "error": "Nombre vacío o inválido",
  "campos_incompletos": ["nombre", "ingredientes"],
  "timestamp": 1713090012000
}
```

### 8. `receta.analysis.failed`
**Cuándo:** Analyzer encuentra problemas
```json
{
  "receta_id": "rec_pasta_draft_xyz",
  "projectId": "proj_123",
  "error": "Análisis incompleto: faltan alérgenos",
  "timestamp": 1713090018000
}
```

### 9. `receta.curation.failed`
**Cuándo:** Curator guarda como BORRADOR por viabilidad baja
```json
{
  "receta_id": "rec_pasta_draft_xyz",
  "projectId": "proj_123",
  "error": "viabilidad baja + 3 ingredientes no disponibles",
  "estado_guardado": "borrador",
  "timestamp": 1713090023000,
  "requiere_validacion_manual": true
}
```

## Retry Logic

| Paso | Retries | Backoff |
|------|---------|---------|
| Download | 3 | exponencial (2s, 4s, 8s) |
| OCR | 2 | exponencial |
| Normalize | 1 | n/a |
| Structurer | 1 | n/a (manual si falla) |
| Analyzer | 1 | n/a |
| Curator | 1 | n/a (guarda como borrador si falla) |

## Resume Capability

Pipeline guarda checkpoints en `data/projects/{projectId}/ingestion/{ingestion_id}/`:
- `intake.json` - Metadatos iniciales
- `downloaded.bin` - Archivo descargado
- `prepared.bin` - Imagen preparada para OCR
- `ocr_result.json` - Texto extraído
- `normalized.json` - Datos parseados

Si falla en cualquier paso, se puede reanudar desde ese punto sin reprocesar pasos anteriores.

## Performance Notes

- **Ingestion completa:** ~30-60s (OCR es bottleneck)
- **Structuring:** ~5-10s (LLM)
- **Analysis:** ~10-20s (LLM, consultas BD)
- **Curation:** ~2-5s (BD)
- **Total end-to-end:** ~60-120s por receta

Para multi-receta (lote de 10): Ingestion en paralelo, agentes secuenciales por receta.
