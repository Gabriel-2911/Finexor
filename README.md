# Finexor

Dashboard de análise comparativa de ativos, com dados históricos reais de ações, índices, ETFs e benchmarks como o CDI. Inclui diagnóstico de perfil de investidor a partir de um questionário simples.

**[Acessar o dashboard](https://gabriel-2911.github.io/Finexor/)**

---

## Funcionalidades

- Comparação de ativos reais — ações, índices, CDI, IVVB11 e outros.
- Gráficos interativos com filtro por período.
- Indicadores financeiros: rentabilidade, volatilidade, Sharpe, drawdown.
- Diagnóstico de perfil de investidor a partir de um questionário.
- Interface 100% estática, publicada via GitHub Pages.
- Código aberto, estruturado para ser estendido.

## Tecnologias

- **Plotly** — gráficos interativos
- **Pandas** — manipulação e cálculo dos indicadores
- **yFinance** — coleta de dados históricos de ativos
- **Bootstrap** — estilização do dashboard

## Fontes de dados

- Yahoo Finance, via yFinance
- CDI — Bacen, via API do SGS (quando disponível)
- Indicadores calculados a partir de taxas reais

## Estrutura de pastas

```
Finexor/
├── docs/                    # Página publicada via GitHub Pages
│   ├── index.html           # Dashboard principal
│   └── assets/
│       └── data/
│           ├── kpis.html    # Indicadores gerados dinamicamente
│           └── comparador/  # Gráficos HTML individuais e comparativos
│
├── scripts/
│   └── generate_html.py     # Geração dos KPIs e gráficos
│
├── requirements.txt
└── README.md
```

## Como executar localmente

1. Clone o repositório:

   ```bash
   git clone https://github.com/Gabriel-2911/Finexor.git
   cd Finexor
   ```

2. Instale as dependências:

   ```bash
   pip install -r requirements.txt
   ```

3. Gere os gráficos e KPIs:

   ```bash
   python scripts/generate_html.py
   ```

4. Abra `docs/index.html` no navegador, ou publique via GitHub Pages.

## Licença

Código aberto sob licença MIT. Sinta-se à vontade para usar, modificar e compartilhar.

---

**Gabriel Cortes Teixeira**
Analista Desenvolvedor — RB Investimentos
Bacharelado em Sistemas de Informação — Universidade São Judas Tadeu

[LinkedIn](https://www.linkedin.com/in/gabriel-cortes-teixeira-0b9a4722b/)
