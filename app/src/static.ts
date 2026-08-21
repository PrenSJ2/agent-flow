/**
 * Static file server for the pre-built webview assets.
 * Serves index.html, index.js, and index.css from app/dist/webview/.
 */
import * as http from 'http'
import * as fs from 'fs'
import * as path from 'path'

const WEBVIEW_DIR = path.join(__dirname, 'webview')

const HTML_SHELL = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>tare — console</title>
  <!-- Inlined rather than served: a favicon route that 404s falls back to the
       browser's default globe, which is what this shell did before. The source
       (with the reasoning behind the mark) is app/assets/tare-icon.svg. -->
  <link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2032%2032%22%20width%3D%2232%22%20height%3D%2232%22%20role%3D%22img%22%20aria-label%3D%22tare%22%3E%3Cg%20fill%3D%22none%22%20stroke%3D%22%2366ccff%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Crect%20x%3D%225.25%22%20y%3D%226.25%22%20width%3D%2221.5%22%20height%3D%2221.5%22%20rx%3D%223.25%22%20stroke-width%3D%222.5%22%2F%3E%3Cpath%20d%3D%22M8.5%2014.5%20h15%22%20stroke-width%3D%221.75%22%20stroke-dasharray%3D%223%202.6%22%20opacity%3D%220.75%22%2F%3E%3C%2Fg%3E%3Crect%20x%3D%228.5%22%20y%3D%2218%22%20width%3D%2215%22%20height%3D%226.25%22%20rx%3D%221.5%22%20fill%3D%22%2366ccff%22%2F%3E%3Cpath%20d%3D%22M12%203.4%20h8%22%20stroke%3D%22%2366ccff%22%20stroke-width%3D%222.5%22%20stroke-linecap%3D%22round%22%2F%3E%3C%2Fsvg%3E">
  <link rel="stylesheet" href="/index.css">
  <style>html, body { height: 100%; margin: 0; padding: 0; }</style>
</head>
<body class="font-sans antialiased" style="background: #0a0a1a;">
  <div id="root" style="height: 100%;"></div>
  <script src="/index.js"></script>
</body>
</html>`

const MIME_TYPES: Record<string, string> = {
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
}

export function serveStatic(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = req.url || '/'

  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(HTML_SHELL)
    return
  }

  // Only serve known asset files from the webview directory
  const basename = path.basename(url)
  const ext = path.extname(basename)
  const mime = MIME_TYPES[ext]

  if (!mime) {
    res.writeHead(404)
    res.end('Not found')
    return
  }

  const filePath = path.join(WEBVIEW_DIR, basename)

  // Prevent path traversal
  if (!filePath.startsWith(WEBVIEW_DIR)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  try {
    const content = fs.readFileSync(filePath)
    res.writeHead(200, { 'Content-Type': mime })
    res.end(content)
  } catch {
    res.writeHead(404)
    res.end('Not found')
  }
}
