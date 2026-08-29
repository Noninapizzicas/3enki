---
name: esquematizador-jefe
description: >-
  Variante del esquematizador con LENTE DE ROL JEFE: analiza la cara de
  decisión de un módulo (qué declara, de qué se informa, qué señales la
  sostienen) para producir el esquema que un agente de UI convierte en
  pantallas. Mismo prisma de 5 huecos, mismas fases, misma ley de
  agnosticismo — cambia el SUJETO (la cara del jefe, no el módulo entero),
  las PREGUNTAS de cada hueco y las FORMAS de la disección (formas UI).
when-to-use: >-
  Antes de crear o rediseñar la interfaz de gestión de un módulo: cuando se
  pida "análisis del módulo X para la UI del jefe", "esquema de la cara de
  gestión", o al alimentar al agente generador de blueprints con lente de
  roles. NO para analizar la cara de utilización (POS/PWA) ni el módulo entero.
fuente: enki
dominio: metodo
lente_dominio: prisma
lente_tarea: esquematizar
tags: [esquema, jefe, roles, ui, agente, prisma, diseccionador, agnosticismo, metodo]
---

# Esquematizador-Jefe

> Es el esquematizador con LENTE DE ROL JEFE. Mismo método — prisma de 5 huecos,
> recursión hasta seco, disección de hojas, ley de agnosticismo — cambiando tres
> cosas: el SUJETO que entra, las PREGUNTAS de cada hueco y las FORMAS que reparte
> la disección. El resultado alimenta directamente a un agente de UI.

Esta variante orquesta las mismas herramientas (prisma-modelo-universal +
diseccionador) con los mismos archivos de pasada. No reinventa el método: lo APUNTA.

## El SUJETO correcto (qué entra al prisma)

No es "el módulo X" — es **la cara del ROL JEFE del módulo X**:

```
"la capacidad del módulo X de servir las DECISIONES de su rol JEFE:
 qué puede declarar, de qué necesita informarse, y qué señales sostienen
 esas decisiones"
```

Si entra el módulo entero, el prisma mezcla caras (jefe, utilización, sistema)
y el análisis sale contaminado. Entrando solo la cara del jefe, cada hoja que
toque suelo es directamente material de panel.

## El ALIMENTO antes de prisar (informer al prisma)

El prisma baja más afilado si llega con 3 informes de código ya hechos:

| Inyecto | De dónde sale | Qué hueco llena |
|---|---|---|
| Eventos del módulo (publica/escucha/huecos) | module.json + index.js | CONTRATO sale lleno, no vacío |
| Elementos/handlers mapeados a necesidades del jefe | anatomía previa del módulo | IDENTIDAD no adivina |
| Invariantes del módulo (fuentes, custodios, estado) | código | RESTRICCIONES honestas |

**Regla de oro**: el hueco [ABIERTO] no se inventa la decisión del dueño — se
NOMBRA y se deja para su cierre. Los huecos de negocio son onboarding, no defectos.

## Las PREGUNTAS — el prisma de 5 huecos con lente jefe

| Hueco clásico | Pregunta con lente jefe |
|---|---|
| IDENTIDAD | ¿Qué **DECIDE** el jefe aquí? (no qué hace el módulo) |
| RESTRICCIONES | ¿Qué **NO depende de él**? (custodios, fuentes únicas, invariantes) |
| CONTRATO | ¿Qué necesita **VER** antes de decidir y qué **SEÑAL** confirma su decisión? |
| NO-OBJETIVOS | ¿Qué caras **NO son del jefe**? (utilización/POS, cliente, sistema) |
| PREGUNTAS_ABIERTAS | ¿Qué decisión es **SUYA** y está pendiente? |

## La LENTE-de-ROLES (árbitro dentro del análisis)

Si un sub-producto puede ser de varias caras, el árbitro decide:

```
¿ESCRIBE en reglas/config del dominio (vía custodio)?      → JEFE
¿SE EJECUTA en el momento de la venta/atención?             → UTILIZACIÓN (fuera: POS)
¿SOLO LEE estado o calcula?                                 → NEUTRO (alimenta la vista)
```

La pregunta árbitro: *¿esta pieza decide el FUTURO del catálogo/reglas/producción,
o sirve una decisión AHORA?* futuro = jefe · ahora = utilización · solo informa = neutro.

El panel del jefe se compone SOLO de hojas-jefe + hojas-neutro que las alimentan.
El esquema SEPARA las hojas de utilización (existen, pero van al POS — el agente
de UI del jefe no las toca).

## El PATRÓN de composición de la vista del jefe

Cuando el prisma toque suelo, el árbol debe dejar legible la composición en 3 capas:

```
1. SELECCIONAR  — elegir la entidad sobre la que decide (siempre un ref al list)
2. INFORMARSE   — las lecturas que alimentan la decisión (get/stats/estado)
3. DECLARAR     — las escrituras del jefe (las ÚNICAS que escriben, vía custodio)
```

+ los principios que trascienden módulos:
- **Frecuencia → jerarquía**: lo que el jefe hace 10×/día es gesto en vista; lo demás, modal
- **La señal manda**: tras declarar, la vista espera el evento de confirmación (nunca recarga)
- **El informe distingue origen**: lo que el jefe declaró vs lo que el sistema derivó (transparencia)

## Cuándo parar de bajar (umbral de atómic-UI)

Misma ley {atómico, abierto, repetido} + el umbral específico de esta variante:

**Una hoja es atómica cuando el agente de UI puede DIBUJARLA directamente**:
- `ref-select` (elegir entidad desde un listado)
- `inline-gesture` (decidir sin salir de la vista: toggle, cifra, confirmar)
- `editor-bloque` (modal/panel que agrupa una declaración multi-campo)
- `cinta-estado` (lecturas agregadas que abren la decisión)
- `señal-refresh` (qué evento re-lee la vista tras cada declaración)

Si la hoja aún describe "una experiencia" o "un flujo", SIGUE prismando.

## Qué escribe

```
esquema-jefe/
├─ pasada-1-<sujeto>.md       prisma con las 5 preguntas-jefe
├─ pasada-2..N-<...>.md       recursión (una pasada por ronda)
├─ pasada-N-diseccion.md      FORMA UI de cada hoja (formas de esta variante)
└─ esquema.md                 árbol maestro: decisiones del jefe, fuentes de info,
                              señales, huecos [ABIERTO], invariantes, composición
```

## FORMAS de la disección (esta variante reparte formas UI)

En vez de (o junto a) las formas clásicas del diseccionador (reflejo/custodio/
conversor/puente), cada hoja-jefe recibe su forma de CAPTURA:

| Forma UI | Cuándo |
|---|---|
| `ref-select` | elegir la entidad (producto, carta, plan) — siempre desde el list |
| `inline-gesture` | la decisión frecuente: toggle, cifra, toque→Enter |
| `editor-bloque` | la declaración multi-campo poco frecuente (1 modal, no fases) |
| `confirmador-nombrado` | acciones destructivas/gruesas: nombran qué y a quién afecta |
| `cinta-estado` | lecturas agregadas que dan el pulso sin navegar |
| `señal-refresh` | el evento que re-lee: SIEMPRE presente en hojas de declaración |

Toda hoja de declaración lleva su `señal-refresh` pareada — si no sabe qué señal
la confirma, la hoja no está madura.

## Errores a evitar (los del esquematizador + los propios)

- **Colar el sistema ambiente** — igual que el original; cero tecnologías en el análisis.
- **Analizar el módulo entero** — el fallo estrella de esta variante: si aparece una
  hoja de utilización (venta, selección del cliente), márcala y SÁCALA del árbol del jefe.
- **Dibujar antes de disecar** — el agente de UI no recibe "ideas de pantallas", recibe
  hojas con forma.
- **Cerrar los [ABIERTO]** — las decisiones de negocio se nombran, no se presuponen.
- **Un panel por módulo por capricho** — si el custodio es otro, la cara del jefe puede
  ser SECCIÓN del panel del custodio, no módulo aparte (p.ej. precios de extras viven en
  otro módulo: la vista del jefe los muestra, pero su editor está donde manda).

## Casos testigo

- `modules/pizzepos/variaciones/esquema-jefe/` — con esquema + anatomía de eventos/elementos
- `modules/pizzepos/productos/esquema-jefe/` — con `logica-para-ui.txt` como alimento
- Caso testigo del método original: `esquema/proyecto-puro/` (referencia de forma de entregable)