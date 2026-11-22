with open('D:\\IAGO PROG\\Projetos\\Estudio_novo\\rigby-studio-2d\\index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# The file uses 10 spaces for indentation at this level
old = '''</div>
          \n          <!-- Painel do Editor de Peças -->\n          <div id="edit-parts-panel" class="edit-parts-panel hidden">\n            <div class="edit-parts-header">\n              <h3>Peças Recortadas</h3>\n              <span id="edit-parts-total" class="badge">0</span>\n            </div>\n            <ul id="parts-list" class="parts-list"></ul>\n          </div>\n          \n          <!-- Painel de propriedades da peça selecionada -->'''

new = '''</div>
          \n          <!-- Barra fixa do Calibrar Armadura (sempre visível no modo Calibrar Armadura) -->\n          <div id="calibration-toolbar" class="calibration-toolbar hidden">\n            <div class="toolbar-group">\n              <div class="calibration-tool-selector">\n                <button id="calib-tool-joints" class="btn btn-secondary active" title="Ajustar Articulações" data-tool="joints">\n                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n                    <circle cx="12" cy="12" r="3"></circle>\n                    <path d="M12 2v4M12 18v4M2 12h4M18 12h4"></path>\n                  </svg>\n                  <span>Articulações</span>\n                </button>\n                <button id="calib-tool-regions" class="btn btn-secondary" title="Ajustar Regiões" data-tool="regions">\n                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n                    <path d="M3 3h18v18H3z"></path>\n                    <path d="M7 7l10 10M17 7l-10 10"></path>\n                  </svg>\n                  <span>Regiões</span>\n                </button>\n              </div>\n              <button id="btn-exit-calibration" class="btn btn-secondary" title="Sair Calibrar Armadura (Esc)">\n                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n                  <line x1="18" y1="6" x2="6" y2="18"></line>\n                  <line x1="6" y1="6" x2="18" y2="18"></line>\n                </svg>\n                <span>Sair</span>\n              </button>\n            </div>\n            \n            <div class="toolbar-info">\n              <span id="calibration-status">Selecione uma articulação ou região</span>\n            </div>\n          </div>\n          \n          <!-- Painel do Calibrar Armadura -->\n          <div id="calibration-panel" class="calibration-panel hidden">\n            <!-- Conteúdo dinâmico baseado na ferramenta ativa -->\n          </div>\n          \n          <!-- Painel do Editor de Peças -->\n          <div id="edit-parts-panel" class="edit-parts-panel hidden">\n            <div class="edit-parts-header">\n              <h3>Peças Recortadas</h3>\n              <span id="edit-parts-total" class="badge">0</span>\n            </div>\n            <ul id="parts-list" class="parts-list"></ul>\n          </div>\n          \n          <!-- Painel de propriedades da peça selecionada -->'''

if old in content:
    content = content.replace(old, new)
    with open('D:\\IAGO PROG\\Projetos\\Estudio_novo\\rigby-studio-2d\\index.html', 'w', encoding='utf-8') as f:
        f.write(content)
    print('SUCCESS: File updated')
else:
    print('FAILED: Old string not found')
    # Show the exact content around the match
    import re
    match = re.search(r'</div>\s*<!-- Painel do Editor de Peças -->', content)
    if match:
        start = max(0, match.start() - 50)
        end = min(len(content), match.end() + 500)
        print(f'Context: {repr(content[start:end])}')