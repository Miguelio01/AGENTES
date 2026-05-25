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

# --- HERRAMIENTAS REALES ---
async def check_stock(product: str, quantity: int, tool_context: ToolContext) -> dict:
    client_id = tool_context.state.get("client_id", "anonymous")
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{GATEWAY_URL}/internal/tools/check-stock",
                json={"product": product, "quantity": quantity, "clientId": client_id},
                timeout=10.0
            )
            return response.json()
        except Exception: return {"status": "ERROR", "message": "No pude revisar el stock sumercé."}

async def get_catalog(tool_context: ToolContext) -> dict:
    async with httpx.AsyncClient() as client:
        try:
            # Reutilizamos el endpoint de inventario del gateway si existe o uno nuevo
            response = await client.post(
                f"{GATEWAY_URL}/internal/tools/check-stock",
                json={"product": "TODOS", "quantity": 0, "clientId": "anonymous"},
                timeout=10.0
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
            "qr_tag": "[SEND_QR]"
        },
        "instruction": "Usa estos datos para armar la respuesta según la guía de comunicación."
    }

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
FLUJO DE ATENCIÓN SEGÚN LA GUÍA:

1. PRIMER CONTACTO:
   '¡Buen día! Qué gusto saludarle, soy Fresquitoh, y estoy aquí para ayudarle con lo que necesite. ¿Busca algo de nuestro catálogo de productos orgánicos o prefiere que le cuente qué tenemos fresquito para hoy?'

2. PEDIDO POR TEXTO:
   '¡Claro que sí, sumercé! Qué buen antojo. Voy a organizar su pedido para que no se nos pase nada:
   [Lista de productos x cantidad]
   ¿Le parece bien así? Confírmeme si todo es correcto y si la dirección es la misma de siempre para tenerlo todo listico.'

3. CONFIRMACIÓN DE PEDIDO (PENDIENTE DE PAGO):
   '¡Pedido registrado! ✅ Total: $[Valor]. Para el pago: Cuenta de Ahorros Bancolombia 571 000051 61 o por la llave Bre-B @frescoh. Apenas me envíe el comprobante, le reservo su cupo en la ruta de despacho. ¡Gracias por preferir nuestros productos! [SEND_QR]'

4. SEGUIMIENTO (No pago a las 24h):
   '¡Buen día! Le escribo porque aún no hemos recibido el pago de su pedido. Como trabajamos con productos bien frescos, necesitamos liberar el cupo en el centro de despacho si la orden no se ha confirmado. ¿Aún desea mantenerla? Quedo atento a lo que usted me indique.'

5. PEDIDO ENVIADO:
   '¡Buenas noticias, sumercé! Su pedido Frescoh! ya salió de nuestro centro de despacho y va camino a su dirección. El repartidor le contactará al llegar. ¡Esperamos que disfrute mucho estos productos fresquitos que le enviamos!'

6. POST-VENTA (Cómo le fue):
   '¡Buen día! Espero que haya disfrutado mucho de sus productos. Para nosotros en Frescoh! es muy importante saber cómo le fue con su encargo, sumercé. ¿Tiene algún comentario o sugerencia que quiera compartirnos? ¡Qué dicha poder mejorar para usted!'

7. DESCUENTO POR REFERIDO:
   '¡Qué alegría que le haya gustado nuestros productos fresquitos! Si conoce a alguien que también quiera comer natural, tenemos un beneficio para sumercé: por cada persona que haga su primer pedido de su parte, le daremos un descuento especial en su próxima compra. ¡Muchas gracias por ayudarnos a crecer!'

8. CLIENTE INACTIVO (Reactivación):
   '¡Hola! Hace ya un par de semanas que no sabemos de usted por aquí en Frescoh!, sumercé. Se le ha extrañado en nuestros despachos. ¿Le gustaría revisar nuestro catálogo de esta semana? Tenemos cosas bien ricas y fresquitas esperándole. ¡Quedo atento por si desea hacer un nuevo encargo!'

REGLA CRÍTICA: Usa estas estructuras exactas cuando el contexto coincida. Siempre agrega [SEND_QR] al dar datos de pago.
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
    instruction=INSTRUCTIONS_SALES + """
Atiende ventas, post-venta, referidos y reactivación. 
- Usa 'get_catalog' si piden productos.
- Usa 'get_payment_info' si piden datos de pago.
- Si el cliente da feedback, agradécele con la frase de POST-VENTA.
- Si el cliente recomienda a alguien, usa la frase de REFERIDOS.
""",
    tools=[check_stock, get_catalog, get_payment_info]
)

inventory_agent = Agent(
    name="inventory_agent",
    model=nvidia_model,
    instruction=INSTRUCTIONS_BASE + " Encargado de detalles de productos y stock. Usa 'get_catalog' para ver disponibilidad.",
    tools=[check_stock, get_catalog]
)

emotion_agent = Agent(
    name="emotion_agent",
    model=nvidia_model,
    instruction="""
    Analiza el mensaje del cliente y determina su estado emocional.
    Responde ÚNICAMENTE con un JSON válido:
    {
      "emotion": "happy" | "angry" | "sad" | "neutral" | "excited" | "confused",
      "intensity": float (0-1),
      "reason": "breve explicación"
    }
    """
)

orchestrator_agent = Agent(
    name="orchestrator",
    model=nvidia_model,
    instruction="""
    Supervisor. Responde con el nombre del agente que debe atender:
    - 'sales_agent': Para ventas, catálogo, envíos, feedback post-venta, referidos o reactivación.
    - 'inventory_agent': Para preguntas técnicas de stock o productos específicos.
    - 'finance_agent': Para validación de comprobantes, dudas de pago o reportes financieros.
    """
)

@app_instance.post("/analyze-emotion")
async def analyze_emotion(request: Request):
    data = await request.json()
    message_text = data.get("message", "")
    
    runner = Runner(agent=emotion_agent, app_name=APP_NAME, session_service=session_service)
    async for event in runner.run_async(
        user_id="system", session_id="temp",
        new_message=types.Content(role="user", parts=[types.Part.from_text(text=message_text)])
    ):
        if event.is_final_response() and event.content:
            try:
                # Extraer JSON del texto
                import json, re
                text = event.content.parts[0].text
                match = re.search(r'\{.*\}', text, re.DOTALL)
                if match: return json.loads(match.group())
            except Exception: pass
            
    return {"emotion": "neutral", "intensity": 0.5, "reason": "Error en análisis"}

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
        force_agent = data.get("force_agent")
        
        await ensure_session(user_id, session_id)
        session = await session_service.get_session(app_name=APP_NAME, user_id=user_id, session_id=session_id)
        session.state["client_id"] = client_id

        # 1. ANÁLISIS EMOCIONAL (Proactivo - Con protección)
        emotion_context = "Neutral"
        try:
            if len(message_text.split()) > 3:
                emo_session_id = f"emo-{user_id}"
                await ensure_session("system", emo_session_id)
                emo_runner = Runner(agent=emotion_agent, app_name=APP_NAME, session_service=session_service)
                async for event in emo_runner.run_async(
                    user_id="system", session_id=emo_session_id,
                    new_message=types.Content(role="user", parts=[types.Part.from_text(text=message_text)])
                ):
                    if event.is_final_response() and event.content:
                        emotion_context = event.content.parts[0].text
        except Exception as e:
            logger.error(f"Error en análisis emocional: {e}")

        # 2. ORQUESTRACIÓN
        target = force_agent
        if not target:
            try:
                orch_session_id = f"orch-{user_id}"
                await ensure_session(user_id, orch_session_id)
                orch_runner = Runner(agent=orchestrator_agent, app_name=APP_NAME, session_service=session_service)
                async for event in orch_runner.run_async(
                    user_id=user_id, session_id=orch_session_id,
                    new_message=types.Content(role="user", parts=[types.Part.from_text(text=f"¿Quién atiende (sales_agent, inventory_agent, finance_agent): '{message_text}'?")])
                ):
                    if event.is_final_response() and event.content:
                        res = event.content.parts[0].text.lower()
                        if "inventory" in res: target = "inventory_agent"
                        elif "finance" in res: target = "finance_agent"
                        else: target = "sales_agent"
                        break
            except Exception as e:
                logger.error(f"Error en orquestación: {e}")
                target = "sales_agent"

        # 3. EJECUCIÓN CON CONTEXTO EMOCIONAL
        agents_map = {
            "inventory_agent": inventory_agent,
            "finance_agent": finance_agent,
            "sales_agent": sales_agent
        }
        active_agent = agents_map.get(target, sales_agent)
        
        # Inyectar el humor del cliente como una instrucción temporal
        full_message = f"[ESTADO EMOCIONAL DEL CLIENTE: {emotion_context}]\n\nMensaje del cliente: {message_text}"
        
        runner = Runner(agent=active_agent, app_name=APP_NAME, session_service=session_service)
        
        final_reply = "¡Ay sumercé! Me dio un vahído y no pude terminar de hablar. ¿Me repite el pedido?"
        async for event in runner.run_async(
            user_id=user_id, session_id=session_id,
            new_message=types.Content(role="user", parts=[types.Part.from_text(text=full_message)])
        ):
            if event.is_final_response() and event.content:
                final_reply = event.content.parts[0].text
                
        return {"reply": final_reply, "metadata": {"agent": target, "emotion": emotion_context}}
    except Exception as e:
        logger.error(f"Error crítico en run_agent: {e}")
        return {"reply": "¡Ay sumercé! fíjese que se me embolató la libreta. ¿Me regala un momentico y volvemos a empezar?", "metadata": {"agent": "error"}}

if __name__ == "__main__":
    uvicorn.run(app_instance, host="0.0.0.0", port=8000)
