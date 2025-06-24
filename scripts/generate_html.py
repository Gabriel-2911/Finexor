import yfinance as yf
import pandas as pd
import numpy as np
import plotly.graph_objs as go
import os
import itertools

# Lista de ativos
tickers = {
    "VALE3.SA": "VALE3",
    "PETR4.SA": "PETR4",
    "ITUB4.SA": "ITUB4",
    "BBAS3.SA": "BBAS3",
    "B3SA3.SA": "B3SA3",
    "WEGE3.SA": "WEGE3",
    "^BVSP": "IBOV",
    "IVVB11.SA": "IVVB11"
}

start_date = "2022-01-01"
df_all = yf.download(list(tickers.keys()), start=start_date, auto_adjust=True)["Close"]
df_all.columns = [tickers.get(col, col) for col in df_all.columns]

# CDI simulado como benchmark
cdi_rate_aa = 0.1365
cdi_daily = (1 + cdi_rate_aa) ** (1 / 252) - 1
df_all["CDI"] = (1 + cdi_daily) ** np.arange(len(df_all))
df_all["CDI"] = df_all["CDI"] / df_all["CDI"].iloc[0]

# Normaliza os ativos
df_norm = df_all / df_all.iloc[0]

# KPIs
def calc_kpis(series):
    rentab = series.iloc[-1] - 1
    vol = np.std(series.pct_change(fill_method=None)) * np.sqrt(252)
    sharpe = (rentab - cdi_rate_aa) / vol if vol > 0 else 0
    drawdown = (series / series.cummax() - 1).min()
    return pd.Series({
        "Rentabilidade": f"{rentab*100:.2f}%",
        "Volatilidade": f"{vol*100:.2f}%",
        "Sharpe": f"{sharpe:.2f}",
        "Drawdown": f"{drawdown*100:.2f}%"
    })

kpis_df = df_norm.apply(calc_kpis)

# Caminhos
output_path = "docs/assets/data/graficos"
os.makedirs(output_path, exist_ok=True)

# Gráficos individuais
for ativo in df_norm.columns:
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=df_norm.index, y=df_norm[ativo], mode='lines', name=ativo))
    fig.update_layout(
        title=f"Rentabilidade Acumulada - {ativo}",
        xaxis_title="Data",
        yaxis_title="Rentabilidade Normalizada",
        template="plotly_white"
    )
    fig.write_html(f"{output_path}/{ativo}.html", include_plotlyjs="cdn", full_html=True)

# Gráficos comparativos (duplas únicas ordenadas)
ativos = df_norm.columns.tolist()
pares = list(itertools.combinations(sorted(ativos), 2))

for a1, a2 in pares:
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=df_norm.index, y=df_norm[a1], mode='lines', name=a1))
    fig.add_trace(go.Scatter(x=df_norm.index, y=df_norm[a2], mode='lines', name=a2))
    fig.update_layout(
        title=f"Comparativo - {a1} vs {a2}",
        xaxis_title="Data",
        yaxis_title="Rentabilidade Normalizada",
        template="plotly_white"
    )
    nome_arquivo = f"{a1}_{a2}.html"
    fig.write_html(f"{output_path}/{nome_arquivo}", include_plotlyjs="cdn", full_html=True)

# KPIs HTML
kpi_output = "docs/assets/data/kpis.html"
kpi_html = "<div class='row my-4'>\n"
for ativo in kpis_df.columns:
    kpi_html += f"<div class='col-md-3'><div class='bg-light kpi-card'><strong>{ativo}</strong><br/>"
    for metric, value in kpis_df[ativo].items():
        kpi_html += f"{metric}: {value}<br/>"
    kpi_html += "</div></div>\n"
kpi_html += "</div>"

with open(kpi_output, "w", encoding="utf-8") as f:
    f.write(kpi_html)

print("✅ Dashboard gerado com sucesso!")
