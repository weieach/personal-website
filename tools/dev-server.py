#!/usr/bin/env python3
"""Local static server for debug mode (dev-mode.js).

Serves the website folder like any static server, and keeps the project order
arranged in debug mode as a draft in .dev-order.json so it survives refreshes
and a coding agent can apply it (tools/dev_order.py apply). Localhost only.

    python3 tools/dev-server.py            # http://localhost:8000/index.html (allowed by the media CORS rules)
    python3 tools/dev-server.py 8001
"""

import json
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

import dev_order

MAX_BODY = 1024 * 1024


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if self.path == "/__dev/ping":
            return self.reply(200, {"ok": True})
        if self.path == "/__dev/order":
            return self.reply(200, dev_order.read_draft())
        return super().do_GET()

    def do_POST(self):
        if self.path == "/__dev/order":
            try:
                length = int(self.headers.get("Content-Length", 0))
                if length > MAX_BODY:
                    return self.reply(413, {"error": "payload too large"})
                payload = json.loads(self.rfile.read(length))
                page, order = payload["page"], payload["order"]
                if not isinstance(page, str) or not page.endswith(".html") or "/" in page:
                    raise ValueError
                if order is not None and not all(isinstance(key, str) for key in order):
                    raise ValueError
            except (ValueError, KeyError, TypeError):
                return self.reply(400, {"error": "expected {page, order}"})
            dev_order.set_page_order(page, order)
            return self.reply(200, {"ok": True})
        if self.path == "/__dev/leave":
            dev_order.discard()
            print("dev-mode: draft discarded, debug mode off", flush=True)
            return self.reply(200, {"ok": True})
        return self.reply(404, {"error": "not found"})

    def reply(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=str(dev_order.ROOT)))
    print(f"Serving {dev_order.ROOT} at http://localhost:{port}/index.html", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
