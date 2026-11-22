with open('D:\\IAGO PROG\\Projetos\\Estudio_novo\\rigby-studio-2d\\index.html', 'r', encoding='utf-8') as f:
    content = f.read()

old = '''<!-- Painel do Calibrar Armadura -->
           <div id="calibration-panel" class="calibration-panel hidden">
             <!-- Conteúdo dinâmico baseado na ferramenta ativa -->
           </div>
          <div id="calibration-panel" class="calibration-panel hidden">
            <!-- Conteúdo dinâmico baseado na ferramenta ativa -->
          </div>
          \n          <!-- Painel do Editor de Pe'''

new = '''<!-- Painel do Calibrar Armadura -->
           <div id="calibration-panel" class="calibration-panel hidden">
             <!-- Conteúdo dinâmico baseado na ferramenta ativa -->
           </div>
           
           <!-- Painel do Editor de Pe'''

if old in content:
    content = content.replace(old, new)
    with open('D:\\IAGO PROG\\Projetos\\Estudio_novo\\rigby-studio-2d\\index.html', 'w', encoding='utf-8') as f:
        f.write(content)
    print('SUCCESS: File updated')
else:
    print('FAILED: Old string not found')