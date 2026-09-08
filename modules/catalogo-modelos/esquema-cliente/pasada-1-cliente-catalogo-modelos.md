# Pasada 1 — Esquematizador-Cliente · catalogo-modelos

> SUJETO correcto: **la cara de consumo/elección del catálogo de modelos 3D (POS/PWA/tienda
> donde un cliente ELIGE y COMPRA)**. Verdict: **NO EXISTE** → `ui_decision.necesita=false`.

## Decisión (lente CLIENTE)

**El módulo «catalogo-modelos» NO tiene cara de cliente.** Es un proyecto de **USO PROPIO**
(`fase0` `tipo_derivado: "uso_propio"`, `que_vende: "nada — piezas para uso propio`:
conectores, soportes, prototipos"). No hay POS, PWA ni tienda donde un cliente elija o
compre modelos ni piezas. El catálogo es un **registro interno de alta + consulta** usado
por el dueño (jefe) y el operador del taller; no expone selección ni compra de producto.

## Alimento (informer al prisma — lente cliente)

- **FASE 0** (`fase0-identidad-negocio.json`): `tipo_derivado: "uso_propio"`, `que_vende:
  "nada"`. No hay cara de consumo ni venta.
- **FASE 2** (`esquemas/esquema.md`, `pasada-2a-catalogo-modelos.md`): el esquema-jefe ya
  dejó la cara CLIENTE "AL MARGEN" («no hay POS/PWA que elija modelos; el catálogo es un
  registro de alta + consulta»).
- **module.json + index.js**: el CUSTODIO es el ÚNICO escritor de su store
  (`Map<id,Modelo>`). Ops `registrar` (JEFE: da de alta), `listar`/`obtener`/`categorias`
  (neutro: consulta del operador). No hay op de compra, checkout, carrito, elección de
  cliente ni selección de pieza para el consumidor final. Se publica
  `catalogo.modelo_registrado` y el par de fallo `catalogo.registrar.failed`.

## Aplicación del prisma de 5 huecos (lente cliente)

1. **¿Qué ELIGE el cliente?** — Nada. No hay consumidor final que elija o compre.
2. **¿Qué necesita VER el cliente?** — Nada: no hay cara de consumo.
3. **¿Qué SEÑAL pareada confirma?** — No aplica: sin acción de cliente no hay señal.

El prisma de los 5 huecos **no se despliega** por ausencia de cara de consumo.

## Veredicto del ÁRBITRO (lente-roles: cliente)

| Criterio | Resultado |
|---|---|
| ¿Hay POS/PWA/tienda donde el cliente elige/compra? | **NO** — uso propio, no se vende (`que_vende: "nada"`) |
| ¿Hay selección de modelo/pieza por el consumidor final? | **NO** — listar/obtener/categorias son consulta del operador, no de compra |
| `ui_decision.necesita` | **`false`** |
| `ui_decision.tipo` | **`null`** |
| `ui_decision.razon` | **`uso propio, sin cara de consumo`** |

## Huecos

No hay huecos de interfaz de CLIENTE: el rol cliente no aplica a este módulo. Los
`ui_handlers` EXISTENTES (registrar/listar/obtener con tipo `workspace_module`, zona
`barra_modulos`) corresponden a los roles JEFE/OPERADOR (del esquema-jefe) y se
**CONSERVAN intactos** — la decisión de cliente es declarativa y aditiva, no destructiva.

`[ABIERTO]` — si el negocio algún día vendiera piezas, habría que re-ejecutar la lente
cliente sobre este catálogo para decidir `tipo` y ui_handlers de consumo. Hoy no procede.

## Cables hacia el blueprint (vía lente cliente)

- `ui_decision = { necesita: false, tipo: null, razon: "uso propio, sin cara de consumo" }`.
- Sin ui_handlers de rol cliente (correcto: no hay cara de consumo).
- Conserva los ui_handlers del rol jefe/operador existentes (registrar/listar/obtener).
