# Pago Móvil con Skylink Pay

Skylink Pay cobra en bolívares por Pago Móvil o débito inmediato y confirma el pago por su cuenta. El acceso llega solo, sin que Hilda confirme nada en Pedidos. Se basa en el kit probado con dinero real en todovendingca (`docs/kit-skylink-pago-movil` de ese proyecto).

## Cómo funciona aquí

- En el carrito (`cursos.sanarycriarve.com/store/cart`) aparece primero **«Pago Móvil (Skylink)»**. Al pulsar «Pagar con Skylink (Pago Móvil)»:
  1. La plataforma crea el pedido `SYC-XXXXXX` y congela el monto en Bs. con la tasa BCV que publica Skylink.
  2. Crea el cobro en Skylink y lleva a la compradora a la página de pago de Skylink.
- Al terminar, Skylink la devuelve a `/store/pago/resultado?token_ws=…`. Esa página abre su pedido, que se actualiza solo cada 4 segundos mientras espera.
- **Regla de oro:** un pedido solo queda pagado si Skylink, al consultarle, dice `authorized` y además coinciden el número de pedido y el monto exacto en Bs.
  - Ni la vuelta de la compradora ni el aviso de Skylink bastan: solo indican qué cobro hay que consultar.
  - Si el monto o el número no coinciden, el pedido queda **rechazado** con el aviso «no coincide» y en el log aparece `DESCUADRE` para revisarlo a mano.
- Quién consulta a Skylink:
  - la página del pedido mientras está pendiente;
  - el aviso (webhook);
  - un barrido cada 90 s sobre los pedidos de los últimos 3 días, que confirma un pago aunque llegue tarde o la compradora cierre la pestaña.
- Los métodos manuales (Pago Móvil a mano, transferencia, Zelle, Binance) siguen igual. Si Hilda quiere ofrecer solo Skylink, apaga el Pago Móvil manual en Pagos › Configuración.

## 1. Pedir a Skylink

Pide un **comercio propio para Sanar y Criar**: la URL de retorno es una sola por comercio, así que no se puede compartir con todovendingca.

En el panel de Skylink Pay → Configuración / Desarrolladores API:

| Campo del panel | Valor |
|---|---|
| URL de retorno | `https://cursos.sanarycriarve.com/store/pago/resultado` |
| URL de notificaciones | `https://cursos.sanarycriarve.com/api/v1/payments/skylink/aviso` |

Del mismo panel salen el **código de comercio** y la **API Key**. La API Key es secreta: nunca va en el repo, en un chat ni en un log.

## 2. Variables en Railway (servicio `plataforma`, NO en `sitio`)

| Variable | Valor |
|---|---|
| `SKYLINK_MODO` | vacío = apagado · `real` = API de verdad · `simulador` = solo en local |
| `SKYLINK_CODIGO_COMERCIO` | del panel |
| `SKYLINK_API_KEY` | del panel (secreta) |
| `SKYLINK_MONTO_PRUEBA_VES` | solo para la prueba con dinero real: `20` (de 1 a 30 Bs.) |
| `SKYLINK_PERMITIR_PRUEBAS` | `1` solo mientras dure esa prueba en producción |
| `SKYLINK_DURACION_MINUTOS` | opcional, de 5 a 60 (15 por defecto): cuánto vive el enlace de pago |
| `SKYLINK_BASE_URL` | opcional; por defecto `https://dev-axis-payment.valinkgroup.com` |

Al arrancar, el log de `plataforma` dice en qué modo está, sin mostrar valores. Por ejemplo: «Skylink Pay en producción: los pagos son reales».

Cómo se comporta en producción con cada combinación:
- Si falta una variable, Skylink no aparece en el carrito.
- Con `real` y `SKYLINK_MONTO_PRUEBA_VES=20` (más `SKYLINK_PERMITIR_PRUEBAS=1`):
  - cada pedido cobra Bs. 20 de verdad;
  - **solo lo ven las administradoras**;
  - el pedido se marca de prueba y no cuenta en las ventas.

## 3. Pasos para encenderlo

1. **Local (hecho):** `SKYLINK_MODO=simulador` en `dev/api.env`. Se probaron el pago aprobado, el aprobado con espera, el rechazado, el monto que no coincide y el aviso firmado. La entrega ocurre una sola vez.
2. **Prueba real de Bs. 20 en producción:**
   - Con las dos URLs ya puestas en el panel, configura `SKYLINK_MODO=real`, el código, la API Key, `SKYLINK_MONTO_PRUEBA_VES=20` y `SKYLINK_PERMITIR_PRUEBAS=1`.
   - Entra como administradora, compra con Pago Móvil y comprueba tres cosas:
     - el pedido queda pagado y marcado de prueba;
     - en el log aparece `Aviso de Skylink (transaction.authorized)`;
     - en el panel de Skylink aparece el `buyOrder` `SYC-…` correcto.
3. **Producción:** borra `SKYLINK_MONTO_PRUEBA_VES` y `SKYLINK_PERMITIR_PRUEBAS`. Desde ese momento los pagos son reales y el método aparece para todas las compradoras.

## Código

- API:
  - `services/payments/skylink.py`: el cliente, con la firma, el simulador y la tasa.
  - `services/payments/skylink_purchases.py`: los pedidos, la regla de oro, el aviso y el barrido.
  - Rutas en `routers/payments.py`: `/payments/skylink/aviso`, `/payments/skylink/simulador/{token}` y `/payments/{org}/purchases/skylink/{token}`.
  - Pruebas en `tests/payments/test_cart_skylink.py`.
- Web:
  - el botón en el carrito (`CartPage.tsx`);
  - la vuelta de Skylink (`SkylinkReturnPage.tsx`, ruta `store/pago/resultado`);
  - la espera en el pedido (`PurchasePage.tsx`).
- No hay columnas nuevas: el token, el monto congelado y el resultado van en `sc_pay_purchase.raw.skylink`. El token nunca sale en el log de accesos (se enmascara con `***`).
