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
    base_url="https://integrate.api.nvidia.com/v1"
)

app_instance = FastAPI(title="FRESCOH! ADK CORE")
session_service = InMemorySessionService()
APP_NAME = "frescoh"
GATEWAY_URL = os.getenv("GATEWAY_URL", "http://localhost:3000")

# --- HERRAMIENTAS OPTIMIZADAS ---
async def check_inventory_batch(items: list[dict], tool_context: ToolContext) -> dict:
    """Verifica el stock de múltiples productos en una sola llamada (Batch)"""
    client_id = tool_context.state.get("client_id", "anonymous")
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{GATEWAY_URL}/internal/tools/check-stock-batch",
                json={"items": items, "clientId": client_id},
                timeout=25.0
            )
            return response.json()
        except Exception as e: 
            logger.error(f"Error in batch stock check: {e}")
            return {"status": "ERROR", "message": "No pude revisar el lote de stock sumercé."}

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
    """Retorna los medios de pago oficiales de Frescoh!"""
    return {
        "status": "SUCCESS",
        "methods": {
            "transferencia": "Cuenta de Ahorros Bancolombia 571 000051 61",
            "bre_b": "@frescoh (Llave Bancolombia)",
            "qr_tag": "[SEND_QR_FRESCOH]"
        },
        "instruction": "Usa estos datos para armar la respuesta según la guía de comunicación."
    }

async def get_config(tool_context: ToolContext) -> dict:
    """Retorna la configuración global (Costo de domicilio, fechas, etc.)"""
    async with httpx.AsyncClient() as client:
        try:
            # IMPORTANTE: Enviamos action: get_config explícitamente
            response = await client.post(
                f"{GATEWAY_URL}/internal/tools/check-stock",
                json={"action": "get_config", "product": "CONFIG", "quantity": 0, "clientId": "anonymous"},
                timeout=15.0
            )
            res_data = response.json()
            if res_data.get("status") == "SUCCESS":
                config = res_data.get("data", {})
                logger.info(f"Configuración cargada: {config}")
                return config
            return res_data
        except Exception as e: 
            logger.error(f"Error cargando config: {e}")
            return {"status": "ERROR", "message": "No pude cargar la configuración sumercé."}

# --- AGENTES ---

INSTRUCTIONS_BASE = """
Eres 'Fresquitoh', el asistente virtual oficial de Frescoh!. 
Tu tono es PROFESIONAL y RESPETUOSO, tratando siempre de 'usted' al cliente, pero con toques auténticos de la jerga cundiboyacense.

REGLAS DE VOZ:
- Usa 'sumercé' de forma natural.
- Incorpora expresiones como 'qué dicha', 'fresquito', 'listico', 'qué buen antojo'.
- Trato formal: Siempre usa 'usted', nunca 'tú'.
- Si no encuentras información sobre un producto: '¡Ay sumercé! fíjese que no encuentro ese producto en mi lista de cosecha de hoy. ¿Será que me lo anotó bien o prefiere que revisemos qué más tengo fresquito?'
"""

INSTRUCTIONS_SALES = INSTRUCTIONS_BASE + """
REGLAS DE LIQUIDACIÓN DETERMINISTA (PROTOCOLOS BLOQUEANTES):
1. PRIORIDAD ABSOLUTA DE IDENTIDAD: El ID de pedido oficial es el que aparece en el bloque [ID DE PEDIDO ACTUAL: ...]. DEBES ignorar cualquier otro ID numérico largo que veas en el mensaje del cliente (esos son IDs de red, no de negocio).
2. PRIORIDAD ABSOLUTA DE PRODUCTOS: Si el mensaje contiene un bloque de [PRODUCTOS YA EXTRAÍDOS...], DEBES usar ESOS datos para disparar las herramientas de inmediato. No intentes extraerlos de nuevo del texto.
3. Si detectas un pedido, DEBES ejecutar este plan SIN HABLAR con el cliente hasta el final:
   A. Llama a 'check_inventory_batch' con TODOS los items.
   B. Llama a 'get_config' para el domicilio.
   C. Llama a 'get_payment_info' para los datos bancarios.
4. NUNCA respondas con frases como "Voy a consultar..." o "Ahora que tengo...". Simplemente ejecuta las herramientas.
5. Si un producto tiene stock 0 o insuficiente, márcalo como $[Pendiente] o [Sin Stock] en el desglose y no lo sumes al total.
6. Solo emite la respuesta final cuando tengas TODOS los datos de las 3 herramientas.

ESTRUCTURA OBLIGATORIA DE RESPUESTA:
'¡Pedido Recibido Sumercé! 🛒

Desglose de su pedido: 
• [Cantidad]x [Nombre del Producto] ($[Precio Total del Item])
... (repetir por cada item)

Subtotal: $[Suma de productos con stock]
Domicilio: $[Valor de get_config]
TOTAL A PAGAR: $[Suma Total Real]

✅ Pedido registrado con éxito (ID: [ESCRIBE AQUÍ EL ID_PEDIDO DEL CONTEXTO]).

🏦 MEDIOS DE PAGO DISPONIBLES:
1. Transferencia Bancolombia: Ahorros 571 000051 61
2. Pago por Llave (Bre-B): @frescoh
3. Código QR: (A continuación se lo comparto sumercé)

Apenas realice el paguito, por favor me manda el comprobante por aquí mismo para agendar su entrega. ¡Muchas gracias! [SEND_QR_FRESCOH]'

REGLA DE ORO: El cliente espera resultados, no procesos. Si hay datos en el contexto, úsalos para disparar las herramientas de inmediato.
"""

finance_agent = Agent(
    name="finance_agent",
    model=nvidia_model,
    instruction=INSTRUCTIONS_BASE + """
Tu misión es VALIDAR los pagos de forma amable y profesional.

1. CONFIRMACIÓN DE COMPROBANTE (PAGADO):
   Si el pago está VERIFICADO, usa el guion:
   '¡Listo! Comprobante recibido, muchas gracias. Ya quedó su pedido confirmado en nuestra lista. Apenas vaya saliendo el despacho le aviso para que esté pendiente. ¡Qué dicha servirle!'

2. SEGUIMIENTO DE PAGO PENDIENTE:
   Usa el guion de 'SEGUIMIENTO (No pago a las 24h)' si el cliente pregunta por una orden vieja no pagada.

REGLA DE SEGURIDAD: Solo existen 'scan_payments', 'get_daily_revenue' y 'get_payment_info'.
""",
    tools=[scan_payments, get_daily_revenue, get_payment_info]
)

sales_agent = Agent(
    name="sales_agent",
    model=nvidia_model, 
    instruction=INSTRUCTIONS_SALES,
    tools=[check_inventory_batch, get_catalog, get_payment_info, get_config]
)

inventory_agent = Agent(
    name="inventory_agent",
    model=nvidia_model,
    instruction=INSTRUCTIONS_BASE + " Encargado de detalles de productos y stock. Usa 'get_catalog' para ver disponibilidad.",
    tools=[check_inventory_batch, get_catalog]
)

emotion_agent = Agent(
    name="emotion_agent",
    model=nvidia_model,
    instruction="Analiza el sentimiento del cliente y responde con un JSON breve."
)

orchestrator_agent = Agent(
    name="orchestrator",
    model=nvidia_model,
    instruction="""Supervisor. Clasifica: 'sales_agent' (pedidos/info), 'inventory_agent' (stock), 'finance_agent' (pagos)."""
)

@app_instance.get("/health")
async def health_check():
    return {"status": "ok", "service": "frescoh-adk-core"}

async def ensure_session(user_id: str, session_id: str):
    try:
        session = await session_service.get_session(app_name=APP_NAME, user_id=user_id, session_id=session_id)
        if not session:
            await session_service.create_session(app_name=APP_NAME, user_id=user_id, session_id=session_id)
    except Exception:
        await session_service.create_session(app_name=APP_NAME, user_id=user_id, session_id=session_id)

@app_instance.post("/run")
async def run_agent(request: Request):
    try:
        data = await request.json()
        user_id = data.get("user_id", "u1")
        session_id = data.get("session_id", "s1")
        message_text = data.get("message", "hola")
        client_id = data.get("client_id", user_id)
        order_id = data.get("order_id", "ORD-NEW")
        items = data.get("items", [])
        
        await ensure_session(user_id, session_id)
        session = await session_service.get_session(app_name=APP_NAME, user_id=user_id, session_id=session_id)
        session.state["client_id"] = client_id
        session.state["order_id"] = order_id

        # --- OPTIMIZACIÓN: SALTAR ORQUESTACIÓN PARA CATÁLOGO ---
        target = "sales_agent"
        is_catalogue = "nuevo pedido del catálogo" in message_text.lower() or len(items) > 0
        
        if not is_catalogue:
            # Solo orquestar si no es un pedido obvio del catálogo
            try:
                orch_runner = Runner(agent=orchestrator_agent, app_name=APP_NAME, session_service=session_service)
                async for event in orch_runner.run_async(
                    user_id=user_id, session_id=f"orch-{user_id}",
                    new_message=types.Content(role="user", parts=[types.Part.from_text(text=f"¿Agente para: '{message_text}'?")])
                ):
                    if event.is_final_response() and event.content:
                        res = event.content.parts[0].text.lower()
                        if "inventory" in res: target = "inventory_agent"
                        elif "finance" in res: target = "finance_agent"
                        else: target = "sales_agent"
                        break
            except Exception: target = "sales_agent"

        # --- EJECUCIÓN ---
        active_agent = sales_agent if target == "sales_agent" else (finance_agent if target == "finance_agent" else inventory_agent)
        
        # Inyectar items estructurados e ID DE PEDIDO directamente en el prompt
        items_context = f"\n[ID DE PEDIDO ACTUAL: {order_id}]\n"
        if items:
            items_context += f"[PRODUCTOS YA EXTRAÍDOS DEL CATÁLOGO: {json.dumps(items)}]\n"
        
        full_message = f"{items_context}\nMensaje del cliente: {message_text}"
        
        runner = Runner(agent=active_agent, app_name=APP_NAME, session_service=session_service)
        final_reply = "¡Ay sumercé! Me dio un vahído y no pude terminar de hablar. ¿Me repite el pedido?"
        async for event in runner.run_async(
            user_id=user_id, session_id=session_id,
            new_message=types.Content(role="user", parts=[types.Part.from_text(text=full_message)])
        ):
            if event.is_final_response() and event.content:
                final_reply = event.content.parts[0].text
                
        return {"reply": final_reply, "metadata": {"agent": target}}
    except Exception as e:
        logger.error(f"Error crítico en run_agent: {e}")
        return {"reply": "¡Ay sumercé! fíjese que se me embolató la libreta.", "metadata": {"agent": "error"}}

if __name__ == "__main__":
    uvicorn.run(app_instance, host="0.0.0.0", port=8000)
