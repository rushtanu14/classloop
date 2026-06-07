/// <reference types="vite/client" />

declare const __CLASSLOOP_VERSION__: string;
declare const __CLASSLOOP_BUILD_SHA__: string;
declare const __CLASSLOOP_BUILD_ENV__: string;
declare const __CLASSLOOP_BUILD_TIME__: string;

declare namespace JSX {
  interface IntrinsicElements {
    "stripe-buy-button": {
      key?: string;
      "buy-button-id"?: string;
      "publishable-key"?: string;
      "client-reference-id"?: string;
      "customer-email"?: string;
    };
  }
}
