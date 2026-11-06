// Unit tests for src/lib/payments.ts (payment methods shown on the site).
// Run with `npm run test:payments` (Node 22.18+/24 strips the TypeScript types).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchPaymentLabels, paymentLabels, providersEndpoint } from '../src/lib/payments.ts';

test('paymentLabels lists the active methods in the site order', () => {
  const raw = [
    { provider: 'manual', methods: ['zelle', 'pago_movil', 'binance', 'transferencia'] },
    { provider: 'paypal', methods: ['paypal', 'card'] },
  ];
  assert.deepEqual(paymentLabels(raw), [
    'Pago Móvil, en bolívares, a la tasa del día',
    'Transferencia bancaria, en bolívares',
    'Zelle',
    'Binance',
    'PayPal',
  ]);
});

test('paymentLabels shows only what is turned on', () => {
  assert.deepEqual(paymentLabels([{ provider: 'manual', methods: ['pago_movil'] }]), ['Pago Móvil, en bolívares, a la tasa del día']);
});

test('paymentLabels skips anything unexpected', () => {
  assert.deepEqual(paymentLabels(null), []);
  assert.deepEqual(paymentLabels({}), []);
  assert.deepEqual(paymentLabels([null, 'x', { methods: 'zelle' }, { methods: [1, 'cripto', 'zelle'] }]), ['Zelle']);
});

test('providersEndpoint joins the API base without double slashes', () => {
  assert.equal(providersEndpoint('https://cursos.sanarycriarve.com/api/v1/', 1), 'https://cursos.sanarycriarve.com/api/v1/payments/1/checkout/providers');
});

test('fetchPaymentLabels returns [] on any failure', async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async () => new Response('nope', { status: 503 });
  assert.deepEqual(await fetchPaymentLabels({ apiBase: 'http://x/api/v1', orgId: 1 }), []);
  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };
  assert.deepEqual(await fetchPaymentLabels({ apiBase: 'http://x/api/v1', orgId: 1 }), []);
  globalThis.fetch = async () => new Response(JSON.stringify([{ methods: ['binance'] }]), { status: 200 });
  assert.deepEqual(await fetchPaymentLabels({ apiBase: 'http://x/api/v1', orgId: 1 }), ['Binance']);
});
