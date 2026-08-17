#!/usr/bin/env bash
# Remove os artefatos do modelo antigo (291 HTMLs + Plotly commitado).
# Rode a partir da raiz do repositório. Confira o git status antes de commitar.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

echo "Antes:"
du -sh docs 2>/dev/null || true

git rm -r --quiet --ignore-unmatch docs/assets/data/comparador
git rm    --quiet --ignore-unmatch docs/assets/data/kpis.html
git rm    --quiet --ignore-unmatch docs/plotly.min.js
git rm    --quiet --ignore-unmatch docs/rentabilidade.html
git rm    --quiet --ignore-unmatch scripts/generate_html.py
git rm    --quiet --ignore-unmatch docs/assets/js/finexor.js   # dividido em calc/charts/app
git rm -r --quiet --ignore-unmatch data

echo "Depois:"
du -sh docs 2>/dev/null || true
echo
echo "Pronto. Agora: python scripts/generate_data.py && git add -A && git commit"
