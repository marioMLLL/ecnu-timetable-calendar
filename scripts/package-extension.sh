#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
VERSION=$(node -p "require('$ROOT_DIR/manifest.json').version")
OUTPUT_DIR="$ROOT_DIR/dist"
OUTPUT_FILE="$OUTPUT_DIR/ecnu-timetable-calendar-v$VERSION.zip"

mkdir -p "$OUTPUT_DIR"
cd "$ROOT_DIR"
zip -r -FS "$OUTPUT_FILE" \
  manifest.json \
  api-hook.js \
  content.js \
  background.js \
  popup.html \
  popup.css \
  popup.js \
  lib \
  vendor \
  mobile \
  README.md \
  THIRD-PARTY-NOTICES.md \
  LICENSE

echo "Created $OUTPUT_FILE"
