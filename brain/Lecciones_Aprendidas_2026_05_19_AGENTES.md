---
title: Lecciones Aprendidas - 19 de Mayo, 2026 - Proyecto AGENTES
date: 2026-05-19
tags:
  - lecciones-aprendidas
  - proyecto/agentes
  - arquitectura/limpieza
  - baileys/metadata
  - logistica/fechas
---

# 🧠 Lecciones Aprendidas - 19 de Mayo, 2026

## 🏗️ Estructura y Orden (Refactorización)
- **Costo de la Velocidad:** El desarrollo rápido genera carpetas vacías y archivos sueltos. Una sesión de "Spring Cleaning" no solo es estética, es vital para evitar errores de importación y facilitar el onboarding de nuevos desarrolladores.
- **Pureza Hexagonal:** Mantener repositorios y adaptadores separados previene el acoplamiento. Un repositorio debe ser agnóstico del canal (WhatsApp/Telegram) y un adaptador debe ser agnóstico de la persistencia (MongoDB).

## 📡 Integración con WhatsApp (Baileys)
- **Identidades Ocultas:** No siempre el `remoteJid` es la mejor fuente de verdad. En cuentas Business o con LIDs, el número real suele estar en `remoteJidAlt` o `participant`.
- **Limpieza de IDs:** Baileys puede inyectar espacios invisibles en los JIDs. Siempre se debe aplicar un `.replace(/\s+/g, '')` antes de cualquier comparación o guardado en base de datos.

## 📅 Lógica de Negocio Dinámica
- **Entrega Basada en Stock:** La fecha de entrega no es estática. Integrar el stock actual en el cálculo de la fecha mejora la transparencia con el cliente y evita falsas expectativas.
- **Configuración en Caliente:** Usar una celda específica en Excel (`H1`) para sobreescribir la lógica automática permite al dueño del negocio reaccionar ante imprevistos sin tocar el código.

## 🛡️ DevOps y Base de Datos
- **Whitelist Dinámica:** Los errores de conexión de MongoDB Atlas suelen ser por cambios de IP. Mantener el panel abierto o usar rangos amplios en desarrollo ahorra tiempo de depuración.

---
[[Daily_Log_2026_05_19_AGENTES|Ver Daily Log de hoy]]
