# ANATOMÍA de eventos y elementos — entrega (fase de alimentación del prisma)

> Los 3 informes previos al prisado. Fuente: modules/entrega/module.json +
> index.js (131 líneas, leído entero) + modules/_shared/config-custodio.js
> (125 líneas) + modules/_shared/modulo-hibrido-reflejo.js (la base).

## 1. Eventos del módulo (publica / escucha / huecos)

PUBLICA (index.js L99 via custodio; module.json publishes):
- `entrega.reglas.actualizadas` { project_id, reglas } — publicada por
  ConfigCustodio.actualizar al persistir (config-custodio.js L119). ÚNICO
  evento de salida. Cadena hasta el frontend verificada en el código:
  eventBus.publish → emit → MQTT broadcast `core/*/events/entrega/reglas/actualizadas`
  (core/events/bus.js L357-366) → el frontend suscribe dot notation
  (ui-core/client.ts L473-482) → mismo patrón que masa (`masa.reglas.actualizadas`
  en su blueprint refresh_on) y que elab.

ESCUCHA (module.json subscribes — los 4 son RPC request/response correlado):
- `entrega.tiempo.estimar.request` → response `entrega.tiempo.estimar.response` (L105)
- `entrega.reparto.obtener.request` → response (L106)
- `entrega.reglas.leer.request` → response (L107)
- `entrega.reglas.actualizar.request` → response (L108; delega en custodio)

HUECOS de evento: NINGUNO granular — no hay entrega.reparto.{activado,desactivado}
ni diff {campo:{anterior,nuevo}} en el payload (el evento lleva las reglas
completas). Hueco menor; suficiente porque quien escucha re-lee con reglas.leer.

## 2. Elementos (ui_handlers del module.json) mapeados a necesidades del jefe

| ui_handler | Necesidad del jefe que sirve | Rol |
|---|---|---|
| reglas.leer | VER la política vigente + su origen (fuente) antes de decidir | neutro |
| reglas.actualizar | DECLARAR política (por bloques, parcial) | jefe |
| tiempo.estimar | (POS/PWA) estimar tiempo al elegir delivery | utilizacion |
| reparto.obtener | (cliente) consultar la política de reparto | utilizacion |

Todos declarados type=workspace_module zone=barra_modulos — cara UI la da el
blueprint + panel (el módulo es REFLEJO: la lógica vive en index.js).

## 3. Invariantes del módulo (fuentes, custodios, estado)

- **INV1 — un custodio, un escritor**: ConfigCustodio con esquema entrega-v1,
  path `entrega.json`, bloques ['reparto','estimacion'], evento
  entrega.reglas.actualizadas, campoDatos 'reglas'.
- **INV2 — la lectura SIEMPRE responde**: custodio.leer devuelve la persistida
  si es del esquema correcto, SI NO los defaults { fuente: 'default' } (L86-91).
  Los "404 de leer" son imposibles por diseño: la falta de política es una
  RESPUESTA NOMBRADA (fuente='default'), no un error. La UI representará
  default = "sin política — usa los defaults".
- **INV3 — merge profundo por bloques**: actualizar { reparto: {...} } NO pisa
  estimacion y viceversa; los campos ausentes se preservan (L104-110). La UI
  envía solo el bloque editado.
- **INV4 — política incompleta ≠ error**: validadores exigen número >= 0 o
  null (L36-49). El estimador con base/por-item null responde metodo
  'pendiente' + nota (L67-68). El reparto sin minutos_por_km aporta 0 min.
- **INV5 — respuesta de actualizar es el dictamen**: custodio.actualizar →
  200 { reglas: nuevas } (L120). El panel muestra el dictamen directo de la
  respuesta; la señal re-asienta la vista entera (doble confirmación).
- **INV6 — sin estado en el proceso**: el reflejo no guarda nada en memoria;
  todo pasa por fs store del proyecto (multi-tenant por project_id).
- **INV7 — `fuente` es el origen**: 'persistida' = declarada por el jefe,
  'default' = aún sin política. El informe.transparencia se apoya aquí.

## 4. Moneda

El contrato no nombra moneda. Los valores monetarios del dominio (`reparto.coste`)
viven junto a los hermanos pizzepos del mismo dueño, que persisten EUROS float
2dec (variaciones, ingredientes R6). Decisión: la UI edita y envía EUR, sin
conversión a céntimos. Anotado como convención, no como shape verificado del
código (el módulo es agnóstico a la moneda: valida número >= 0).