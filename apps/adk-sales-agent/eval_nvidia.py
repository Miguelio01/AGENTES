import asyncio
import json
import os
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()

NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "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")
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"

client = AsyncOpenAI(api_key=NVIDIA_API_KEY, base_url=NVIDIA_BASE_URL)

SYSTEM_PROMPT = """
Eres 'Fresquitoh', el asistente estrella de la tienda Frescoh!.
Tu personalidad: Campesino boyacense, extremadamente amable, servicial y respetuoso.
Usa expresiones como: '¡Hola mi estimado!', '¡Claro que sí sumercé!', '¡Cosecha fresca!', '¡Dios le pague!'.

Tus responsabilidades:
1. Escuchar el pedido del cliente.
2. Verificar siempre el stock usando 'check_stock' antes de confirmar nada.
3. Informar los precios y el total al cliente.
4. Si el cliente confirma con un 'sí', 'bueno', 'hágale', registra el pedido usando 'register_order'.
"""

async def evaluate_case(case):
    eval_id = case["eval_id"]
    user_query = case["conversation"][0]["user_content"]["parts"][0]["text"]
    expected_response = case["conversation"][0]["final_response"]["parts"][0]["text"]
    expected_tools = [t["name"] for r in case["conversation"] for t in r.get("intermediate_data", {}).get("tool_uses", [])]

    print(f"\n[CASE: {eval_id}] Input: {user_query}")
    
    response = await client.chat.completions.create(
        model="meta/llama-3.3-70b-instruct",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_query}
        ],
        temperature=0.7
    )
    
    reply = response.choices[0].message.content
    print(f"Reply: {reply}")
    
    # Simple Scoring
    tone_score = 1.0 if "sumercé" in reply.lower() or "estimado" in reply.lower() else 0.5
    tool_logic = 1.0 if any(tool in reply.lower() or "revisar" in reply.lower() for tool in expected_tools) else 0.0
    
    return {
        "id": eval_id,
        "tone": tone_score,
        "logic": tool_logic,
        "reply": reply
    }

async def main():
    with open("tests/eval/evalsets/sales_basic.json", "r") as f:
        eval_set = json.load(f)
    
    results = []
    for case in eval_set["eval_cases"]:
        res = await evaluate_case(case)
        results.append(res)
    
    avg_tone = sum(r["tone"] for r in results) / len(results)
    avg_logic = sum(r["logic"] for r in results) / len(results)
    
    print("\n" + "="*30)
    print("RESUMEN DE EVALUACIÓN NVIDIA")
    print(f"Puntaje de Tono: {avg_tone:.2f}/1.0")
    print(f"Puntaje de Lógica: {avg_logic:.2f}/1.0")
    print(f"Estado Final: {'APROBADO' if avg_tone > 0.8 and avg_logic > 0.8 else 'REVISAR'}")
    print("="*30)

if __name__ == "__main__":
    asyncio.run(main())
