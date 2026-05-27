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
            
            # Guardar en el estado para que el orquestador lo vea al final
            if res_data.get("status") == "SUCCESS":
                results = res_data.get("data", {}).get("results", [])
                final_items = []
                for r in results:
                    # REGLA: Solo items con stock disponible entran al pedido real
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
    """Retorna los medios de pago oficiales de Frescoh!"""
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
    """Retorna la configuración global (Costo de domicilio, fechas, etc.)"""
    async with httpx.AsyncClient() as client:
        try:
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

async def register_waitlist(items: list[dict], tool_context: ToolContext) -> dict:
    """
    Registra items agotados en la lista de espera de la cosecha.
    Args:
        items: Lista de objetos con {'productName': str, 'quantity': int}
    """
    client_id = tool_context.state.get("client_id") or tool_context.user_id or "anonymous"
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{GATEWAY_URL}/internal/tools/check-stock",
                json={
                    "action": "register_waitlist", 
                    "items": items, 
                    "clientId": client_id
                },
                timeout=15.0
            )
            return response.json()
        except Exception as e:
            logger.error(f"Error registrando lista de espera: {e}")
            return {"status": "ERROR", "message": "No pude anotar su mercé en la lista de espera."}

# --- AGENTES ---

INSTRUCTIONS_BASE = """
Eres 'Fesquitoh', el asistente virtual oficial de Frescoh!. 
Tu tono es PROFESIONAL, AMABLE y RESPETUOSO, tratando siempre de 'usted' al cliente con un acento neutro.

REGLAS DE VOZ:
- Usa 'sumercé' de forma natural.
- Incorpora expresiones como 'qué dicha', 'fresquito', 'qué buen antojo'.
- Trato formal: Siempre usa 'usted', nunca 'tú'.

REGLA DE ORO DE HONESTIDAD Y AYUDA (CRÍTICO):
1. SOLO puedes hablar de los beneficios de las frutas y productos que vendemos.
2. Si NO encuentras un producto en el inventario o el cliente pregunta algo fuera de tu base de conocimiento, DEBES responder exactamente así: 
   '¡Ay, sumercé! Fíjese que no encuentro [Nombre del Producto o tema] en nuestra cosecha de hoy. Le invito a que visite el catálogo que está aquí arribita☝️; allá tenemos otros productos bien fresquitos esperando por usted.'
3. Si el cliente insiste con una duda compleja que no puedes resolver, usa 'trigger_escalation'.
4. NUNCA inventes información ni trates de adivinar precios.
"""

INSTRUCTIONS_SALES = INSTRUCTIONS_BASE + """
REGLAS DE LIQUIDACIÓN DETERMINISTA (SIN EXCEPCIONES):
1. PRIORIDAD DE DATOS: Usa el [ID DE PEDIDO ACTUAL: ...] y los [PRODUCTOS YA EXTRAÍDOS...] del contexto.
2. FLUJO DE STOCK:
   - DEBES llamar a 'check_inventory_batch' antes de confirmar cualquier pedido.
   - SI EL STOCK ES INSUFICIENTE (ej: pide 2, hay 1):
     * SOLO cobra la cantidad DISPONIBLE en el desglose y el total.
     * Incluye el mensaje de advertencia ⚠️ exactamente como se indica abajo, y PREGUNTA al cliente. NO asumas su respuesta.
3. FORMATO DE DESGLOSE OBLIGATORIO (usa exactamente este estilo):
   •⁠  ⁠[Cantidad]x [Nombre del Producto] ($[Precio Total del Item])
   (Nota: El punto • seguido de ⁠ y el espacio es vital para el formato WhatsApp).

ESTRUCTURA FINAL DE RESPUESTA A UN NUEVO PEDIDO:
🛒¡Pedido recibido Sumercé! 

Desglose de su pedido: 
•⁠  ⁠[Cantidad Disponible]x [Nombre del Producto] ($[Precio Total])
...

Subtotal: $[Suma de disponibles]
Domicilio: $[Valor de get_config]
Total a pagar: $[Suma Total Real]

✅Pedido número (ID: [ID_PEDIDO])

[MENSAJE_AY_SUMERCE_SI_FALTA_STOCK]

🏦Medios de pago:
Transferencia a Bancolombia → Cuenta de ahorros 57100005161
Pago por llave (Bre-B) → @frescoh
Código QR → está en la imagen de abajo.

Apenas me envíe el comprobante, le reservo su cupo en la ruta de despacho. ¡Gracias por preferir nuestros productos! siempre Frescoh! [SEND_QR_FRESCOH]

REGLA PARA [MENSAJE_AY_SUMERCE_SI_FALTA_STOCK]:
Si hubo productos con stock insuficiente o nulo, DEBES incluir inmediatamente debajo del número de pedido:
"⚠️ ¡Qué pena! No logré encontrar suficiente [Nombre] en nuestro catálogo de hoy (solo pude apartarle [Cantidad Disponible]). ¿Le gustaría proceder con el pago de lo que tenemos disponible y que lo anote de una vez en la lista de espera por el resto (Sí), o prefiere dejar así solamente lo que hay (No)?"

MANEJO DE RESPUESTA A LA PREGUNTA (Sí/No) - ESTO ES CUANDO EL CLIENTE TE RESPONDE A LA PREGUNTA ANTERIOR:
- Si el cliente responde "SÍ": Llama a 'register_waitlist' con los productos faltantes. Tu respuesta debe ser EXACTAMENTE:
  "Listo sumercé, ya quedó anotado en la lista de espera. Quedo muy atento a su comprobante de pago de lo que tenemos disponible para despacharle."
- Si el cliente responde "NO": Tu respuesta debe ser EXACTAMENTE:
  "Bueno señor, esperamos el comprobante de pago ya que no quiere el producto más adelante."
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
    tools=[check_inventory_batch, get_catalog, get_payment_info, get_config, register_waitlist]
)

inventory_agent = Agent(
    name="inventory_agent",
    model=nvidia_model,
    instruction=INSTRUCTIONS_BASE + " Encargado de detalles de productos y stock. Usa 'get_catalog' para ver disponibilidad.",
    tools=[check_inventory_batch, get_catalog, register_waitlist]
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
        client_name = data.get("client_name", "Cliente")
        client_phone = data.get("client_phone", "Sin teléfono")
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
        
        # Recuperar items finales del estado si existen
        final_metadata = {"agent": target}
        if "final_items_to_register" in session.state:
            final_metadata["items"] = session.state["final_items_to_register"]
            # Limpiar para la próxima interacción
            del session.state["final_items_to_register"]
                
        return {"reply": final_reply, "metadata": final_metadata}
    except Exception as e:
        logger.error(f"Error crítico en run_agent: {e}")
        return {"reply": "¡Ay sumercé! fíjese que se me embolató la libreta.", "metadata": {"agent": "error"}}

if __name__ == "__main__":
    uvicorn.run(app_instance, host="0.0.0.0", port=8000)
