import pandas as pd
import yfinance as yf
import plotly.express as px
import plotly.io as pio

pio.renderers.default = "browser"

ticker = "VALE3.SA"
df = yf.download(ticker, start="2022-01-01")

# Corrige MultiIndex nas colunas
if isinstance(df.columns, pd.MultiIndex):
    df.columns = df.columns.get_level_values(0)

# Calcular rentabilidade
df["Rentabilidade"] = df["Close"].pct_change().fillna(0)
df["Rentabilidade Acumulada"] = (1 + df["Rentabilidade"]).cumprod()

# Gerar gráfico
fig = px.line(df, x=df.index, y="Rentabilidade Acumulada",
              title="Rentabilidade Acumulada de VALE3")

# Exportar para o GitHub Pages (dentro da pasta docs)
fig.write_html("../docs/output/vale3_rentabilidade.html", include_plotlyjs='directory')
