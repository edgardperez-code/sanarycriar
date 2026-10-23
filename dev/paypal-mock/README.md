# PayPal simulado (solo desarrollo local)

Servidor que imita la API REST de PayPal que usa la plataforma (`apps/api/src/services/payments/providers/paypal.py`). **Nunca se despliega**: no mueve dinero y guarda todo en memoria (al reiniciar el contenedor se olvidan las órdenes).

Se levanta con el resto del entorno (`docker compose -f dev/docker-compose.yml up -d --build`) y queda en http://localhost:8099.

La API lo usa solo con `LEARNHOUSE_DEVELOPMENT_MODE=true`, mediante:
- `LEARNHOUSE_PAYPAL_API_BASE=http://paypal-mock:8099` (llamadas servidor a servidor dentro de Docker)
- `LEARNHOUSE_PAYPAL_WEB_BASE=http://localhost:8099` (la página de aprobación que abre el navegador)

## Configurar PayPal en el panel (credenciales de prueba)
Pagos → Configuración → PayPal: cualquier Client ID y Secret sirven (por ejemplo `mock-client` / `mock-secret`), entorno `sandbox`, **Webhook ID `WH-MOCK-SANARYCRIAR`** (debe coincidir con `MOCK_WEBHOOK_ID`). Un secreto igual a `invalid`, o un Client ID que empiece por `bad`, se rechaza (para probar el error de credenciales).

## Página de pago simulada
`/checkoutnow?token=<orden>` muestra:
- **Aprobar pago (simulado)**: aprueba y vuelve a la tienda (`return_url` con `token` y `PayerID`).
- **Cancelar**: vuelve a `cancel_url`.
- **Aprobar y cerrar sin volver**: aprueba y, en vez de volver, envía el webhook `CHECKOUT.ORDER.APPROVED` a `MOCK_WEBHOOK_URL` (la tienda captura sola).
- *Más casos de prueba*: captura pendiente (`PENDING`) o tarjeta rechazada (`INSTRUMENT_DECLINED`).

Tras cada captura el simulador envía también `PAYMENT.CAPTURE.COMPLETED` (o `PENDING`) por webhook, como PayPal.

## Ayudas para pruebas
- `GET /mock/webhooks`: últimas entregas de webhooks y la respuesta de la API.
- `POST /mock/webhooks/{event_id}/resend`: reenvía un evento con firma nueva (prueba de deduplicación).
- `POST /mock/captures/{capture_id}/complete`: una captura pendiente pasa a completada y se notifica.
- `POST /v2/payments/captures/{capture_id}/refund` (con token OAuth): reembolso total o parcial, con webhook `PAYMENT.CAPTURE.REFUNDED`.
- `/v1/notifications/verify-webhook-signature` responde `SUCCESS` solo para eventos firmados por este simulador.
