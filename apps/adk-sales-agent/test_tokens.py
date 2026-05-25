import httpx
import asyncio
import json
import time

async def test_token_efficiency():
    url = "http://localhost:8000/run"
    payload = {
        "user_id": "test_user_001",
        "session_id": "session_tokens_test",
        "message": "Hola Fresquitoh, ¿qué cosecha tiene hoy para mi?",
        "client_id": "test_user_001"
    }
    
    print("🚀 Iniciando prueba de eficiencia de tokens...")
    start_time = time.time()
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, timeout=30.0)
            result = response.json()
            latency = (time.time() - start_time) * 1000
            
            print(f"✅ Respuesta recibida en {latency:.2f}ms")
            print(f"💬 Réplica: {result.get('reply')[:100]}...")
            print("-" * 50)
            print("💡 ANALISIS DE TOKENS (Simulado en este paso):")
            # En una implementación real, el ADK devolvería metadatos de tokens.
            # Vamos a forzar un log de inspección en el agente para ver qué envía.
            
    except Exception as e:
        print(f"❌ Error en la prueba: {e}")

if __name__ == "__main__":
    asyncio.run(test_token_efficiency())
