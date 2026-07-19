---
name: prisma-taller-ui
description: El TALLER de UI de prisma — recetario para que el LLM COMPONGA UIs web potentes y con lógica (POS, escaparate, páginas a medida) para un comercio prisma, servidas desde storage/www/prisma/<proposito>/. La UI se DERIVA del ProductoUniversal, se tiñe y se habla con TODO lo que resolvió marketing (marca + copy), se diseña con las lentes-diseño punteras y REUSA los módulos de UI de pizzepos donde encajan. Úsala cuando haya que crear o regenerar una UI de un comercio prisma.
fuente: enki
dominio: comercio
lente_dominio: diseño
lente_tarea: componer-ui
tags: [prisma, ui, taller, pos, escaparate, diseño, marca, copy, marketing, lentes, reflejo, blueprint, www]
---

# Taller de UI de prisma

Compones una **UI web potente, con lógica y lujo de detalle** para un comercio prisma. No rellenas
una plantilla: **creas** — dirigido por el ProductoUniversal, con el mejor diseño del cuenco, con
todo el trabajo de marketing dentro, reusando lo que pizzepos ya resolvió.

El módulo `prisma/ui-forge` (reflejo) hace el LEER/GUARDAR determinista; TÚ (LLM de página) haces el
PENSAR guiado por esta receta. Espinazo: **LEER → PENSAR → GUARDAR → EMITIR.** Fluye — sin frenos.

## LEER — hidrata TODO el contexto (por el bus, reflejos deterministas)

```
CATÁLOGO   catalogo.get.request { project_id, catalogo_id }         → productos (ProductoUniversal: opciones/ejes/naturalezas/origen/avisos)
MARCA      carta-marketing.get_perfil.request { project_id }        → visual {colores·tipografías·logo} · VOZ {tono·registro·sí/no} · esencia {lema·propósito·valores} · público
COPY       fs.read.request { project_id, path:'/pizzepos/carta-marketing/copy.json' }
                                                                     → descripciones por producto · preámbulo · promos   (TODO lo resuelto por marketing)
LENTES     lentes.obtener.request { dominio:'diseño', tarea:'UI <proposito> de comercio' }
                                                                     → las skills de diseño punteras (design-impeccable · ui-designer · liquid-glass · make-interfaces-feel-better · motion-ui)
MÓDULOS UI DE PIZZEPOS (para REUSAR lo ya resuelto):
   Read  frontend/src/lib/components/comandero/*  y  frontend/src/lib/components/carta/*
   son la fuente de PATRONES probados. Reusa su estructura/interacción, adapta el dato al ProductoUniversal:
     CobroPanel.svelte        → el flujo de cobro (efectivo/tarjeta/bizum/mixto/cambio) — reusa casi tal cual
     CierreCajaPanel.svelte   → cuadre de caja — reusa
     ProductoBtn · CategoriaBtn · PedidoList · PedidoItem → grid, botón, líneas del carrito — reusa la forma
     ComanderoScreen.svelte   → el SHELL del POS (layout categorías+grid+carrito) — reusa el esqueleto
     CarritoPanel · ProductoCard · ProductoDetalle (carta/) → la cara cliente — reusa para el escaparate
   Lo hostelería-específico (MitadMitad · AlGusto · VariacionesPanel) es un caso particular de `opciones`:
   en prisma lo cubre el OpcionesRenderer universal (abajo), que lo abarca y además da la dedicatoria del regalo.
```

## PENSAR — COMPONE la UI (aquí está el gusto y la potencia)

```
DERIVA DEL PRODUCTO (no de una plantilla): por cada producto lee sus 5 huecos y dibuja lo que PIDE
   opciones[].modo = ELEGIR_UNO   → radio        · ELEGIR_VARIOS → checkbox
   opciones[].modo = QUITAR       → chip quitable · LIBRE        → texto (p.ej. dedicatoria del regalo)
   ejes.tiempo ≠ ninguno          → widget de fecha/cita          · naturalezas.precio = rango_valoracion → 'Consultar'
   naturalezas.precio = por_peso  → input de peso                 · restricciones verdad_obligatoria → avisos (alérgenos)
   → una pizza, una lámpara, un regalo y un servicio se dibujan con UNA sola UI.

BOTÓN DE DOS ZONAS (patrón del POS): cuerpo = añadir rápido (defaults) · franja = OpcionesRenderer (cuando hay opciones)

MARKETING DENTRO (no solo colores):
   visual → --accent, tipografías, logo de la marca
   VOZ    → todo microcopy (títulos, CTAs, vacíos) habla con el tono/registro de la marca (voz.tono, voz.sí/no)
   COPY   → las descripciones de marketing por producto · el preámbulo como intro · las promos donde luzcan
   habla con lo que marketing PUSO (voz y copy reales); la marca da la palabra.

DISEÑO PUNTERO: sigue las lentes-diseño que trajo LEER (jerarquía, ritmo, espaciado, motion sobrio,
   contraste, foco). El objetivo es que se sienta cuidado y actual, no un formulario.

LÓGICA REAL: el bundle OPERA — carrito cliente + total en céntimos (tasa con deltas). El cobro se engancha
   al backend por el bus (carrito.add_item · cobro.crear/confirmar) cuando el proposito lo pida.
```

## GUARDAR — servir el bundle

```
project.ensure-feature.request { id:project_id, features:['www'] }      (activa el symlink)
fs.write.request { project_id, path:'/www/prisma/<proposito>/index.html', content:html, atomic:true }
```

## EMITIR

```
ui-forge.generado { project_id, proposito, ... }   →  /<ns>/<slug>/prisma/<proposito>/
```

## Los ojos (opcionales, ayudan — nunca frenan)

Si quieres pulir, `render.verificar.request { html }` (verificador-visual) te devuelve lo que mejoraría
(overflow móvil · contraste · legibilidad). Es una AYUDA para afinar, no una puerta: el taller fluye y
sirve; los ojos solo te dan pistas para la siguiente pasada.
