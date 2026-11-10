/**
 * Payment methods the platform's checkout offers right now:
 *   GET {apiBase}/payments/{orgId}/checkout/providers  (public)
 * Hilda turns methods on and off in the panel (Pago Móvil, bank transfer,
 * Zelle, Binance), so the site reads them instead of naming them. PayPal is
 * not offered; its label stays only in case the panel ever turns it on.
 *
 * Sanar y Criar: no imports and erasable-only TypeScript, so
 * `node --test scripts/test-payments.mjs` can import this file as is.
 */

/** What each method is called on the site, in the order it is listed. */
const METHOD_LABELS: ReadonlyArray<readonly [string, string]> = [
  ['pago_movil', 'Pago Móvil, en bolívares, a la tasa del día'],
  ['transferencia', 'Transferencia bancaria, en bolívares'],
  ['zelle', 'Zelle'],
  ['binance', 'Binance'],
  ['paypal', 'PayPal'],
];

/** Site labels of the methods in a providers answer; unknown or malformed entries are skipped. */
export function paymentLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const methods = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const list = (entry as { methods?: unknown }).methods;
    if (!Array.isArray(list)) continue;
    for (const method of list) if (typeof method === 'string') methods.add(method);
  }
  return METHOD_LABELS.filter(([id]) => methods.has(id)).map(([, label]) => label);
}

export function providersEndpoint(apiBase: string, orgId: number): string {
  return `${String(apiBase).replace(/\/+$/, '')}/payments/${encodeURIComponent(String(orgId))}/checkout/providers`;
}

/** The labels, or [] on any failure (network, CORS, timeout, bad JSON). */
export async function fetchPaymentLabels(opts: { apiBase: string; orgId: number; timeoutMs?: number }): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 6000);
  try {
    const response = await fetch(providersEndpoint(opts.apiBase, opts.orgId), {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) return [];
    return paymentLabels(await response.json());
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
