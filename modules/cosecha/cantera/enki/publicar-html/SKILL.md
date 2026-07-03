---
name: publicar-html
description: Cuando el usuario quiere PUBLICAR un HTML en Enki y obtener una URL pública — "publica esto", "sube esta página", "hazme una web con esto", "dame un enlace de este HTML". Publica en el namespace público /<ns>/<dir>/<proyecto>. NO para la carta (esa es carta-digital).
fuente: enki
dominio: publicacion
tags: [publicar, html, web, url, caddy, superficie, namespace]
---

# Publicar HTML en Enki

Convierte un HTML en una página servida por Caddy y devuelve su URL. **El reflejo hace lo
determinista** (escribir el fichero + crear el symlink); **tú (LLM) solo eliges el `dir` y
das el HTML**. No inventes la URL — usa la que devuelve el reflejo.

## Cuándo usar
El usuario quiere una página web pública a partir de un HTML suelto: un diseño, un informe,
un catálogo, una landing. Para la carta PWA de un negocio usa `carta-digital` (superficie
`shop`), NO esto.

## Contrato
```json
{
  "entra": { "dir": "slug a-z0-9_- (la superficie/nombre de la página)", "html": "documento HTML completo", "nombre?": "fichero, default index.html" },
  "sale":  { "publicado": true, "url_path": "/<ns>/<dir>/<slug>/", "slug": "proyecto" }
}
```
La URL pública final es `https://<tu-dominio>/<url_path>`. El esquema es **/<ns>/<dir>/<proyecto>**:
`<ns>` es fijo del VPS (config `web.public_ns`, p.ej. `a`); `<dir>` lo eliges tú; `<proyecto>`
es el slug del proyecto activo.

## Mecanismo
1. Ten el HTML completo (un `<!doctype html>…</html>`).
2. Asegura que el proyecto donde publicar está **ACTIVO** (el reflejo publica bajo su slug;
   si otro está activo, devuelve 412 — no publica a ciegas).
3. Llama al reflejo:
   `bus.publishAndWait('publicar.html.request', { dir, html, nombre? })`
4. El reflejo escribe el HTML en `storage/publicaciones/<dir>/` del proyecto y crea el
   symlink `/opt/enki/public/<ns>/<dir>/<slug>` → esa carpeta. Caddy lo sirve al instante
   (sin reload). Devuelve `url_path`.

## Pasos
- Elige un `dir` corto y descriptivo (`catalogo`, `informe`, `landing`).
- Publica con el reflejo. Da al usuario la URL completa (`https://<dominio>` + `url_path`).
- Guard de honestidad: si el reflejo devuelve **422** (el HTML renderiza roto),
  **409** (sin proyecto activo) o **412** (activo distinto del objetivo), DILO — no afirmes
  que se publicó. El veredicto lo pone el reflejo, no tu relato.

## Filosofía
El dato del proyecto vive en su `storage` (se respalda y se borra con él); el público es solo
un symlink. Misma frontera que la tienda: infra = terreno, app = symlink. Por eso el reflejo
no escribe directo en `/opt/enki/public` — escribe en el proyecto y enlaza.
