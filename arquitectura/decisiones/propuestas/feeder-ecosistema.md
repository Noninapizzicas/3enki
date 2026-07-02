# feeder — el alimentador público de la cantera (skills.sh → cosecha)

> El destilador SELLA patrones internos → cantera. El feeder TRAE skills del ecosistema
> PÚBLICO (skills.sh / `npx skills`, vercel-labs/agent-skills, anthropics/skills) → cantera.
> Módulo: `modules/feeder/` (reflejo puro). Nace 2026-07-01.

## Los dos "find-skills" no son rivales — son un pipeline

Vercel publicó un skill llamado `find-skills` (github.com/vercel-labs/skills): un
DESCUBRIDOR+INSTALADOR del ecosistema público — `npx skills find/add`, catálogo en
skills.sh. Nuestro `planificador` (antes mal llamado `find-skills`) es otra cosa: un
PLANIFICADOR de proyecto sobre la cantera INTERNA. Capas distintas, mismo espíritu.

Puestos en fila, encajan:

```
skills.sh (público)  →  npx skills add  →  SKILL.md en disco  →  feeder INGIERE
  →  cosecha.importar  →  cantera  →  conserje ofrece  →  promover  →  lente viva
  →  planificador ensambla PROYECTOS sobre un catálogo mucho más grande
```

El `find-skills` de Vercel se adopta como **FUENTE**, no como copia. El feeder es el
puente que faltaba entre la mitad DESCUBRIR (pública) y la mitad ALOJAR (`cosecha.importar`).

## Restricción · palanca · efecto

- **Restricción:** la cantera se alimentaba a mano (semillas ECC/VoltAgent) + destilador
  (patrones internos). Su crecimiento está cuellobotellado en curación manual, mientras
  hay un registro público, creciente y con calidad social (skills.sh) sin tocar.
- **Palanca:** `cosecha.importar` ya es la puerta universal de ingesta. El feeder solo
  añade la ADQUISICIÓN (`npx skills`) + el PARSEO (SKILL.md crudo → forma de importar).
- **Efecto 2º orden:** el ecosistema público enchufa en el flujo de órgano; el
  planificador ensambla proyectos sobre una cantera alimentada por medio mundo.

## Puertas (reflejo)

```
feeder.ingerir  {fuente, md, nombre?}   NÚCLEO DETERMINISTA — parsea un SKILL.md crudo
                                        (frontmatter name/description/tags + hogar) → cosecha.importar.
                                        La puerta universal: cualquier SKILL.md externo entra por aquí.
feeder.instalar {paquete, fuente?}      npx skills add <paquete> → lee el/los SKILL.md → ingiere cada uno.
feeder.buscar   {query}                 npx skills find <query> → salida cruda (descubrimiento).
```

## Mandato — fail-honest (verificar en vivo, no a fe)

```
El CLI externo (npx skills) puede no estar / la red puede fallar. Cuando eso pasa, el
feeder DEGRADA LIMPIO: 503 UPSTREAM_UNREACHABLE con {degradado:true}. NUNCA un falso
éxito ni una caída. El núcleo (ingerir) es determinista y testeable; los wrappers npx
(instalar/buscar) se verifican EN VIVO (dependen de npx skills en el VPS).
```

## Topics / eventos

```
feeder.ingerir.request → .response      (SKILL.md crudo → cantera; determinista)
feeder.instalar.request → .response     (npx skills add → ingiere; degradeable)
feeder.buscar.request → .response       (npx skills find; degradeable)
cosecha.importar.request → .response    (RPC saliente — la puerta de la cantera)
```

## Estado

```
✓ reflejo (index.js 0.1.0): _parseMd + _ingerir (núcleo) · _instalar/_buscar (degradeables)
✓ test feeder__index 9/9 (parse · ingerir · guarda · degrada limpio 503)
◑ EN VIVO: los wrappers npx skills se verifican con el VPS (npx + red)
[ ] descubrimiento con parseo del catálogo skills.sh · calidad social (installs/stars) como señal
```
