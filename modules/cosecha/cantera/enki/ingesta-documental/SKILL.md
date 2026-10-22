---
name: ingesta-documental
description: >-
  Skill FULL del módulo PUENTE STATELESS `ingesta-documental` de la vertical contabilidad (Enki).
  Mete documentos en el sistema desde dos canales: una CARPETA del storage del proyecto (`inbox/`)
  y TELEGRAM (foto o documento al bot vinculado). No procesa: entrega cada fichero al puerto digital
  (`puerto-documento-digital.recibir.request`) con su fuente y sha256. Idempotente en memoria.
when-to-use: >-
  - Cuando hay que barrer el buzón `inbox/` de un proyecto y entregar lo nuevo.
  - Cuando un bot de Telegram recibe una foto/PDF y debe entrar como documento del proyecto.
  - Cuando hay que vincular un bot a un proyecto (`vinculos`) sin adivinar el destino.
tags: [enki, modulo, puente, stateless, contabilidad, entrada, canales, telegram, inbox]
---

# ingesta-documental — canales → puerto digital

## Qué hace

Es la puerta de los CANALES. Entrega documentos, no los interpreta. Cada entrega es un
`puerto-documento-digital.recibir.request {project_id, fuente, documento{path, nombre, mime, sha256}}`
y el puerto sigue la cadena (lector → clasificador → extracción → cuadre → hecho → asiento).

## Ops (ORDEN → con ui_handler de panel)

| Op | Entrada | Qué hace |
|---|---|---|
| `barrer` | `{project_id, carpeta?}` (default `inbox/`) | lista por `fs.list.request`, entrega los ficheros soportados que no haya entregado ya |
| `entregar` | `{project_id, path, mime?, nombre?, fuente?}` | entrega un fichero concreto del storage |

**Idempotencia:** set de `sha256` ya entregados **en memoria**. No persiste: el que decide de verdad
si un hecho está duplicado es `deduplicacion-hecho` (A7). Un restart puede re-entregar; no duplica
asiento porque la clave natural del hecho lo impide.

## Canal Telegram

Escucha `telegram.photo.received` y `telegram.document.received` (payload real: `{botName, chatId,
messageId, fileId, fileSize, mimeType, fileName?, caption}`).

1. Resuelve el proyecto por `config.vinculos { "<botName>": "<project_id UUID>" }`.
   **Sin vínculo NO se entrega y NO se adivina el proyecto** (se loguea y se ignora).
2. Descarga con `telegram.get_file.request {botName, fileId, download:true, destPath:<os.tmpdir()>}`.
3. Sube al storage con `fs.write.request {project_id, path:'inbox/<messageId>-<fileId>.<ext>',
   content:<base64>, encoding:'base64'}`, borra el tmp y entrega.

## Pitfalls

- `fs.list` **no es recursivo**: `barrer` barre un nivel (el buzón), no un árbol. Los subdirectorios
  se declaran en `ignorados`.
- `telegram.get_file` descarga en una ruta **absoluta del host**, no en el storage del proyecto:
  siempre hay que subir después con `fs.write` (multi-tenant).
- `fs.list` sin respuesta del bus → 502 `FS_NO_DISPONIBLE`; 404 es "la carpeta no existe" (no se
  confunden: un timeout no prueba inexistencia).
- Extensiones soportadas: pdf/jpg/jpeg/png/webp/tif/tiff. Cualquier otra → `ignorados`/415.

## Verificación

```bash
node tests/unit/entrada__ingesta-documental.test.js   # 11/11
```
