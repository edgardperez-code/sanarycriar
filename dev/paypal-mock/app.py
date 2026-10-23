"""PayPal REST mock for LOCAL development of Sanar y Criar. Never deploy it.

Implements just what the LearnHouse payments module calls:

- POST /v1/oauth2/token                       client-credentials token (+ app_id)
- POST /v2/checkout/orders                    create (PayPal-Request-Id idempotent)
- GET  /v2/checkout/orders/{id}
- POST /v2/checkout/orders/{id}/capture       (PayPal-Request-Id idempotent)
- GET  /v2/payments/captures/{id}
- POST /v2/payments/captures/{id}/refund      full or partial refund (+ webhook)
- POST /v1/notifications/verify-webhook-signature
                                              SUCCESS only for events this mock signed
- GET  /checkoutnow?token=                    buyer approval page (Spanish)

Buyer page actions: approve (redirect to return_url with token & PayerID),
cancel (redirect to cancel_url), and "approve and close" (no redirect; a
CHECKOUT.ORDER.APPROVED webhook is POSTed to MOCK_WEBHOOK_URL instead).

State lives in memory: restarting the container forgets every order.
"""

import asyncio
import base64
import hashlib
import hmac
import html
import json
import logging
import os
import secrets
import string
import uuid
import zlib
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Optional
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import httpx
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from starlette.routing import Route

logging.basicConfig(level=logging.INFO, format="%(asctime)s paypal-mock %(levelname)s %(message)s")
log = logging.getLogger("paypal-mock")

WEB_BASE = os.environ.get("MOCK_WEB_BASE", "http://localhost:8099").rstrip("/")
API_BASE = os.environ.get("MOCK_API_BASE", "http://paypal-mock:8099").rstrip("/")
WEBHOOK_URL = os.environ.get("MOCK_WEBHOOK_URL", "").strip()
WEBHOOK_ID = os.environ.get("MOCK_WEBHOOK_ID", "WH-MOCK-SANARYCRIAR").strip()
WEBHOOK_DELAY = float(os.environ.get("MOCK_WEBHOOK_DELAY_SECONDS", "1.5"))
SEND_CAPTURE_WEBHOOKS = os.environ.get("MOCK_SEND_CAPTURE_WEBHOOKS", "1").lower() not in ("0", "false", "no")
# Credentials whose secret is this value (or whose client id starts with
# "bad") are rejected, to exercise the "invalid credentials" path.
REJECTED_SECRET = "invalid"
_SIGNING_KEY = secrets.token_bytes(32)

TOKENS: dict[str, str] = {}                  # access_token -> client_id
ORDERS: dict[str, dict] = {}                 # order id -> order
CREATE_KEYS: dict[tuple, str] = {}           # (client_id, request id) -> order id
CAPTURE_KEYS: dict[tuple, dict] = {}         # (order id, request id) -> capture response
CAPTURES: dict[str, dict] = {}               # capture id -> (order id, capture)
SIGNED: dict[str, dict] = {}                 # transmission id -> {sig, webhook_id, event}
DELIVERIES: list[dict] = []                  # webhook delivery log (newest last)
EVENTS: dict[str, dict] = {}                 # event id -> event


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _pp_id(length: int = 17) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _error(status: int, name: str, issue: Optional[str] = None, message: str = "") -> JSONResponse:
    body: dict[str, Any] = {"name": name, "message": message or name, "debug_id": _pp_id(13).lower()}
    if issue:
        body["details"] = [{"issue": issue, "description": message or issue}]
    return JSONResponse(body, status_code=status)


def _bearer(request: Request) -> Optional[str]:
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        return None
    client_id = TOKENS.get(header[7:].strip())
    return client_id


def _unauthorized() -> JSONResponse:
    return JSONResponse(
        {"error": "invalid_token", "error_description": "Token signature verification failed"},
        status_code=401,
    )


def _with_query(url: str, **params: str) -> str:
    parsed = urlparse(url)
    query = parse_qsl(parsed.query, keep_blank_values=True) + list(params.items())
    return urlunparse(parsed._replace(query=urlencode(query)))


def _order_view(order: dict, representation: bool = True) -> dict:
    links = [
        {"href": f"{API_BASE}/v2/checkout/orders/{order['id']}", "rel": "self", "method": "GET"},
    ]
    if order["status"] in ("CREATED", "PAYER_ACTION_REQUIRED"):
        links.append({
            "href": f"{WEB_BASE}/checkoutnow?token={order['id']}",
            "rel": "payer-action",
            "method": "GET",
        })
    if order["status"] == "APPROVED":
        links.append({
            "href": f"{API_BASE}/v2/checkout/orders/{order['id']}/capture",
            "rel": "capture",
            "method": "POST",
        })
    view: dict[str, Any] = {"id": order["id"], "status": order["status"], "links": links}
    if not representation:
        return view
    view.update({
        "intent": order["intent"],
        "create_time": order["create_time"],
        "update_time": order["update_time"],
        "payment_source": {"paypal": order.get("payer_source") or {}},
        "purchase_units": order["purchase_units"],
    })
    if order.get("payer"):
        view["payer"] = order["payer"]
    return view


def _wants_representation(request: Request) -> bool:
    return "return=representation" in request.headers.get("prefer", "").lower()


# ----------------------------------------------------------------- OAuth


async def oauth_token(request: Request) -> Response:
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("basic "):
        return JSONResponse({"error": "invalid_client", "error_description": "Client Authentication failed"}, 401)
    try:
        client_id, _, secret = base64.b64decode(header[6:].strip()).decode().partition(":")
    except Exception:
        return JSONResponse({"error": "invalid_client", "error_description": "Client Authentication failed"}, 401)
    body = (await request.body()).decode()
    if "grant_type=client_credentials" not in body:
        return JSONResponse({"error": "unsupported_grant_type"}, 400)
    if not client_id or not secret or secret == REJECTED_SECRET or client_id.startswith("bad"):
        return JSONResponse({"error": "invalid_client", "error_description": "Client Authentication failed"}, 401)
    token = "A21AA" + secrets.token_urlsafe(48)
    TOKENS[token] = client_id
    app_id = "APP-MOCK" + hashlib.sha256(client_id.encode()).hexdigest()[:10].upper()
    return JSONResponse({
        "scope": "https://uri.paypal.com/services/payments/payment https://uri.paypal.com/services/checkout/one-click-with-merchant-issued-token",
        "access_token": token,
        "token_type": "Bearer",
        "app_id": app_id,
        "expires_in": 32400,
        "nonce": f"{_now()}{secrets.token_hex(8)}",
    })


# ---------------------------------------------------------------- Orders


async def create_order(request: Request) -> Response:
    client_id = _bearer(request)
    if client_id is None:
        return _unauthorized()
    request_id = request.headers.get("paypal-request-id")
    if request_id and (client_id, request_id) in CREATE_KEYS:
        order = ORDERS[CREATE_KEYS[(client_id, request_id)]]
        return JSONResponse(_order_view(order, _wants_representation(request)), status_code=200)
    try:
        body = json.loads(await request.body() or b"{}")
    except ValueError:
        return _error(400, "INVALID_REQUEST", "MALFORMED_REQUEST_JSON")
    if body.get("intent") != "CAPTURE":
        return _error(422, "UNPROCESSABLE_ENTITY", "UNSUPPORTED_INTENT", "Only intent CAPTURE is mocked")
    units = body.get("purchase_units") or []
    if len(units) != 1:
        return _error(400, "INVALID_REQUEST", "INVALID_PARAMETER_VALUE", "Exactly one purchase unit is mocked")
    unit = dict(units[0])
    amount = unit.get("amount") or {}
    try:
        value = Decimal(str(amount.get("value")))
    except (InvalidOperation, TypeError):
        return _error(400, "INVALID_REQUEST", "INVALID_PARAMETER_VALUE", "amount.value")
    if value <= 0 or not amount.get("currency_code"):
        return _error(400, "INVALID_REQUEST", "INVALID_PARAMETER_VALUE", "amount")
    context = ((body.get("payment_source") or {}).get("paypal") or {}).get("experience_context") or {}
    if not context.get("return_url") or not context.get("cancel_url"):
        return _error(400, "INVALID_REQUEST", "MISSING_REQUIRED_PARAMETER", "return_url/cancel_url")
    order_id = _pp_id()
    unit.setdefault("reference_id", "default")
    unit["payee"] = {"email_address": "vendedora@sanarycriar.mock", "merchant_id": "MOCKMERCHANT01"}
    now = _now()
    ORDERS[order_id] = {
        "id": order_id,
        "client_id": client_id,
        "intent": "CAPTURE",
        "status": "PAYER_ACTION_REQUIRED",
        "purchase_units": [unit],
        "context": context,
        "create_time": now,
        "update_time": now,
        "capture_outcome": "COMPLETED",
    }
    if request_id:
        CREATE_KEYS[(client_id, request_id)] = order_id
    log.info("order %s created: %s %s (%s)", order_id, amount.get("value"), amount.get("currency_code"),
             unit.get("custom_id"))
    return JSONResponse(_order_view(ORDERS[order_id], _wants_representation(request)), status_code=201)


async def get_order(request: Request) -> Response:
    if _bearer(request) is None:
        return _unauthorized()
    order = ORDERS.get(request.path_params["order_id"])
    if order is None:
        return _error(404, "RESOURCE_NOT_FOUND", "INVALID_RESOURCE_ID", "Specified resource ID does not exist.")
    return JSONResponse(_order_view(order))


def _new_capture(order: dict, outcome: str) -> dict:
    unit = order["purchase_units"][0]
    amount = dict(unit["amount"])
    amount.pop("breakdown", None)
    capture_id = _pp_id()
    now = _now()
    capture: dict[str, Any] = {
        "id": capture_id,
        "status": outcome,
        "amount": amount,
        "final_capture": True,
        "custom_id": unit.get("custom_id"),
        "invoice_id": unit.get("invoice_id"),
        "seller_protection": {"status": "ELIGIBLE", "dispute_categories": ["ITEM_NOT_RECEIVED", "UNAUTHORIZED_TRANSACTION"]},
        "create_time": now,
        "update_time": now,
        "supplementary_data": {"related_ids": {"order_id": order["id"]}},
        "links": [
            {"href": f"{API_BASE}/v2/payments/captures/{capture_id}", "rel": "self", "method": "GET"},
            {"href": f"{API_BASE}/v2/payments/captures/{capture_id}/refund", "rel": "refund", "method": "POST"},
            {"href": f"{API_BASE}/v2/checkout/orders/{order['id']}", "rel": "up", "method": "GET"},
        ],
    }
    if outcome == "PENDING":
        capture["status_details"] = {"reason": "PENDING_REVIEW"}
    else:
        fee = (Decimal(amount["value"]) * Decimal("0.054") + Decimal("0.30")).quantize(Decimal("0.01"))
        capture["seller_receivable_breakdown"] = {
            "gross_amount": amount,
            "paypal_fee": {"currency_code": amount["currency_code"], "value": str(fee)},
            "net_amount": {"currency_code": amount["currency_code"],
                           "value": str(Decimal(amount["value"]) - fee)},
        }
    CAPTURES[capture_id] = {"order_id": order["id"], "capture": capture, "refunded": Decimal("0")}
    return capture


async def capture_order(request: Request) -> Response:
    if _bearer(request) is None:
        return _unauthorized()
    order = ORDERS.get(request.path_params["order_id"])
    if order is None:
        return _error(404, "RESOURCE_NOT_FOUND", "INVALID_RESOURCE_ID", "Specified resource ID does not exist.")
    request_id = request.headers.get("paypal-request-id")
    if request_id and (order["id"], request_id) in CAPTURE_KEYS:
        log.info("capture of %s replayed (idempotent key)", order["id"])
        return JSONResponse(CAPTURE_KEYS[(order["id"], request_id)], status_code=200)

    mock_response = request.headers.get("paypal-mock-response", "")
    if "INSTRUMENT_DECLINED" in mock_response or order.get("capture_outcome") == "INSTRUMENT_DECLINED":
        if order.get("capture_outcome") == "INSTRUMENT_DECLINED":
            # Declined once; the buyer has to approve again with another card.
            order["capture_outcome"] = "COMPLETED"
            order["status"] = "PAYER_ACTION_REQUIRED"
        return _error(422, "UNPROCESSABLE_ENTITY", "INSTRUMENT_DECLINED",
                      "The instrument presented was either declined by the processor or bank, or it can't be used for this payment.")
    if order["status"] == "COMPLETED":
        return _error(422, "UNPROCESSABLE_ENTITY", "ORDER_ALREADY_CAPTURED",
                      "Order already captured.If 'intent=CAPTURE' only one capture per order is allowed.")
    if order["status"] != "APPROVED":
        return _error(422, "UNPROCESSABLE_ENTITY", "ORDER_NOT_APPROVED",
                      "Payer has not yet approved the Order for payment.")

    outcome = order.get("capture_outcome") or "COMPLETED"
    capture = _new_capture(order, outcome)
    order["status"] = "COMPLETED"
    order["update_time"] = _now()
    order["purchase_units"][0]["payments"] = {"captures": [capture]}
    response = _order_view(order)
    if request_id:
        CAPTURE_KEYS[(order["id"], request_id)] = response
    log.info("order %s captured: capture %s %s", order["id"], capture["id"], outcome)
    if SEND_CAPTURE_WEBHOOKS:
        event_type = "PAYMENT.CAPTURE.COMPLETED" if outcome == "COMPLETED" else "PAYMENT.CAPTURE.PENDING"
        _schedule_webhook(event_type, "capture", capture)
    return JSONResponse(response, status_code=201)


async def get_capture(request: Request) -> Response:
    if _bearer(request) is None:
        return _unauthorized()
    entry = CAPTURES.get(request.path_params["capture_id"])
    if entry is None:
        return _error(404, "RESOURCE_NOT_FOUND", "INVALID_RESOURCE_ID", "Specified resource ID does not exist.")
    return JSONResponse(entry["capture"])


async def refund_capture(request: Request) -> Response:
    if _bearer(request) is None:
        return _unauthorized()
    entry = CAPTURES.get(request.path_params["capture_id"])
    if entry is None:
        return _error(404, "RESOURCE_NOT_FOUND", "INVALID_RESOURCE_ID", "Specified resource ID does not exist.")
    capture = entry["capture"]
    total = Decimal(capture["amount"]["value"])
    try:
        body = json.loads(await request.body() or b"{}")
    except ValueError:
        body = {}
    requested = (body.get("amount") or {}).get("value")
    amount = Decimal(str(requested)) if requested else total - entry["refunded"]
    if amount <= 0 or entry["refunded"] + amount > total:
        return _error(422, "UNPROCESSABLE_ENTITY", "REFUND_AMOUNT_EXCEEDED", "The refund amount must be less than or equal to the capture amount that has not yet been refunded.")
    entry["refunded"] += amount
    capture["status"] = "REFUNDED" if entry["refunded"] >= total else "PARTIALLY_REFUNDED"
    capture["update_time"] = _now()
    refund_id = _pp_id()
    refund = {
        "id": refund_id,
        "status": "COMPLETED",
        "amount": {"currency_code": capture["amount"]["currency_code"], "value": str(amount)},
        "invoice_id": capture.get("invoice_id"),
        "custom_id": capture.get("custom_id"),
        "create_time": _now(),
        "update_time": _now(),
        "links": [
            {"href": f"{API_BASE}/v2/payments/refunds/{refund_id}", "rel": "self", "method": "GET"},
            {"href": f"{API_BASE}/v2/payments/captures/{capture['id']}", "rel": "up", "method": "GET"},
        ],
    }
    log.info("capture %s refunded %s (now %s)", capture["id"], amount, capture["status"])
    _schedule_webhook("PAYMENT.CAPTURE.REFUNDED", "refund", refund)
    return JSONResponse(refund, status_code=201)


# -------------------------------------------------------------- Webhooks


def _sign(transmission_id: str, transmission_time: str, webhook_id: str, body: bytes) -> str:
    message = f"{transmission_id}|{transmission_time}|{webhook_id}|{zlib.crc32(body)}".encode()
    return base64.b64encode(hmac.new(_SIGNING_KEY, message, hashlib.sha256).digest()).decode()


def _build_event(event_type: str, resource_type: str, resource: dict) -> dict:
    summaries = {
        "CHECKOUT.ORDER.APPROVED": "An order has been approved by buyer",
        "PAYMENT.CAPTURE.COMPLETED": "Payment completed",
        "PAYMENT.CAPTURE.PENDING": "Payment pending",
        "PAYMENT.CAPTURE.REFUNDED": "A capture payment was refunded",
    }
    event_id = f"WH-{_pp_id(17)}-{_pp_id(17)}"
    return {
        "id": event_id,
        "event_version": "1.0",
        "create_time": _now(),
        "resource_type": resource_type,
        "resource_version": "2.0",
        "event_type": event_type,
        "summary": summaries.get(event_type, event_type),
        "resource": resource,
        "links": [
            {"href": f"{API_BASE}/v1/notifications/webhooks-events/{event_id}", "rel": "self", "method": "GET"},
        ],
    }


async def _deliver(event: dict) -> dict:
    """Sign and POST ``event`` to MOCK_WEBHOOK_URL (one attempt)."""
    body = json.dumps(event, separators=(",", ":")).encode()
    transmission_id = str(uuid.uuid4())
    transmission_time = _now()
    signature = _sign(transmission_id, transmission_time, WEBHOOK_ID, body)
    SIGNED[transmission_id] = {"sig": signature, "webhook_id": WEBHOOK_ID, "event": event}
    record = {
        "event_id": event["id"],
        "event_type": event["event_type"],
        "transmission_id": transmission_id,
        "url": WEBHOOK_URL,
        "time": transmission_time,
    }
    if not WEBHOOK_URL:
        record["result"] = "skipped (MOCK_WEBHOOK_URL not set)"
        DELIVERIES.append(record)
        return record
    headers = {
        "Content-Type": "application/json",
        "PAYPAL-AUTH-ALGO": "SHA256withRSA",
        "PAYPAL-CERT-URL": f"{WEB_BASE}/v1/notifications/certs/CERT-MOCK",
        "PAYPAL-TRANSMISSION-ID": transmission_id,
        "PAYPAL-TRANSMISSION-SIG": signature,
        "PAYPAL-TRANSMISSION-TIME": transmission_time,
        "User-Agent": "PayPal/AUHD-214.0-58434744",
    }
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(WEBHOOK_URL, content=body, headers=headers)
        record["status_code"] = response.status_code
        record["response"] = response.text[:500]
    except httpx.HTTPError as exc:
        record["error"] = str(exc)
    log.info("webhook %s %s -> %s", event["event_type"], event["id"], record.get("status_code", record.get("error")))
    DELIVERIES.append(record)
    del DELIVERIES[:-200]
    return record


def _schedule_webhook(event_type: str, resource_type: str, resource: dict, delay: Optional[float] = None) -> dict:
    event = _build_event(event_type, resource_type, json.loads(json.dumps(resource)))
    EVENTS[event["id"]] = event

    async def runner():
        await asyncio.sleep(WEBHOOK_DELAY if delay is None else delay)
        await _deliver(event)

    asyncio.get_running_loop().create_task(runner())
    return event


async def verify_webhook_signature(request: Request) -> Response:
    if _bearer(request) is None:
        return _unauthorized()
    try:
        body = json.loads(await request.body())
    except ValueError:
        return _error(400, "INVALID_REQUEST", "MALFORMED_REQUEST_JSON")
    required = ("auth_algo", "cert_url", "transmission_id", "transmission_sig", "transmission_time",
                "webhook_id", "webhook_event")
    if any(not body.get(k) for k in required):
        return _error(400, "VALIDATION_ERROR", "MISSING_REQUIRED_PARAMETER", "Invalid data provided")
    signed = SIGNED.get(body["transmission_id"])
    ok = (
        signed is not None
        and hmac.compare_digest(signed["sig"], str(body["transmission_sig"]))
        and signed["webhook_id"] == body["webhook_id"]
        and signed["event"] == body["webhook_event"]
    )
    return JSONResponse({"verification_status": "SUCCESS" if ok else "FAILURE"})


# ------------------------------------------------------------ Buyer page


_PAGE = """<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PayPal simulado · Sanar y Criar</title>
<style>
 body{{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f7fa;color:#1c1c28;margin:0;padding:24px 16px}}
 main{{max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,.08)}}
 .warn{{background:#fff4ce;border:1px solid #f0d36b;border-radius:10px;padding:10px 12px;font-size:14px;margin-bottom:20px}}
 h1{{font-size:22px;margin:0 0 4px}} .muted{{color:#5b6170;font-size:14px}}
 .amount{{font-size:32px;font-weight:700;margin:18px 0}}
 form{{margin:0}} button{{width:100%;border:0;border-radius:999px;padding:14px 18px;font-size:16px;font-weight:600;cursor:pointer;margin-top:12px}}
 .primary{{background:#0070ba;color:#fff}} .secondary{{background:#eef1f6;color:#1c1c28}} .ghost{{background:#fff;border:1px solid #c9ced8;color:#1c1c28}}
 details{{margin-top:22px;font-size:14px}} code{{font-size:13px}}
</style></head>
<body><main>
<div class="warn">Esto es un <strong>PayPal simulado</strong> para pruebas locales. No se mueve dinero real.</div>
<h1>{title}</h1>
<p class="muted">{description}</p>
<p class="amount">{amount}</p>
<p class="muted">Orden <code>{order_id}</code> · Estado: {status}</p>
{actions}
</main></body></html>"""


def _page(order: Optional[dict], message: Optional[str] = None, status_code: int = 200) -> HTMLResponse:
    if order is None:
        body = _PAGE.format(title="Orden no encontrada", description=html.escape(message or ""), amount="",
                            order_id="-", status="-", actions="")
        return HTMLResponse(body, status_code=404)
    unit = order["purchase_units"][0]
    amount = unit.get("amount") or {}
    card = order["context"].get("landing_page") == "GUEST_CHECKOUT"
    title = "Pagar con tarjeta (simulado)" if card else "Pagar con PayPal (simulado)"
    token = html.escape(order["id"])
    if message:
        actions = f"<p>{html.escape(message)}</p>"
    elif order["status"] in ("PAYER_ACTION_REQUIRED", "CREATED"):
        actions = f"""
<form method="post" action="/checkoutnow/approve?token={token}"><button class="primary" type="submit">Aprobar pago (simulado)</button></form>
<form method="post" action="/checkoutnow/cancel?token={token}"><button class="secondary" type="submit">Cancelar</button></form>
<form method="post" action="/checkoutnow/approve-close?token={token}"><button class="ghost" type="submit">Aprobar y cerrar sin volver</button></form>
<details><summary>Más casos de prueba</summary>
<form method="post" action="/checkoutnow/approve?token={token}&amp;outcome=PENDING"><button class="ghost" type="submit">Aprobar, pero la captura queda pendiente</button></form>
<form method="post" action="/checkoutnow/approve?token={token}&amp;outcome=INSTRUMENT_DECLINED"><button class="ghost" type="submit">Aprobar, pero la tarjeta será rechazada</button></form>
</details>"""
    else:
        actions = "<p>Esta orden ya no espera tu aprobación. Puedes cerrar esta pestaña.</p>"
    body = _PAGE.format(
        title=title,
        description=html.escape(unit.get("description") or "Compra en Sanar y Criar"),
        amount=html.escape(f"{amount.get('value', '?')} {amount.get('currency_code', '')}"),
        order_id=token,
        status=html.escape(order["status"]),
        actions=actions,
    )
    return HTMLResponse(body, status_code=status_code)


def _order_from_query(request: Request) -> Optional[dict]:
    return ORDERS.get(request.query_params.get("token", ""))


async def checkout_page(request: Request) -> Response:
    order = _order_from_query(request)
    return _page(order, None if order else "El enlace de pago no es válido o expiró.")


def _approve(order: dict, outcome: str = "COMPLETED") -> str:
    payer_id = order.get("payer", {}).get("payer_id") or ("MOCK" + _pp_id(9))
    order["status"] = "APPROVED"
    order["update_time"] = _now()
    order["capture_outcome"] = outcome if outcome in ("COMPLETED", "PENDING", "INSTRUMENT_DECLINED") else "COMPLETED"
    order["payer"] = {
        "payer_id": payer_id,
        "email_address": "compradora@example.com",
        "name": {"given_name": "Compradora", "surname": "De Prueba"},
        "address": {"country_code": "VE"},
    }
    order["payer_source"] = {"email_address": "compradora@example.com", "account_id": payer_id}
    return payer_id


async def checkout_approve(request: Request) -> Response:
    order = _order_from_query(request)
    if order is None:
        return _page(None, "El enlace de pago no es válido o expiró.")
    if order["status"] not in ("PAYER_ACTION_REQUIRED", "CREATED", "APPROVED"):
        return _page(order)
    payer_id = _approve(order, request.query_params.get("outcome", "COMPLETED").upper())
    log.info("order %s approved by buyer (%s)", order["id"], order["capture_outcome"])
    target = _with_query(order["context"]["return_url"], token=order["id"], PayerID=payer_id)
    return RedirectResponse(target, status_code=303)


async def checkout_cancel(request: Request) -> Response:
    order = _order_from_query(request)
    if order is None:
        return _page(None, "El enlace de pago no es válido o expiró.")
    log.info("order %s cancelled by buyer", order["id"])
    return RedirectResponse(_with_query(order["context"]["cancel_url"], token=order["id"]), status_code=303)


async def checkout_approve_close(request: Request) -> Response:
    order = _order_from_query(request)
    if order is None:
        return _page(None, "El enlace de pago no es válido o expiró.")
    if order["status"] not in ("PAYER_ACTION_REQUIRED", "CREATED", "APPROVED"):
        return _page(order)
    _approve(order, request.query_params.get("outcome", "COMPLETED").upper())
    event = _schedule_webhook("CHECKOUT.ORDER.APPROVED", "checkout-order", _order_view(order))
    log.info("order %s approved, tab closed; webhook %s queued", order["id"], event["id"])
    return _page(order, "Pago aprobado. Cerraste sin volver a la tienda: la tienda recibirá el aviso "
                        "por webhook en unos segundos. Ya puedes cerrar esta pestaña.")


# ----------------------------------------------------------- Mock helpers


async def index(request: Request) -> Response:
    return JSONResponse({
        "service": "paypal-mock (Sanar y Criar, solo desarrollo local)",
        "web_base": WEB_BASE,
        "webhook_url": WEBHOOK_URL or None,
        "webhook_id": WEBHOOK_ID,
        "orders": len(ORDERS),
    })


async def list_deliveries(request: Request) -> Response:
    return JSONResponse({"deliveries": DELIVERIES[-50:]})


async def resend_event(request: Request) -> Response:
    """Deliver an event again with a fresh signature (tests webhook dedupe)."""
    event = EVENTS.get(request.path_params["event_id"])
    if event is None:
        return _error(404, "RESOURCE_NOT_FOUND", "INVALID_RESOURCE_ID", "Unknown event")
    record = await _deliver(event)
    return JSONResponse(record)


async def complete_pending_capture(request: Request) -> Response:
    """Turn a PENDING capture into COMPLETED and notify (like PayPal after a review)."""
    entry = CAPTURES.get(request.path_params["capture_id"])
    if entry is None:
        return _error(404, "RESOURCE_NOT_FOUND", "INVALID_RESOURCE_ID", "Unknown capture")
    capture = entry["capture"]
    if capture["status"] != "PENDING":
        return _error(422, "UNPROCESSABLE_ENTITY", "CAPTURE_NOT_PENDING", f"Capture is {capture['status']}")
    capture["status"] = "COMPLETED"
    capture.pop("status_details", None)
    capture["update_time"] = _now()
    event = _schedule_webhook("PAYMENT.CAPTURE.COMPLETED", "capture", capture, delay=0)
    return JSONResponse({"capture_id": capture["id"], "status": "COMPLETED", "event_id": event["id"]})


async def health(request: Request) -> Response:
    return JSONResponse({"status": "ok"})


routes = [
    Route("/", index),
    Route("/health", health),
    Route("/v1/oauth2/token", oauth_token, methods=["POST"]),
    Route("/v2/checkout/orders", create_order, methods=["POST"]),
    Route("/v2/checkout/orders/{order_id}", get_order, methods=["GET"]),
    Route("/v2/checkout/orders/{order_id}/capture", capture_order, methods=["POST"]),
    Route("/v2/payments/captures/{capture_id}", get_capture, methods=["GET"]),
    Route("/v2/payments/captures/{capture_id}/refund", refund_capture, methods=["POST"]),
    Route("/v1/notifications/verify-webhook-signature", verify_webhook_signature, methods=["POST"]),
    Route("/checkoutnow", checkout_page, methods=["GET"]),
    Route("/checkoutnow/approve", checkout_approve, methods=["GET", "POST"]),
    Route("/checkoutnow/cancel", checkout_cancel, methods=["GET", "POST"]),
    Route("/checkoutnow/approve-close", checkout_approve_close, methods=["GET", "POST"]),
    Route("/mock/webhooks", list_deliveries, methods=["GET"]),
    Route("/mock/webhooks/{event_id}/resend", resend_event, methods=["POST"]),
    Route("/mock/captures/{capture_id}/complete", complete_pending_capture, methods=["POST"]),
]

app = Starlette(routes=routes)
