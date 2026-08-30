# Pasada 2 — recursión: prisar D1, D2, D3, D4 y las lecturas hasta hojas atómicas

> Bajo cada decisión del prisma (pasada 1) hasta hojas que el agente de UI puede
> DIBUJAR directamente. Ley {atómico, abierto, repetido} + umbral de atómico-UI.
> Contratos verificados en `modules/facturas/index.js` (v3.0.0) línea a línea.

## D1 — METER una factura al circuito (`subir`)

```
D1 ═══ "subir factura" (aún es una experiencia)
 ├─ aportar el ARCHIVO
 │   ├─ hoja: nombre del archivo (texto — se sanitiza server-side a [a-zA-Z0-9._-])
 │   └─ hoja: CONTENIDO en base64 — el gest real del canal chat/telegram es
 │            enviarla al bot (factura.entrada con filePath en disco); si el
 │            jefe la sube DESDE el panel, el shape exige
 │            archivo{nombre, contenido base64} (handleSubir index.js L267-301)
 │            → input de ruta + nota "también llega sola por chat/telegram"
 ├─ elegir ORIGEN (source)
 │   └─ hoja: telegram | gmail | manual (default manual — enum del handler)
 └─ dictamen de la respuesta
     └─ hoja: 201 success (facturaId/estructura) · 409 duplicate · 500 error
              (el resultado dispara pipeline: Intake→...→Store — la señal
              factura.recibida/factura.procesada/factura.error la confirma)
```

## D2 — CORREGIR datos extraídos (`actualizar`)

```
D2 ═══ "corregir factura" (aún es experiencia)
 ├─ elegir CUÁL factura (de la lista con estado visible)
 ├─ corregir IDENTIDAD FISCAL
 │   ├─ hoja: proveedor_nombre (texto)
 │   ├─ hoja: proveedor_nif (texto)
 │   ├─ hoja: factura_numero (texto)
 │   └─ hoja: factura_fecha (fecha ISO)
 ├─ corregir IMPORTES (EUROS plain: columnas REAL sin conversión)
 │   ├─ hoja: base_imponible (número €)
 │   ├─ hoja: tipo_iva (% número)
 │   ├─ hoja: cuota_iva (número €)
 │   └─ hoja: total_factura (número €)
 ├─ corregir ESTADO del circuito
 │   ├─ hoja: estado (enum: pendiente|procesando|procesada|error|exportada)
 │   └─ hoja: estado_pago (pendiente | pagada) + fecha_pago (ISO opcional)
 └─ hoja: concepto / categoria / notas (texto-libre)
    → todo viaja en UN objeto `datos` (campos libres → UPDATE SQL sin whitelist)
```

## D3 — RELANZAR el pipeline (`reprocesar`)

```
D3 ═══ "reprocesar factura fallida"
 ├─ elegir la factura en estado ERROR (o procesada a medias)
 ├─ CONFIRMAR (gruesa: re-emite OCR+IA → coste tokens + tiempo)
 │   └─ hoja: confirmador-nombrado: nombra archivo/proveedor + estado actual
 └─ guardas reales del servidor
     ├─ 404 si el id no está en la DB (RESOURCE_NOT_FOUND)
     └─ 404 si `path_original` ya no existe en disco — reprocesar un archivo
        borrado NO se puede (la hoja lo dice; el error se nombra en su fila)
```

## D4 — CERRAR el ciclo fiscal (`exportar`)

```
D4 ═══ "exportar a contabilidad/asesoría"
 ├─ alcance: SEMANA (opcional — filtro `semana`;'vacio' = procesadas desde el inicio)
 ├─ CONFIRMAR (destructiva-ish: marca estado='exportada' — cambia el circuito)
 │   └─ hoja: confirmador-nombrado: "exportar N procesadas → CSV contabilidad"
 └─ dictamen de la respuesta
     ├─ hoja: 200 { path, nombre, contenido(base64 CSV), mimeType, total }
     └─ hoja: señal factura.exportada {project_id, total, archivo} — reset de cinta
```

## LECTURAS (informarse) — prisadas a hoja

```
L1 "pulso del circuito" → cinta-estado
 └─ hoja: `estadisticas {proyecto}` → { total, pendientes, procesadas,
    errores, exportadas, porSource[] } — el pulso arriba sin navegar
L2 "la pila de facturas" → lista con ESTADO VISIBLE
 ├─ hoja: `listar {proyecto, estado?, desde?, hasta?, limit=100}` → rows
 │        con estado, proveedor, total, nombre_archivo, fechas
 └─ hoja: filtro por estado (la cinta ES el filtro natural)
L3 "ficha completa de una" → `obtener {proyecto, id}` → { factura } (row completa)
L4 "salud del pipeline v2" → cinta secundaria
 └─ hoja: `pipeline-metrics {}` → { available, summary{total,success,failed,
    duplicates,successRate}, cost{totalEur,totalTokens}, timing{...} }
```

## FLUJO del panel (fase jefe SIEMPRE primera)

```
1. INFORMARSE   cinta por estados (estadisticas) + lista con estado (listar)
                + cinta secundaria pipeline (pipeline-metrics)
2. DECLARAR     subir (editor-bloque con ruta/base64) · actualizar (editor-bloque
                de campos extraídos) · reprocesar (confirmador) · exportar (confirmador)
3. SCOPING      ref-select "factura" (derivado de listar) — la tarjeta fila ES el ref
```

## MUDANZAS de forma por frecuencia {inline | modal}

- Lo DIARIO (corregir un campo) → editor-bloque sobre un `datos` libre.
- Lo RITUAL (subir, exportar, reprocesar) → modal/confirmador, no está en el
  camino de la vista.
- La señal manda: toda hoja de declaración tiene señal pareada → invalidate +
  refetch con debounce (fusiona el tándem subida → recibida → procesada).