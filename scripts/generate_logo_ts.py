import base64
import os

logo_path = 'apps/gateway/src/assets/logo_frescoh.png'
output_path = 'apps/gateway/src/modules/metrics/logo-base64.ts'

with open(logo_path, 'rb') as f:
    encoded = base64.b64encode(f.read()).decode('utf-8')

with open(output_path, 'w') as f:
    f.write(f"export const LOGO_BASE64 = '{encoded}';\n")
