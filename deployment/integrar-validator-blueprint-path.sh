#!/bin/bash
# =============================================================================
# Integra el validador de coherencia blueprint_driven/blueprint_path.
#
# POR QUÉ UN SCRIPT (y no un commit directo): los ficheros canónicos del repo
#   (arquitectura/decisiones/_validators/, _contratos/, scripts/validate-all.js)
#   son de hermes:www-data y el usuario admin NO está en www-data.
#
# QUÉ HACE (idempotente, se puede correr varias veces):
#   1. Registra la nueva regla en module-loading.contract.json
#   2. Añade el check al validador module-loading.validate.js
#   3. Registra el runner en scripts/validate-all.js
#   4. Lo ejecuta para verificar
#
# USO:  sudo ./deployment/integrar-validator-blueprint-path.sh
# =============================================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

[[ $EUID -ne 0 ]] && { echo "Ejecutar con sudo."; exit 1; }

VALIDATOR="arquitectura/decisiones/_validators/module-loading.validate.js"
CONTRACT="arquitectura/decisiones/_contratos/module-loading.contract.json"
RUNNER="scripts/validate-all.js"
NUEVO="scripts/validar-blueprint-path.js"

[[ -f "$NUEVO" ]] || { echo "[!] falta $NUEVO"; exit 1; }

echo ""
echo "=== 1/4 · contrato: registrar la nueva regla ==="
python3 - "$CONTRACT" <<'PY'
import json, sys
p = sys.argv[1]
c = json.load(open(p))
v = c['validaciones_cross_realizadas_por_validator']
if any(e.get('id') == 'drift_blueprint_driven_sin_path' for e in v):
    print("  = ya registrada")
else:
    v.append({
        "id": "drift_blueprint_driven_sin_path",
        "regla": ("Si un module.json declara blueprint_driven:true DEBE declarar blueprint_path "
                  "y el fichero debe existir. Sin la ruta, el ai-gateway lee undefined y falla al "
                  "arrancar (ai-gateway.blueprint.load.failed / 'paths[1] argument must be of type string')."),
        "como_detectar": ("Recorrer los module.json; si blueprint_driven===true y "
                          "(!blueprint_path || !fs.existsSync(dir/blueprint_path)) -> error."),
        "severidad": "error"
    })
    json.dump(c, open(p, 'w'), ensure_ascii=False, indent=2)
    open(p, 'a').write('\n')
    print("  ✅ regla añadida")
PY

echo ""
echo "=== 2/4 · validador: añadir el check ==="
if grep -q "checkBlueprintPathCoherente" "$VALIDATOR"; then
  echo "  = ya está"
else
  python3 - "$VALIDATOR" <<'PY'
import sys, re
p = sys.argv[1]
s = open(p).read()

check = '''
function checkBlueprintPathCoherente(findings) {
  // blueprint_driven:true SIN blueprint_path -> el ai-gateway lee undefined y
  // revienta al arrancar (paths[1] argument must be of type string).
  for (const { dir, manifest } of listModuleManifests()) {
    if (manifest.blueprint_driven !== true) continue;
    const bp = typeof manifest.blueprint_path === 'string' ? manifest.blueprint_path.trim() : '';
    if (!bp) {
      findings.errors.push(`drift_blueprint_driven_sin_path: ${path.relative(REPO_ROOT, dir)}/module.json declara blueprint_driven:true SIN blueprint_path (el ai-gateway fallara al arrancar). O le das su "<slug>.blueprint.json" o quitas el campo.`);
    } else if (!fs.existsSync(path.join(dir, bp))) {
      findings.errors.push(`drift_blueprint_path_sin_fichero: ${path.relative(REPO_ROOT, dir)}/module.json declara blueprint_path "${bp}" pero el fichero no existe.`);
    }
  }
}
'''
# insertar el check antes de reportFindings
s = s.replace('function reportFindings(f) {', check + '\nfunction reportFindings(f) {', 1)
# y registrarlo en main()
s = s.replace('    checkModuloSinOnUnload(f);', '    checkModuloSinOnUnload(f);\n    checkBlueprintPathCoherente(f);', 1)
# documentarlo en la cabecera
s = s.replace(' *  5. drift_dependency_referencia_inexistente   (error)   — dependencies referencia modulo que no existe',
              ' *  5. drift_dependency_referencia_inexistente   (error)   — dependencies referencia modulo que no existe\n *  6. drift_blueprint_driven_sin_path            (error)   — blueprint_driven:true sin blueprint_path', 1)
open(p, 'w').write(s)
print("  ✅ check añadido")
PY
fi

echo ""
echo "=== 3/4 · runner: registrar en validate-all ==="
if grep -q "validar-blueprint-path" "$RUNNER"; then
  echo "  = ya registrado"
else
  python3 - "$RUNNER" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
marca = "  { id: 'ui-frontend-blueprint', file: 'arquitectura/decisiones/_validators/ui-frontend-blueprint.validate.js' }"
if marca not in s:
    print("  [!] no encontrada la última entrada del array — añadir a mano")
else:
    # OJO: la última entrada NO lleva coma. Hay que añadir la coma final Y la nueva.
    s = s.replace(marca, marca + ",", 1)
    s = s.replace(marca + ",",
                  marca + ",\n  { id: 'blueprint-path', file: 'scripts/validar-blueprint-path.js' }",
                  1)
    open(p, 'w').write(s)
    print("  ✅ registrado tras 'ui-frontend-blueprint' (preservando la sintaxis del array)")
PY
fi

echo ""
echo "=== 4/4 · verificación ==="
node scripts/validar-blueprint-path.js && echo "  ✅ PASS (sin drift)" || echo "  ⚠️  hay drift (ver arriba) — normal si los 4 de marketing siguen rotos"
echo ""
node arquitectura/decisiones/_validators/module-loading.validate.js --check-system 2>&1 | tail -5
echo ""
echo "Listo. Ahora 'npm run validate:all' incluye la regla."
echo ""
