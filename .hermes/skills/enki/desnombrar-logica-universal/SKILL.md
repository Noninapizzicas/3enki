---
name: desnombrar-logica-universal
description: >-
  Método para ajustar el vertical prisma (y cualquier vertical universal) de Enki:
  la lógica universal ya existe en pizzepos con nombres de hostelería (variaciones,
  cocina, pedidos) — hay que DESNOMBRARLA (copiar la lógica, cambiar el nombre,
  cablear las RPC) en vez de construir desde cero. El esquematizador aplicado al
  caso concreto decide qué lógica usar en cada paso.
when-to-use: >-
  Cuando el trabajo toque el vertical prisma (ajustar, ampliar, desnombrar órganos),
  o cuando haya que generalizar lógica de un módulo específico (pizzepos) a uno
  universal. También al diseñar el conductor de una vertical o decidir qué módulos
  existen/fallan.
tags: [enki, prisma, pizzepos, vertical, generalización, esquematizador, órganos]
---
# Desnombrar Lógica Universal (ajustar vertical prisma)

## La tesis del dueño (Paco)

> "La lógica es universal; los nombres de hostelería son instancias. Hay que separar
> la lógica de las pizzas y aplicarla al lugar correspondiente."

`variaciones` de pizza (poner/quitar ingredientes) = la misma máquina que colores/tallas/tamaños
(selección con delta de precio). `cocina` (pendiente→preparando→listo→entregado) = la misma
máquina de estados que empaquetar, encargo, pick&pack. Los nombres de pizzepos son instancias
de lógica universal.

## Pasos

### 1. Esquematiza el sujeto ANTES de mirar código
Aplicar la skill `esquematizador` al dominio (p.ej. "el negocio universal"): la espina es
PRODUCIR → VENDER → ENTREGAR. El esquema revela qué órganos existen y cuáles faltan.

### 2. Detecta la lógica existente con nombre de dominio
Buscar en pizzepos (o el módulo específico) la lógica que el esquema necesita pero que
prisma aún no tiene desnombrada. Pregunta: ¿qué máquina de estados / selección / flujo ya
existe aquí con nombre de hostelería?

### 3. DESNOMBRA: copia la lógica, cambia el nombre, cablea las RPC
Igual que se hizo variaciones→opciones (ya hecho) o cocina/pedidos→preparar (hecho 2026-07-31):
- Lee el CÓDIGO REAL de la fuente (p.ej. `cocina/index.js`) — la lógica fiel, no inventada
  (el tap directo a `listo` desde `pendiente` se copió del código, no se inventó).
- Nuevo módulo reflejo en `modules/prisma/<nombre>/` con nombre universal.
- Persistencia por proyecto (`/prisma/<nombre>/`), escritura atómica, single-writer.
- Tests: transiciones/frenos + el caso de extensión.

### 4. PUERTA ABIERTA — no cierres la puerta a ampliar estados
Los estados base se copian como DEFAULT, pero el modelo debe aceptar estados custom
declarados por el proyecto (config.json por proyecto, freno valida BASE ∪ CUSTOM).
"Desnombramos pero no cierres la puerta a ampliar nuevos estados" — un negocio añade
`enfriando`, otro `enviado`, sin tocar código.

### 5. El esquematizador del CASO CONCRETO decide qué lógica aplicar
No hay un conductor genérico que lo sepa todo. Cada negocio que llega se esquematiza
(qué órganos enciende) y de ahí sale qué pasos tiene y qué lógica usar. El método ES el conductor.

### 6. El proyecto de prueba es BANCO, no el trabajo
Cuando se ajusta el vertical, un proyecto real (p.ej. Regalos) sirve para VERIFICAR —
nunca para modelar. No te pierdas en el caso concreto: el trabajo es el vertical.
El esquema no debe nombrar el caso de prueba (Regalos/paños/tazas), solo el molde.

## La unidad de esquematización es el PRODUCTO, no el proyecto
Un mismo proyecto tiene productos con flujos distintos (pañuelo=mostrador · tarta=encargo).
Cada producto (su arquetipo + ejes + naturalezas) dicta sus pasos. No esquematices "el
proyecto en genérico" — esquematiza cada elemento por fases, sin miedo.

## Órganos del negocio universal (mapa verificado)
- NÚCLEO (todo negocio): VENDER (carrito→cobro→cuenta→ticket) · COSTEAR · MOSTRAR (escaparate)
- VARIABLES: ELABORAR (recetario, por origen=elaborado) · PREPARAR (estados, desnombrado) ·
  ENTREGAR (recogida/envío/cita) · PROGRAMAR (calendario) · STOCK (inventario)
- El modo de venta lo dicta el eje tiempo del producto: instante→mostrador · cita→encargo
  (calendario) · intervalo→alquiler

## Pitfalls
- NO construir un blueprint conductor monolítico que codifique todas las operaciones —
  la lógica ya está en los reflejos; el conductor solo enseña la regla
  (esquematiza → lee ejes → elige RPC).
- NO inventar la lógica copiada: leer el código fuente real (cocina/pedidos) y copiar
  sus transiciones exactas (incluidos los atajos como el tap directo).
- NO cerrar la máquina de estados a extensión — la puerta abierta es requisito del dueño.
- NO tratar el caso de prueba como el trabajo (Regalos es banco de pruebas del vertical).
- NO olvidar que el módulo nuevo debe declararse en `config.json` `enabled` (ver skill
  enki-rebanadas: el loader carga todo lo que tenga module.json, enabled solo ordena).

## Verificación
```bash
cd ~/3enki && node tests/unit/prisma__<modulo>.test.js   # tests del reflejo nuevo
node scripts/cabecera/doc-sync.js --check                # rebanadas intactas
```

## Después de desnombrar: el LLM NO lo conduce hasta cablearlo (experimento en vivo)

Desnombrar la lógica (módulo + tests) NO hace que el LLM la use. El LLM solo conduce un vertical
cuando, además del módulo: (1) está en `config.json` `enabled` (el loader carga todo lo que tenga
module.json pero sin orden); (2) hay página visible — project-type + config PERSISTIDA del proyecto
+ PAGE_CATALOG + ruta SvelteKit (ver skill `enki-module-debugging` §"page_id no existe"); (3) un
conductor (blueprint o esquematizador) le enseña qué RPC usar. Caso real prisma (2026-07-31):
tras crear `preparar` + blueprint `comercio`, la verificación mostró `enabled: False`, `ui.pages:
[]`, `tools: 0` — el LLM seguía ciego. Se cableó (PR de experimento) y quedó el experimento en vivo:
hipótesis A (el blueprint basta: el LLM publica los RPC correctos) vs B (se pierde → entra el
esquematizador como método). Probar SIEMPRE en vivo antes de dar el vertical por usable.

## Pitfall de PR: borrar la rama tras el merge squash
Si la rama `hermes/<feature>` queda viva localmente tras el squash-merge, GitHub re-propone un PR
nuevo con el mismo commit al avanzar main → duplicado del ya mergeado con conflictos. Reconocerlo:
mismo nombre de rama + mismo SHA del head + mismo título que un PR ya cerrado. NO mergear: cerrar
con comentario "duplicado del #N" (update_issue state=closed).
