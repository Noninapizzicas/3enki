# Prueba real del CIMIENTO v3 en prod (proyecto "c") — cronología y diagnóstico

## La prueba que demostró el JEFE (13:50-13:52 UTC, 2026-08-06)

Invocación externa por MQTT (envelope canónico, `source.core_id: 'hermes-cli'`):

```
13:50:46  event_flow:receive:agent.execute.request      ← el bus lo aceptó (outcome success)
13:50:46  event_flow:publish:agent.execute.progress     ← bitácora abierta (started)
13:52:16  event_flow:publish:agent.execute.failed       ← a los 90s, el JEFE dictaminó
```

El agente `escribir-skills` ejecutó su bucle LLM (281s) y terminó — igual que las 22 veces
anteriores que daban "success". Esta vez el JEFE verificó el entregable
`cosecha/cantera/enki/planes-y-tiers/SKILL.md` → NO existe → `agent.execute.failed` con
`ENTREGABLE_NO_VERIFICADO` y el detalle de cada regla.

Evidencia sellada (la bitácora es la fuente de verdad):

```json
// /opt/enki/data/projects/c/storage/agentes/bitacoras/<request_id>.json
{
  "estado": "fallida",
  "agent_name": "escribir-skills",
  "veredicto": {
    "verificado": false,
    "path": "cosecha/cantera/enki/planes-y-tiers/SKILL.md",
    "reglas": [
      { "regla": "existe", "ok": false, "detalle": "NO existe .../SKILL.md" },
      { "regla": "contenido_min", "ok": false, "detalle": "solo 0 chars (min 100)" }
    ]
  },
  "pasos": ["started", "final"]
}
```

## Comandos de diagnóstico (reutilizables)

```bash
# ¿Llegó mi evento? (el bus lo registra como receive)
grep "agent.execute" /opt/enki/data/logs/current.jsonl | grep -oE '"event_type":"[^"]+"|"action":"[^"]+"' | tail

# La bitácora sellada (la evidencia del JEFE)
ls /opt/enki/data/projects/c/storage/agentes/bitacoras/
python3 -c "import json;d=json.load(open('/opt/enki/data/projects/c/storage/agentes/bitacoras/<rid>.json'));print(d['estado'], d.get('veredicto'))"

# El error real de una ejecución (columna error — ej. HTTP 402)
sqlite3 /opt/enki/data/projects/c/db/c.sqlite "SELECT agent_name, status, error FROM agent_executions ORDER BY rowid DESC LIMIT 3;"

# ¿El sistema está procesando AHORA? (NO solo llm.complete — también productor.*, fs.*)
tail -20 /opt/enki/data/logs/current.jsonl | grep -oE '"event_type":"[^"]+"' | sort | uniq -c | sort -rn
```

## Los dos fallos de diagnóstico que casi engañan

1. **"El chat no responde" → falso**: el grep de `llm.complete` daba vacío pero el sistema
   trabajaba (`productor.validar`, `fs.read` a borbotones = el agente ejecutando tools).
   Conclusión: el chat SÍ procesaba "Fase4". Ver el log completo antes de declarar colgado.

2. **402 ≠ fallo del cimiento**: `agent_executions.error` mostró
   `HTTP 402 Insufficient Balance` del proveedor `deepseek-anthropic` (saldo agotado).
   El agente ni pudo llamar al LLM; el chat tradujo a "Algo se rompió por mi parte".
   Fix: recargar saldo — no tocar el framework.

## El hallazgo que cerró la puerta legacy

`grep -c invoke_agent /opt/enki/data/logs/current.jsonl` → **42 invocaciones en un día**:
el chat de "c" invoca agentes por `invoke_agent` (legacy), que escapaba al cimiento.
La ejecución de las 13:58 ("construye 3 módulos") por legacy construyó 1 de 3
(`gestor-de-suscriptores` existe en /opt/enki/modules/; perfil/recolector/normalizador no)
y nadie lo verificó. El chat reportaba "no dejó nada aplicado" — falso, su fs está
scopeado al storage y no ve modules/. Cierre en el PR #142: el JEFE verifica también
en el branch legacy de `onLlmCompleteResponse`.
