#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
npx --yes esbuild@0.25.12 js/vendor/vfx-entry.js --bundle --format=iife --global-name=PixelFX --target=es2020 --minify --legal-comments=inline --outfile=js/vendor/pixelfx.bundle.js
