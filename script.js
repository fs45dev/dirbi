/**
 * Verificador de Obrigatoriedade da DIRBI
 * Motor de regras + parsing de XML + validação de CNPJ.
 *
 * Atualização anual do Anexo Único:
 *   edite apenas beneficios.xml (código, nome, descrição, tributos, vigenciaInicio).
 *   O JS lê o XML via fetch/DOMParser e não depende da quantidade de itens.
 */
(function () {
  "use strict";

  /** @typedef {{codigo:string, nome:string, descricao:string, tributos:string, vigenciaInicio:string}} Beneficio */

  const REGIME_LABEL = {
    "lucro-real": "Lucro Real",
    "lucro-presumido": "Lucro Presumido",
    "simples-nacional": "Simples Nacional",
    imune: "Imune",
    isenta: "Isenta",
  };

  const CNAES_EXEMPLO = [
    ["1011-2/01", "Frigorífico - abate de bovinos"],
    ["1012-1/01", "Frigorífico - abate de suínos"],
    ["1012-1/02", "Frigorífico - abate de aves"],
    ["1052-0/00", "Fabricação de laticínios"],
    ["1091-1/02", "Fabricação de produtos de padaria e confeitaria"],
    ["1111-9/01", "Fabricação de aguardente de cana-de-açúcar"],
    ["1921-7/00", "Fabricação de óleos lubrificantes"],
    ["1931-4/00", "Fabricação de biocombustíveis"],
    ["2092-4/01", "Fabricação de tintas, vernizes e semelhantes"],
    ["2110-6/00", "Fabricação de produtos farmoquímicos"],
    ["2121-1/01", "Fabricação de medicamentos alopáticos"],
    ["2610-8/00", "Fabricação de componentes eletrônicos"],
    ["2621-3/00", "Fabricação de equipamentos de informática"],
    ["2710-4/01", "Fabricação de geradores, transformadores e motores elétricos"],
    ["2815-1/01", "Fabricação de máquinas e equipamentos para a extração mineral"],
    ["2910-7/01", "Fabricação de automóveis, camionetas e utilitários"],
    ["3011-3/01", "Construção de embarcações de grande porte"],
    ["3031-8/00", "Fabricação de locomotivas, vagões e peças"],
    ["3511-5/01", "Geração de energia elétrica"],
    ["3514-0/00", "Comercialização de energia elétrica"],
    ["3600-6/01", "Captação, tratamento e distribuição de água"],
    ["4110-7/00", "Incorporação de empreendimentos imobiliários"],
    ["4120-4/00", "Construção de edifícios"],
    ["4211-1/01", "Construção de rodovias e ferrovias"],
    ["4711-3/02", "Comércio varejista de mercadorias em geral — supermercados"],
    ["4761-0/01", "Comércio varejista de livros"],
    ["4911-6/00", "Transporte ferroviário de carga"],
    ["4921-3/01", "Transporte rodoviário coletivo urbano"],
    ["4930-2/01", "Transporte rodoviário de carga"],
    ["5111-1/00", "Transporte aéreo de passageiros regular"],
    ["5510-8/01", "Hotéis"],
    ["5611-2/01", "Restaurantes e similares"],
    ["5822-1/00", "Edição de livros, jornais e revistas"],
    ["5911-1/01", "Estúdios cinematográficos"],
    ["6201-5/00", "Desenvolvimento de programas de computador sob encomenda"],
    ["6202-3/00", "Desenvolvimento e licenciamento de programas de computador customizáveis"],
    ["6462-0/00", "Holdings de instituições não financeiras"],
    ["6550-2/00", "Fundos de investimento, fundos de previdência e similares"],
    ["6612-6/03", "Corretoras de títulos e valores mobiliários"],
    ["6911-7/01", "Serviços advocatícios"],
    ["6920-6/01", "Atividades de contabilidade"],
    ["7112-0/00", "Serviços de engenharia"],
    ["7210-0/00", "Pesquisa e desenvolvimento experimental em ciências físicas e naturais"],
    ["7490-1/04", "Atividades de intermediação e agenciamento de serviços e negócios em geral"],
    ["8230-0/01", "Serviços de organização de feiras, congressos, exposições e festas"],
    ["8513-9/00", "Ensino fundamental"],
    ["8531-7/00", "Educação superior — graduação"],
    ["8610-1/01", "Atividades de atendimento hospitalar"],
    ["8630-5/01", "Atividade médica ambulatorial com recursos para realização de exames complementares"],
    ["9312-3/00", "Clubes sociais, esportivos e similares"],
    ["9430-8/00", "Atividades de associações de defesa de direitos sociais"],
    ["9491-0/00", "Atividades de organizações religiosas ou filosóficas"],
  ];

  /** @type {Beneficio[]} */
  let catalogoBeneficios = [];
  /** @type {object[]} */
  let historico = [];

  const $ = (id) => document.getElementById(id);

  /* --------------------------------------------------------------------------
   * Validação de CNPJ (módulo 11, dois dígitos verificadores)
   * -------------------------------------------------------------------------- */
  function apenasDigitos(valor) {
    return String(valor || "").replace(/\D/g, "");
  }

  function mascaraCnpj(valor) {
    const d = apenasDigitos(valor).slice(0, 14);
    return d
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1/$2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }

  function mascaraCnae(valor) {
    const d = apenasDigitos(valor).slice(0, 7);
    if (d.length <= 4) return d;
    if (d.length === 5) return d.slice(0, 4) + "-" + d.slice(4);
    return d.slice(0, 4) + "-" + d.slice(4, 5) + "/" + d.slice(5);
  }

  /**
   * Calcula um DV pelo algoritmo módulo 11 usado no CNPJ.
   * @param {string} base
   * @param {number[]} pesos
   */
  function dvModulo11(base, pesos) {
    let soma = 0;
    for (let i = 0; i < pesos.length; i += 1) {
      soma += Number(base.charAt(i)) * pesos[i];
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  }

  function cnpjValido(valor) {
    const cnpj = apenasDigitos(valor);
    if (cnpj.length !== 14) return false;
    if (/^(\d)\1{13}$/.test(cnpj)) return false; // rejeita sequências 000... / 111...
    const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const dv1 = dvModulo11(cnpj, pesos1);
    const dv2 = dvModulo11(cnpj, pesos2);
    return dv1 === Number(cnpj.charAt(12)) && dv2 === Number(cnpj.charAt(13));
  }

  function formatarCnpj(valor) {
    const d = apenasDigitos(valor);
    if (d.length !== 14) return valor;
    return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  }

  /* --------------------------------------------------------------------------
   * Autopreenchimento: CNPJ → razão social / CNAE → descrição
   * Consultas públicas no navegador, com cache e fallback local.
   * -------------------------------------------------------------------------- */
  const mapaCnaeLocal = Object.fromEntries(
    CNAES_EXEMPLO.map(([cod, desc]) => [apenasDigitos(cod), desc])
  );
  const cacheCnpj = Object.create(null);
  const cacheCnae = Object.create(null);
  let catalogoCnaeIbge = null;
  let carregandoCatalogoCnae = null;
  let seqCnpj = 0;
  let seqCnae = 0;
  let ultimoCnpjConsultado = "";
  let ultimoCnaeConsultado = "";

  function tituloCnae(texto) {
    const s = String(texto || "").trim();
    if (!s) return "";
    if (s !== s.toUpperCase()) return s;
    return s.toLowerCase().replace(/(^|[\s\-/])(\S)/g, (_, a, b) => a + b.toUpperCase());
  }

  function setHint(id, msg) {
    const el = $("hint-" + id);
    if (el) el.textContent = msg;
  }

  function formatarCnaeCodigo(digits) {
    const d = apenasDigitos(digits).slice(0, 7);
    if (d.length !== 7) return mascaraCnae(d);
    return d.slice(0, 4) + "-" + d.slice(4, 5) + "/" + d.slice(5);
  }

  function aplicarCnae(codigoDigits, descricao, origem) {
    if (!codigoDigits || !descricao) return;
    const desc = tituloCnae(descricao);
    cacheCnae[codigoDigits] = desc;
    $("cnaeCodigo").value = formatarCnaeCodigo(codigoDigits);
    $("cnaeDescricao").value = desc;
    $("cnaeDescricao").classList.remove("is-invalid");
    $("cnaeCodigo").classList.remove("is-invalid");
    const errD = $("err-cnaeDescricao");
    const errC = $("err-cnaeCodigo");
    if (errD) errD.textContent = "";
    if (errC) errC.textContent = "";
    setHint("cnaeCodigo", "Descrição preenchida automaticamente (" + origem + ").");
  }

  function aplicarRazaoSocial(nome, origem) {
    if (!nome) return;
    $("razaoSocial").value = String(nome).trim();
    $("razaoSocial").classList.remove("is-invalid");
    const err = $("err-razaoSocial");
    if (err) err.textContent = "";
    setHint("razaoSocial", "Razão social obtida automaticamente (" + origem + ").");
    setHint("cnpj", "Cadastro localizado (" + origem + ").");
  }

  function extrairEmpresa(data) {
    if (!data || typeof data !== "object") return null;
    const estabelecimento = data.estabelecimento || {};
    const nome =
      data.razao_social ||
      data.nome ||
      data.nome_empresarial ||
      estabelecimento.nome ||
      (data.company && (data.company.name || data.company.razao_social)) ||
      "";
    const cnaeCod =
      data.cnae_fiscal ||
      (data.cnae_fiscal && data.cnae_fiscal.codigo) ||
      estabelecimento.cnae_principal ||
      (estabelecimento.atividade_principal && estabelecimento.atividade_principal.id) ||
      (data.atividade_principal && (data.atividade_principal[0] && data.atividade_principal[0].code)) ||
      "";
    const cnaeDesc =
      data.cnae_fiscal_descricao ||
      (data.cnae_fiscal && data.cnae_fiscal.descricao) ||
      (estabelecimento.atividade_principal && estabelecimento.atividade_principal.descricao) ||
      (data.atividade_principal && (data.atividade_principal[0] && data.atividade_principal[0].text)) ||
      "";
    if (!nome && !cnaeCod) return null;
    return {
      nome: String(nome || "").trim(),
      cnaeCodigo: apenasDigitos(cnaeCod).slice(0, 7),
      cnaeDescricao: String(cnaeDesc || "").trim(),
      simples: data.opcao_pelo_simples === true || data.opcao_pelo_simples === "S" || data.simples === true,
    };
  }

  function consultarJson(url) {
    return fetch(url, { headers: { Accept: "application/json" } }).then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  function buscarEmpresaPorCnpj(cnpjMascarado) {
    const digits = apenasDigitos(cnpjMascarado);
    if (digits.length !== 14 || !cnpjValido(digits)) return;
    if (digits === ultimoCnpjConsultado) return;
    ultimoCnpjConsultado = digits;
    const seq = ++seqCnpj;

    if (cacheCnpj[digits]) {
      preencherEmpresa(cacheCnpj[digits], "cache local");
      return;
    }

    setHint("cnpj", "Consultando cadastro público da empresa…");
    setHint("razaoSocial", "Buscando razão social a partir do CNPJ…");
    $("razaoSocial").placeholder = "Buscando razão social…";

    const fontes = [
      { url: "https://brasilapi.com.br/api/cnpj/v1/" + digits, origem: "BrasilAPI" },
      { url: "https://minhareceita.org/" + digits, origem: "Minha Receita" },
    ];

    (function tentar(i) {
      if (seq !== seqCnpj) return;
      if (i >= fontes.length) {
        setHint("cnpj", "CNPJ válido. Não foi possível obter a razão social automaticamente — preencha manualmente.");
        setHint("razaoSocial", "Preencha a razão social manualmente se a consulta pública estiver indisponível.");
        $("razaoSocial").placeholder = "";
        return;
      }
      consultarJson(fontes[i].url)
        .then((data) => {
          if (seq !== seqCnpj) return;
          const empresa = extrairEmpresa(data);
          if (!empresa || !empresa.nome) throw new Error("sem razão social");
          cacheCnpj[digits] = empresa;
          preencherEmpresa(empresa, fontes[i].origem);
        })
        .catch(() => tentar(i + 1));
    })(0);
  }

  function preencherEmpresa(empresa, origem) {
    aplicarRazaoSocial(empresa.nome, origem);
    $("razaoSocial").placeholder = "";
    if (empresa.cnaeCodigo) {
      const desc = empresa.cnaeDescricao || mapaCnaeLocal[empresa.cnaeCodigo] || cacheCnae[empresa.cnaeCodigo];
      if (desc) aplicarCnae(empresa.cnaeCodigo, desc, origem);
      else buscarDescricaoCnae(empresa.cnaeCodigo, true);
    }
    if (!$("regime").value && empresa.simples) {
      $("regime").value = "simples-nacional";
      sincronizarBlocos();
    }
  }

  function descricaoCnaeLocal(digits) {
    return mapaCnaeLocal[digits] || cacheCnae[digits] || (catalogoCnaeIbge && catalogoCnaeIbge[digits]) || "";
  }

  function carregarCatalogoCnaeIbge() {
    if (catalogoCnaeIbge) return Promise.resolve(catalogoCnaeIbge);
    if (carregandoCatalogoCnae) return carregandoCatalogoCnae;
    carregandoCatalogoCnae = consultarJson("https://servicodados.ibge.gov.br/api/v2/cnae/subclasses")
      .then((lista) => {
        catalogoCnaeIbge = Object.create(null);
        (lista || []).forEach((item) => {
          if (!item || !item.id) return;
          catalogoCnaeIbge[String(item.id)] = item.descricao || "";
        });
        return catalogoCnaeIbge;
      })
      .catch((err) => {
        carregandoCatalogoCnae = null;
        throw err;
      });
    return carregandoCatalogoCnae;
  }

  function buscarDescricaoCnae(codigo, forcar) {
    const digits = apenasDigitos(codigo).slice(0, 7);
    if (digits.length !== 7) return;
    if (!forcar && digits === ultimoCnaeConsultado && $("cnaeDescricao").value) return;
    ultimoCnaeConsultado = digits;
    const seq = ++seqCnae;

    const local = descricaoCnaeLocal(digits);
    if (local) {
      aplicarCnae(digits, local, "base local");
      return;
    }

    setHint("cnaeCodigo", "Consultando descrição oficial do CNAE…");
    $("cnaeDescricao").placeholder = "Buscando descrição…";

    carregarCatalogoCnaeIbge()
      .then((mapa) => {
        if (seq !== seqCnae) return;
        if (mapa[digits]) {
          aplicarCnae(digits, mapa[digits], "IBGE/CNAE");
          $("cnaeDescricao").placeholder = "Preenchida pelo código do CNAE";
          return;
        }
        return consultarJson("https://servicodados.ibge.gov.br/api/v2/cnae/classes/" + digits.slice(0, 5)).then((classe) => {
          if (seq !== seqCnae) return;
          const item = Array.isArray(classe) ? classe[0] : classe;
          const desc = item && item.descricao;
          if (!desc) throw new Error("CNAE não encontrado");
          aplicarCnae(digits, desc, "IBGE/CNAE (classe)");
          $("cnaeDescricao").placeholder = "Preenchida pelo código do CNAE";
        });
      })
      .catch(() => {
        if (seq !== seqCnae) return;
        $("cnaeDescricao").placeholder = "Preenchida pelo código do CNAE";
        setHint("cnaeCodigo", "Código informado. Não foi possível obter a descrição automática — preencha manualmente.");
      });
  }

  /* --------------------------------------------------------------------------
   * Datas / prazo (art. 5º da IN RFB nº 2.198/2024)
   * -------------------------------------------------------------------------- */
  function parsePeriodo(yyyyMm) {
    if (!yyyyMm || !/^\d{4}-\d{2}$/.test(yyyyMm)) return null;
    const [y, m] = yyyyMm.split("-").map(Number);
    if (m < 1 || m > 12) return null;
    return { ano: y, mes: m, chave: y * 100 + m };
  }

  function formatarMesAno(yyyyMm) {
    const p = parsePeriodo(yyyyMm);
    if (!p) return yyyyMm || "—";
    const nomes = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
    return nomes[p.mes - 1] + "/" + p.ano;
  }

  function prazoEntrega(yyyyMm) {
    const p = parsePeriodo(yyyyMm);
    if (!p) return { iso: "", label: "—" };
    const d = new Date(p.ano, p.mes - 1, 1);
    d.setMonth(d.getMonth() + 2);
    d.setDate(20);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return { iso: `${d.getFullYear()}-${mm}-${dd}`, label: `${dd}/${mm}/${d.getFullYear()}` };
  }

  /* --------------------------------------------------------------------------
   * XML — benefícios e empresas
   * -------------------------------------------------------------------------- */
  function texto(el, fallback) {
    return (el && el.textContent ? el.textContent : fallback || "").trim();
  }

  function parseBeneficiosXml(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    if (doc.querySelector("parsererror")) {
      throw new Error("beneficios.xml inválido.");
    }
    const nodes = [...doc.querySelectorAll("beneficio")];
    return nodes.map((n) => ({
      codigo: (n.getAttribute("codigo") || "").padStart(2, "0"),
      nome: texto(n.querySelector("nome")),
      descricao: texto(n.querySelector("descricao")),
      tributos: n.getAttribute("tributos") || "",
      vigenciaInicio: n.getAttribute("vigenciaInicio") || "202401",
    }));
  }

  function catalogoDoFallbackInline() {
    const node = document.getElementById("beneficios-inline");
    if (!node) return [];
    return parseBeneficiosXml(node.textContent || "");
  }

  function aplicarCatalogo(lista, origem) {
    catalogoBeneficios = lista;
    renderListaBeneficios("");
    toast("Anexo Único carregado (" + origem + "): " + catalogoBeneficios.length + " itens.");
  }

  function carregarBeneficios() {
    return fetch("beneficios.xml", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.text();
      })
      .then((xml) => aplicarCatalogo(parseBeneficiosXml(xml), "beneficios.xml"))
      .catch(() => {
        const fallback = catalogoDoFallbackInline();
        if (fallback.length) {
          aplicarCatalogo(fallback, "cópia embutida");
          return;
        }
        aplicarCatalogo(
          [
            {
              codigo: "07",
              nome: "CPRB — Contribuição Previdenciária sobre a Receita Bruta",
              descricao: "Desoneração da folha (Lei nº 12.546/2011 e Lei nº 14.973/2024).",
              tributos: "CPRB",
              vigenciaInicio: "202401",
            },
          ],
          "catálogo mínimo"
        );
      });
  }

  function beneficioVigenteNoPeriodo(ben, yyyyMm) {
    const p = parsePeriodo(yyyyMm);
    if (!p) return true;
    const vig = Number(ben.vigenciaInicio || "202401");
    return p.chave >= vig;
  }

  /* --------------------------------------------------------------------------
   * Motor de regras (item 3 do briefing)
   * -------------------------------------------------------------------------- */
  function avaliar(dados) {
    const regime = dados.regime;
    const usufruiu = dados.usufruiu === "sim";
    const cprb = dados.cprb === "sim";
    const selecionados = dados.beneficios || [];
    const periodo = dados.periodo;
    const prazo = prazoEntrega(periodo);

    const vigentes = selecionados.filter((b) => beneficioVigenteNoPeriodo(b, periodo));
    const prematuros = selecionados.filter((b) => !beneficioVigenteNoPeriodo(b, periodo));
    const temCprbNaLista = selecionados.some((b) => /cprb/i.test(b.codigo + " " + b.nome) || b.codigo === "07");
    const usouCprb = cprb || temCprbNaLista;
    const usouOutroListado = vigentes.length > 0;
    const usouQualquerInformado = usufruiu || usouCprb || selecionados.length > 0;

    /**
     * Regra 4 (prioritária no briefing): se nenhum benefício foi usufruído no período,
     * independentemente do regime → NÃO obrigada (dispensa "sem movimento").
     * Art. 2º, §3º, IN RFB nº 2.198/2024.
     */
    if (!usufruiu && !usouCprb && selecionados.length === 0) {
      return montarParecer({
        obrigada: false,
        titulo: "Não obrigada — ausência de fatos a informar",
        resumo:
          "Não houve fruição de benefício, incentivo, renúncia ou imunidade listados no Anexo Único no período. A DIRBI relativa a esse período não deve ser apresentada (declaração sem movimento é dispensada).",
        motivos: [
          "Nenhum benefício do Anexo Único foi indicado como usufruído.",
          regime === "simples-nacional"
            ? "No Simples Nacional também não foi informada a utilização de CPRB."
            : "A dispensa independe do regime tributário quando não há fato gerador da obrigação acessória.",
        ],
        fundamentacao: [
          "Art. 2º, §3º, da IN RFB nº 2.198/2024: na ausência de fatos a serem informados no período de apuração, as pessoas jurídicas não deverão apresentar a Dirbi relativa ao respectivo período.",
          "Art. 1º da IN RFB nº 2.198/2024 (redação da IN RFB nº 2.294/2025) c/c art. 43 da Lei nº 14.973/2024: a Dirbi destina-se às PJ que usufruem os benefícios constantes do Anexo Único.",
        ],
        prazo,
        penalidade: false,
        observacoes: observacoesComuns(regime, prematuros),
        dados,
        vigentes,
        prematuros,
      });
    }

    if (regime === "simples-nacional") {
      // Simples + CPRB ou outro benefício listado vigente → obrigada
      if (usouCprb || (usufruiu && usouOutroListado) || (usufruiu && selecionados.length === 0)) {
        const focoCprb = usouCprb;
        return montarParecer({
          obrigada: true,
          titulo: focoCprb
            ? "Obrigada — Simples Nacional com CPRB"
            : "Obrigada — Simples Nacional com benefício do Anexo Único",
          resumo: focoCprb
            ? "A microempresa ou EPP do Simples Nacional que recolhe a CPRB deve apresentar a DIRBI relativamente à diferença entre a CPRB devida e o montante que seria devido sem a opção pela CPRB."
            : "Foi informada a fruição de benefício constante do Anexo Único no período. Pelo critério desta ferramenta, a entrega é devida.",
          motivos: [
            focoCprb
              ? "Utilização de CPRB no período (exceção expressa à dispensa do Simples)."
              : "Fruição de benefício listado no Anexo Único.",
            "A apresentação, quando devida, é centralizada no estabelecimento matriz e mensal.",
          ],
          fundamentacao: [
            "Art. 3º, I e §1º, da IN RFB nº 2.198/2024: a dispensa das optantes pelo Simples Nacional não se aplica às PJ sujeitas ao pagamento da CPRB (Lei nº 12.546/2011, art. 7º, IV e VII). Devem ser informados os valores da diferença entre a CPRB devida e a contribuição patronal que seria devida sem a opção.",
            "Art. 3º, §2º e §3º: não se informam na Dirbi os valores apurados na forma do Simples Nacional; a Dirbi é apresentada apenas nos meses em que houver CPRB a declarar.",
            "Art. 43 da Lei nº 14.973/2024 e art. 1º da IN RFB nº 2.198/2024, com a redação da IN RFB nº 2.294/2025.",
          ],
          prazo,
          penalidade: true,
          observacoes: observacoesComuns(regime, prematuros).concat([
            "Valores do DAS/Simples Nacional não são informados na DIRBI.",
            "MEI permanece dispensado.",
          ]),
          dados,
          vigentes: vigentes.length ? vigentes : selecionados,
          prematuros,
        });
      }

      return montarParecer({
        obrigada: false,
        titulo: "Não obrigada — Simples Nacional sem CPRB e sem benefício listado",
        resumo:
          "A ME/EPP enquadrada no Simples Nacional está dispensada da DIRBI no período em que não esteja sujeita à CPRB e não tenha usufruído outro item do Anexo Único.",
        motivos: [
          "Regime: Simples Nacional.",
          "CPRB não utilizada no período.",
          "Sem fruição de outro benefício listado vigente no período.",
        ],
        fundamentacao: [
          "Art. 3º, I, da IN RFB nº 2.198/2024: ficam dispensadas as microempresas e empresas de pequeno porte enquadradas no Simples Nacional, relativamente ao período abrangido pelo regime.",
          "FAQ da Receita Federal e serviço gov.br: a optante pelo Simples que recolhe CPRB deve declarar; as demais, não.",
        ],
        prazo,
        penalidade: false,
        observacoes: observacoesComuns(regime, prematuros),
        dados,
        vigentes,
        prematuros,
      });
    }

    // Lucro Real, Lucro Presumido, Imune ou Isenta + benefício do Anexo → obrigada
    if (usufruiu || usouOutroListado) {
      const notaImune =
        regime === "imune"
          ? "A Receita Federal esclarece que entidades imunes pela Constituição Federal (arts. 150, VI, e 195, §7º) não precisam entregar a DIRBI apenas por essa imunidade constitucional, que não consta do Anexo. Se, contudo, a entidade usufruiu item listado no Anexo Único, a entrega é devida quanto a esse item."
          : regime === "isenta"
            ? "Entidades isentas devem apresentar a DIRBI relativamente aos benefícios do Anexo Único que tenham efetivamente usufruído."
            : "A obrigação recai principalmente sobre PJ no lucro real ou presumido que tenham usufruído item do Anexo Único.";

      return montarParecer({
        obrigada: true,
        titulo: "Obrigada — fruição de benefício do Anexo Único",
        resumo:
          "Pessoa jurídica de direito privado (" +
          (REGIME_LABEL[regime] || regime) +
          ") que usufruiu incentivo, renúncia, benefício ou imunidade constante do Anexo Único no período de referência.",
        motivos: [
          "Regime tributário: " + (REGIME_LABEL[regime] || regime) + ".",
          "Houve fruição de benefício no período.",
          vigentes.length
            ? "Itens informados vigentes no período: " + vigentes.map((b) => b.codigo).join(", ") + "."
            : "Fruição declarada sem individualização de item (a seleção do Anexo é opcional, mas recomendada).",
        ],
        fundamentacao: [
          "Art. 43 da Lei nº 14.973/2024.",
          "Arts. 1º e 2º da IN RFB nº 2.198/2024 (redação da IN RFB nº 2.294/2025): são obrigadas as pessoas jurídicas de direito privado em geral, inclusive as equiparadas e as isentas, e os consórcios que realizam negócios jurídicos em nome próprio, quando usufruem os benefícios do Anexo Único.",
          "Art. 2º, §2º: apresentação centralizada pelo estabelecimento matriz.",
          notaImune,
        ],
        prazo,
        penalidade: true,
        observacoes: observacoesComuns(regime, prematuros),
        dados,
        vigentes: vigentes.length ? vigentes : selecionados,
        prematuros,
      });
    }

    return montarParecer({
      obrigada: false,
      titulo: "Não obrigada — sem fruição no período",
      resumo: "Não há fato a informar. A DIRBI do período não deve ser transmitida.",
      motivos: ["Ausência de benefício usufruído no período de apuração."],
      fundamentacao: [
        "Art. 2º, §3º, da IN RFB nº 2.198/2024.",
        "Art. 43 da Lei nº 14.973/2024.",
      ],
      prazo,
      penalidade: false,
      observacoes: observacoesComuns(regime, prematuros),
      dados,
      vigentes,
      prematuros,
    });
  }

  function observacoesComuns(regime, prematuros) {
    const obs = [
      "Itens 89 a 173 do Anexo Único (IN RFB nº 2.294/2025) somente são exigíveis nas DIRBI de períodos de apuração de janeiro/2026 e posteriores.",
      "A declaração é mensal e deve ser assinada com certificado digital no e-CAC.",
    ];
    if (prematuros && prematuros.length) {
      obs.push(
        "Itens selecionados ainda não exigíveis neste período: " +
          prematuros.map((b) => b.codigo).join(", ") +
          "."
      );
    }
    if (regime === "lucro-real") {
      obs.push("Informações de IRPJ/CSLL: no lucro real anual, reportar na DIRBI de dezembro; no trimestral, no mês de encerramento do trimestre.");
    }
    return obs;
  }

  function montarParecer(p) {
    return p;
  }

  /* --------------------------------------------------------------------------
   * UI
   * -------------------------------------------------------------------------- */
  function renderListaBeneficios(filtro) {
    const box = $("listaBeneficios");
    if (!box) return;
    const q = (filtro || "").toLowerCase().trim();
    const periodo = $("periodo").value;
    const itens = catalogoBeneficios.filter((b) => {
      if (!q) return true;
      return (b.codigo + " " + b.nome + " " + b.tributos + " " + b.descricao).toLowerCase().includes(q);
    });
    if (!itens.length) {
      box.innerHTML = "<p class='hint' style='padding:8px'>Nenhum benefício encontrado. Atualize beneficios.xml se o Anexo tiver sido republicado.</p>";
      return;
    }
    box.innerHTML = itens
      .map((b) => {
        const cedo = periodo && !beneficioVigenteNoPeriodo(b, periodo);
        return `<label class="benef-item">
          <input type="checkbox" name="beneficio" value="${escapeHtml(b.codigo)}" data-nome="${escapeHtml(b.nome)}" />
          <span class="cod">${escapeHtml(b.codigo)}</span>
          <span class="nome">${escapeHtml(b.nome)}
            ${cedo ? "<span class='tag'>exigível só a partir de jan/2026</span>" : ""}
            <br /><span class="hint">${escapeHtml(b.tributos)}</span>
          </span>
        </label>`;
      })
      .join("");
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function coletarBeneficiosMarcados() {
    return [...document.querySelectorAll("input[name='beneficio']:checked")].map((chk) => {
      const found = catalogoBeneficios.find((b) => b.codigo === chk.value);
      return found || { codigo: chk.value, nome: chk.dataset.nome || chk.value, descricao: "", tributos: "", vigenciaInicio: "202401" };
    });
  }

  function lerFormulario() {
    return {
      razaoSocial: $("razaoSocial").value.trim(),
      cnpj: $("cnpj").value.trim(),
      cnaeCodigo: $("cnaeCodigo").value.trim(),
      cnaeDescricao: $("cnaeDescricao").value.trim(),
      regime: $("regime").value,
      periodo: $("periodo").value,
      usufruiu: (document.querySelector("input[name='usufruiu']:checked") || {}).value || "",
      cprb: (document.querySelector("input[name='cprb']:checked") || {}).value || "",
      beneficios: coletarBeneficiosMarcados(),
    };
  }

  function limparErros() {
    document.querySelectorAll(".error").forEach((el) => {
      el.textContent = "";
    });
    document.querySelectorAll(".is-invalid").forEach((el) => el.classList.remove("is-invalid"));
  }

  function setErro(id, msg) {
    const campo = $(id);
    const err = $("err-" + id);
    if (campo) campo.classList.add("is-invalid");
    if (err) err.textContent = msg;
  }

  function validar(dados) {
    limparErros();
    let ok = true;
    if (!dados.razaoSocial) {
      setErro("razaoSocial", "Informe a razão social.");
      ok = false;
    }
    if (!dados.cnpj) {
      setErro("cnpj", "Informe o CNPJ.");
      ok = false;
    } else if (!cnpjValido(dados.cnpj)) {
      setErro("cnpj", "CNPJ inválido. Verifique os dígitos verificadores.");
      ok = false;
    }
    if (!dados.periodo) {
      setErro("periodo", "Informe o mês/ano de referência.");
      ok = false;
    } else if (!parsePeriodo(dados.periodo)) {
      setErro("periodo", "Período inválido.");
      ok = false;
    }
    if (!dados.cnaeCodigo || apenasDigitos(dados.cnaeCodigo).length < 7) {
      setErro("cnaeCodigo", "Informe o CNAE no formato 0000-0/00.");
      ok = false;
    }
    if (!dados.cnaeDescricao) {
      setErro("cnaeDescricao", "Informe a descrição do CNAE principal.");
      ok = false;
    }
    if (!dados.regime) {
      setErro("regime", "Selecione o regime tributário.");
      ok = false;
    }
    if (!dados.usufruiu) {
      const box = $("err-usufruiu");
      if (box) box.textContent = "Informe se houve fruição de benefício no período.";
      ok = false;
    }
    if (dados.regime === "simples-nacional" && !dados.cprb) {
      const box = $("err-cprb");
      if (box) box.textContent = "No Simples Nacional é obrigatório informar se houve CPRB.";
      ok = false;
    }
    return ok;
  }

  function renderParecer(p) {
    const cls = p.obrigada ? "obrigada" : "dispensada";
    const sel = (p.vigentes && p.vigentes.length ? p.vigentes : p.dados.beneficios || [])
      .map((b) => `<li><strong>${escapeHtml(b.codigo)}</strong> — ${escapeHtml(b.nome)}</li>`)
      .join("");

    $("resultado").innerHTML = `
      <div class="parecer">
        <div class="stamp ${cls}">
          <div class="badge">${p.obrigada ? "OBRIGADA" : "NÃO OBRIGADA"}</div>
          <div>
            <h3>${escapeHtml(p.titulo)}</h3>
            <p>Período ${escapeHtml(formatarMesAno(p.dados.periodo))} · CNPJ ${escapeHtml(formatarCnpj(p.dados.cnpj))}</p>
          </div>
        </div>
        <dl class="kv">
          <dt>Razão social</dt><dd>${escapeHtml(p.dados.razaoSocial)}</dd>
          <dt>CNAE</dt><dd>${escapeHtml(p.dados.cnaeCodigo)} — ${escapeHtml(p.dados.cnaeDescricao)}</dd>
          <dt>Regime</dt><dd>${escapeHtml(REGIME_LABEL[p.dados.regime] || p.dados.regime)}</dd>
          <dt>Prazo de entrega</dt><dd>${p.obrigada ? "Até " + p.prazo.label + " (20º dia do 2º mês subsequente)" : "Não há DIRBI a transmitir neste período"}</dd>
        </dl>
        <div class="block">
          <h4>Parecer</h4>
          <p>${escapeHtml(p.resumo)}</p>
          <ul style="margin-top:8px">${p.motivos.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}</ul>
        </div>
        <div class="block">
          <h4>Fundamentação legal</h4>
          <ul>${p.fundamentacao.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}</ul>
        </div>
        ${
          sel
            ? `<div class="block"><h4>Itens do Anexo Único considerados</h4><ul>${sel}</ul></div>`
            : ""
        }
        ${
          p.penalidade
            ? `<div class="block alert-penalidade">
                <h4>Alerta de penalidade (se houver atraso ou omissão)</h4>
                <p>Art. 44 da Lei nº 14.973/2024 e art. 7º da IN RFB nº 2.198/2024 (redação da IN RFB nº 2.294/2025). Multa por mês ou fração sobre a receita bruta do período:</p>
                <ul>
                  <li>0,5% sobre a receita bruta de até R$ 1.000.000,00;</li>
                  <li>1% sobre a receita bruta de R$ 1.000.000,01 até R$ 10.000.000,00;</li>
                  <li>1,5% sobre a receita bruta acima de R$ 10.000.000,00.</li>
                </ul>
                <p style="margin-top:8px">A multa por atraso fica limitada a 30% do valor dos benefícios usufruídos. Há ainda multa de 3% (mínimo R$ 500,00) sobre valor omitido, inexato ou incorreto, exigida de ofício.</p>
              </div>`
            : `<div class="block"><h4>Penalidade</h4><p>Sem DIRBI devida no período, não incide a multa do art. 7º da IN RFB nº 2.198/2024 por falta de entrega desta competência. Permanecem as regras gerais caso exista obrigação em outro período.</p></div>`
        }
        <div class="block">
          <h4>Observações operacionais</h4>
          <ul>${p.observacoes.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}</ul>
        </div>
      </div>
    `;
  }

  function adicionarHistorico(p) {
    historico.unshift({
      consultadoEm: new Date().toISOString(),
      razaoSocial: p.dados.razaoSocial,
      cnpj: formatarCnpj(p.dados.cnpj),
      cnaeCodigo: p.dados.cnaeCodigo,
      cnaeDescricao: p.dados.cnaeDescricao,
      regime: p.dados.regime,
      periodo: p.dados.periodo,
      usufruiu: p.dados.usufruiu,
      cprb: p.dados.regime === "simples-nacional" ? p.dados.cprb : "nao-se-aplica",
      beneficios: p.dados.beneficios || [],
      obrigada: p.obrigada,
      titulo: p.titulo,
      resumo: p.resumo,
      fundamentacao: p.fundamentacao.join(" "),
      prazo: p.prazo.label,
    });
    renderHistorico();
    persistirSessao();
  }

  function renderHistorico() {
    const tb = $("tabelaHistorico");
    if (!historico.length) {
      tb.innerHTML = "<tr><td colspan='6'>Nenhuma consulta emitida nesta sessão.</td></tr>";
      return;
    }
    tb.innerHTML = historico
      .map((h) => {
        const chip = h.obrigada
          ? "<span class='status-chip no'>Obrigada</span>"
          : "<span class='status-chip ok'>Dispensada</span>";
        return `<tr>
          <td>${escapeHtml(h.cnpj)}</td>
          <td>${escapeHtml(h.razaoSocial)}</td>
          <td>${escapeHtml(REGIME_LABEL[h.regime] || h.regime)}</td>
          <td>${escapeHtml(formatarMesAno(h.periodo))}</td>
          <td>${chip}</td>
          <td>${escapeHtml(h.prazo)}</td>
        </tr>`;
      })
      .join("");
  }

  function xmlEmpresas(lista) {
    const itens = lista
      .map((h) => {
        const bens = (h.beneficios || [])
          .map((b) => `      <beneficio codigo="${escapeHtml(b.codigo)}">${escapeHtml(b.nome)}</beneficio>`)
          .join("\n");
        return `  <empresa consultadoEm="${escapeHtml(h.consultadoEm)}">
    <razaoSocial>${escapeHtml(h.razaoSocial)}</razaoSocial>
    <cnpj>${escapeHtml(h.cnpj)}</cnpj>
    <cnae codigo="${escapeHtml(h.cnaeCodigo)}">${escapeHtml(h.cnaeDescricao)}</cnae>
    <regime>${escapeHtml(h.regime)}</regime>
    <periodo>${escapeHtml(h.periodo)}</periodo>
    <usufruiuBeneficio>${escapeHtml(h.usufruiu)}</usufruiuBeneficio>
    <utilizouCprb>${escapeHtml(h.cprb)}</utilizouCprb>
    <beneficios>
${bens || "      <!-- nenhum item selecionado -->"}
    </beneficios>
    <resultado obrigada="${h.obrigada ? "true" : "false"}" status="${h.obrigada ? "obrigada" : "dispensada"}">
      <parecer>${escapeHtml(h.resumo)}</parecer>
      <fundamentacao>${escapeHtml(h.fundamentacao)}</fundamentacao>
      <prazo>${escapeHtml(h.prazo)}</prazo>
    </resultado>
  </empresa>`;
      })
      .join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>
<empresas versaoSchema="1.0" aplicativo="Verificador de Obrigatoriedade da DIRBI">
${itens}
</empresas>
`;
  }

  function exportarXml() {
    if (!historico.length) {
      toast("Emita ao menos um parecer antes de exportar.");
      return;
    }
    const blob = new Blob([xmlEmpresas(historico)], { type: "application/xml;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "empresas.xml";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("empresas.xml gerado com " + historico.length + " consulta(s).");
  }

  function importarXml(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const doc = new DOMParser().parseFromString(String(reader.result), "application/xml");
        if (doc.querySelector("parsererror")) throw new Error("XML inválido");
        const empresas = [...doc.querySelectorAll("empresa")];
        if (!empresas.length) throw new Error("Nenhuma empresa no arquivo");
        empresas.forEach((el) => {
          const bens = [...el.querySelectorAll("beneficios beneficio")].map((b) => ({
            codigo: b.getAttribute("codigo") || "",
            nome: texto(b),
          }));
          const res = el.querySelector("resultado");
          historico.unshift({
            consultadoEm: el.getAttribute("consultadoEm") || new Date().toISOString(),
            razaoSocial: texto(el.querySelector("razaoSocial")),
            cnpj: texto(el.querySelector("cnpj")),
            cnaeCodigo: (el.querySelector("cnae") && el.querySelector("cnae").getAttribute("codigo")) || "",
            cnaeDescricao: texto(el.querySelector("cnae")),
            regime: texto(el.querySelector("regime")),
            periodo: texto(el.querySelector("periodo")),
            usufruiu: texto(el.querySelector("usufruiuBeneficio")),
            cprb: texto(el.querySelector("utilizouCprb")),
            beneficios: bens,
            obrigada: res && res.getAttribute("obrigada") === "true",
            titulo: "",
            resumo: texto(res && res.querySelector("parecer")),
            fundamentacao: texto(res && res.querySelector("fundamentacao")),
            prazo: texto(res && res.querySelector("prazo")),
          });
        });
        renderHistorico();
        persistirSessao();
        toast(empresas.length + " registro(s) importado(s) de empresas.xml.");
      } catch (err) {
        toast("Falha ao importar XML: " + err.message);
      }
    };
    reader.readAsText(file, "UTF-8");
  }

  function persistirSessao() {
    try {
      sessionStorage.setItem("dirbi.historico", JSON.stringify(historico));
    } catch (e) {
      /* storage cheio ou bloqueado — ignore */
    }
  }

  function restaurarSessao() {
    try {
      const raw = sessionStorage.getItem("dirbi.historico");
      if (raw) {
        historico = JSON.parse(raw) || [];
        renderHistorico();
      }
    } catch (e) {
      historico = [];
    }
  }

  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 3200);
  }

  function sincronizarBlocos() {
    const regime = $("regime").value;
    const usufruiu = (document.querySelector("input[name='usufruiu']:checked") || {}).value;
    $("blocoCprb").classList.toggle("hidden", regime !== "simples-nacional");
    $("blocoBeneficios").classList.toggle("hidden", usufruiu !== "sim" && regime !== "simples-nacional");
  }

  function popularCnaes() {
    $("listaCnae").innerHTML = CNAES_EXEMPLO.map((c) => `<option value="${escapeHtml(c[1])}"></option>`).join("");
    $("cnaeDescricao").addEventListener("change", () => {
      const found = CNAES_EXEMPLO.find((c) => c[1] === $("cnaeDescricao").value);
      if (found) $("cnaeCodigo").value = found[0];
    });
  }

  function limparFormulario() {
    $("formulario").reset();
    limparErros();
    ultimoCnpjConsultado = "";
    ultimoCnaeConsultado = "";
    setHint("cnpj", "Validação dos dígitos e consulta da razão social no cadastro público.");
    setHint("razaoSocial", "Preenchida automaticamente ao informar um CNPJ válido.");
    setHint("cnaeCodigo", "Ao completar o código, a descrição oficial é preenchida.");
    sincronizarBlocos();
    $("resultado").innerHTML = `<div class="placeholder"><strong>Aguardando preenchimento</strong>Informe CNPJ, CNAE, regime e o uso de benefícios para determinar se a empresa está obrigada a transmitir a DIRBI no período.</div>`;
  }

  function init() {
    popularCnaes();
    restaurarSessao();
    carregarBeneficios();

    $("cnpj").addEventListener("input", (e) => {
      e.target.value = mascaraCnpj(e.target.value);
      const digits = apenasDigitos(e.target.value);
      if (digits.length === 14 && cnpjValido(digits)) {
        $("err-cnpj").textContent = "";
        e.target.classList.remove("is-invalid");
        buscarEmpresaPorCnpj(digits);
      } else if (digits.length < 14) {
        ultimoCnpjConsultado = "";
      }
    });
    $("cnpj").addEventListener("blur", (e) => {
      if (e.target.value && !cnpjValido(e.target.value)) {
        setErro("cnpj", "CNPJ inválido. Verifique os dígitos verificadores.");
      } else {
        $("err-cnpj").textContent = "";
        e.target.classList.remove("is-invalid");
        if (cnpjValido(e.target.value)) buscarEmpresaPorCnpj(e.target.value);
      }
    });
    $("cnaeCodigo").addEventListener("input", (e) => {
      e.target.value = mascaraCnae(e.target.value);
      const digits = apenasDigitos(e.target.value);
      if (digits.length === 7) {
        buscarDescricaoCnae(digits);
      } else if (digits.length < 7) {
        ultimoCnaeConsultado = "";
        setHint("cnaeCodigo", "Ao completar o código, a descrição oficial é preenchida.");
      }
    });
    $("cnaeCodigo").addEventListener("blur", (e) => {
      if (apenasDigitos(e.target.value).length === 7) buscarDescricaoCnae(e.target.value);
    });
    $("regime").addEventListener("change", sincronizarBlocos);
    document.querySelectorAll("input[name='usufruiu']").forEach((r) => r.addEventListener("change", sincronizarBlocos));
    $("filtroBeneficio").addEventListener("input", (e) => renderListaBeneficios(e.target.value));
    $("periodo").addEventListener("change", () => renderListaBeneficios($("filtroBeneficio").value));

    $("formulario").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const dados = lerFormulario();
      if (!validar(dados)) {
        toast("Corrija os campos destacados para emitir o parecer.");
        return;
      }
      dados.cnpj = formatarCnpj(dados.cnpj);
      const parecer = avaliar(dados);
      renderParecer(parecer);
      adicionarHistorico(parecer);
      $("painelResultado").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    $("btnLimpar").addEventListener("click", limparFormulario);
    $("btnExportar").addEventListener("click", exportarXml);
    $("importXml").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) importarXml(file);
      e.target.value = "";
    });

    const agora = new Date();
    $("periodo").value = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
  }

  document.addEventListener("DOMContentLoaded", init);
})();
