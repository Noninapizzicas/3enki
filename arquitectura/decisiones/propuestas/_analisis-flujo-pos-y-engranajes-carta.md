# Análisis del flujo POS y el ecosistema-carta — sesión 2026-06-01 (parte 2)

**Estado:** análisis abierto, decisiones de ajuste pendientes.
**Continúa:** el horizonte `cierre-ui-blueprints` y abre uno nuevo, el de ajuste de engranajes POS/carta.

## Marco corregido tras correcciones del usuario en sesión

- **No restamos, sumamos.** El sistema tiene capas superpuestas — no para eliminar, sí para ajustar cómo encajan. Cada módulo del ecosistema tiene rol propio cuando se mira de cerca; no son redundancia real.
- **Cada módulo del subsistema-carta + menu-generator tiene propósito real y responsabilidad acotada.** El trabajo es de relojero suizo, no de rediseño.
- **Caso más interesante del comerciante (no único):** "ya tengo una carta hecha y la quiero en el sistema con cero esfuerzo, con precios puestos y funcionando". Esto valida menu-generator como puerta de entrada práctica (no solo para Hilo B de retail).
- **Bifurcación a partir de carta en sistema:** POS interno (consumo local) + PWA digital (comercio online) — pueden ser uno, otro, o ambos.

## El ecosistema POS verificado en disco

Existe completo y funcionando desde antes de añadir carta-manager. Vive bajo `modules/pizzepos/`:

- `productos` — catálogo operativo del POS. Persiste en `{base_path}/storage/pizzepos/cartas/`. Es el catálogo que el comandero consume.
- `categorias` — agrupación.
- `ingredientes` (POS, distinto del subsistema-recetario).
- `tarifas` — precios por canal de venta.
- `variaciones` — variantes (tamaño, extras).
- `cuentas` + `cuentas-canales` — mesa abierta / pedido en curso.
- `comandero` — buffer de items que el operador añade a una cuenta.
- `persistencia-comandero` — persistencia transitoria.
- `pedidos` — orden formal a cocina.
- `cocina` (+ `cocina-poc`) — recibe el pedido.
- `cobros` — pago.
- `impresion` — ticket.

## Cómo se hidrata productos (POS) — dos canales activos hoy

Verificado en `modules/pizzepos/productos/module.json`. `productos` escucha tres eventos relevantes:

- `menu.generado` (publicado por menu-generator IA) → guarda en `menusPendientes` esperando validación.
- `menu.validado` → sync al catálogo y persiste a disco.
- `carta.actualizada` (publicado por carta-manager) → auto-sync al catálogo.

Y publica:
- `producto.{creado,actualizado,eliminado}` → consumido por comandero/pedidos.
- `catalogo.actualizado` → consumido por comandero/pedidos para refrescar cache.
- `menu.generado` (re-emitido tras carga inicial desde disco para que `categorias` se popule).

**Hoy conviven dos rutas hacia productos:**
- Ruta histórica (anterior a carta-manager): `menu-generator → menu.generado/validado → productos → POS`.
- Ruta nueva (con carta-manager): `menu-generator → carta.creada → carta-manager → carta.actualizada → productos → POS`.

Ambas terminan en `productos`. `productos` es el catálogo real del POS, carta-manager es el aggregate root del documento "carta" como entidad.

## Roles diferenciados (no redundancia)

- **menu-generator** — estructura input bruto (texto/JSON/foto+LLM externo) en carta canónica.
- **carta-manager** — aggregate root del recurso "carta" como documento (versionado, history, navegable).
- **productos (POS)** — catálogo OPERATIVO del POS donde cada producto vive con tarifas por canal, variaciones, ingredientes; el que el comandero consume para vender.

La carta es el QUÉ visual (lo que el cliente lee). productos es el QUÉ operativo (lo que el operador vende).

## Cadena operativa del POS (factual)

```
menu-generator → menu.generado → productos (guarda pendiente)
                  ↓
            menu.validado → productos (sync catálogo + persiste)
                  ↓
            catalogo.actualizado + producto.* → comandero (cachea)
                                              → pedidos (cachea)
                                              → categorias (popula)
                                              → ingredientes (POS)

Operador del local:
  comandero UI → handlers add-item/remove-item/etc.
              → comandero.item_agregado / item_actualizado / item_eliminado
              → comandero.enviar_cocina
                  ↓
            pedidos crea pedido formal
                  ↓
            cocina recibe + procesa
                  ↓
            cobros cobra + impresion ticket
```

## Estado de carta-design

Aparcado. Análisis profundo realizado verificó:
- Tiene UI cocinada (ruta SvelteKit + 2 módulos frontend: `design-profiles` 🎭 + `design-gallery` 🎨 + store dedicado).
- Cumple PR1, PR3, PR4, PR7 del contrato `ui-frontend-blueprint`.
- Tiene bug PR6 violado (store hace `fs.write/delete` directamente saltándose el blueprint).
- Tiene otros gaps menores (sin prefillChatInput, sin router activeView en DesignProfilesPanel, sin suscripciones a eventos del blueprint).

Pero el usuario observó tras ver la UI en producción: **"no aporta nada interesante al comerciante"**. Solapamiento aparente con carta-impresion (ambos generan HTML imprimible vía agentes distintos). carta-design no aparece como puerta del flujo del comerciante.

**Decisión pendiente:** propósito por reabrir (ruta C) en otra conversación. NO se cocina UI hasta tener claro qué le aporta al comerciante. Mientras tanto, el bug PR6 queda anotado.

## Lo pendiente abierto al cerrar el ritual

- **Pregunta concreta del usuario al cerrar ritual:** "primero nos vamos a centrar en los dos engranajes que nos llevan al POS, ok?". Pendiente confirmar cuáles son esos dos engranajes (mi enumeración A/B fue precisamente lo que ana se ensució — no precipitar).
- **carta-design** aparcado hasta reapertura de propósito.
- **viabilidad** aparcado hasta maduración del dominio.
- **tecnicas** aparcado por estar fuera del sistema vivo.

## Estado del horizonte cierre-ui-blueprints

- ✓ Plan `cierre-ui-recetas` mergeado y ejecutado por fede (UI viva en producción — confirmado por capturas del usuario).
- ✓ Plan `cierre-ui-escandallo` mergeado, dependencia con recetas F1, pendiente de ejecución por fede.
- ✓ Plan `cierre-ui-carta-manager` mergeado, dependencia con recetas F1, pendiente de ejecución por fede.
- ⏸ viabilidad, tecnicas, carta-design aparcados.
- Pendientes de cocinar plan: carta-digital, carta-impresion, carta-marketing, carta-scheduler, menu-generator (UI dispersa).

---

**Cierre del ritual de limpieza** sesión 2026-06-01 parte 2.
**Lo importante está en disco:** contrato, planes, este análisis del flujo POS, estado del horizonte.
**Próxima sesión:** puede arrancar limpia. La pregunta pendiente del usuario es "los dos engranajes que llevan al POS" — ana al retomar debe confirmar cuáles son antes de proponer.
