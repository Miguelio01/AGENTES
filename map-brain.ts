import * as fs from 'fs';
import * as path from 'path';

async function mapBrain() {
  const brainPath = './brain';
  console.log('🔍 INICIANDO MAPEO DE CEREBRO - Modo Agente (Fresquitoh)\n');

  function scan(dir: string, indent = '') {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      if (item.startsWith('.') || item === 'img' || item === 'temp_images' || item === 'manual_de_marca') continue;
      
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        console.log(`${indent}📂 [${item.toUpperCase()}]`);
        scan(fullPath, indent + '  ');
      } else if (item.endsWith('.md')) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const title = item.replace('.md', '');
        
        // Extraer metadatos básicos
        const categoria = content.match(/categoria: (.*)/)?.[1] || 'Sin categoría';
        const enlaces = [...content.matchAll(/\[\[(.*?)\]\]/g)].map(m => m[1]);

        console.log(`${indent}📄 ${title} (${categoria})`);
        if (enlaces.length > 0) {
          console.log(`${indent}   🔗 Conecta con: ${enlaces.join(', ')}`);
        }
      }
    }
  }

  scan(brainPath);
  
  console.log('\n🧠 RESUMEN DE CAPACIDADES:');
  console.log('1. Identidad: Sé quién soy (Fresquitoh) y a quién represento (Frescoh!).');
  console.log('2. Estrategia: Entiendo la Misión 2028 y los pilares de confianza (Filtro Sasha).');
  console.log('3. Productos: Tengo data científica de 5 frutas, huevos de pastoreo y tilapia.');
  console.log('4. Tono: Sé que debo ser Directo, Consciente y Protector.');
}

mapBrain();
