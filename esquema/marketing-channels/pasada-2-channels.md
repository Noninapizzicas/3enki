# Pasada 2 — Expansión de los SPAWN de "marketing-channels"

Método: prisma sobre cada sub-producto SPAWN de la pasada 1.
Todos los canales comparten una anatomía base (registro + vigilancia + ciclo de vida);
se diferencian por la naturaleza de la propiedad y el coste.

---

## SPAWN 1 — Canales Propios

Los que el proyecto posee y controla directamente. Suelo firme: el proyecto decide
cuándo crear, mantener o cerrar.

| # | Pieza | Tipo | Descripción |
|---|---|---|---|
| 1 | **Registro** | ATÓMICO | Datos de identidad del canal: nombre, tipo (web/blog/app/email-list/tienda-fisica/otro), URL o localizador, fecha de alta. |
| 2 | **Estado operativo** | ATÓMICO | Máquina de estados: en_setup → activo → pausado → retirado. Transiciones validadas. |
| 3 | **Activos vinculados** | ATÓMICO | Lista de activos que viven en el canal (landing pages, formularios, catálogo). Referencias, no embebidos. |
| 4 | **Frecuencia esperada** | ATÓMICO | Cadencia declarada por el dueño (diaria/semanal/mensual/irregular). |
| 5 | **Responsable** | ATÓMICO | Quién mantiene el canal (persona o rol). |

**Suelo alcanzado** — todas las piezas son atómicas, no se expanden más.

---

## SPAWN 2 — Canales Ganados

Los que el proyecto obtiene sin pago directo: posicionamiento orgánico, menciones,
reseñas, apariciones en prensa, boca a boca. No se controlan — se observan y cultivan.

| # | Pieza | Tipo | Descripción |
|---|---|---|---|
| 6 | **Registro** | ATÓMICO | Canal ganado: nombre, tipo (seo-organico/mencion/resena/pr/boca-a-boca/otro), fuente u origen. |
| 7 | **Estado de salud** | ATÓMICO | Indicador declarado: creciendo / estable / decayendo / desconocido. El dueño lo actualiza manualmente o lo alimenta analytics. |
| 8 | **Fuentes observadas** | ATÓMICO | Lista de fuentes concretas donde se ha detectado presencia ganada (sitio, medio, plataforma). |
| 9 | **Frecuencia observada** | ATÓMICO | Con qué frecuencia se percibe actividad ganada (alta/media/baja/esporádica). |

**Suelo alcanzado** — piezas atómicas.

---

## SPAWN 3 — Canales Pagados

Los que cuestan dinero al proyecto. Cada uno tiene un presupuesto asignado y
la expectativa de un retorno medible.

| # | Pieza | Tipo | Descripción |
|---|---|---|---|
| 10 | **Registro** | ATÓMICO | Canal pagado: nombre, tipo (search-ads/social-ads/display/sponsorship/influencer/otro), plataforma. |
| 11 | **Estado operativo** | ATÓMICO | Máquina de estados: en_setup → activo → pausado → retirado (misma que propios). |
| 12 | **Presupuesto asignado** | ATÓMICO | Cuánto se destina a este canal (cantidad, moneda, periodo). REF parcial → marketing-budget para validar techo. |
| 13 | **ROI esperado** | ATÓMICO | El retorno que el dueño espera: target (valor, unidad), umbral mínimo. Declarativo — la medición real es de analytics. |
| 14 | **Plataforma/Cuenta** | ATÓMICO | Identificador de la cuenta en la plataforma (Google Ads ID, Meta Business ID...). Las credenciales en sí → REF credential-manager. |

**Suelo alcanzado** — piezas atómicas.

---

## SPAWN 4 — Canales Compartidos

Los que se comparten con la audiencia: redes sociales, comunidades, foros, marketplaces.
El proyecto tiene presencia pero no controla la plataforma.

| # | Pieza | Tipo | Descripción |
|---|---|---|---|
| 15 | **Registro** | ATÓMICO | Canal compartido: nombre, tipo (red-social/comunidad/foro/marketplace/otro), plataforma, handle/perfil. |
| 16 | **Estado de presencia** | ATÓMICO | Máquina de estados: en_setup → activo → pausado → retirado. |
| 17 | **Audiencia en el canal** | ATÓMICO | Tamaño declarado de la audiencia en esa plataforma (seguidores, miembros, suscriptores). El dueño lo actualiza. |
| 18 | **Engagement declarado** | ATÓMICO | Nivel de interacción percibido: alto / medio / bajo / desconocido. |

**Suelo alcanzado** — piezas atómicas.

---

## Convergencias detectadas

| Patrón | Piezas que convergen | Resolución |
|---|---|---|
| Registro | Piezas 1, 6, 10, 15 | Forma compartida: { nombre, tipo, clasificacion, localizador, fecha_alta }. El tipo cambia por clasificación. |
| Estado operativo | Piezas 2, 11, 16 (y salud en 7) | Los propios, pagados y compartidos comparten state machine; los ganados tienen estado de salud (no operable). |
| Frecuencia | Piezas 4, 9 | Declarada (propios) vs observada (ganados) — misma forma, distinto origen. |

## Resumen de la pasada

| Métrica | Valor |
|---|---|
| Piezas atómicas nuevas | 18 |
| SPAWN residual | 0 (todos tocaron suelo) |
| REF nuevas | 0 (las REF del módulo ya estaban en pasada 1) |
| Convergencias | 3 (registro, estado, frecuencia) |
