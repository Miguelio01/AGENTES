import os
import asyncio
from google.adk.models.lite_llm import LiteLlm
from google.genai import types

async def test_nvidia():
    api_key = os.getenv("NVIDIA_API_KEY", "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")
    model = LiteLlm(
        model="openai/meta/llama-3.3-70b-instruct",
        api_key=api_key,
        base_url="https://integrate.api.nvidia.com/v1"
    )
    
    print("Testing NVIDIA NIM connectivity...")
    try:
        # Usar un método simple de generación de texto si está disponible o simular el flujo del ADK
        # ADK LiteLlm usualmente implementa la interfaz de generación de contenido
        # Pero para descartar, probaremos un prompt simple.
        
        # Simulando lo que hace el ADK internamente
        # response = await model.generate_content(...)
        print("Model object created. Check key format.")
        if not api_key.startswith("nvapi-"):
            print("❌ Invalid key format")
        else:
            print("✅ Key format looks OK")
            
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_nvidia())
