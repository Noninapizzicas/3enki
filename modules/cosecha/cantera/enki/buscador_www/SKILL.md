---
name: buscador-www-impresion
description: >-
  Buscador de modelos 3D en el ecosistema público (Cults3D, Printables,
  Thingiverse, MakerWorld). Escucha buscar.request y responde con los
  resultados encontrados (o *.failed). Alimenta la cola de impresión con
  modelos descargables de la web.
fuente: enki
when-to-use: "Entra encadenada por proceso-negocio (fase 4/5 de impresion-3d) o a mano para buscar modelos 3D imprimibles en la web pública (Cults3D, Printables, Thingiverse, MakerWorld) y alimentar la cola de impresión."
dominio: impresion-3d
lente_dominio: busqueda
lente_tarea: buscar
tags: [impresion-3d, buscador, www, modelos, cults3d, printables, thingiverse, makerworld, bus, fase4, fase5]
---

# Buscador WWW — impresión 3D

> **Qué es.** El buscador de modelos 3D en el ecosistema público. Consulta
> Cults3D, Printables, Thingiverse y MakerWorld y devuelve modelos imprimibles
> para alimentar la cola. No imprime ni diseña; solo encuentra.
>
> Código: `modules/buscador_www/` · habilita `buscador_www.*` por bus.

---

## 1 · Contrato de eventos (bus)

**Escucha:**

| Evento | Qué hace |
|---|---|
| `buscador_www.buscar.request` | Busca modelos 3D en la web pública. |

**Publica:**

| Evento | Cuándo |
|---|---|
| `buscador_www.buscar.failed` | Falló la búsqueda. |

*(El resultado de la búsqueda se devuelve en la respuesta del request; el
único evento publicado es el de fallo.)*

---

## 2 · Fuentes

- **Cults3D**
- **Printables**
- **Thingiverse**
- **MakerWorld**

La búsqueda consulta estas plataformas y devuelve los modelos encontrados con
sus metadatos (nombre, fuente, enlace, descargable).

---

## 3 · Uso típico

1. **Buscar modelos** → `buscador_www.buscar.request { query }`
2. Recibe los resultados con los modelos candidatos.
3. Los modelos elegidos entran a la cola (`cola_modelos`) para imprimirse.

---

## 4 · Pitfalls

- **No imprimas ni diseñes**: este módulo solo busca. La decisión de qué
  imprimir y el diseño son de otros módulos.
- **Fuentes externas**: la búsqueda depende de la disponibilidad de las
  plataformas. Si una falla, no inventes resultados — emite `*.failed` o
  devuelve lo que sí se pudo consultar.
- **Verifica en disco**, no creas al reporte: confirma los resultados
  devueltos y su procedencia.
