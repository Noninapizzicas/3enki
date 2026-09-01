---
name: enki-module-analysis
description: >-
  Análisis de lógica de módulos Enki con lente de ROL (jefe/utilización/neutro)
  como entrada para agentes que derivan UI — formato TXT de 6 secciones,
  árbitro de clasificación de ops por rol, y lecciones pagadas sobre dónde
  viven los datos (carta vs módulos proyectores).
when-to-use: >-
  Antes de despachar un agente creador de UI/blueprints: cuando el dueño pide
  "analiza el módulo X para la UI", "anatomía del módulo", "qué ofrece este
  módulo al jefe", o al preparar la spec que consume un agente de interfaz.
  NO para fij puntuales ni para diseñar la interfaz en sí (eso lo deriva el
  agente desde esta spec).
fuente: enki
dominio: metodo
tags: [enki, analisis, ui, roles, jefe, blueprint, modulo, lógica]
---

# Análisis de lógica de módulos — lente de ROL para agentes de UI

> El análisis previo que alimenta a un agente que DERIVA interfaz (blueprints.
> Salida en TXT plano (preferencia del dueño). Método detallado: skill
> `esquematizador` (prisma + diseccionador) — este doc captura la PRÁCTICA
> aplicada en vivo sobre productos y variaciones con la lente de rol JEFE.

## Las 6 secciones del análisis (formato probado)

1. **NATURALEZA** — qué es el módulo en una frase técnica: proyector / custodio /
   lector / juez; dónde vive el dato; su único estado interno. El agente necesita
   saber QUÉ puede asumir y QUÉ no. Ej: productos = proyector sin estado, mutaciones
   delegan al custodio, cero persistencia propia, único estado = mapping canal→carta.
2. **FLUJO DE RESOLUCIÓN** — si el módulo elige contexto (qué carta proyectar, qué
   canal), documentar la cadena EXACTA de fallback leída del código, en orden:
   p.ej. `_resolverCartaActiva`: (1) carta_id explícito → (2) canal en mapping →
   (3) mapping.general → (4) pregunta al custodio (en_servicio).
3. **OFERTA** — cada elemento/handler mapeado a la necesidad que sirve. Tabla:
   OP → FUNCIÓN → PARA QUÉ SIRVE AL ROL. Marcar [JEFE] / [utilización] / [neutro].
4. **EVENTOS** — publica/escucha con la necesidad que sirven + HUECOS: lo que el rol
   necesita y el bus NO emite (verificado en código, nunca supuesto). Ej productos:
   no existe producto.creado/actualizado (con delta)/disponibilidad.cambiada.
5. **NECESIDAD → OFERTA → PANTALLA** — tabla que el agente de UI traduce directo:
   necesidad del dueño | elemento que la sirve | qué pantalla deriva | estado ✅/❌.
   Los ❌ son los entregables reales del ciclo (backend faltante o captura faltante).
6. **INVARIANTES (R1-Rn)** — reglas de lógica que la UI no puede romper: dónde vive
   el dato, quién escribe, qué refresca la vista (señal del bus, nunca recarga),
   unidades (céntimos en el motor, euros en la cara), estados que no confundir
   (disponible ≠ activo), transparencia derivadas vs declaradas.

## El ÁRBITRO — cómo clasificar una op por rol

```
¿ESCRIBE en reglas/config del dominio (vía custodio)?
  → ROL JEFE — la cara de edición
     (configurar de variaciones · update/delete de productos ·
      plan.publicar/aprobar/ejecutar/cerrar de mise-en-place)

¿SE EJECUTA en el momento de la venta/atención (selección del cliente)?
  → ROL UTILIZACIÓN — cae en POS/PWA, NO al panel del jefe
     (evaluar de variaciones · add-item de pedidos · cliente.obtener)

¿SOLO LEE estado/cálculo?
  → NEUTRO — alimenta la vista, sin acción
     (get/list/stats/health/categorias)
```

**Pregunta árbitro**: *"¿decide el FUTURO del catálogo/reglas/producción, o sirve
una DECISIÓN AHORA?"* — futuro=jefe · ahora=utilización · solo informa=neutro.

## DÓNDE VIVEN LOS DATOS (verificado en código 29-ago-2026)

La fuente de cada dato NO es el módulo que lo muestra. Tabla de verdad pizzepos:

| Dato | Dónde vive | Quién lo muestra |
|---|---|---|
| Producto (nombre, precio venta, categoría) | **carta** (carta-manager, versionado) | productos (proyector sin estado) |
| Reglas de variación (permite_quitar/anadir, max, extras_sugeridos) | **carta** (campo producto.variaciones desde v2.5.0) | variaciones (lector + juez) |
| Precio extra por ingrediente | **ingredientes** (fuente única, su module.json lo declara) | variaciones/productos lo consultan |
| Qué carta sirve a cada canal | **tarifas** (config canal→carta_id) | productos obedece al proyectar |

Consecuencia de diseño: **los módulos especializados (productos, variaciones) son
vías de información+palanca hacia la CARTA** — su cara de edición delega. El panel
del jefe es esencialmente UNA cara de edición del custodio, no N paneles.

## Lecciones pagadas (correcciones del dueño en vivo, 29-ago-2026)

1. **El análisis NO es interfaz** — nada de diseñar ventanas/gestos en las pasadas.
   Mapear eventos+elementos a necesidades del rol y derivar PATRONES. El diseño lo
   deriva después el agente de la especificación. Pagado: pasadas con "layout
   propuesto" y "Columna lateral" — corrección: "no es el camino que quiero".
2. **No mezclar caras**: ops ejecutadas en la venta (POS, camarero, PWA) NO son del
   jefe aunque compartan módulo — `evaluar` (variaciones) no aparece en su panel.
   Pagado: el dueño corrigió "eso ya no es para el jefe, eso es el POS".
- **Verificar la premisa en código antes de afirmar dónde viven los datos** — el
   dueño corrige con juramentos correctos ("juraría que las reglas están en la
   carta"). grep a module.json (_nota de versiones) y al código del custodio antes
   de cada afirmación de propiedad de datos. Ver tabla "DÓNDE VIVEN LOS DATOS" arriba.
4. **variaciones para el jefe = información (get) + palanca (configurar)**, con el
   flujo: elegir producto → informarse → (opcional) declarar sobre la misma ficha.
   NO confundir con la captura del POS (elegir extras al pedir) — esa ya funciona.
5. **Salida en TXT plano** además del .md cuando el dueño quiere pasarse/llevarse el
   documento — preguntar o escribir ambos.
6. **La composición del panel del jefe** (patrón probado en variaciones/productos):
   SELECCIONAR (ref al list) → INFORMARSE (lecturas que alimentan la decisión) →
   DECLARAR (las únicas ops que escriben). Los huecos reales casi siempre son de
   CAPTURA (UI) o de EVENTOS granulares — el backend suele estar completo.

## Dónde escribir los archivos

`modules/<vertical>/<slug>/esquema-jefe/` (o `esquema/`) junto al módulo:
- `logica-para-ui.txt` — el análisis de 6 secciones (TXT)
- `anatomia-eventos-elementos.md` — eventos+elementos mapeados (si se pide detalle)
- Complementos esquematizador: pasada-N + disección + esquema.md (su formato)

Casos testigo completos: `modules/pizzepos/productos/esquema-jefe/` y
`modules/pizzepos/variaciones/esquema/logica-para-ui.txt`.

## Ver también

- `references/contrato-agente-ui.md` — el contrato completo para agentes generadores
  de UI: bloque `git` rama-propia, `frontend_sync` obligatorio antes del PR (la UI
  renderiza el blueprint del frontend, no el de modules/), el ciclo probado con
  delegate_task, y los bugs conocidos del tooling (generar-blueprint.js y verticales).