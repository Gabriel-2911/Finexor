/* ==========================================================================
   Finexor — núcleo de cálculo.

   Funções puras, sem DOM e sem Plotly. Tudo que a interface mostra sai daqui,
   o que permite testar a matemática isoladamente.
   ========================================================================== */

export const DIAS_UTEIS_ANO = 252;

/* --------------------------------------------------------------------------
   Janela
   -------------------------------------------------------------------------- */

/**
 * Índice da primeira data dentro de `dias` corridos a partir do fim da série.
 *
 * Contar linhas (o `df.tail(365)` do modelo antigo) devolve 365 PREGÕES, que
 * são cerca de 17 meses. O rótulo "últimos 12 meses" precisa de dias corridos.
 */
export function indiceInicial(datas, dias) {
  if (dias === null || dias === undefined) return 0;
  const fim = new Date(datas[datas.length - 1] + "T00:00:00Z");
  const corte = new Date(fim);
  corte.setUTCDate(corte.getUTCDate() - dias);
  const alvo = corte.toISOString().slice(0, 10);

  let lo = 0;
  let hi = datas.length - 1;
  while (lo < hi) {
    const meio = (lo + hi) >> 1;
    if (datas[meio] < alvo) lo = meio + 1;
    else hi = meio;
  }
  return lo;
}

/**
 * Recorta, remove buracos e normaliza pelo PRIMEIRO valor DA JANELA.
 *
 * Normalizar pela primeira data do dataset e só depois cortar o fim faz o
 * gráfico de 30 dias começar em 1,4 — ou seja, mostra o acumulado desde 2022
 * recortado, não a rentabilidade dos 30 dias.
 */
export function prepararSerie(datas, valores, ini) {
  const xs = [];
  const brutos = [];
  for (let i = ini; i < valores.length; i++) {
    const v = valores[i];
    if (v === null || !Number.isFinite(v) || v <= 0) continue;
    xs.push(datas[i]);
    brutos.push(v);
  }
  if (brutos.length < 2) return null;
  const base = brutos[0];
  return { datas: xs, brutos, norm: brutos.map((v) => v / base) };
}

/**
 * Versão para carteira: precisa de preço em TODOS os dias da janela, então
 * repete o último válido. Só começa quando o ativo passa a existir.
 */
export function serieContinua(datas, valores, ini) {
  const xs = [];
  const ys = [];
  let ultimo = null;
  for (let i = ini; i < valores.length; i++) {
    const v = valores[i];
    if (v !== null && Number.isFinite(v) && v > 0) ultimo = v;
    if (ultimo === null) continue;
    xs.push(datas[i]);
    ys.push(ultimo);
  }
  return xs.length < 2 ? null : { datas: xs, brutos: ys };
}

/* --------------------------------------------------------------------------
   Estatística
   -------------------------------------------------------------------------- */

export function retornosDiarios(brutos) {
  const r = new Array(brutos.length - 1);
  for (let i = 1; i < brutos.length; i++) r[i - 1] = brutos[i] / brutos[i - 1] - 1;
  return r;
}

export function media(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export function desvioPadrao(xs) {
  if (xs.length < 2) return null;
  const m = media(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

/** Desvio só dos retornos negativos — denominador do Sortino. */
export function desvioNegativo(xs, alvo = 0) {
  const abaixo = xs.filter((x) => x < alvo);
  if (abaixo.length < 2) return null;
  return Math.sqrt(
    abaixo.reduce((a, b) => a + (b - alvo) ** 2, 0) / (abaixo.length - 1)
  );
}

export function covariancia(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return null;
  const ma = media(a.slice(0, n));
  const mb = media(b.slice(0, n));
  let s = 0;
  for (let i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / (n - 1);
}

export function correlacao(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return null;
  const cov = covariancia(a, b);
  const sa = desvioPadrao(a.slice(0, n));
  const sb = desvioPadrao(b.slice(0, n));
  if (cov === null || !sa || !sb) return null;
  return cov / (sa * sb);
}

export function anualizar(retornoTotal, nObs) {
  if (nObs < 2 || retornoTotal <= -1) return null;
  return (1 + retornoTotal) ** (DIAS_UTEIS_ANO / nObs) - 1;
}

/* --------------------------------------------------------------------------
   Drawdown
   -------------------------------------------------------------------------- */

/** Série de drawdown (0 = no topo) mais profundidade, datas e recuperação. */
export function analiseDrawdown(serie) {
  const { brutos, datas } = serie;
  const curva = new Array(brutos.length);
  let pico = brutos[0];
  let iPico = 0;

  let pior = 0;
  let iInicio = 0;
  let iFundo = 0;
  let iRecuperacao = null;

  for (let i = 0; i < brutos.length; i++) {
    if (brutos[i] >= pico) {
      pico = brutos[i];
      iPico = i;
    }
    const dd = brutos[i] / pico - 1;
    curva[i] = dd;
    if (dd < pior) {
      pior = dd;
      iInicio = iPico;
      iFundo = i;
      iRecuperacao = null;
    }
    // já saímos do fundo e voltamos ao pico anterior?
    if (iRecuperacao === null && i > iFundo && brutos[i] >= brutos[iInicio]) {
      iRecuperacao = i;
    }
  }

  const dias = (a, b) =>
    Math.round((new Date(datas[b]) - new Date(datas[a])) / 86400000);

  // Série que só sobe (o CDI, por exemplo) satisfaz a condição de recuperação
  // já no segundo ponto, e a tabela mostrava "recuperou em 1 dias" para algo
  // que nunca caiu. Sem queda não há recuperação a reportar.
  const houveQueda = pior < 0;

  return {
    curva,
    profundidade: pior,
    inicio: houveQueda ? datas[iInicio] : null,
    fundo: houveQueda ? datas[iFundo] : null,
    recuperacao: houveQueda && iRecuperacao !== null ? datas[iRecuperacao] : null,
    diasQueda: houveQueda ? dias(iInicio, iFundo) : null,
    diasRecuperacao:
      houveQueda && iRecuperacao !== null ? dias(iFundo, iRecuperacao) : null,
  };
}

/* --------------------------------------------------------------------------
   Indicadores de um ativo
   -------------------------------------------------------------------------- */

/**
 * Sharpe: excesso de retorno ANUALIZADO sobre o CDI DA MESMA JANELA, dividido
 * pela volatilidade anualizada. O modelo antigo dividia um acumulado plurianual
 * por uma taxa anual e, no CDI, dividia por vol zero — daí o 3,2 × 10¹⁴.
 */
export function calcularKpis(serie, serieCdi, serieBench, proventos) {
  const ret = serie.norm[serie.norm.length - 1] - 1;
  const diarios = retornosDiarios(serie.brutos);
  const vol = desvioPadrao(diarios);
  const volAnual = vol === null ? null : vol * Math.sqrt(DIAS_UTEIS_ANO);
  const retAnual = anualizar(ret, serie.brutos.length);

  let cdiAnual = null;
  if (serieCdi) {
    const retCdi = serieCdi.norm[serieCdi.norm.length - 1] - 1;
    cdiAnual = anualizar(retCdi, serieCdi.brutos.length);
  }

  let sharpe = null;
  let sortino = null;
  if (retAnual !== null && cdiAnual !== null) {
    if (volAnual !== null && volAnual > 1e-6) sharpe = (retAnual - cdiAnual) / volAnual;
    const dn = desvioNegativo(diarios);
    if (dn !== null && dn > 1e-9) {
      sortino = (retAnual - cdiAnual) / (dn * Math.sqrt(DIAS_UTEIS_ANO));
    }
  }

  let beta = null;
  let corr = null;
  if (serieBench && serieBench !== serie) {
    const rb = retornosDiarios(serieBench.brutos);
    const n = Math.min(diarios.length, rb.length);
    if (n >= 20) {
      const a = diarios.slice(-n);
      const b = rb.slice(-n);
      const sd = desvioPadrao(b);
      const cov = covariancia(a, b);
      if (sd && cov !== null) beta = cov / sd ** 2;
      corr = correlacao(a, b);
    }
  }

  const dd = analiseDrawdown(serie);

  // DY dos últimos 12 meses sobre o preço atual.
  let dy = null;
  if (proventos && proventos.length) {
    const fim = new Date(serie.datas[serie.datas.length - 1]);
    const corte = new Date(fim);
    corte.setUTCFullYear(corte.getUTCFullYear() - 1);
    const iso = corte.toISOString().slice(0, 10);
    const soma = proventos
      .filter(([d]) => d >= iso)
      .reduce((a, [, v]) => a + v, 0);
    const preco = serie.brutos[serie.brutos.length - 1];
    if (soma > 0 && preco > 0) dy = soma / preco;
  }

  return {
    retorno: ret,
    retornoAnual: retAnual,
    vol: volAnual,
    sharpe,
    sortino,
    drawdown: dd.profundidade,
    ddInicio: dd.inicio,
    ddFundo: dd.fundo,
    ddRecuperacao: dd.recuperacao,
    ddDiasQueda: dd.diasQueda,
    ddDiasRecuperacao: dd.diasRecuperacao,
    beta,
    corr,
    dy,
    pregoes: serie.brutos.length,
  };
}

/* --------------------------------------------------------------------------
   Retorno por ano-calendário
   -------------------------------------------------------------------------- */

export function retornoPorAno(serie) {
  const porAno = new Map();
  for (let i = 0; i < serie.datas.length; i++) {
    const ano = serie.datas[i].slice(0, 4);
    if (!porAno.has(ano)) porAno.set(ano, { primeiro: serie.brutos[i], ultimo: serie.brutos[i] });
    else porAno.get(ano).ultimo = serie.brutos[i];
  }
  // O retorno do ano parte do fechamento do ano anterior, não do primeiro
  // pregão de janeiro — senão o gap de virada de ano some.
  const anos = [...porAno.keys()].sort();
  const saida = [];
  let anterior = null;
  for (const ano of anos) {
    const { primeiro, ultimo } = porAno.get(ano);
    const base = anterior === null ? primeiro : anterior;
    saida.push({ ano, retorno: ultimo / base - 1 });
    anterior = ultimo;
  }
  return saida;
}

/* --------------------------------------------------------------------------
   Janelas móveis

   Responde "se eu tivesse entrado em qualquer dia e ficado N meses, o que eu
   teria pego?". É o antídoto honesto contra período escolhido a dedo.
   -------------------------------------------------------------------------- */

export function janelasMoveis(serie, pregoesJanela) {
  const n = serie.brutos.length;
  if (n <= pregoesJanela + 1) return null;

  const retornos = [];
  for (let i = 0; i + pregoesJanela < n; i++) {
    retornos.push(serie.brutos[i + pregoesJanela] / serie.brutos[i] - 1);
  }
  const ordenado = [...retornos].sort((a, b) => a - b);
  const q = (p) => ordenado[Math.min(ordenado.length - 1, Math.floor(p * ordenado.length))];

  return {
    amostras: retornos.length,
    pior: ordenado[0],
    p25: q(0.25),
    mediana: q(0.5),
    p75: q(0.75),
    melhor: ordenado[ordenado.length - 1],
    media: media(retornos),
    positivas: retornos.filter((r) => r > 0).length / retornos.length,
    retornos,
  };
}

/* --------------------------------------------------------------------------
   Backtest de carteira

   Simula quantidades por ativo dia a dia. Suporta aporte mensal e
   rebalanceamento periódico — que é onde os comparadores brasileiros
   gratuitos param e as ferramentas internacionais (Curvo, Portfolio
   Visualizer) continuam.
   -------------------------------------------------------------------------- */

const FREQUENCIAS = {
  nunca: () => false,
  mensal: (d, ant) => d.slice(0, 7) !== ant.slice(0, 7),
  trimestral: (d, ant) => {
    const t = (x) => `${x.slice(0, 4)}-${Math.floor((+x.slice(5, 7) - 1) / 3)}`;
    return t(d) !== t(ant);
  },
  anual: (d, ant) => d.slice(0, 4) !== ant.slice(0, 4),
};

/**
 * @param {Object} args
 * @param {Object} args.series   { codigo: {datas, brutos} } já contínuas
 * @param {Object} args.pesos    { codigo: peso } — normalizado internamente
 * @param {number} args.inicial  aporte inicial
 * @param {number} args.aporte   aporte mensal (0 desliga)
 * @param {string} args.rebal    nunca | mensal | trimestral | anual
 * @param {number} args.custo    custo por operação de rebalanceamento, em %
 */
export function simularCarteira({ series, pesos, inicial = 10000, aporte = 0, rebal = "nunca", custo = 0 }) {
  const codigos = Object.keys(pesos).filter((c) => series[c] && pesos[c] > 0);
  if (!codigos.length) return null;

  const somaPesos = codigos.reduce((a, c) => a + pesos[c], 0);
  const alvo = {};
  for (const c of codigos) alvo[c] = pesos[c] / somaPesos;

  // Só dias em que TODOS os ativos escolhidos já existem.
  const inicios = codigos.map((c) => series[c].datas[0]);
  const dataInicio = inicios.reduce((a, b) => (a > b ? a : b));
  const base = series[codigos[0]].datas.filter((d) => d >= dataInicio);
  if (base.length < 2) return null;

  const indice = {};
  for (const c of codigos) {
    indice[c] = new Map(series[c].datas.map((d, i) => [d, series[c].brutos[i]]));
  }

  const preco = (c, d) => indice[c].get(d);

  const qtd = {};
  for (const c of codigos) {
    const p = preco(c, base[0]);
    if (!p) return null;
    qtd[c] = (inicial * alvo[c]) / p;
  }

  const precisaRebal = FREQUENCIAS[rebal] || FREQUENCIAS.nunca;
  const valores = [];
  const datas = [];
  let investido = inicial;
  const aportes = [];
  let custoTotal = 0;
  let nRebal = 0;

  for (let i = 0; i < base.length; i++) {
    const d = base[i];
    const ant = i > 0 ? base[i - 1] : null;

    // aporte no primeiro pregão de cada mês (menos o inicial)
    if (aporte > 0 && ant && d.slice(0, 7) !== ant.slice(0, 7)) {
      for (const c of codigos) {
        const p = preco(c, d);
        if (p) qtd[c] += (aporte * alvo[c]) / p;
      }
      investido += aporte;
      aportes.push(d);
    }

    let total = 0;
    for (const c of codigos) {
      const p = preco(c, d);
      if (p) total += qtd[c] * p;
    }

    if (ant && precisaRebal(d, ant) && total > 0) {
      let girado = 0;
      for (const c of codigos) {
        const p = preco(c, d);
        if (!p) continue;
        const desejado = (total * alvo[c]) / p;
        girado += Math.abs(desejado - qtd[c]) * p;
        qtd[c] = desejado;
      }
      const taxa = (girado / 2) * (custo / 100);
      custoTotal += taxa;
      nRebal++;
      if (taxa > 0 && total > taxa) {
        const fator = (total - taxa) / total;
        for (const c of codigos) qtd[c] *= fator;
        total -= taxa;
      }
    }

    datas.push(d);
    valores.push(total);
  }

  const serie = { datas, brutos: valores, norm: valores.map((v) => v / valores[0]) };
  const final = valores[valores.length - 1];

  // Com aportes, o retorno simples mente: compara valor final com o primeiro
  // aporte, ignorando todo o dinheiro que entrou depois. TWR (retorno da
  // cota) isola a performance da carteira do timing dos depósitos.
  return {
    serie,
    investido,
    final,
    lucro: final - investido,
    retornoSobreAportes: investido > 0 ? final / investido - 1 : null,
    aportes: aportes.length,
    rebalanceamentos: nRebal,
    custoTotal,
    dataInicio: base[0],
    dataFim: base[base.length - 1],
  };
}

/**
 * Time-weighted return: neutraliza o efeito dos aportes.
 * Refaz a simulação sem depósitos, mantendo pesos e rebalanceamento.
 */
export function serieCota(args) {
  return simularCarteira({ ...args, aporte: 0, inicial: 1 });
}

/* --------------------------------------------------------------------------
   Matriz de correlação
   -------------------------------------------------------------------------- */

export function matrizCorrelacao(preparadas, codigos) {
  const retornos = {};
  for (const c of codigos) {
    if (preparadas[c]) retornos[c] = retornosDiarios(preparadas[c].brutos);
  }
  const presentes = codigos.filter((c) => retornos[c]);
  const m = presentes.map((a) =>
    presentes.map((b) => (a === b ? 1 : correlacao(retornos[a], retornos[b])))
  );
  return { codigos: presentes, matriz: m };
}
