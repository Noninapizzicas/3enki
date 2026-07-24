---
name: ui-forge
description: "Taller de UI de prisma: genera bundles web potentes (POS, …) dirigidos por el ProductoUniversal + marca, verificados por verificador-visual, servidos desde storage/www/prisma/<proposito>/."
fuente: enki
dominio: comercio
lente_dominio: prisma
tags: [ui-forge, prisma, reflejo, bus, mqtt, integracion]
---

# prisma · ui-forge

> **Qué es.** prisma/ui-forge — EL TALLER DE UI de prisma (esqueleto v0.1). El espacio donde prisma CREA UIs potentes y con lógica, servidas desde storage/www/prisma/<proposito>/, dirigidas por el ProductoUniversal, teñidas por la MARCA (carta-marketing) y aprobadas por los OJOS (verificador-visual). Frame: LEER (catálogo + marca + lentes-diseño) → PENSAR (v0.1 RENDER DETERMINISTA; capa LLM con lentes = follow-up) → VALIDAR (render.verificar) → GUARDAR (fs.write + ensure-feature www) → EMITIR (ui-forge.generado). Primera salida: proposito 'pos' = el POS de DOS ZONAS dirigido por el catálogo (cuerpo=añadir rápido · franja=OpcionesRenderer que dibuja el control según opciones[].modo). Namespace propio bajo www; no colisiona con carta-digital ni con el escaparate.
>
>
> Código: `modules/prisma/ui-forge/index.js`. Esta skill es la referencia de uso; la verdad viva es el código.

---

## Eventos que atiende (request → response)

| Evento | Handler | Descripción |
|---|---|---|
| `ui-forge.generar.request` | `onGenerarRequest` | Reflejo JS: LEE catálogo+marca+lentes → RENDER (v0.1 determinista) → VALIDA (verificador-visual) → ESCRIBE el bundle a storage/www/prisma/<proposito>/index.html + activa la feature www. |

## Dependencias (RPC saliente)

- `catalogo.get.request`
- `catalogo.list.request`
- `lentes.obtener.request`
- `render.verificar.request`
- `fs.write.request`

## Flujo típico

```
// 1. ui-forge.request → ui-forge.response
// 2. Procesa y emite eventos
// 3. Persiste si aplica
```

## Patrón RPC

```
publish →  ui/request/<dominio>/<accion>    { request_id, data }
listen  ←  ui/response/<request_id>         { request_id, status, data }
```
