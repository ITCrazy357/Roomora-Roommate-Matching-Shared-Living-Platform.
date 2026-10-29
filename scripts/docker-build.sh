#!/usr/bin/env bash
set -euo pipefail

# Retry only temporary failures while resolving a base image. Compiler, Dockerfile
# and dependency-install errors must fail immediately, before anything is pushed.
build_log="$(mktemp)"
trap 'rm -f -- "$build_log"' EXIT
for attempt in 1 2 3; do
  if docker build --progress=plain "$@" 2>&1 | tee "$build_log"; then
    exit 0
  else
    build_status=$?
  fi
  if [[ "$attempt" -eq 3 ]] ||
    ! grep -Fq 'failed to resolve source metadata' "$build_log" ||
    ! grep -Eiq 'unexpected status from (HEAD|GET) request to https://[^ ]+: (429|5[0-9]{2})([[:space:]]|$)|TLS handshake timeout|i/o timeout|connection reset by peer|temporary failure in name resolution' "$build_log"; then
    exit "$build_status"
  fi
  delay_seconds=$((attempt * 10))
  printf 'Temporary base-image registry failure; retry %s/3 in %ss.\n' "$((attempt + 1))" "$delay_seconds" >&2
  sleep "$delay_seconds"
done
