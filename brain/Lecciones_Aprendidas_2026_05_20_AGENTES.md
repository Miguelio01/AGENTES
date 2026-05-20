---
title: Lecciones Aprendidas - 20 de Mayo, 2026 - Proyecto AGENTES
date: 2026-05-20
tags:
  - lecciones-aprendidas
  - proyecto/agentes
  - logica-negocio/stock-parcial
  - lista-de-espera
  - orquestacion/estados
---

# 🧠 Lecciones Aprendidas - 20 de Mayo, 2026

## 🛒 Gestión de Stock Inteligente
- **Venta Honesta:** Es mejor vender lo que hay y ofrecer lista de espera que simplemente rechazar el pedido por falta de stock total. Implementar el estado `PARTIAL_STOCK` permite ajustar carritos dinámicamente.
- **Inventarios Negativos:** Nunca se debe permitir que el sistema reste stock por encima de lo disponible. El `InventoryAgent` ahora garantiza esto devolviendo la cantidad real disponible.

## 🎙️ Voz de Marca y Empatía
- **Comunicación de Incidencias:** Fresquitoh ahora maneja la falta de productos con honestidad campesina. Explicar por qué solo se pudo apartar una cantidad parcial humaniza el bot y reduce la frustración del cliente.
- **Call to Action (Lista de Espera):** Ofrecer explícitamente la lista de cosecha ("¿Lo anoto?") convierte una pérdida de venta potencial en una oportunidad futura.

## 🏗️ Orquestación y Estados de Sesión
- **Transiciones No Lineales:** Un cliente puede estar en un flujo de pago (Catálogo) y al mismo tiempo necesitar confirmar una lista de espera. El uso de metadatos como `pendingPaymentProof` permite saltar entre estados y regresar al flujo original sin perder el hilo.
- **Consolidación de Persistencia:** Evitar tool-calls repetitivas a la base de datos consolidando la actualización de metadatos de sesión al final del procesamiento de intención.

## 🛠️ Calidad y Código
- **Limpieza de Duplicados:** Las refactorizaciones rápidas suelen dejar bloques de código idénticos. Las sesiones de "Spring Cleaning" deben ser una constante para mantener la base de código ágil.

## 📊 Observabilidad de IA
- **Operación Basada en Datos:** Implementar un seguimiento de tokens y latencia es vital para optimizar costos. La nueva entidad `AiMetric` permite auditar no solo el gasto, sino la calidad de las respuestas (success rate) por modelo.
- **Estandarización de Proveedores:** Usar una interfaz `usage` común para Gemini, NVIDIA y Ollama desacopla la lógica de negocio de las particularidades de cada API de IA.
- **Métricas No Bloqueantes:** El registro de métricas debe ser asíncrono para no afectar la experiencia del usuario final. "Medir sin penalizar" es el mantra de la observabilidad eficiente.
