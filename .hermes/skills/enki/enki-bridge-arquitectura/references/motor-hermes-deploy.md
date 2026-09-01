# motor-hermes deployment & verification reference

## Full activation checklist

1. **Build release binary**
   ```bash
   cd ~/3enki/enki-sense && cargo build -p motor-hermes --release
   ```

2. **Install binary**
   ```bash
   sudo cp ~/3enki/enki-sense/target/release/motor-hermes /opt/enki/enki-sense/target/release/motor-hermes
   ```

3. **Service systemd**
   ```bash
   sudo cp /tmp/motor-hermes.service /etc/systemd/system/motor-hermes.service
   sudo systemctl daemon-reload && sudo systemctl enable motor-hermes && sudo systemctl start motor-hermes
   ```

4. **Health check**
   ```bash
   curl -s http://localhost:8130/health
   ```

5. **Test real tool**
   ```bash
   curl -s http://localhost:8130/execute \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"tool_name":"project.list","args":{}}'
   ```

6. **Configurar Hermes** (en `/etc/systemd/system/hermes-gateway.service`):
   ```
   Environment=ENKI_BRIDGE_URL=http://localhost:8130
   Environment=ENKI_BRIDGE_TOKEN=<token>
   ```

## Timeouts por tool

| Tool | Timeout |
|------|---------|
| Default | 15s |
| `code.orquestar` | 65s |
| `invoke_agent` | 300s |

## Systemd service template

```
[Unit]
Description=motor-hermes — Bridge Hermes-Enki (Rust)
After=network.target enki.service
PartOf=enki.service

[Service]
Type=simple
ExecStart=/opt/enki/enki-sense/target/release/motor-hermes
WorkingDirectory=/opt/enki
Environment=MOTOR_HERMES_BROKER=127.0.0.1
Environment=MOTOR_HERMES_PORT=8130
Environment=RUST_LOG=info
Environment=ENKI_BRIDGE_TOKEN=<token>
Restart=always
RestartSec=3
User=admin
Group=admin
```

## git pull conflict resolution

When `git pull origin main` fails because of untracked files created by the chat (owner `hermes`):

```bash
sudo rm -rf modules/<conflicting-module>/ tests/unit/<conflicting-test>.js
cd ~/3enki && git pull origin main
```

## Enki restart & verification

```bash
sudo systemctl restart enki
sleep 5
curl -s http://localhost:3000/modules/hermes-bridge/health
# Expected: {"ok":true,"tools":447,...}
```

## Token location & format

- File: `data/.hermes-bridge-token` (en `/opt/enki/` o `~/3enki/`)
- Format: 64 hex chars (32 bytes)
- Owner: `www-data` en deploy, `admin` en repo
- Permissions: 600
