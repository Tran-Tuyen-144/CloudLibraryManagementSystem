import { request, setSession } from "./runtime.js";

const key = "cloudlibrary:pkce";
const base64url = (bytes) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export async function beginCognitoSignIn(capabilities) {
  if (!capabilities?.cognitoDomain || !capabilities.cognitoClientId)
    throw new Error("Đăng nhập Cognito chưa được cấu hình.");
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const state = base64url(crypto.getRandomValues(new Uint8Array(24)));
  const challenge = base64url(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    ),
  );
  sessionStorage.setItem(
    key,
    JSON.stringify({ verifier, state, expires: Date.now() + 600000 }),
  );
  const url = new URL("/oauth2/authorize", capabilities.cognitoDomain);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: capabilities.cognitoClientId,
    redirect_uri: location.origin + "/",
    scope: "openid email profile aws.cognito.signin.user.admin",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "login",
  }).toString();
  location.assign(url.href);
}

let finishing;
export function finishCognitoSignIn() {
  if (finishing) return finishing;
  const url = new URL(location.href);
  if (!url.searchParams.has("code") && !url.searchParams.has("error"))
    return Promise.resolve();
  finishing = (async () => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || "null");
      if (
        !saved ||
        saved.expires < Date.now() ||
        url.searchParams.get("state") !== saved.state
      )
        throw new Error(
          "Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.",
        );
      if (url.searchParams.has("error"))
        throw new Error("Đăng nhập chưa hoàn tất. Vui lòng thử lại.");
      const result = await request("/auth/exchange", {
        method: "POST",
        auth: false,
        body: { code: url.searchParams.get("code"), verifier: saved.verifier },
      });
      setSession(result);
    } finally {
      sessionStorage.removeItem(key);
      for (const name of ["code", "state", "error", "error_description"])
        url.searchParams.delete(name);
      history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  })();
  return finishing;
}
