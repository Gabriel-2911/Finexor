import dash
from dash import html, dcc, Input, Output
import pandas as pd
import plotly.express as px

# Inicializa o app
app = dash.Dash(__name__)
server = app.server  # necessário para Render.com

# Carrega os dados
df = pd.read_csv("../data/ativos.csv", parse_dates=["Date"])

# Layout
app.layout = html.Div([
    html.Div([
        html.H2("📊 FinProfile", style={"textAlign": "center"}),
        html.P("Simulador de Carteira e Perfil de Investidor"),
        html.P("Dados reais com análise de risco e retorno."),
        html.Hr(),
        html.Label("Escolha um ativo:"),
        dcc.Dropdown(
            id="ativo-dropdown",
            options=[{"label": a, "value": a} for a in sorted(df["Ativo"].unique())],
            value="PETR4.SA"
        ),
    ], style={"width": "25%", "float": "left", "padding": "20px"}),

    html.Div([
        dcc.Graph(id="grafico-rentabilidade")
    ], style={"width": "70%", "float": "right", "padding": "20px"})
])

# Callback do gráfico
@app.callback(
    Output("grafico-rentabilidade", "figure"),
    Input("ativo-dropdown", "value")
)
def atualizar_grafico(ativo):
    df_ativo = df[df["Ativo"] == ativo].copy()
    df_ativo["Rentabilidade"] = df_ativo["Adj Close"].pct_change().fillna(0)
    df_ativo["Rentabilidade Acumulada"] = (1 + df_ativo["Rentabilidade"]).cumprod()

    fig = px.line(df_ativo, x="Date", y="Rentabilidade Acumulada",
                  title=f"Rentabilidade Acumulada de {ativo}")
    fig.update_layout(transition_duration=500)
    return fig

if __name__ == "__main__":
    app.run_server(debug=True)
