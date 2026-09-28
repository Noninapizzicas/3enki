# F4 · Tracking de construcción

> **Fase 4** (construir-modulos). Orden tomado de la espina `enki-plan` de F3b — que es **topológico** (verificado: toda dependencia va antes).
> **Decisión del dueño (2026-09-28):** grupos por el **ORDEN de la espina** (~8 hojas), NO por oleada estricta. Motivo: las hojas de `contabilidad-entrada` dependen de piezas de `libro`/`analitica` → construir por vertical dejaría 10 hojas colgando.
> **La vertical sigue siendo la unidad de ORGANIZACIÓN y ACTIVACIÓN** (los módulos se hablan dentro y fuera de ella); la construcción va por dependencias.

## Convención de rutas (verificada)

- Módulos: `modules/nichos/<slug>/` tiene 2 niveles → **`modules/contabilidad/<slug>/`** (el loader soporta agrupación por vertical: `core/modules/loader.js` L125).
- Habilitación: por **proyecto** (`config/project.json`), no en el `config.json` del repo (nichos no está en el `enabled` del repo).
- Skills FULL (F5): `modules/cosecha/cantera/enki/<slug>/SKILL.md`.

## Los 8 REUTILIZAR (ya existen — NO se construyen)

`filesystem` · `project-manager` · `credential-manager` · `facturas` · `facturacion/fuentes` · `metricas` · `facturacion/asesoria` · `inventario`

## Progreso

| Grupo | Hojas | Estado |
|---|---|---|
| 1 | contrato-hecho-minimo · anclaje-cierre-vertical · cola-revision · regla-contrapartida · lote-admision · puerto-evento-vertical · historial-proceso-contable · maestro-terceros | ✅ `3597f4fb` |
| 2 | single-writer · frontera-planos · normalizador-hecho · puerto-extracto · regla-movimiento-bancario · maestro-cuentas-bancarias · expediente-documental · ratificacion-regla-aprendida | ✅ `e3b9e9b5` |
| 3 | puerto-nomina · aislamiento-negocio · acceso-nomina · cola-declaraciones-criterio · clave-natural · deduplicacion-hecho · completitud-cobertura · hecho-rectificativo | ✅ `73fb7aee` |
| 4 | resolucion-contrapartida · panel-proceso-contable · cuenta-terceros · desatasco-entrada · compra-proveedor · emision-factura-venta · declaracion-fuente-faltante · aviso-revision | ✅ `ed9022b9` |
| 5 | catalogo-cuentas · escritor-diario · mayor-balanza · traza-asiento · asiento-ajuste · periodificacion · conciliacion-bancaria · partida-no-identificada | ✅ `18256606` |
| 6 | saldo-tesoreria · vista-revisable · flujo-firma · perfil-administrativo · liquidacion-iva · registro-verifactu · factura-electronica · recibo-nomina | 🚀 en curso |
| 7 | inmovilizado · cierre-ejercicio · onboarding-negocio · motor-avisos · aviso-cuadre · calendario-fiscal · estado-presentacion-fiscal · rectificacion-declaracion | pendiente |
| 8 | frontera-ficha-producto · valoracion-existencia · estados-contables · retenciones-is-irpf · generador-modelo · acuse-presentacion · consolidacion-grupo · etiquetado-analitico | pendiente |
| 9 | margen-analitico · presupuesto · cuadro-mando-contable · informe-rico · consulta-dueno · puente-lenguaje-dueno · aviso-al-negocio · informe-accionable | pendiente |

## Hallazgos de módulos AJENOS (no se tocan — para que el dueño los sepa)

| Módulo | Qué | Estado |
|---|---|---|
| `modules/banco-ideas/module.json` | **`subscribes` es un DICT**, no un array (`{"evento": "handler"}`). El formato viejo. Rompe `scripts/validate-hibridos.js` **global** (`manifest.subscribes is not iterable`) → el validador de híbridos no puede correr para NADIE mientras eso siga así. | pre-existente (`be8cad7c`, generado por pipeline). **NO tocado.** |
| `http-gateway.test.js` | `EADDRINUSE 0.0.0.0:3001` — el puerto está ocupado por un servicio vivo del host (`ss -ltnp` lo confirma). No referencia contabilidad. **SOLUCIÓN VERIFICADA**: la suite lee `process.env.PORT`, así que `PORT=3399 npm run test` → **PASA (exit 0, "Todos los tests pasaron")**. No hace falta matar el servicio del usuario. | ambiental, **eludible así** |
| `arquitectura/decisiones/_outputs/eventos-publish-subscribe.json` | artefacto **auto-generado** por los validadores ("NO editar a mano"); se regenera al correrlos. | no se commitea. |

## Lecciones del proceso (aplicadas grupo a grupo)

1. **Verificar el CÓDIGO, no los comentarios.** Un grep sobre un docstring que decía *"sin PosPersistencia"* dio falso positivo en 2 módulos (grupo 1). El chequeo ahora quita comentarios antes de buscar.
2. **Escribir los 16 ficheros COMPLETOS primero, verificar después.** El grupo 4 se quedó sin iteraciones a 7,5/8 y faltó `aviso-revision/module.json` → lo cerró el padre a mano. Los grupos 5 y 6 ya llevan esa orden.
3. **`_rpc` / `_invalid` son helpers de la base** (`modules/_shared/modulo-hibrido-reflejo.js`), no hay que redefinirlos. El sub-agente los usó bien sin que se los listara.
4. **Contrato tolerante** cuando la dependencia aún no existe: `503 DEPENDENCIA_NO_DISPONIBLE` y **nunca fabricar el dato** (3 módulos del grupo 4). Se desbloquean cuando llegue `motor-avisos` (grupo 7).
