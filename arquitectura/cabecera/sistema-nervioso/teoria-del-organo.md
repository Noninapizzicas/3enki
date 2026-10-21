---
id: sistema-nervioso/teoria-del-organo
dominio: aprendizaje
resumen: Órgano = memoria + motor + químico + evento: cuenco de packs (lentes-diseno), homeostasis (termostato), verificador-visual (ojos), rumbo plataforma.
fuentes:
  - modules/lentes-diseno/**
  - modules/homeostasis/**
  - modules/verificador-visual/**
  - deployment/obscura/**
verificado: 2026-07-21
---

# Teoría del Órgano — cuenco · grafo · homeostasis · ojos (vivo en main, 2026-06-29)

> Un solo tipo de cosa: el ÓRGANO = MEMORIA(.md/store) + MOTOR(hook) + QUÍMICO(frecuencia) + EVENTO(lo público).
> La diferencia entre lente/provider/módulo = qué facultades tiene despiertas. Soltar pack = soltar órgano.
> Doc largo: arquitectura/decisiones/propuestas/teoria-del-organo.md. Rumbo: rumbo-plataforma.md.

## CUENCO de packs — modules/lentes-diseno ({{version:modules/lentes-diseno}}, reflejo puro)

```
_descubrirPacks()  escanea packs/<dominio>/_pack.json (cúpula invertida; auto-descubre, no dirige).
                   SEMILLA (código) y CRECIDO (data/) PAREN dominios — un dominio emerge de su
                   primera lente (P0, anti «declara-antes-de-actuar»); no se pre-declara.
FÁBRICA (montar)   montar en un dominio inexistente lo hace NACER (dominio_nacio:true), no rebota.
                   El 409 dominio-sin-pack se disolvió; lo que ninguna página beba, el nervio no lo
                   inyecta (filtro al LEER, no puerta al ESCRIBIR).
ADN (_pack.json)   { dominio, cuando_usar, memoria{lentes,rutas}, motor?{hook,ops}, quimico?{cada,op,evento}, evento }
PACKS VIVOS        diseño (8 lentes, solo memoria) · copy (5, marketing→carta-marketing) ·
                   negocio (3 + MOTOR food_cost/pvp_objetivo/salud_margenes céntimos + QUÍMICO pulso 7d→negocio.pulso)
SELECCIÓN HÍBRIDA  obtener({dominio?,tarea}) → rutas (reflejo) · obtener({nombres}) → LLM elige cuando_usar
RPC                lentes.listar/obtener/motor/vecinas.request → .response
NACIMIENTO         cada pack emite lente.registrar al cargar (handshake)
GRAFO (Obsidian §10) nodos=lentes; aristas DECLARADAS (co-ruta*2 + co-dominio) + APRENDIDAS (co-uso).
                   obtener de ≥2 lentes refuerza arista + emite lente.co_uso (durabilidad futura = destilador).
                   lentes.vecinas.request {desde,k,dominio?} → vecindad; aquí aflora lo CROSS-DOMINIO.
                   tabla rutas = SUELO determinista. Aprendido EN MEMORIA (volátil hoy).
NERVIO             ai-gateway _leerLente/_composeLenteSection (dominio-aware). Páginas declaran lente_default:
                   carta-design/digital {diseño,tema} · carta-marketing {copy} · escandallo/viabilidad {negocio}.
TESTS              servir 15 · anatomia 3 · grafo 9 · nervio-lentes 5
SKILL              .claude/skills/montar-pack-lentes/ — recetario para onboardear un agente/skill externo
                   como pack (GUÍA en positivo, ya no freno de código: prefiere cosechar si aún no hay
                   página que beba el dominio; pero montar puede parirlo — el nervio filtra al leer).
```

## HOMEOSTASIS — modules/homeostasis (1.0.0) — el termostato (auto-inhibición)

```
BUCLE   SENSOR(.failed/fantasma/health.alert/revision) → COMPARADOR(temp+umbral+histéresis)
        → EFECTOR(interruptor.set inhibe) → ENFRIAMIENTO(_enfriar, recupera con histéresis)
GRADUADA inflamación(2)=solo testigo · fiebre(4)=inhibe si gobernable · apoptosis(8)=canta, NO mata sola (voluntad)
AUTOINMUNE solo inhibe lo que registró interruptor; NUNCA vitales (bus·propiocepcion·ai-gateway·fs·interruptores·homeostasis)
TESTIGO  toda transición → bus (homeostasis.alerta/accion/recuperado/apoptosis); sin actos invisibles
NACE OFF dormida SIENTE+TESTIFICA, efector no actúa. Humano la despierta (interruptor 'homeostasis').
         VIVO en Nonina: activo=true, gobernables=[sintonizador,conserje,conserje-rutas,portal-mcp,portal-mcp-write]
SENSORES emisor vivo: chat.fantasma_sospechado(ai-gateway) · aprendizaje.revision.requerida(destilador) ·
         health.alert.*(device-health) · *.failed(tap del bus crudo)
interruptores 1.2.0  subscribe interruptor.set→onSetRequest (canal del efector, motivo=testigo)
TESTS   homeostasis__bucle 10
```

## VERIFICADOR-VISUAL — modules/verificador-visual (1.2.0) — los OJOS (freno de render)

```
ÓRGANO  MOTOR+EVENTO sin memoria (tipo provider). Cierra el lazo que el freno estructural deja abierto.
CEREBRO _evaluarSnapshot (PURO): errores_consola/js · overflow_horizontal · pagina_en_blanco · imagenes_rotas
OJOS    _render → _abrirNavegador: PREFIERE obscura (navegador Rust, V8, SIN Chromium, stealth) por CDP
        (puppeteer.connect ws://127.0.0.1:9222/devtools/browser; server COMPARTIDO → disconnect, no close).
        Sin obscura → cae honesto a Chromium local (puppeteer.launch). Despliegue: obscura por vps-setup
        (binario prebuilt → Docker), systemd obscura.service. Config obscura_url · env VERIFICADOR_OBSCURA_URL.
DEGRADA sin navegador (ni obscura ni Chromium) → SIN_OJOS → {ok:true, verificado:false} (fail-open + testigo).
RPC     render.verificar.request {html,etiqueta?} → {ok,verificado,motivos[],metricas}
TESTIGO render.verificado / verificacion-visual.failed (.failed → lo siente la homeostasis)
FRENO DURO (best-effort: 422 solo si verificado&&!ok)
        carta-design.save (3.3.0)        tras estructural → _checkRender → 422 no guarda
        carta-digital._publicarBundle (2.19.0) genera HTML → render → 422 no publica
TESTS   verificador-visual__render 12 (incl. navegador real: obscura si está, Chromium si no) · carta-design__freno-render 5
```

## RUMBO

```
pizzepos = VERTICAL 1 (no el producto). DESPUÉS: comercio local = vertical 2 (mismo núcleo, soltar packs+páginas).
REGLA   una lente solo entra cuando hay PÁGINA que la beba. Hasta entonces se COSECHAN candidatos, no se montan colgantes.
COSECHA v2: VoltAgent/08-business-product (assumption-mapping·product-manager·business-analyst·customer-success·growth·legal).
```
