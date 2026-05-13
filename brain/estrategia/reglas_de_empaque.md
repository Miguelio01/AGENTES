[[index_productos]]

# Reglas de Empaque y Conversión - Frescoh!

Estas reglas definen cómo los agentes deben interpretar las cantidades solicitadas por los clientes y cómo se relacionan con los empaques reales en el inventario.

## Reglas de Conversión de Unidades
- **1 Kilo (kg)** = 1000 gramos.
- **1 Libra (lb)** = 500 gramos.
- **Medio Kilo** = 500 gramos.
- **Cuarto de Kilo** = 250 gramos.

## Lógica de Selección de Empaque
- Si el cliente pide un peso específico (ej. "1 kilo"), el agente debe buscar en la hoja de 'costos' los empaques disponibles para ese producto.
- Se debe priorizar el empaque que sume exactamente la cantidad pedida con el menor número de unidades.
- **Ejemplo Fresa:** Si el cliente pide 1 kilo y existen empaques de 500g, el agente debe ofrecer 2 unidades de 500g.

## Excepciones
- **Huevos:** No se manejan por peso. Se venden por "Unidad" o "Bandeja/Cubeta" (generalmente de 30 unidades). Ignorar cálculos de gramaje para este producto.
- **Tilapia:** Se maneja por peso variable, pero el inventario suele estar en gramos o kilos según la hoja.

## Prioridad de Datos
1. Las presentaciones exactas (gramajes) se leen siempre de la pestaña **'costos'** de la hoja de cálculo.
2. Si un producto en 'costos' dice "Fresa 500g", el valor numérico es 500 y la unidad es gramos.

## DATOS EXACTOS DE EMPAQUES 
| ID          | PRODUCTO       | GRM | EMPAQUE |
| ----------- | -------------- | --- | ------- |
| PROD-TIL-01 | Tilapia        | 500 | Nevera  |
| PROD-HUE-JB | Huevos Jumbo   | N/A | Bandeja |
| PROD-HUE-GR | Huevos Grandes | N/A | Bandeja |
| FRU-ARA-500 | Arandanos      | 500 | Caja    |
| FRU-FRE-500 | Fresas         | 500 | Caja    |
| FRU-MOR-500 | Mora           | 500 | Caja    |
| FRU-FRA-125 | Frambuesas     | 125 | Caja    |
| FRU-UCH-500 | Uchuvas        | 500 | Caja    |
