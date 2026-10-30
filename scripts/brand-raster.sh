#!/bin/sh
# Needs Inkscape and ImageMagick. Outputs are committed; they are not byte-identical across tool versions.
set -eu
assets="$(dirname "$0")/../docs/brand/assets"

inkscape "$assets/social/card.svg" --export-type=png -o "$assets/social/card.png"
for size in 16 32 48 180 512; do
    inkscape "$assets/favicon/favicon.svg" --export-type=png -w "$size" -h "$size" -o "$assets/favicon/$size.png"
done
magick "$assets/favicon/16.png" "$assets/favicon/32.png" "$assets/favicon/48.png" "$assets/favicon/favicon.ico"
# npm's README sanitizer drops <picture> and SVG; it shows these PNGs, rounded so they sit on any page colour.
for theme in light dark; do
    png="$assets/hero/readme-hero-$theme.png"
    inkscape "$assets/hero/readme-hero-$theme.svg" --export-type=png -w 2560 -h 800 -o "$png"
    magick "$png" \( +clone -alpha extract -fill black -colorize 100 -fill white -draw "roundrectangle 0,0 2559,799 48,48" \) -alpha off -compose CopyOpacity -composite -strip "$png"
done
