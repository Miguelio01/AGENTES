import { MongoClient } from 'mongodb';

async function cleanup() {
  const uri = 'mongodb+srv://frescohcol_db_user:fxCw6vwVIEjkyOeY@cluster0.t254esy.mongodb.net/agentes?retryWrites=true&w=majority&appName=Cluster0';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db('agentes');
    
    console.log('🧹 Iniciando limpieza de la base de datos...');
    
    const collections = ['clients', 'sessions', 'messages', 'orders'];
    
    for (const colName of collections) {
      const deleted = await db.collection(colName).deleteMany({});
      console.log(`✅ Eliminados ${deleted.deletedCount} documentos de la colección: ${colName}`);
    }
    
    console.log('✨ Base de datos limpia y lista para empezar de 0.');
  } catch (error) {
    console.error('❌ Error durante la limpieza:', error);
  } finally {
    await client.close();
  }
}

cleanup();
