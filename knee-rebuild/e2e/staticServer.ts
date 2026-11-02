import { readFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, join, normalize, sep } from 'node:path'

/**
 * dist/ served the way a static host serves it, for the PWA checks (docs/pwa-audit.md) that
 * `vite preview` can't stage: the server stops, so offline is the network really gone, not only the
 * page told so; and sw.js can change between two loads, so the browser finds a new service worker
 * the way it does after a deploy. Every request reads the file afresh; unknown paths get index.html
 * and every response carries vercel.json's headers (its SPA rewrite and its content security policy),
 * so the checks run under the policy production serves.
 */
export interface StaticServer {
  url: string
  /** Appended to sw.js from the next request on: a byte-different worker, as a deploy makes. */
  setServiceWorkerSuffix(suffix: string): void
  close(): Promise<void>
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
}

/** The headers vercel.json sets on every path (`source: "/(.*)"`), as production serves them. */
async function vercelHeaders(file: string): Promise<Record<string, string>> {
  const config = JSON.parse(await readFile(file, 'utf8')) as { headers?: { source: string; headers: { key: string; value: string }[] }[] }
  const all = (config.headers ?? []).filter((h) => h.source === '/(.*)').flatMap((h) => h.headers)
  return Object.fromEntries(all.map((h) => [h.key, h.value]))
}

export async function serveDist(root: string, vercelJson: string): Promise<StaticServer> {
  let swSuffix = ''
  const base = normalize(root)
  const headers = await vercelHeaders(vercelJson)
  if (!headers['Content-Security-Policy']) throw new Error(`${vercelJson} sets no Content-Security-Policy on every path`)
  const server: Server = createServer((req, res) => {
    void (async () => {
      const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)
      const file = normalize(join(base, path === '/' ? 'index.html' : path))
      if (file !== base && !file.startsWith(base + sep)) {
        res.writeHead(403).end()
        return
      }
      let body: Buffer
      let type: string
      try {
        body = await readFile(file)
        type = TYPES[extname(file)] ?? 'application/octet-stream'
      } catch {
        body = await readFile(join(base, 'index.html'))
        type = TYPES['.html'] ?? 'text/html'
      }
      if (path === '/sw.js' && swSuffix) body = Buffer.concat([body, Buffer.from(swSuffix)])
      // No caching between loads, so the second load of sw.js is the one this server holds now.
      res.writeHead(200, { ...headers, 'Content-Type': type, 'Cache-Control': 'no-cache' }).end(body)
    })().catch(() => res.writeHead(500).end())
  })
  // Each connection closes after its response, so close() never waits on a browser's kept-alive socket.
  server.keepAliveTimeout = 1
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    setServiceWorkerSuffix: (suffix) => {
      swSuffix = suffix
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections()
        server.close((e) => (e ? reject(e) : resolve()))
      }),
  }
}
