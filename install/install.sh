#!/bin/sh
# Install the OPerator standalone binary into ~/.local/bin, then run its setup:
#     curl -fsSL https://operator-mcp.pages.dev/install.sh | sh
#     curl -fsSL https://operator-mcp.pages.dev/install.sh | sh -s -- --no-setup
# OPERATOR_VERSION pins a release, OPERATOR_INSTALL_DIR moves the binary,
# OPERATOR_BASE points at another download host. Never needs sudo.
set -eu

base=${OPERATOR_BASE:-https://github.com/DanielEsc0911/operator-mcp/releases}
install_dir=${OPERATOR_INSTALL_DIR:-$HOME/.local/bin}

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
    echo "Usage: curl -fsSL https://operator-mcp.pages.dev/install.sh | sh -s -- [--no-setup]"
    echo
    echo "  --no-setup   install the binary and stop; run 'operator-mcp setup' later"
    echo
    echo "  OPERATOR_VERSION       install this release instead of the latest (e.g. 1.2.0)"
    echo "  OPERATOR_INSTALL_DIR   install here instead of ~/.local/bin"
    echo "  OPERATOR_BASE          download releases from here instead of GitHub"
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
    printf "%-$((${2:-11} + extra))s" "$1"
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
    awk -v got="$1" -v total="$2" -v fill="$patch" -v rest="$muted" -v reset="$reset" 'BEGIN {
        width = 24; filled = total > 0 ? int(got * width / total) : 0
        if (filled > width) filled = width
        line = fill; for (i = 0; i < width; i++) { if (i == filled) line = line rest; line = line "━" }
        printf "%s%s %3d%%", line, reset, (total > 0 && got <= total ? got * 100 / total : 0)
    }'
}

megabytes() {
    awk -v bytes="$1" 'BEGIN { printf "%.1f MB", bytes / 1048576 }'
}

step_line() {
    printf '\r  %s%s%s %s  %s\033[K' "$bold" "$(pad "$1" 12)" "$reset" "$2" "$3"
}

finish() {
    if [ "$fancy" = 1 ]; then
        step_line "$1" "${3:-$patch$(pad "done" 5)$reset}" "$2"
        echo
    else
        echo "  $(pad "$1" 12) done   $2"
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
        step_line "$label" "$(lamps $((frame % 3)))" "$detail"
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
        step_line "$label" "$(bar "$got" "$total")" "$name $dot $(megabytes "$got") of $(megabytes "$total")"
        sleep 0.1
    done
    wait "$pid" || fail "The download stopped before it finished." \
        "Check your connection and run the same command again."
    size=$(($(wc -c <"$file")))
    finish "$label" "$name $dot $(megabytes "$size")" "$(bar "$size" "$size")"
}

sha256() {
    if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -c1-64
}

platform() {
    case $(uname -s) in
        Linux) os=linux ;;
        Darwin) os=darwin ;;
        *) fail "OPerator's binary runs on Linux and macOS, and this is $(uname -s)." \
            "With Node.js 22 or newer you can still run it:  npx -y operator-mcp setup" ;;
    esac
    case $(uname -m) in
        x86_64 | amd64) arch=x64 ;;
        aarch64 | arm64) arch=arm64 ;;
        *) fail "OPerator's binary is built for x64 and arm64, and this machine is $(uname -m)." \
            "With Node.js 22 or newer you can still run it:  npx -y operator-mcp setup" ;;
    esac
    # A shell under Rosetta reports x86_64 on Apple silicon; the native build is faster.
    if [ "$os" = darwin ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = 1 ]; then
        arch=arm64
    fi
    if [ "$os" = linux ]; then
        for loader in /lib/ld-musl-*; do
            [ -e "$loader" ] && fail "OPerator's binary needs glibc, and this system uses musl (Alpine, for one)." \
                "Install Node.js 22 or newer, then run:  npx -y operator-mcp setup"
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
    landed=$(curl -fsSLI -o /dev/null -w '%{url_effective}' "$base/latest" 2>/dev/null) ||
        fail "Couldn't find the latest release at $base." \
            "Check your connection, or pin one:  OPERATOR_VERSION=1.2.0 sh install.sh"
    version=${landed##*/v}
    case $version in
        [0-9]*.[0-9]*.[0-9]*) ;;
        *) fail "$base/latest did not lead to a release." \
            "Pin one instead:  OPERATOR_VERSION=1.2.0 sh install.sh" ;;
    esac
}

write_facts() {
    installed=$("$install_dir/operator-mcp" --version 2>/dev/null || true)
    {
        echo "$bold${accent}OPerator$reset  ${muted}installer$reset"
        echo "$muted$rule$reset"
        echo "$bold$accent$(pad System)$reset$(system_name) $dot $(uname -m)"
        echo "$bold$accent$(pad Installed)$reset${installed:-not yet}"
        echo "$bold$accent$(pad Release)$reset$version"
        echo "$bold$accent$(pad Into)$reset$(tilde "$install_dir")"
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
    echo "  $(tilde "$install_dir") is not on your PATH. Add this line to your shell's startup file:"
    case $install_dir in
        "$HOME"/*) shown="\$HOME${install_dir#"$HOME"}" ;;
        *) shown=$install_dir ;;
    esac
    echo "    ${bold}export PATH=\"$shown:\$PATH\"$reset"
    echo
}

main() {
    run_setup=1
    for argument in "$@"; do
        case $argument in
            --no-setup) run_setup=0 ;;
            -h | --help) usage; exit 0 ;;
            *) echo "Unknown option: $argument" >&2; usage >&2; exit 2 ;;
        esac
    done

    work=$(mktemp -d)
    trap 'rm -rf "$work"; [ "$fancy" = 1 ] && printf "\033[?25h"' EXIT
    trap 'exit 130' INT TERM
    platform
    command -v curl >/dev/null 2>&1 || fail "curl is needed to download OPerator." "Install curl, then run this again."
    resolve_version
    write_facts
    greet
    [ "$fancy" = 1 ] && printf '\033[?25l'

    host=$(echo "$base" | awk -F/ '{ print $3 }')
    release="$base/download/v$version"
    with_lamps "Line check" "$host" curl -fsSL -o "$work/SHA256SUMS" "$release/SHA256SUMS" ||
        fail "Couldn't reach $host for release $version." \
            "Check your connection. If $version is not a published release, drop OPERATOR_VERSION."
    finish "Line check" "$host reachable" "$(lamps lit)"

    download "$release/$asset" "$work/$asset" Dialing "$asset"

    expected=$(awk -v name="$asset" '$2 == name || $2 == "*" name { print $1 }' "$work/SHA256SUMS")
    if [ -z "$expected" ] || [ "$expected" != "$(sha256 "$work/$asset")" ]; then
        fail "The download does not match its SHA-256 checksum, so nothing was installed." \
            "Run the same command again. If it keeps failing, open an issue:" \
            "https://github.com/DanielEsc0911/operator-mcp/issues"
    fi
    finish Verifying "SHA-256 matches"

    place || fail "Couldn't write to $install_dir." \
        "Pick a folder you own:  OPERATOR_INSTALL_DIR=\$HOME/bin sh install.sh"
    "$install_dir/operator-mcp" --version >/dev/null 2>>"$work/log" ||
        fail "The binary was installed but does not start." "See what it says:  $install_dir/operator-mcp --version"
    finish "Patching in" "$(tilde "$install_dir")/operator-mcp"
    [ "$fancy" = 1 ] && printf '\033[?25h'
    echo

    path_hint
    if [ "$run_setup" = 0 ]; then
        echo "  Installed. When you're ready:  ${bold}operator-mcp setup$reset"
        echo
    elif [ -r /dev/tty ] && (: </dev/tty) 2>/dev/null; then
        echo "  ${accent}Connecting you to setup$ellipsis$reset"
        echo
        rm -rf "$work"
        exec "$install_dir/operator-mcp" setup </dev/tty
    else
        echo "  Installed. There is no terminal here to answer setup's questions, so run it yourself:"
        echo "    ${bold}operator-mcp setup$reset"
        echo
    fi
}

main "$@"
