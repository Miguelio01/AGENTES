# Requerimientos Globales: Agencia de Agentes (Frescoh!)

Este documento mapea las capacidades actuales y las piezas faltantes de la "Agencia" siguiendo la metodología Kiro.

## 1. Módulo de Identidad y Conocimiento (Cerebro)
| Requerimiento | Estado | Notas |
| :--- | :--- | :--- |
| Clasificación de intenciones (GREETING, BUY, etc.) | ✅ Completo | Usa LLM local (Ollama). |
| RAG simple sobre Obsidian | ✅ Completo | Búsqueda por palabras clave en el vault. |
| **RAG Semántico (Vectores)** | ⏳ Pendiente | Necesario para consultas complejas sobre nutrición. |
| **Personalidad Fresquitoh (Voz)** | ✅ Completo | Implementado en VoiceAgent con trato "Sumercé". |

## 2. Módulo de Ventas e Inventario (Manos)
| Requerimiento | Estado | Notas |
| :--- | :--- | :--- |
| Sincronización bi-direccional Google Sheets | ✅ Completo | Lee 'Inventario ' y 'costos'. |
| Extracción de productos y cantidades | ✅ Completo | Mapea frases a IDs reales del Excel. |
| Conversión inteligente de empaques | ✅ Completo | Entiende que "1kg de fresa" = 2 cajas de 500g. |
| **Anotación automática de pedidos** | ✅ Completo | Registra en la nueva hoja `Lista_prepago`. |
| Liquidación total de la compra | ✅ Completo | Incluye sumatoria y confirmación. |

## 3. Módulo de Finanzas (Bóveda) - [SIGUIENTE GRAN PASO]
| Requerimiento | Estado | Notas |
| :--- | :--- | :--- |
| Escaneo de transferencias (Gmail/Nequi/Bancolombia) | 🛑 Faltante | Necesita leer correos de notificación de bancos. |
| Conciliación automática | 🛑 Faltante | Mapear valor y nombre del pagador con el pedido. |
| Notificación de pago recibido | 🛑 Faltante | Disparar evento para mover de `prepago` a `entrega`. |

## 4. Módulo de Logística y Entrega (Camino)
| Requerimiento | Estado | Notas |
| :--- | :--- | :--- |
| Registro en `Lista_entrega` | ✅ Completo | Ya tiene el adaptador listo. |
| **Rutas de despacho** | 🛑 Faltante | Agrupar pedidos por zonas geográficas. |
| **Actualización de estado al cliente** | 🛑 Faltante | Notificar "Su cosecha va en camino". |

## 5. Módulo de Soporte y Escalado (Oídos)
| Requerimiento | Estado | Notas |
| :--- | :--- | :--- |
| Cascada de escalamiento humana (Telegram) | ✅ Completo | Notifica a los socios en orden si la IA no sabe. |
| Comando `/atendido` | ✅ Completo | Detiene la cascada y cierra el caso. |

## 6. Módulo de Inteligencia de Negocio (Vista)
| Requerimiento | Estado | Notas |
| :--- | :--- | :--- |
| Atribución de fuente (wa.link, IG, etc.) | ✅ Completo | Registra el origen en el perfil del cliente. |
| **Dashboard de Monitoreo** | 🛑 Faltante | Interfaz visual para ver pedidos y estado emocional. |
| **Métrica de LTV y Retención** | 🛑 Faltante | Saber quiénes son los clientes "Pata Negra" recurrentes. |

---
## Conclusión de Gaps:
Además del **Finance Agent**, los vacíos críticos son:
1. **RAG Semántico:** Para que Fresquitoh sea un verdadero experto en los beneficios de los productos.
2. **Inteligencia Logística:** Automatizar la creación de rutas y estados de despacho.
3. **Dashboard:** Para que sumercé no dependa solo del log de la terminal para saber qué pasa.
