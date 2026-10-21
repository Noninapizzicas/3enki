# ESQUEMA — cara del JEFE del módulo `tecnicas` (blueprint-driven, v1.1.0)

> Árbol maestro consolidado (pasadas 1-2 + anatomía). Alimenta al agente de UI
> que escribe el panel. Ley de agnosticismo: cero tecnología de sistema ambiente.
> El análisis es de la CARA DEL JEFE — la utilización es VACÍA (ver esquema §4):
> este módulo es catálogo/información, no cara de venta.

## 1. Quién es el jefe y qué decide

Dueño del CATÁLOGO de técnicas culinarias codificadas del proyecto (esferificación,
confitar, marinada, ahumado, fermentación...). El catálogo nace vacío y el dueño
lo puebla. Decide:

- **D1 — La ALTA de una técnica** (`codificar`): nombre único + descripción +
  categoría + parámetros técnicos (temperaturas, tiempos, ratios) + materiales +
  instrucciones + etiquetas. Declarar esto = meter en el catálogo una técnica
  que recetas/prototipos podrán referenciar por tecnica_id.
- **D2 — La EVOLUCIÓN de una técnica** (`actualizar`): los 6 campos permitidos
  (descripcion, categoria, parametros, materiales, instrucciones, etiquetas).
  Cada declaración genera snapshot en history + version +1 — la técnica evoluciona
  con auditoría, sin borrar lo aprendido.

Lo que NO decide: qué recetas usan cada técnica (vive en recetas), el coste de
los ingredientes (escandallo), ni la ejecución en cocina (la técnica se CONSULTA
al cocinar — lectura, no decisión de este panel).

## 2. Invariantes (restricciones honestas, verificadas en el contrato)

- INV1 — **single-writer del store JSON**: `tecnicas.json` del proyecto;
  escribir solo por codificar/actualizar; listar/obtener/parametros son
  lectura pura que no muta.
- INV2 — **antíduplicados**: nombre normalizado (lowercase+trim) único;
  el duplicado se dictamina ALREADY_EXISTS EN la respuesta de codificar.
- INV3 — **version + history intocables por la UI**: los bumpa el contrato
  (+1 por mutación, snapshot previo automático); campos no permitidos
  (id, nombre, version, history, created_at) viajan intactos.
- INV4 — **sin campos monetarios**: parámetros = magnitudes físicas (°C, min,
  ratios) y texto. Sin € ni céntimos en este módulo (el coste vive en
  escandallo/recetas).
- INV5 — **dictamen en la respuesta**: codificar → 201 { tecnica } ·
  actualizar → 200 { tecnica, diff: {campo: {antes, despues}} } — y las
  señales tecnica.creada / tecnica.actualizada re-asientan la vista entera.
- INV6 — **dato EXACTO, no inventado** (temperatura 0.3): parámetros/materiales/
  instrucciones viajan VERBATIM — el panel no normaliza ni calcula rangos.
- INV7 — **multi-tenant**: todo RPC lleva project_id (lo inyecta la capa de
  request de la UI); el catálogo vive por proyecto.

## 3. Señales pareadas (verificadas en el blueprint — eventos_publicados)

| Declaración | Señal de confirmación | Payload |
|---|---|---|
| codificar (alta) | `tecnica.creada` | { project_id, tecnica_id, nombre, version:1 } |
| actualizar (evolución) | `tecnica.actualizada` | { project_id, tecnica_id, nombre, version, campos_modificados[] } |

DOS señales (una por mutación — más granular que entrega). El seed de UI del
contrato declara `refresh_on: [tecnica.creada, tecnica.actualizada]`: la vista
re-lee el catálogo con CUALQUIERA de las dos. El diff {antes,despues} viaja
solo en la RESPUESTA de actualizar — la señal lleva nombres de campos.

## 4. Veredicto del árbitro (5/5) y composición de la vista

```
¿DECLARA el catálogo (alta/evolución)? → JEFE · ¿ejecuta venta AHORA? → UTILIZACION · ¿solo lee? → NEUTRO
```

- **jefe (2)**: `codificar` (alta) + `actualizar` (evolución) — LAS DECLARACIONES.
- **neutro (3)**: `listar` (informe permanente) + `obtener` (detalle/history +
  borrador del editor) + `parametros` (subset ligero; anotado a consultores).
- **utilizacion (0)**: ÚNICO módulo del ciclo sin cara POS — la técnica no se
  ejecuta en venta, se CONSULTA (esa consulta ya es neutra).

Composición 3 capas del panel del jefe:

```
1. INFORMARSE   informe listar (catálogo alfabético ligero, filtros
                categoria/etiqueta) + detalle obtener {history} bajo demanda
2. DECLARAR     editor-bloque ALTA (codificar) y editor-bloque EVOLUCIÓN
                (actualizar { tecnica_id + campos }) — borradores rellenados
                desde obtener, nunca asumidos
3. CONFIRMAR    dictamen de la respuesta (201 | 200 con diff campo a campo)
                + señal tecnica.creada/actualizada re-leyendo el informe
                (debounce). Nunca recarga.
```

(R1 catálogo permanente y actualizar como gesto frecuente. R2 sin estado
asumido. R3 la señal manda + dictamen RPC. R4 transparencia con diff.)

**Diferencia con entrega (el molde)**: aquí SON dos señales propias (creada,
actualizada) en vez de una, y el dictamen de evolución lleva diff {antes,
despues} explícito — el panel lo aprovecha. No hay custodio JS compartido:
el runtime ES el blueprint (ai-gateway), mismo contrato publishAndWait 8s.

## 5. Formas UI asignadas

| Hoja | Forma | RPC | Señal |
|---|---|---|---|
| Catálogo (informe) | cinta-estado + listado alfabético chipeado (categoria · version) | listar | re-leído por ambas señales |
| Detalle de técnica | bloque de lectura bajo demanda (instrucciones + history con versiones) | obtener | re-leída por la señal |
| Alta de técnica | editor-bloque (nombre* + 6 campos, duplicado = dictamen ALREADY_EXISTS) | codificar | tecnica.creada |
| Evolución de técnica | editor-bloque (tecnica_id + 6 campos, dictamen diff) | actualizar | tecnica.actualizada |

`parametros` (subset ligero) queda anotado al módulo-base: consumidores del
dato (recetas/LLM), no captura del jefe — en el panel ya vive el informe con
obtener. 0 hojas de utilización: nada que sacarle al panel.

## 6. Huecos [ABIERTO] — decisiones del dueño, se NOMBRAN (pasada-1 §5)

1. Categorías canónicas (enum) — hoy texto libre.
2. Sub-esquemas de parámetros por categoría de técnica.
3. Vinculación con recetas (invalidación al cambiar parámetros).

Huecos de CONTRATO, no de CAPTURA: la UI no pide nada que el módulo no soporte.