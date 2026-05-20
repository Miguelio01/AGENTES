const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

// Intentar cargar env de forma manual
const envPath = path.join(__dirname, '../../../apps/gateway/.env');
let uri = 'mongodb://localhost:27017/frescoh';

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/MONGODB_URI=(.*)/);
  if (match) uri = match[1].trim().replace(/['"]/g, '');
}

async function inspectMetrics() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db();
    const collection = db.collection('ai_metrics');

    console.log('\n📊 AUDITORÍA DE ÚLTIMAS TRANSACCIONES IA (Ciclo Completo):\n');
    
    const metrics = await collection
      .find({})
      .sort({ timestamp: -1 })
      .limit(10)
      .toArray();

    metrics.reverse().forEach((m, i) => {
      const date = new Date(m.timestamp).toLocaleTimeString();
      const s = m.systemTokens || 0;
      const h = m.historyTokens || 0;
      const r = m.ragTokens || 0;
      
      console.log(`[${i+1}] ${date} | Prompt: ${m.promptTokens} | S/H/R: ${s}/${h}/${r} | Lat: ${m.latencyMs}ms`);
      console.log(`    Snippet: "${(m.promptSnippet || '').substring(0, 70).replace(/\n/g, ' ')}..."`);
      console.log('    ' + '-'.repeat(60));
    });

    const totalPrompt = metrics.reduce((acc, m) => acc + (m.promptTokens || 0), 0);
    console.log(`\n📈 MÉTRICAS DEL CIERRE:`);
    console.log(`   Tokens Promedio: ${Math.round(totalPrompt / metrics.length)}`);
    console.log(`   Estado: ${metrics.every(m => m.status === 'SUCCESS') ? '✅ TODO EXITOSO' : '⚠️ ALGUNOS ERRORES'}`);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.close();
  }
}

inspectMetrics();
