---
name: sembrador-norte
description: >-
  SEMBRADOR del vertical NICHOS: siembra el buscador con lo que sabemos cobrar.
  Lee el catalogo de capacidades (el NORTE) y publica, por cada capacidad y su
  territorio, la idea completa en la puerta del vertical. Sin catalogo no
  siembra: lo dice y pulsa sin_norte.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: reflejo
tags: [nichos, arranque, siembra, norte, catalogo, bus, mqtt]
---

# nichos · sembrador-norte

> **Que es.** El ARRANQUE del vertical NICHOS. El buscador tiene NORTE (el
> catalogo de capacidades marca cada candidato con `puede_cobrar`), pero el
> norte solo ORDENA lo que ya entro — la semilla seguia viniendo de fuera (la
> idea que el dueno escribe al bot). El sembrador pone la semilla DONDE SABEMOS
> COBRAR: lee el catalogo y publica la idea completa en la puerta del vertical.
>
> Codigo: `modules/nichos/sembrador-norte/index.js`. La verdad viva es el
> codigo; esta skill es la referencia de uso.

---

## Forma Enki

- Patron: **REFLEJO puro** (`ModuloHibridoReflejo`), JS determinista, sin LLM.
- Estado: **ninguno** — el custodio del norte es `catalogo-capacidades`.
- La semilla sale del DATO (`catalogo.meta.semillas`), nunca de una lista clavada
  en el codigo.

## Evento que atiende

| Evento | Handler | Que devuelve |
|---|---|---|
| `nichos.sembrador.norte.sembrar.request` | `onSembrarRequest` | `{status:200, data:{sembradas[], publicadas, capacidades, territorio}}` o `motivo:'sin_norte'` |

### Payload

```json
{
  "request_id": "uuid",
  "project_id": "4fe1fb71-…",
  "territorio": "Lorca",
  "capacidades": ["comercio-pizzepos-pos"],
  "max_semillas": 3
}
```

## Que pulsa

| Evento | Cuando |
|---|---|
| `nichos.semilla.capturar.request` | una por semilla — entra por la puerta del vertical: `texto:"<semilla> en <territorio>"`, `origen:"sembrador-norte"`, `capacidad_id` |
| `nichos.sembrador.norte.sembrado` | cierre con el resumen de la siembra |
| `nichos.sembrador.norte.sin_norte` | se pidio sembrar y el catalogo esta VACIO (no se inventa nada) |

## El eslabon que cierra

`catalogo-capacidades.disponibles → sembrador → semilla.capturar → (cadena de siempre) → candidatos con puede_cobrar=true`.

Si el catalogo esta vacio, la cadena entera queda sin norte: **primero se declara
la capacidad** (`nichos.catalogo.capacidad.promover.request`, con
`meta.semillas` = a quien le vendemos eso), y despues se siembra.
