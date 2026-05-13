# AGENTES 🚀 - Intelligent Agent Orchestrator

Sistema de orquestación de agentes de IA con arquitectura hexagonal, diseñado para automatizar ventas, atención al cliente y gestión de productos digitales a través de múltiples canales.

## 🏗️ Arquitectura del Sistema: Agencia de Agentes (A2A)

El proyecto evoluciona hacia una **Agencia de Agentes**, donde las responsabilidades están segregadas para maximizar la escalabilidad y la claridad:

### 1. El Director: Orquestador (`OrchestratorService`)
- **Misión:** Punto de entrada único. Gestiona la conexión con canales (WhatsApp/Telegram), identifica al cliente y mantiene el estado de la sesión.
- **Acción:** No toma decisiones inteligentes ni redacta respuestas; coordina el flujo entre los agentes especializados.

### 2. El Cerebro: Agente de Conocimiento e Intención (`KnowledgeAgent`)
- **Misión:** Analizar el mensaje del usuario y el historial para determinar la **intención** (Venta, Soporte, Saludo).
- **Acción:** Consulta la base de conocimientos (Obsidian) y decide a qué agente "obrero" debe delegar la tarea.

### 3. Los Obreros: Agentes Especializados
- **SalesAgent (Ventas):** Dueño del "Reglamento de Ventas". Gestiona el carrito, gramajes y facturación.
- **InventoryAgent (Inventario):** Consulta stock real en Google Sheets y aplica reglas de empaque.
- **FinanceAgent (Finanzas):** (En desarrollo) Encargado de validación de transferencias y conciliación.
- **EscalationAgent (Soporte):** Gestiona el paso a humanos vía Telegram cuando la IA no puede resolver.

### 4. La Voz: Agente de Síntesis / Fresquitoh (`VoiceAgent`)
- **Misión:** Personalidad y Empatía. Recibe los "datos crudos" de los otros agentes y los traduce a la voz de la marca.
- **Acción:** Asegura que Fresquitoh siempre hable como un campesino afable, sin importar qué agente generó la información técnica.

---

## 🏗️ Capas Técnicas (Hexagonal)

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
- **Misión:** Implementa la lógica de la Agencia A2A y expone la API.


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
