---
name: enki-operacion-proyecto
description: "Operación de proyectos Enki desde el canal externo: setup de permisos, acceso al repo para hermes, comunicación con el chat del proyecto vía MQTT, y normalización permanente de permisos en el deploy. Cada lección pagada en sesiones anteriores va aquí para no re-aprenderla."
when-to-use: "Cuando un chat de proyecto no puede escribir en el repo o en el deploy (EACCES al crear blueprints/archivos). Cuando hay que enviar un mensaje al chat de un proyecto desde el canal externo. Cuando un proyecto nuevo necesita setup de repo y permisos. Cuando se despliega y los módulos recién copiados tienen permisos incorrectos."
tags: [enki, operacion, permisos, repo, mqtt, proyecto, setup, deploy]
---

# Enki — Operación de Proyectos

> Operaciones que Hermes ejecuta desde el canal externo para que los chats de proyecto trabajen autónomos. Lecciones pagadas en vivo, no teoría.

## Permisos: el problema raíz y su solución permanente

**El problema:** los directorios y archivos de módulos nuevos nacen sin `g+w` (644 archivos, 755 directorios). `hermes` ∈ `www-data` no puede escribir blueprints, temp files, ni editar código.

**Causa:** `rsync` y `chown` del deploy copian los modos exactos del repo, que pueden ser 644/755.

**Solución permanente:** dentro de `deployment/deploy.sh`, paso 3.5 (inline, sin script externo, sin cron):

```bash
# 3.5) Normalizar permisos de módulos (grupo www-data escribe — el chat necesita g+w)
normalizar_permisos() {
  local d="$1"
  find "$d" -type d ! -path "*/node_modules/*" ! -perm -g+w -exec chmod g+w {} + 2>/dev/null || true
  find "$d" -type d ! -path "*/node_modules/*" ! -perm -2000 -exec chmod g+s {} + 2>/dev/null || true
  find "$d" -type f ! -path "*/node_modules/*" ! -perm -g+w -exec chmod g+w {} + 2>/dev/null || true
}
normalizar_permisos "${INSTALL_DIR}/modules"
normalizar_permisos "${REPO_DIR}/modules"
```

Se ejecuta en cada deploy, normaliza repo + deploy. NO usar crons ni scripts externos — Paco prefiere la solución dentro del flujo existente.

## Poner al chat de un proyecto en modo autónomo

Cuando un chat de proyecto está perdido (no sabe dónde escribir, no encuentra el repo):

1. **Crear simlink** si no existe: `sudo -u hermes ln -s /home/admin/3enki /home/hermes/3enki` (necesita que `/home/admin/` tenga `g+x` para el grupo www-data).
2. **Dar permisos de atravesar**: `sudo chmod g+x /home/admin/` si hermes no puede llegar al repo.
3. **Normalizar permisos del módulo** en repo: `sudo chmod -R g+w /home/admin/3enki/modules/<slug>/`
4. **Crear skill de proyecto en la cantera**, no solo en mi arsenal: copiar a `modules/cosecha/cantera/enki/<skill>/SKILL.md`. Si solo está en `~/.hermes/skills/`, el chat del proyecto no la ve.
5. **Avisar al chat por MQTT** (ver abajo).

## Comunicarme con un chat de proyecto desde el canal externo

**NO** puedo escribir en la BD sqlite del proyecto (owner www-data, sin sudo password para Python).

**Vía MQTT** (funciona): publicar en el tópico `chat.message.saved` con paho-mqtt (Python, `localhost:1883`):

```python
import paho.mqtt.client as mqtt, json, time, uuid

payload = {
    "correlation_id": str(uuid.uuid4()),
    "conversation_id": "<conversation_id>",
    "project_id": "<project_id>",
    "user_id": "system",
    "channel": "mqtt",
    "channel_context": {},
    "message_id": str(uuid.uuid4()),
    "user_message": "<texto del mensaje>",
    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
}

c = mqtt.Client(client_id='hermes-msg-'+str(uuid.uuid4())[:8])
c.connect('localhost', 1883, 60)
c.publish("chat.message.saved", json.dumps(payload), qos=1)
c.disconnect()
```

**Recuperar project_id y conversation_id** (BD del proyecto + system-db):

```python
import sqlite3, json

# project_id desde system-db por nombre
system_db = '/opt/enki/data/projects/system/db.sqlite'
c = sqlite3.connect(system_db)
row = c.execute('SELECT id FROM projects WHERE name = ?', ('despacho-de-pan',)).fetchone()
project_id = row[0]

# conversation_id desde la BD del proyecto
proj_db = '/opt/enki/data/projects/<slug>/db/<slug>.sqlite'
c2 = sqlite3.connect(proj_db)
row2 = c2.execute('SELECT DISTINCT conversation_id FROM messages').fetchone()
conversation_id = row2[0]
```

## Git workflow por proyecto (resumen para el chat)

- **Repo**: `~/3enki` (simlink a `/home/admin/3enki/`)
- **Rama**: `proyecto/<slug>`
- **Escribir en**: `~/3enki/modules/<slug>/` — NUNCA en `/opt/enki/`
- **PR por MCP github** (base=main, head=proyecto/<slug>)
- **Merge + deploy**: lo hace Paco (`sudo ./deployment/deploy.sh`)
- **Guardian**: revierte cambios no desplegados cada 15 min → merge + deploy rápido

## Pitfalls (aprendidos en vivo)

- **El chat no ve las skills de mi arsenal**: si creo una skill de setup para un proyecto, copiarla a la cantera (`modules/cosecha/cantera/enki/`). El chat descubre skills por la cantera, no por mi `.hermes/skills/`.
- **Los módulos copiados del deploy al repo heredan 644**: después de `cp -r`, ejecutar `chmod -R g+w` para que hermes pueda editarlos.
- **`sudo` sin password**: Paco (admin) tiene sudo sin password; el cron/hermes no. Mi shell (admin) sí puede sudo. Si intento algo como `sudo -u hermes`, falla porque sudo pide password de admin.
- **Los directorios `.git/refs/heads/proyecto/` pueden ser de hermes**: si el chat ya creó la rama, yo (admin) no puedo tocarla sin sudo. Usar `sudo -u hermes bash -c 'cd /home/admin/3enki && git ...'` para operaciones git que el chat inició.
- **MQTT no necesita mosquitto_pub**: el broker está en localhost:1883, se usa paho-mqtt desde Python. Instalado en el sistema.
- **El chat de Enki no puede escribir handlers en `/opt/enki/data/projects/<slug>/handlers/`** (31-ago-2026, despacho-de-pan): el dir nace `755 www-data:www-data` SIN `g+w`, y hermes ∈ www-data no puede escribir ahí. El chat se bloquea intentando cablear un handler (Freno 1) y lo deja en el dir del UUID equivocado. Fix: `sudo chmod g+w /opt/enki/data/projects/<slug>/handlers/` (y `chown www-data:www-data` si hace falta) → hermes ya escribe. Verificar con `sudo -u hermes touch <dir>/.test`. **OJO**: el chat a veces escribe en `data/projects/<UUID>/handlers/` en vez de `data/projects/<slug>/handlers/` — el dir correcto es el del SLUG (el sistema lee ahí); si el handler quedó en el UUID, hay que moverlo.
