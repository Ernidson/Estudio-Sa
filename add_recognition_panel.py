with open('D:\\IAGO PROG\\Projetos\\Estudio_novo\\rigby-studio-2d\\index.html', 'r', encoding='utf-8') as f:
    content = f.read()

old = '''            </div>
          </div>
          \n          <!-- Painel do Calibrar Armadura -->'''

new = '''            </div>
          </div>
          \n          
           <!-- Painel de Reconhecimento Anatómico (aparece quando botão Reconhecer Corpo ativo) -->
           <div id="recognition-panel" class="recognition-panel hidden">
             <div style="display: flex; flex-direction: column; gap: 12px; padding: 12px;">
               <div style="display: flex; align-items: center; justify-content: space-between;">
                 <h3 style="margin: 0; color: #fff; font-size: 14px;">Reconhecimento Anatómico Automático</h3>
                 <span id="recognition-status-badge" class="badge" style="background: #666;">Pronto</span>
               </div>
               
               <div id="recognition-progress" class="hidden" style="display: flex; flex-direction: column; gap: 8px;">
                 <div style="display: flex; align-items: center; gap: 8px;">
                   <div style="flex: 1; height: 6px; background: #333; border-radius: 3px; overflow: hidden;">
                     <div id="recognition-progress-bar" style="width: 0%; height: 100%; background: #007acc; transition: width 0.3s;"></div>
                   </div>
                   <span id="recognition-progress-text" style="font-size: 11px; color: #888; min-width: 40px;">0%</span>
                 </div>
                 <div id="recognition-progress-message" style="font-size: 12px; color: #aaa;">A preparar...</div>
                 <button id="btn-cancel-recognition" class="btn btn-secondary btn-sm" style="align-self: flex-start;">Cancelar</button>
               </div>
               
               <div id="recognition-results" class="hidden" style="display: flex; flex-direction: column; gap: 8px;">
                 <div id="recognition-quality-summary" style="font-size: 12px; color: #888;"></div>
                 <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                   <button id="btn-apply-recognition" class="btn btn-primary" style="flex: 1; min-width: 140px;">
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                       <polyline points="20 6 9 17 4 12"></polyline>
                     </svg>
                     Aplicar Reconhecimento
                   </button>
                   <button id="btn-cancel-recognition-result" class="btn btn-secondary" style="flex: 1; min-width: 140px;">
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                       <line x1="18" y1="6" x2="6" y2="18"></line>
                       <line x1="6" y1="6" x2="18" y2="18"></line>
                     </svg>
                     Cancelar
                   </button>
                 </div>
                 <div style="font-size: 11px; color: #666;">
                   As regiões atuais serão preservadas para permitir reverter. Clique em "Aplicar Reconhecimento" para substituir.
                 </div>
               </div>
               
               <div id="recognition-error" class="hidden" style="color: #ff6666; font-size: 12px;"></div>
             </div>
           </div>
           
          <!-- Painel do Calibrar Armadura -->'''

if old in content:
    content = content.replace(old, new)
    with open('D:\\IAGO PROG\\Projetos\\Estudio_novo\\rigby-studio-2d\\index.html', 'w', encoding='utf-8') as f:
        f.write(content)
    print('SUCCESS: File updated')
else:
    print('FAILED: Old string not found')
    # Show the exact content around the match
    import re
    match = re.search(r'</div>\s*</div>\s*\n\s*<!-- Painel do Calibrar Armadura -->', content)
    if match:
        start = max(0, match.start() - 100)
        end = min(len(content), match.end() + 100)
        print(f'Context: {repr(content[start:end])}')