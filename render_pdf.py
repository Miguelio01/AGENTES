import pypdfium2 as pdfium
import os

pdf_path = 'Manual de Marca Integral Frescoh!.pdf'
output_dir = 'brain/temp_images'

if not os.path.exists(output_dir):
    os.makedirs(output_dir)

pdf = pdfium.PdfDocument(pdf_path)
for i in range(len(pdf)):
    page = pdf[i]
    bitmap = page.render(scale=2) # Higher scale for better OCR
    image = bitmap.to_pil()
    image.save(f"{output_dir}/pagina_{i+1}.jpg")
    print(f"✅ Página {i+1} guardada.")

pdf.close()
