/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_LH_PLATFORM?: string;
  readonly PUBLIC_LH_API?: string;
  readonly PUBLIC_LH_ORG_ID?: string;
  readonly PUBLIC_SITE_URL?: string;
  readonly PUBLIC_FREE_CLASS_URL?: string;
  readonly PUBLIC_BOOKING_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
