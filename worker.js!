/**
 * Relais CORS minimal pour le GitHub OAuth Device Flow.
 *
 * Pourquoi ce fichier existe :
 * GitHub Pages est 100% statique. Le Device Flow est justement fait
 * pour des clients "publics" (pas de client_secret), mais les
 * endpoints github.com/login/device/code et
 * github.com/login/oauth/access_token ne renvoient pas d'en-têtes
 * CORS autorisant un fetch() direct depuis le navigateur. Ce relais
 * ne fait que transmettre la requête telle quelle et ajouter les
 * en-têtes CORS. Il ne contient, ne stocke et ne lit AUCUN secret :
 * le client_id d'une OAuth App est public par nature.
 *
 * Déploiement (gratuit, ~2 minutes) :
 * 1. https://workers.cloudflare.com -> Create Worker
 * 2. Colle ce fichier, Deploy.
 * 3. Copie l'URL du worker dans config.js -> CORS_PROXY_URL
 */

const ALLOWED_TARGETS = {
  "/device/code": "https://github.com/login/device/code",
  "/access_token": "https://github.com/login/oauth/access_token",
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    const target = ALLOWED_TARGETS[url.pathname];
    if (!target || request.method !== "POST") {
      return withCors(new Response("Not found", { status: 404 }));
    }

    const body = await request.text();
    const upstream = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body,
    });

    const text = await upstream.text();
    return withCors(
      new Response(text, {
        status: upstream.status,
        headers: { "Content-Type": "application/json" },
      })
    );
  },
};

function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(response.body, { status: response.status, headers });
}
