# Esquema — Carta digital pública de The Pirate

Árbol maestro. Todo embebido — no punteros.

---

## Sujeto

**Carta digital pública** — lo que ve el cliente final cuando abre la carta
en su móvil. No el backoffice. La CARA pública.

Mobile-first (90%+ en móvil), < 2s carga, legible en luz tenue, sin instalación (URL).

---

## Árbol

```
CARTA DIGITAL PÚBLICA
│
├─ A. CABECERA ──────────────────────────────────────────────
│   │  Lo primero que ve. Sello compacto, no hero de marketing.
│   │
│   ├─ [1]  Logo .................... REFLEJO    imagen + posición fija
│   ├─ [2]  Nombre marca ........... REFLEJO    "THE PIRATE" + font display
│   ├─ [3]  Lema ................... REFLEJO    "Abierto ante la ley · Saqueado con gusto"
│   └─ [4]  Ambiente ............... REFLEJO    fondo/textura de piel (tokens CSS)
│
├─ B. NAVEGACIÓN DE CATEGORÍAS ──────────────────────────────
│   │  Cómo el cliente salta entre secciones.
│   │  Barra horizontal scrollable con chips, sticky top.
│   │
│   ├─ [5]  Chip de categoría ...... REFLEJO    nombre → botón con estados
│   ├─ [6]  Barra contenedora ...... REFLEJO    horizontal scroll + sticky (CSS)
│   ├─ [7]  Estado activo chip ..... CUSTODIO   sincroniza chip activo ↔ sección visible
│   └─ [8]  Scroll-to-section ...... PUENTE     chip tap → scroll a sección
│
├─ C. PRODUCTO (convergente) ────────────────────────────────
│   │  La pieza central. Imagen × texto × precio × acción
│   │  convergen en un solo layout — NO son ramas independientes.
│   │
│   ├─ [9]  Imagen ................. REFLEJO    URL + lazy + aspect-ratio + fallback
│   ├─ [10] Nombre producto ........ REFLEJO    texto + font display
│   ├─ [11] Descripción corta ...... REFLEJO    1-2 líneas, truncada (CSS)
│   ├─ [12] Precio ................. REFLEJO    número + formato + color acento
│   ├─ [13] Badges alérgenos ....... CONVERSOR  IDs → emoji compacto
│   ├─ [14] Layout convergente ..... CONVERSOR  sintetiza dimensiones en layout responsivo
│   └─      Detalle expandible ..... REF → §E
│
├─ D. PIE ───────────────────────────────────────────────────
│   │  Final de la carta. Contacto + legal.
│   │
│   ├─ [15] Horario ................ REFLEJO    texto
│   ├─ [16] Dirección .............. REFLEJO    texto + link Maps
│   ├─ [17] Teléfono ............... REFLEJO    número + link tel:
│   ├─ [18] Redes .................. REFLEJO    URLs → iconos con links
│   └─ [19] Legal .................. REFLEJO    texto regulatorio (IVA, alérgenos)
│
├─ E. DETALLE BAJO DEMANDA ─────────────────────────────────
│   │  Expandir info al tocar un producto.
│   │
│   ├─ [20] Trigger expandir ....... PUENTE     tap → expansión
│   ├─ [21] Panel animado .......... CUSTODIO   estado abierto/cerrado + animación
│   ├─ [22] Ingredientes chips ..... REFLEJO    lista → chips
│   ├─ [23] Alérgenos con nombre ... CONVERSOR  IDs → nombre + emoji
│   └─ [24] Accordion .............. CUSTODIO   invariante: máx 1 abierto
│
└─ F. ACCIÓN DE PEDIDO ─────────────────────────────────────
    │  Convertir mirar en pedir. Modelo actual: WhatsApp.
    │
    ├─ [25] FAB pedido ............. REFLEJO    botón flotante, posición fija
    ├─ [26] Link WhatsApp .......... CONVERSOR  teléfono → URL wa.me pre-rellenada
    └─ [27] Visibilidad FAB ........ CUSTODIO   aparece después de scroll threshold
```

---

## Restricciones transversales (de pasada 1)

| Restricción | Estado |
|---|---|
| Mobile-first (90%+ móvil) | ATÓMICO — regla: diseñar para 320px+ primero |
| Táctil generoso (min 44px) | ATÓMICO — regla: todo target ≥ 44×44px |
| Carga < 2s | ATÓMICO — regla: texto primero, imágenes lazy |
| Legibilidad (luz tenue) | ATÓMICO — regla: contraste + tamaño mínimo |
| Sin instalación | ATÓMICO — regla: URL en navegador |
| Offline (PWA) | ATÓMICO — regla: service worker + cache |
| Alérgenos obligatorios | ATÓMICO — regla: visible y accesible |
| Precios con IVA | ATÓMICO — regla: siempre incluido |

---

## Recuento

| Métrica | Valor |
|---|---|
| Pasadas | 2 (suelo en pasada 2) |
| Átomos | 27 |
| REF (deduplicados) | 1 (Detalle expandible → §E) |
| SPAWN restantes | 0 |
| ABIERTO | 0 |

### Reparto de formas

| Forma | Cantidad | % |
|---|---|---|
| REFLEJO | 17 | 63% |
| CONVERSOR | 4 | 15% |
| CUSTODIO | 4 | 15% |
| PUENTE | 2 | 7% |
| MICRO-AGENTE | 0 | 0% |

### Lectura del reparto

**63% reflejo** — la carta es una vitrina. Proyecta datos del backend directamente
al cliente. El mismo patrón que el CSS de la piel (67% reflejo).

**4 conversores deterministas** — mapeos sin ambigüedad:
- Alérgenos: ID → emoji / nombre (tabla fija)
- Layout: dimensiones → composición responsiva (CSS)
- WhatsApp: teléfono → URL pre-rellenada (template)

**4 custodios** — estados de UI:
- Qué chip está activo (scroll sync)
- Qué producto está expandido (accordion: máx 1)
- Cuándo aparece el FAB (scroll threshold)
- Animación del panel (expand/collapse)

**2 puentes** — gesto → respuesta:
- Chip tap → scroll a sección
- Producto tap → expandir detalle

**0 micro-agentes** — la carta pública NO necesita juicio. Todo es determinista.
La IA vive en el backoffice (redactar descripciones, generar fotos); la vitrina
solo MUESTRA lo que ya está decidido.
