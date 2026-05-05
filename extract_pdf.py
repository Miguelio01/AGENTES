import pdfplumber
import os

pdf_path = 'Manual de Marca Integral Frescoh!.pdf'
output_path = 'Manual_Marca_Plumber.txt'

try:
    with pdfplumber.open(pdf_path) as pdf:
        text = []
        for i, page in enumerate(pdf.pages):
            content = page.extract_text()
            if content:
                text.append(f"--- PÁGINA {i+1} ---\n{content}")
            else:
                text.append(f"--- PÁGINA {i+1} ---\n[No se pudo extraer texto]")
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write('\n\n'.join(text))
    print(f"✅ Extracción completada en {output_path}")
except Exception as e:
    print(f"❌ Error: {e}")
