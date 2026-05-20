import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../apps/gateway/.env') });

async function inspectMetrics() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/frescoh';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db();
    const collection = db.collection('ai_metrics');

    console.log('\n📊 AUDITORÍA DE ÚLTIMAS 15 TRANSACCIONES IA:\n');
    
    const metrics = await collection
      .find({})
      .sort({ timestamp: -1 })
      .limit(15)
      .toArray();

    metrics.reverse().forEach((m, i) => {
      const date = new Date(m.timestamp).toLocaleTimeString();
      console.log(`[${i+1}] ${date} | Mod: ${m.model}`);
      console.log(`    Prompt: ${m.promptTokens} | Comp: ${m.completionTokens} | Total: ${m.totalTokens}`);
      console.log(`    Desglose (S/H/R): ${m.systemTokens || 0} / ${m.historyTokens || 0} / ${m.ragTokens || 0}`);
      console.log(`    Snippet: "${m.promptSnippet?.substring(0, 60)}..."`);
      console.log(`    Latencia: ${m.latencyMs}ms | Status: ${m.status}`);
      console.log('    ' + '-'.repeat(50));
    });

    const totalPrompt = metrics.reduce((acc, m) => acc + (m.promptTokens || 0), 0);
    console.log(`\n📈 RESUMEN DEL CICLO:`);
    console.log(`   Total Tokens Prompt: ${totalPrompt}`);
    console.log(`   Promedio por llamada: ${Math.round(totalPrompt / metrics.length)} tokens`);

  } finally {
    await client.close();
  }
}

inspectMetrics().catch(console.error);
