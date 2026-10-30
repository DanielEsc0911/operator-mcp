#!/bin/sh
# Needs Inkscape and ImageMagick. Outputs are committed; they are not byte-identical across tool versions.
set -eu
assets="$(dirname "$0")/../docs/brand/assets"

inkscape "$assets/social/card.svg" --export-type=png -o "$assets/social/card.png"
for size in 16 32 48 180 512; do
    inkscape "$assets/favicon/favicon.svg" --export-type=png -w "$size" -h "$size" -o "$assets/favicon/$size.png"
done
magick "$assets/favicon/16.png" "$assets/favicon/32.png" "$assets/favicon/48.png" "$assets/favicon/favicon.ico"
