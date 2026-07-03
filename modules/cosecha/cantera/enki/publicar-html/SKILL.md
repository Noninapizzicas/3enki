---
name: publicar-html
description: Cuando el usuario quiere PUBLICAR un HTML en Enki y obtener una URL pública — "publica esto", "sube esta página", "hazme una web con esto", "dame un enlace de este HTML". Publica en la web pública del proyecto /<ns>/<slug>/<dir>/ (feature www). NO para la carta (esa vive en la raíz del www, la hace carta-digital).
fuente: enki
dominio: publicacion
tags: [publicar, html, web, url, caddy, www, namespace]
---

# Publicar HTML en Enki

Convierte un HTML en una página servida por Caddy y devuelve su URL. **El reflejo hace lo
determinista** (escribir el fichero + crear el symlink); **tú (LLM) solo eliges el `dir` y
das el HTML**. No inventes la URL — usa la que devuelve el reflejo.

## Cuándo usar
El usuario quiere una página web pública a partir de un HTML suelto: un diseño, un informe,
un catálogo, una landing. Para la carta PWA de un negocio usa `carta-digital` (vive en la
RAÍZ del www del proyecto), NO esto.

## Contrato
```json
{
  "entra": { "dir": "slug a-z0-9_- (subcarpeta bajo la web del proyecto)", "html": "documento HTML completo", "nombre?": "fichero, default index.html" },
  "sale":  { "publicado": true, "url_path": "/<ns>/<slug>/<dir>/", "slug": "proyecto" }
}
```
La URL pública final es `https://<tu-dominio>/<url_path>`. El esquema es **/<ns>/<slug>/<dir>/**
(proyecto-primero): `<ns>` es fijo del VPS (config `web.public_ns`, p.ej. `a`); `<slug>` es el
proyecto activo (dueño de su web); `<dir>` es la subcarpeta que eliges. El árbol de la web del
proyecto (`storage/www/`) se espeja tal cual en `/<ns>/<slug>/…`.

## Mecanismo
1. Ten el HTML completo (un `<!doctype html>…</html>`).
2. Asegura que el proyecto donde publicar está **ACTIVO** (el reflejo publica bajo su slug;
   si otro está activo, devuelve 412 — no publica a ciegas).
3. Llama al reflejo:
   `bus.publishAndWait('publicar.html.request', { dir, html, nombre? })`
4. El reflejo asegura la feature `www` (project-manager crea `storage/www` + el symlink
   `/opt/enki/public/<ns>/<slug>` → esa carpeta) y escribe el HTML en `storage/www/<dir>/`.
   Caddy sirve el árbol al instante (sin reload). Devuelve `url_path`. La raíz del www la puede
   ocupar la carta (carta-digital); tú publicas en subcarpetas.

## Pasos
- Elige un `dir` corto y descriptivo (`catalogo`, `informe`, `landing`).
- Publica con el reflejo. Da al usuario la URL completa (`https://<dominio>` + `url_path`).
- Guard de honestidad: si el reflejo devuelve **422** (el HTML renderiza roto),
  **409** (sin proyecto activo) o **412** (activo distinto del objetivo), DILO — no afirmes
  que se publicó. El veredicto lo pone el reflejo, no tu relato.

## Filosofía
El dato de la web vive en el `storage/www/` del proyecto (se respalda y se borra con él); el
público es un solo symlink `/opt/enki/public/<ns>/<slug>` que crea project-manager (la feature
`www`). El reflejo no escribe directo en `/opt/enki/public` ni crea symlinks propios: asegura la
feature y escribe en el árbol del proyecto. Infra = terreno, app = symlink, y el árbol se espeja.
