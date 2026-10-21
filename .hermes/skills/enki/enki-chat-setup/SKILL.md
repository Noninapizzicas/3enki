---
name: enki-chat-setup
description: >-
  Setup de acceso al repo y permisos de disco para que un chat de proyecto Enki
  (usuario hermes) pueda escribir código autónomamente. Arregla la traversía a
  /home/admin/3enki, los permisos g+w en modules/ y storage/, y el simlink
  ~/3enki en el home de hermes.
when-to-use: >-
  Cuando un chat de proyecto reporta EACCES, "Permission denied", "No such file
  or directory" al escribir en ~/3enki, o no puede crear blueprints/modules.
  También como checklist inicial tras crear un proyecto nuevo.
tags: [enki, setup, permisos, repo, hermes, disco]
---

# Enki — Setup de acceso para chat de proyecto

## Contexto

El usuario `hermes` (el chat) tiene home en `/home/hermes/`, pero el repo git de Enki vive en `/home/admin/3enki/`. Además, durante F4-F7 el chat escribe en `/opt/enki/` (deploy) donde los directorios nuevos pueden nacer sin `g+w`.

## Diagnóstico rápido

```bash
# ¿El chat ve el repo?
sudo -u hermes ls ~/3enki/modules/ 2>&1

# ¿Puede escribir en el repo?
sudo -u hermes touch /home/admin/3enki/modules/.test-write 2>&1

# ¿El directorio del módulo es escribible?
stat -c '%a %U:%G' /opt/enki/modules/<slug>/

# ¿La BD del proyecto es escribible?
stat -c '%a' /opt/enki/data/projects/<slug>/db/*.sqlite

# ¿El storage del proyecto es escribible?
ls -la /opt/enki/data/projects/<slug>/storage/esquemas/
```

## Paso 1 — Acceso al repo

El home de `hermes` es `/home/hermes/`, el repo es `/home/admin/3enki/`. Problema: `/home/admin/` solo deja pasar a `admin`.

```bash
# 1. Permiso de traversía
sudo chmod g+x /home/admin/

# 2. Simlink en el home de hermes
sudo ln -s /home/admin/3enki /home/hermes/3enki

# 3. Verificar
sudo -u hermes ls ~/3enki/modules/ | head -5
```

Sin estos dos pasos, el chat ve `~/3enki: No such file or directory`.

## Paso 2 — Permisos de disco en módulos

Los módulos nuevos pueden nacer sin `g+w` (modo `drwxr-sr-x` en vez de `drwxrwsr-x`):

```bash
sudo chmod g+w /opt/enki/modules/<slug>/
```

Los módulos sanos (`masa/`, `lotes/`) tienen `drwxrwsr-x 2775 www-data:www-data`.

## Paso 3 — Permisos en storage del proyecto

```bash
sudo chmod g+w /opt/enki/data/projects/<slug>/storage/esquemas/
sudo chmod g+w /opt/enki/data/projects/<slug>/db/*.sqlite
```

## Paso 4 — Configurar git para el chat

El chat necesita identity de git antes del primer commit:

```bash
sudo -u hermes git config user.name "<slug>"
sudo -u hermes git config user.email "<slug>@enki"
```

## Pitfalls

- **El simlink apunta pero el repo no existe** — solo pasa si el repo está en otra máquina. Verificar con `ls -la /home/hermes/3enki/` que el link funciona.
- **`sudo chmod g+w` falla** si no tienes password de sudo. Pedir a Paco.
- **No confundir `~/3enki` de hermes con el home de admin**. Son rutas distintas; el simlink es necesario siempre.
- **Los directorios creados por el chat en `/opt/enki/` salen `600`** (sandbox por defecto). Si www-data los necesita leer (frontend, Guardian), hay que re-permisionar: `sudo chmod 644 <archivos>`.
