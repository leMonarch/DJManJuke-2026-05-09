/// <reference types="vite/client" />

export {};

declare module '*.css' {
  const content: string;
  export default content;
}

declare global {
  interface ImportMetaEnv {
    readonly VITE_API_URL?: string;
    readonly VITE_API_WS_URL?: string;
    readonly VITE_ASSETS_BASE_URL?: string;
    readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}



