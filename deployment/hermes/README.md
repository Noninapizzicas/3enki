# Hermes en el VPS — el agente trabajador de Enki

> **Qué es esto.** [Hermes](https://github.com/NousResearch/hermes-agent) (NousResearch)
> instalado JUNTO a Enki en el mismo VPS, como **trabajador gobernado**: Enki le
> delega OBJETIVOS (provider `hermes` del ai-gateway) y Hermes los resuelve con su
> arsenal propio — browser, ejecución de código, subagentes, skills — y **memoria
> persistente por proyecto**. La suma, no el orgullo: Enki pone la filosofía y el
> gobierno (interruptor + audit + propiocepción); Hermes pone el músculo.
>
> **Todo en el deploy** (regla de la casa, como OCR4RS): el setup canónico lo
> instala, lo enciende y lo deja verificado. Un solo paso manual honesto queda,
> porque no puede ser de otra forma: el proveedor LLM de Hermes (su key es tuya).

```json
{
  "esquema": "hermes-en-vps-v2",
  "instalacion": {
    "canonica":   "sudo ./deployment/vps-setup.sh [dominio] — Hermes va incluido (opt-out: --sin-hermes)",
    "standalone": "sudo ./deployment/hermes/setup-hermes.sh — idempotente, re-ejecutable",
    "reconciliador": "vps.manifest.js exige hermes-gateway SOLO donde está instalado (VPS sin Hermes sigue verde)"
  },
  "piezas": {
    "servicio":  "hermes-gateway.service — Hermes VIVO (systemd, usuario 'hermes' contenido)",
    "puerta":    "api_server OpenAI-compatible en 127.0.0.1:8642 (key autogenerada, UNA vez)",
    "delegacion":"Enki → Hermes: provider 'hermes' (ai-gateway 2.33.0); interruptor 'hermes-agente' sembrado ON al instalar (instalar es decidir)",
    "ojos":      "Hermes → Enki: bridge MCP del Portal (config.mcp-enki.yaml.example) — OPCIONAL, doble reja"
  },
  "colision_con_enki": "ninguna — no toca 80/443 (Caddy), 3000 (core), 1883/9001 (MQTT); vive en /home/hermes",
  "memoria": "X-Hermes-Session-Key = 'enki:<project_id>' → cada proyecto tiene SU Hermes que recuerda",
  "gobierno": ["interruptor 'hermes-agente' (panel — tu apagado manual se respeta)", "key obligatoria (data/.env)", "audit hermes.invocado → propiocepción"],
  "paso_manual_unico": "sudo -u hermes -i hermes setup  (proveedor LLM de Hermes) + systemctl restart hermes-gateway"
}
```

## Qué hace el deploy por ti (`setup-hermes.sh`, idempotente)

1. **Usuario `hermes`** dedicado — Hermes ejecuta código; vive contenido, fuera de `/opt/enki` y de root.
1b. **Dependencias de sistema como root** (`ripgrep`, `ffmpeg`, `build-essential`) — ANTES del instalador. El usuario `hermes` no tiene sudo (por diseño); si el instalador oficial las metiera él, pediría contraseña que `hermes` no tiene y el deploy se colgaría. Las mete root aquí → el instalador las encuentra y salta el sudo.
2. **Instalador oficial de Nous** (uv, python3.11, node → todo bajo `/home/hermes`). Si el binario ya está, no se repite.
3. **`HERMES_API_KEY`**: nace UNA vez en `/opt/enki/data/.env` — Enki lo carga al arrancar (`index.js` lee `data/.env`), así el provider la encuentra solo; persiste al rsync. Si Hermes ya tenía key propia en su config, **la del humano manda** y `data/.env` se sincroniza a ella.
4. **`api_server`** en `/home/hermes/.hermes/config.yaml` — la puerta local `127.0.0.1:8642`, misma key. **No** se abre en Caddy ni en el firewall (ley de la frontera).
5. **`hermes-gateway`** en systemd, `enable --now` + sonda de vida con la key.
6. **Interruptor `hermes-agente` sembrado ON** — una decisión, una llave: instalar el órgano ES el consentimiento; solo se siembra si el humano no decidió ya (tu apagado manual desde el panel se respeta siempre).

Después del setup, el **reconciliador** (`reconcile.js` + `vps.manifest.js`) mantiene la unit convergida en cada pasada y **exige** `hermes-gateway` activo en su self-check — solo en los VPS donde el órgano está instalado. `--sin-hermes` en el setup lo salta y ese VPS sigue verde.

## El único paso manual (una vez por VPS)

La key del proveedor LLM de Hermes es tuya — el wizard no se puede automatizar:

```bash
sudo -u hermes -i hermes setup      # elige Nous Portal / OpenRouter / Anthropic / ...
sudo systemctl restart hermes-gateway
```

El setup lo canta al final si falta. Sin proveedor LLM, Hermes está vivo pero no piensa: el provider de Enki degrada honesto.

## Verificar

```bash
systemctl status hermes-gateway
KEY="$(sudo grep -m1 '^HERMES_API_KEY=' /opt/enki/data/.env | cut -d= -f2-)"
curl -s -H "Authorization: Bearer $KEY" http://127.0.0.1:8642/v1/models
```

Desde ese momento una conversación de Enki puede elegir el provider `hermes`, y
todo encargo lleva memoria del proyecto (`X-Hermes-Session-Key: enki:<project_id>`).
`priority 90`: el auto-fallback **jamás** cae en Hermes — a él solo se llega a
propósito. Cada delegación emite `hermes.invocado` `{ok, duracion_ms, model,
session_key, modo, error?}` → lo capta la propiocepción.

## (Opcional, después) Los ojos: Hermes → Enki por el Portal

Cuando quieras que Hermes, mientras resuelve, pueda **mirar y operar el mundo de
Enki**: añade el bloque de [`config.mcp-enki.yaml.example`](config.mcp-enki.yaml.example)
a su `config.yaml` (Hermes es cliente MCP; el bridge `mcp/enki-mcp-server.js` le
sirve las tools vía el Portal). **Doble reja**: la allowlist del bloque **y** el
guard del Portal (interruptor `portal-mcp` OFF por defecto, scope, mode, audit).
Con el portal OFF el bloque es inerte — abre el dueño, desde el panel.

## Límites honestos (hoy)

- **90s por delegación**: el `makeRequest` del ai-gateway corta a 90s. Un encargo
  largo de agente puede excederlo — la capa async (`POST /v1/runs` + `run_id` +
  eventos `hermes.encargo.completado/.failed` por el bus) es la pieza futura
  declarada para eso.
- **Si `hermes-gateway` cae**, el provider responde no-disponible y el flujo
  cierra con su `*.failed` canónico — sin fallos silenciosos.
- **RAM**: Hermes con subagentes en paralelo pesa; en VPS pequeños, vigilar junto
  a Enki (`systemctl status hermes-gateway` + panel de métricas).
- **config.yaml con `platforms:` previo sin `api_server`**: el script no arriesga
  un merge YAML a ciegas — canta el bloque a añadir a mano (degradación honesta).
