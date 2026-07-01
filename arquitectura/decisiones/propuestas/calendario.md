# Calendario — la base compartida del tiempo (órgano `agenda`)

> Nace 2026-07-01, co-desarrollado con el humano. Objetivo suyo: *"quién nos sirve un
> calendario bueno y de fácil configuración, y nosotros montamos los módulos que usan ese
> calendario cada uno a sus intereses."* La respuesta: no adoptamos una plataforma de
> reservas; adoptamos el **estándar iCal** como idioma y montamos un **reflejo propio** como
> base compartida. Mismo instinto que WhatsApp/Meta: envolver lo difícil-y-externo
> (tz/DST, interop), quedarnos la lógica (huecos, capacidad, el bus).

## Tesis — dos capas, no una

```
DISPONIBILIDAD   la OFERTA de tiempo   — cuándo PUEDE servir el comercio   (privada del comerciante → onboarding, como el coste)
RESERVA          el CONSUMO de tiempo  — un hueco concreto ocupado          (estado vivo, el POS del tiempo)

INVARIANTE:  hueco(recurso_tipo, [t]) = capacidad(recurso_tipo) − reservas_solapadas ;  reserva ⊂ disponibilidad ∧ hueco>0
```

"Apertura/cierre" y "días que se trabaja / no" son SOLO la primera capa. La reserva es otra
cosa: el gemelo temporal del carrito/cuenta del POS (disponibilidad = catálogo de tiempo;
reserva = venta de tiempo).

## Un motor, dos granos (cita y alquiler no se escriben dos veces)

```
cita (servicio)         grano = minutos · ciclo de_ida       · fin FIJO   · libera al pasar la hora
intervalo (uso_temporal) grano = días    · ciclo con_retorno · fin ABIERTO · libera al DEVOLVER
```

Misma aritmética (`disponibilidad − reservas = hueco`), misma capacidad (nº de sillas / unidades).
Solo cambian la unidad de tiempo y si el hueco se cierra por reloj o por devolución.

## Quién nos sirve el calendario — la decisión

```
IDIOMA/INTEROP   iCalendar (RFC 5545) · CalDAV     ← estándar, gratis, sin lock-in (lo hablan Google/Apple/Outlook)
MOTOR DE HUECOS  NUESTRO (reflejo)                 ← aritmética determinista; además conoce capacidad + producto + bus
```

Descartados como fuente de verdad: Google Calendar / Cal.com / CalDAV **no saben capacidad**
(3 sillas a la vez), ni nuestro modelo (duración/recurso vienen del ProductoUniversal), ni hablan
MQTT — son calendarios de un carril. Lo genuinamente difícil que SÍ borramos: **tz/horario de
verano** (luxon/Temporal), **recurrencia semanal** (rrule), **.ics** (ical-generator).

## Contrato (JSON)

```json
{
  "esquema": "calendario-base-v1 · Prisma",
  "Disponibilidad": {
    "recurso_tipos": [{ "id": "silla", "etiqueta": "Silla", "capacidad": 3 }],
    "horario":     { "L": [["09:00","14:00"],["17:00","20:00"]], "S": [["10:00","14:00"]], "D": [] },
    "excepciones": [{ "fecha": "2026-08-15", "abierto": false, "motivo": "festivo" },
                    { "desde": "2026-08-01", "hasta": "2026-08-20", "abierto": false, "motivo": "vacaciones" }],
    "tz": "Europe/Madrid",
    "ics_externo_url?": "opcional: el .ics del dueño de donde LEEMOS 'día cerrado'"
  },
  "Reserva": {
    "id": "…", "recurso_tipo": "silla", "recurso_id?": "silla-2",
    "inicio": "ISO", "fin": "ISO|null (alquiler: abierto hasta devolver)",
    "estado": "confirmada|cumplida|no_show|cancelada|devuelta",
    "grano": "cita|intervalo", "cliente?": "…", "origen": "agenda-citas|alquiler|staff|…", "ref_externa?": "producto/cuenta"
  },
  "no_conoce": "el PRODUCTO — duración y recurso los aporta el CONSUMIDOR (product-agnóstico, como carta-manager no conoce recetas)",
  "bordes_ical": { "publica": "feed .ics suscribible → el móvil del dueño", "lee": "opcional .ics/CalDAV del dueño → excepciones 'cerrado'" }
}
```

## Reparto (una base, muchos consumidores — patrón Base Compartida)

```
BASE COMPARTIDA   calendario  — disponibilidad · capacidad · reservas · huecos · feed .ics   (puerta = RPC del dueño; project-scoped)

CONSUMIDOR        a su interés — bebe por RPC, no toca el store
  agenda-citas     producto(duración+recurso vía proyector) → calendario.huecos → calendario.reservar → cobro
  alquiler         unidad(recurso, con_retorno) → reservar(fin=null) → devolver          (mismo motor, grano días)
  staff-turnos     turnos del personal = reservas de tipo 'empleado' sobre la capacidad
  scheduler-promos ventanas horarias de la carta                                          (ya vive: carta-scheduler)
```

El `calendario` sabe *cuándo puede el comercio y qué hay libre*; el **producto** aporta *duración +
recurso*; el **consumidor** ata los dos y cobra. El interruptor `organo-agenda` (que ya registra
prisma/enforcement) pasa a tener dueño: el consumidor de citas se gatea con él; la base está siempre.

## Orden de construcción

```
v0.1 (offline, determinista, sin deps)   disponibilidad (get/set/bloquear_dia) · huecos (motor puro) ·
                                          reservar/cancelar/devolver/list · persistencia por proyecto
v0.2 (bordes)                             feed .ics (ical-generator) · import .ics/CalDAV del dueño (excepciones) ·
                                          tz/DST correcto (luxon)
consumidores (follow-up)                  agenda-citas (gateado por organo-agenda) · alquiler · staff-turnos
```

## Estado

```
✓ v0.1 CONSTRUIDO — modules/prisma/calendario (reflejo 0.1.0): disponibilidad
  (get/set/bloquear_dia) + huecos (motor puro, capacidad − solapadas) + reservas
  (reservar/cancelar/devolver/list, guarda cita↔intervalo) + persistencia por proyecto.
✓ v0.2 FEED .ics — op feed_ics (reflejo 0.2.0) + _shared/ical (serializador RFC 5545 PROPIO,
  sin deps, 6/6 tests): reservas → texto .ics, horas en tiempo flotante (reloj de pared).
◑ v0.2 resto — última milla: exponer el .ics como GET suscribible (webcal) · import .ics/CalDAV
  del dueño (días cerrado) · tz/DST correcto (TZID+VTIMEZONE, luxon).
[ ] CONSUMIDORES — agenda-citas (gateado por organo-agenda) · alquiler · staff-turnos.
```
