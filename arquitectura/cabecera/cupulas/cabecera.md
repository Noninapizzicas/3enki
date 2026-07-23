---
id: cupulas/cabecera
dominio: cupulas
resumen: La cúpula de la cabecera — CLAUDE.md servido por rebanadas, computado por doc-sync y vigilado por CI (la escalera de determinismo aplicada al documento).
fuentes:
  - scripts/cabecera/**
  - .github/workflows/cabecera-check.yml
  - .github/workflows/cabecera-ensamblar.yml
  - .github/workflows/cabecera-pulso.yml
verificado: 2026-07-12
---

# CÚPULA DE LA CABECERA — el documento rector servido por rebanadas (5ª sustancia del molde cúpula)

> Quinta sustancia del molde (lentes=conocimiento · cantera=skills · agentes=trabajadores ·
> estados=rumbo · **cabecera=memoria rectora**). Resuelve el envejecimiento del monolito con
> la MISMA idea que rige el bus: mover verdad de la prosa al reflejo. "Totalmente actualizado"
> por prosa no existe; existe POR CONSTRUCCIÓN para lo computable y POR TESTIGO para lo demás.
> Vive en el PLANO GitHub (git es el único writer del doc); el VPS lo hereda por deploy.

## Contrato (JSON)

```json
{
  "esquema": "cupula-cabecera-v1",
  "fuente_de_verdad": "arquitectura/cabecera/** — una rebanada .md por subsistema con frontmatter { id, dominio, resumen, fuentes[globs], verificado }",
  "artefactos_generados": {
    "CLAUDE.md": "FINO: persona + mandato + catálogo de rebanadas (lo que cada sesión carga siempre)",
    "CLAUDE.full.md": "el monolito ENSAMBLADO con los computados resueltos (compatibilidad; no se edita)"
  },
  "pisos_de_frescura": {
    "COMPUTADO": "marcadores {{ version:path }} {{ tests:glob }} {{ count:glob }} (sin espacios en el uso real) resueltos por doc-sync — el drift de números es imposible por construcción",
    "VIGILADO":  "cada rebanada declara sus fuentes; validate-cabecera canta STALE cuando las fuentes cambian y la SECCIÓN que las cubre no (modo PR SECCIÓN-GRANULAR: cruza los hunks del diff con los rangos de sección y mapea fuente→sección por nombre de módulo, así tocar una sección no calla a las otras; modo repo: git log a nivel de fichero). Ve TIMESTAMPS/estructura, no significado.",
    "SEMÁNTICO": "el PRISMA (skill sincronizar-cabecera + sync-reflejo): lee CÓDIGO-vs-PROSA con 5 lentes (contrato·topics·comentarios·pendientes·números) y caza la deriva que el timestamp no ve — prosa viva describiendo código muerto (una rebanada sellada verificado: que ya no es cierta). El reflejo arma el expediente del diff; el prisma juzga.",
    "HONESTO":   "marcador irresoluble → ⚠COMPUTADO_ROTO visible (error, nunca silencio); rebanada stale se sirve marcada, no escondida"
  },
  "organos_en_github": {
    "MEMORIA": "las rebanadas (repo)",
    "MOTOR":   "Actions cabecera-check (cada PR: valida --freno pizzepos + corre sync-reflejo + comenta el empujón/expediente) · cabecera-ensamblar (merge a main: regenera y commitea los artefactos)",
    "QUIMICO": "cabecera-pulso (cron semanal: re-verifica y abre Issue si hay stale/huérfanos acumulados)",
    "EVENTO":  "checks + comentario de bot en el PR + Issues — el testigo visible"
  },
  "gradualidad": "graduado POR DOMINIO (--freno). pizzepos es FRENO: su stale es ERROR que rompe el check (el drift ya pasó ahí — cierra la fuga del sello barato). El resto sigue TESTIGO (warning, no bloquea). Graduar más dominios = añadirlos al --freno; hacerlo cumplir = marcar el check REQUIRED en branch protection. Mismo patrón OFF→ON del interruptor.",
  "un_solo_writer": "git escribe el doc; Enki (VPS) es READER (lo hereda por deploy, mismo commit = misma verdad). Si algún día el runtime quisiera escribir doc (destilador sellando una sección), vuelve por la puerta: un PR con el mismo freno."
}
```

## Ciclo

```
PR toca modules/x/** (fuentes de una rebanada)
  → cabecera-check corre validate-cabecera --diff origin/main --freno pizzepos + sync-reflejo
  → SI la rebanada no se tocó: comentario de bot (empujón + expediente semántico del PRISMA)
     · dominio pizzepos → ERROR que ROMPE el check (freno) · resto → warning (testigo)
  → el autor actualiza la prosa (o sella verificado: TRAS RELEER) en el MISMO PR;
    para deriva semántica corre /sincronizar-cabecera (las 5 lentes ofrecen el parche)
merge a main
  → cabecera-ensamblar corre doc-sync --ensamblar → CLAUDE.md + CLAUDE.full.md regenerados y commiteados
  → los {{marcadores}} se resuelven contra el código REAL de ese commit
lunes (cron)
  → cabecera-pulso: repo entero → silencio si fresco · UN Issue con la lista si hay stale
```

## Mandatos de mantenimiento

```
MANDATO números_computados : versión/recuento/nº de tests → SIEMPRE marcador {{...}}, nunca a mano
MANDATO rebanada_con_pr    : el PR que cambia código cubierto por fuentes actualiza su rebanada (la red del CI canta el olvido)
MANDATO rebanada_nueva     : fichero en arquitectura/cabecera/<dominio>/ + entrada en _orden.json + fuentes declaradas
MANDATO modulo_con_hogar   : todo modules/**/module.json cubierto por las fuentes de alguna rebanada (el validator lista huérfanos)
```

## Piezas

```
arquitectura/cabecera/**                 MEMORIA (rebanadas + _orden.json + _mandato.md + _persona.md)
scripts/cabecera/doc-sync.js             MOTOR: marcadores + catálogo + ensamblado (lib + CLI --check/--ensamblar)
scripts/cabecera/validate-cabecera.js    VIGILANTE: frontmatter/marcadores (error) · stale SECCIÓN-GRANULAR/huérfanos/fuentes-muertas (testigo, o ERROR si --freno <dominio>) · --diff BASE · --json
scripts/cabecera/sync-reflejo.js         REFLEJO del PRISMA: del diff arma el expediente (rebanadas·secciones·ficheros·pendientes·comentarios) para las lentes semánticas
scripts/cabecera/rebanar.js              migración única monolito→rebanadas (reutilizable por la skill portable)
.github/workflows/cabecera-*.yml         los tres órganos de GitHub (check · ensamblar · pulso)
.claude/skills/montar-cupula-cabecera/   la skill que monta esta misma cúpula en cualquier repo
.claude/skills/sincronizar-cabecera/     el PRISMA: 5 lentes que leen código-vs-prosa y ofrecen el parche (peldaño SEMÁNTICO sobre el VIGILANTE)
.claude/skills/esquematizador/           descompone cualquier sujeto amorfo en su anatomía completa vía prisma recursivo
.claude/skills/generar-ui-web/           genera la interfaz web de cualquier proyecto con soporte de marca, UX y audiencia
```
