/**
 * Live price and payment methods of «Límites sin culpa» (Home block and the
 * /limites-sin-culpa landing page). The HTML carries the build-time price and
 * a static list of methods; this refreshes both from the platform so a change
 * in the panel shows without rebuilding the site. Elements:
 *   [data-precio]         the formatted price (shown once known)
 *   [data-precio-bloque]  a block hidden until the price is known
 *   [data-precio-cta]     button text "<data-label> · <price>"
 *   [data-formas-pago]    <ul> whose <li> chips become the active methods
 */
import { fetchCatalog } from '@/lib/catalog';
import { fetchPaymentLabels } from '@/lib/payments';
import { site } from '@/site.config';

export function refreshEbookPriceAndPayments(): void {
  // Payment chips: the methods Hilda has turned on in the panel. The HTML
  // keeps a safe fallback (Pago Móvil) when the platform doesn't answer.
  fetchPaymentLabels({ apiBase: site.platform.apiBase, orgId: site.platform.orgId }).then((labels) => {
    if (!labels.length) return;
    document.querySelectorAll<HTMLUListElement>('[data-formas-pago]').forEach((list) => {
      const template = list.querySelector('li');
      if (!template) return;
      list.replaceChildren(
        ...labels.map((label) => {
          const chip = template.cloneNode(false) as HTMLLIElement;
          chip.textContent = label;
          return chip;
        }),
      );
    });
  });

  // The HTML carries the build-time price; refresh it from the platform so a
  // change in the panel shows without rebuilding the site.
  fetchCatalog({
    apiBase: site.platform.apiBase,
    orgId: site.platform.orgId,
    offerUrl: site.platform.offerUrl,
    courseUrl: site.platform.courseUrl,
  }).then((catalog) => {
    if (catalog.status !== 'ok') return;
    const offer = [...catalog.ebooks, ...catalog.courses].find((item) => item.offerUuid === site.funnel.featuredOfferUuid);
    const price = offer?.price ?? '';
    if (!price) return;
    document.querySelectorAll<HTMLElement>('[data-precio]').forEach((el) => {
      el.textContent = price;
      el.hidden = false;
    });
    document.querySelectorAll<HTMLElement>('[data-precio-bloque]').forEach((el) => {
      el.hidden = false;
    });
    document.querySelectorAll<HTMLElement>('[data-precio-cta]').forEach((el) => {
      el.textContent = `${el.dataset.label ?? 'Lo quiero'} · ${price}`;
    });
  });
}
