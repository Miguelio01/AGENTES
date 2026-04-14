# 🗺️ Roadmap de Despliegue: AGENTES en VPS

Este documento detalla los pasos necesarios para llevar el orquestador de agentes a producción en un VPS, utilizando **Ollama** para inferencia local y **Obsidian** como base de conocimiento semántica.

## 1. Preparación del Entorno (VPS)
- [ ] **Servidor:** Ubuntu 22.04+ con al menos 8GB de RAM (para Ollama).
- [ ] **Instalar Ollama:** 
  ```bash
  curl -fsSL https://ollama.com/install.sh | sh
  ollama pull llama3
  ```
- [ ] **Instalar PNPM:** 
  ```bash
  curl -fsSL https://get.pnpm.io/install.sh | sh -
  ```
- [ ] **Node.js:** Versión 20 o superior.

## 2. Configuración de Obsidian (El Cerebro)
- [ ] Clonar la bóveda de Obsidian en el VPS:
  ```bash
  git clone <url-de-tu-boveda> /home/user/cerebro-obsidian
  ```
- [ ] Definir la ruta en el entorno: `OBSIDIAN_VAULT_PATH=/home/user/cerebro-obsidian`.

## 3. Configuración del Orquestador (.env)
Configurar el archivo `.env` en `apps/gateway` para usar los recursos locales del VPS:
```env
PORT=3000
NODE_ENV=production
MONGODB_URI=mongodb+srv://... (usar la de Atlas ya configurada)
USE_OLLAMA=true
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3
OBSIDIAN_VAULT_PATH=/home/user/cerebro-obsidian
```

## 4. Despliegue y Persistencia de Procesos
- [ ] **Construir el proyecto:**
  ```bash
  pnpm install
  pnpm -r build
  ```
- [ ] **Gestionar con PM2:**
  ```bash
  npm install -g pm2
  pm2 start apps/gateway/dist/main.js --name agentes-gateway
  ```

## 5. Próximas Mejoras de Arquitectura (Siguiente Sesión)
1. **RAG Semántico Real:** Implementar `Mongoose-Vector` o `Pinecone` para que la búsqueda en Obsidian no sea por palabras clave, sino por significado (embeddings generados por Ollama).
2. **Webhooks de Canales:** Configurar IPs estáticas o Túneles (Cloudflare/Ngrok) para recibir mensajes de WhatsApp/Telegram de forma estable.
3. **Dashboard de Monitoreo:** Una interfaz simple para ver el estado emocional de los clientes activos en tiempo real.

---
*Documento generado por J.A.R.V.I.S. para Miguel.*
