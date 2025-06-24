import yfinance as yf
import pandas as pd
import numpy as np
import plotly.graph_objs as go
import os

tickers = {
    "VALE3.SA": "VALE3",
    "PETR4.SA": "PETR4",
    "ITUB4.SA": "ITUB4",
    "BBAS3.SA": "BBAS3",
    "B3SA3.SA": "B3SA3",
    "WEGE3.SA": "WEGE3",
    "^BVSP": "IBOV",
    "^IFIX": "IFIX"
}

start_date = "2022-01-01"
df_all = yf.download(list(tickers.keys()), start=start_date)["Adj Close"]
df_all.columns = [tickers[t] for t in df_all.columns]

cdi_rate_aa = 0.1365
cdi_daily = (1 + cdi_rate_aa) ** (1 / 252) - 1
df_all["CDI"] = (1 + cdi_daily) ** np.arange(len(df_all))
df_all["CDI"] = df_all["CDI"] / df_all["CDI"].iloc[0]

df_norm = df_all / df_all.iloc[0]

def calc_kpis(series):
    rentab = series[-1] - 1
    vol = np.std(series.pct_change()) * np.sqrt(252)
    sharpe = (rentab - cdi_rate_aa) / vol if vol > 0 else 0
    rolling_max = series.cummax()
    drawdown = (series / rolling_max - 1).min()
    return pd.Series({
        "Rentabilidade": f"{rentab*100:.2f}%",
        "Volatilidade": f"{vol*100:.2f}%",
        "Sharpe": f"{sharpe:.2f}",
        "Drawdown": f"{drawdown*100:.2f}%"
    })

kpis_df = df_norm.apply(calc_kpis)

output_path = "docs/assets/data"
grafico_path = os.path.join(output_path, "graficos")
os.makedirs(grafico_path, exist_ok=True)

# Gráfico individual por ativo
for ativo in df_norm.columns:
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=df_norm.index, y=df_norm[ativo], mode='lines', name=ativo))
    fig.update_layout(title=f"Rentabilidade Acumulada - {ativo}",
                      xaxis_title="Data",
                      yaxis_title="Rentabilidade Normalizada",
                      template="plotly_white")
    fig.write_html(f"{grafico_path}/{ativo}.html", include_plotlyjs="cdn", full_html=True)

# Gera KPIs
kpi_html = "<div class='row my-4'>\n"
for ativo in kpis_df.columns:
    kpi_html += f"<div class='col-md-3'><div class='bg-light kpi-card'><strong>{ativo}</strong><br/>"
    for metric, value in kpis_df[ativo].items():
        kpi_html += f"{metric}: {value}<br/>"
    kpi_html += "</div></div>\n"
kpi_html += "</div>"

with open(f"{output_path}/kpis.html", "w", encoding="utf-8") as f:
    f.write(kpi_html)

print("✅ Dashboard atualizado com sucesso.")
