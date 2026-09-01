# Pasada 2 — Expansión de los SPAWN de "Interfaz Cliente"

Método: prisma sobre cada sub-producto SPAWN de la pasada 1.

---

## SPAWN 1 — Perfil de cliente

**¿Qué es?** La definición del destinatario de la interfaz. No es el segmento de marketing (eso ya vive en marketing-audience) — es el CONTEXTO DE USO del cliente: qué tipo de proyecto es, qué viene a hacer el cliente, cómo lo consume, en qué dispositivo, con qué urgencia.

El perfil de cliente es lo que hace que la misma "landing page" sea radicalmente distinta para un restaurante (fotos, carta, reserva) que para un SaaS (features, pricing, signup). No es personalización 1:1 — es TIPOLOGÍA de proyecto que condiciona la estructura de la interfaz.

| # | Pieza | Tipo | Descripción |
|---|---|---|---|
| 1 | **Arquetipo de proyecto** | ATÓMICO | El tipo de negocio/proyecto: restaurante, e-commerce, servicios, app, informativo, educación, comunidad, marketplace. Enum abierto. Condiciona qué presencias tiene sentido y qué páginas genera. |
| 2 | **Intención del cliente** | ATÓMICO | Qué viene a hacer: comprar, informarse, reservar, contactar, suscribirse, consumir contenido, usar una herramienta. Es la necesidad primaria que la interfaz debe satisfacer. |
| 3 | **Contexto de consumo** | ATÓMICO | Cómo y dónde consume: móvil en la calle, desktop en la oficina, tablet en el sofá, kiosko en la tienda. Afecta a responsive, touch targets, densidad informativa. |
| 4 | **Nivel de compromiso** | ATÓMICO | Dónde está el cliente en su relación con el proyecto: desconocido → curioso → interesado → cliente → fiel. Afecta a qué se muestra (awareness vs retención). Se mapea al funnel. |

**Suelo alcanzado** — piezas atómicas.

---

## SPAWN 2 — Presencia

**¿Qué es?** Un lugar donde el proyecto se hace visible al cliente. Cada presencia tiene un canal (web, email, redes, app, físico), un formato propio, restricciones técnicas y un estado (borrador, activa, retirada).

La presencia NO es el canal de marketing (eso vive en marketing-channels). El canal es el MEDIO; la presencia es la INSTANCIA concreta del proyecto en ese medio: "mi web", "mi cuenta de Instagram", "mi newsletter", "mi carta impresa".

| # | Pieza | Tipo | Descripción |
|---|---|---|---|
| 5 | **Canal** | ATÓMICO | El medio donde se materializa: web, app, email, red social, marketplace, físico (carta, cartel, tarjeta). Referencia a marketing-channels. |
| 6 | **URL/Ubicación** | ATÓMICO | Dónde vive esta presencia: la URL del sitio, el handle de la red social, la dirección del local. Identificador único de la presencia. |
| 7 | **Formato** | ATÓMICO | Qué forma toma el contenido en este canal: HTML/CSS (web), imagen estática (redes), PDF (impreso), email HTML, pantalla nativa (app). Condiciona al ensamblador. |
| 8 | **Páginas** | SPAWN | Las unidades navegables dentro de una presencia web/app: homepage, about, pricing, productos, contacto, blog, FAQ, landing... Cada página tiene un propósito, una estructura y un contenido. |
| 9 | **Estado** | ATÓMICO | Máquina de estados: borrador → activa → pausada → retirada. Una presencia inactiva no se publica. |

---

## SPAWN 2.1 — Páginas (de Presencia)

**¿Qué es?** Una unidad navegable dentro de una presencia web o app. Cada página tiene un propósito (vender, informar, captar, fidelizar), una estructura (secciones ordenadas) y un contenido (datos de los módulos de marketing presentados con la piel del proyecto).

Las páginas son el punto donde CONVERGEN las dimensiones interdependientes:
- El arquetipo del proyecto dice QUÉ páginas tiene sentido crear
- La estrategia dice QUÉ DECIR en cada una
- El contenido provee LAS PIEZAS
- La piel dice CÓMO SE VE
- El ensamblador junta todo y PRODUCE la página

| # | Pieza | Tipo | Descripción |
|---|---|---|---|
| 10 | **Tipo de página** | ATÓMICO | Su propósito: homepage, landing, productos, pricing, about, contacto, blog, FAQ, legal, portfolio, carta, reservas, checkout, dashboard-cliente. Enum extensible. |
| 11 | **Estructura** | ATÓMICO | Secuencia ordenada de secciones: [{ tipo_seccion, config }]. Cada sección es un bloque visual (hero, features, testimonials, CTA, grid de productos, formulario). La estructura es el esqueleto de la página. |
| 12 | **Secciones** | ATÓMICO | Los bloques visuales reutilizables: hero, CTA, navigation, footer, testimonials, trust badges, carousel, grid, pricing table, FAQ accordion, formulario, mapa, galería. Cada sección tiene un tipo y una configuración. |
| 13 | **Contenido de página** | ATÓMICO | Los datos concretos que rellenan cada sección: textos, imágenes, enlaces, precios, horarios. Viene de los módulos de marketing (content, strategy, audience) mapeado a los huecos de cada sección. |
| 14 | **SEO** | ATÓMICO | Los metadatos para buscadores: title, description, canonical, open graph, schema markup, robots. Cada página tiene su configuración SEO. |
| 15 | **Estado de página** | ATÓMICO | Máquina de estados: borrador → publicada → despublicada. Una página no publicada no es visible. |

**Suelo alcanzado** — piezas atómicas.

---

## SPAWN 3 — Experiencia

**¿Qué es?** El viaje que el cliente recorre al interactuar con el proyecto. No es el funnel de marketing (que mide conversiones numéricas) — es la experiencia vivida por el humano: lo que ve, lo que siente, lo que le cuesta, lo que le facilita.

La experiencia cruza presencias: el cliente puede descubrir el proyecto en una red social, visitar la web, suscribirse al newsletter, recibir un email, volver a la web y comprar. La interfaz debe mantener coherencia a lo largo de ese viaje.

| # | Pieza | Tipo | Descripción |
|---|---|---|---|
| 16 | **Puntos de contacto** | ATÓMICO | Los momentos donde el cliente toca el proyecto: visita web, recibe email, ve un anuncio, entra al local, usa la app. Cada punto pertenece a una presencia y a una etapa del viaje. |
| 17 | **Navegación** | ATÓMICO | Cómo el cliente se mueve dentro de una presencia: menú principal, breadcrumbs, links internos, búsqueda, CTA que llevan a otra página. La navegación guía la experiencia y reduce la fricción. |
| 18 | **Llamadas a la acción** | ATÓMICO | Los momentos donde la interfaz pide al cliente que actúe: comprar, reservar, suscribirse, contactar, descargar. Cada CTA tiene un objetivo, un texto, un diseño y una ubicación en la página. |
| 19 | **Retroalimentación** | ATÓMICO | Lo que la interfaz devuelve al cliente tras una acción: confirmación de compra, "email enviado", "gracias por suscribirte", estados de error, indicadores de progreso. |

**Suelo alcanzado** — piezas atómicas.

---

## SPAWN 4 — Ensamblador

**¿Qué es?** El motor que toma los INPUTS (perfil de proyecto, datos de marketing, piel visual, tipo de presencia, tipo de página) y produce la SALIDA (la interfaz concreta que el cliente consume). Es la pieza convergente donde las dimensiones interdependientes se encuentran.

El ensamblador NO es un template estático ni un page builder manual. Es un GENERADOR que, dado un contexto (qué proyecto, qué tipo, qué datos tiene, qué piel usa), produce páginas completas o las actualiza cuando el dato cambia.

**NOTA CLAVE — convergencia de dimensiones:** El ensamblador es donde se aplica el mandato del esquematizador de NO separar dimensiones interdependientes. La piel, la estructura, el contenido, el SEO y el tipo de proyecto NO son ramas independientes — son INPUTS del ensamblador que las sintetiza juntas. Si se separan, al ensamblar no encajan.

| # | Pieza | Tipo | Descripción |
|---|---|---|---|
| 20 | **Resolución de contexto** | ATÓMICO | Dado un proyecto, resuelve: qué arquetipo es, qué presencias tiene, qué piel usa, qué datos de marketing tiene disponibles. Es el primer paso antes de generar nada. |
| 21 | **Selección de estructura** | ATÓMICO | Dado el tipo de página y el arquetipo del proyecto, elige qué secciones lleva y en qué orden. Un restaurante pone la carta primero; un SaaS pone features y pricing. Puede ser determinista (reglas por arquetipo) o asistida (el LLM sugiere). |
| 22 | **Inyección de datos** | ATÓMICO | Toma los datos de marketing (contenido, audiencia, estrategia) y los mapea a los huecos de cada sección. "El hero necesita un titular" → lo saca de strategy.posicionamiento o content.piezas[tipo=headline]. |
| 23 | **Aplicación de piel** | ATÓMICO | Aplica la piel marketing del proyecto sobre la estructura+datos: tokens de color, tipografía, radii, motion. Cada página generada lleva la identidad visual del proyecto, no la del sistema. |
| 24 | **Renderizado** | ATÓMICO | Transforma la estructura+datos+piel en el formato de salida: HTML para web, email HTML para newsletter, imagen para redes, PDF para impreso. El puerto de salida. |
| 25 | **Publicación** | ATÓMICO | Lleva el resultado al canal: despliega el HTML en la web pública, envía el email, sube la imagen a la red social. Referencia al publicador existente. |
| 26 | **Sincronización** | ATÓMICO | Cuando un dato de marketing cambia (nuevo contenido, nueva piel, nuevo producto), las presencias afectadas se regeneran o actualizan. El dato vivo del contrato. |

**Suelo alcanzado** — piezas atómicas.

---

## Resumen de la pasada

| Métrica | Valor |
|---|---|
| Piezas atómicas nuevas | 22 (4 perfil + 4 presencia + 6 páginas + 4 experiencia + 7 ensamblador - 3 ya contadas en P1) |
| SPAWN residual | 0 — todo tocó suelo |
| Convergencias | 1 (Páginas converge en el Ensamblador como punto de síntesis) |

**La pasada 2 agotó el prisma. Todo es atómico, referencia o abierto. Siguiente: disección.**
