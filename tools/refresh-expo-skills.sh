#!/usr/bin/env bash
# Re-vendor the Expo skills listed in .agents/expo-skills.json from upstream.
#
# They are copied rather than installed by the `skills` CLI because Expo stores
# them under plugins/expo/skills/<name>/, not at the path that CLI expects, so
# they are not in skills-lock.json. Whole DIRECTORIES are copied, not just
# SKILL.md: expo-router carries references/ and both carry agents/, and a skill
# missing its references points the agent at files it cannot read.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
manifest="$root/.agents/expo-skills.json"

scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT

source_url=$(node -p "require('$manifest').source")
source_path=$(node -p "require('$manifest').sourcePath")
mapfile -t skills < <(node -p "require('$manifest').skills.join('\n')")

git clone --depth 1 --filter=blob:none --sparse "$source_url" "$scratch/skills" >/dev/null 2>&1
git -C "$scratch/skills" sparse-checkout set "$source_path" >/dev/null

for skill in "${skills[@]}"; do
  src="$scratch/skills/$source_path/$skill"
  if [ ! -d "$src" ]; then
    echo "✖ $skill is not under $source_path in $source_url" >&2
    exit 1
  fi
  rm -rf "${root:?}/.agents/skills/$skill"
  cp -r "$src" "$root/.agents/skills/$skill"
  ln -sfn "../../.agents/skills/$skill" "$root/.claude/skills/$skill"
  echo "vendored $skill"
done

sha=$(git -C "$scratch/skills" rev-parse HEAD)
node -e "
  const fs = require('fs');
  const manifest = JSON.parse(fs.readFileSync('$manifest', 'utf8'));
  manifest.vendoredAt = '$sha';
  manifest.vendoredOn = new Date().toISOString().slice(0, 10);
  fs.writeFileSync('$manifest', JSON.stringify(manifest, null, 2) + '\n');
"
# `vendoredAt` records WHERE these copies came from, for auditing a diff against
# upstream. It is not a pin: this script always clones the default branch tip, so
# re-running it re-vendors whatever is newest, not the recorded commit. To
# reproduce an exact past state, check that SHA out by hand.
echo "recorded upstream $sha (provenance, not a pin — see the comment above)"
