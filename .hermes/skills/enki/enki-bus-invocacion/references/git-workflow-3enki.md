# Git/PR workflow 3enki — pitfalls de campo (2026-08)

## Tras el merge: el bloque siguiente abre rama NUEVA antes de editar

Fallo real (2026-08-06): al mergear un PR y quedar en `main`, el bloque
siguiente (paso 'escribir' + pipelines + seed) se commiteó y pusheó DIRECTO a
main — viola la regla "nunca push a main". El commit ya estaba en el remoto;
reescribirlo exigía force-push (peligroso si el dueño ya hizo pull) así que se
dejó, pactando "el siguiente bloque sí en rama". Secuencia correcta tras el
merge: `git checkout main && git pull` → `git checkout -b hermes/<siguiente>`
ANTES del primer edit.

## `git add` de un árbol recién copiado arrastra basura heredada

Al copiar estructura de un módulo viejo a uno nuevo, el primer commit incluyó
920 manifests/prompts heredados (~125K líneas) que el árbol nuevo no usa —
hubo `git rm -r` en un commit de limpieza (el historial queda feo). Antes de
commitear un árbol nuevo: `git status --porcelain | wc -l` y `git status
--porcelain | head` para ver QUÉ entra; excluye lo heredado que no vaya a usarse.

## Detectar squash-mergeados vs trabajo realmente pendiente

Tras un merge squash, la rama original sigue teniendo "1 commit no mergeado"
(`git rev-list --count main..<rama>` = 1) — ES NORMAL. Para distinguir de
trabajo REALMENTE pendiente: `git cherry -v main <rama>`.

- `-` = el commit YA tiene equivalente en main por contenido (squash-mergeado) → nada que hacer.
- `+` = trabajo que NO está en main → requiere PR (cherry-pick limpio, NO PR de la rama vieja).

## Rama vieja + commit huérfano → cherry-pick, no PR directo

Si la rama está muy atrasada de main (días), un PR directo arrastra un diff
gigante (ej. 117K líneas). El fix es: `git checkout -b <rama-nueva> main &&
git cherry-pick <sha>` → resolver conflictos → PR pequeño.

## Resolver conflictos de cherry-pick SIN perder contenido de main

En un modify/delete o merge con ramas divergentes, el conflicto puede incluir
más secciones de las que el ojo ve. Después de resolver: `git diff main --stat`
y revisa que NO se eliminaron secciones de main (ej. mi primera resolución
borró `## Entradas` y `## Formas` de un SKILL.md — se restauraron a tiempo).
La regla: el diff final debe ser SOLO el cambio del commit, nada de main perdido.

## PRs superados: cerrar sin merge, no mergear

Un PR viejo cuyo diff hace modify/delete contra código que main EVOLUCIONÓ
después (ej. PR que elimina una skill que main reescribió mejor) está superado.
Mergearlo borraría trabajo vivo. Evidencia: `git log <base>..origin/main -- <archivo>`
muestra los commits posteriores. Acción: comentar el motivo + cerrar sin merge +
borrar la rama local Y remota.

**Señal diagnóstica (caso #156):** un PR abierto desde una rama cuyo commit YA
se squash-mergeó (`git cherry` = `-`) y que además marca CONFLICTOS con main →
main no solo tiene el trabajo, lo MEJORÓ después (ej. #154 squash + #155
evolución). Los conflictos son la rama vieja pisando la versión mejorada:
resolverlos a favor de la rama REVERTIRÍA la mejora; a favor de main, el PR
queda vacío. Verificación del contenido: `git diff <sha-rama> origin/main --
<archivos en conflicto>` — si el diff solo muestra que main lleva la versión
mejorada, nada que rescatar. El check de CI rojo en estos PRs es ruido: se
cierra con el PR.

## Limpieza de ramas huérfanas

Las ramas remotas sin PR (restos de rama→PR→merge sin borrar) hacen que GitHub
re-proponga PRs duplicados al tocarlas (caso #122). Limpieza masiva:
`for b in $(git branch -r | grep -v HEAD | grep -v 'origin/main' | sed 's|origin/||'); do git push origin --delete "$b"; done`
— solo cuando el usuario lo aprueba y con 0 PRs abiertos. Las ramas LOCALES
huérfanas son inofensivas (no viven en GitHub); borrarlas es opcional.

## Deploy

- `cd ~/3enki && sudo ./deployment/deploy.sh` — requiere sudo del USUARIO
  (Hermes no tiene password). Preparar el repo (main limpio, pull) y dar el
  comando; el deploy lo ejecuta el dueño.
- Verificar deploy por marcadores de CÓDIGO en prod (`grep` el archivo en
  /opt/enki buscando un string único del cambio), no por nombres de archivo.
- `git branch -D` de una rama en uso falla ("used by worktree") — haz
  `git checkout main` ANTES de borrar, o el borrado queda pendiente.
