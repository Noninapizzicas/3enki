#!/usr/bin/env python3
"""
GUARDIAN DEL REPO — versionado determinista del trabajo del chat.

Cada vez que el chat (Hermes interno) persiste trabajo en prod (/opt/enki),
este agente lo detecta y hace TODO lo necesario para que llegue al repo
(~/3enki) y el deploy NO lo borre: copiar → rama → commit → push → PR → merge.

REGLAS (deterministas, sin LLM):
- SCAN: módulos en /opt/enki/modules/ vs ~/3enki/modules/ (excluye dot-dirs y _shared)
  + config.json + tests/unit/ + frontend/src/lib/modules/ (prod vs repo, por CONTENIDO).
  Si difieren → el chat tocó algo → versionar.
- DIRECCION: prod → repo (el chat produce en prod; el repo es el archivo).
- Solo se mergea SI el push y el PR salen bien. Si algo falla → reporta, no fuerza.
- Sin cambios → salida vacía (silencio, patrón watchdog).

Uso: guardian-repo.py [--dry-run]   (--dry-run: solo reporta, no toca nada)
"""
import json
import os
import re
import subprocess
import sys
import urllib.request
from datetime import datetime
from pathlib import Path

PROD_MODULES = Path("/opt/enki/modules")
REPO_MODULES = Path("/home/admin/3enki/modules")
PROD_CONFIG = Path("/opt/enki/config.json")
REPO_CONFIG = Path("/home/admin/3enki/config.json")
PROD_TESTS = Path("/opt/enki/tests/unit")
REPO_TESTS = Path("/home/admin/3enki/tests/unit")
PROD_FRONT_MODULES = Path("/opt/enki/frontend/src/lib/modules")
REPO_FRONT_MODULES = Path("/home/admin/3enki/frontend/src/lib/modules")
REPO_DIR = Path("/home/admin/3enki")
GITHUB_API = "https://api.github.com/repos/Noninapizzicas/3enki"
IGNORE = {"_shared"}  # infra, se versiona por el flujo normal

DRY_RUN = "--dry-run" in sys.argv


def sh(*args, cwd=None, check=True):
    r = subprocess.run(args, cwd=cwd or str(REPO_DIR), capture_output=True, text=True)
    if check and r.returncode != 0:
        raise RuntimeError(f"cmd {' '.join(args)} rc={r.returncode}: {r.stderr[:300]}")
    return r.stdout.strip()


def github_token():
    # token embebido en el remote del repo
    remote = sh("git", "remote", "get-url", "origin", check=False)
    m = re.search(r"https://[^:@]+:(ghp_[^@]+)@", remote)
    if not m:
        env = os.environ.get("GITHUB_TOKEN") or ""
        return env
    return m.group(1)


def dirs_differ(a: Path, b: Path):
    fa = {p.relative_to(a): p for p in a.rglob("*") if p.is_file()}
    fb = {p.relative_to(b): p for p in b.rglob("*") if p.is_file()}
    if set(fa) != set(fb):
        return True
    for rel, pa in fa.items():
        if pa.read_bytes() != fb[rel].read_bytes():
            return True
    return False


def scan_dir(prod_dir: Path, repo_dir: Path, prefix: str):
    """Devuelve {nombre: 'NUEVO'|'MODIFICADO'} para un dir que difiere prod vs repo.
    Compara por CONTENIDO (bytes), no por mtime — la verdad está en prod."""
    dirty = {}
    if not prod_dir.exists():
        return dirty
    for d in sorted(prod_dir.iterdir()):
        if not d.is_dir():
            continue
        name = d.name
        if name.startswith("."):
            continue
        repo_d = repo_dir / name
        if not repo_d.exists():
            if any(d.iterdir()):
                dirty[f"{prefix}{name}"] = "NUEVO"
            continue
        if dirs_differ(d, repo_d):
            dirty[f"{prefix}{name}"] = "MODIFICADO"
    return dirty


def modules_dirty():
    """Devuelve {nombre: 'NUEVO'|'MODIFICADO'} para módulos en prod que difieren del repo."""
    dirty = {}
    if not PROD_MODULES.exists():
        return dirty
    for d in sorted(PROD_MODULES.iterdir()):
        if not d.is_dir():
            continue
        name = d.name
        if name in IGNORE or name.startswith("."):
            continue  # dot-dirs = fósiles v1, no van al repo
        repo_dir = REPO_MODULES / name
        if not repo_dir.exists():
            if any(d.iterdir()):
                dirty[name] = "NUEVO"
            continue
        if dirs_differ(d, repo_dir):
            dirty[name] = "MODIFICADO"
    return dirty


def config_dirty():
    return PROD_CONFIG.exists() and REPO_CONFIG.exists() and PROD_CONFIG.read_bytes() != REPO_CONFIG.read_bytes()


def main():
    dirty = modules_dirty()
    cfg = config_dirty()
    # Caso límite (lección 2026-08-15): el chat también edita tests/ y el frontend.
    # Escanearlos evita que un deploy revierta fixes fuera de modules/.
    tests = scan_dir(PROD_TESTS, REPO_TESTS, "tests/unit/")
    front = scan_dir(PROD_FRONT_MODULES, REPO_FRONT_MODULES, "frontend/src/lib/modules/")
    if not dirty and not cfg and not tests and not front:
        return  # silencio: nada que versionar

    lines = [f"[guardian] {datetime.utcnow().strftime('%H:%M:%S')} — trabajo del chat detectado:"]
    for name, tipo in dirty.items():
        lines.append(f"  • modules/{name}: {tipo}")
    if cfg:
        lines.append("  • config.json: MODIFICADO")
    for name, tipo in tests.items():
        lines.append(f"  • {name}: {tipo}")
    for name, tipo in front.items():
        lines.append(f"  • {name}: {tipo}")

    if DRY_RUN:
        lines.append("  [dry-run] NO se tocó nada")
        print("\n".join(lines))
        return

    # 1. copiar prod → repo
    for name, _ in dirty.items():
        src, dst = PROD_MODULES / name, REPO_MODULES / name
        sh("rm", "-rf", str(dst))
        sh("cp", "-r", str(src), str(dst))
    if cfg:
        sh("cp", str(PROD_CONFIG), str(REPO_CONFIG))
    for name, _ in tests.items():
        rel = name.removeprefix("tests/unit/")
        src, dst = PROD_TESTS / rel, REPO_TESTS / rel
        sh("rm", "-rf", str(dst))
        sh("cp", "-r", str(src), str(dst))
    for name, _ in front.items():
        rel = name.removeprefix("frontend/src/lib/modules/")
        src, dst = PROD_FRONT_MODULES / rel, REPO_FRONT_MODULES / rel
        sh("rm", "-rf", str(dst))
        sh("cp", "-r", str(src), str(dst))

    # 2. rama + commit + push
    stamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    branch = f"guardian/auto-{stamp}"
    sh("git", "checkout", "-b", branch)
    sh("git", "add", "-A")
    mods = ", ".join(f"modules/{n}" for n in dirty) + (", config.json" if cfg else "")
    if tests:
        mods += (", " if mods else "") + ", ".join(tests)
    if front:
        mods += (", " if mods else "") + ", ".join(front)
    sh("git", "commit", "-m", f"guardian: versionado automático del trabajo del chat ({mods})")
    sh("git", "push", "-u", "origin", branch)

    # 3. PR + merge (API GitHub con token)
    token = github_token()
    if not token:
        lines.append("  ⚠️ SIN TOKEN: push hecho, PR pendiente (merge manual)")
        print("\n".join(lines))
        return
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    body = {
        "title": f"guardian: trabajo del chat versionado ({stamp})",
        "head": branch,
        "base": "main",
        "body": "Versionado automático del Guardian del Repo:\n" + "\n".join(f"- {l.strip()}" for l in lines[1:] if "•" in l),
    }
    req = urllib.request.Request(
        f"{GITHUB_API}/pulls",
        data=json.dumps(body).encode(),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        pr = json.loads(resp.read())
    pr_num = pr["number"]
    lines.append(f"  PR #{pr_num} creado")

    req = urllib.request.Request(
        f"{GITHUB_API}/pulls/{pr_num}/merge",
        data=json.dumps({"merge_method": "squash", "commit_title": f"guardian: {mods} (#{pr_num})"}).encode(),
        headers=headers,
        method="PUT",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            mr = json.loads(resp.read())
        lines.append(f"  ✅ MERGEADO ({mr.get('sha', '')[:8]})")
    except urllib.error.HTTPError as e:
        lines.append(f"  ⚠️ merge falló ({e.code}): revisar PR #{pr_num}")

    # 4. volver a main limpio
    sh("git", "checkout", "main")
    sh("git", "pull", "origin", "main")
    sh("git", "branch", "-D", branch, check=False)
    sh("git", "push", "origin", "--delete", branch, check=False)

    lines.append("  ✅ repo por delante de prod — el deploy no borrará nada")
    print("\n".join(lines))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"[guardian] ERROR: {e}")
        sys.exit(1)
