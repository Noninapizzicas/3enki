# `tarifas` — pseudocódigo (asignación carta↔canal; nada más)

> **Naturaleza:** módulo JS (clase). D2: **solo** asigna `canal → carta_id`. NO precios, NO clonado
> (la carta de cada canal la **produce** `carta-manager` con operaciones de LLM). Saneado: bajo
> `/pizzepos`, multi-tenant.

## Rol y estado

```
ROL: asignación carta↔canal del proyecto. resolverCarta(canal) es la pieza que composers y comandero usan.
NO HACE: precios · clonar/sincronizar cartas (eso es carta-manager, D2).

CLASS TarifasModule extends Module:
  state: { cfgPorProyecto: Map<project_id, { general: carta_id, canales: Map<canal, carta_id> }> }
  estado_persistente: /pizzepos/tarifas.json        # SANEADO: antes /storage/config/tarifas.json (fuera del vertical)
```

## Operaciones

```
▸ resolverCarta(input):     # { project_id, canal }  → carta_id efectiva del canal
    cfg ← cfgPorProyecto.get(project_id)
    return cfg?.canales.get(canal) ?? cfg?.general ?? null

▸ setGeneral(input):        # { project_id, carta_id }   → cfg.general = carta_id ; persist ; snapshot()
▸ setCanal(input):          # { project_id, canal, carta_id }  → cfg.canales[canal] = carta_id ; persist ; snapshot()
▸ snapshot(input):          # publish('tarifas.config.actualizada', { project_id, config: cfg, tipo:'snapshot' })

# La carta de cada canal la PRODUCE carta-manager (clonar + manipular en NL, D2). tarifas solo APUNTA.
```

## Eventos · edge · encaje

```
PUBLICA: tarifas.config.actualizada      ESCUCHA: project.activated/deactivated, tarifas.config.solicitada
edge: canal sin asignación → cae a general ; sin general → null (el front usa la carta por defecto o error controlado)
encaje: resolverCarta lo usan composers (al cargar la carta del canal) y comandero. 
        Frontera: PRODUCE carta-manager / ASIGNA tarifas.
aterrizaje vs v3.1.1: misma asignación, pero (1) ruta bajo /pizzepos per-project (sale de /storage/config);
        (2) el clonado/sync de cartas de canal sale de aquí (agentes tarifas-creator/sync) → carta-manager (ops LLM, D2).
```
