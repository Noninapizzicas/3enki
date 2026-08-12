---
name: enki-rebanadas
description: >-
  Workflow para tocar código de Enki: cargar las rebanadas (cúpula de contexto)
  de arquitectura/cabecera/ antes de editar, usar rama propia hermes/,
  regenerar CLAUDE.md con doc-sync.js, y nunca tocar main ni /opt/enki.
when-to-use: >-
  Cuando el usuario menciona "enki", "3enki", "módulo", "código de enki",
  o cualquier módulo del sistema. También cuando voy a ejecutar comandos
  dentro de ~/3enki/.
tags: [enki, rebanadas, workflow, cabecera, contexto]
---
# Enki Rebanadas — Workflow

> Workflow para tocar código de Enki respetando la cúpula de contexto
> y la rama propia.

## Pasos

### 1. Cargar el orden de las rebanadas
Leer `_orden.json` para saber qué rebanadas existen y en qué orden se ensamblan.
- `3enki/arquitectura/cabecera/_orden.json`

### 2. Cargar rebanadas relevantes
Lee las rebanadas del dominio que toque el trabajo. Siempre cargar al menos:
- `_persona.md` — la persona técnica (cómo responder, P0, criterio de despliegue)
- `_mandato.md` — los mandatos: leer-la-rebanada, rebanada-con-el-pr, rebanada-nueva
- La(s) rebanada(s) del subsistema que se va a tocar
- `core/nucleo.md` — el núcleo del sistema

**⚠️ Las rebanadas son la FUENTE DE VERDAD.** `CLAUDE.md` y `CLAUDE.full.md` son artefactos generados por `doc-sync.js`. NO edites CLAUDE.md directamente — edita la rebanada y ejecuta doc-sync.

### 3. Crear rama propia
Siempre crear una rama nueva desde `main` con prefijo `hermes/`:
```bash
git checkout main
git pull origin main
git checkout -b hermes/<feature-breve>
```
Nunca tocar código directamente en main. Todo pasa por rama → commit → push → PR → merge(squash).

### 4. Si editas rebanadas, regenerar artefactos
Después de modificar cualquier archivo en `arquitectura/cabecera/`:
```bash
cd ~/3enki && node scripts/cabecera/doc-sync.js --ensamblar
```
Regenera `CLAUDE.md` y `CLAUDE.full.md`. Los marcadores `{{version:...}}`, `{{tests:...}}`, `{{count:...}}` se resuelven automáticamente.

### 5. Verificar y commit
```bash
cd ~/3enki && node scripts/cabecera/doc-sync.js --check
git add -A
git commit -m "hermes: descripción del cambio"
git push origin hermes/<feature-breve>
```

### 6. PR y merge
Crear PR contra main (gh CLI o GitHub MCP). Merge con squash.

### Checklist: ¿necesito tocar deployment/?

La infra del VPS tiene UN SOLO CEREBRO: `deployment/vps.manifest.js` (estado deseado como DATO) + `deployment/reconcile.js` (reconciliador idempotente) + plantillas `deployment/systemd/*.tmpl`. Ambos scripts lo invocan: `deploy.sh` (actualización) y `vps-setup.sh` (instalación nueva, `--fresh`).

| Si tu cambio... | Dónde va |
|---|---|
| Añade/cambia un servicio systemd del core | `vps.manifest.js` + plantilla en `deployment/systemd/*.tmpl` (el reconciliador renderiza y escribe solo si difiere) |
| Cambia env del core (`Environment=`) o `ReadWritePaths` | la plantilla `deployment/systemd/enki.service.tmpl` |
| Añade dirs/owners o bloque Caddy | `vps.manifest.js` (marca `@@NAMESPACE@@` en el Caddyfile) |
| Añade un motor Rust con build propio (enki-sense) | bloque en `vps-setup.sh` (build + restart del motor) |
| Añade contenedor Docker | `vps-setup.sh` (sección `--docker` / ejecutor) |
| Nueva dependencia npm | nada — `deploy.sh` reinstala si package.json cambió |
| Solo código de módulos/frontend | nada — el rsync lo copia |

⚠️ El rsync excluye `deployment/` del copiado a `/opt/enki`: los cambios de deployment se EJECUTAN desde el repo en el VPS, no desde el deploy.

## Workflow completo

### Branch → código → commit
```bash
cd ~/3enki
git checkout main
git pull origin main
git checkout -b hermes/<feature-breve>
# ... hacer cambios, editar rebanadas, regenerar doc-sync ...
node scripts/cabecera/doc-sync.js --check        # verificar marcadores
git add -A
git commit -m "hermes: <descripción del cambio>"
git push origin hermes/<feature-breve>
```

### PR y merge (por GitHub MCP)
Usar las herramientas MCP de GitHub (no `gh` CLI — no está autenticado):
1. `mcp__github__create_pull_request` con base=main, head=hermes/<feature>
2. `mcp__github__merge_pull_request` con merge_method='squash'

### Post-merge
Deploy de ACTUALIZACIÓN en el VPS: `cd ~/3enki && git pull origin main && sudo ./deployment/deploy.sh` (convergente: rsync + reconcile.js, detecta el dominio solo). `vps-setup.sh <dominio>` es para instalación NUEVA (provisioning completo: Node, Caddy, motores Rust, servicios).

⚠️ `deploy.sh` NO reinicia el core si la unidad systemd no cambió (reconcile solo reinicia lo que difiere) — tras un deploy que toca módulos: `sudo systemctl restart enki` y verifica `systemctl show enki -p ActiveEnterTimestamp --value` (timestamp NUEVO). `vps-setup.sh` SÍ reinicia todo (enki, frontend, caddy, dashboard).

⚠️ **Si mis cambios tocan `deployment/` (manifiesto, plantillas, scripts), los añado YO en el mismo PR.** No solo aviso — edito la pieza como parte del cambio.

## Pitfalls
- No push directo a main — usa rama `hermes/` siempre
- No tocar `/opt/enki` — ese es el deploy, no el repo
- Si el trabajo toca un subsistema, leer su rebanada ANTES de escribir código (mandato "leer-la-rebanada")
- Las rebanadas tienen frontmatter con campo `verificado:` — actualízalo cuando toques sus fuentes
- `doc-sync.js` se ejecuta desde la RAÍZ del repo (cd ~/3enki), no desde otra ruta

## Verificación
```bash
cd ~/3enki && node scripts/cabecera/doc-sync.js --check
git log --oneline -3
```
