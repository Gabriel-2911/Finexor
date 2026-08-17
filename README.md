# Finexor

Comparador de ativos da B3 e simulador de carteira. Retorno, risco e
rebalanceamento calculados sobre séries reais de preço — ações, ETFs, índices
e CDI.

**[Abrir o dashboard](https://gabriel-2911.github.io/Finexor/)**

---

## O que ele faz

**Comparar** — até 6 ativos simultâneos em qualquer combinação. Rentabilidade
acumulada, curva de quedas ou retorno por ano-calendário. Tabela com retorno,
retorno anualizado, volatilidade, Sharpe, Sortino, queda máxima, beta e
dividend yield, tudo recalculado para a janela escolhida.

**Carteira** — backtest de alocação com aporte mensal, rebalanceamento
(mensal, trimestral, anual ou nenhum) e custo por operação. Compara contra
CDI e IBOV no mesmo regime de aportes, e separa o retorno da cota do efeito do
timing dos depósitos.

**Risco** — dispersão risco × retorno com a linha do CDI, matriz de correlação
entre retornos diários, distribuição de todas as janelas móveis de 3 a 24
meses, e tabela de maiores quedas com tempo de recuperação.

**Perfil** — questionário de quatro perguntas que termina numa alocação
carregada direto no simulador, em vez de num rótulo solto.

A comparação inteira vive na URL, então vira link compartilhável.

## Arquitetura

O gerador escreve **um** `dataset.json` (~180 KB) com as séries de preço
ajustado e os proventos. O navegador faz o resto: recorte de janela,
normalização, indicadores, backtest e desenho.

```
Finexor/
├── docs/                          # publicado no GitHub Pages
│   ├── index.html
│   └── assets/
│       ├── css/finexor.css
│       ├── js/
│       │   ├── calc.js            # matemática pura, sem DOM
│       │   ├── charts.js          # única camada que conhece o Plotly
│       │   └── app.js             # estado, navegação, renderização
│       └── data/dataset.json      # gerado
│
├── scripts/
│   ├── generate_data.py           # yfinance + Bacen SGS -> dataset.json
│   └── limpar_legado.sh
│
├── .github/workflows/atualizar-dados.yml
└── requirements.txt
```

Adicionar um ativo é **uma linha** em `CATALOGO`, dentro de
`generate_data.py`. Nada mais precisa mudar.

## Rodando localmente

```bash
git clone https://github.com/Gabriel-2911/Finexor.git
cd Finexor
pip install -r requirements.txt

python scripts/generate_data.py

# fetch() e ES modules nao funcionam em file:// - precisa de servidor
python -m http.server 8000 --directory docs
```

Opções:

```bash
python scripts/generate_data.py --inicio 2019-01-01   # histórico mais longo
python scripts/generate_data.py --sem-proventos       # coleta mais rápida
python scripts/generate_data.py --indentar --verboso  # depuração
```

## Metodologia

| Indicador | Cálculo |
|---|---|
| Retorno | último ÷ primeiro **da janela** − 1 |
| Retorno a.a. | (1 + retorno) ^ (252 ÷ pregões) − 1 |
| Volatilidade | desvio padrão amostral dos retornos diários × √252 |
| Sharpe | (retorno a.a. − CDI a.a. **da mesma janela**) ÷ volatilidade a.a. |
| Sortino | mesmo numerador, denominador = desvio só das quedas × √252 |
| Queda máxima | menor valor de (preço ÷ máxima acumulada − 1) |
| Recuperação | dias corridos do fundo até reencostar no topo anterior |
| Beta | cov(ativo, IBOV) ÷ var(IBOV), sobre retornos diários |
| Correlação | Pearson dos retornos diários |
| DY 12m | proventos declarados em 12 meses ÷ preço atual |
| Retorno da cota | simulação sem aportes — isola performance do timing |

Volatilidade nula devolve traço (—) em vez de Sharpe infinito. Séries com
menos de 20 observações em comum não recebem beta nem correlação. Ativos com
menos de 30% de cobertura no período são descartados na geração.

O retorno por ano-calendário parte do fechamento do ano anterior, não do
primeiro pregão de janeiro, para não perder o gap de virada.

## Fontes

- Preços: Yahoo Finance via `yfinance`, fechamento ajustado por proventos e
  desdobramentos.
- CDI: Banco Central, [API do SGS](https://dadosabertos.bcb.gov.br/), série 12
  (taxa diária). Se a API estiver fora, o script cai para uma taxa fixa de
  contingência e registra isso em `meta.fonte_cdi`, que aparece no rodapé da
  página.

## Limitações conhecidas

- Sem dados fundamentalistas (P/L, ROE, margens) — o dataset é só preço.
- O backtest ignora imposto de renda, come-cotas e corretagem além do custo de
  rebalanceamento informado.
- Simulação limitada ao histórico comum dos ativos escolhidos: incluir um ETF
  recente encurta a janela inteira.
- Rentabilidade passada não indica resultado futuro.

## Aviso

Projeto educacional e open source. Não é recomendação de investimento e não
substitui a análise de suitability da sua corretora.

## Licença

MIT.

---

**Gabriel Cortes Teixeira** — Analista Desenvolvedor, RB Investimentos
Bacharelado em Sistemas de Informação, Universidade São Judas Tadeu
[LinkedIn](https://www.linkedin.com/in/gabriel-cortes-teixeira-0b9a4722b/)
