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
   ├─ ¿Interactividad bidireccional (formularios, checkout, chat)?
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
| Pasadas del prisma | 2 (P1 → 4 SPAWN + P2 → todo atómico) |
| Piezas atómicas totales | 25 (únicas, descontando duplicadas #10≈#20 y #12≈#21) |
| Piezas contrato | 3 |
| REFs (deduplicadas) | 7 |
| Preguntas abiertas | 4 |

### Reparto de formas

| Forma | Cantidad | % | Piezas clave |
|---|---|---|---|
| **reflejo** | 12 | 50% | Arquetipos, enums, catálogos, estructura tipada, navegación |
| **custodio** | 4 | 17% | Estados (presencia, página), nivel de compromiso, sincronización |
| **conversor** | 4 | 17% | Contenido→sección, inyección, piel, renderizado |
| **micro-agente** | 3 | 13% | Estructura/selección (híbrido reglas+LLM), SEO |
| **puente** | 1 | 4% | Publicación (única salida al exterior) |
| **TOTAL** | **24** | 100% | |

---

## Lectura del esquema

**1. Es un sistema reflejo con cadena de conversores.**
La mitad de las piezas son datos deterministas (reflejo). La otra mitad interesante es la cadena conversor del ensamblador: marketing → contenido → piel → formato → canal. Esa cadena es el corazón.

**2. El ensamblador es la pieza convergente — no una rama más.**
Las dimensiones interdependientes (datos de marketing, piel visual, tipo de proyecto, estructura de páginas) NO son árboles independientes: son INPUTS que entran al ensamblador y se sintetizan en una pipeline secuencial. Si se separaran, al ensamblar no encajarían.

**3. Solo tres puntos necesitan juicio (micro-agente):**
- Selección de estructura (qué secciones y en qué orden para un arquetipo)
- SEO (síntesis de metadatos desde el contenido)
- El resto es determinista o transformación mecánica.

**4. La publicación es el único puente.**
Todo el sistema es generación interna hasta el último paso: publicar(resultado, destino). Ese es el puerto de salida — [transporte ABIERTO].

**5. El custodio del dato vivo (#25 Sincronización) cierra el contrato.**
La promesa de "dato vivo" (si el marketing cambia, la interfaz cambia) se materializa en un custodio que escucha eventos de cambio y dispara regeneración. Sin él, la interfaz es estática.

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

## Siguiente paso

El prisma se agotó. La disección asignó formas. El esquema está ensamblado.

**Construir** — la anatomía dice qué construir y en qué orden:
1. Los reflejos primero (enums, catálogos, validaciones) — son la base determinista.
2. Los conversores del ensamblador después (la cadena marketing → vista → formato).
3. Los custodios (máquinas de estado) — vigilan las transiciones.
4. Los micro-agentes al final (selección de estructura, SEO) — necesitan reglas + fallback LLM.
5. El puente (publicación) ya existe: REF → publicador.
