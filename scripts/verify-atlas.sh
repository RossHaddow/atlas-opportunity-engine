#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${1:-.}"
PREFIX="${ATLAS_PAYLOAD_PREFIX:-atlas34.part}"
EXPECTED_PARTS="${ATLAS_EXPECTED_PARTS:-16}"

cd "$ROOT_DIR"

parts=()
for i in $(seq -w 0 $((EXPECTED_PARTS - 1))); do
  part="${PREFIX}.${i}"
  if [[ ! -s "$part" ]]; then
    echo "FAIL: missing or empty payload segment: $part" >&2
    exit 1
  fi
  parts+=("$part")
done

archive="$(mktemp -t atlas-payload.XXXXXX.tgz)"
trap 'rm -f "$archive"' EXIT

cat "${parts[@]}" | base64 --decode > "$archive"
gzip -t "$archive"
file_count="$(tar -tzf "$archive" | wc -l | tr -d ' ')"

if [[ "$file_count" -lt 1 ]]; then
  echo "FAIL: Atlas payload archive is empty" >&2
  exit 1
fi

echo "PASS: ${EXPECTED_PARTS} payload segments decoded successfully"
echo "PASS: gzip integrity check succeeded"
echo "PASS: archive contains ${file_count} entries"
