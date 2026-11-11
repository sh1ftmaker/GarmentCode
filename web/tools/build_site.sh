#!/usr/bin/env bash
# Assemble the static web configurator into ./_site (repo root).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/_site"
rm -rf "$OUT"
mkdir -p "$OUT/data"

cp "$ROOT/web/index.html" "$ROOT/web/sw.js" "$ROOT/web/manifest.webmanifest" "$ROOT/web/icon.svg" "$OUT/"
cp -r "$ROOT/web/src" "$OUT/src"
touch "$OUT/.nojekyll"

# Python sources (original GarmentCode library + garment programs + presets) for Pyodide
python3 - "$ROOT" "$OUT/gc_py.zip" <<'PY'
import sys, zipfile, pathlib
root, out = pathlib.Path(sys.argv[1]), sys.argv[2]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for pattern in ['pygarment/*.py', 'pygarment/garmentcode/*.py', 'pygarment/pattern/*.py',
                    'assets/__init__.py', 'assets/garment_programs/*.py',
                    'assets/bodies/*.py', 'assets/bodies/*.yaml', 'assets/design_params/*.yaml']:
        for f in sorted(root.glob(pattern)):
            z.write(f, f.relative_to(root).as_posix())
    z.write(root / 'web/py/gc_bridge.py', 'gc_bridge.py')
print('wrote', out)
PY

# Body meshes + signed distance fields
node "$ROOT/web/tools/prepare_bodies.mjs" "$ROOT" "$OUT/data"
echo "Site built in $OUT"
