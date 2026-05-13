---
title: Daily Log - 11 de Mayo, 2026 - Proyecto AGENTES
date: 2026-05-11
tags:
  - proyecto/agentes
  - diario
  - arquitectura/a2a
  - ia/agentes
---

# Daily Log - 11 de Mayo, 2026 - Proyecto AGENTES

## 📝 Resumen de la Jornada
Hoy se realizó una reestructuración profunda de la **Agencia de Agentes (A2A)** para profesionalizar la captura de datos, mejorar la veracidad de las respuestas y cerrar el ciclo de vida del pedido con Google Sheets. Se logró que el sistema no solo atienda, sino que entienda el contexto de negocio y marketing.

---

## ✅ Aciertos y Logros (Éxitos)

> [!success] Identificación Infalible
> - **Rescate de Identidad:** Se solucionó el problema de los LIDs de WhatsApp. Ahora el sistema extrae el número de teléfono real desde `remoteJidAlt`, garantizando que el `clientId` en la base de datos sea siempre el celular del cliente.
> - **Perfil Pata Negra:** Se expandió la entidad `Client` para capturar en un solo registro: Nombre real, Cédula, Dirección, Ciudad y Email.

> [!tip] Marketing y Ventas
> - **Atribución de Canales:** Implementación de detección de origen. Si el cliente viene de `wa.link`, se marca automáticamente como `LINK_PAGE`.
> - **Cosecha Dinámica:** Fresquitoh ahora saluda con la lista **real** de productos del Excel (rango A2:C500), eliminando cualquier invento de la IA.
> - **Trato Personalizado:** Detección de género (Don/Doña) basada en el nombre del perfil.

> [!note] Operación A2A
> - **Escalamiento Inteligente:** El comando `/atendido` ahora reconoce quién responde en Telegram y avisa a los demás socios, deteniendo la cascada de inmediato.
> - **Memoria Corta:** Las sesiones ahora duran 30 minutos y, al reiniciar, recuperan los últimos 3 mensajes para no perder el hilo del pedido.

---

## ⚠️ Lecciones Aprendidas (Por Mejorar)

> [!bug] Fragilidad del JSON
> - La extracción de productos desde lenguaje natural (LLM) es sensible a mensajes largos o con muchos saludos. Se implementaron fallbacks, pero se requiere un prompt de extracción aún más "agresivo" o un pre-procesador de texto.

> [!danger] Alucinaciones de Categoría
> - La IA tiende a "rellenar" vacíos con categorías lógicas (frutas, verduras, lácteos). Se aplicaron reglas de honestidad estrictas, pero el monitoreo debe ser constante.

> [!warning] Ciclo de Construcción
> - Al trabajar con un monorepo, los cambios en `@agentes/domain` requieren un build manual antes de que el `gateway` los reconozca. Debemos automatizar este paso en el entorno de desarrollo.

---

## 🚀 Próximos Pasos (Mañana)

1. **Finance Agent:** Crear el agente especialista en validación de transferencias y conciliación bancaria.
2. **Refinamiento de Pesos:** Ajustar la lógica de conversión en el `InventoryAgent` para que el "Total" en la lista de prepago sea milimétrico.
3. **Dashboard de Marketing:** Usar el nuevo campo `registrationSource` para mostrar el conteo de clientes por canal.

---
**Estado del Sistema:** 92% MVP Completo.
**Ánimo de J.A.R.V.I.S.:** Optimista. El campesino ahora es un empresario organizado.
