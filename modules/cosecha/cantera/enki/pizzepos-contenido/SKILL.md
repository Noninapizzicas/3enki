---
name: contenido
description: >-
  Base de enriquecimiento audiovisual por producto. Reflejo puro: sirve
  get/add_imagen/quitar_imagen/set en el bus. Base compartida que beben
  los canales de presentación (carta-digital, carta-impresión). El POS
  no la usa. Imágenes como referencia (CDN) o fichero (base64). Estructura
  extensible para descripción/audio/video/interacción.
fuente: enki
dominio: comercio
tags: [pizzepos, contenido, imagen, audiovisual, producto, carta, digital]
---

# Pizzepos · contenido

> **Qué es.** El almacén de enriquecimiento audiovisual de productos.
> Cada producto de la carta puede tener imágenes, descripción, audio,
> video e interacción. HOY implementa imágenes con dos modos de carga:
> **referencia** (URL remota a CDN) o **fichero** (base64, se re-aloja).
>
> **Reflejo puro:** no tiene blueprint. Es un almacén determinista.
> Los cajones fuzzy (copywriter, director de arte) viven en carta-digital.
>
> **No lo usa el POS.** La carta digital y la impresa lo beben.
>
> Código: `modules/pizzepos/contenido/index.js` · v`1.3.0`

---

## 1 · LÓGICA

### Qué guarda por producto

```jsonc
{
  "producto_id": "pizzas_margarita",
  "imagenes": [
    { "id": "img_001",
      "url": "/pizzepos/contenido/imagenes/pizzas_margarita_001.jpg",  // o url_remota
      "principal": true,
      "tipo": "fichero" }                                              // o "referencia"
  ],
  "descripcion": "La clásica italiana",      // futuro
  "audio": null,                               // futuro
  "video": null,                               // futuro
  "interaccion": null                          // futuro
}
```

### Dos modos de imagen

| Modo | Cómo se pasa | Almacenamiento | Uso típico |
|------|-------------|----------------|------------|
| **REFERENCIA** | `{ url_remota }` | No se descarga. La URL es la evidencia | CDN externo, imágenes de proveedor |
| **FICHERO** | `{ content: base64, ext: "jpg" }` | Se re-aloja en `/pizzepos/contenido/imagenes/` | Bytes de crawl, subida directa |

### Store

```
/pizzepos/contenido.json                   ← metadatos (referencias)
/pizzepos/contenido/imagenes/<id>.<ext>    ← ficheros re-alojados
```

---

## 2 · UI (frontend)

| Ruta | Handler | Descripción |
|------|---------|-------------|
| `contenido.get` | `handleGet` | Lee enriquecimiento de un producto (o todos) |
| `contenido.add_imagen` | `handleAddImagen` | Sube imagen (base64) a un producto |
| `contenido.quitar_imagen` | `handleQuitarImagen` | Quita imagen (libera fichero si aplica) |
| `contenido.set` | `handleSet` | Deep-merge de un parche (descripción/audio/...) |

---

## 3 · EVENTOS

### Atiende (request → response)

| Evento | Handler | Descripción |
|--------|---------|-------------|
| `contenido.get.request` | `onGetRequest` | Lee enriquecimiento de un producto (o todos) |
| `contenido.add_imagen.request` | `onAddImagenRequest` | Añade imagen (referencia o fichero) |
| `contenido.quitar_imagen.request` | `onQuitarImagenRequest` | Quita imagen + promueve principal si toca |
| `contenido.set.request` | `onSetRequest` | Deep-merge extensible (descripción, audio...) |

---

## 4 · FLUJO TÍPICO

### Añadir imagen a un producto

```
1. USUARIO sube imagen     → contenido.add_imagen { producto_id, content: base64, ext: "jpg" }
2. REFLEJO recibe           → re-aloja en /pizzepos/contenido/imagenes/
3. REFLEJO guarda           → metadato en contenido.json
4. RESPUESTA                → { imagen: { id, url, principal: true } }

// O desde CDN:
contenido.add_imagen { producto_id, url_remota: "https://cdn.example.com/pizza.jpg" }
→ no descarga, guarda referencia
```

### Consultar imágenes para carta digital

```
1. CARTA-DIGITAL necesita  → imágenes de la carta
2. PREGUNTA                → contenido.get { project_id }
3. RESPUESTA               → { productos: { "pizzas_margarita": { imagenes: [...] } } }
```

---

## 5 · INTEGRACIÓN

> **Reflejo puro:** no tiene blueprint ni LLM. Es un almacén determinista.

> **Consumidores:** carta-digital y carta-impresión. El POS no toca contenido.

> **Extensible:** la estructura reserva espacio para descripción, audio, video
> e interacción. Se añaden vía `contenido.set` (deep-merge) sin nueva operación.

> **Persistencia:** `data/projects/<id>/pizzepos/contenido.json` + imágenes
> en `.../contenido/imagenes/`. Single-writer.
