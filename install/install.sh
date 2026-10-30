#!/bin/sh
# Install the OPerator standalone binary into ~/.local/bin, then run its setup:
#     curl -fsSL https://operator.daer.dev/install.sh | sh
#     curl -fsSL https://operator.daer.dev/install.sh | sh -s -- --no-setup
# OPERATOR_VERSION pins a release, OPERATOR_INSTALL_DIR moves the binary,
# OPERATOR_BASE points at another download host, OPERATOR_LANG=es speaks Spanish.
# Never needs sudo.
set -eu

base=${OPERATOR_BASE:-https://github.com/DanielEsc0911/operator-mcp/releases}
install_dir=${OPERATOR_INSTALL_DIR:-$HOME/.local/bin}

lang=en
for argument in "$@"; do
    [ "${previous:-}" = --lang ] && OPERATOR_LANG=$argument
    previous=$argument
done
case ${OPERATOR_LANG:-${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}} in
    es*) lang=es ;;
esac

t() {
    if [ "$lang" = es ]; then printf %s "$2"; else printf %s "$1"; fi
}

fancy=0
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-dumb}" != dumb ]; then
    case "${LC_ALL:-${LC_CTYPE:-${LANG:-}}}" in
        *[Uu][Tt][Ff]-8* | *[Uu][Tt][Ff]8*) fancy=1 ;;
    esac
fi

# xterm-256 slots measured on white and on black (docs/brand/README.md).
if [ "$fancy" = 1 ]; then
    reset=$(printf '\033[0m') bold=$(printf '\033[1m') accent=$(printf '\033[38;5;172m')
    patch=$(printf '\033[38;5;30m') muted=$(printf '\033[38;5;243m') alarm=$(printf '\033[38;5;167m')
    dot='·' ellipsis='…' cross='✗' rule='─────────────────────'
else
    reset='' bold='' accent='' patch='' muted='' alarm=''
    dot='-' ellipsis='...' cross='x' rule='---------------------'
fi

usage() {
    echo "$(t Usage Uso): curl -fsSL https://operator.daer.dev/install.sh | sh -s -- [--no-setup] [--lang en|es]"
    echo
    echo "  --no-setup   $(t "install the binary and stop; run 'operator-mcp setup' later" "instala el binario y para; ejecuta 'operator-mcp setup' después")"
    echo "  --lang       $(t "en or es; by default, the one in your locale" "en o es; por defecto, el de tu sistema")"
    echo
    echo "  OPERATOR_VERSION       $(t "install this release instead of the latest (e.g. 1.3.0)" "instala esta versión en lugar de la última (p. ej. 1.3.0)")"
    echo "  OPERATOR_INSTALL_DIR   $(t "install here instead of ~/.local/bin" "instala aquí en lugar de ~/.local/bin")"
    echo "  OPERATOR_BASE          $(t "download releases from here instead of GitHub" "descarga las versiones desde aquí en lugar de GitHub")"
    echo "  OPERATOR_LANG          $(t "en or es, like --lang" "en o es, como --lang")"
}

columns() {
    size=$(stty size </dev/tty 2>/dev/null || true)
    case ${size#* } in
        '' | 0 | *[!0-9]*) echo 80 ;;
        *) echo "${size#* }" ;;
    esac
}

# printf pads by bytes, so each UTF-8 continuation byte widens the field by one.
pad() {
    extra=$(printf %s "$1" | LC_ALL=C tr -d '\000-\177\300-\377' | wc -c)
    printf "%-$((${2:-14} + extra))s" "$1"
}

# Cuts to a number of characters. Under LC_ALL=C awk sees bytes, and a UTF-8
# continuation byte (\200-\277) never starts a character.
clip() {
    printf %s "$1" | LC_ALL=C awk -v room="$2" -v more="$ellipsis" '
        function starts(c) { return c < "\200" || c >= "\300" }
        {
            n = 0
            for (i = 1; i <= length($0); i++) if (starts(substr($0, i, 1))) n++
            if (n <= room) { printf "%s", $0; exit }
            kept = ""; n = 0
            for (i = 1; i <= length($0); i++) {
                c = substr($0, i, 1)
                if (starts(c) && ++n > room - 1) break
                kept = kept c
            }
            if (room > 0) printf "%s%s", kept, more
        }'
}

tilde() {
    case $1 in
        "$HOME"/*) echo "~${1#"$HOME"}" ;;
        *) echo "$1" ;;
    esac
}

# Two cell rows print as one text row of half blocks; b follows the terminal's own colour.
mark_lines() {
    awk -v accent=172 -v patch=30 '
        function slot(role) { return role == "a" ? accent : role == "t" ? patch : role == "b" ? "base" : "" }
        function fg(colour) { return colour == "base" ? "\033[39m" : "\033[38;5;" colour "m" }
        function bg(colour) { return "\033[48;5;" colour "m" }
        { rows[NR] = $0 }
        END {
            for (row = 1; row <= NR; row += 2) {
                line = ""
                for (column = 1; column <= 16; column++) {
                    top = slot(substr(rows[row], column, 1))
                    bottom = slot(substr(rows[row + 1], column, 1))
                    if (top == "" && bottom == "") line = line " "
                    else if (bottom == "") line = line fg(top) "▀\033[0m"
                    else if (top == "") line = line fg(bottom) "▄\033[0m"
                    else if (top == bottom) line = line fg(top) "█\033[0m"
                    else if (top == "base") line = line fg(top) bg(bottom) "▀\033[0m"
                    else line = line fg(bottom) bg(top) "▄\033[0m"
                }
                print line
            }
        }' <<'CELLS'
                
     aaaaaa     
   aa      aa   
  a  bbbbbb  a  
 a bb      bb a 
aaab        baaa
aab  bb  bb  baa
aab  bb  bb  baa
aabtt      ttbaa
aab   b  b   baa
 ab    bb    b  
 a b        b   
 a  bbbbbbbb    
  aaat          
                
                
CELLS
}

greet() {
    echo
    if [ "$fancy" = 1 ] && [ "$(columns)" -ge 60 ]; then
        mark_lines >"$work/mark"
        awk 'NR == FNR { mark[FNR] = $0; marks = FNR; next } { fact[FNR + 1] = $0 }
            END { for (row = 1; row <= marks; row++) print "  " mark[row] "    " fact[row] }' "$work/mark" "$work/facts"
    else
        sed 's/^/  /' "$work/facts"
    fi
    echo
}

lamps() {
    case $1 in
        0) echo "$accent●$muted ○ ○$reset" ;;
        1) echo "$muted○ $accent●$muted ○$reset" ;;
        2) echo "$muted○ ○ $accent●$reset" ;;
        *) echo "$accent● ● ●$reset" ;;
    esac
}

bar() {
    awk -v got="$1" -v total="$2" -v width="${3:-24}" -v fill="$patch" -v rest="$muted" -v reset="$reset" 'BEGIN {
        filled = total > 0 ? int(got * width / total) : 0
        if (filled > width) filled = width
        line = fill; for (i = 0; i < width; i++) { if (i == filled) line = line rest; line = line "━" }
        printf "%s%s %3d%%", line, reset, (total > 0 && got <= total ? got * 100 / total : 0)
    }'
}

# The bar gives up its cells before the detail text does: 24 when there is room, never under 6.
bar_width() {
    spare=$(($(columns) - 1 - 16 - 5 - 2 - $1))
    if [ "$spare" -gt 24 ]; then echo 24; elif [ "$spare" -lt 6 ]; then echo 6; else echo "$spare"; fi
}

megabytes() {
    awk -v bytes="$1" 'BEGIN { printf "%.1f MB", bytes / 1048576 }'
}

# A redrawn line that wraps leaves a copy behind on every frame, so each one
# stays inside the width the terminal has right now.
step_line() {
    room=$(($(columns) - 1 - 16 - $3 - 2))
    printf '\r  %s%s%s %s  %s\033[K' "$bold" "$(pad "$1" 13)" "$reset" "$2" "$(clip "$4" "$room")"
}

finish() {
    if [ "$fancy" = 1 ]; then
        step_line "$1" "${3:-$patch$(pad "$(t "done" listo)" 5)$reset}" "${4:-5}" "$2"
        echo
    else
        echo "  $(pad "$1" 13) $(pad "$(t "done" listo)" 5)  $2"
    fi
}

fail() {
    [ "$fancy" = 1 ] && printf '\r\033[K'
    echo
    echo "  $alarm$cross$reset $bold$1$reset"
    shift
    for line in "$@"; do echo "    $line"; done
    echo
    exit 1
}

# Runs a quiet command beside the switchboard lamps, 120 ms a step.
with_lamps() {
    label=$1 detail=$2
    shift 2
    "$@" </dev/null 2>>"$work/log" &
    pid=$!
    frame=0
    while [ "$fancy" = 1 ] && kill -0 "$pid" 2>/dev/null; do
        step_line "$label" "$(lamps $((frame % 3)))" 5 "$detail"
        frame=$((frame + 1))
        sleep 0.12
    done
    wait "$pid"
}

download() {
    url=$1 file=$2 label=$3 name=$4
    total=$(curl -fsSLI "$url" 2>/dev/null | tr -d '\r' | awk 'tolower($1) == "content-length:" { n = $2 } END { print n + 0 }')
    curl -fsSL -o "$file" "$url" </dev/null 2>>"$work/log" &
    pid=$!
    while [ "$fancy" = 1 ] && kill -0 "$pid" 2>/dev/null; do
        got=0
        [ -f "$file" ] && got=$(($(wc -c <"$file")))
        detail="$name $dot $(megabytes "$got") $(t of de) $(megabytes "$total")"
        width=$(bar_width ${#detail})
        step_line "$label" "$(bar "$got" "$total" "$width")" $((width + 5)) "$detail"
        sleep 0.1
    done
    wait "$pid" || fail "$(t "The download stopped before it finished." "La descarga se cortó antes de terminar.")" \
        "$(t "Check your connection and run the same command again." "Revisa tu conexión y vuelve a ejecutar el mismo comando.")"
    size=$(($(wc -c <"$file")))
    detail="$name $dot $(megabytes "$size")"
    width=$(bar_width ${#detail})
    finish "$label" "$detail" "$(bar "$size" "$size" "$width")" $((width + 5))
}

sha256() {
    if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -c1-64
}

platform() {
    npx_hint=$(t "With Node.js 22 or newer you can still run it:  npx -y operator-mcp setup" \
        "Con Node.js 22 o posterior puedes usarlo igual:  npx -y operator-mcp setup")
    case $(uname -s) in
        Linux) os=linux ;;
        Darwin) os=darwin ;;
        *) fail "$(t "OPerator's binary runs on Linux and macOS, and this is" "El binario de OPerator funciona en Linux y macOS, y este sistema es") $(uname -s)." "$npx_hint" ;;
    esac
    case $(uname -m) in
        x86_64 | amd64) arch=x64 ;;
        aarch64 | arm64) arch=arm64 ;;
        *) fail "$(t "OPerator's binary is built for x64 and arm64, and this machine is" "El binario de OPerator está compilado para x64 y arm64, y este equipo es") $(uname -m)." "$npx_hint" ;;
    esac
    # A shell under Rosetta reports x86_64 on Apple silicon; the native build is faster.
    if [ "$os" = darwin ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = 1 ]; then
        arch=arm64
    fi
    if [ "$os" = linux ]; then
        for loader in /lib/ld-musl-*; do
            [ -e "$loader" ] && fail "$(t "OPerator's binary needs glibc, and this system uses musl (Alpine, for one)." \
                "El binario de OPerator necesita glibc, y este sistema usa musl (Alpine, por ejemplo).")" \
                "$(t "Install Node.js 22 or newer, then run:  npx -y operator-mcp setup" \
                    "Instala Node.js 22 o posterior y ejecuta:  npx -y operator-mcp setup")"
        done
    fi
    asset="operator-mcp-$os-$arch"
}

system_name() {
    if [ "$os" = darwin ]; then
        echo "macOS $(sw_vers -productVersion 2>/dev/null || true)"
    else
        pretty=$(sed -n 's/^PRETTY_NAME="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' /etc/os-release 2>/dev/null || true)
        echo "${pretty:-Linux}"
    fi
}

resolve_version() {
    if [ -n "${OPERATOR_VERSION:-}" ]; then
        version=${OPERATOR_VERSION#v}
        return
    fi
    pin_hint="$(t "Pin one instead:" "Fija una versión:")  OPERATOR_VERSION=1.3.0 sh install.sh"
    landed=$(curl -fsSLI -o /dev/null -w '%{url_effective}' "$base/latest" 2>/dev/null) ||
        fail "$(t "Couldn't find the latest release at" "No encontré la última versión en") $base." \
            "$(t "Check your connection." "Revisa tu conexión.") $pin_hint"
    version=${landed##*/v}
    case $version in
        [0-9]*.[0-9]*.[0-9]*) ;;
        *) fail "$(t "$base/latest did not lead to a release." "$base/latest no lleva a ninguna versión.")" "$pin_hint" ;;
    esac
}

# 1.2.0 ran from npx only; its agent entries name the bare package, never a path.
npx_entries() {
    grep -ls '"operator-mcp"' "$HOME/.claude.json" "$HOME/.codex/config.toml" "$HOME/.gemini/settings.json" \
        "$HOME/.cursor/mcp.json" "$HOME/.config/opencode/opencode.json" 2>/dev/null | head -n 1
}

installed_row() {
    installed=$("$install_dir/operator-mcp" --version 2>/dev/null || true)
    [ -z "$installed" ] && [ -n "$(npx_entries)" ] && installed=npx
    if [ -z "$installed" ]; then
        echo "$bold$accent$(pad "$(t Installed Instalada)")$reset$(t "not yet" "todavía no")"
    elif [ "$installed" = "$version" ]; then
        echo "$bold$accent$(pad "$(t Installed Instalada)")$reset$version $dot $(t "reinstalling" "se reinstala")"
    else
        echo "$bold$accent$(pad "$(t Upgrading Actualizando)")$reset$installed → $version"
    fi
}

write_facts() {
    {
        echo "$bold${accent}OPerator$reset  $muted$(t installer instalador)$reset"
        echo "$muted$rule$reset"
        echo "$bold$accent$(pad "$(t System Sistema)")$reset$(system_name) $dot $(uname -m)"
        installed_row
        echo "$bold$accent$(pad "$(t Release Descarga)")$reset$version"
        echo "$bold$accent$(pad "$(t Into Destino)")$reset$(tilde "$install_dir")"
    } >"$work/facts"
}

place() {
    mkdir -p "$install_dir" &&
        cp "$work/$asset" "$install_dir/.operator-mcp.new" &&
        chmod 755 "$install_dir/.operator-mcp.new" &&
        mv -f "$install_dir/.operator-mcp.new" "$install_dir/operator-mcp"
}

path_hint() {
    case ":$PATH:" in
        *":$install_dir:"*) return ;;
    esac
    echo "  $(tilde "$install_dir") $(t "is not on your PATH. Add this line to your shell's startup file:" \
        "no está en tu PATH. Añade esta línea al archivo de inicio de tu shell:")"
    case $install_dir in
        "$HOME"/*) shown="\$HOME${install_dir#"$HOME"}" ;;
        *) shown=$install_dir ;;
    esac
    echo "    ${bold}export PATH=\"$shown:\$PATH\"$reset"
    echo
}

main() {
    run_setup=1
    skip=0
    for argument in "$@"; do
        if [ "$skip" = 1 ]; then skip=0; continue; fi
        case $argument in
            --no-setup) run_setup=0 ;;
            --lang) skip=1 ;;
            -h | --help) usage; exit 0 ;;
            *) echo "$(t "Unknown option" "Opción desconocida"): $argument" >&2; usage >&2; exit 2 ;;
        esac
    done

    work=$(mktemp -d)
    trap 'rm -rf "$work"; [ "$fancy" = 1 ] && printf "\033[?25h"' EXIT
    trap 'exit 130' INT TERM
    platform
    command -v curl >/dev/null 2>&1 || fail "$(t "curl is needed to download OPerator." "Hace falta curl para descargar OPerator.")" \
        "$(t "Install curl, then run this again." "Instala curl y vuelve a ejecutar esto.")"
    command -v gzip >/dev/null 2>&1 || fail "$(t "gzip is needed to unpack OPerator." "Hace falta gzip para descomprimir OPerator.")" \
        "$(t "Install gzip, then run this again." "Instala gzip y vuelve a ejecutar esto.")"
    resolve_version
    write_facts
    greet
    [ "$fancy" = 1 ] && printf '\033[?25l'

    host=$(echo "$base" | awk -F/ '{ print $3 }')
    release="$base/download/v$version"
    line_check=$(t "Line check" "Comprobando")
    with_lamps "$line_check" "$host" curl -fsSL -o "$work/SHA256SUMS" "$release/SHA256SUMS" ||
        fail "$(t "Couldn't reach $host for release $version." "No pude conectar con $host para la versión $version.")" \
            "$(t "Check your connection. If $version is not a published release, drop OPERATOR_VERSION." \
                "Revisa tu conexión. Si $version no es una versión publicada, quita OPERATOR_VERSION.")"
    finish "$line_check" "$host $(t reachable responde)" "$(lamps lit)"

    download "$release/$asset.gz" "$work/$asset.gz" "$(t Dialing Marcando)" "$asset"

    expected=$(awk -v name="$asset.gz" '$2 == name || $2 == "*" name { print $1 }' "$work/SHA256SUMS")
    if [ -z "$expected" ] || [ "$expected" != "$(sha256 "$work/$asset.gz")" ]; then
        fail "$(t "The download does not match its SHA-256 checksum, so nothing was installed." \
            "La descarga no coincide con su suma SHA-256, así que no se instaló nada.")" \
            "$(t "Run the same command again. If it keeps failing, open an issue:" \
                "Vuelve a ejecutar el mismo comando. Si sigue fallando, abre una incidencia:")" \
            "https://github.com/DanielEsc0911/operator-mcp/issues"
    fi
    finish "$(t Verifying Verificando)" "$(t "SHA-256 matches" "SHA-256 coincide")"
    gzip -dc "$work/$asset.gz" >"$work/$asset" 2>>"$work/log" ||
        fail "$(t "The download passed its checksum but would not unpack." "La descarga pasó la suma de control pero no se pudo descomprimir.")" \
            "$(t "Run the same command again." "Vuelve a ejecutar el mismo comando.")"

    place || fail "$(t "Couldn't write to" "No pude escribir en") $install_dir." \
        "$(t "Pick a folder you own:" "Elige una carpeta tuya:")  OPERATOR_INSTALL_DIR=\$HOME/bin sh install.sh"
    "$install_dir/operator-mcp" --version >/dev/null 2>>"$work/log" ||
        fail "$(t "The binary was installed but does not start." "El binario se instaló pero no arranca.")" \
            "$(t "See what it says:" "Mira qué dice:")  $install_dir/operator-mcp --version"
    finish "$(t "Patching in" Conectando)" "$(tilde "$install_dir")/operator-mcp"
    [ "$fancy" = 1 ] && printf '\033[?25h'
    echo

    path_hint
    if [ "$run_setup" = 0 ]; then
        echo "  $(t "Installed. When you're ready:" "Instalado. Cuando quieras:")  ${bold}operator-mcp setup$reset"
        echo
    elif [ -r /dev/tty ] && (: </dev/tty) 2>/dev/null; then
        echo "  $accent$(t "Connecting you to setup" "Conectándote con la configuración")$ellipsis$reset"
        echo
        rm -rf "$work"
        exec "$install_dir/operator-mcp" setup --lang "$lang" </dev/tty
    else
        echo "  $(t "Installed. There is no terminal here to answer setup's questions, so run it yourself:" \
            "Instalado. Aquí no hay una terminal para responder a la configuración, así que ejecútala tú:")"
        echo "    ${bold}operator-mcp setup$reset"
        echo
    fi
}

main "$@"
