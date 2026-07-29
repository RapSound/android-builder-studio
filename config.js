// ============================================================
// Android Builder Studio — configuration
// ============================================================
// Ce fichier ne contient AUCUN secret. Le client_id d'une OAuth
// App GitHub est public par conception (c'est le client_secret
// qu'il ne faut jamais exposer — et le Device Flow ne l'utilise
// jamais côté client).
//
// Ce que tu dois renseigner :
// 1. GITHUB_CLIENT_ID : créé sur
//    https://github.com/settings/applications/new
//    -> coche "Enable Device Flow" dans les paramètres de l'app.
// 2. GITHUB_OWNER / GITHUB_REPO : le dépôt qui contient le
//    workflow .github/workflows/build.yml (peut être celui-ci).
// 3. CORS_PROXY_URL : l'URL de ton petit relais (voir proxy/worker.js).
//    GitHub n'autorise pas les requêtes CORS directes depuis un
//    site statique vers login/device/code et login/oauth/access_token,
//    un relais minimal (sans secret) est donc nécessaire. Un
//    Cloudflare Worker gratuit suffit largement.
// ============================================================

window.ABS_CONFIG = {
  GITHUB_CLIENT_ID: "REPLACE_WITH_YOUR_OAUTH_APP_CLIENT_ID",
  GITHUB_OWNER: "REPLACE_WITH_YOUR_GITHUB_USERNAME",
  GITHUB_REPO: "REPLACE_WITH_YOUR_REPO_NAME",
  GITHUB_BUILD_BRANCH: "builds",
  CORS_PROXY_URL: "https://REPLACE_WITH_YOUR_WORKER.workers.dev",
  OAUTH_SCOPES: "repo workflow",
  HISTORY_LIMIT: 20
};
