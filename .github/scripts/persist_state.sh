#!/usr/bin/env bash
# Persiste archivos de estado en el repo con reintentos (evita carreras entre workflows).
# Uso: bash .github/scripts/persist_state.sh "<mensaje de commit>" <archivo1> [archivo2 ...]
# - Solo agrega los archivos que existan; si no hay cambios, termina sin error.
# - Si el push es rechazado, hace `git pull --rebase` y reintenta (hasta 5 veces).
# - Si el rebase choca SOLO en published_news.json, fusiona ambos historiales con news_sources.js.
set -u

msg="$1"; shift
branch="${GITHUB_REF_NAME:-main}"
tmp_dir="${RUNNER_TEMP:-/tmp}"
ours_history="$tmp_dir/published_news.ours.json"

git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'

files=()
for f in "$@"; do
  if [ -f "$f" ]; then files+=("$f"); fi
done
if [ ${#files[@]} -eq 0 ]; then
  echo "ℹ️ No hay archivos de estado que persistir."
  exit 0
fi

git add "${files[@]}"
if git diff --cached --quiet; then
  echo "ℹ️ Sin cambios de estado."
  exit 0
fi
if [ -f published_news.json ]; then cp published_news.json "$ours_history"; fi
git commit -m "$msg"

for attempt in 1 2 3 4 5; do
  if git push origin "HEAD:${branch}"; then
    echo "✅ Estado persistido (intento $attempt)."
    exit 0
  fi
  echo "⚠️ Push rechazado (intento $attempt). Rebase contra origin/${branch}..."
  if ! git pull --rebase origin "$branch"; then
    conflicted="$(git diff --name-only --diff-filter=U)"
    if [ "$conflicted" = "published_news.json" ] && [ -f "$ours_history" ]; then
      # Durante un rebase, --ours es la versión remota: le fusionamos nuestras entradas
      git checkout --ours published_news.json
      node news_sources.js merge-history "$ours_history"
      git add published_news.json
      if ! GIT_EDITOR=true git rebase --continue; then
        git rebase --abort
        echo "❌ No se pudo continuar el rebase."
        exit 1
      fi
    else
      echo "❌ Conflicto no resoluble automáticamente: ${conflicted}"
      git rebase --abort
      exit 1
    fi
  fi
  sleep $((attempt * 3))
done

echo "❌ No se pudo hacer push del estado tras 5 intentos."
exit 1
