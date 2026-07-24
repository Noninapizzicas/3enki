---
name: escaparate
description: "Escaparate público de Prisma: ProductoUniversal → vista cliente (poda lo no ofrecido, presenta precio/avisos). Gemelo generalizado de carta-digital."
fuente: enki
dominio: comercio
lente_dominio: prisma
tags: [escaparate, prisma, reflejo, bus, mqtt, integracion]
---

# prisma · escaparate

> **Qué es.** Manifest de prisma/escaparate — REFLEJO JS SIN ESTADO: la cara CLIENTE PÚBLICA de Prisma (gemelo generalizado de pizzepos/carta-digital). Proyecta el ProductoUniversal del catálogo activo a la vista PÚBLICA que ve el cliente. Se diferencia de prisma/proyector (vista interna, para POS) en que el escaparate PODA lo que el comerciante NO ofrece: oculta los valores de opción disponible:false (el cliente no ve lo que no puede pedir), presenta el precio de cara al público (fijo € o 'consultar' si es rango_valoracion o desconocido) y surfacea los avisos_obligatorios (verdad_obligatoria: alérgenos/etiqueta/seguridad). Domain propio 'escaparate.*'. La generación de HTML/PWA (bundle público) es follow-up (verificación en vivo). Ver arquitectura/decisiones/propuestas/prisma.md.
>
>
> Código: `modules/prisma/escaparate/index.js`. Esta skill es la referencia de uso; la verdad viva es el código.

---

## Eventos que atiende (request → response)

| Evento | Handler | Descripción |
|---|---|---|
| `escaparate.publico.request` | `onPublicoRequest` | Reflejo JS: proyecta el catálogo activo a la vista pública del cliente (poda disponibilidad, precio de cara al público, avisos obligatorios). |
| `escaparate.publicar.request` | `onPublicarRequest` | Reflejo JS: renderiza el bundle HTML (vista pública + marca) y lo escribe a storage/www/ (auto-activa la feature www), servido por Caddy en /<ns>/<slug>/. |

## Señales que escucha

- `catalogo.actualizado` → Reflejo JS (señal): el catálogo cambió → emite escaparate.actualizado (el PWA/consumidor re-pull).
- `catalogo.editado` → Reflejo JS (señal): idem.
- `catalogo.borrado` → Reflejo JS (señal): idem.

## Dependencias (RPC saliente)

- `catalogo.get.request`
- `catalogo.list.request`
- `render.verificar.request`
- `fs.write.request`

## Flujo típico

```
// 1. escaparate.request → escaparate.response
// 2. Procesa y emite eventos
// 3. Persiste si aplica
```

## Patrón RPC

```
publish →  ui/request/<dominio>/<accion>    { request_id, data }
listen  ←  ui/response/<request_id>         { request_id, status, data }
```
