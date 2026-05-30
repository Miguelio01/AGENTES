from fastapi import FastAPI, Request
from google.adk.agents import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.tools import ToolContext
from google.adk.models.lite_llm import LiteLlm
from google.genai import types
import uvicorn
import httpx
import os
import logging
import json
import re
import asyncio
from litellm.exceptions import RateLimitError as LiteLlmRateLimitError
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- CONFIGURACIÓN DE MODELO ---
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY")
if not NVIDIA_API_KEY:
    logger.error("NVIDIA_API_KEY no encontrada en el entorno.")

nvidia_model = LiteLlm(
    model="openai/meta/llama-3.3-70b-instruct",
    api_key=NVIDIA_API_KEY,
    base_url="https://integrate.api.nvidia.com/v1",
    parallel_tool_calls=False
)

app_instance = FastAPI(title="FRESCOH! ADK CORE")
session_service = InMemorySessionService()
APP_NAME = "frescoh"
GATEWAY_URL = os.getenv("GATEWAY_URL", "http://localhost:3000")

# --- HERRAMIENTAS OPTIMIZADAS ---
async def check_inventory_batch(items: list[dict], tool_context: ToolContext) -> dict:
    """Verifica el stock de múltiples productos en una sola llamada (Batch)"""
    client_id = tool_context.state.get("client_id") or tool_context.user_id or "anonymous"
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{GATEWAY_URL}/internal/tools/check-stock-batch",
                json={"items": items, "clientId": client_id},
                timeout=25.0
            )
            res_data = response.json()
            
            if res_data.get("status") == "SUCCESS":
                results = res_data.get("data", {}).get("results", [])
                final_items = []
                for r in results:
                    if r.get("availableQuantity", 0) > 0:
                        final_items.append({
                            "productId": r.get("productId") or r.get("productName"),
                            "productName": r.get("productName"),
                            "quantity": r.get("availableQuantity"),
                            "pricePerUnit": r.get("pricePerUnit", 0)
                        })
                tool_context.state["final_items_to_register"] = final_items
                logger.info(f"Items finales para registro guardados en estado: {len(final_items)}")
            
            return res_data
        except Exception as e: 
            logger.error(f"Error in batch stock check: {e}")
            return {"status": "ERROR", "message": "No pude revisar el stock en este momento."}

async def get_catalog(tool_context: ToolContext) -> dict:
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{GATEWAY_URL}/internal/tools/check-stock",
                json={"product": "TODOS", "quantity": 0, "clientId": "anonymous"},
                timeout=15.0
            )
            return response.json()
        except Exception: return {"status": "ERROR", "message": "No pude cargar el catálogo sumercé."}

async def scan_payments(amount: float, tool_context: ToolContext) -> dict:
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{GATEWAY_URL}/internal/tools/scan-payments",
                json={"amount": amount},
                timeout=20.0
            )
            return response.json()
        except Exception: return {"status": "ERROR", "message": "Falla de conexión con Gmail."}

async def get_daily_revenue(tool_context: ToolContext) -> dict:
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{GATEWAY_URL}/internal/tools/get-daily-revenue",
                timeout=20.0
            )
            return response.json()
        except Exception: return {"status": "ERROR", "message": "Error al consultar el recaudo diario."}

async def get_payment_info(tool_context: ToolContext) -> dict:
    return {
        "status": "SUCCESS",
        "methods": {
            "transferencia": "Cuenta de Ahorros Bancolombia 571 000051 61",
            "bre_b": "@frescoh",
            "qr_tag": "[SEND_QR_FRESCOH]"
        },
        "instruction": "Usa estos datos para armar la respuesta según la guía de comunicación."
    }

async def get_config(tool_context: ToolContext) -> dict:
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{GATEWAY_URL}/internal/tools/check-stock",
                json={"action": "get_config", "product": "CONFIG", "quantity": 0, "clientId": "anonymous"},
                timeout=15.0
            )
            res_data = response.json()
            if res_data.get("status") == "SUCCESS":
                return res_data.get("data", {})
            return res_data
        except Exception as e: 
            logger.error(f"Error cargando config: {e}")
            return {"status": "ERROR", "message": "No pude cargar la configuración sumercé."}

async def register_waitlist(items: list[dict], tool_context: ToolContext) -> dict:
    client_id = tool_context.state.get("client_id") or tool_context.user_id or "anonymous"
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{GATEWAY_URL}/internal/tools/check-stock",
                json={"action": "register_waitlist", "items": items, "clientId": client_id},
                timeout=15.0
            )
            return response.json()
        except Exception as e:
            logger.error(f"Error registrando lista de espera: {e}")
            return {"status": "ERROR", "message": "No pude anotar su mercé en la lista de espera."}

# --- INSTRUCCIONES ---

INSTRUCTIONS_BASE = """
Eres 'Fesquitoh', el asistente virtual oficial de Frescoh!. 
Tu tono es PROFESIONAL, AMABLE y RESPETUOSO, tratando siempre de 'usted' al cliente con un acento neutro.

REGLAS ESTRICTAS DE FORMATO (PROHIBICIÓN DE CÓDIGO):
- ESTÁ ESTRICTAMENTE PROHIBIDO generar código de programación (Python, JSON, HTML, etc.).
- DEBES comunicarte ÚNICAMENTE en lenguaje natural conversacional como si estuvieras chateando en WhatsApp.
- Nunca uses bloques de código (```) ni funciones como `print()` o `import`. Eres un asistente humano conversando, NO un programa ejecutando scripts.

REGLAS DE VOZ:
- Usa 'sumercé' de forma natural.
- Incorpora expresiones como 'qué dicha', 'fresquito', 'qué buen antojo'.
- Trato formal: Siempre usa 'usted', nunca 'tú'.

REGLA DE ORO DE HONESTIDAD Y AYUDA (CRÍTICO):
1. SOLO puedes hablar de los beneficios de las frutas y productos que vendemos.
2. Si NO encuentras un producto en el inventario, responde: '¡Ay, sumercé! Fíjese que no encuentro [Nombre] en nuestra cosecha de hoy. Le invito a que visite el catálogo que está aquí arribita☝️'.
3. Si el cliente insiste con dudas complejas, usa 'trigger_escalation' si estuviera disponible (actualmente usa handoff manual).
4. NUNCA inventes información ni trates de adivinar precios.
"""

INSTRUCTIONS_SALES = INSTRUCTIONS_BASE + """
REGLAS DE LIQUIDACIÓN DETERMINISTA:
1. PRIORIDAD DE DATOS: Usa el [ID DE PEDIDO ACTUAL: ...] y los [PRODUCTOS YA EXTRAÍDOS...] del contexto.
2. FLUJO DE STOCK: Llama a 'check_inventory_batch' antes de confirmar. Si falta stock, usa el mensaje ⚠️ reglamentario.
3. FORMATO DE DESGLOSE OBLIGATORIO: •⁠  ⁠[Cantidad]x [Nombre] ($[Total Item])

ESTRUCTURA FINAL DE RESPUESTA:
🛒¡Pedido recibido Sumercé! 

Desglose de su pedido: 
... (items) ...

Subtotal: $[Suma]
Domicilio: $[Domi]
Total a pagar: $[Total]

✅Pedido número (ID: [ID_PEDIDO])

[MENSAJE_AY_SUMERCE_SI_FALTA_STOCK si aplica]

🏦Medios de pago:
... (Transferencia, Bre-B, QR) ...
"""

# --- AGENTES ---

finance_agent = Agent(name="finance_agent", model=nvidia_model, instruction=INSTRUCTIONS_BASE + " Misión: Validar pagos y seguimiento.", tools=[scan_payments, get_daily_revenue, get_payment_info])
recovery_agent = Agent(name="recovery_agent", model=nvidia_model, instruction=INSTRUCTIONS_BASE + " Misión: Atender dudas generales y reconducir al Happy Path con empatía.", tools=[get_catalog, get_config])
sales_agent = Agent(name="sales_agent", model=nvidia_model, instruction=INSTRUCTIONS_SALES, tools=[check_inventory_batch, get_catalog, get_payment_info, get_config, register_waitlist])
inventory_agent = Agent(name="inventory_agent", model=nvidia_model, instruction=INSTRUCTIONS_BASE + " Encargado de stock.", tools=[check_inventory_batch, get_catalog, register_waitlist])
orchestrator_agent = Agent(name="orchestrator", model=nvidia_model, instruction="Supervisor. Clasifica en: sales_agent, inventory_agent, finance_agent, o recovery_agent (saludos/dudas generales). Responde solo el nombre.")

@app_instance.post("/run")
async def run_agent(request: Request):
    try:
        data = await request.json()
        user_id, session_id = data.get("user_id", "u1"), data.get("session_id", "s1")
        message_text = data.get("message", "hola")
        client_id, order_id, items = data.get("client_id", user_id), data.get("order_id", "ORD-NEW"), data.get("items", [])
        
        await ensure_session(user_id, session_id)
        session = await session_service.get_session(app_name=APP_NAME, user_id=user_id, session_id=session_id)
        session.state["client_id"], session.state["order_id"] = client_id, order_id

        # Orquestación
        target = "sales_agent"
        if not ("nuevo pedido" in message_text.lower() or len(items) > 0):
            try:
                orch_runner = Runner(agent=orchestrator_agent, app_name=APP_NAME, session_service=session_service)
                async for event in orch_runner.run_async(user_id=user_id, session_id=f"orch-{user_id}", new_message=types.Content(role="user", parts=[types.Part.from_text(text=message_text)])):
                    if event.is_final_response() and event.content:
                        res = event.content.parts[0].text.lower()
                        if "inventory" in res: target = "inventory_agent"
                        elif "finance" in res: target = "finance_agent"
                        elif "recovery" in res: target = "recovery_agent"
                        break
            except Exception: pass

        agent_map = {"sales_agent": sales_agent, "finance_agent": finance_agent, "inventory_agent": inventory_agent, "recovery_agent": recovery_agent}
        active_agent = agent_map.get(target, sales_agent)
        
        items_context = f"\n[ID DE PEDIDO ACTUAL: {order_id}]\n"
        if items: items_context += f"[PRODUCTOS YA EXTRAÍDOS DEL CATÁLOGO: {json.dumps(items)}]\n"
        
        runner = Runner(agent=active_agent, app_name=APP_NAME, session_service=session_service)
        final_reply = "¡Ay sumercé! Me dio un vahído y no pude terminar de hablar."
        
        try:
            async for event in runner.run_async(user_id=user_id, session_id=session_id, new_message=types.Content(role="user", parts=[types.Part.from_text(text=f"{items_context}\n{message_text}")])):
                if event.is_final_response() and event.content:
                    final_reply = event.content.parts[0].text
        except LiteLlmRateLimitError:
            return {"reply": "¡Ay sumercé! Tengo la plaza llena de gente. Regáleme un minutico y ya lo atiendo personalmente.", "metadata": {"agent": "error", "error_type": "rate_limit"}}
        except Exception as e: raise e
        
        final_metadata = {"agent": target}
        if "final_items_to_register" in session.state:
            final_metadata["items"] = session.state.pop("final_items_to_register")
                
        return {"reply": final_reply, "metadata": final_metadata}
    except Exception as e:
        logger.error(f"Error crítico: {e}")
        return {"reply": "¡Ay sumercé! fíjese que se me embolató la libreta.", "metadata": {"agent": "error"}}

if __name__ == "__main__":
    uvicorn.run(app_instance, host="0.0.0.0", port=8000)
