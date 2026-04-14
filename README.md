# AGENTES 🚀 - Intelligent Agent Orchestrator

Sistema de orquestación de agentes de IA con arquitectura hexagonal, diseñado para automatizar ventas, atención al cliente y gestión de productos digitales a través de múltiples canales.

## 🏗️ Arquitectura del Sistema

El proyecto utiliza una **Arquitectura Hexagonal (Puertos y Adaptadores)** dividida en un Monorepo:

### 1. Capa de Dominio (`@agentes/domain`)
- **Entidades:** `Agent`, `Client`, `Session`, `Message`, `Order`.
- **Puertos:** Contratos para persistencia, canales, análisis emocional y proveedores de IA.
- **Independiente:** No tiene dependencias de frameworks ni bases de datos.

### 2. Capa de Infraestructura (`@agentes/infrastructure`)
- **Canales:** WhatsApp (vía Baileys), Telegram (vía Telegraf).
- **IA:** Gemini (Google) y Ollama (Local).
- **Persistencia:** MongoDB (vía Mongoose).
- **Herramientas:** Google Sheets (Inventario), Gmail (Escaneo de pagos), Obsidian (RAG).

### 3. Gateway de Orquestación (`apps/gateway`)
- **Framework:** NestJS.
- **Misión:** Coordina el flujo omnicanal, inyecta contexto emocional y gestiona la lógica de negocio.
- **API:** Documentación interactiva con Swagger.

## 🛠️ Stack Tecnológico
- **Lenguaje:** TypeScript / Node.js
- **Framework Backend:** NestJS
- **ORM / DB:** Mongoose / MongoDB Atlas
- **Monorepo:** PNPM Workspaces & Turborepo
- **IA:** Google Generative AI (Gemini) / Ollama (LLama3)

## 🚀 Despliegue en VPS (Hoja de Ruta)

Para correr este sistema en un VPS con **Ollama** y **Obsidian** como cerebro:

1.  **Instalar Ollama:** Ejecutar el servidor de inferencia local.
2.  **Configurar Obsidian:** Clonar tu bóveda en el VPS y apuntar el `VAULT_PATH`.
3.  **Configurar .env:** Activar `USE_OLLAMA=true` y apuntar a la URL local de Ollama.
4.  **PM2 / Docker:** Gestionar los procesos del Gateway y Ollama para que se reinicien automáticamente.

---
*Desarrollado por Miguel con la asistencia de J.A.R.V.I.S.*
