---
name: esquematizar-interfaz
description: "FASE 6½ del proceso de proyecto (entre decidir-interfaz y construir-interfaz): esquematiza la interfaz CONCRETA de un módulo con su tipo ya elegido (F6). Aplica el método del esquematizador — prisma de 5 huecos ronda a ronda hasta seco + disección con FORMA — sobre el sujeto 'la interfaz del módulo X de tipo Y'. El entregable es la SPEC de la interfaz (qué vistas, qué operaciones del module.json, qué datos, qué eventos) en <proyecto>/esquemas/interfaz-<slug>/ — la que construir-interfaz (F7) CONSUME para generar el trío sin improvisar."
when-to-use: "Entra encadenada por proceso-negocio tras negocio.interfaz (FASE 6½) o a mano: dado un módulo con su tipo de interfaz decidido (ui_handlers tipados en module.json), sacar la anatomía de su interfaz ANTES de construirla. NUNCA construir la interfaz (F7) sin pasar por aquí: el panel sin spec es improvisación."
fuente: enki
dominio: ui
lente_dominio: prisma
lente_tarea: esquematizar-interfaz
tags: [fase65, interfaz, esquema, prisma, diseccion, spec, workspace_module, system_panel, chat_tool, inline_render, agnosticismo]
---

# Esquematizar la Interfaz — FASE 6½ del proceso de proyecto

> El eslabón que faltaba entre DECIDIR (F6) y CONSTRUIR (F7). La lección en
> vivo: decidimos el tipo y saltamos a construir el panel — el LLM improvisó
> una interfaz sin anatomía. Error grave. El panel debe construirse desde la
> SPEC que el prisma extrae, no desde la ocurrencia del generador.
>
> Código: fase 6½ de proceso · habilita `negocio.interfaz_esquematizada`.

---

## 1 · El problema que resuelve

La FASE 6 decide el TIPO de superficie de un módulo (`workspace_module` ·
`chat_tool` · `inline_render` · `system_panel` · ninguna) y lo escribe en
`module.json` (ui_handlers tipados). La FASE 7 construye el trío frontend.
Pero **entre decidir y construir falta la anatomía**: ¿qué vistas tiene el
panel? ¿qué operaciones del module.json expone? ¿qué datos refleja? ¿qué
eventos escucha? Eso NO se decide en F6 (decide el tipo, no el contenido) y NO
puede improvisarse en F7 (el generador inventaría).

La respuesta es el esquematizador aplicado al sujeto correcto: **la interfaz
del módulo X de tipo Y**. El prisma de 5 huecos, ronda a ronda hasta seco,
parte esa interfaz en sus piezas atómicas; la disección asigna FORMA a cada
pieza. El resultado es la SPEC: lo que F7 construye sin inventar.

## 2 · El sujeto — ya está fijado (no se pregunta)

```
sujeto = la interfaz del módulo <slug>, de tipo <tipo> (de la FASE 6)
entrada = module.json del módulo (ui_handlers tipados + tools + events)
```

**REGLA DIRECTIVA**: el sujeto se LEE, no se pregunta. El tipo ya lo decidió la
FASE 6; los tools y eventos ya existen en el module.json. NO ofrezcas caminos
A/B/C: esquematiza.

## 3 · EL MANDATO — prisma punto a punto hasta quedarse seco

1. **Lee** el `module.json` del módulo: ui_handlers (con type+zone de la F6),
   tools (operaciones reales), events (subscribes/publishes), descripción.
2. **Pasa la interfaz por el prisma de 5 huecos** (IDENTIDAD · RESTRICCIONES ·
   CONTRATO · NO-OBJETIVOS · PREGUNTAS_ABIERTAS). Ronda 1: los 5 huecos y sus
   sub-productos. Ronda 2: cada sub-producto al prisma otra vez. Repite hasta
   que solo queden hojas atómicas/abiertas/repetidas (seco).
3. **DISECCIÓN**: cada hoja atómica pasa por el diseccionador → su FORMA
   (reflejo · micro-agente fuzzy · custodio · conversor · puente). NINGUNA hoja
   sin forma.
4. **Ensambla la SPEC en UN archivo** `esquemas/interfaz-<slug>.md` con las
   secciones: prisma ronda 1 · prisma ronda 2 · disección · esquema maestro
   (VISTAS · OPERACIONES del module.json · DATOS · EVENTOS · ZONA/TIPO).
5. Cierra la fase: `proceso-negocio.completar_fase { fase: 'interfaz_esquematizada' }`.

**Dónde se persiste** (ruta exacta — patrón del repo: UN entregable = UN path,
como `esquema.md` y `plan-construccion.md`):

```
<storage del proyecto>/esquemas/interfaz-<slug>.md
```

Un solo archivo con TODO embebido: el prisma (ronda 1 y ronda 2), la disección
y el esquema maestro. Nada de directorios de pasadas — el patrón del repo es un
artefacto por fase (la lección en vivo: yo metí multi-archivo y Paco lo
detuvo: "revisa, ya tenemos un patrón").

## 4 · El prisma de 5 huecos APLICADO a una interfaz

| Hueco | Pregunta para la interfaz | Ejemplo (pedidos, workspace_module) |
|---|---|---|
| IDENTIDAD | ¿Qué panel es, qué trabajo del humano resuelve? | Panel de operación del ciclo de vida del pedido en el POS |
| RESTRICCIONES | ¿Qué reglas duras? (contrato frontend: zonas, 33vh, sin modales; multi-tenant; proyector sin estado…) | Contrato frontend, multi-tenant, vivo (eventos pedido.*) |
| CONTRATO | ¿Qué expone? (vistas · operaciones del module.json · datos · eventos) | 12 acciones: create, add-item, send-kitchen…; 7 eventos |
| NO-OBJETIVOS | ¿Qué NO es este panel? (qué superficies no duplica) | No es cocina, no es catálogo, no es cobro |
| PREGUNTAS ABIERTAS | ¿Qué decide el dueño? | ¿Historial/facturación dentro o en facturas? |

**La ley del esquematizador vale aquí también**: agnosticismo — cero
tecnologías del entorno en el análisis; las piezas declaran puertos
(`leer(id)`, `observar(evento)`, `operar(accion)`). El sitio donde aterrice
(F7) cablea el adaptador.

## 5 · La SPEC que F7 consume

El `esquema.md` de la interfaz es el contrato de construcción. Debe responder
explícitamente:

1. **Vistas** del panel (lista, detalle, stats, flujo…) — cada una con su FORMA
2. **Operaciones** del module.json que el panel expone (las tools reales)
3. **Datos** que refleja (qué store, qué pide al backend)
4. **Eventos** que escucha (suscribirse para mantenerse vivo)
5. **Zona/tipo** confirmados de la F6 (el mapeo F6→F7)

Con eso, `construir-interfaz` (F7) genera el trío sin improvisar: store +
panel + UIModule siguiendo la spec punto por punto.

## 6 · Verificación

- `esquemas/interfaz-<slug>.md` existe (la SPEC completa en UN archivo).
- Contiene las 4 secciones: prisma ronda 1 · prisma ronda 2 · disección (cada
  hoja con su FORMA) · esquema maestro (vistas, operaciones, datos, eventos, zona).
- CERO tecnologías del entorno en la spec (agnosticismo).
- Señal enviada: `proceso-negocio.completar_fase { fase: 'interfaz_esquematizada' }` → 200.

## 7 · Errores a evitar

- **Saltar de F6 a F7 sin esta fase** — el error grave que esta skill corrige: panel improvisado sin anatomía.
- **Preguntar el sujeto** — el tipo lo decidió F6, los tools están en el module.json; se LEE.
- **Ofrecer opciones A/B/C al entrar encadenada** — el proceso ya decidió: EJECUTA.
- **Esquematizar el MÓDULO** — el sujeto es la INTERFAZ del módulo, no el módulo.
- **Colar tecnologías** — agnosticismo: puertos abiertos, cero entorno.
- **Disecar antes de tocar suelo** — primero el prisma se agota, luego la FORMA.
- **Dejar hojas sin FORMA** — la disección punto a punto es parte del entregable.
- **Olvidar la señal de fase** — sin completar_fase, el proceso se detiene.
