/* ==========================================================================
   Finexor — aplicação.

   Estado, navegação e renderização. A matemática mora em calc.js e o desenho
   em charts.js; aqui só se decide o que mostrar.
   ========================================================================== */

import * as C from "./calc.js";
import * as G from "./charts.js";

const MAX_SERIES = 6;
const BENCH = "IBOV";

const PERIODOS = [
  { id: "30", rotulo: "30d", dias: 30 },
  { id: "90", rotulo: "3m", dias: 90 },
  { id: "180", rotulo: "6m", dias: 180 },
  { id: "365", rotulo: "12m", dias: 365 },
  { id: "730", rotulo: "24m", dias: 730 },
  { id: "all", rotulo: "Tudo", dias: null },
];

const JANELAS_MOVEIS = [
  { id: "63", rotulo: "3 meses", pregoes: 63 },
  { id: "126", rotulo: "6 meses", pregoes: 126 },
  { id: "252", rotulo: "12 meses", pregoes: 252 },
  { id: "504", rotulo: "24 meses", pregoes: 504 },
];

const CLASSES = {
  acao: "Ações",
  etf: "ETFs",
  indice: "Índices",
  benchmark: "Benchmarks",
};

const estado = {
  dados: null,
  vista: "comparar",
  selecionados: [],
  periodo: "365",
  busca: "",
  filtroClasse: "",
  ordenacao: { coluna: "retorno", desc: true },
  modoGrafico: "retorno", // retorno | drawdown | anos
  janelaMovel: "252",
  carteira: {
    pesos: {},
    inicial: 10000,
    aporte: 500,
    rebal: "trimestral",
    custo: 0,
  },
  cache: null,
};

/* --------------------------------------------------------------------------
   Formatação
   -------------------------------------------------------------------------- */

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const ehNulo = (v) => v === null || v === undefined || !Number.isFinite(v);
const pct = (v, c = 2) => (ehNulo(v) ? "—" : `${(v * 100).toFixed(c)}%`);
const pctSinal = (v) => (ehNulo(v) ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`);
const num = (v, c = 2) => (ehNulo(v) ? "—" : v.toFixed(c));
const sinal = (v) => (ehNulo(v) ? "nulo" : v >= 0 ? "pos" : "neg");

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const dinheiro = (v) => (ehNulo(v) ? "—" : brl.format(v));

const dataBr = (iso) =>
  !iso ? "—" : iso.split("-").reverse().join("/");

/* --------------------------------------------------------------------------
   Cálculo do quadro atual (memorizado por período)
   -------------------------------------------------------------------------- */

function quadro() {
  const chave = `${estado.periodo}`;
  if (estado.cache && estado.cache.chave === chave) return estado.cache;

  const { datas, series } = estado.dados;
  const def = PERIODOS.find((p) => p.id === estado.periodo);
  const ini = C.indiceInicial(datas, def.dias);

  const preparadas = {};
  const continuas = {};
  for (const [codigo, s] of Object.entries(series)) {
    const p = C.prepararSerie(datas, s.valores, ini);
    if (p) preparadas[codigo] = p;
    const cont = C.serieContinua(datas, s.valores, ini);
    if (cont) continuas[codigo] = cont;
  }

  const cdi = preparadas.CDI || null;
  const bench = preparadas[BENCH] || null;

  const kpis = {};
  for (const [codigo, p] of Object.entries(preparadas)) {
    kpis[codigo] = C.calcularKpis(p, cdi, bench, series[codigo].proventos);
  }

  const cdiAnual = cdi
    ? C.anualizar(cdi.norm[cdi.norm.length - 1] - 1, cdi.brutos.length)
    : null;

  estado.cache = { chave, preparadas, continuas, kpis, def, cdiAnual };
  return estado.cache;
}

/* --------------------------------------------------------------------------
   Fita
   -------------------------------------------------------------------------- */

function ativosVisiveis() {
  const { series, meta } = estado.dados;
  const busca = estado.busca.trim().toUpperCase();
  return meta.ordem.filter((c) => {
    const s = series[c];
    if (estado.filtroClasse && s.classe !== estado.filtroClasse) return false;
    if (!busca) return true;
    return (
      c.includes(busca) ||
      s.nome.toUpperCase().includes(busca) ||
      (s.setor || "").toUpperCase().includes(busca)
    );
  });
}

function renderFita() {
  const { preparadas, kpis } = quadro();
  const fita = $("#fita");
  const lista = ativosVisiveis();

  if (!lista.length) {
    fita.innerHTML = `<p class="fita-vazia">Nenhum ativo corresponde a "${estado.busca}".</p>`;
    return;
  }

  fita.innerHTML = lista
    .map((codigo) => {
      const k = kpis[codigo];
      const p = preparadas[codigo];
      if (!k || !p) return "";
      const idx = estado.selecionados.indexOf(codigo);
      const ativo = idx !== -1;
      const s = estado.dados.series[codigo];

      return `
        <button type="button" class="fita-item" data-codigo="${codigo}"
                aria-pressed="${ativo}"
                title="${s.nome}${s.setor ? " · " + s.setor : ""}"
                ${ativo ? `style="--cor-serie:${G.cor(idx)}"` : ""}>
          <span class="fita-codigo">${codigo}</span>
          <span class="fita-valor ${sinal(k.retorno)}">${pctSinal(k.retorno)}</span>
          ${G.sparkline(p.norm, k.retorno >= 0)}
        </button>`;
    })
    .join("");

  fita.querySelectorAll(".fita-item").forEach((b) =>
    b.addEventListener("click", () => alternar(b.dataset.codigo))
  );
}

/* --------------------------------------------------------------------------
   Vista: comparar
   -------------------------------------------------------------------------- */

function renderComparar() {
  const { preparadas, kpis, def } = quadro();
  const alvo = $("#grafico");
  const vazio = $("#semSerie");

  const escolhidos = estado.selecionados.filter((c) => preparadas[c]);

  // Com um ativo só, o retorno vira a manchete da tela — é a leitura que o
  // usuário faz primeiro num terminal, antes de olhar a curva.
  const cot = $("#cotacao");
  if (escolhidos.length === 1) {
    const c = escolhidos[0];
    const k = kpis[c];
    cot.hidden = false;
    $("#cotacaoCodigo").textContent = c;
    const v = $("#cotacaoValor");
    v.textContent = pctSinal(k.retorno);
    v.className = `cotacao-valor ${sinal(k.retorno)}`;
    $("#cotacaoMeta").textContent =
      `${estado.dados.series[c].nome} · ${pctSinal(k.retornoAnual)} a.a. · vol ${pct(k.vol)} · queda máx ${pct(k.drawdown)}`;
    $("#quadroTitulo").textContent = `Rentabilidade acumulada — ${def.rotulo}`;
  } else {
    cot.hidden = true;
    $("#quadroTitulo").textContent =
      escolhidos.length === 0
        ? "Rentabilidade acumulada"
        : `${escolhidos.join("  ·  ")} — ${def.rotulo}`;
  }

  const ref = preparadas[escolhidos[0]] || Object.values(preparadas)[0];
  $("#quadroNota").textContent = ref
    ? `${dataBr(ref.datas[0])} a ${dataBr(ref.datas[ref.datas.length - 1])} · ${ref.datas.length} pregões`
    : "";

  if (!escolhidos.length) {
    G.limpar(alvo);
    alvo.hidden = true;
    vazio.hidden = false;
    return;
  }
  alvo.hidden = false;
  vazio.hidden = true;

  if (estado.modoGrafico === "drawdown") {
    G.areaDrawdown(
      alvo,
      escolhidos.map((c, i) => ({
        nome: c,
        datas: preparadas[c].datas,
        curva: C.analiseDrawdown(preparadas[c]).curva,
        cor: G.cor(i),
      }))
    );
  } else if (estado.modoGrafico === "anos") {
    G.barrasAno(
      alvo,
      escolhidos.map((c, i) => ({
        nome: c,
        anos: C.retornoPorAno(preparadas[c]),
        cor: G.cor(i),
      }))
    );
  } else {
    G.linhaRentabilidade(
      alvo,
      escolhidos.map((c, i) => ({
        nome: c,
        datas: preparadas[c].datas,
        valores: preparadas[c].norm,
        cor: G.cor(i),
      })),
      { drawdown: escolhidos.length === 1 ? C.analiseDrawdown(preparadas[escolhidos[0]]) : null }
    );
  }
}

/* --------------------------------------------------------------------------
   Tabela de indicadores
   -------------------------------------------------------------------------- */

const COLUNAS = [
  { id: "codigo", rotulo: "Ativo", dica: "Código de negociação" },
  { id: "retorno", rotulo: "Retorno", dica: "Retorno acumulado na janela" },
  { id: "retornoAnual", rotulo: "a.a.", dica: "Retorno anualizado a 252 pregões" },
  { id: "vol", rotulo: "Vol.", dica: "Volatilidade anualizada" },
  { id: "sharpe", rotulo: "Sharpe", dica: "Excesso sobre o CDI ÷ volatilidade" },
  { id: "sortino", rotulo: "Sortino", dica: "Excesso sobre o CDI ÷ desvio das quedas" },
  { id: "drawdown", rotulo: "Queda máx.", dica: "Maior queda do topo ao fundo" },
  { id: "beta", rotulo: "Beta", dica: `Sensibilidade ao ${BENCH}` },
  { id: "dy", rotulo: "DY 12m", dica: "Proventos de 12 meses ÷ preço atual" },
];

function renderTabela() {
  const { kpis } = quadro();
  const visiveis = new Set(ativosVisiveis());

  $("#tabelaCabeca").innerHTML = `<tr>${COLUNAS.map(
    (c) =>
      `<th scope="col" data-col="${c.id}" title="${c.dica}"${
        estado.ordenacao.coluna === c.id
          ? ` aria-sort="${estado.ordenacao.desc ? "descending" : "ascending"}"`
          : ""
      }>${c.rotulo}</th>`
  ).join("")}</tr>`;

  $$("#tabelaCabeca th").forEach((th) =>
    th.addEventListener("click", () => {
      const col = th.dataset.col;
      if (estado.ordenacao.coluna === col) estado.ordenacao.desc = !estado.ordenacao.desc;
      else estado.ordenacao = { coluna: col, desc: true };
      renderTabela();
    })
  );

  const linhas = Object.entries(kpis)
    .filter(([c]) => visiveis.has(c))
    .map(([codigo, k]) => ({ codigo, ...k }));

  const { coluna, desc } = estado.ordenacao;
  linhas.sort((a, b) => {
    if (coluna === "codigo") {
      return desc ? b.codigo.localeCompare(a.codigo) : a.codigo.localeCompare(b.codigo);
    }
    const na = ehNulo(a[coluna]);
    const nb = ehNulo(b[coluna]);
    if (na && nb) return 0;
    if (na) return 1;
    if (nb) return -1;
    return desc ? b[coluna] - a[coluna] : a[coluna] - b[coluna];
  });

  $("#tabelaCorpo").innerHTML = linhas
    .map((l) => {
      const idx = estado.selecionados.indexOf(l.codigo);
      const s = estado.dados.series[l.codigo];
      const marca =
        idx !== -1
          ? `<span class="tag-serie" style="background:${G.cor(idx)}"></span>`
          : `<span class="tag-serie vazia"></span>`;
      return `<tr data-codigo="${l.codigo}">
        <td>${marca}<strong>${l.codigo}</strong><span class="td-nome">${s.nome}</span></td>
        <td class="${sinal(l.retorno)}">${pctSinal(l.retorno)}</td>
        <td class="${sinal(l.retornoAnual)}">${pctSinal(l.retornoAnual)}</td>
        <td>${pct(l.vol)}</td>
        <td class="${sinal(l.sharpe)}">${num(l.sharpe)}</td>
        <td class="${sinal(l.sortino)}">${num(l.sortino)}</td>
        <td class="neg">${pct(l.drawdown)}</td>
        <td>${num(l.beta)}</td>
        <td>${pct(l.dy)}</td>
      </tr>`;
    })
    .join("");

  $$("#tabelaCorpo tr").forEach((tr) =>
    tr.addEventListener("click", () => alternar(tr.dataset.codigo))
  );
}

/* --------------------------------------------------------------------------
   Vista: risco
   -------------------------------------------------------------------------- */

function renderRisco() {
  const { preparadas, kpis, cdiAnual } = quadro();
  const lista = ativosVisiveis().filter((c) => kpis[c] && !ehNulo(kpis[c].vol));

  G.dispersaoRisco(
    $("#graficoRisco"),
    lista.map((c) => {
      const idx = estado.selecionados.indexOf(c);
      return {
        codigo: c,
        vol: kpis[c].vol,
        retorno: kpis[c].retornoAnual,
        cor: idx !== -1 ? G.cor(idx) : G.css("--tinta-fraca"),
      };
    }),
    cdiAnual
  );

  const paraCorrelacao = estado.selecionados.length >= 2
    ? estado.selecionados
    : lista.slice(0, 10);
  const mc = C.matrizCorrelacao(preparadas, paraCorrelacao);
  G.heatmapCorrelacao($("#graficoCorrelacao"), mc.codigos, mc.matriz);
  $("#notaCorrelacao").textContent =
    estado.selecionados.length >= 2
      ? "Correlação entre os ativos que você selecionou."
      : "Selecione dois ou mais ativos na fita para focar a matriz neles.";

  renderJanelas();
  renderQuedas();
}

function renderJanelas() {
  const { preparadas } = quadro();
  const def = JANELAS_MOVEIS.find((j) => j.id === estado.janelaMovel);
  const alvo = estado.selecionados[0] || BENCH;
  const serie = preparadas[alvo];

  const cabeca = $("#tituloJanelas");
  const corpo = $("#resumoJanelas");
  const grafico = $("#graficoJanelas");

  if (!serie) {
    corpo.innerHTML = "";
    G.limpar(grafico);
    return;
  }

  const jm = C.janelasMoveis(serie, def.pregoes);
  cabeca.textContent = `${alvo} — todas as janelas de ${def.rotulo}`;

  if (!jm) {
    corpo.innerHTML = `<p class="aviso-caixa">O período selecionado é curto demais para janelas de ${def.rotulo}. Escolha uma janela menor ou aumente o período no topo.</p>`;
    G.limpar(grafico);
    grafico.hidden = true;
    return;
  }
  grafico.hidden = false;

  corpo.innerHTML = `
    <div class="tiras">
      <div class="tira"><span class="rotulo">Pior janela</span><strong class="neg">${pctSinal(jm.pior)}</strong></div>
      <div class="tira"><span class="rotulo">Mediana</span><strong class="${sinal(jm.mediana)}">${pctSinal(jm.mediana)}</strong></div>
      <div class="tira"><span class="rotulo">Melhor janela</span><strong class="pos">${pctSinal(jm.melhor)}</strong></div>
      <div class="tira"><span class="rotulo">Janelas positivas</span><strong>${pct(jm.positivas, 0)}</strong></div>
      <div class="tira"><span class="rotulo">Amostras</span><strong>${jm.amostras}</strong></div>
    </div>`;

  G.histogramaJanelas(grafico, jm, def.rotulo);
}

function renderQuedas() {
  const { kpis } = quadro();
  const lista = estado.selecionados.length
    ? estado.selecionados
    : ativosVisiveis().slice(0, 8);

  $("#tabelaQuedas").innerHTML =
    `<thead><tr>
       <th>Ativo</th><th>Queda máxima</th><th>Do topo</th><th>Ao fundo</th>
       <th>Dias caindo</th><th>Recuperou em</th>
     </tr></thead><tbody>` +
    lista
      .filter((c) => kpis[c])
      .map((c) => {
        const k = kpis[c];
        return `<tr>
          <td><strong>${c}</strong></td>
          <td class="neg">${pct(k.drawdown)}</td>
          <td>${dataBr(k.ddInicio)}</td>
          <td>${dataBr(k.ddFundo)}</td>
          <td>${k.ddDiasQueda === null ? "—" : `${k.ddDiasQueda} dias`}</td>
          <td>${
            k.drawdown === 0
              ? "—"
              : k.ddRecuperacao
                ? `${k.ddDiasRecuperacao} dias`
                : `<span class="nulo">ainda não</span>`
          }</td>
        </tr>`;
      })
      .join("") +
    "</tbody>";
}

/* --------------------------------------------------------------------------
   Vista: carteira
   -------------------------------------------------------------------------- */

function renderPesos() {
  const { continuas } = quadro();
  const alvo = $("#listaPesos");
  const codigos = Object.keys(estado.carteira.pesos).filter((c) => continuas[c]);

  if (!codigos.length) {
    alvo.innerHTML = `<p class="aviso-caixa">Nenhum ativo na carteira. Use a busca abaixo para montar sua alocação.</p>`;
    return;
  }

  const soma = codigos.reduce((a, c) => a + estado.carteira.pesos[c], 0);

  alvo.innerHTML = codigos
    .map((c) => {
      const p = estado.carteira.pesos[c];
      const efetivo = soma > 0 ? (p / soma) * 100 : 0;
      return `<div class="linha-peso" data-codigo="${c}">
        <span class="peso-codigo">${c}</span>
        <input type="range" min="0" max="100" step="1" value="${p}" aria-label="Peso de ${c}">
        <span class="peso-valor">${efetivo.toFixed(0)}%</span>
        <button type="button" class="peso-remover" aria-label="Remover ${c}">×</button>
      </div>`;
    })
    .join("");

  alvo.querySelectorAll(".linha-peso").forEach((linha) => {
    const codigo = linha.dataset.codigo;
    linha.querySelector("input").addEventListener("input", (e) => {
      estado.carteira.pesos[codigo] = Number(e.target.value);
      renderPesos();
      renderCarteira();
    });
    linha.querySelector(".peso-remover").addEventListener("click", () => {
      delete estado.carteira.pesos[codigo];
      renderPesos();
      renderCarteira();
    });
  });

  $("#somaPesos").textContent =
    soma === 100 ? "100%" : `${soma}% (normalizado para 100%)`;
}

function renderSeletorCarteira() {
  const { continuas } = quadro();
  const alvo = $("#seletorCarteira");
  const busca = ($("#buscaCarteira").value || "").trim().toUpperCase();

  const lista = estado.dados.meta.ordem
    .filter((c) => continuas[c] && !(c in estado.carteira.pesos))
    .filter((c) => {
      if (!busca) return true;
      const s = estado.dados.series[c];
      return c.includes(busca) || s.nome.toUpperCase().includes(busca);
    })
    .slice(0, 12);

  alvo.innerHTML = lista.length
    ? lista
        .map(
          (c) =>
            `<button type="button" class="chip" data-codigo="${c}">${c}<span>+</span></button>`
        )
        .join("")
    : `<span class="nulo">Nada encontrado.</span>`;

  alvo.querySelectorAll(".chip").forEach((b) =>
    b.addEventListener("click", () => {
      // Divide igualmente entre os ativos: chegar em "175%" e depender da
      // normalização silenciosa confunde mais do que ajuda.
      const codigos = [...Object.keys(estado.carteira.pesos), b.dataset.codigo];
      const fatia = Math.round(100 / codigos.length);
      estado.carteira.pesos = {};
      codigos.forEach((c, i) => {
        estado.carteira.pesos[c] = i === 0 ? 100 - fatia * (codigos.length - 1) : fatia;
      });
      $("#buscaCarteira").value = "";
      renderPesos();
      renderSeletorCarteira();
      renderCarteira();
    })
  );
}

function renderCarteira() {
  const { continuas, preparadas, cdiAnual } = quadro();
  const cfg = estado.carteira;
  const resumo = $("#resumoCarteira");
  const grafico = $("#graficoCarteira");

  const codigos = Object.keys(cfg.pesos).filter((c) => continuas[c] && cfg.pesos[c] > 0);
  if (!codigos.length) {
    resumo.innerHTML = `<p class="aviso-caixa">Monte uma alocação para ver a simulação.</p>`;
    G.limpar(grafico);
    grafico.hidden = true;
    return;
  }
  grafico.hidden = false;

  const r = C.simularCarteira({
    series: continuas,
    pesos: cfg.pesos,
    inicial: cfg.inicial,
    aporte: cfg.aporte,
    rebal: cfg.rebal,
    custo: cfg.custo,
  });

  if (!r) {
    resumo.innerHTML = `<p class="aviso-caixa">Os ativos escolhidos não têm histórico em comum no período selecionado.</p>`;
    G.limpar(grafico);
    return;
  }

  // Cota: neutraliza o timing dos aportes, para comparar com benchmark.
  const cota = C.serieCota({
    series: continuas,
    pesos: cfg.pesos,
    rebal: cfg.rebal,
    custo: cfg.custo,
  });
  const twr = cota ? cota.serie.norm[cota.serie.norm.length - 1] - 1 : null;
  const kpiCota = cota
    ? C.calcularKpis(cota.serie, preparadas.CDI, preparadas[BENCH], null)
    : null;

  // Linha do total aportado, para o gráfico.
  const aportado = [];
  let acumulado = cfg.inicial;
  for (let i = 0; i < r.serie.datas.length; i++) {
    const d = r.serie.datas[i];
    const ant = i > 0 ? r.serie.datas[i - 1] : null;
    if (cfg.aporte > 0 && ant && d.slice(0, 7) !== ant.slice(0, 7)) acumulado += cfg.aporte;
    aportado.push(acumulado);
  }

  // Referências no mesmo regime de aportes, para comparação justa.
  const referencias = [];
  for (const ref of ["CDI", BENCH]) {
    if (!continuas[ref] || cfg.pesos[ref]) continue;
    const sim = C.simularCarteira({
      series: continuas,
      pesos: { [ref]: 100 },
      inicial: cfg.inicial,
      aporte: cfg.aporte,
      rebal: "nunca",
    });
    if (sim) {
      const alinhado = sim.serie.datas
        .map((d, i) => [d, sim.serie.brutos[i]])
        .filter(([d]) => d >= r.serie.datas[0]);
      referencias.push({
        nome: ref === "CDI" ? "Só CDI" : `Só ${ref}`,
        datas: alinhado.map(([d]) => d),
        valores: alinhado.map(([, v]) => v),
      });
    }
  }

  G.areaCarteira(
    grafico,
    { datas: r.serie.datas, valores: r.serie.brutos, aportado },
    referencias
  );

  const ganho = r.lucro >= 0;
  resumo.innerHTML = `
    <div class="placar">
      <div class="placar-item destaque">
        <span class="rotulo">Valor final</span>
        <strong class="placar-numero">${dinheiro(r.final)}</strong>
        <span class="placar-nota ${ganho ? "pos" : "neg"}">${
          ganho ? "+" : ""
        }${dinheiro(r.lucro)} sobre o aportado</span>
      </div>
      <div class="placar-item">
        <span class="rotulo">Total aportado</span>
        <strong>${dinheiro(r.investido)}</strong>
        <span class="placar-nota">${r.aportes} aportes mensais</span>
      </div>
      <div class="placar-item">
        <span class="rotulo">Retorno da cota</span>
        <strong class="${sinal(twr)}">${pctSinal(twr)}</strong>
        <span class="placar-nota">sem efeito do timing dos aportes</span>
      </div>
      <div class="placar-item">
        <span class="rotulo">Volatilidade</span>
        <strong>${pct(kpiCota?.vol)}</strong>
        <span class="placar-nota">Sharpe ${num(kpiCota?.sharpe)}</span>
      </div>
      <div class="placar-item">
        <span class="rotulo">Queda máxima</span>
        <strong class="neg">${pct(kpiCota?.drawdown)}</strong>
        <span class="placar-nota">${
          kpiCota?.ddRecuperacao
            ? `recuperou em ${kpiCota.ddDiasRecuperacao} dias`
            : "ainda não recuperada"
        }</span>
      </div>
      <div class="placar-item">
        <span class="rotulo">Rebalanceamentos</span>
        <strong>${r.rebalanceamentos}</strong>
        <span class="placar-nota">${
          r.custoTotal > 0 ? `${dinheiro(r.custoTotal)} em custos` : "sem custo aplicado"
        }</span>
      </div>
    </div>
    <p class="rodape-nota">
      Simulação de ${dataBr(r.dataInicio)} a ${dataBr(r.dataFim)}, limitada ao
      histórico comum dos ativos escolhidos. CDI de referência no período:
      ${pct(cdiAnual)} a.a. Não considera imposto de renda, come-cotas nem
      corretagem além do custo de rebalanceamento informado.
    </p>`;
}

/* --------------------------------------------------------------------------
   Vista: perfil
   -------------------------------------------------------------------------- */

const PERFIS = {
  Conservador: {
    faixa: [0, 4],
    texto:
      "Preservar o capital importa mais que buscar retorno. A sugestão concentra em pós-fixado e usa renda variável só como tempero.",
    alocacao: { CDI: 75, BOVA11: 15, IVVB11: 10 },
  },
  Moderado: {
    faixa: [5, 9],
    texto:
      "Aceita oscilação por retorno acima do CDI, desde que a queda não vire pânico. Diversificação entre classes é o que sustenta esse perfil.",
    alocacao: { CDI: 40, BOVA11: 25, IVVB11: 25, XFIX11: 10 },
  },
  Arrojado: {
    faixa: [10, 12],
    texto:
      "Horizonte longo e estômago para quedas de dois dígitos. O risco aqui não é a volatilidade — é concentrar demais e precisar do dinheiro na hora errada.",
    alocacao: { BOVA11: 40, IVVB11: 30, SMAL11: 15, CDI: 15 },
  },
};

function diagnosticar() {
  const form = $("#quiz");
  const aviso = $("#avisoQuiz");
  const faltando = $$("#quiz fieldset").filter(
    (fs) => !fs.querySelector("input:checked")
  );

  if (faltando.length) {
    aviso.textContent = `Falta responder ${faltando.length} ${
      faltando.length === 1 ? "pergunta" : "perguntas"
    }.`;
    faltando[0].scrollIntoView({ behavior: "smooth", block: "center" });
    faltando[0].querySelector("input")?.focus();
    return;
  }
  aviso.textContent = "";

  const score = [...form.querySelectorAll("input:checked")].reduce(
    (a, i) => a + Number(i.value),
    0
  );
  const nome =
    Object.keys(PERFIS).find(
      (k) => score >= PERFIS[k].faixa[0] && score <= PERFIS[k].faixa[1]
    ) || "Moderado";
  const perfil = PERFIS[nome];

  $("#perfilNome").textContent = nome;
  $("#perfilScore").textContent = `${score} de 12 pontos`;
  $("#perfilTexto").textContent = perfil.texto;

  const { continuas } = quadro();
  const disponivel = Object.entries(perfil.alocacao).filter(([c]) => continuas[c]);
  const soma = disponivel.reduce((a, [, p]) => a + p, 0);

  $("#barraAlocacao").innerHTML = disponivel
    .map(([c, p], i) => {
      const largura = (p / soma) * 100;
      return `<div style="flex:0 0 ${largura}%;background:${G.cor(i)}" title="${c}: ${p}%">${
        largura >= 12 ? `${Math.round(largura)}%` : ""
      }</div>`;
    })
    .join("");

  $("#legendaAlocacao").innerHTML = disponivel
    .map(
      ([c, p], i) =>
        `<span style="--c:${G.cor(i)}">${c} ${Math.round((p / soma) * 100)}%</span>`
    )
    .join("");

  $("#resultado").hidden = false;

  // O diagnóstico não termina num texto solto: vira uma carteira simulável.
  estado.carteira.pesos = Object.fromEntries(disponivel);
  renderPesos();
  renderSeletorCarteira();
  renderCarteira();
  $("#irParaCarteira").hidden = false;
}

/* --------------------------------------------------------------------------
   Estado, URL e navegação
   -------------------------------------------------------------------------- */

function alternar(codigo) {
  const i = estado.selecionados.indexOf(codigo);
  if (i !== -1) estado.selecionados.splice(i, 1);
  else {
    if (estado.selecionados.length >= MAX_SERIES) estado.selecionados.shift();
    estado.selecionados.push(codigo);
  }
  gravarUrl();
  render();
}

function gravarUrl() {
  const p = new URLSearchParams();
  if (estado.selecionados.length) p.set("ativos", estado.selecionados.join(","));
  p.set("periodo", estado.periodo);
  if (estado.vista !== "comparar") p.set("vista", estado.vista);
  const pesos = Object.entries(estado.carteira.pesos).filter(([, v]) => v > 0);
  if (pesos.length) p.set("carteira", pesos.map(([c, v]) => `${c}:${v}`).join(","));
  history.replaceState(null, "", `${location.pathname}?${p}`);
}

function lerUrl() {
  const p = new URLSearchParams(location.search);
  const periodo = p.get("periodo");
  if (periodo && PERIODOS.some((x) => x.id === periodo)) estado.periodo = periodo;

  const vista = p.get("vista");
  if (vista && ["comparar", "carteira", "risco", "perfil"].includes(vista)) {
    estado.vista = vista;
  }

  const ativos = p.get("ativos");
  if (ativos) {
    estado.selecionados = ativos
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((c) => c in estado.dados.series)
      .slice(0, MAX_SERIES);
  }

  const carteira = p.get("carteira");
  if (carteira) {
    for (const par of carteira.split(",")) {
      const [c, v] = par.split(":");
      const codigo = (c || "").trim().toUpperCase();
      const peso = Number(v);
      if (codigo in estado.dados.series && Number.isFinite(peso) && peso > 0) {
        estado.carteira.pesos[codigo] = Math.min(100, peso);
      }
    }
  }
}

function irPara(vista) {
  estado.vista = vista;
  $$("[data-vista]").forEach((s) => (s.hidden = s.dataset.vista !== vista));
  $$("#navVistas button").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.ir === vista))
  );
  gravarUrl();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* --------------------------------------------------------------------------
   Render mestre
   -------------------------------------------------------------------------- */

function render() {
  // aplicarTema() agenda um render no primeiro frame, que pode chegar antes do
  // fetch do dataset terminar.
  if (!estado.dados) return;
  renderFita();
  if (estado.vista === "comparar") {
    renderComparar();
    renderTabela();
  } else if (estado.vista === "risco") {
    renderRisco();
  } else if (estado.vista === "carteira") {
    renderPesos();
    renderSeletorCarteira();
    renderCarteira();
  }
}

function invalidar() {
  estado.cache = null;
  render();
}

/* --------------------------------------------------------------------------
   Tema
   -------------------------------------------------------------------------- */

function aplicarTema(modo) {
  document.documentElement.dataset.tema = modo;
  try {
    localStorage.setItem("finexor:tema", modo);
  } catch {
    /* modo privado bloqueia storage — o tema só não persiste */
  }
  $("#btnTema").setAttribute(
    "aria-label",
    modo === "escuro" ? "Mudar para tema claro" : "Mudar para tema escuro"
  );
  $("#btnTema").textContent = modo === "escuro" ? "☀" : "☾";
  requestAnimationFrame(render);
}

function temaInicial() {
  try {
    const salvo = localStorage.getItem("finexor:tema");
    if (salvo) return salvo;
  } catch {
    /* segue com a preferência do sistema */
  }
  // Escuro é o padrão sempre: a interface foi desenhada como terminal, e o
  // tema claro existe como alternativa para quem preferir, não como default
  // herdado do sistema.
  return "escuro";
}

/* --------------------------------------------------------------------------
   Montagem dos controles
   -------------------------------------------------------------------------- */

function montarControles() {
  // período
  $("#periodos").innerHTML = PERIODOS.map(
    (p) =>
      `<button type="button" data-id="${p.id}" aria-pressed="${
        p.id === estado.periodo
      }">${p.rotulo}</button>`
  ).join("");
  $$("#periodos button").forEach((b) =>
    b.addEventListener("click", () => {
      estado.periodo = b.dataset.id;
      $$("#periodos button").forEach((x) =>
        x.setAttribute("aria-pressed", String(x === b))
      );
      gravarUrl();
      invalidar();
    })
  );

  // modo do gráfico
  $$("#modosGrafico button").forEach((b) =>
    b.addEventListener("click", () => {
      estado.modoGrafico = b.dataset.modo;
      $$("#modosGrafico button").forEach((x) =>
        x.setAttribute("aria-pressed", String(x === b))
      );
      renderComparar();
    })
  );

  // filtros de classe
  const filtros = [{ id: "", rotulo: "Todos" }].concat(
    Object.entries(CLASSES).map(([id, rotulo]) => ({ id, rotulo }))
  );
  $("#filtrosClasse").innerHTML = filtros
    .map(
      (f) =>
        `<button type="button" data-classe="${f.id}" aria-pressed="${
          f.id === estado.filtroClasse
        }">${f.rotulo}</button>`
    )
    .join("");
  $$("#filtrosClasse button").forEach((b) =>
    b.addEventListener("click", () => {
      estado.filtroClasse = b.dataset.classe;
      $$("#filtrosClasse button").forEach((x) =>
        x.setAttribute("aria-pressed", String(x === b))
      );
      render();
    })
  );

  // busca
  $("#busca").addEventListener("input", (e) => {
    estado.busca = e.target.value;
    render();
  });

  // janelas móveis
  $("#janelasMoveis").innerHTML = JANELAS_MOVEIS.map(
    (j) =>
      `<button type="button" data-id="${j.id}" aria-pressed="${
        j.id === estado.janelaMovel
      }">${j.rotulo}</button>`
  ).join("");
  $$("#janelasMoveis button").forEach((b) =>
    b.addEventListener("click", () => {
      estado.janelaMovel = b.dataset.id;
      $$("#janelasMoveis button").forEach((x) =>
        x.setAttribute("aria-pressed", String(x === b))
      );
      renderJanelas();
    })
  );

  // navegação
  $$("#navVistas button").forEach((b) =>
    b.addEventListener("click", () => irPara(b.dataset.ir))
  );
  $("#irParaCarteira").addEventListener("click", () => irPara("carteira"));

  // carteira
  $("#buscaCarteira").addEventListener("input", renderSeletorCarteira);
  $("#aporteInicial").addEventListener("input", (e) => {
    estado.carteira.inicial = Math.max(0, Number(e.target.value) || 0);
    renderCarteira();
  });
  $("#aporteMensal").addEventListener("input", (e) => {
    estado.carteira.aporte = Math.max(0, Number(e.target.value) || 0);
    renderCarteira();
  });
  $("#custoRebal").addEventListener("input", (e) => {
    estado.carteira.custo = Math.max(0, Number(e.target.value) || 0);
    renderCarteira();
  });
  $$("#rebalanceamento button").forEach((b) =>
    b.addEventListener("click", () => {
      estado.carteira.rebal = b.dataset.rebal;
      $$("#rebalanceamento button").forEach((x) =>
        x.setAttribute("aria-pressed", String(x === b))
      );
      renderCarteira();
    })
  );
  $("#limparCarteira").addEventListener("click", () => {
    estado.carteira.pesos = {};
    gravarUrl();
    renderPesos();
    renderSeletorCarteira();
    renderCarteira();
  });

  // diversos
  $("#btnDiagnosticar").addEventListener("click", diagnosticar);
  $("#btnLimpar").addEventListener("click", () => {
    estado.selecionados = [];
    gravarUrl();
    render();
  });
  $("#btnTema").addEventListener("click", () =>
    aplicarTema(document.documentElement.dataset.tema === "escuro" ? "claro" : "escuro")
  );

  // atalho: "/" foca a busca, como nos terminais de mercado
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement.tagName !== "INPUT") {
      e.preventDefault();
      $("#busca").focus();
    }
    if (e.key === "Escape" && document.activeElement === $("#busca")) {
      $("#busca").value = "";
      estado.busca = "";
      $("#busca").blur();
      render();
    }
  });
}

/* --------------------------------------------------------------------------
   Boot
   -------------------------------------------------------------------------- */

async function iniciar() {
  aplicarTema(temaInicial());

  try {
    const resp = await fetch("assets/data/dataset.json", { cache: "no-cache" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    estado.dados = await resp.json();
  } catch (erro) {
    $("#carregando").innerHTML = `
      <div class="erro-caixa">
        <strong>Não consegui carregar os dados.</strong>
        <p>Gere o dataset e sirva a pasta <code>docs/</code> por HTTP —
        o navegador bloqueia <code>fetch</code> em <code>file://</code>.</p>
        <pre>python scripts/generate_data.py
python -m http.server 8000 --directory docs</pre>
        <small>${erro.message}</small>
      </div>`;
    return;
  }

  lerUrl();
  if (!estado.selecionados.length) {
    estado.selecionados = [BENCH, "CDI"].filter((c) => c in estado.dados.series);
  }

  const m = estado.dados.meta;
  $("#carimbo").innerHTML =
    `<span class="pisca"></span>${m.pregoes} pregões · dados até ${dataBr(m.fim)}`;
  $("#fonteDados").textContent = `${m.fonte_precos}. CDI: ${m.fonte_cdi}.`;

  $("#carregando").hidden = true;
  $("#painel").hidden = false;

  montarControles();
  irPara(estado.vista);

}

document.addEventListener("DOMContentLoaded", iniciar);
