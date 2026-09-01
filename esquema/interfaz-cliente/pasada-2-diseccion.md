# Disección — Sistema "Interfaz Cliente"

Formas conceptuales asignadas a cada pieza atómica del esquema.
Método: las 6 preguntas del diseccionador sobre cada pieza.

---

## Perfil de cliente

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 1 | Arquetipo de proyecto | **reflejo** | Enum abierto (restaurante, e-commerce, servicios, app…). Dado un proyecto, su arquetipo es un dato declarado — un test afirma que el valor pertenece al enum. |
| 2 | Intención del cliente | **reflejo** | Enum de necesidades primarias (comprar, informarse, reservar…). Determinista: dada la visita, la intención se resuelve o se declara. Un test afirma. |
| 3 | Contexto de consumo | **reflejo** | Enum de contextos (móvil, desktop, tablet, kiosko). Dato de entrada que condiciona responsive y densidad. Determinista. |
| 4 | Nivel de compromiso | **custodio** | Progresión por etapas (desconocido → curioso → interesado → cliente → fiel). El custodio vigila que las transiciones sean válidas y monotónicas en una sesión. Se mapea al funnel. |

---

## Presencia

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 5 | Canal | **reflejo** | Enum de medios (web, app, email, red social, marketplace, físico). Referencia a marketing-channels. Un test afirma pertenencia. |
| 6 | URL/Ubicación | **reflejo** | Identificador único de la presencia. Texto con formato validable (URL, handle, dirección). Determinista. |
| 7 | Formato | **reflejo** | Enum de formatos de salida (HTML, imagen, PDF, email HTML, pantalla nativa). Determinista por canal — dado un canal, el formato es finito. Un test afirma. |
| 8 | Estado (presencia) | **custodio** | Máquina de estados (borrador → activa → pausada → retirada). El custodio vigila transiciones válidas y no permite publicar una presencia en borrador. |

---

## Páginas (de Presencia)

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 9 | Tipo de página | **reflejo** | Enum extensible (homepage, landing, productos, pricing, about, contacto, blog, FAQ, legal…). Determinista. |
| 10 | Estructura | **micro-agente** | La secuencia de secciones depende del arquetipo + intención + tipo de página. Puede ser determinista por reglas (restaurante → carta primero) O asistida (el LLM sugiere orden óptimo). La decisión de qué secciones y en qué orden necesita juicio cuando las reglas no cubren. |
| 11 | Secciones | **reflejo** | Catálogo de bloques visuales reutilizables (hero, CTA, navigation, footer, testimonials…). Cada sección tiene un tipo y una configuración tipada. Un test afirma que el tipo existe y la config es válida. |
| 12 | Contenido de página | **conversor** | Transforma datos de marketing (content, strategy, audience) en los huecos de cada sección. "El hero necesita un titular" → lo saca de strategy.posicionamiento. Es mapping de dominio-fuente a dominio-vista. |
| 13 | SEO | **micro-agente** | Generar title, description, open graph y schema markup requiere comprensión del contenido de la página y del contexto del proyecto. No es enum ni matching — es síntesis de texto con juicio. |
| 14 | Estado de página | **custodio** | Máquina de estados (borrador → publicada → despublicada). El custodio vigila: no se publica sin contenido mínimo, no se despublica sin confirmación. |

---

## Experiencia

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 15 | Puntos de contacto | **reflejo** | Registro de momentos donde el cliente toca el proyecto. Cada punto tiene presencia + etapa. Dato estructurado, testable. |
| 16 | Navegación | **reflejo** | Estructura determinista: menú principal, breadcrumbs, links internos, búsqueda. Dado un mapa de páginas, la navegación se genera por reglas. Un test afirma la consistencia (toda página alcanzable, sin enlaces rotos). |
| 17 | Llamadas a la acción | **reflejo** | Cada CTA tiene objetivo, texto, diseño, ubicación — todo tipado y validable. El contenido del CTA viene del conversor de contenido (pieza #12), no se genera aquí. Estructura reflejo. |
| 18 | Retroalimentación | **reflejo** | Respuestas tipadas por tipo de acción (confirmación, error, progreso). Dado un evento de usuario, la retroalimentación es determinista. Un test afirma que cada acción tiene su respuesta. |

---

## Ensamblador

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 19 | Resolución de contexto | **reflejo** | Dado un proyecto, resuelve: arquetipo, presencias, piel, datos de marketing disponibles. Es gathering de datos existentes — determinista, un test afirma que el contexto resuelto contiene los campos requeridos. |
| 20 | Selección de estructura | **micro-agente** | Dado tipo de página + arquetipo, elige secciones y orden. Es la misma pieza que Estructura (#10) vista desde el ensamblador. Determinista por reglas conocidas, fuzzy para combinaciones nuevas. Híbrido: reglas primero, LLM como fallback. |
| 21 | Inyección de datos | **conversor** | Toma datos de marketing y los mapea a huecos de secciones. Es la materialización del conversor de contenido (#12) a nivel del ensamblador — transforma dominio-marketing a dominio-vista para TODAS las secciones de una página. |
| 22 | Aplicación de piel | **conversor** | Aplica tokens de color, tipografía, radii, motion sobre estructura+datos. Transforma la identidad visual (PielJSON) en propiedades concretas de cada elemento. Input → output determinista pero el mapping es transformación de dominio. |
| 23 | Renderizado | **conversor** | Transforma estructura+datos+piel en formato de salida (HTML, email, imagen, PDF). Es el conversor final — la última transformación antes de la publicación. |
| 24 | Publicación | **puente** | Lleva el resultado al canal: despliega HTML en web, envía email, sube imagen. Es el PUENTE entre el sistema de generación y el mundo exterior. Opera sobre el puerto `publicar(resultado, destino)` [transporte ABIERTO]. |
| 25 | Sincronización | **custodio** | Vigila que cuando un dato de marketing cambia, las presencias afectadas se regeneran. El custodio escucha eventos de cambio y dispara la regeneración. Vigila la coherencia dato→vista en el tiempo. |

---

## Resumen de formas

| Forma | Cantidad | Piezas |
|---|---|---|
| **reflejo** | 12 | Arquetipo de proyecto, Intención del cliente, Contexto de consumo, Canal, URL/Ubicación, Formato, Tipo de página, Secciones, Puntos de contacto, Navegación, Llamadas a la acción, Retroalimentación, Resolución de contexto |
| **custodio** | 4 | Nivel de compromiso, Estado (presencia), Estado de página, Sincronización |
| **micro-agente** | 3 | Estructura, SEO, Selección de estructura |
| **conversor** | 4 | Contenido de página, Inyección de datos, Aplicación de piel, Renderizado |
| **puente** | 1 | Publicación |
| **TOTAL** | **24** | (26 piezas menos 2 duplicadas: Estructura=#10≈#20, Contenido=#12≈#21) |

---

## Lectura del reparto

- **Reflejo dominante (12/24 = 50%)** — la mitad del sistema es determinista: enums, registros, catálogos, estructuras tipadas. Los perfiles, canales, formatos, secciones y puntos de contacto son datos que un test afirma.

- **Conversor fuerte (4/24 ≈ 17%)** — el ensamblador es esencialmente una cadena de conversores: datos de marketing → contenido de sección → estructura+piel → formato de salida. Cada paso transforma de un dominio a otro.

- **Custodio vigilante (4/24 ≈ 17%)** — las máquinas de estado (presencia, página) y la sincronización vigilan invariantes: transiciones válidas, dato vivo.

- **Micro-agente acotado (3/24 ≈ 13%)** — solo donde hay JUICIO real: elegir estructura de secciones para un arquetipo nuevo, generar metadatos SEO. El resto es reglas.

- **Puente único (1/24 ≈ 4%)** — la publicación es el único puente real: donde el sistema toca el mundo exterior.

**El sistema es reflejo con cadena de conversores.** La anatomía dice: los datos son deterministas (reflejo), la transformación es una pipeline de conversores (marketing → vista → formato → canal), los estados se custodian, y solo la selección de estructura y el SEO necesitan juicio (micro-agente). La publicación es el puerto de salida.

**Convergencia confirmada:** La cadena conversor (piezas #12→#21→#22→#23) es el CORAZÓN del ensamblador — es donde las dimensiones interdependientes (datos, piel, estructura, tipo) se sintetizan. No son ramas paralelas: son inputs de una pipeline secuencial.
