---
name: carta-marketing
description: >-
  Perfil de marca del proyecto + copy de producto. HÍBRIDO: el blueprint
  (LLM de página) descubre la marca y redacta el copy; el reflejo sirve
  el CRUD determinista (get_perfil, update_perfil, guardar_copy, validar).
  Tercer caso del Patrón Módulo Híbrido. Primer caso del patrón
  AGENTE-PERSPECTIVA-C (marketing-copywriter tools:[]).
fuente: enki
dominio: comercio
tags: [pizzepos, carta, marketing, marca, copy, perfil, hibrido, perspectiva-c]
---

# Pizzepos · carta-marketing

> **Qué es.** El perfil de marca del proyecto. Contiene la identidad visual,
> la voz, la esencia y el copy de los productos. El LLM de página descubre
> la marca mediante entrevista (onboarding) y redacta el copy; el reflejo
> persiste todo de forma determinista.
>
> **Primer caso del patrón AGENTE-PERSPECTIVA-C:** el agente marketing-copywriter
> tiene `tools:[]` — solo transforma. El reflejo hidrata los datos antes y
> persiste el resultado después. El entregable aterriza SIEMPRE.
>
> Código: `modules/pizzepos/carta-marketing/index.js` · v`2.6.0`

---

## 1 · LÓGICA

### El perfil de marca

```jsonc
// /pizzepos/marca.json
{
  "esencia": {
    "nombre": "Pizzas Paco",
    "eslogan": "La pizza de tu barrio",
    "personalidad": ["cálida", "familiar", "tradicional"],
    "historia": "Nacimos en 1995..."
  },
  "voz": {
    "tono": "cercano y divertido",
    "registro": "tú",
    "valores": ["calidad", "cercanía", "tradición"]
  },
  "visual": {
    "colores": { "primario": "#E63946", "secundario": "#F1FAEE" },
    "tipografia": "sistema",
    "logo_url": null
  },
  "copy": {
    "preambulo": "Bienvenido a Pizzas Paco...",
    "promos": [],
    "productos": {
      "pizzas_margarita": { "descripcion": "La clásica de siempre..." }
    }
  }
}
```

### El reparto híbrido

```
LLM DE PÁGINA (blueprint)                REFLEJO (JS)
─────────────────────────                ────────────
· Entrevista de onboarding                · get_perfil (lectura)
· Descubre la marca                        · update_perfil (deep-merge)
· Redacta copy                            · guardar_copy (persiste)
· Decide qué persistir                     · validar (AJV contra schema)
```

### Validación de marca (el freno)

`carta-marketing.validar.request` valida la marca contra `marca.schema.json`
(AJV). `update_perfil` re-valida el merge como GATE antes de escribir.
Un parche que rompe el schema (voz como string, esencia.nombre como número)
→ `422`, no persiste. Mata la marca rota que beberían carta-design y canales.

---

## 2 · EVENTOS

### Atiende (request → response)

| Evento | Handler | Descripción |
|--------|---------|-------------|
| `carta-marketing.get_perfil.request` | `onGetPerfilRequest` | Lee el perfil de marca |
| `carta-marketing.update_perfil.request` | `onUpdatePerfilRequest` | Escribe campos (deep-merge por sección) + valida GATE |
| `carta-marketing.guardar_copy.request` | `onGuardarCopyRequest` | Persiste copy redactado por el LLM |
| `carta-marketing.validar.request` | `onValidarRequest` | Valida marca contra schema AJV (freno) |

### Publica

| Evento | Cuándo |
|--------|--------|
| `marketing.perfil.actualizado` | Perfil modificado (correlation_id obligatorio) |
| `marketing.copy.generado` | Copy persistido |

---

## 3 · FLUJO TÍPICO

### Onboarding de marca (entrevista)

```
1. USUARIO dice        → "mi pizzeria se llama Pizzas Paco"
2. LLM DE PÁGINA        → interpreta → update_perfil { esencia: { nombre: "Pizzas Paco" } }
3. REFLEJO escribe      → deep-merge en marca.json + valida GATE
                        → marketing.perfil.actualizado
4. LLM DE PÁGINA        → "¿cuál es tu eslogan?" → espera respuesta
5. USUARIO responde     → "La pizza de tu barrio"
... (itera hasta completar el perfil)
```

### Redactar copy de producto

```
1. LLM DE PÁGINA redacta → "La clásica margarita con tomate San Marzano..."
2. REFLEJO persiste      → guardar_copy { copy: { descripciones: {...} } }
3. COPY GENERADO         → marketing.copy.generado
4. CARTA-DESIGN lo lee   → get_perfil → lo pinta en la carta digital
```

---

## 4 · INTEGRACIÓN

> **Página activable:** `target_page_id: 'carta-marketing'` — el ai-gateway
> enfoca al LLM en marketing. Lente default: dominio `copy`, tarea `copy`.

> **Onboarding:** el LLM de página conduce la entrevista. Cada respuesta del
> usuario se persiste vía `update_perfil`. No hay agente de onboarding separado.

> **Copy:** el LLM de página redacta. El reflejo solo guarda.
> El copy NO tiene validación mecánica (es texto libre, su contrato es la voz).

> **Persistencia:** `data/projects/<id>/pizzepos/marca.json` + `.../copy.json`.
> Single-writer. Deep-merge por sección (no pisa).
