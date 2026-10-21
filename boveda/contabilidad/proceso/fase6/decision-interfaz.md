# F6 · Decisión de interfaz — vertical CONTABILIDAD (118 módulos)

> **Fase 6 · `decidir-interfaz`** sobre la rama `vertical/contabilidad`.
> Decide por ROL qué módulos necesitan superficie, de qué tipo canónico, y ESCRIBE
> su `ui_handlers`. **Lista cerrada de 4 tipos:** `workspace_module` ·
> `chat_tool` · `inline_render` · `system_panel`.

## El hallazgo que manda (por qué NO se usó la decisión cruda del script)

El script canónico `decidir-interfaz.js` decide por **`tools`**. Esta vertical es
event-driven PURA: sus módulos **NO tienen tools**, exponen su superficie como **RPC
por eventos** (`subscribes` con `.request`). El canónico devuelve
`sin-acciones-humanas` / `puente-interno` para casi todos → **falso negativo en bloque**
(es el 4º bug de la familia "asumir que un módulo tiene tools").

La skill manda (§3 paso 3): *si la decisión del script contradice el rol, **el rol GANA**,
documenta el porqué.* Aquí el rol se lee de **lo que el módulo REALMENTE expone**:
la CLASE de cada RPC, ya clasificada y ratificada en `fase3b/plan-construccion.md`:

- **`ORDEN` HUMANA** (declarar · cerrar · firmar · emitir · asentar · ajustar · encolar ·
  archivar · ratificar · registrar · unificar · rectificar · avanzar · entregar · producir ·
  abrir · recibir · reclamar · emparejar · exportar · anadir · reabrir · ligar · ratificar ·
  crear_parcela · generar_cuota · recoger · fijar · juzgar · anotar · avisar · producir) →
  **señal 4 (escritura) → SÍ necesita interfaz** (panel de captura).
- **`PREGUNTA`/DERIVACIÓN** (calcular · listar · saldos · estado · informe · medir ·
  proponer · traducir · juzgar determinista) → **señal 5 → su cara es el BUS, NO necesita
  superficie** (`mqttRequest` la resuelve por el bus, sin panel).

El reparto del plan: **46 RPC ORDEN (superficie) · 103 PREGUNTA (bus)** → **43 módulos**
con al menos un ORDEN (46 ORDEN sobre 43 módulos: 3 módulos tienen 2 cada uno —
`cierre-ejercicio` cerrar/reabrir · `puerto-evento-vertical` abrir/recibir ·
`cola-declaraciones-criterio` fijar/ratificar).

## El tipo (§2b · tabla ROL → TIPO) y la CORRECCIÓN de zona al frontend real

La tabla §2b da la zona canónica. PERO el hallazgo de F8 en esta vertical dice:
**`area_chat` NO es una zona real del frontend** (solo existen `work-bar`,
`system-bar`, `chat-tools`, `chat-config`). El frontend descubre por
`manifest.zone` del módulo, no por el `zone` del `ui_handlers` — así que el
`zone` del backend es **vocabulario contractual** (lo valida `frontend.validate`).
Zonas usadas, todas ∈ las canónicas de §2b:

| Tipo (§2b) | Zone canónica §2b | N |
|---|---|---|
| `system_panel` | `lateral_derecha` | 29 |
| `workspace_module` | `barra_modulos` | 13 |
| `chat_tool` | `input_chat` | 1 |

> **DRIFT CORREGIDO en esta pasada:** `presupuesto` declaraba `zone:"chat_tools"`
> (vocabulario del frontend, NO ∈ las zonas canónicas de §2b) → **alineado a
> `input_chat`** (zona canónica de chat_tool, sin tocar la del frontend). El
> `frontend.validate --check-system` pasó de **608 → 607 warnings** y ya **no
> reporta ninguna línea de contabilidad**.

## Verificación (skill §5)

- Los `ui_handlers` existentes **coinciden 1:1** con los ORDEN del plan ratificado (0 discrepancias de presencia, 43 módulos = 43 con ORDEN).
- **46/46 handler methods** escritos `existen de verdad` en su `index.js` (grep `\bhandler\s*(`).
- `type` ∈ {workspace_module, chat_tool, inline_render, system_panel} · `zone` ∈
  zonas canónicas de §2b en los 43.
- `node --check` de los 118 `index.js` = OK · `JSON.parse` de los 118 `module.json` = OK.
- `frontend.validate.js --check-system`: **0 drift de contabilidad**.
- Los 75 sin ORDEN **NO tienen `ui_handlers` forzados** (su cara es el bus).

## La tabla — los 118 módulos

| # | slug | ¿necesita? | señal (§2a) | tipo (§2b) | zone | handler escrito |
|---|---|---|---|---|---|---|
| 1 | `anclaje-cierre-vertical` | **SÍ** | 4 · escritura — ORDEN: declarar | system_panel | lateral_derecha | `onDeclararRequest` |
| 2 | `antiguedad-de-saldos` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: clasificar) | — | — | — |
| 3 | `aviso-revision` | **SÍ** | 4 · escritura — ORDEN: empujar | system_panel | lateral_derecha | `onEmpujarRequest` |
| 4 | `captura-documento` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: admitir) | — | — | — |
| 5 | `completitud-cobertura` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: medir) | — | — | — |
| 6 | `contrapartida-asistida` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: juzgar) | — | — | — |
| 7 | `contrato-hecho-minimo` | **SÍ** | 4 · escritura — ORDEN: declarar | system_panel | lateral_derecha | `onDeclararRequest` |
| 8 | `control-cuadre-documento` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: cuadra) | — | — | — |
| 9 | `cruce-factura-recepcion` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: cotejar) | — | — | — |
| 10 | `cuenta-proveedor` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: saldo/facturas_vivas) | — | — | — |
| 11 | `declaracion-fuente-faltante` | **SÍ** | 4 · escritura — ORDEN: declarar | workspace_module | barra_modulos | `onDeclararRequest` |
| 12 | `deduplicacion-hecho` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: es_nuevo) | — | — | — |
| 13 | `desatasco-entrada` | **SÍ** | 4 · escritura — ORDEN: juzgar | system_panel | lateral_derecha | `onJuzgarRequest` |
| 14 | `emision-factura-venta` | **SÍ** | 4 · escritura — ORDEN: emitir | system_panel | lateral_derecha | `onEmitirRequest` |
| 15 | `encolado-excepcion` | **SÍ** | 4 · escritura — ORDEN: encolar | workspace_module | barra_modulos | `onEncolarRequest` |
| 16 | `estado-cuenta-proveedor` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: extracto) | — | — | — |
| 17 | `extraccion-dato` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: juzgar) | — | — | — |
| 18 | `factura-rectificativa` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: calcular) | — | — | — |
| 19 | `hecho-rectificativo` | **SÍ** | 4 · escritura — ORDEN: emparejar | system_panel | lateral_derecha | `onEmparejarRequest` |
| 20 | `historial-proceso-contable` | **SÍ** | 4 · escritura — ORDEN: anotar | system_panel | lateral_derecha | `onAnotarRequest` |
| 21 | `lote-admision` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: admitir) | — | — | — |
| 22 | `maestro-terceros` | **SÍ** | 4 · escritura — ORDEN: upsert | workspace_module | barra_modulos | `onUpsertRequest` |
| 23 | `normalizador-hecho` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: entrar) | — | — | — |
| 24 | `padron-terceros` | **SÍ** | 4 · escritura — ORDEN: unificar | workspace_module | barra_modulos | `onUnificarRequest` |
| 25 | `panel-proceso-contable` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: latido) | — | — | — |
| 26 | `puerto-documento` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: entrar) | — | — | — |
| 27 | `puerto-documento-digital` | **SÍ** | 4 · escritura — ORDEN: recibir | system_panel | lateral_derecha | `onRecibirRequest` |
| 28 | `puerto-evento-vertical` | **SÍ** | 4 · escritura — ORDEN: abrir/recibir | workspace_module | barra_modulos | `onAbrirRequest · onRecibirRequest` |
| 29 | `rappel-pronto-pago` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: ajustar) | — | — | — |
| 30 | `regla-contrapartida` | **SÍ** | 4 · escritura — ORDEN: declarar | workspace_module | barra_modulos | `onDeclararRequest` |
| 31 | `tasa-cobertura-entrada` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: calcular) | — | — | — |
| 32 | `vencimiento-pago` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: calcular) | — | — | — |
| 33 | `apertura-ejercicio` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: generar) | — | — | — |
| 34 | `asiento-ajuste` | **SÍ** | 4 · escritura — ORDEN: entrar | system_panel | lateral_derecha | `onEntrarRequest` |
| 35 | `aviso-cuadre` | **SÍ** | 4 · escritura — ORDEN: avisar | system_panel | lateral_derecha | `onAvisarRequest` |
| 36 | `balance-situacion` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: calcular) | — | — | — |
| 37 | `cambio-desde-ultima-revision` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: delta) | — | — | — |
| 38 | `catalogo-cuentas` | **SÍ** | 4 · escritura — ORDEN: anadir | system_panel | lateral_derecha | `onAnadirRequest` |
| 39 | `cierre-ejercicio` | **SÍ** | 4 · escritura — ORDEN: cerrar/reabrir | workspace_module | barra_modulos | `onCerrarRequest · onReabrirRequest` |
| 40 | `clave-natural` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: calcular/coincide) | — | — | — |
| 41 | `conciliacion-bancaria` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: cruzar) | — | — | — |
| 42 | `control-calidad-muestreo` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: seleccionar) | — | — | — |
| 43 | `cuadre-cobro-pago` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: cuadrar) | — | — | — |
| 44 | `cuenta-resultados` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: calcular) | — | — | — |
| 45 | `escritor-diario` | **SÍ** | 4 · escritura — ORDEN: asentar | system_panel | lateral_derecha | `onAsentarRequest` |
| 46 | `expediente-documental` | **SÍ** | 4 · escritura — ORDEN: archivar | workspace_module | barra_modulos | `onArchivarRequest` |
| 47 | `flujo-firma` | **SÍ** | 4 · escritura — ORDEN: firmar | system_panel | lateral_derecha | `onFirmarRequest` |
| 48 | `frontera-planos` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: verificar) | — | — | — |
| 49 | `informe-conciliacion` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: componer) | — | — | — |
| 50 | `maestro-cuentas-bancarias` | **SÍ** | 4 · escritura — ORDEN: declarar | system_panel | lateral_derecha | `onDeclararRequest` |
| 51 | `mayor-balanza` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: saldos/balanza) | — | — | — |
| 52 | `partida-conciliatoria` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: desfase) | — | — | — |
| 53 | `partida-no-identificada` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: juzgar) | — | — | — |
| 54 | `periodificacion` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: imputar) | — | — | — |
| 55 | `prevision-caja` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: proyectar) | — | — | — |
| 56 | `puerto-exportacion` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: salir/entrar) | — | — | — |
| 57 | `puerto-extracto` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: entrar) | — | — | — |
| 58 | `puerto-plan-contable` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: entrar/salir) | — | — | — |
| 59 | `ratificacion-regla-aprendida` | **SÍ** | 4 · escritura — ORDEN: ratificar | system_panel | lateral_derecha | `onRatificarRequest` |
| 60 | `regla-movimiento-bancario` | **SÍ** | 4 · escritura — ORDEN: declarar | workspace_module | barra_modulos | `onDeclararRequest` |
| 61 | `saldo-tesoreria` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: calcular) | — | — | — |
| 62 | `single-writer` | **SÍ** | 4 · escritura — ORDEN: reclamar | system_panel | lateral_derecha | `onReclamarRequest` |
| 63 | `traza-asiento` | **SÍ** | 4 · escritura — ORDEN: registrar | system_panel | lateral_derecha | `onRegistrarRequest` |
| 64 | `vista-revisable` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: explicar) | — | — | — |
| 65 | `acceso-nomina` | **SÍ** | 4 · escritura — ORDEN: declarar | system_panel | lateral_derecha | `onDeclararRequest` |
| 66 | `acuse-presentacion` | **SÍ** | 4 · escritura — ORDEN: ligar | system_panel | lateral_derecha | `onLigarRequest` |
| 67 | `asiento-personal` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: construir) | — | — | — |
| 68 | `calendario-fiscal` | **SÍ** | 4 · escritura — ORDEN: declarar | system_panel | lateral_derecha | `onDeclararRequest` |
| 69 | `conceptos-extra-nomina` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: imputar) | — | — | — |
| 70 | `estado-presentacion-fiscal` | **SÍ** | 4 · escritura — ORDEN: avanzar | workspace_module | barra_modulos | `onAvanzarRequest` |
| 71 | `estimacion-is-irpf` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: estimar) | — | — | — |
| 72 | `factura-electronica` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: entrar/salir) | — | — | — |
| 73 | `generador-modelo` | **SÍ** | 4 · escritura — ORDEN: exportar | system_panel | lateral_derecha | `onExportarRequest` |
| 74 | `lineas-nomina` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: desglosar) | — | — | — |
| 75 | `liquidacion-baja-empleado` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: liquidar) | — | — | — |
| 76 | `liquidacion-iva` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: calcular) | — | — | — |
| 77 | `modelo-303` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: construir) | — | — | — |
| 78 | `modelo-390` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: construir) | — | — | — |
| 79 | `obligacion-seguridad-social` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: calcular) | — | — | — |
| 80 | `pagos-a-cuenta-empleado` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: impacto) | — | — | — |
| 81 | `perfil-administrativo` | **SÍ** | 4 · escritura — ORDEN: declarar | system_panel | lateral_derecha | `onDeclararRequest` |
| 82 | `puerto-nomina` | **SÍ** | 4 · escritura — ORDEN: recibir | workspace_module | barra_modulos | `onRecibirRequest` |
| 83 | `recibo-nomina` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: dar_forma) | — | — | — |
| 84 | `rectificacion-declaracion` | **SÍ** | 4 · escritura — ORDEN: rectificar | system_panel | lateral_derecha | `onRectificarRequest` |
| 85 | `registro-verifactu` | **SÍ** | 4 · escritura — ORDEN: encadenar | system_panel | lateral_derecha | `onEncadenarRequest` |
| 86 | `retenciones` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: calcular) | — | — | — |
| 87 | `activacion-vertical` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: activar) | — | — | — |
| 88 | `aislamiento-negocio` | **SÍ** | 4 · escritura — ORDEN: crear_parcela | system_panel | lateral_derecha | `onCrearParcelaRequest` |
| 89 | `ajuste-inventario` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: diferencia) | — | — | — |
| 90 | `alta-activo` | **SÍ** | 4 · escritura — ORDEN: registrar | system_panel | lateral_derecha | `onRegistrarRequest` |
| 91 | `aviso-al-negocio` | **SÍ** | 4 · escritura — ORDEN: entregar | system_panel | lateral_derecha | `onEntregarRequest` |
| 92 | `baja-activo` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: calcular) | — | — | — |
| 93 | `cola-declaraciones-criterio` | **SÍ** | 4 · escritura — ORDEN: fijar/ratificar | system_panel | lateral_derecha | `onFijarRequest · onRatificarRequest` |
| 94 | `comparador-periodos` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: comparar) | — | — | — |
| 95 | `consolidacion` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: estados) | — | — | — |
| 96 | `consulta-cuentas-bajo-demanda` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: preguntar) | — | — | — |
| 97 | `coste-indirecto` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: repartir) | — | — | — |
| 98 | `cuadro-mando-contable` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: componer) | — | — | — |
| 99 | `desviacion` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: calcular) | — | — | — |
| 100 | `eliminacion-intercompany` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: eliminar) | — | — | — |
| 101 | `etiquetado-analitico` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: juzgar) | — | — | — |
| 102 | `frontera-ficha-producto` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: entrar) | — | — | — |
| 103 | `informe-accionable` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: juzgar) | — | — | — |
| 104 | `informe-rico` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: componer) | — | — | — |
| 105 | `marca-borrador-validado` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: estado) | — | — | — |
| 106 | `marca-sociedad` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: marcar) | — | — | — |
| 107 | `margen-analitico` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: calcular) | — | — | — |
| 108 | `motor-avisos` | **SÍ** | 4 · escritura — ORDEN: producir | system_panel | lateral_derecha | `onProducirRequest` |
| 109 | `narrador-estados` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: narrar) | — | — | — |
| 110 | `onboarding-negocio` | **SÍ** | 4 · escritura — ORDEN: recoger | workspace_module | barra_modulos | `onRecogerRequest` |
| 111 | `plan-amortizacion` | **SÍ** | 4 · escritura — ORDEN: generar_cuota | workspace_module | barra_modulos | `onGenerarCuotaRequest` |
| 112 | `presupuesto` | **SÍ** | 4 · escritura — ORDEN: fijar | chat_tool | input_chat | `onFijarRequest` |
| 113 | `puente-lenguaje-dueno` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: a_consulta/a_cifra) | — | — | — |
| 114 | `sello-cobertura` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: sellar) | — | — | — |
| 115 | `tablero-margen-dimension` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: cruzar) | — | — | — |
| 116 | `valor-neto-contable` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: calcular) | — | — | — |
| 117 | `valoracion-existencia` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: valorar) | — | — | — |
| 118 | `variacion-stock-valorada` | NO | 1·2·5 — RPC PREGUNTA/bus (sin accion humana: variacion) | — | — | — |

## Totales

| Métrica | N |
|---|---|
| Módulos totales | 118 |
| **SÍ necesita interfaz** | **43** |
| NO necesita (RPC PREGUNTA / bus) | 75 |
| — `system_panel` / `lateral_derecha` | 29 |
| — `workspace_module` / `barra_modulos` | 13 |
| — `chat_tool` / `input_chat` | 1 |
| — `inline_render` | 0 (ningún módulo lo usa en esta vertical) |

## Nota sobre el script canónico y `banco-ideas`

El script canónico `--all` **crashea** por un módulo AJENO (`banco-ideas` tiene
`publishes` en dict, no array). En esta pasada se ejecutó **`--module <slug>` uno a uno**
sobre los 118; **no se tocó `banco-ideas`** (ajeno a la vertical).
