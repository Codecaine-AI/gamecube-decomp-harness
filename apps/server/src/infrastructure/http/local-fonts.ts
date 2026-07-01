import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

type LocalFont = {
  file: string;
};

const tx02RoutePrefix = "/api/local-fonts/tx-02/";

const tx02Fonts: Record<string, LocalFont> = {
  "bold-oblique": { file: "TX-02-Bold-Oblique.otf" },
  bold: { file: "TX-02-Bold.otf" },
  "medium-oblique": { file: "TX-02-Medium-Oblique.otf" },
  medium: { file: "TX-02-Medium.otf" },
  oblique: { file: "TX-02-Oblique.otf" },
  regular: { file: "TX-02-Regular.otf" },
};

function tx02FontDirectories(): string[] {
  return [
    Bun.env.ORCH_UI_TX02_FONT_DIR,
    resolve(homedir(), "Dropbox/UI Components/Fonts/TX-02"),
    resolve(homedir(), "Library/CloudStorage/Dropbox/UI Components/Fonts/TX-02"),
  ].filter((path): path is string => Boolean(path));
}

function isLoopbackRequest(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

function findTx02Font(file: string): string | null {
  for (const dir of tx02FontDirectories()) {
    const path = resolve(dir, file);
    if (existsSync(path)) return path;
  }
  return null;
}

export function localFontResponse(req: Request, url: URL): Response | null {
  if (!url.pathname.startsWith(tx02RoutePrefix)) return null;
  if (!isLoopbackRequest(url)) return new Response("Not found", { status: 404 });

  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", {
      headers: { allow: "GET, HEAD" },
      status: 405,
    });
  }

  const slug = url.pathname.slice(tx02RoutePrefix.length).replace(/\.otf$/i, "");
  const font = tx02Fonts[slug];
  if (!font) return new Response("Not found", { status: 404 });

  const path = findTx02Font(font.file);
  if (!path) return new Response("Not found", { status: 404 });

  return new Response(req.method === "HEAD" ? null : Bun.file(path), {
    headers: {
      "cache-control": "no-store, max-age=0",
      "content-type": "font/otf",
      expires: "0",
      pragma: "no-cache",
    },
  });
}
