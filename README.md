*LINK:* https://gabriel-2911.github.io/Finexor/
# 📊 Finexor

**Finexor** é um dashboard interativo e gratuito de análise comparativa de ativos reais, com base em dados históricos autênticos de ações, índices, ETFs e benchmarks como o CDI. Ele também fornece um diagnóstico do perfil de investidor com base em um quiz simples.

---

## 🔍 Funcionalidades

- 📈 Comparação de ativos reais (ações, índices, CDI, IVVB11 etc.)
- 📉 Gráficos interativos com filtros por período
- ⚖️ Indicadores financeiros (Rentabilidade, Volatilidade, Sharpe, Drawdown)
- 🧠 Diagnóstico de perfil de investidor com base em perguntas
- 📄 Interface 100% estática com GitHub Pages
- 💡 Código open source, fácil de estender e adaptar

---

## 🚀 Como executar localmente

1. Clone o repositório:

```bash
git clone https://github.com/gabrielryuu/Finexor.git
cd Finexor
Instale as dependências Python:

bash
Copiar
Editar
pip install -r requirements.txt
Execute o script de geração dos gráficos e KPIs:

bash
Copiar
Editar
python scripts/generate_html.py
Abra o arquivo docs/index.html no navegador ou publique via GitHub Pages.

🗂 Estrutura de Pastas
bash
Copiar
Editar
Finexor/
│
├── docs/                   # Página principal (GitHub Pages)
│   ├── index.html          # Dashboard principal
│   └── assets/
│       └── data/
│           ├── kpis.html   # Indicadores gerados dinamicamente
│           └── comparador/ # Gráficos HTML individuais e comparativos
│
├── scripts/
│   └── generate_html.py    # Script para gerar KPIs e gráficos
│
├── requirements.txt        # Dependências do projeto
└── README.md               # Este arquivo
🧪 Tecnologias Utilizadas
Plotly – Gráficos interativos

Pandas – Manipulação de dados

yFinance – Coleta de dados históricos de ativos

Bootstrap – Estilização do dashboard

📊 Fontes de Dados
Yahoo Finance (via yFinance)

CDI Bacen (via API do SGS, se disponível)

Indicadores simulados com base em taxas reais

🛡 Licença
Este projeto é de código aberto, sob a licença MIT. Sinta-se à vontade para usar, modificar e compartilhar.

👨‍💻 Autor
Gabriel Cortes Teixeira
Estagiário de Análise de Sistemas – RB Investimentos
Bacharelado em Sistemas de Informação – Universidade São Judas Tadeu
LinkedIn: gabrielryuu (opcional)
