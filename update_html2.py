import re

with open('D:\\IAGO PROG\\Projetos\\Estudio_novo\\rigby-studio-2d\\index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the section to replace using regex
pattern = r'<!-- Barra fixa do Calibrar Armadura \(sempre visível no modo Calibrar Armadura\) -->.*?<!-- Painel do Calibrar Armadura -->'

new = '''<!-- Barra fixa do Calibrar Armadura (sempre visível no modo Calibrar Armadura) -->
          <div id="calibration-toolbar" class="calibration-toolbar hidden">
            <div class="calibration-tool-grid">
              <button id="calib-tool-joints" class="btn btn-secondary active" title="Ajustar Articulações" data-tool="joints">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M12 2v4M12 18v4M2 12h4M18 12h4"></path>
                </svg>
                <span>Articulações</span>
              </button>
              <button id="calib-tool-regions" class="btn btn-secondary" title="Ajustar Regiões" data-tool="regions">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 3h18v18H3z"></path>
                  <path d="M7 7l10 10M17 7l-10 10"></path>
                </svg>
                <span>Regiões</span>
              </button>
              <button id="calib-tool-coverage" class="btn btn-secondary" title="Visualizar Cobertura Anatómica" data-tool="coverage">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="2" y="2" width="20" height="20" rx="2"></rect>
                  <path d="M8 8h8v8H8z"></path>
                  <path d="M12 8v8"></path>
                  <path d="M8 12h8"></path>
                </svg>
                <span>Cobertura</span>
              </button>
              <button id="calib-tool-recognize" class="btn btn-primary" title="Reconhecer Corpo Automaticamente (IA)" data-tool="recognize">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                  <path d="M12 16v-4"></path>
                  <path d="M12 8h.01"></path>
                </svg>
                <span>Reconhecer IA</span>
              </button>
            </div>
            
            <div class="toolbar-group">
              <button id="btn-exit-calibration" class="btn btn-secondary" title="Sair Calibrar Armadura (Esc)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
                <span>Sair</span>
              </button>
            </div>
            
            <div class="toolbar-info">
              <span id="calibration-status">Selecione uma articulação ou região</span>
            </div>
          </div>
          
          
           <!-- Painel de Cobertura -->
           <div id="coverage-panel" class="coverage-panel hidden">
             <div class="panel-section">
               <div class="panel-header">
                 <h4>Cobertura Anatómica</h4>
                 <span id="coverage-badge" class="badge" style="background: #666;">--%</span>
               </div>
               <div class="stat-row">
                 <div class="stat-item">
                   <span class="stat-label">Cobertura</span>
                   <span id="stat-covered" class="stat-value covered">--%</span>
                 </div>
                 <div class="stat-item">
                   <span class="stat-label">Píxeis Cobertos</span>
                   <span id="stat-covered-px" class="stat-value covered">--</span>
                 </div>
                 <div class="stat-item">
                   <span class="stat-label">Não Cobertos</span>
                   <span id="stat-uncovered" class="stat-value uncovered">--</span>
                 </div>
                 <div class="stat-item">
                   <span class="stat-label">Sobrepostos</span>
                   <span id="stat-overlapping" class="stat-value overlapping">--</span>
                 </div>
                 <div class="stat-item">
                   <span class="stat-label">Fora da Silhueta</span>
                   <span id="stat-outside" class="stat-value outside">--</span>
                 </div>
                 <div class="stat-item">
                   <span class="stat-label">Total Silhueta</span>
                   <span id="stat-total" class="stat-value">--</span>
                 </div>
               </div>
               <div class="control-row">
                 <label for="coverage-alpha-threshold">Limiar Alfa:</label>
                 <input type="range" id="coverage-alpha-threshold" min="0" max="255" value="128" style="flex: 1; max-width: 200px;">
                 <span id="coverage-alpha-value" style="font-size: 11px; color: #888; min-width: 35px;">128</span>
               </div>
               <div class="checkbox-group">
                 <label><input type="checkbox" id="coverage-show-uncovered" checked> Não coberto</label>
                 <label><input type="checkbox" id="coverage-show-overlapping" checked> Sobreposição</label>
                 <label><input type="checkbox" id="coverage-show-outside" checked> Fora da silhueta</label>
                 <label><input type="checkbox" id="coverage-show-regions" checked> Regiões</label>
               </div>
             </div>
           </div>
          </div>
          
          
           <!-- Painel de Reconhecimento Anatómico -->
           <div id="recognition-panel" class="recognition-panel hidden">
             <div class="panel-section">
               <div class="panel-header">
                 <h4>Reconhecimento Anatómico Automático</h4>
                 <span id="recognition-status-badge" class="badge" style="background: #666;">Pronto</span>
               </div>
               
               <div id="recognition-progress" class="hidden">
                 <div class="progress-container">
                   <div class="progress-bar-wrapper">
                     <div class="progress-bar">
                       <div id="recognition-progress-bar" class="fill" style="width: 0%;"></div>
                     </div>
                     <span id="recognition-progress-text" class="progress-text">0%</span>
                   </div>
                   <div id="recognition-progress-message" class="progress-message">A preparar...</div>
                   <button id="btn-cancel-recognition" class="btn btn-secondary btn-sm">Cancelar</button>
                 </div>
               </div>
               
               <div id="recognition-results" class="hidden">
                 <div id="recognition-quality-summary" class="results-summary"></div>
                 <div class="action-buttons">
                   <button id="btn-apply-recognition" class="btn btn-primary">
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                       <polyline points="20 6 9 17 4 12"></polyline>
                     </svg>
                     Aplicar Reconhecimento
                   </button>
                   <button id="btn-cancel-recognition-result" class="btn btn-secondary">
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                       <line x1="18" y1="6" x2="6" y2="18"></line>
                       <line x1="6" y1="6" x2="18" y2="18"></line>
                     </svg>
                     Cancelar
                   </button>
                 </div>
                 <div class="hint-text">
                   As regiões atuais serão preservadas para permitir reverter. Clique em "Aplicar Reconhecimento" para substituir.
                 </div>
               </div>
               
               <div id="recognition-error" class="error-message hidden"></div>
             </div>
           </div>
           
           <!-- Painel do Calibrar Armadura -->
           <div id="calibration-panel" class="calibration-panel hidden">
             <!-- Conteúdo dinâmico baseado na ferramenta ativa -->
           </div>'''

# Use regex to replace
new_content = re.sub(pattern, new, content, flags=re.DOTALL)

if new_content != content:
    with open('D:\\IAGO PROG\\Projetos\\Estudio_novo\\rigby-studio-2d\\index.html', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('SUCCESS: File updated')
else:
    print('FAILED: Pattern not matched')
    # Debug
    match = re.search(pattern, content, re.DOTALL)
    if match:
        print(f'Pattern matched, length: {len(match.group())}')
    else:
        print('Pattern not found')