with open('D:\\IAGO PROG\\Projetos\\Estudio_novo\\rigby-studio-2d\\src\\segmentation\\AnatomicalRecognizer.js', 'r', encoding='utf-8') as f:
    content = f.read()

old = '''    } else if (def.type === 'capsule' && def.start && def.end) {
      // Sementes ao longo do capsule
      const steps = 10;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = Math.round(def.start.x + (def.end.x - def.start.x) * t);
        const y = Math.round(def.start.y + (def.end.y - def.start.y) * t);
        seeds.push({ x, y });
      }
    } else if (def.type === 'polygon' && def.points && def.points.length >= 3) {'''

new = '''    } else if (def.type === 'capsule' && def.start && def.end) {
      // Sementes ao longo do capsule
      const steps = 10;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = Math.round(def.start.x + (def.end.x - def.start.x) * t);
        const y = Math.round(def.start.y + (def.end.y - def.start.y) * t);
        seeds.push({ x, y });
      }
      // DIAGNÓSTICO: Verificar personMask
      const personPixels = personMask.reduce((a, b) => a + b, 0);
      console.log('[DIAG] _createRegionMask:', {
        regionType: def.type,
        personMaskPixels: personPixels,
        silW, silH
      });
      
      if (personPixels === 0) {
        console.warn('[DIAG] personMask vazia para região:', def.type);
        return null;
      }
    } else if (def.type === 'polygon' && def.points && def.points.length >= 3) {'''

if old in content:
    content = content.replace(old, new)
    with open('D:\\IAGO PROG\\Projetos\\Estudio_novo\\rigby-studio-2d\\src\\segmentation\\AnatomicalRecognizer.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print('SUCCESS: File updated')
else:
    print('FAILED: Old string not found')
    import re
    match = re.search(r'Sementes ao longo do capsule', content)
    if match:
        start = max(0, match.start() - 100)
        end = min(len(content), match.end() + 500)
        print(f'Context: {repr(content[start:end])}')