#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${1:-.}"
OUTPUT_DIR="${2:-atlas-restored}"
PREFIX="${ATLAS_PAYLOAD_PREFIX:-atlas34.part}"
EXPECTED_PARTS="${ATLAS_EXPECTED_PARTS:-16}"

cd "$ROOT_DIR"

parts=()
for i in $(seq -w 0 $((EXPECTED_PARTS - 1))); do
  part="${PREFIX}.${i}"
  if [[ ! -f "$part" ]]; then
    echo "Missing payload segment: $part" >&2
    exit 1
  fi
  parts+=("$part")
done

mkdir -p "$OUTPUT_DIR"
archive="$(mktemp -t atlas-payload.XXXXXX.tgz)"
trap 'rm -f "$archive"' EXIT

cat "${parts[@]}" | base64 --decode > "$archive"
gzip -t "$archive"
tar -xzf "$archive" -C "$OUTPUT_DIR"

echo "Atlas payload restored to: $OUTPUT_DIR"
