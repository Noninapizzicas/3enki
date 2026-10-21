# ANATOMÍA de eventos y elementos — tecnicas (fase de alimentación del prisma)

> Los 3 informes previos al prisado. Fuente: modules/pizzepos/tecnicas/module.json
> (30 líneas) + tecnicas.blueprint.json (391 líneas, leído entero). SIN index.js:
> módulo BLUEPRINT-DRIVEN — el LLM ES el runtime vía ai-gateway (transporte
> cajones + rpc `tecnicas.<op>.request/.response`). El blueprint declarativo
> del repositorio (v1.2.0) ES el contrato real: pseudocódigo por op + garantías.

## 1. Eventos del módulo (publica / escucha / huecos)

PUBLICA — 2 eventos de dominio + 10 RPC (blueprint eventos_publicados L53-66):
- `tecnica.creada` { project_id, user_id, tecnica_id, nombre, version:1,
  correlation_id, timestamp } — publicada al persistir en codificar
  (pseudocódigo L137-141, tras fs.write/fs.edit OK).
- `tecnica.actualizada` { project_id, user_id, tecnica_id, nombre, version,
  campos_modificados: Object.keys(diff), correlation_id, timestamp } —
  publicada al persistir en actualizar (L269-274). **Lleva la lista de campos
  modificados** (más granular que entrega).
- RPC request/response correlado (10): `tecnicas.{codificar,obtener,listar,
  actualizar,parametros}.request/.response` (+ sus .failed canónicos).

ESCUCHA: `eventos_que_escucho: []` — cero subscripciones de dominio. El
módulo no reacciona a terceros (página FRÍA: custodio del dato canonico).

HUECOS de evento: NINGUNO — la señal de mutación existe por op (contrato
garantiza #4/transporte.salida). El module.json no declara publishes (hueco
del MANIFEST, no del código: los eventos están en el blueprint, fuente viva).
Nota: el diff {campo:{antes,despues}} viaja en la RESPUESTA de actualizar
(L275: { tecnica, diff }), no en la señal (la señal lleva campos_modificados
solo con nombres). Suficiente: quien escucha re-lee con listar/obtener.

## 2. Elementos (ui_handlers del module.json) mapeados a necesidades del jefe

| ui_handler | Necesidad del jefe que sirve | Rol |
|---|---|---|
| handlePanel (panel, workspace_module) | SUPERFICIE del panel técnico — la cara jefe la compone el blueprint `ui.*` + panel F7 | (envoltorio) |

Un único handler tipo `workspace_module` zone=barra_modulos: el BlueprintForm
genera la UI desde `ui.ops` (F6) — 5 ops con sus args ya declarados. La lente
de roles CLASIFICA esas 5 ops (ver pasada-2): 2 jefe + 3 neutro · 0 utilización.

## 3. Invariantes del módulo (fuentes, custodios, estado)

- **INV1 — un store JSON, un camión de escritura**: `pizzepos/tecnicas.json`
  del proyecto (single-json-per-project, concurrency single-writer, module.json
  config.persistence). Escribir = codificar (alta) o actualizar (muta campos);
  leer = obtener/listar/parametros (lectura pura, garantiza #6).
- **INV2 — antíduplicados por nombre normalizado**: codificar rechaza con
  ALREADY_EXISTS si (lowercase+trim) coincide (L86-87). El jefe ve el
  dictamen de duplicado EN la respuesta, no tras guardar.
- **INV3 — version + history inviolables por la UI**: cada actualizar pushea
  snapshot previo al history[] y bumpa version +1 (L250-251);
  `campos_permitidos = [descripcion, categoria, parametros, materiales,
  instrucciones, etiquetas]` (L239) — id/nombre/version/history/created_at
  NO se tocan (reglas_clave actualizar). Actualizar sin campo permitido →
  INVALID_INPUT sin escribir disco (L247).
- **INV4 — persistencia declarativa RFC 6902**: el runtime jamás compone el
  archivo entero tras la primera: fs.edit con patches op:add/op:replace/op:test
  (codificar L125-133; actualizar L258-266 con op:test anti-race por id).
- **INV5 — el DICTAMEN viene en la respuesta**: codificar → 201 { tecnica },
  actualizar → 200 { tecnica, diff: { campo: { antes, despues } } } (L275).
  Doble confirmación con la señal de op (creada/actualizada) que re-lee.
- **INV6 — el dato EXACTO manda**: temperatura 0.3 + _temperatura_doc: "Los
  parametros son DATOS exactos; inventar aqui corrompe el catalogo". La UI no
  calcula ni normaliza rangos: params/materiales/instrucciones viajan VERBATIM
  (la normalización de lenguaje natural la hace el LLM runtime, no el panel).
- **INV7 — multi-tenant**: todo RPC lleva project_id (capa de request de la
  UI); store y catálogo viven por proyecto.

## 4. Moneda

NO HAY campos monetarios en el contrato: `parametros` son magnitudes físicas
(temperaturas °C, tiempos min, ratios g/g), `materiales`/`instrucciones` son
texto. Veredicto: **sin moneda aplicable** — la UI edita cifras físicas y
texto; cero €, cero céntimos (el coste de la técnica vive en escandallo/recetas,
otros módulos). A diferencia de entrega (reparto.coste EUR), aquí nada que
declarar en euros.