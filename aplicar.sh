#!/usr/bin/env bash
# ==========================================================================
# Finexor — cria a estrutura de pastas e coloca os arquivos novos no lugar.
#
#   bash aplicar.sh                    # pega os arquivos de ~/Downloads
#   bash aplicar.sh ~/Desktop/finexor  # ou de onde você tiver salvado
#   bash aplicar.sh --so-pastas        # só cria os diretórios, sem mover nada
#
# Roda a partir da raiz do repositório. Não sobrescreve nada sem antes
# guardar um .bak, e não apaga o legado — isso é o limpar_legado.sh.
# ==========================================================================
set -euo pipefail

ORIGEM="${1:-$HOME/Downloads}"
SO_PASTAS=0
[[ "${1:-}" == "--so-pastas" ]] && { SO_PASTAS=1; ORIGEM=""; }

# Sai da raiz do repo se estivermos numa subpasta
if git rev-parse --show-toplevel >/dev/null 2>&1; then
  cd "$(git rev-parse --show-toplevel)"
else
  echo "! Não estou dentro de um repositório git."
  echo "  Rode a partir da pasta Finexor/ (ou faça git init antes)."
  exit 1
fi

echo "Repositório: $PWD"
echo

# --------------------------------------------------------------------------
# 1. Estrutura
# --------------------------------------------------------------------------
PASTAS=(
  "docs/assets/css"
  "docs/assets/js"
  "docs/assets/data"
  "scripts"
  ".github/workflows"
)

echo "Criando estrutura:"
for p in "${PASTAS[@]}"; do
  if [[ -d "$p" ]]; then
    printf '  = %s\n' "$p"
  else
    mkdir -p "$p"
    printf '  + %s\n' "$p"
  fi
done
echo

if [[ $SO_PASTAS -eq 1 ]]; then
  echo "Pastas criadas. Agora é só jogar os arquivos nos caminhos abaixo:"
  printf '  %s\n' \
    "scripts/generate_data.py" \
    "scripts/limpar_legado.sh" \
    "docs/index.html" \
    "docs/assets/css/finexor.css" \
    "docs/assets/js/finexor.js" \
    ".github/workflows/atualizar-dados.yml" \
    "requirements.txt" \
    "README.md" \
    ".gitignore"
  exit 0
fi

# --------------------------------------------------------------------------
# 2. Realocação
# --------------------------------------------------------------------------
# arquivo_baixado -> destino_no_repo
MAPA=(
  "generate_data.py|scripts/generate_data.py"
  "limpar_legado.sh|scripts/limpar_legado.sh"
  "index.html|docs/index.html"
  "finexor.css|docs/assets/css/finexor.css"
  "finexor.js|docs/assets/js/finexor.js"
  "atualizar-dados.yml|.github/workflows/atualizar-dados.yml"
  "requirements.txt|requirements.txt"
  "README.md|README.md"
  ".gitignore|.gitignore"
)

if [[ ! -d "$ORIGEM" ]]; then
  echo "! Pasta de origem não existe: $ORIGEM"
  exit 1
fi

echo "Origem: $ORIGEM"
echo
movidos=0
faltando=()

for par in "${MAPA[@]}"; do
  nome="${par%%|*}"
  destino="${par##*|}"
  base="${nome%.*}"
  ext="${nome##*.}"

  # O navegador renomeia duplicatas para "arquivo (1).ext" — pega a mais recente.
  candidato=""
  while IFS= read -r -d '' f; do
    candidato="$f"
  done < <(find "$ORIGEM" -maxdepth 1 -type f \
             \( -name "$nome" -o -name "$base ([0-9]).$ext" -o -name "$base-[0-9].$ext" \) \
             -printf '%T@ %p\0' 2>/dev/null | sort -zn | sed -z 's/^[0-9.]* //')

  if [[ -z "$candidato" ]]; then
    faltando+=("$nome")
    continue
  fi

  if [[ -f "$destino" ]] && ! cmp -s "$candidato" "$destino"; then
    cp "$destino" "$destino.bak"
    printf '  ~ %-42s (original salvo em %s.bak)\n' "$destino" "$destino"
  else
    printf '  > %s\n' "$destino"
  fi

  install -D -m 644 "$candidato" "$destino"
  movidos=$((movidos + 1))
done

chmod +x scripts/limpar_legado.sh 2>/dev/null || true

echo
echo "$movidos de ${#MAPA[@]} arquivos posicionados."

if [[ ${#faltando[@]} -gt 0 ]]; then
  echo
  echo "Não encontrei em $ORIGEM:"
  printf '  - %s\n' "${faltando[@]}"
  echo "  Baixe esses e rode de novo, ou copie na mão."
fi

# --------------------------------------------------------------------------
# 3. Próximos passos
# --------------------------------------------------------------------------
cat <<'FIM'

Próximos passos:

  bash scripts/limpar_legado.sh          # remove os 291 HTMLs e o plotly.min.js
  pip install -r requirements.txt
  python scripts/generate_data.py        # gera docs/assets/data/dataset.json
  python -m http.server 8000 --directory docs

Depois abra http://localhost:8000 (o fetch do dataset não funciona em file://).
FIM
