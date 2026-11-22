# AGENTS.md — Instruções para Agentes OpenCode

## Regras Permanentes

### 1. Relatório Obrigatório Após Cada Tarefa
**Depois de cada tarefa que altere código, o OpenCode deve criar um novo relatório na pasta `RELATORIOS/`, com a data e o nome da atualização.**

Também deve atualizar o índice `RELATORIOS/README.md`.

O relatório deve documentar:
- As alterações reais (ficheiros criados/modificados, funções/classes afetadas)
- Os testes efetuados (comandos, resultados)
- Os erros encontrados e soluções aplicadas
- As limitações conhecidas e próximos passos recomendados

**Nunca declarar validação visual sem a realizar.**

**Nunca substituir ou apagar relatórios anteriores sem autorização.**

**Na resposta final de cada tarefa, indicar o caminho do relatório criado.**

---

### 2. Formato dos Relatórios
- Pasta: `RELATORIOS/`
- Nomes: `AAAA-MM-DD_nome_da_atualizacao.md` (sem espaços, sufixo numérico se duplicado)
- Estrutura obrigatória: Identificação, Objetivo, Alterações Realizadas, Erros e Correções, Testes, Estado Final
- Ver `RELATORIOS/2026-11-22_correcao_vite_tensorflow.md` como exemplo

---

### 3. Índice Geral
- Manter `RELATORIOS/README.md` atualizado com tabela: Data, Atualização, Resumo, Estado, Link, Commit
- Ordenar por data (mais recentes primeiro)

---

### 4. Princípios de Documentação
- Um relatório por tarefa/atualização concluída (não por comando executado)
- Não duplicar informação desnecessariamente
- Não incluir logs gigantes nem tokens/chaves privadas
- Não registar tentativas repetitivas sem relevância
- Preservar relatórios anteriores — não apagar nem sobrescrever

---

### 5. Validação Visual
- **Nunca declarar sucesso apenas porque `node --check` e testes unitários passam**
- Testar a inicialização real da aplicação e o botão Importar PNG
- Se o teste de navegador não estiver disponível, informar a limitação
- Não executar `test-workflow.cjs` em ciclos repetitivos

---

### 6. Segurança e Boas Práticas
- Não fazer commit nem push antes da validação manual
- Não abrir múltiplos servidores
- Usar porta fixa 56500 (`strictPort: true` no Vite)
- Não modificar funcionalidades fora do escopo da tarefa
- Preservar compatibilidade com projetos antigos

---

### 7. Estrutura do Projeto (Referência)
```
rigby-studio-2d/
├── src/
│   ├── main.js                 # Entry point, estado global, modos
│   ├── core/                   # Scene, Renderer, Transform2D, ProjectStorage
│   ├── rigging/                # Rig, Bone, RigEditor, RigRenderer, RigEstimator
│   ├── parts/                  # PieceMap, PartManager, PartRenderer, PartCutter, Part
│   ├── editor/                 # Selection, ImageImporter
│   └── segmentation/           # SilhouetteAnalyzer, AnatomicalRecognizer, shims
├── index.html                  # UI completa (toolbars, painéis, canvas)
├── vite.config.js              # Configuração Vite (porta 56500)
├── package.json                # Scripts dev/build/preview/test
├── RELATORIOS/                 # Relatórios de desenvolvimento
│   ├── README.md               # Índice geral
│   └── *.md                    # Relatórios individuais
└── AGENTS.md                   # Este ficheiro
```

---

### 8. Comandos de Referência
```bash
# Desenvolvimento
npm run dev          # Vite dev server (porta 56500)
npm run build        # Build produção (dist/)
npm run preview      # Preview build
npm test             # Testes unitários (30 testes)
node --check <file>  # Verificação sintaxe ES modules

# Git
git status           # Ver alterações locais
git diff             # Ver diffs
```

---

### 9. Controlo do Servidor de Desenvolvimento
**Regra permanente:** O servidor Vite é controlado **exclusivamente pelo utilizador**, numa janela PowerShell independente.

**Não executar:**
- `npm run dev`
- `npx serve`
- `taskkill` ou comandos para encerrar/reiniciar servidores
- Testes que mantenham processos abertos indefinidamente

**Não matar processos** na porta 56500.

O servidor existente deve permanecer em funcionamento durante as alterações ao código. As alterações ao código são aplicadas automaticamente via HMR (Hot Module Replacement) do Vite.

---

**Última atualização:** 2026-11-22  
**Versão:** 1.0