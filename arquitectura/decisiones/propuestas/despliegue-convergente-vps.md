# Despliegue convergente VPS — un solo cerebro, 20 máquinas idénticas

> Estado: **implementado** (rama `claude/vps-lee-claude-md-ljughl`). Perfil de
> producción VPS. NO reemplaza el deployment canónico del sistema (`npm start`
> en un dispositivo, ver `deployment.contract.json`) — es la capa que sirve
> `/shop/<proyecto>` en un Linux con dominio público.

## El problema (la coyuntura)

El despliegue en VPS se construyó a parches. Convivían **dos generaciones enteras**:

| | Gen-1 (`setup-vps.sh` + `deploy.sh` raíz) | Gen-2 (`deployment/vps-setup.sh` + `deployment/deploy.sh`) |
|---|---|---|
| Carpeta | `/srv/event-core` | `/opt/enki` |
| Servicio | `event-core` | `enki` + `enki-frontend` |
| Frontend | estáticos en `/srv/event-core/frontend/build` | servicio node `:3001` |
| Bloque Caddy `/shop/*` | **no** | **sí** |
| Converge Caddy en deploy | **no** | **sí** |

Según con qué receta se instaló cada VPS, quedaba completo o cojo. `pizzepos`
estaba en Gen-1 → sin `/shop/*`, sin `/tienda/*`. Con 2 VPS ya dolía; con 20 es
ingobernable.

**La causa raíz no es un bug: el despliegue era imperativo.** Cada script "hacía
pasos". Cuando se añadía una pieza (el `/shop/*`), se metía en UN script; los VPS
que no corrieran ESE script exacto quedaban atrás.

## El giro — convergencia declarativa (P0 aplicado a la infra)

Dejar de "hacer pasos" y pasar a **declarar el estado deseado** en un solo sitio,
con **un reconciliador idempotente** que hace coincidir la realidad. Todos los
caminos (instalar, `git pull`, reparar) llaman al **mismo** reconciliador. Se
declara el Mandato; el reconciliador lo sostiene.

Tres reglas lo cierran:

1. **El dominio es la ÚNICA variable por-VPS.** Todo lo demás idéntico. El
   Caddyfile y las unidades systemd se *renderizan* de plantillas sustituyendo el
   dominio. `git pull` trae plantilla nueva → el reconciliador re-renderiza con el
   dominio local → converge.
2. **La migración va DENTRO del reconciliador.** Detecta Gen-1 (`/srv/event-core`
   + `event-core.service`) y migra a canónico. En un VPS ya bueno, no-op. →
   pizzepos se cura solo en el próximo deploy.
3. **Verificación ruidosa al final.** ¿existe y es escribible el dir de shop?
   ¿tiene Caddy el `/shop/*`? ¿`enki` activo? ¿`/health` 200? Si algo falla →
   error visible, `exit≠0`. Cero drift silencioso.

## Las piezas

```
deployment/
  vps.manifest.js       ← EL ESTADO DESEADO como dato (dirs, servicios, Caddy, Gen-1, verificación)
  reconcile.js          ← EL CEREBRO idempotente (núcleo puro + capa de efectos)
  systemd/
    enki.service.tmpl           ← plantilla (extraída de vps-setup.sh)
    enki-frontend.service.tmpl  ← plantilla, {{ORIGIN}} = https://<dominio>
  caddy/Caddyfile.vps   ← plantilla (ya existía; trae /shop/*, /tienda/*, /glovo/*)
  vps-setup.sh          ← instalación nueva: bootstrap OS + reconciliador (converge+verifica)
  deploy.sh             ← git pull: rsync + npm/build + reconciliador
deploy.sh, setup-vps.sh (raíz)  ← ALIAS legacy: avisan y redirigen al camino canónico
tests/unit/deployment__reconcile.test.js  ← 19 tests del núcleo puro
```

### Frontera limpia: infra vs app

- **El reconciliador asegura el TERRENO**: dirs + owners, unidades systemd,
  bloques Caddy, `ReadWritePaths`.
- **La app asegura los SYMLINKS de cada tienda**: `project-manager`
  (`_ensureFeatureSymlinks`) los rehace en caliente al activar la feature
  `tienda`. El reconciliador NO toca symlinks.

## El reconciliador (contrato)

```
detectarDominio(arg, caddyfileVivo, env) → dominio | null   // prioridad: arg > Caddyfile > .env
esGen1({existeDirGen1, existeUnitGen1})  → bool
renderCaddyfile(tmpl, dominio, {...})    → texto (sustituye pizzepos.es + .log)
renderPlantilla(tmpl, vars)              → texto ({{VAR}})
difieren(a, b)                           → bool (normalizado)
evaluarChecklist(sondas, manifiesto)     → { ok, fallos[] }

main():                                   // capa de efectos (root)
  dominio ← detectarDominio(...)
  si esGen1(): migrarGen1()               // stop+disable viejo, copia data no-destructiva
  asegurarDirs()                          // idempotente
  render+escribeSiDifiere(systemd)        // daemon-reload solo si cambió
  render+escribeSiDifiere(Caddyfile)      // reload solo si cambió
  reinicia SOLO lo que cambió
  verificar() | exit≠0                    // no-silent-drift
```

Modos: `--dry-run` (muestra el plan, no toca nada), `--domain X` (fuerza),
`--fresh` (1ª instalación: arranca aunque no haya cambios).

## Cómo se usa

```bash
# Ver qué haría en un VPS SIN tocar nada (ideal para pizzepos):
node deployment/reconcile.js --dry-run --domain pizzepos.es

# Deploy normal (converge + verifica; migra Gen-1 solo si aplica):
cd /opt/enki && git pull && sudo ./deployment/deploy.sh

# Instalación nueva:
sudo ./deployment/vps-setup.sh tu-dominio.com

# Reparación a mano:
sudo node deployment/reconcile.js
```

## Trade-off vivo

- El reconciliador corre **desde el repo** (donde haces `git pull`), no desde
  `/opt/enki` — el `rsync` excluye `deployment/` para mantener `/opt/enki` lean.
  Resuelve sus plantillas por `__dirname` y escribe rutas absolutas del manifiesto.
- **Modo IP (sin dominio)** no aplica el perfil de tiendas (necesita HTTPS +
  dominio). Es un fallback de desarrollo; `/shop/*` es producción-con-dominio.
- `vps-setup.sh` aún tiene su generación inline de systemd/Caddy además del
  reconciliador (mismas plantillas). El reconciliador es la autoridad y la pasada
  final verifica; colapsar la generación inline de `vps-setup.sh` es un follow-up
  limpio cuando se pueda probar en un VPS real.

## Superficies públicas: namespace global `/<public_ns>/` (un botón)

Las páginas públicas de los proyectos viven bajo UN prefijo global del VPS:

```
/<ns>/shop/<proyecto>      ← feature `tienda`   → storage/tienda/bundle  → /opt/enki/public/<ns>/shop/<slug>
/<ns>/oraculo/<proyecto>   ← feature `oraculo`  → storage/oraculo/bundle → /opt/enki/public/<ns>/oraculo/<slug>
/<ns>/<superficie>/<proy>  ← feature nueva      → storage/<sf>/bundle    → /opt/enki/public/<ns>/<sf>/<slug>
```

**El botón único: `config.json` → `web.public_ns`** (por defecto `"a"`). Cambiarlo
a `"es"` → todas las URLs pasan a `/es/…`. **Una edición + deploy.** Un solo lector
lo sirve a todos: `lib/public-ns.js` (`env PUBLIC_NS > config.web.public_ns > 'a'`).

**Por qué global, no por proyecto:** el prefijo lo sirve Caddy, y Caddy es uno por
VPS → **un solo bloque `handle_path /<ns>/*`** para todo. Si cada proyecto tuviera
su prefijo, haría falta un bloque por proyecto (add = deploy). Con el namespace
global, la identidad de cada proyecto va DEBAJO (la subcarpeta), y **añadir un
proyecto = soltar su symlink** bajo `/opt/enki/public/<ns>/…`; el Caddyfile no se
toca nunca.

Las tres caras leen el mismo botón:
- **Caddy** (reconciliador): `renderBloqueNamespace(ns)` genera el único bloque y
  lo inyecta en el marcador `# @@NAMESPACE@@`; `main()` asegura `/opt/enki/public/<ns>`.
- **project-manager**: sustituye `{{public_ns}}` en los blueprints (symlink target,
  `public_url`, `start_url`) por el valor del botón, junto a `{{slug}}`.
- **la app** (`carta-digital` base_href/alojada_url, `whatsapp-bot` pwa_url por
  defecto): construyen la URL con `publicNs()`.

Feature por superficie (`blueprints/project-types/<feature>.json`): declara
`storage/<feature>/bundle`, sus `initialFiles`, y el `symlink` a
`/opt/enki/public/{{public_ns}}/<superficie>/{{slug}}`. `project-manager` los
crea + auto-cura al activar la feature.

Frontera intacta: reconciliador = el **bloque Caddy + el dir del namespace**;
`project-manager` = los **symlinks** por proyecto. `/tienda/*` (backend de pedidos
→ tienda-api) sigue estático y separado — no es una superficie estática.

Decisión tomada: **namespace GLOBAL configurable** (`/a/`, `/es/`, …), un bloque,
soltar carpeta. Se descartó el registro con bloque-por-superficie (add = deploy) y
el catch-all con fallback al frontend (cambia el enrutado, riesgo de colisión).

## Follow-ups

- Colapsar la generación inline de `vps-setup.sh` en el reconciliador (una sola fuente en fresh install).
- (Opcional) `fleet.sh hosts.txt` → `ssh $host 'cd /opt/enki && git pull && ./deployment/deploy.sh'` en bucle, para operar las 20 desde un sitio.
- Migrar el `CONVERSATION_EXPORT_TOKEN=nonina` hardcoded de la unidad a env/credential-manager.
