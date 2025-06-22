
import pandas as pd
import yfinance as yf
import plotly.express as px

ticker = "VALE3.SA"
df = yf.download(ticker, start="2022-01-01")
df["Rentabilidade"] = df["Adj Close"].pct_change().fillna(0)
df["Rentabilidade Acumulada"] = (1 + df["Rentabilidade"]).cumprod()

fig = px.line(df, x="Date", y="Rentabilidade Acumulada", title=f"Rentabilidade Acumulada de {ticker}")
fig.write_html("dashboard/output/vale3_rentabilidade.html")
