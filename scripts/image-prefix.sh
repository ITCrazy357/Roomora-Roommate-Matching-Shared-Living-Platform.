#!/usr/bin/env bash
set -euo pipefail

# GitHub permits punctuation at the end of repo names; Docker image names do not.
repository="${GITHUB_REPOSITORY#*/}"
repository="${repository,,}"
repository="$(printf '%s' "$repository" | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')"
if [[ -z "$repository" ]]; then
  printf 'Repository name cannot produce a Docker image name\n' >&2
  exit 1
fi
printf 'ghcr.io/%s/%s\n' "${GITHUB_REPOSITORY_OWNER,,}" "$repository"
