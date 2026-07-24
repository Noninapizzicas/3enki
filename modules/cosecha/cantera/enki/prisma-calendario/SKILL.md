---
name: calendario
description: "Base compartida del tiempo de Prisma (órgano agenda): disponibilidad + capacidad + reservas + huecos, en un motor determinista para cita y alquiler. Product-agnóstico; los consumidores beben por RPC."
fuente: enki
dominio: comercio
lente_dominio: prisma
tags: [calendario, prisma, reflejo, bus, mqtt, integracion]
---

# prisma · calendario

> **Qué es.** Manifest de prisma/calendario — REFLEJO JS: la BASE COMPARTIDA del tiempo (órgano `agenda`). Dos capas: DISPONIBILIDAD (la oferta de tiempo — privada del comerciante, onboarding como el coste: horario + capacidad por recurso_tipo + excepciones 'día cerrado') + RESERVAS (el consumo — el POS del tiempo). Motor de huecos NUESTRO (aritmética determinista): hueco = capacidad − reservas_solapadas; una reserva solo entra en disponibilidad con hueco>0. Un motor, dos granos: cita (minutos·de_ida·fin fijo) e intervalo (días·con_retorno·fin abierto→devolver). Product-AGNÓSTICO: la duración/recurso los aporta el CONSUMIDOR (agenda-citas/alquiler), no el calendario (como carta-manager no conoce recetas). Los bordes iCal (feed .ics + import CalDAV) y el tz/DST correcto (luxon) son v0.2. Ver arquitectura/decisiones/propuestas/calendario.md.
>
>
> Código: `modules/prisma/calendario/index.js`. Esta skill es la referencia de uso; la verdad viva es el código.

---

## Eventos que atiende (request → response)

| Evento | Handler | Descripción |
|---|---|---|
| `calendario.get_disponibilidad.request` | `onGetDisponibilidadRequest` | Reflejo JS: la disponibilidad del comercio (recurso_tipos + horario + excepciones + tz). |
| `calendario.set_disponibilidad.request` | `onSetDisponibilidadRequest` | Reflejo JS: fija/mergea la disponibilidad (onboarding del comerciante). |
| `calendario.bloquear_dia.request` | `onBloquearDiaRequest` | Reflejo JS: día (o rango) que NO se trabaja → excepción cerrada. |
| `calendario.huecos.request` | `onHuecosRequest` | Reflejo JS: {recurso_tipo, desde, hasta, duracion_min} → huecos libres (capacidad − reservas solapadas), troceo back-to-back por ventana. |
| `calendario.reservar.request` | `onReservarRequest` | Reflejo JS: crea una reserva si cae en disponibilidad con hueco>0 (cita: exige horario+fin; intervalo: solo capacidad, fin abierto). 409 SIN_HUECO / 412 FUERA_DE_HORARIO / 404 RECURSO_DESCONOCIDO. |
| `calendario.cancelar.request` | `onCancelarRequest` | Reflejo JS: cancela una reserva (libera el hueco). |
| `calendario.devolver.request` | `onDevolverRequest` | Reflejo JS: alquiler con_retorno — cierra el intervalo abierto (libera la unidad). |
| `calendario.list_reservas.request` | `onListReservasRequest` | Reflejo JS: reservas (filtros recurso_tipo/estado/desde/hasta). |
| `calendario.feed_ics.request` | `onFeedIcsRequest` | Reflejo JS (borde iCal): {project_id} → texto .ics (RFC 5545) de las reservas. |
| `calendario.feed_url.request` | `onFeedUrlRequest` | Reflejo JS: provisiona el token secreto del feed y devuelve la URL suscribible (webcal) para el móvil del dueño. |
| `calendario.importar_ics.request` | `onImportarIcsRequest` | Reflejo JS (borde iCal, reverso): {ics|url, palabras?, todos_dia_completo?} → lee el .ics/CalDAV del dueño y vuelca los eventos de día completo (que huelen a cierre) como excepciones 'días cerrado'. Idempotente: reemplaza las de origen 'ics', respeta las manuales. |

## Señales que escucha

- `project.activated` → Reflejo JS: restaura la disponibilidad + reservas persistidas de ese proyecto desde /prisma/calendario/estado.json.

## Flujo típico

```
// 1. calendario.request → calendario.response
// 2. Procesa y emite eventos
// 3. Persiste si aplica
```

## Patrón RPC

```
publish →  ui/request/<dominio>/<accion>    { request_id, data }
listen  ←  ui/response/<request_id>         { request_id, status, data }
```
