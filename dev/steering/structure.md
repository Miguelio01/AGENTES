# Project Structure & Architecture

## Architecture
The project follows a **Hexagonal Architecture (Ports & Adapters)** to ensure scalability and decoupling from external providers (WhatsApp, Google Sheets, etc.).

## Monorepo Map
- `apps/gateway/`: The NestJS entry point. Orchestrates the A2A flow.
- `packages/domain/`: Pure domain logic, entities (Agent, Client, Order), and Port definitions.
- `packages/infrastructure/`: Concrete adapters for Google Sheets, Obsidian, Ollama, Gemini, WhatsApp, and Telegram.
- `brain/`: The Obsidian Vault containing brand strategy, product science, and packaging rules.

## Data Flow (A2A Protocol)
1. **Ingress:** Message -> Channel Adapter -> Orchestrator.
2. **Context:** Orchestrator -> Session/Client Repository (Hydrate state).
3. **Intent:** Orchestrator -> Knowledge Agent (Classify intent using LLM + RAG).
4. **Logic Execution:** Orchestrator -> Specialized Agent (Inventory/Sales/Finance).
5. **Synthesis:** Orchestrator -> Voice Agent (Fulfillment).
6. **Egress:** Reply -> Channel Adapter.
