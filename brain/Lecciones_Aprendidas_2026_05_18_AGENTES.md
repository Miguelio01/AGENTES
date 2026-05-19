---
title: Lecciones Aprendidas - 18 de Mayo, 2026 - Proyecto AGENTES
date: 2026-05-18
tags:
  - lecciones-aprendidas
  - proyecto/agentes
  - arquitectura/a2a
  - seguridad
  - base-de-datos/mongodb
---

# 🧠 Lecciones Aprendidas - 18 de Mayo, 2026

## 🛡️ Seguridad y Gestión de Secretos
- **Filtros de Git:** Nunca se debe confiar en la memoria para no subir secretos. El archivo `.gitignore` debe ser la primera línea de defensa, bloqueando patrones como `*.json` (con excepciones controladas) y carpetas de borradores.
- **Rotación de Credenciales:** Ante una fuga (leaked secret), la única solución real es la **invalidación y rotación**. Borrar el archivo de Git no es suficiente si la llave sigue activa en el proveedor (Google/Telegram/MongoDB).
- **Entorno vs Código:** Los IDs de infraestructura (como IDs de Telegram de socios) deben vivir en el `.env`, no en el código. Esto protege la privacidad y permite cambios dinámicos.

## 🔄 Persistencia y Estado de Sesión
- **Esquemas Rígidos vs Flexibles:** En MongoDB/Mongoose, intentar guardar datos en campos no definidos en el esquema resulta en pérdida silenciosa de información. El uso de `Schema.Types.Mixed` para metadatos es ideal para agentes que manejan estados volátiles.
- **Dualidad de Identidad:** WhatsApp Business puede enviar LIDs técnicos o Números de Teléfono. Un sistema robusto debe ser capaz de "rescatar" la identidad real (Phone) y usarla como clave primaria para evitar sesiones duplicadas.

## 🛒 Lógica de Negocio e Idempotencia
- **Banderas de Estado:** Para evitar duplicar acciones costosas (como descontar stock), es mejor usar banderas de control (`registeredInPrepago: true`) que limpiar el carrito, ya que vaciar la memoria impide que procesos posteriores (como la aprobación de pago) tengan acceso a los detalles de la compra.
- **Recolección Masiva:** Pedir datos uno a uno genera fricción y aumenta el riesgo de que el cliente abandone el flujo. Una solicitud en bloque procesada por IA es mucho más eficiente y "humana".

## 🏗️ Flujo de Trabajo
- **Branching obligatorio:** Trabajar en ramas (`feat/`, `fix/`) garantiza que la rama `main` siempre sea un refugio seguro de código funcional.
- **Carpeta de Borradores:** Mantener una zona `.borradores/` fuera de Git permite experimentar con scripts rápidos sin contaminar la estructura del proyecto.

---
[[Daily_Log_2026_05_18_AGENTES|Ver Daily Log de hoy]]
