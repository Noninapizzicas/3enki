# Hermes en el VPS — el agente trabajador de Enki

> **Qué es esto.** [Hermes](https://github.com/NousResearch/hermes-agent) (NousResearch)
> instalado JUNTO a Enki en el mismo VPS, como **trabajador gobernado**: Enki le
> delega OBJETIVOS (provider `hermes` del ai-gateway) y Hermes los resuelve con su
> arsenal propio — browser, ejecución de código, subagentes, skills — y **memoria
> persistente por proyecto**. La suma, no el orgullo: Enki pone la filosofía y el
> gobierno (interruptor + audit + propiocepción); Hermes pone el músculo.

```json
{
  "esquema": "hermes-en-vps-v1",
  "piezas": {
    "servicio":  "hermes-gateway.service — Hermes VIVO (systemd, usuario 'hermes')",
    "puerta":    "api_server OpenAI-compatible en 127.0.0.1:8642 (config.api-server.yaml.example)",
    "delegacion":"Enki → Hermes: provider 'hermes' (ai-gateway 2.33.0), interruptor 'hermes-agente' OFF por defecto",
    "ojos":      "Hermes → Enki: bridge MCP del Portal (config.mcp-enki.yaml.example) — OPCIONAL, doble reja"
  },
  "colision_con_enki": "ninguna — no toca 80/443 (Caddy), 3000 (core), 1883/9001 (MQTT); vive en /home/hermes",
  "memoria": "X-Hermes-Session-Key = 'enki:<project_id>' → cada proyecto tiene SU Hermes que recuerda",
  "gobierno": ["interruptor 'hermes-agente' (panel, OFF)", "key obligatoria", "audit hermes.invocado → propiocepción"]
}
```

## 1. Instalar Hermes (una vez por VPS)

```bash
# Usuario dedicado: Hermes ejecuta código — que viva contenido, fuera de /opt/enki y de root
sudo adduser --disabled-password --gecos "" hermes
sudo su - hermes

# Instalador oficial de Nous (trae uv, python3.11, node, ripgrep, ffmpeg → todo bajo ~/.hermes y ~/.local)
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
source ~/.bashrc

# Wizard: elige proveedor LLM (Nous Portal / OpenRouter / Anthropic / ...) + su API key
hermes setup
```

> Auditoría del `curl | bash` si se quiere: `curl -fsSL .../install.sh -o install.sh && less install.sh && bash install.sh`.

## 2. Encender la puerta local (api_server)

Añade el bloque de [`config.api-server.yaml.example`](config.api-server.yaml.example)
a `/home/hermes/.hermes/config.yaml`. La `key` es **obligatoria** (el server no
arranca sin ella): `openssl rand -hex 32`. Queda en `127.0.0.1:8642` — **no**
abrir en Caddy ni en el firewall.

## 3. Servicio systemd (Hermes vivo, sobrevive reinicios)

```bash
# como root, desde el repo de Enki en el VPS (/opt/enki)
cp deployment/hermes/hermes-gateway.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now hermes-gateway

# sonda de vida (con la key del paso 2)
curl -s -H "Authorization: Bearer <API_SERVER_KEY>" http://127.0.0.1:8642/v1/models
```

## 4. Presentarle Hermes a Enki (la delegación)

1. **Credencial**: la MISMA key del paso 2, en el credential-manager de Enki como
   provider `hermes` (o env `HERMES_API_KEY` del proceso de Enki).
2. **Interruptor**: panel de interruptores → grupo `sistema` → **`Hermes (agente
   trabajador)`** → ON. Nace OFF: delegar en un agente autónomo es decisión del dueño.
3. Desde ese momento el provider `hermes` está vivo: una conversación puede
   elegirlo explícitamente, y todo encargo lleva memoria del proyecto
   (`X-Hermes-Session-Key: enki:<project_id>`). `priority 90`: el auto-fallback
   **jamás** cae en Hermes — a Hermes solo se llega a propósito.

Cada delegación emite `hermes.invocado` `{ok, duracion_ms, model, session_key,
modo, error?}` → lo capta la propiocepción. Ninguna delegación es invisible.

## 5. (Opcional, después) Los ojos: Hermes → Enki por el Portal

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
- **Salud**: si `hermes-gateway` está caído, el provider responde no-disponible y
  el flujo cierra con su `*.failed` canónico — sin fallos silenciosos.
- **RAM**: Hermes con subagentes en paralelo pesa; en VPS pequeños, vigilar junto
  a Enki (`systemctl status hermes-gateway` + panel de métricas).
