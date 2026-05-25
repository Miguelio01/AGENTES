import asyncio
import os
from main import run_agent, app_instance
from unittest.mock import patch, MagicMock

# Mock de la clase Request de FastAPI
class MockRequest:
    def __init__(self, data):
        self.data = data
    async def json(self):
        return self.data

async def test_complex_scenario():
    print("\n--- INICIANDO PRUEBA DE FUEGO (ESCENARIO COMPLEJO) ---")
    
    # 1. Simular mensaje molesto + finanzas + inventario
    test_data = {
        "user_id": "miguel_test",
        "session_id": "test_session_1",
        "message": "Oiga sumercé, estoy preocupado porque ya le mandé los 35000 pesos de las fresas hace rato y no me dice nada. ¿Todavía le quedan fresas de 500g?",
        "client_id": "miguel_test"
    }

    # Mock de las llamadas HTTP al Gateway para no depender del puerto 3000
    with patch("httpx.AsyncClient.post") as mock_post:
        # Simular respuesta de scan_payments (No encontrado todavía)
        # Y simular respuesta de check_stock (Hay 10 unidades)
        def side_effect(url, **kwargs):
            mock_res = MagicMock()
            if "scan-payments" in url:
                mock_res.json.return_value = {"status": "PENDING", "verified": False}
            elif "check-stock" in url:
                mock_res.json.return_value = {"status": "SUCCESS", "stock": 10, "presentation": "500g"}
            mock_res.status_code = 200
            return mock_res

        mock_post.side_effect = side_effect

        print(f"Mensaje: {test_data['message']}")
        print("Analizando y procesando...")
        
        response = await run_agent(MockRequest(test_data))
        
        print("\n--- RESULTADOS ---")
        print(f"Agente seleccionado: {response['metadata']['agent']}")
        print(f"Análisis Emocional: {response['metadata']['emotion']}")
        print(f"Respuesta de Fresquitoh:\n{response['reply']}")
        print("-------------------\n")

if __name__ == "__main__":
    # Asegurar que tenemos la API Key para el test (o una fake para la estructura)
    if not os.getenv("NVIDIA_API_KEY"):
        os.environ["NVIDIA_API_KEY"] = "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"
    
    asyncio.run(test_complex_scenario())
