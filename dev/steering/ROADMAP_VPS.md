# 🗺️ Roadmap de Despliegue: AGENTES en VPS

Este documento detalla los pasos necesarios para llevar el orquestador de agentes a producción en un VPS, utilizando **Ollama** para inferencia local y **Obsidian** como base de conocimiento semántica.

## 1. Preparación del Entorno (VPS)
- [x] **Llave SSH:** Registrada (`ssh-ed25519 ... JabT`).
- [x] **IP del Servidor:** `2.25.158.226` (Ubuntu 22.04+ con al menos 8GB de RAM para Ollama).
- [x] **Instalar Ollama:** Completado (llama3 cargado).
- [x] **Instalar PNPM:** Completado.
- [x] **Node.js:** Versión 20 instalado.

## 2. Configuración de Obsidian (El Cerebro)
- [x] **Ruta de Bóveda:** Usando `/root/AGENTES/brain` (Temporal hasta migración a Git independiente).
- [ ] Definir la ruta en el entorno: `OBSIDIAN_VAULT_PATH=/root/AGENTES/brain`.

## 3. Configuración del Orquestador (.env)
- [x] Configuración de variables de producción.
- [x] Conexión a MongoDB Atlas validada.
- [x] Ollama configurado como LLM Provider.

## 4. Despliegue y Persistencia de Procesos
- [x] **Instalar dependencias:** Completado (PNPM).
- [x] **Construir el proyecto:** Completado.
- [x] **Gestionar con PM2:** Gateway corriendo como `agentes-gateway`.

## 5. Próximas Mejoras de Arquitectura (Siguiente Sesión)
1. **RAG Semántico Real:** Implementar `Mongoose-Vector` o `Pinecone` para que la búsqueda en Obsidian no sea por palabras clave, sino por significado (embeddings generados por Ollama).
2. **Webhooks de Canales:** Configurar IPs estáticas o Túneles (Cloudflare/Ngrok) para recibir mensajes de WhatsApp/Telegram de forma estable.
3. **Dashboard de Monitoreo:** Una interfaz simple para ver el estado emocional de los clientes activos en tiempo real.

---
*Documento generado por J.A.R.V.I.S. para Miguel.*
