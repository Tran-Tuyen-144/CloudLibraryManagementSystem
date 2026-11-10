"use strict";

const { randomBytes, createHash } = require("node:crypto");
const { CognitoJwtVerifier } = require("aws-jwt-verify");

const ORIGIN = "http://127.0.0.1:3000";
const ROLES = ["READER", "AUTHOR", "LIBRARIAN", "ADMIN"];

const random = () => randomBytes(32).toString("base64url");

const fail = (statusCode, message) =>
  Object.assign(new Error(message), { statusCode });

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (character) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[character];
  });

function cookieValue(req, name) {
  const matches = String(req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(name + "="));

  if (matches.length !== 1) return null;

  const value = matches[0].slice(name.length + 1);

  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

function setCookie(res, name, value, seconds) {
  const previous = res.getHeader("Set-Cookie") || [];

  res.setHeader("Set-Cookie", [
    ...(Array.isArray(previous) ? previous : [previous]),
    `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}`,
  ]);
}

function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
  });

  res.end(JSON.stringify(data, null, 2));
}

function redirect(res, location) {
  res.writeHead(303, { Location: location });
  res.end();
}

function createAuth(
  docClient,
  { GetCommand, PutCommand },
  options = {}
) {
  const env = options.env || process.env;
  const now = options.now || Date.now;
  const fetcher = options.fetch || globalThis.fetch;

  const required = [
    "COGNITO_USER_POOL_ID",
    "COGNITO_CLIENT_ID",
    "COGNITO_DOMAIN",
    "COGNITO_REDIRECT_URI",
    "COGNITO_CLIENT_SECRET",
  ];

  for (const key of required) {
    if (
      !env[key]?.trim() ||
      env[key].includes("DAN_CLIENT_SECRET")
    ) {
      throw new Error(
        `Thiếu hoặc chưa điền ${key} trong file .env.`
      );
    }
  }

  const poolId = env.COGNITO_USER_POOL_ID.trim();
  const clientId = env.COGNITO_CLIENT_ID.trim();
  const secret = env.COGNITO_CLIENT_SECRET.trim();
  const callback = env.COGNITO_REDIRECT_URI.trim();
  const domain = new URL(env.COGNITO_DOMAIN.trim());
  const region = poolId.split("_")[0];

  if (
    !/^[a-z0-9-]+_[A-Za-z0-9]+$/.test(poolId) ||
    !/^[a-z0-9]+$/.test(clientId) ||
    domain.protocol !== "https:" ||
    domain.username ||
    domain.password ||
    domain.port ||
    domain.search ||
    domain.hash ||
    domain.pathname !== "/" ||
    !domain.hostname.endsWith(
      `.auth.${region}.amazoncognito.com`
    ) ||
    callback !== ORIGIN + "/auth/callback"
  ) {
    throw new Error(
      "Cấu hình Cognito local không hợp lệ. Kiểm tra lại file .env."
    );
  }

  const idVerifier = CognitoJwtVerifier.create({
    userPoolId: poolId,
    clientId,
    tokenUse: "id",
  });

  const accessVerifier = CognitoJwtVerifier.create({
    userPoolId: poolId,
    clientId,
    tokenUse: "access",
  });

  // Phiên đăng nhập của bản chạy local được giữ trong RAM.
  const pending = new Map();
  const sessions = new Map();

  const routes = new Set([
    "/",
    "/auth/login",
    "/auth/callback",
    "/auth/logout",
    "/api/me",
  ]);

  function cleanup() {
    for (const map of [pending, sessions]) {
      for (const [key, item] of map) {
        if (item.expiresAt <= now()) map.delete(key);
      }
    }
  }

  function validateAccount(account, identity) {
    if (
      !account ||
      account.cognitoSub !== identity.sub ||
      account.cognitoIssuer !== identity.iss ||
      account.status !== "ACTIVE" ||
      !Array.isArray(account.roles) ||
      account.roles.length === 0 ||
      account.roles.some((role) => !ROLES.includes(role))
    ) {
      throw fail(
        403,
        "Tài khoản chưa được cấp quyền hoặc đã bị khóa."
      );
    }

    return account;
  }

  async function readAccount(accountId) {
    const result = await docClient.send(
      new GetCommand({
        TableName: "Accounts",
        Key: { accountId },
        ConsistentRead: true,
      })
    );

    return result.Item;
  }

  async function ensureAccount(identity) {
    if (
      !/^[A-Za-z0-9_-]{1,64}$/.test(identity.sub || "")
    ) {
      throw fail(401, "Thông tin định danh không hợp lệ.");
    }

    const accountId = "ACCOUNT_COGNITO_" + identity.sub;

    let account = await readAccount(accountId);

    if (!account) {
      if (
        identity.email_verified !== true ||
        typeof identity.email !== "string" ||
        !identity.email
      ) {
        throw fail(
          403,
          "Vui lòng xác minh email trước khi đăng nhập."
        );
      }

      const timestamp = new Date(now()).toISOString();

      const created = {
        accountId,
        accountKind: "COGNITO",
        cognitoSub: identity.sub,
        cognitoIssuer: identity.iss,
        email: identity.email,

        fullName:
          typeof identity.name === "string" &&
          identity.name.trim()
            ? identity.name.trim().slice(0, 200)
            : "Độc giả",

        roles: ["READER"],
        status: "ACTIVE",
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      try {
        await docClient.send(
          new PutCommand({
            TableName: "Accounts",
            Item: created,
            ConditionExpression:
              "attribute_not_exists(accountId)",
          })
        );

        account = created;
      } catch (error) {
        if (
          error.name !== "ConditionalCheckFailedException"
        ) {
          throw error;
        }

        account = await readAccount(accountId);
      }
    }

    return validateAccount(account, identity);
  }

  async function verifyAccess(token) {
    try {
      return await accessVerifier.verify(token);
    } catch {
      throw fail(
        401,
        "Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Hãy đăng nhập lại."
      );
    }
  }

  async function getAccount(req) {
    cleanup();

    const session = sessions.get(
      cookieValue(req, "cl_session")
    );

    if (!session) {
      throw fail(401, "Bà cần đăng nhập trước.");
    }

    const identity = await verifyAccess(
      session.accessToken
    );

    if (
      identity.sub !== session.sub ||
      identity.iss !== session.issuer
    ) {
      throw fail(401, "Phiên đăng nhập không hợp lệ.");
    }

    return validateAccount(
      await readAccount(session.accountId),
      identity
    );
  }

  async function requireRole(req, role) {
    const account = await getAccount(req);

    if (
      !ROLES.includes(role) ||
      !account.roles.includes(role)
    ) {
      throw fail(
        403,
        "Tài khoản không có quyền thực hiện chức năng này."
      );
    }

    return account;
  }

  function sendHome(res, account) {
    const content = account
      ? `
        <h1>Đăng nhập thành công</h1>
        <p>Xin chào ${escapeHtml(
          account.fullName || "Độc giả"
        )}!</p>
        <p>${escapeHtml(account.email || "")}</p>
        <p>Vai trò: ${escapeHtml(
          account.roles.join(", ")
        )}</p>
        <p>
          <a href="/api/me">Xem tài khoản của tôi</a>
        </p>
        <form method="post" action="/auth/logout">
          <button>Đăng xuất phiên local</button>
        </form>
      `
      : `
        <h1>Cloud Library</h1>
        <p>Đăng nhập hoặc đăng ký để bắt đầu.</p>
        <p>
          <a href="/auth/login">Đăng nhập / Đăng ký</a>
        </p>
      `;

    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",

      "Content-Security-Policy":
        "default-src 'none'; " +
        "style-src 'unsafe-inline'; " +
        "form-action 'self'; " +
        "base-uri 'none'; " +
        "frame-ancestors 'none'",
    });

    res.end(`
      <!doctype html>
      <html lang="vi">
      <head>
        <meta charset="utf-8">
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1"
        >
        <title>Cloud Library</title>
        <style>
          body {
            margin: 0;
            background: #eeeae2;
            color: #292524;
            font: 17px/1.7 system-ui;
          }

          main {
            max-width: 640px;
            margin: 64px auto;
            padding: 32px;
            background: #fffdf8;
            border-radius: 16px;
          }

          a {
            color: #684f35;
          }

          button {
            padding: 10px 16px;
            cursor: pointer;
            font: inherit;
          }
        </style>
      </head>
      <body>
        <main>
          ${content}
          <p>
            <a href="/api/books">Xem danh sách sách</a>
          </p>
        </main>
      </body>
      </html>
    `);
  }

  async function handle(req, res, url) {
    const path =
      url.pathname.replace(/\/+$/, "") || "/";

    if (!routes.has(path)) return false;

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");

    try {
      if (req.headers.host !== "127.0.0.1:3000") {
        throw fail(
          400,
          "Bà mở đúng địa chỉ http://127.0.0.1:3000 nhé."
        );
      }

      const method =
        path === "/auth/logout" ? "POST" : "GET";

      if (req.method !== method) {
        res.setHeader("Allow", method);

        throw fail(
          405,
          `Đường dẫn này cần phương thức ${method}.`
        );
      }

      cleanup();

      if (path === "/auth/login") {
        if (pending.size >= 500) {
          throw fail(
            503,
            "Đang có nhiều yêu cầu đăng nhập. Hãy thử lại sau."
          );
        }

        const old = cookieValue(req, "cl_login");

        if (old) pending.delete(old);

        const key = random();

        const item = {
          state: random(),
          nonce: random(),
          verifier: random(),
          expiresAt: now() + 600000,
        };

        pending.set(key, item);
        setCookie(res, "cl_login", key, 600);

        const target = new URL(
          "/oauth2/authorize",
          domain
        );

        target.search = new URLSearchParams({
          response_type: "code",
          client_id: clientId,
          redirect_uri: callback,
          scope: "openid email",
          state: item.state,
          nonce: item.nonce,
          code_challenge_method: "S256",

          code_challenge: createHash("sha256")
            .update(item.verifier)
            .digest("base64url"),
        }).toString();

        redirect(res, target.href);
      } else if (path === "/auth/callback") {
        const key = cookieValue(req, "cl_login");
        const item = pending.get(key);

        if (
          !item ||
          url.searchParams.getAll("state").length !== 1 ||
          url.searchParams.get("state") !== item.state
        ) {
          throw fail(
            400,
            "Lượt đăng nhập không hợp lệ hoặc đã hết hạn. Mở /auth/login để thử lại."
          );
        }

        pending.delete(key);
        setCookie(res, "cl_login", "", 0);

        const code = url.searchParams.get("code");

        if (
          url.searchParams.has("error") ||
          url.searchParams.getAll("code").length !== 1 ||
          !code ||
          code.length > 4096
        ) {
          throw fail(
            400,
            "Đăng nhập chưa hoàn tất. Hãy thử lại."
          );
        }

        let tokens;

        try {
          const response = await fetcher(
            new URL("/oauth2/token", domain),
            {
              method: "POST",
              redirect: "error",
              signal: AbortSignal.timeout(15000),

              headers: {
                "Content-Type":
                  "application/x-www-form-urlencoded",

                Authorization:
                  "Basic " +
                  Buffer.from(
                    clientId + ":" + secret
                  ).toString("base64"),
              },

              body: new URLSearchParams({
                grant_type: "authorization_code",
                client_id: clientId,
                code,
                redirect_uri: callback,
                code_verifier: item.verifier,
              }),
            }
          );

          if (!response.ok) {
            throw new Error("Token exchange failed");
          }

          tokens = await response.json();
        } catch {
          throw fail(
            502,
            "Chưa nhận được kết quả đăng nhập. Kiểm tra mạng, Client secret và Return URL."
          );
        }

        if (
          typeof tokens?.id_token !== "string" ||
          typeof tokens?.access_token !== "string"
        ) {
          throw fail(
            401,
            "Kết quả đăng nhập không hợp lệ."
          );
        }

        let identity;
        let access;

        try {
          [identity, access] = await Promise.all([
            idVerifier.verify(tokens.id_token),
            accessVerifier.verify(tokens.access_token),
          ]);
        } catch {
          throw fail(
            401,
            "Không xác minh được thông tin đăng nhập."
          );
        }

        if (
          identity.nonce !== item.nonce ||
          !identity.sub ||
          identity.sub !== access.sub ||
          identity.iss !== access.iss ||
          !Number.isSafeInteger(access.exp) ||
          access.exp * 1000 <= now()
        ) {
          throw fail(
            401,
            "Thông tin đăng nhập không khớp với yêu cầu ban đầu."
          );
        }

        if (sessions.size >= 500) {
          throw fail(
            503,
            "Đã đạt giới hạn phiên local. Hãy thử lại sau."
          );
        }

        const account = await ensureAccount(identity);

        const old = cookieValue(req, "cl_session");

        if (old) sessions.delete(old);

        const sessionId = random();

        const expiresAt = Math.min(
          access.exp * 1000,
          now() + 3600000
        );

        sessions.set(sessionId, {
          accessToken: tokens.access_token,
          sub: identity.sub,
          issuer: identity.iss,
          accountId: account.accountId,
          expiresAt,
        });

        setCookie(
          res,
          "cl_session",
          sessionId,
          Math.floor((expiresAt - now()) / 1000)
        );

        redirect(res, "/");
      } else if (path === "/auth/logout") {
        if (req.headers.origin !== ORIGIN) {
          throw fail(
            403,
            "Yêu cầu đăng xuất không hợp lệ."
          );
        }

        sessions.delete(
          cookieValue(req, "cl_session")
        );

        pending.delete(
          cookieValue(req, "cl_login")
        );

        setCookie(res, "cl_session", "", 0);
        setCookie(res, "cl_login", "", 0);

        redirect(res, "/");
      } else if (path === "/api/me") {
        const account = await getAccount(req);

        json(res, 200, {
          ok: true,

          account: {
            accountId: account.accountId,
            fullName: account.fullName,
            email: account.email,
            roles: account.roles,
            status: account.status,
          },
        });
      } else {
        let account = null;

        try {
          account = await getAccount(req);
        } catch (error) {
          if (error.statusCode !== 401) throw error;
        }

        sendHome(res, account);
      }
    } catch (error) {
      json(res, error.statusCode || 500, {
        ok: false,

        message: error.statusCode
          ? error.message
          : "Chưa xử lý được tài khoản. Kiểm tra DynamoDB Local và bảng Accounts.",
      });
    }

    return true;
  }

  return {
    handle,
    getAccount,
    requireRole,
  };
}

module.exports = { createAuth };