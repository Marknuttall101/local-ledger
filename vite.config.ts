import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * The privacy guarantee, enforced by the browser: the page may only load its own files and may only
 * connect to itself and to OpenRouter. Any attempt to send data anywhere else is blocked.
 * Added to the production build only, because the dev server relies on inline scripts for hot reload.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://openrouter.ai",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY }, injectTo: 'head-prepend' }],
  }
}

export default defineConfig({
  // Relative paths, so the built site works from any folder or static host (e.g. GitHub Pages)
  base: './',
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  test: {
    environment: 'node',
    // The IndexedDB-backed tests are slow on shared CI runners; give them room rather than flake
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
