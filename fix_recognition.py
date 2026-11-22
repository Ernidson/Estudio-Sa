import re

with open('D:\\IAGO PROG\\Projetos\\Estudio_novo\\rigby-studio-2d\\index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the exact section to replace
pattern = r'(<!-- Painel de Reconhecimento Anatómico -->.*?<div id="recognition-panel" class="recognition-panel hidden">.*?</div>\s*</div>)'

new = '''            <!-- Painel de Reconhecimento Anatómico -->
           <div id="recognition-panel" class="recognition-panel hidden">
             <div class="panel-section">
               <div class="panel-header">
                 <h4>Reconhecimento Anatómico Automático</h4>
                 <span id="recognition-status-badge" class="badge" style="background: #666;">Pronto</span>
               </div>
               
               <!-- Estado: Pronto - Botão para iniciar -->
               <div id="recognition-ready" class="ready-state">
                 <p class="ready-hint">O modelo analisará a silhueta e a armadura para propor máscaras anatómicas.</p>
                 <button id="btn-start-recognition" class="btn btn-primary" style="width: 100%; margin-top: 8px;">
                   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                     <polygon points="5 3 19 12 5 21 5 3"></polygon>
                   </svg>
                   <span>Iniciar Reconhecimento Automático</span>
                 </button>
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
            </div>'''

new_content = re.sub(pattern, new, content, flags=re.DOTALL)

if new_content != content:
    with open('D:\\IAGO PROG\\Projetos\\Estudio_novo\\rigby-studio-2d\\index.html', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('SUCCESS: File updated')
else:
    print('FAILED: Pattern not matched')
    match = re.search(pattern, content, re.DOTALL)
    if match:
        print(f'Pattern matched, length: {len(match.group())}')
    else:
        print('Pattern not found')