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

# FreeSewing designs (MIT, https://freesewing.eu) bundled for the browser; needs
# `npm install` in web/ (the Pages workflow does that).
ESBUILD="$ROOT/web/node_modules/.bin/esbuild"
if [ -x "$ESBUILD" ] && [ -d "$ROOT/web/node_modules/@freesewing/core" ]; then
  "$ESBUILD" "$ROOT/web/tools/freesewing-entry.mjs" --bundle --format=esm --minify \
    --legal-comments=eof --log-level=warning --outfile="$OUT/src/fs/vendor/freesewing.js"
else
  echo "warning: web/node_modules is missing (run npm install in web/); FreeSewing designs will not load" >&2
fi

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

# Version the Python sources' URL by content, so browsers never mix a new deploy's JS
# with a cached older gc_py.zip (GitHub Pages lets browsers cache files for 10 minutes)
GCPY_HASH=$(sha256sum "$OUT/gc_py.zip" | cut -c1-12)
sed -i "s/GC_PY_VERSION/$GCPY_HASH/" "$OUT/src/py-worker.js"

# Body meshes + signed distance fields
node "$ROOT/web/tools/prepare_bodies.mjs" "$ROOT" "$OUT/data"
echo "Site built in $OUT"
