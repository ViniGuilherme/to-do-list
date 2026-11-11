// ==============================================================
// DADOS
// ==============================================================
var CHAVE_TAREFAS = "todo_tarefas";
var CHAVE_CONFIG = "todo_config";
var CHAVE_USUARIO = "todo_usuario";
var TAM_MIN = 70;    // dá pra diminuir abaixo de 100%
var TAM_MAX = 200;

var tarefas = [];       // cada tarfea: { id, texto, feita }
var filtro = "todas";   // todas | pendentes | feitas
var aoConfirmar = null; // guarda o que fazer se a pessoa confirmar no diálogo

// configurações de acessibilidade (valores padrão)
var config = {
  tamanho: 100,
  dislexia: false,
  contraste: false,
  foco: false,
  confirmar: true
};

// atalhos pros elementos que a gente usa bastante
var raiz = document.documentElement;
var form = document.getElementById("form");
var campo = document.getElementById("nova");
var lista = document.getElementById("lista");
var aviso = document.getElementById("aviso");
var tituloLista = document.getElementById("titulo-lista");
var dialogo = document.getElementById("dialogo");

// ==============================================================
// SALVAR E CARREGAR (lcoalStorage)
// Vini: tem try/catch porque em modo anônimo o navegador pode bloquear (pesquisei na ia a solucao).
// ==============================================================
function lerStorage(chave, padrao) {
  try {
    var texto = localStorage.getItem(chave);
    return texto ? JSON.parse(texto) : padrao;
  } catch (erro) {
    return padrao;
  }
}

function salvar() {
  try {
    localStorage.setItem(CHAVE_TAREFAS, JSON.stringify(tarefas));
    localStorage.setItem(CHAVE_CONFIG, JSON.stringify(config));
  } catch (erro) {
    // se não der pra salvar, o app continua funcionando, só não lembra depois
  }
}

// ==============================================================
// AVISOS
// Limpa antes de escrever, senão o leitor de tela não repete
// uma mensagem igual à anterior.
// ==============================================================
function avisar(mensagem) {
  aviso.textContent = "";
  setTimeout(function () { aviso.textContent = mensagem; }, 50);
}

// ==============================================================
// DUPLA CHECAGEM
// Abre o diálogo e só executa a ação se a pessoa clicar em "Sim".
// ==============================================================
function confirmar(titulo, texto, botaoSim, acao) {
  // navegador antigo sem <dialog>: usa o confirm() padrão, funciona igual
  if (typeof dialogo.showModal !== "function") {
    if (window.confirm(texto)) { acao(); }
    return;
  }
  document.getElementById("dialogo-titulo").textContent = titulo;
  document.getElementById("dialogo-texto").textContent = texto;
  document.getElementById("dialogo-sim").textContent = botaoSim;
  aoConfirmar = acao;
  dialogo.returnValue = "";   // zera, senão sobra o valor da vez anterior
  dialogo.showModal();
}

// quando o diálogo fecha (botão ou tecla Esc), vê o que a pessoa escolheu
dialogo.addEventListener("close", function () {
  if (dialogo.returnValue === "sim" && aoConfirmar) {
    aoConfirmar();
  }
  aoConfirmar = null;
});

// ==============================================================
// LEITURA EM VOZ ALTA (bom pra dislexia e baixa visão)
// ==============================================================
function falar(texto) {
  if (!("speechSynthesis" in window)) {
    avisar("Seu navegador não tem leitura em voz alta.");
    return;
  }
  window.speechSynthesis.cancel();  // para qualquer fala anterior
  var fala = new SpeechSynthesisUtterance(texto);
  fala.lang = "pt-BR";
  fala.rate = 0.9;                  // um pouco mais devagar
  window.speechSynthesis.speak(fala);
}

// ==============================================================
// AÇÕES DAS TAREFAS
// ==============================================================
function adicionar(evento) {
  evento.preventDefault();   // não deixa a página recarregar

  var texto = campo.value.trim();

  if (texto === "") {
    avisar("Escreva alguma coisa antes de adicionar.");
    campo.focus();
    return;
  }

  // checa se já existe uma igual (ignorando maiúscula/minúscula)
  var repetida = tarefas.some(function (t) {
    return t.texto.toLowerCase() === texto.toLowerCase();
  });

  if (repetida) {
    confirmar(
      "Tarefa repetida",
      "Já existe uma tarefa igual a “" + texto + "”. Adicionar mesmo assim?",
      "Sim, adicionar",
      function () { criarTarefa(texto); }
    );
    return;
  }

  criarTarefa(texto);
}

function criarTarefa(texto) {
  tarefas.push({ id: Date.now(), texto: texto, feita: false });
  campo.value = "";
  campo.focus();
  salvar();
  renderizar();
  avisar("Tarefa adicionada: " + texto);
}

function alternarFeita(id) {
  var t = tarefas.find(function (item) { return item.id === id; });
  if (!t) return;

  // função interna que faz a troca de verdade
  function trocar() {
    t.feita = !t.feita;
    salvar();
    renderizar();
    tituloLista.focus();   // o botão some do lugar ao re-renderizar, então devolvemos o foco
    avisar(t.feita ? "Tarefa concluída." : "Tarefa reaberta.");
  }

  // só pede confirmação ao CONCLUIR (e se a opção estiver ligada).
  // Reabrir é seguro, não precisa perguntar.
  if (!t.feita && config.confirmar) {
    confirmar("Concluir tarefa?", "Você já terminou “" + t.texto + "”?", "Sim, concluir", trocar);
  } else {
    trocar();
  }
}

function excluir(id) {
  var t = tarefas.find(function (item) { return item.id === id; });
  if (!t) return;

  // excluir SEMPRE pergunta, porque não tem como desfazer
  confirmar("Excluir tarefa?", "“" + t.texto + "” será apagada de vez.", "Sim, excluir", function () {
    tarefas = tarefas.filter(function (item) { return item.id !== id; });
    salvar();
    renderizar();
    tituloLista.focus();
    avisar("Tarefa excluída.");
  });
}

function limparConcluidas() {
  var qtd = tarefas.filter(function (t) { return t.feita; }).length;
  if (qtd === 0) {
    avisar("Não tem nenhuma tarefa concluída pra limpar.");
    return;
  }
  confirmar("Limpar concluídas?", qtd + " tarefa(s) concluída(s) serão apagadas.", "Sim, limpar", function () {
    tarefas = tarefas.filter(function (t) { return !t.feita; });
    salvar();
    renderizar();
    tituloLista.focus();
    avisar("Tarefas concluídas apagadas.");
  });
}

// ==============================================================
// DESENHAR A LISTA NA TELA
// Usamos textContent (e não innerHTML) de propósito: assim ninguém
// consegue injetar HTML ou script dentro de uma tarefa.
// ==============================================================
function criarBotao(rotulo, ariaLabel, classe, aoClicar) {
  var b = document.createElement("button");
  b.type = "button";
  b.textContent = rotulo;
  b.setAttribute("aria-label", ariaLabel);   // leitor de tela fala qual tarefa é
  if (classe) b.className = classe;
  b.addEventListener("click", aoClicar);
  return b;
}

function renderizar() {
  var total = tarefas.length;
  var feitas = tarefas.filter(function (t) { return t.feita; }).length;

  // 1) escolhe quais tarefas aparecem
  var visiveis = tarefas.filter(function (t) {
    if (filtro === "pendentes") return !t.feita;
    if (filtro === "feitas") return t.feita;
    return true;
  });

  // modo foco: só a primeira pendente, pra não distrair
  if (config.foco) {
    visiveis = tarefas.filter(function (t) { return !t.feita; }).slice(0, 1);
  }

  // 2) contador e barra de progresso
  document.getElementById("contagem").textContent = feitas + " de " + total + " concluídas";
  document.getElementById("barra").value = total === 0 ? 0 : Math.round((feitas / total) * 100);

  // 3) monta cada item
  lista.innerHTML = "";
  visiveis.forEach(function (t) {
    var li = document.createElement("li");
    li.className = "tarefa" + (t.feita ? " feita" : "");

    var bloco = document.createElement("div");
    var p = document.createElement("p");
    p.className = "texto";
    p.textContent = t.texto;
    bloco.appendChild(p);

    // "Concluída" em texto também, não só riscado/colorido (ajuda quem tem daltonismo)
    if (t.feita) {
      var selo = document.createElement("span");
      selo.className = "selo";
      selo.textContent = "✔ Concluída";
      bloco.appendChild(selo);
    }

    var acoes = document.createElement("div");
    acoes.className = "acoes";
    acoes.appendChild(criarBotao(
      t.feita ? "Reabrir" : "Concluir",
      (t.feita ? "Reabrir tarefa: " : "Concluir tarefa: ") + t.texto,
      t.feita ? "" : "primario",
      function () { alternarFeita(t.id); }
    ));
    acoes.appendChild(criarBotao("Ouvir", "Ouvir tarefa: " + t.texto, "", function () { falar(t.texto); }));
    acoes.appendChild(criarBotao("Excluir", "Excluir tarefa: " + t.texto, "perigo", function () { excluir(t.id); }));

    li.appendChild(bloco);
    li.appendChild(acoes);
    lista.appendChild(li);
  });

  // 4) mensagem quando a lista está vazia (convida a agir, não só avisa)
  var vazio = document.getElementById("vazio");
  if (visiveis.length === 0) {
    if (total === 0) {
      vazio.textContent = "Nenhuma tarefa ainda. Escreva a primeira lá em cima.";
    } else if (config.foco) {
      vazio.textContent = "Tudo feito por aqui. Bom trabalho!";
    } else {
      vazio.textContent = "Nenhuma tarefa neste filtro. Tente outro.";
    }
    vazio.hidden = false;
  } else {
    vazio.hidden = true;
  }

  // 5) deixa o filtro com cara de "selecionado" (aria-pressed)
  document.querySelectorAll("[data-filtro]").forEach(function (b) {
    b.setAttribute("aria-pressed", String(b.getAttribute("data-filtro") === filtro));
  });
}

// ==============================================================
// APLICAR AS CONFIGURAÇÕES DE ACESSIBILIDADE
// ==============================================================
function aplicarConfig() {
  // tamanho do texto: muda a fonte base do html e tudo em rem acompanha
  raiz.style.fontSize = config.tamanho + "%";
  document.getElementById("tamanho").textContent = "Texto: " + config.tamanho + "%";

  // liga/desliga as classes que o CSS usa
  raiz.classList.toggle("dislexia", config.dislexia);
  raiz.classList.toggle("contraste", config.contraste);
  raiz.classList.toggle("foco", config.foco);

  // atualiza o estado de cada botão de opção
  document.querySelectorAll("[data-opcao]").forEach(function (b) {
    var ligado = config[b.getAttribute("data-opcao")];
    b.setAttribute("aria-pressed", String(ligado));
    b.querySelector(".estado").textContent = ligado ? "Ligado" : "Desligado";
  });

  salvar();
}

// ==============================================================
// EVENTOS
// ==============================================================
form.addEventListener("submit", adicionar);
document.getElementById("limpar").addEventListener("click", limparConcluidas);

// aumentar e diminuir texto (de 70% até 200%, de 10 em 10)
function mudarTamanho(passo) {
  var novo = config.tamanho + passo;
  if (novo > TAM_MAX || novo < TAM_MIN) {
    avisar(novo > TAM_MAX ? "O texto já está no tamanho máximo." : "O texto já está no tamanho mínimo.");
    return;
  }
  config.tamanho = novo;
  aplicarConfig();
}
document.getElementById("mais").addEventListener("click", function () { mudarTamanho(10); });
document.getElementById("menos").addEventListener("click", function () { mudarTamanho(-10); });

// um listener só serve pra todos os botões de opção (por isso o data-opcao)
document.querySelectorAll("[data-opcao]").forEach(function (b) {
  b.addEventListener("click", function () {
    var nome = b.getAttribute("data-opcao");
    config[nome] = !config[nome];
    aplicarConfig();
    renderizar();   // o modo foco muda o que aparece na lista
  });
});

// filtros
document.querySelectorAll("[data-filtro]").forEach(function (b) {
  b.addEventListener("click", function () {
    filtro = b.getAttribute("data-filtro");
    renderizar();
  });
});

// ==============================================================
// COMEÇO: carrega o que estava salvo e desenha a tela
// ==============================================================
tarefas = lerStorage(CHAVE_TAREFAS, []);
var salva = lerStorage(CHAVE_CONFIG, {});
// mistura o padrão com o que estava salvo (assim opção nova nunca quebra)
for (var chave in config) {
  if (salva[chave] !== undefined) config[chave] = salva[chave];
}

// ==============================================================
// NOME DO USUÁRIO E SAUDAÇÃO
// {nome} é trocado pelo nome de verdade na hora de escrever
// ==============================================================
var FRASES = [
  "Olá, {nome}! O que vamos fazer hoje?",       // índice 0: só na primeira vez
  "Vamos lá, {nome}, uma coisa de cada vez…",
  "{nome}, você tem Brio!",                      // piada com o Clóvis de Barros, dupla
  "Bora, {nome}? Um passo pequeno já conta.",
  "{nome}, respira fundo e escolhe a próxima.",
  "Que bom te ver de novo, {nome}!"
];

var usuario = lerStorage(CHAVE_USUARIO, { nome: "", ultima: -1 });
var fraseAtual = 0;

function salvarUsuario() {
  try {
    localStorage.setItem(CHAVE_USUARIO, JSON.stringify(usuario));
  } catch (erro) {
    // sem storage o app segue, só pede o nome de novo na próxima
  }
}

// prompt() é o "alert com campo de texto" do navegador. Cancelou? volta vazio.
function pedirNome(mensagem, sugestao) {
  var resposta = window.prompt(mensagem, sugestao || "");
  if (resposta === null) return "";
  return resposta.trim().slice(0, 30);   // limite de 30 letras pra não quebrar o layout
}

// monta a frase com createElement/textContent (nada de innerHTML, o nome vem do usuário)
function escreverSaudacao() {
  var el = document.getElementById("saudacao");
  var nome = usuario.nome || "amigo(a)";   // plano B se a pessoa cancelou o prompt
  var partes = FRASES[fraseAtual].split("{nome}");

  el.textContent = "";
  for (var i = 0; i < partes.length; i++) {
    el.appendChild(document.createTextNode(partes[i]));
    if (i < partes.length - 1) {
      var negrito = document.createElement("strong");
      negrito.textContent = nome;
      el.appendChild(negrito);
    }
  }
}

function iniciarSaudacao() {
  if (!usuario.nome) {
    // primeira vez (ou cancelou antes): pergunta o nome e usa a frase 0
    usuario.nome = pedirNome("Olá! Qual é o seu nome?", "");
    fraseAtual = 0;
  } else {
    // sorteia uma frase (menos a 0), mas nunca repete a da última visita
    do {
      fraseAtual = 1 + Math.floor(Math.random() * (FRASES.length - 1));
    } while (fraseAtual === usuario.ultima);
  }
  usuario.ultima = fraseAtual;
  salvarUsuario();
  escreverSaudacao();
}

// botão nas configurações adicionais para corrigir o nome
document.getElementById("trocar-nome").addEventListener("click", function () {
  var novo = pedirNome("Como você quer ser chamado(a)?", usuario.nome);
  if (novo !== "") {
    usuario.nome = novo;
    salvarUsuario();
    escreverSaudacao();
    avisar("Nome alterado para " + novo + ".");
  }
});

aplicarConfig();
renderizar();

// o setTimeout deixa a página aparecer ANTES do prompt, senão ele abre em cima de uma tela em branco
setTimeout(iniciarSaudacao, 300);
