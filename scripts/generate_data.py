#!/usr/bin/env python3
"""
Finexor - geração do dataset.

Escreve UM arquivo JSON com as séries de preço ajustado, os proventos e os
metadados do catálogo. Toda a análise (janela, normalização, KPIs, backtest de
carteira, correlação) acontece no navegador.

Uso:
    python scripts/generate_data.py
    python scripts/generate_data.py --inicio 2019-01-01
    python scripts/generate_data.py --sem-proventos    # coleta mais rápida
    python scripts/generate_data.py --indentar --verboso

Saída: docs/assets/data/dataset.json
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import requests

log = logging.getLogger("finexor")

# --------------------------------------------------------------------------
# Catálogo
# --------------------------------------------------------------------------
# Para incluir um ativo, acrescente uma linha. Nada mais precisa mudar —
# nem no script, nem no front-end.


@dataclass(frozen=True)
class Ativo:
    ticker: str  # símbolo no Yahoo Finance
    codigo: str  # como aparece na interface
    nome: str
    classe: str  # acao | etf | indice | benchmark
    setor: str = ""


CATALOGO: list[Ativo] = [
    # ações
    Ativo("PETR4.SA", "PETR4", "Petrobras PN", "acao", "Petróleo e gás"),
    Ativo("VALE3.SA", "VALE3", "Vale", "acao", "Mineração"),
    Ativo("ITUB4.SA", "ITUB4", "Itaú Unibanco PN", "acao", "Bancos"),
    Ativo("BBAS3.SA", "BBAS3", "Banco do Brasil", "acao", "Bancos"),
    Ativo("BBDC4.SA", "BBDC4", "Bradesco PN", "acao", "Bancos"),
    Ativo("ITSA4.SA", "ITSA4", "Itaúsa PN", "acao", "Holding"),
    Ativo("B3SA3.SA", "B3SA3", "B3", "acao", "Serviços financeiros"),
    Ativo("PSSA3.SA", "PSSA3", "Porto Seguro", "acao", "Seguros"),
    Ativo("WEGE3.SA", "WEGE3", "WEG", "acao", "Bens de capital"),
    Ativo("EGIE3.SA", "EGIE3", "Engie Brasil", "acao", "Energia elétrica"),
    Ativo("TAEE11.SA", "TAEE11", "Taesa", "acao", "Energia elétrica"),
    Ativo("ABEV3.SA", "ABEV3", "Ambev", "acao", "Bebidas"),
    Ativo("RENT3.SA", "RENT3", "Localiza", "acao", "Aluguel de veículos"),
    Ativo("SUZB3.SA", "SUZB3", "Suzano", "acao", "Papel e celulose"),
    # ETFs
    Ativo("BOVA11.SA", "BOVA11", "Ibovespa (ETF)", "etf", "Índice amplo BR"),
    Ativo("IVVB11.SA", "IVVB11", "S&P 500 em BRL", "etf", "Exterior"),
    Ativo("SMAL11.SA", "SMAL11", "Small Caps", "etf", "Small caps BR"),
    Ativo("XFIX11.SA", "XFIX11", "IFIX (ETF)", "etf", "Fundos imobiliários"),
    Ativo("IMAB11.SA", "IMAB11", "IMA-B / Tesouro IPCA", "etf", "Renda fixa"),
    Ativo("GOLD11.SA", "GOLD11", "Ouro", "etf", "Commodity"),
    # índices
    Ativo("^BVSP", "IBOV", "Ibovespa", "indice", "Índice amplo BR"),
]

# Série 12 do SGS/Bacen = CDI acumulado no dia, em % a.d.
SGS_CDI = 12
SGS_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.{serie}/dados"
CDI_FALLBACK_AA = 0.1365  # só se o Bacen estiver fora do ar

COBERTURA_MINIMA = 0.30  # abaixo disso a série não sustenta indicador nenhum


# --------------------------------------------------------------------------
# Coleta
# --------------------------------------------------------------------------


def baixar_precos(ativos: list[Ativo], inicio: str) -> pd.DataFrame:
    """Fechamentos ajustados, com colunas renomeadas para o código da interface."""
    import yfinance as yf

    tickers = [a.ticker for a in ativos]
    log.info("Baixando %d ativos do Yahoo Finance desde %s...", len(tickers), inicio)

    bruto = yf.download(
        tickers,
        start=inicio,
        auto_adjust=True,
        progress=False,
        group_by="column",
        threads=True,
    )
    if bruto.empty:
        raise RuntimeError(
            "yfinance devolveu DataFrame vazio. Verifique conexão, os tickers "
            "do CATALOGO e se não há rate limit ativo."
        )

    fechamento = bruto["Close"] if "Close" in bruto.columns else bruto
    if isinstance(fechamento, pd.Series):
        fechamento = fechamento.to_frame(name=tickers[0])

    fechamento = fechamento.rename(columns={a.ticker: a.codigo for a in ativos})
    fechamento.index = pd.to_datetime(fechamento.index).tz_localize(None).normalize()
    fechamento = fechamento.sort_index()

    # Cobertura baixa vira ruído na interface: descarta em vez de exibir.
    total = len(fechamento.index)
    ruins = {
        c: fechamento[c].notna().sum() / total
        for c in fechamento.columns
        if fechamento[c].notna().sum() / total < COBERTURA_MINIMA
    }
    if ruins:
        for c, cob in sorted(ruins.items()):
            log.warning("Removendo %s: só %.1f%% de cobertura no período.", c, cob * 100)
        fechamento = fechamento.drop(columns=list(ruins))

    return fechamento


def baixar_proventos(ativos: list[Ativo], codigos: set[str], inicio: str) -> dict:
    """
    Dividendos e JCP por ativo, best-effort.

    Os preços já vêm ajustados por proventos (auto_adjust=True), então isso não
    entra no cálculo de retorno — é para exibir dividend yield e histórico de
    pagamento, que é o número que o investidor brasileiro olha primeiro.
    """
    import yfinance as yf

    d0 = pd.Timestamp(inicio)
    saida: dict[str, list] = {}

    for a in ativos:
        if a.codigo not in codigos or a.classe == "indice":
            continue
        try:
            serie = yf.Ticker(a.ticker).dividends
            if serie is None or serie.empty:
                continue
            serie.index = pd.to_datetime(serie.index).tz_localize(None).normalize()
            serie = serie[serie.index >= d0]
            if serie.empty:
                continue
            saida[a.codigo] = [
                [d.strftime("%Y-%m-%d"), round(float(v), 6)] for d, v in serie.items()
            ]
        except Exception as exc:  # noqa: BLE001
            log.debug("Proventos de %s indisponíveis: %s", a.codigo, exc)

    log.info("Proventos coletados para %d ativos.", len(saida))
    return saida


def baixar_cdi(inicio: str, fim: date) -> pd.Series | None:
    """CDI diário real do SGS/Bacen (série 12), em taxa decimal ao dia."""
    d0 = datetime.strptime(inicio, "%Y-%m-%d").date()
    params = {
        "formato": "json",
        "dataInicial": d0.strftime("%d/%m/%Y"),
        "dataFinal": fim.strftime("%d/%m/%Y"),
    }
    try:
        log.info("Buscando CDI na API do Bacen (SGS %d)...", SGS_CDI)
        resp = requests.get(
            SGS_URL.format(serie=SGS_CDI),
            params=params,
            timeout=30,
            headers={"Accept": "application/json"},
        )
        resp.raise_for_status()
        registros = resp.json()
    except Exception as exc:  # noqa: BLE001
        log.warning("Bacen indisponível (%s). Usando taxa fixa de contingência.", exc)
        return None

    if not registros:
        log.warning("Bacen respondeu vazio. Usando taxa fixa de contingência.")
        return None

    df = pd.DataFrame(registros)
    df["data"] = pd.to_datetime(df["data"], format="%d/%m/%Y")
    df["valor"] = pd.to_numeric(df["valor"].str.replace(",", "."), errors="coerce")
    df = df.dropna(subset=["valor"]).set_index("data").sort_index()

    taxa = df["valor"] / 100.0
    log.info("CDI: %d observações (%s a %s)", len(taxa),
             taxa.index[0].date(), taxa.index[-1].date())
    return taxa


def montar_serie_cdi(taxa: pd.Series | None, calendario: pd.DatetimeIndex) -> pd.Series:
    """Fator acumulado do CDI alinhado ao calendário de pregão."""
    if taxa is None:
        diaria = (1 + CDI_FALLBACK_AA) ** (1 / 252) - 1
        return pd.Series(
            (1 + diaria) ** np.arange(len(calendario)), index=calendario, dtype=float
        )
    # Feriado de banco que não é feriado de bolsa não pode zerar o dia.
    return (1.0 + taxa.reindex(calendario).fillna(0.0)).cumprod()


# --------------------------------------------------------------------------
# Serialização
# --------------------------------------------------------------------------


def serializar(
    precos: pd.DataFrame,
    ativos: list[Ativo],
    proventos: dict,
    fonte_cdi: str,
) -> dict:
    meta_por_codigo = {a.codigo: a for a in ativos}
    ordem_classe = {"acao": 0, "etf": 1, "indice": 2, "benchmark": 3}

    series = {}
    for codigo in precos.columns:
        info = meta_por_codigo.get(codigo)
        series[codigo] = {
            "nome": info.nome if info else codigo,
            "classe": info.classe if info else "outro",
            "setor": info.setor if info else "",
            # 4 casas cortam ~35% do arquivo sem afetar nenhum indicador
            "valores": [
                None if pd.isna(v) else round(float(v), 4) for v in precos[codigo]
            ],
        }
        if codigo in proventos:
            series[codigo]["proventos"] = proventos[codigo]

    codigos = sorted(
        series, key=lambda c: (ordem_classe.get(series[c]["classe"], 9), c)
    )

    return {
        "meta": {
            "gerado_em": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "inicio": precos.index[0].strftime("%Y-%m-%d"),
            "fim": precos.index[-1].strftime("%Y-%m-%d"),
            "pregoes": len(precos.index),
            "fonte_precos": "Yahoo Finance (yfinance), fechamento ajustado",
            "fonte_cdi": fonte_cdi,
            "ordem": codigos,
        },
        "datas": [d.strftime("%Y-%m-%d") for d in precos.index],
        "series": {c: series[c] for c in codigos},
    }


def validar(payload: dict) -> None:
    n = len(payload["datas"])
    if n < 30:
        raise ValueError(f"Dataset com apenas {n} pregões — algo falhou na coleta.")

    for codigo, s in payload["series"].items():
        if len(s["valores"]) != n:
            raise ValueError(f"{codigo}: {len(s['valores'])} valores para {n} datas.")
        cob = sum(1 for v in s["valores"] if v is not None) / n
        if cob < COBERTURA_MINIMA:
            raise ValueError(f"{codigo} passou pelo filtro com {cob:.0%} de cobertura.")

    if "CDI" not in payload["series"]:
        raise ValueError("CDI ausente — o Sharpe depende dele.")

    log.info("Validação OK: %d pregões, %d séries.", n, len(payload["series"]))


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Gera o dataset do Finexor.")
    p.add_argument("--inicio", default="2022-01-01", help="data inicial (YYYY-MM-DD)")
    p.add_argument("--saida", default="docs/assets/data", help="diretório de saída")
    p.add_argument("--sem-proventos", action="store_true", help="pula a coleta de dividendos")
    p.add_argument("--indentar", action="store_true", help="JSON legível (arquivo ~2x maior)")
    p.add_argument("--verboso", action="store_true")
    args = p.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verboso else logging.INFO,
        format="%(levelname)-7s %(message)s",
    )

    try:
        precos = baixar_precos(CATALOGO, args.inicio)
    except Exception as exc:  # noqa: BLE001
        log.error("Falha na coleta de preços: %s", exc)
        return 1

    codigos = set(precos.columns)
    proventos = (
        {} if args.sem_proventos else baixar_proventos(CATALOGO, codigos, args.inicio)
    )

    taxa = baixar_cdi(args.inicio, precos.index[-1].date())
    fonte_cdi = (
        "Bacen/SGS série 12 (CDI diário)"
        if taxa is not None
        else f"taxa fixa de contingência ({CDI_FALLBACK_AA:.2%} a.a.) — Bacen indisponível"
    )
    precos["CDI"] = montar_serie_cdi(taxa, precos.index)

    ativos = CATALOGO + [Ativo("", "CDI", "CDI acumulado", "benchmark", "Renda fixa pós")]
    payload = serializar(precos, ativos, proventos, fonte_cdi)
    validar(payload)

    destino = Path(args.saida)
    destino.mkdir(parents=True, exist_ok=True)
    arquivo = destino / "dataset.json"
    arquivo.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2 if args.indentar else None),
        encoding="utf-8",
    )

    log.info(
        "Escrito %s (%.0f KB, %d séries, %d pregões)",
        arquivo, arquivo.stat().st_size / 1024,
        len(payload["series"]), len(payload["datas"]),
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
