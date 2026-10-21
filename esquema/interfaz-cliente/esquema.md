# Esquema — Sistema de Interfaz Cliente

> El sistema completo que presenta un proyecto a sus clientes finales.
> Conecta los datos de marketing, la identidad visual del proyecto,
> las herramientas de generación y la publicación — para que el cliente
> reciba una experiencia coherente, adaptada al tipo de proyecto.

---

## Árbol maestro

```
INTERFAZ CLIENTE
├─ [IDENTIDAD] El punto de contacto entre el proyecto y su cliente final
│
├─ PERFIL DE CLIENTE ──────────────────────────────────────────
│  ├─ #1  Arquetipo de proyecto ···· ATÓMICO · reflejo
│  │      Enum abierto: restaurante, e-commerce, servicios, app,
│  │      informativo, educación, comunidad, marketplace.
│  │      Condiciona qué presencias y páginas tiene sentido crear.
│  │
│  ├─ #2  Intención del cliente ···· ATÓMICO · reflejo
│  │      Qué viene a hacer: comprar, informarse, reservar, contactar,
│  │      suscribirse, consumir contenido, usar herramienta.
│  │      La necesidad primaria que la interfaz satisface.
│  │
│  ├─ #3  Contexto de consumo ······ ATÓMICO · reflejo
│  │      Cómo y dónde consume: móvil, desktop, tablet, kiosko.
│  │      Afecta responsive, touch targets, densidad informativa.
│  │
│  └─ #4  Nivel de compromiso ······ ATÓMICO · custodio
│         Etapas: desconocido → curioso → interesado → cliente → fiel.
│         Se mapea al funnel. Custodio vigila transiciones válidas.
│
├─ PRESENCIA ──────────────────────────────────────────────────
│  ├─ #5  Canal ···················· ATÓMICO · reflejo
│  │      Medio: web, app, email, red social, marketplace, físico.
│  │      REF → marketing-channels.
│  │
│  ├─ #6  URL/Ubicación ··········· ATÓMICO · reflejo
│  │      Identificador único: URL, handle, dirección del local.
│  │
│  ├─ #7  Formato ················· ATÓMICO · reflejo
│  │      Forma del contenido: HTML/CSS, imagen, PDF, email HTML,
│  │      pantalla nativa. Determinista por canal.
│  │
│  ├─ PÁGINAS (sub-presencia) ─────────────────────────────────
│  │  ├─ #9  Tipo de página ······· ATÓMICO · reflejo
│  │  │      Propósito: homepage, landing, productos, pricing, about,
│  │  │      contacto, blog, FAQ, legal, portfolio, carta, reservas,
│  │  │      checkout, dashboard-cliente. Enum extensible.
│  │  │
│  │  ├─ #10 Estructura ··········· ATÓMICO · micro-agente
│  │  │      Secuencia ordenada de secciones. Reglas por arquetipo
│  │  │      (restaurante → carta primero; SaaS → features+pricing).
│  │  │      LLM como fallback para combinaciones nuevas.
│  │  │
│  │  ├─ #11 Secciones ············ ATÓMICO · reflejo
│  │  │      Catálogo de bloques reutilizables: hero, CTA, navigation,
│  │  │      footer, testimonials, trust badges, carousel, grid,
│  │  │      pricing table, FAQ accordion, formulario, mapa, galería.
│  │  │      Cada sección tiene tipo + configuración tipada.
│  │  │
│  │  ├─ #12 Contenido de página ·· ATÓMICO · conversor
│  │  │      Mapea datos de marketing (content, strategy, audience)
│  │  │      a los huecos de cada sección. Transformación
│  │  │      dominio-fuente → dominio-vista.
│  │  │
│  │  ├─ #13 SEO ·················· ATÓMICO · micro-agente
│  │  │      Title, description, canonical, open graph, schema markup,
│  │  │      robots. Requiere comprensión del contenido — síntesis,
│  │  │      no matching.
│  │  │
│  │  └─ #14 Estado de página ····· ATÓMICO · custodio
│  │         Borrador → publicada → despublicada. Custodio vigila
│  │         contenido mínimo antes de publicar.
│  │
│  └─ #8  Estado (presencia) ······ ATÓMICO · custodio
│         Borrador → activa → pausada → retirada. Custodio vigila
│         transiciones y no publica una presencia en borrador.
│
├─ EXPERIENCIA ────────────────────────────────────────────────
│  ├─ #15 Puntos de contacto ······ ATÓMICO · reflejo
│  │      Momentos: visita web, recibe email, ve anuncio, entra al
│  │      local, usa la app. Cada punto pertenece a una presencia
│  │      y a una etapa del viaje.
│  │
│  ├─ #16 Navegación ·············· ATÓMICO · reflejo
│  │      Menú principal, breadcrumbs, links internos, búsqueda,
│  │      CTA inter-página. Generada por reglas dado un mapa de
│  │      páginas. Testable: toda página alcanzable, cero rotos.
│  │
│  ├─ #17 Llamadas a la acción ···· ATÓMICO · reflejo
│  │      Cada CTA: objetivo, texto, diseño, ubicación. Tipado
│  │      y validable. El contenido viene del conversor (#12).
│  │
│  └─ #18 Retroalimentación ······· ATÓMICO · reflejo
│         Respuestas por tipo de acción: confirmación de compra,
│         "email enviado", estados de error, progreso. Determinista.
│
├─ ENSAMBLADOR (pieza convergente) ────────────────────────────
│  │
│  │  ⚡ CONVERGENCIA: aquí se cruzan las dimensiones
│  │     interdependientes. NO son ramas paralelas —
│  │     son INPUTS de una pipeline secuencial.
│  │
│  ├─ #19 Resolución de contexto ·· ATÓMICO · reflejo
│  │      Dado un proyecto, resuelve: arquetipo, presencias, piel,
│  │      datos de marketing disponibles. Gathering determinista.
│  │
│  ├─ #20 Selección de estructura · ATÓMICO · micro-agente
│  │      Dado tipo de página + arquetipo, elige secciones y orden.
│  │      Reglas primero, LLM como fallback. (≈ pieza #10 desde
│  │      el punto de vista del ensamblador)
│  │
│  ├─ #21 Inyección de datos ······ ATÓMICO · conversor
│  │      Marketing → huecos de sección. Materialización del
│  │      conversor #12 a nivel del ensamblador completo.
│  │
│  ├─ #22 Aplicación de piel ······ ATÓMICO · conversor
│  │      PielJSON → propiedades concretas: tokens de color,
│  │      tipografía, radii, motion sobre estructura+datos.
│  │
│  ├─ #23 Renderizado ············· ATÓMICO · conversor
│  │      Estructura+datos+piel → formato de salida (HTML, email,
│  │      imagen, PDF). El conversor final.
│  │
│  ├─ #24 Publicación ············· ATÓMICO · puente
│  │      Lleva el resultado al canal. Puerto: publicar(resultado,
│  │      destino) [transporte ABIERTO]. REF → publicador.
│  │
│  └─ #25 Sincronización ·········· ATÓMICO · custodio
│         Cuando un dato de marketing cambia, las presencias
│         afectadas se regeneran. Custodio del dato vivo.
│
├─ INTERACTIVIDAD (el ciclo acción→respuesta) ─────────────────
│  │
│  │  La interfaz NO es presentación pasiva. El cliente
│  │  siempre interactúa: compra, reserva, filtra, busca,
│  │  chatea, paga. Sin esto, es un póster.
│  │
│  ├─ #27 Acciones del cliente ···· ATÓMICO · reflejo
│  │      Catálogo: enviar formulario, añadir al carrito,
│  │      reservar, filtrar, buscar, valorar, compartir,
│  │      descargar, chatear, autenticarse. Tipo + contexto
│  │      + datos de entrada.
│  │
│  ├─ #28 Captura de entrada ······ ATÓMICO · reflejo
│  │      Inputs de texto, selectores, botones, gestos,
│  │      voz, escaneo (QR, cámara). Validación en frontera:
│  │      el dato entra limpio o se rechaza.
│  │
│  ├─ #29 Ejecución de acción ····· ATÓMICO · puente
│  │      "Quiero reservar" → ejecutar(reserva, datos).
│  │      Puerto: ejecutar(accion, datos) [transporte ABIERTO].
│  │      El backend es adaptador, no parte de la interfaz.
│  │
│  ├─ #30 Estado de interacción ··· ATÓMICO · custodio
│  │      Carrito con 3 items, formulario a medias, filtro
│  │      activo, paso 2/4 del checkout. Estado efímero de
│  │      sesión. Custodio vigila coherencia.
│  │
│  └─ #31 Tiempo real ············· ATÓMICO · puente
│         Stock que baja, mesa que se ocupa, precio que cambia,
│         mensaje nuevo, pedido que avanza. Puerto:
│         observar(criterio) [transporte ABIERTO].
│
├─ [RESTRICCIONES] ────────────────────────────────────────────
│  ├─ REF → marketing-strategy (qué decir y a quién)
│  ├─ REF → marketing-audience (segmentos y perfiles)
│  ├─ REF → marketing-channels (por dónde llegar)
│  ├─ REF → marketing-content (piezas de contenido)
│  ├─ REF → piel del proyecto / marca-cliente (cómo verse)
│  ├─ REF → project-profile (qué es el negocio)
│  └─ REF → publicador (dónde y cómo se sirve al público)
│
├─ [CONTRATO] ─────────────────────────────────────────────────
│  ├─ Coherencia cross-canal ······ ATÓMICO
│  │   La misma identidad en web, email, redes, carta, app.
│  ├─ Adaptación al tipo ·········· ATÓMICO
│  │   La interfaz se ajusta al tipo de proyecto/cliente sin
│  │   código específico por vertical. El tipo es input.
│  └─ Dato vivo ··················· ATÓMICO
│      Si cambia el contenido, la interfaz cambia. No es estática.
│
├─ [NO-OBJETIVOS] ─────────────────────────────────────────────
│  ├─ No es el backoffice (cara TRABAJO del proyecto)
│  ├─ No es el CMS (el contenido viene de marketing-content)
│  ├─ No es el motor de marketing (esos son los 12 módulos)
│  └─ No es el diseñador (la piel viene del proyecto)
│
└─ [ABIERTO] ──────────────────────────────────────────────────
   ├─ ~~¿Interactividad bidireccional?~~ → CERRADA: SPAWN 5 Interactividad
   ├─ ¿Internacionalización (i18n)?
   ├─ ¿Personalización del cliente (preferencias, modo oscuro)?
   └─ ¿Versionado de interfaz publicada (A/B testing, staging)?
```

---

## Pipeline del ensamblador (la cadena de conversores)

```
  INPUTS                      PIPELINE                     OUTPUT
  ───────                     ────────                     ──────

  project-profile ──┐
  marketing-*    ──┤   #19            #20           #21
  arquetipo      ──┼→ [Resolución] → [Selección] → [Inyección]
  intención      ──┤  de contexto   de estructura   de datos
  presencias     ──┘      │              │              │
                          ▼              ▼              ▼
                     {contexto}    {secciones[]}   {secciones
                                                   + datos}
                                                      │
                          #22           #23           #24
  PielJSON ────────→ [Aplicación] → [Renderizado] → [Publicación]
                     de piel                         (puente)
                          │              │              │
                          ▼              ▼              ▼
                     {secciones     {HTML|email|    canal
                      + datos       imagen|PDF}    (web, email,
                      + piel}                       redes...)

                                        │
                          #25           │
  evento.cambio ────→ [Sincronización] ─┘
                     (custodio:
                      regenera al
                      detectar cambio)
```

---

## Recuento

| Métrica | Valor |
|---|---|
| Pasadas del prisma | 3 (P1 → 5 SPAWN, P2 → todo atómico, P3 → 12 módulos marketing clasificados por capa) |
| Piezas atómicas totales | 30 (únicas, descontando duplicadas #10≈#20 y #12≈#21) |
| Piezas contrato | 3 |
| REFs (deduplicadas) | 7 |
| Preguntas abiertas | 3 (1 cerrada: interactividad → SPAWN 5) |

### Reparto de formas

| Forma | Cantidad | % | Piezas clave |
|---|---|---|---|
| **reflejo** | 14 | 48% | Arquetipos, enums, catálogos, estructura tipada, navegación, acciones, captura |
| **custodio** | 5 | 17% | Estados (presencia, página, interacción), nivel de compromiso, sincronización |
| **conversor** | 4 | 14% | Contenido→sección, inyección, piel, renderizado |
| **micro-agente** | 3 | 10% | Estructura/selección (híbrido reglas+LLM), SEO |
| **puente** | 3 | 10% | Publicación, ejecución de acción, tiempo real |
| **TOTAL** | **29** | 100% | |

---

## Lectura del esquema

**1. Es un sistema reflejo con cadena de conversores y triple puente.**
La mitad de las piezas son datos deterministas (reflejo). La cadena conversor del ensamblador (marketing → contenido → piel → formato → canal) es el generador. Y tres puentes conectan la interfaz viva con el mundo exterior.

**2. El ensamblador es la pieza convergente — no una rama más.**
Las dimensiones interdependientes (datos de marketing, piel visual, tipo de proyecto, estructura de páginas) NO son árboles independientes: son INPUTS que entran al ensamblador y se sintetizan en una pipeline secuencial. Si se separaran, al ensamblar no encajarían.

**3. Tres puentes, no uno.**
La interfaz toca el exterior por tres caminos, no solo la publicación:
- **Publicación** (#24) — interfaz generada → canal (salida, unidireccional)
- **Ejecución** (#29) — intención del cliente → backend (ida-y-vuelta: el cliente pide, el sistema resuelve)
- **Tiempo real** (#31) — mundo exterior → vista del cliente (entrada continua: el mundo cambia, la interfaz lo refleja)
Los dos últimos son la interactividad: sin ellos la interfaz es un póster estático.

**4. Solo tres puntos necesitan juicio (micro-agente):**
- Selección de estructura (qué secciones y en qué orden para un arquetipo)
- SEO (síntesis de metadatos desde el contenido)
- El resto es determinista o transformación mecánica.

**5. El custodio del dato vivo (#25 Sincronización) cierra el contrato.**
La promesa de "dato vivo" (si el marketing cambia, la interfaz cambia) se materializa en un custodio que escucha eventos de cambio y dispara regeneración.

**6. El estado de interacción (#30) es el custodio del CLIENTE.**
El carrito, el formulario a medias, el filtro activo — es estado efímero que la interfaz mantiene durante la sesión. Sin este custodio, cada acción del cliente empieza de cero.

---

## Mapa de dependencias (REFs → piezas)

```
marketing-strategy   ──→ #12 Contenido de página, #21 Inyección de datos
marketing-audience   ──→ #12 Contenido de página, #4 Nivel de compromiso
marketing-channels   ──→ #5 Canal
marketing-content    ──→ #12 Contenido de página, #21 Inyección de datos
piel/marca-cliente   ──→ #22 Aplicación de piel
project-profile      ──→ #1 Arquetipo de proyecto, #19 Resolución de contexto
publicador           ──→ #24 Publicación
```

---

## Clasificación de datos por capa (pasada 3)

La pasada 3 clasificó cada campo de los 12 módulos de marketing desde el cliente.
Tres capas de datos alimentan el ensamblador:

| Capa | Módulos | Qué fluye |
|---|---|---|
| **DIRECTA** | content, strategy | Datos que SE MUESTRAN al cliente: títulos, copy, propuesta de valor, evidencias |
| **GENERATIVA** | campaigns, calendar | Datos que CREAN presencias temporales: landings de campaña, páginas estacionales |
| **CONTEXTUAL** | audience, funnel, competitors, relations | Datos que INFORMAN cómo escribir: tono, objeciones, CTAs, personalización |
| **INTERNA** | budget, analytics, automation | 0 datos al cliente. Budget/analytics = tablero jefe. Automation = motor invisible (sus salidas llegan por renderizado) |

### Flujo del conversor por capa

```
  DIRECTA ──────────────┐
  (content, strategy)    │
                         ├──→ CONVERSOR (#12/#21) ──→ secciones con datos
  GENERATIVA ───────────┤
  (campaigns, calendar)  │
                         │
  CONTEXTUAL ───────────┘
  (audience, funnel,
   competitors, relations)
```

---

## Siguiente paso

El prisma se agotó (3 pasadas). La disección asignó formas. La pasada 3 clasificó los 12 módulos por capa (directa/generativa/contextual/interna).

**Construir el agente generador de interfaz cliente** — análogo a `crear-blueprint-jefe` pero para el CLIENTE:
1. Lee un módulo → aplica la clasificación de pasada-3 (qué campos son cliente)
2. Genera los componentes/secciones que presentan esos datos al cliente
3. El conversor (#12/#21) materializa los mapeos campo→sección
4. El ensamblador junta: datos + piel + estructura → interfaz publicada

**Orden de construcción** (de la anatomía):
1. Los reflejos primero (enums, catálogos, validaciones, acciones) — la base determinista.
2. Los conversores del ensamblador (la cadena marketing → vista → formato).
3. Los custodios (máquinas de estado de presencia, página, interacción) — vigilan transiciones.
4. Los puentes (publicación ya existe; ejecución y tiempo real son los puertos de interactividad).
5. Los micro-agentes al final (selección de estructura, SEO) — reglas + fallback LLM.
