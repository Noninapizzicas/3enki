---
name: esquematizador-interfaz-cliente
description: >-
  Variante del esquematizador con LENTE DE ROL CLIENTE: analiza la cara de
  CONSUMO de un negocio (qué elige, compra, consume y repite el cliente final)
  para producir el esquema que un agente de UI convierte en la INTERFAZ GRÁFICA
  PARA EL CLIENTE (la web/PWA/app pública). Mismo prisma de 5 huecos, mismas
  fases, misma ley de agnosticismo — cambia el SUJETO (la cara del cliente, no
  la del jefe ni el módulo entero), las PREGUNTAS de cada hueco y las FORMAS de
  la disección (formas UI de consumo). Se alimenta de la FASE 0 (identidad) y el
  FM0 (fundamento de marketing): el marketing dice QUÉ prometer, este esquema
  dice CÓMO mostrarlo y convertirlo. Desglosa el diseño web en APARTADOS
  separados (CSS, iconos, fuentes, elementos, lógica, formas) — no un bloque.
when-to-use: >-
  Antes de crear la interfaz pública/web del cliente de un negocio: cuando se
  pida "diseño web del cliente", "interfaz para el consumidor", "la página del
  negocio", o al alimentar a un agente generador de la web de consumo. Se usa
  DESPUÉS de la FASE 0 (identidad-negocio) y del FM0 (marketing) — sin ellos,
  no hay ni qué prometer ni a quién dirigirse. NO para analizar la cara de
  gestión (jefe/POS) ni el módulo entero.
fuente: enki
dominio: metodo
lente_dominio: prisma
lente_tarea: esquematizar
tags: [esquema, cliente, roles, ui, web, marketing, prisma, diseccionador, agnosticismo, fm0, css, frontend]
---

# Esquematizador CLIENTE — la cara de consumo de un negocio (interfaz para el cliente)

> Es la contraparte de `esquematizador-jefe`. El jefe mira la cara de decisión de
> gestión; ESTE mira la cara de **consumo**. **NACE DE LA LÓGICA, no de una web
> asumida.** No reinventa el método del diseccionador: lo APUNTA. **Es un CICLO
> paso a paso, como el de esquematizador-jefe.**

## La posición en el ciclo (de cimientos a interfaz)

```
FASE 0   identidad-negocio   →  qué ES y qué VENDE el negocio (datos del dueño)
FM0      fundamento-marketing →  qué PROMETER y a QUÉN (diferenciación, audiencia, canales, embudo, objetivos)
FASE 2   esquematizador-interfaz-cliente (ESTE) →  QUÉ crear para cubrir esos objetivos → CÓMO se ve cada pieza
F7       construir-interfaz-cliente   →  el trío frontend real de lo que la lógica determinó
```

**Sin la FASE 0 y el FM0, este esquema no arranca**: no hay de qué derivar. Si
faltan o no hay objetivos, decirlo y NO inventar.

## La pregunta rectora (TODO nace de aquí)

> **"¿Qué tenemos que CREAR para cubrir los objetivos de estos dos documentos?"**

De la **lógica** de la FASE 0 (el negocio: qué es, qué vende, cómo lo elabora) +
el FM0 (objetivos de marketing, canales, embudo) SE DERIVA el QUÉ construir. Ese
QUÉ **no está asumido ni limitado por catálogo/inventario**: puede ser una o dos
interfaces distintas, una app web, una PWA instalable, una app móvil, un
dashboard, lo que la lógica pida. **Lo que no existe se crea** (construir-modulos
/ generar-ui-web / adaptar-a-enki). La oferta no está cortada por lo que ya hay.

Regla de oro: **la lógica manda**. El qué construir nace de la lógica (objetivos
de fase-0/fm0), y la lógica de cada pieza determina cómo se comporta y qué
eventos toca. CSS, iconos, fuentes, elementos y formas SOSTIENEN la lógica — no
al revés.

## Derivar el QUÉ (primer paso, antes de esquematizar)

- Leer FASE 0 + FM0.
- Derivar las **piezas** que cubren sus objetivos, con **porqué**.
- Marcar cada pieza con su **cara** (cliente / jefe / neutro) para aplicar la lente correcta.
- Si una pieza no existe en el sistema → `a_crear` (se construye).

## El SUJETO correcto (qué entra al prisma)

La **cara de CONSUMO** del negocio:
```
"la capacidad del negocio de servir el RECORRIDO del cliente final:
 descubrir, elegir, comprar, pagar, recoger, repetir — que convierta y fidelice"
```
Si una pieza derivada es de cara JEFE, se esquematiza con la lente jefe (reglas/config),
no con esta — no se mezclan caras.

## El ALIMENTO antes de prismar (informar al prisma)

| Inyecto | De dónde sale | Qué hueco llena |
|---|---|---|
| Identidad del negocio (qué es, qué vende, cómo elabora) | `fase0-identidad-negocio.json` | IDENTIDAD: la esencia que la web debe transmitir |
| Fundamento de marketing (audiencia, canales, embudo, diferenciación) | `storage/marketing/fm0.md` | CONTRATO: a quién dirigirse y qué prometer |
| Embudo del negocio (descubrir→probar→enganchar→fidelizar→referir) | `fm0.md` (F5) | RESTRICCIONES: qué pantallas/acciones sostienen cada etapa |
| Diferenciador real (no la app: la promesa) | `fm0.md` | NO-OBJETIVOS: qué NO prometer, qué no abrumar |

**Regla de oro**: el hueco [ABIERTO] no se inventa la decisión del cliente — se
NOMBRA y se deja para su cierre. Los huecos de negocio son onboarding, no defectos.

## Las PREGUNTAS — el prisma de 5 huecos con lente cliente

| Hueco clásico | Pregunta con lente cliente |
|---|---|
| IDENTIDAD | ¿Qué **ELIGE** el cliente aquí? (no qué hace el negocio) |
| RESTRICCIONES | ¿Qué **ya está decidido** por el negocio? (precios, catálogo, canal, margen — el cliente no decide estos) |
| CONTRATO | ¿Qué necesita **VER** para decidir comprar y qué **SEÑAL** confirma su acción (pedido confirmado, pago, recogida)? |
| NO-OBJETIVOS | ¿Qué caras **NO son del cliente**? (jefe/POS, gestión, sistema) |
| PREGUNTAS_ABIERTAS | ¿Qué decisión de negocio **falta** y bloquea la conversión? (p. ej. margen para una oferta) |

## La LENTE-de-ROLES (árbitro dentro del análisis)

Si un sub-producto puede ser de varias caras, el árbitro decide:

```
¿LO CONSUME el cliente final al elegir/comprar/repetir?   → CLIENTE (este esquema)
¿LO DECIDE el dueño para configurar el negocio?            → JEFE (fuera: esquematizador-jefe)
¿SE EJECUTA en el momento de la venta/atención/cocina?     → UTILIZACIÓN/OPERACIÓN (fuera: POS)
¿SOLO informa estado?                                      → NEUTRO (alimenta la vista)
```

La pregunta árbitro: *¿esta pieza forma parte del RECORRIDO del cliente (descubrir
→ comprar → repetir), o del gobierno/operación interna del negocio?* recorrido =
cliente · gobierno = jefe · operación = POS · solo informa = neutro.

La web del cliente se compone SOLO de hojas-cliente + hojas-neutro que las
alimentan. El esquema SEPARA las hojas de gestión (existen, pero van a la
interfaz del jefe — otro agente las toca).

## El PATRÓN de composición de la web del cliente

Cuando el prisma toque suelo, el árbol debe dejar legible el recorrido de
conversión en 3 capas:

```
1. DESCUBRIR  — aterrizar: quién eres, qué prometes, diferenciador (hero + propuesta de valor)
2. ELEGIR     — el catálogo: lo que el cliente selecciona (productos, opciones, config)
3. CONVERTIR  — pedir/pagar/recoger: el acto que cierra (carrito, pago, confirmación, aviso)
```

+ los principios que trascienden módulos:
- **El camino mínimo**: de descubrir a convertir en el menor nº de pasos (2 toques si puede)
- **La señal manda**: tras pedir/pagar, la vista espera el evento de confirmación (nunca recarga)
- **La confianza primero**: el diferenciador y la prueba (qué hace distinto este negocio) van arriba, no enterradas
- **La repetición**: lo que hace volver (recurrencia, avisos, preferencias) es parte del recorrido, no un extra

## Cuándo parar de bajar (umbral de atómico-UI)

Misma ley {atómico, abierto, repetido} + el umbral específico de esta variante:

**Una hoja es atómica cuando el agente de UI puede DIBUJARLA directamente**:
- `hero-promesa` (el titular: qué es + diferenciador en una sola vista)
- `tarjeta-item` (un producto/elemento seleccionable del catálogo)
- `selector-opciones` (las variantes que el cliente elige: tamaño, extra, cantidad)
- `flujo-pedido` (el paso que convierte: carrito → pago → confirmación)
- `señal-confirmacion` (el evento que re-lee tras cada acción: confirmado, listo, en ruta)
- `reenganche` (lo que trae de vuelta: recordatorio, aviso, oferta recurrente)

Si la hoja aún describe "una experiencia" o "un flujo", SIGUE prismando.

## DESGLOSE del diseño web por APARTADOS (no un bloque)

> Cada apartado de la web se esquematiza POR SEPARADO, como pidió Paco. El esquema
> no entrega "la web" como una masa — entrega cada apartado con su forma, para que
> el agente de UI los construya de forma independiente y coherente.

| Apartado | Qué esquema produce |
|---|---|
| **CSS** | la identidad visual: paleta (colores de marca), jerarquía tipográfica, espaciado, redondeo, sombras, responsividad. Qué transmite y cómo sostiene la promesa |
| **Iconos** | el set de iconografía que refuerza la marca y guía el recorrido (qué icono en qué acción, coherencia) |
| **Fuentes** | la tipografía (títulos/cuerpo), el tono que proyecta (artesanal, moderno, cercano) y su lectura. Fuentes que combinan con la identidad |
| **Elementos** | los componentes UI de consumo: hero, tarjetas de producto, selectores, botones de acción, formulario de pedido, estados de confirmación |
| **Lógica** | el comportamiento: cómo se conecta cada elemento a un evento del bus (elegir→precio, pedir→confirmar, pagar→recoger). Qué llama a qué |
| **Formas** | la silueta visual general: redondeado vs recto, denso vs aire, minimalista vs ornamentado — la "forma" que marca la web de este cliente |

Cada apartado es UNA sección del esquema con su propia hoja. No se mezclan:
el CSS no decide la lógica, la lógica no decide la forma. Cada uno se esquematiza
y luego el agente de UI los ensambla sobre el esqueleto.

## Qué escribe — RUTA EXACTA, NO IMPROVISES

**REGLA DE PERSISTENCIA (crítica, pagada en vivo)**: el esquema se escribe SIEMPRE
en `storage/esquema-cliente/` (raíz del storage del proyecto, NO dentro de
`marketing/`). NO crees subcarpetas extra (nada de `marketing/esquema-cliente/`),
NO cambies el nombre de la carpeta. La carpeta base es `esquema-cliente/` y
dentro van los archivos del árbol maestro. Verifica al final que `esquema.md`
existe en `storage/esquema-cliente/esquema.md` y di el path absoluto.

```
storage/esquema-cliente/
├─ identidad.md           la esencia que la web transmite (del fm0 + fase-0)
├─ aparatados-css.md      identidad visual: paleta, tipos, espaciado, responvidad
├─ apartados-iconos.md    set de iconografía y coherencia visual
├─ apartados-fuentes.md   tipografía y tono
├─ apartados-elementos.md componentes de consumo (hero, tarjetas, selectores, pedido)
├─ apartados-logica.md    comportamiento: qué elemento llama a qué evento del bus
├─ apartados-formas.md    silueta visual general (redondeado, aire, estilo)
├─ pasada-1-<sujeto>.md   prisma con las 5 preguntas-cliente
├─ pasada-2..N.md         recursión (si hace falta, una pasada por ronda)
└─ esquema.md             árbol maestro: recorrido del cliente, formas de cada hoja,
                          huecos [ABIERTO], apartados del diseño, invariantes
```

## FORMAS de la disección (esta variante reparte formas UI de consumo)

En vez de las formas del jefe (declaración de reglas), cada hoja-cliente recibe
su forma de CONSUMO:

| Forma UI | Cuándo |
|---|---|
| `hero-promesa` | la primera vista: qué es + diferenciador. SIEMPRE del fm0 (sección identidad/competencia) |
| `tarjeta-item` | cada elemento seleccionable del catálogo (producto, servicio) |
| `selector-opciones` | las variantes que el cliente elige: tamaño, extra, cantidad, recurrencia |
| `flujo-pedido` | el paso que convierte: carrito → pago → confirmación (mínimo de pasos) |
| `señal-confirmacion` | el evento que re-lee tras cada acción: confirmado, listo, en ruta, pagado |
| `reenganche` | lo que trae de vuelta: recordatorio, aviso, oferta recurrente (del fm0) |

Toda hoja de acción lleva su `señal-confirmacion` pareada — si no sabe qué señal
confirma el pedido/pago, la hoja no está madura.

## Reglas (mismo ciclo que esquematizador-jefe)

1. LEER el alimento (fase-0 + fm0) ANTES de prismar — el prisma baja afilado.
2. PRISMAR con las 5 preguntas-cliente, una pasada por ronda.
3. El árbitro de lente decide cada hoja (cliente / fuera: jefe / fuera: POS / neutro).
4. DESGLOSAR los apartados de diseño web POR SEPARADO (CSS, iconos, fuentes, elementos, lógica, formas).
5. Parar en el umbral atómico: hoja = forma UI dibujable.
6. NOMBRAR los huecos [ABIERTO] — no inventar la decisión del cliente ni del dueño.
7. Cerrar con `esquema-cliente/esquema.md` (árbol maestro + apartados + formas).
