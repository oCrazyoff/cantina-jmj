// Camada de dados
// - Catálogo inicial: dados/produtos.js (array PRODUTOS, versionado no repositório)
// - Vendas e edições feitas no navegador: localStorage
const DB = {
  _get(key, def) {
    try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; }
  },
  _set(key, val) { localStorage.setItem(key, JSON.stringify(val)); },

  // Carrega o catálogo do arquivo se for a primeira vez ou se a versão do arquivo mudou
  _sincronizarCatalogo() {
    const versaoLocal = this._get('cjmj_produtos_versao', null);
    if (versaoLocal !== PRODUTOS_VERSAO || !localStorage.getItem('cjmj_produtos')) {
      this._set('cjmj_produtos', PRODUTOS);
      this._set('cjmj_produtos_versao', PRODUTOS_VERSAO);
    }
  },

  // Produtos
  produtos() { return this._get('cjmj_produtos', []); },
  salvarProduto(p) {
    const lista = this.produtos();
    if (p.id) {
      const i = lista.findIndex(x => x.id === p.id);
      if (i >= 0) lista[i] = { ...lista[i], ...p };
    } else {
      p.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      lista.push(p);
    }
    this._set('cjmj_produtos', lista);
    return p;
  },
  excluirProduto(id) {
    this._set('cjmj_produtos', this.produtos().filter(p => p.id !== id));
  },

  // Vendas
  vendas() { return this._get('cjmj_vendas', []); },
  registrarVenda(itens, pagamento) {
    const total = itens.reduce((s, i) => s + i.preco * i.qtd, 0);
    const venda = {
      id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
      data: new Date().toISOString(),
      itens, pagamento, total
    };
    const lista = this.vendas();
    lista.push(venda);
    this._set('cjmj_vendas', lista);
    return venda;
  },

  // Gera o conteúdo do dados/produtos.js com o catálogo atual (versão +1)
  gerarProdutosJs() {
    const versao = PRODUTOS_VERSAO + 1;
    const linhas = this.produtos().map(p => '  ' + JSON.stringify({ id: p.id, nome: p.nome, preco: p.preco, ativo: p.ativo !== false }));
    return `// Catálogo de produtos da cantina-jmj.
// Para atualizar: no Admin > Produtos, clique em "Baixar produtos.js"
// e substitua este arquivo no repositório.
// Sempre que este arquivo mudar, aumente a VERSAO para os navegadores recarregarem o catálogo.
const PRODUTOS_VERSAO = ${versao};
const PRODUTOS = [
${linhas.join(',\n')}
];
`;
  },

  // Arquivo de vendas deste aparelho (para enviar ao admin no fim do dia)
  exportarVendas() {
    return JSON.stringify({ tipo: 'cantina-jmj-vendas', vendas: this.vendas(), exportadoEm: new Date().toISOString() }, null, 2);
  },
  // Soma vendas de outro aparelho às deste, sem duplicar (compara pelo id da venda)
  mesclarVendas(texto) {
    const dados = JSON.parse(texto);
    const novas = Array.isArray(dados) ? dados : dados.vendas;
    if (!Array.isArray(novas)) throw new Error('Arquivo inválido');
    const lista = this.vendas();
    const ids = new Set(lista.map(v => v.id));
    let adicionadas = 0;
    novas.forEach(v => {
      if (v && v.id && !ids.has(v.id)) { lista.push(v); ids.add(v.id); adicionadas++; }
    });
    lista.sort((a, b) => a.data.localeCompare(b.data));
    this._set('cjmj_vendas', lista);
    return adicionadas;
  },
  limparVendas() { this._set('cjmj_vendas', []); },

  // Backup completo (produtos + vendas)
  exportarBackup() {
    return JSON.stringify({ produtos: this.produtos(), vendas: this.vendas(), exportadoEm: new Date().toISOString() }, null, 2);
  },
  importarBackup(texto) {
    const dados = JSON.parse(texto);
    if (!Array.isArray(dados.produtos) || !Array.isArray(dados.vendas)) throw new Error('Arquivo inválido');
    this._set('cjmj_produtos', dados.produtos);
    this._set('cjmj_vendas', dados.vendas);
  }
};

DB._sincronizarCatalogo();

// Utilitários
const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataHora = iso => new Date(iso).toLocaleString('pt-BR');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PAGAMENTOS = {
  pix: { label: 'PIX', icone: 'pix', badge: 'bg-teal-50 text-teal-700', barra: 'bg-teal-500' },
  dinheiro: { label: 'Dinheiro', icone: 'cash', badge: 'bg-green-50 text-green-700', barra: 'bg-green-600' },
};
const pagLabel = p => PAGAMENTOS[p]?.label ?? p;
const pagBadge = p => {
  const c = PAGAMENTOS[p];
  if (!c) return `<span class="px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">${esc(p)}</span>`;
  return `<span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${c.badge}">${icon(c.icone, 'w-3.5 h-3.5')}${c.label}</span>`;
};
// Compartilha um arquivo (WhatsApp etc. no celular) ou baixa, se o navegador não suportar
async function compartilharOuBaixar(nome, conteudo, tipo) {
  try {
    const arquivo = new File([conteudo], nome, { type: tipo });
    if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
      await navigator.share({ files: [arquivo], title: nome });
      return;
    }
  } catch (e) {
    if (e.name === 'AbortError') return;
  }
  baixarArquivo(nome, conteudo, tipo);
}
function baixarArquivo(nome, conteudo, tipo) {
  const blob = new Blob([conteudo], { type: tipo });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  URL.revokeObjectURL(a.href);
}
