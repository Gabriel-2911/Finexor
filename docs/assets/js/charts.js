/* ==========================================================================
   Finexor — camada de gráficos.

   Um único lugar que conhece o Plotly. O resto da aplicação passa dados
   e recebe desenho.
   ========================================================================== */

const CORES = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6"];

let avisou = false;

/**
 * O Plotly vem de CDN. Proxy corporativo, bloqueio de rede ou CDN fora do ar
 * deixavam a página inteira em branco, porque a exceção subia e matava o
 * render antes das tabelas. Aqui o gráfico degrada e o resto continua.
 */
function desenhar(alvo, traces, layout) {
  if (!alvo) return;
  if (typeof window.Plotly === "undefined") {
    if (!avisou) {
      console.warn("Plotly não carregou — gráficos desativados, tabelas seguem.");
      avisou = true;
    }
    alvo.innerHTML =
      `<p class="vazio">Os gráficos precisam da biblioteca Plotly, que não carregou.<br>` +
      `Verifique a conexão ou o bloqueio de <code>cdn.plot.ly</code>. Os números abaixo continuam válidos.</p>`;
    return;
  }
  try {
    Plotly.react(alvo, traces, layout, CONFIG);
  } catch (erro) {
    console.error("Falha ao desenhar o gráfico:", erro);
    alvo.innerHTML = `<p class="vazio">Não foi possível desenhar este gráfico.</p>`;
  }
}

export function css(nome) {
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
}

export function cor(i) {
  return css(CORES[i % CORES.length]);
}

function tema() {
  return {
    tinta: css("--tinta-media"),
    grade: css("--grade"),
    alta: css("--alta"),
    baixa: css("--baixa"),
    fundo: css("--papel-alto"),
  };
}

function base(t) {
  return {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "IBM Plex Mono, monospace", size: 11, color: t.tinta },
    margin: { l: 56, r: 18, t: 14, b: 40 },
    hoverlabel: {
      bgcolor: t.fundo,
      bordercolor: t.grade,
      font: { family: "IBM Plex Mono, monospace", size: 12 },
    },
  };
}

const CONFIG = {
  responsive: true,
  displaylogo: false,
  modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d", "toggleSpikelines"],
  toImageButtonOptions: { filename: "finexor", scale: 2 },
};

/** Converte hex em rgba — usado no preenchimento sob a linha. */
function comAlfa(hex, alfa) {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const i = parseInt(n, 16);
  return `rgba(${(i >> 16) & 255}, ${(i >> 8) & 255}, ${i & 255}, ${alfa})`;
}

/* --------------------------------------------------------------------------
   Rentabilidade acumulada
   -------------------------------------------------------------------------- */

export function linhaRentabilidade(alvo, series, opcoes = {}) {
  const t = tema();
  const unico = series.length === 1;

  const traces = series.map((s, i) => {
    const c = s.cor || cor(i);
    return {
      type: "scatter",
      mode: "lines",
      name: s.nome,
      x: s.datas,
      y: s.valores.map((v) => (v - 1) * 100),
      line: { color: c, width: s.destaque ? 2.6 : 1.9, shape: "linear" },
      // Preenchimento só quando há uma série: com várias vira sopa visual.
      fill: unico ? "tozeroy" : "none",
      fillcolor: unico ? comAlfa(c, 0.1) : undefined,
      hovertemplate: `<b>${s.nome}</b>  %{y:+.2f}%<extra></extra>`,
    };
  });

  const layout = {
    ...base(t),
    hovermode: "x unified",
    xaxis: {
      gridcolor: t.grade,
      zeroline: false,
      showline: false,
      showspikes: true,
      spikemode: "across",
      spikethickness: 1,
      spikedash: "dot",
      spikecolor: t.grade,
    },
    yaxis: {
      gridcolor: t.grade,
      zeroline: true,
      zerolinecolor: t.grade,
      zerolinewidth: 1.6,
      ticksuffix: "%",
    },
    legend: { orientation: "h", y: -0.16, x: 0, font: { size: 11 } },
    showlegend: traces.length > 1,
    shapes: [],
    annotations: [],
  };

  // Marca a janela do maior drawdown quando há só uma série no gráfico.
  if (unico && opcoes.drawdown && opcoes.drawdown.profundidade < -0.02) {
    const d = opcoes.drawdown;
    layout.shapes.push({
      type: "rect",
      xref: "x",
      yref: "paper",
      x0: d.inicio,
      x1: d.fundo,
      y0: 0,
      y1: 1,
      fillcolor: comAlfa(t.baixa, 0.07),
      line: { width: 0 },
      layer: "below",
    });
    layout.annotations.push({
      x: d.fundo,
      y: 1,
      xref: "x",
      yref: "paper",
      text: `queda máx. ${(d.profundidade * 100).toFixed(1)}%`,
      showarrow: false,
      font: { size: 10, color: t.baixa },
      bgcolor: comAlfa(t.baixa, 0.08),
      xanchor: "left",
      yanchor: "top",
    });
  }

  desenhar(alvo, traces, layout);
}

/* --------------------------------------------------------------------------
   Curva submersa (underwater)
   -------------------------------------------------------------------------- */

export function areaDrawdown(alvo, series) {
  const t = tema();
  const traces = series.map((s, i) => ({
    type: "scatter",
    mode: "lines",
    name: s.nome,
    x: s.datas,
    y: s.curva.map((v) => v * 100),
    line: { color: s.cor || cor(i), width: 1.6 },
    fill: "tozeroy",
    fillcolor: comAlfa(s.cor || cor(i), 0.13),
    hovertemplate: `<b>${s.nome}</b>  %{y:.2f}%<extra></extra>`,
  }));

  desenhar(
    alvo,
    traces,
    {
      ...base(t),
      margin: { l: 56, r: 18, t: 8, b: 34 },
      hovermode: "x unified",
      xaxis: { gridcolor: t.grade, zeroline: false },
      yaxis: { gridcolor: t.grade, zeroline: true, zerolinecolor: t.grade, ticksuffix: "%", rangemode: "nonpositive" },
      showlegend: traces.length > 1,
      legend: { orientation: "h", y: -0.22, x: 0 },
    }
  );
}

/* --------------------------------------------------------------------------
   Barras por ano
   -------------------------------------------------------------------------- */

export function barrasAno(alvo, series) {
  const t = tema();
  const traces = series.map((s, i) => ({
    type: "bar",
    name: s.nome,
    x: s.anos.map((a) => a.ano),
    y: s.anos.map((a) => a.retorno * 100),
    marker: {
      color:
        series.length === 1
          ? s.anos.map((a) => (a.retorno >= 0 ? t.alta : t.baixa))
          : s.cor || cor(i),
    },
    hovertemplate: `<b>${s.nome}</b> %{x}  %{y:+.1f}%<extra></extra>`,
  }));

  desenhar(
    alvo,
    traces,
    {
      ...base(t),
      margin: { l: 56, r: 18, t: 8, b: 34 },
      barmode: "group",
      bargap: 0.28,
      xaxis: { gridcolor: "rgba(0,0,0,0)", type: "category" },
      yaxis: { gridcolor: t.grade, zeroline: true, zerolinecolor: t.grade, zerolinewidth: 1.6, ticksuffix: "%" },
      showlegend: traces.length > 1,
      legend: { orientation: "h", y: -0.22, x: 0 },
    }
  );
}

/* --------------------------------------------------------------------------
   Risco × retorno
   -------------------------------------------------------------------------- */

export function dispersaoRisco(alvo, pontos, cdiAnual) {
  const t = tema();

  const trace = {
    type: "scatter",
    mode: "markers+text",
    x: pontos.map((p) => p.vol * 100),
    y: pontos.map((p) => p.retorno * 100),
    text: pontos.map((p) => p.codigo),
    textposition: "top center",
    textfont: { size: 10, color: t.tinta },
    marker: {
      size: 13,
      color: pontos.map((p) => p.cor),
      line: { width: 1.5, color: t.fundo },
    },
    hovertemplate: "<b>%{text}</b><br>retorno %{y:.1f}% a.a.<br>vol %{x:.1f}% a.a.<extra></extra>",
  };

  const layout = {
    ...base(t),
    margin: { l: 56, r: 24, t: 14, b: 46 },
    xaxis: { title: { text: "volatilidade anualizada", font: { size: 10 } }, gridcolor: t.grade, ticksuffix: "%", zeroline: false },
    yaxis: { title: { text: "retorno anualizado", font: { size: 10 } }, gridcolor: t.grade, ticksuffix: "%", zeroline: true, zerolinecolor: t.grade },
    showlegend: false,
    shapes: [],
    annotations: [],
  };

  // Linha do CDI: acima dela, o ativo pagou o prêmio de risco.
  if (Number.isFinite(cdiAnual)) {
    layout.shapes.push({
      type: "line",
      xref: "paper",
      x0: 0,
      x1: 1,
      yref: "y",
      y0: cdiAnual * 100,
      y1: cdiAnual * 100,
      line: { color: t.tinta, width: 1, dash: "dash" },
    });
    layout.annotations.push({
      xref: "paper",
      x: 1,
      y: cdiAnual * 100,
      text: `CDI ${(cdiAnual * 100).toFixed(1)}% a.a.`,
      showarrow: false,
      font: { size: 10, color: t.tinta },
      xanchor: "right",
      yanchor: "bottom",
    });
  }

  desenhar(alvo, [trace], layout);
}

/* --------------------------------------------------------------------------
   Matriz de correlação
   -------------------------------------------------------------------------- */

export function heatmapCorrelacao(alvo, codigos, matriz) {
  const t = tema();

  desenhar(
    alvo,
    [
      {
        type: "heatmap",
        x: codigos,
        y: codigos,
        z: matriz,
        zmin: -1,
        zmax: 1,
        // Coral em vez do vermelho de baixa: correlação alta não é erro, e o
        // vermelho de sinal no tema escuro fazia a diagonal parecer alarme.
        colorscale: [
          [0, css("--s2")],
          [0.5, t.fundo],
          [1, css("--s5")],
        ],
        showscale: true,
        colorbar: { thickness: 10, len: 0.7, tickfont: { size: 10 } },
        hovertemplate: "%{y} × %{x}<br><b>%{z:.2f}</b><extra></extra>",
        xgap: 2,
        ygap: 2,
      },
    ],
    {
      ...base(t),
      margin: { l: 70, r: 20, t: 14, b: 60 },
      xaxis: { side: "bottom", tickangle: -45 },
      yaxis: { autorange: "reversed" },
    }
  );
}

/* --------------------------------------------------------------------------
   Distribuição das janelas móveis
   -------------------------------------------------------------------------- */

export function histogramaJanelas(alvo, dados, rotulo) {
  const t = tema();

  // Duas séries em vez de uma com cores por ponto: o Plotly agrupa os valores
  // em faixas, então uma cor por observação não sobrevive ao agrupamento e
  // todas as barras saíam verdes, inclusive as de retorno negativo.
  const negativos = dados.retornos.filter((r) => r < 0).map((r) => r * 100);
  const positivos = dados.retornos.filter((r) => r >= 0).map((r) => r * 100);

  const comum = {
    type: "histogram",
    nbinsx: 40,
    bingroup: "janelas",
    marker: { line: { width: 0 } },
    hovertemplate: "%{x:.0f}%  ·  %{y} janelas<extra></extra>",
  };

  desenhar(
    alvo,
    [
      { ...comum, x: negativos, name: "negativas", marker: { ...comum.marker, color: t.baixa } },
      { ...comum, x: positivos, name: "positivas", marker: { ...comum.marker, color: t.alta } },
    ],
    {
      ...base(t),
      margin: { l: 50, r: 18, t: 14, b: 42 },
      barmode: "overlay",
      bargap: 0.04,
      xaxis: {
        title: { text: `retorno em ${rotulo}`, font: { size: 10 } },
        gridcolor: t.grade,
        ticksuffix: "%",
        zeroline: true,
        zerolinecolor: t.grade,
        zerolinewidth: 1.6,
      },
      yaxis: { title: { text: "nº de janelas", font: { size: 10 } }, gridcolor: t.grade },
      showlegend: false,
    }
  );
}

/* --------------------------------------------------------------------------
   Evolução da carteira
   -------------------------------------------------------------------------- */

export function areaCarteira(alvo, carteira, referencias) {
  const t = tema();

  const traces = [
    {
      type: "scatter",
      mode: "lines",
      name: "Carteira",
      x: carteira.datas,
      y: carteira.valores,
      line: { color: css("--s2"), width: 2.4 },
      fill: "tozeroy",
      fillcolor: comAlfa(css("--s2"), 0.12),
      hovertemplate: "<b>Carteira</b>  R$ %{y:,.0f}<extra></extra>",
    },
    {
      type: "scatter",
      mode: "lines",
      name: "Total aportado",
      x: carteira.datas,
      y: carteira.aportado,
      line: { color: t.tinta, width: 1.4, dash: "dot" },
      hovertemplate: "<b>Aportado</b>  R$ %{y:,.0f}<extra></extra>",
    },
    ...referencias.map((r, i) => ({
      type: "scatter",
      mode: "lines",
      name: r.nome,
      x: r.datas,
      y: r.valores,
      line: { color: cor(i + 2), width: 1.4 },
      hovertemplate: `<b>${r.nome}</b>  R$ %{y:,.0f}<extra></extra>`,
    })),
  ];

  desenhar(
    alvo,
    traces,
    {
      ...base(t),
      margin: { l: 68, r: 18, t: 14, b: 40 },
      hovermode: "x unified",
      xaxis: { gridcolor: t.grade, zeroline: false },
      yaxis: { gridcolor: t.grade, tickprefix: "R$ ", separatethousands: true, zeroline: false },
      legend: { orientation: "h", y: -0.16, x: 0 },
    }
  );
}

/* --------------------------------------------------------------------------
   Sparkline em SVG puro — vai dentro de cada item da fita, onde um Plotly
   por ticker seria caro demais.
   -------------------------------------------------------------------------- */

export function sparkline(valores, positivo, largura = 84, altura = 22) {
  if (!valores || valores.length < 2) return "";
  const passo = Math.max(1, Math.floor(valores.length / 60));
  const pts = valores.filter((_, i) => i % passo === 0);
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const amp = max - min || 1;

  const d = pts
    .map((v, i) => {
      const x = (i / (pts.length - 1)) * largura;
      const y = altura - ((v - min) / amp) * (altura - 3) - 1.5;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const c = positivo ? "var(--alta)" : "var(--baixa)";
  return (
    `<svg class="faisca" viewBox="0 0 ${largura} ${altura}" width="${largura}" height="${altura}" aria-hidden="true" preserveAspectRatio="none">` +
    `<path d="${d} L${largura},${altura} L0,${altura} Z" fill="${c}" opacity="0.1"/>` +
    `<path d="${d}" fill="none" stroke="${c}" stroke-width="1.4" stroke-linejoin="round"/>` +
    `</svg>`
  );
}

export function limpar(alvo) {
  if (typeof window.Plotly !== "undefined" && alvo) {
    try { Plotly.purge(alvo); } catch { /* nada a limpar */ }
  }
}
