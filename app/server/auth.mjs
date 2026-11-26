import {
  randomBytes,
  randomUUID,
  randomInt,
  scryptSync,
  timingSafeEqual,
  createHash,
  createHmac,
} from "node:crypto";
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  SignUpCommand,
  ConfirmSignUpCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  ChangePasswordCommand,
  GetUserCommand,
  RevokeTokenCommand,
  AdminListGroupsForUserCommand,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { config } from "./config.mjs";
import { ensure, nowIso, ServiceError } from "./errors.mjs";

const digest = (value) => createHash("sha256").update(value).digest("hex");
export function passwordHash(password) {
  ensure(
    typeof password === "string" &&
      password.length >= 10 &&
      password.length <= 128,
    "invalidPassword",
    "Mật khẩu cần 10–128 ký tự.",
  );
  const salt = randomBytes(16).toString("hex");
  return { salt, hash: scryptSync(password, salt, 64).toString("hex") };
}
const passwordMatches = (password, stored) => {
  if (
    !stored?.salt ||
    !stored?.hash ||
    typeof password !== "string" ||
    password.length > 128
  )
    return false;
  const actual = scryptSync(password, stored.salt, 64);
  const expected = Buffer.from(stored.hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
export function createAuth(repo, options = config) {
  const cognito =
    options.mode === "aws"
      ? new CognitoIdentityProviderClient({ region: options.region })
      : null;
  const verifier = cognito
    ? CognitoJwtVerifier.create({
        userPoolId: options.poolId,
        clientId: options.clientId,
        tokenUse: "access",
      })
    : null;
  const secretHash = (username) =>
    options.clientSecret
      ? createHmac("sha256", options.clientSecret)
          .update(username + options.clientId)
          .digest("base64")
      : undefined;
  const normalizeEmail = (value) => {
    const email = String(value || "")
      .trim()
      .toLowerCase();
    ensure(
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254,
      "invalidCredentials",
      "Email không hợp lệ.",
    );
    return email;
  };
  async function localSession(account) {
    const token = randomBytes(32).toString("base64url");
    const credential = await repo.getSecret(
      `AUTH#${account.email}`,
      "CREDENTIAL",
    );
    await repo.putSecret("SESSION", digest(token), {
      accountId: account.id,
      credentialFingerprint: digest(credential.hash),
      expiresAt: Math.floor(Date.now() / 1000) + 43200,
    });
    return { accessToken: token, expiresIn: 43200, user: safeUser(account) };
  }
  async function ensureCognitoAccount(accessToken, synchronize = false) {
    const claims = await verifier.verify(accessToken);
    let state = await repo.read();
    let account = state.accounts.find((a) => a.cognitoSub === claims.sub);
    if (!account) {
      const result = await cognito.send(
        new GetUserCommand({ AccessToken: accessToken }),
      );
      const attrs = Object.fromEntries(
        result.UserAttributes.map((a) => [a.Name, a.Value]),
      );
      ensure(
        attrs.email_verified === "true",
        "emailUnverified",
        "Vui lòng xác minh email.",
        403,
      );
      const saved = await repo.mutate(
        claims.sub,
        `create_${claims.sub.replace(/-/g, "")}`,
        { type: "cognito-account" },
        (data) => {
          const existing = data.accounts.find(
            (a) => a.cognitoSub === claims.sub,
          );
          if (existing) return { state: data, result: { id: existing.id } };
          const user = {
            id: claims.sub,
            cognitoSub: claims.sub,
            email: normalizeEmail(attrs.email),
            fullName: attrs.name || "Độc giả",
            role: "reader",
            status: "active",
            createdAt: nowIso(),
          };
          data.accounts.push(user);
          return { state: data, result: { id: user.id } };
        },
      );
      state = saved.state;
      account = state.accounts.find((a) => a.cognitoSub === claims.sub);
    }
    ensure(
      account?.status === "active",
      "accountLocked",
      "Tài khoản đã bị khóa.",
      403,
    );
    if (synchronize) await syncCognitoRole(account, options);
    return account;
  }
  return {
    async exchange({ code, verifier: codeVerifier }) {
      ensure(
        cognito && options.cognitoDomain,
        "cognitoNotConfigured",
        "Đăng nhập Cognito chưa được cấu hình.",
        503,
      );
      ensure(
        typeof code === "string" &&
          code.length < 2048 &&
          /^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier || ""),
        "invalidCredentials",
        "Phiên xác minh không hợp lệ.",
        401,
      );
      const response = await fetch(`${options.cognitoDomain}/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: options.clientId,
          redirect_uri: options.origin + "/",
          code,
          code_verifier: codeVerifier,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      ensure(
        response.ok && result.access_token,
        "invalidCredentials",
        "Phiên xác minh đã hết hạn. Vui lòng đăng nhập lại.",
        401,
      );
      return {
        accessToken: result.access_token,
        refreshToken: result.refresh_token,
        expiresIn: result.expires_in,
        user: safeUser(await ensureCognitoAccount(result.access_token, true)),
      };
    },
    async authenticate(req, optional = false) {
      const raw = req.headers.authorization;
      if (!raw) {
        if (optional) return null;
        throw new ServiceError("loginRequired", "Vui lòng đăng nhập.", 401);
      }
      ensure(
        /^Bearer [A-Za-z0-9_.-]+$/.test(raw) && raw.length < 20000,
        "loginRequired",
        "Phiên đăng nhập không hợp lệ.",
        401,
      );
      const token = raw.slice(7);
      if (verifier) {
        try {
          return await ensureCognitoAccount(token);
        } catch (error) {
          if (error instanceof ServiceError) throw error;
          throw new ServiceError(
            "loginRequired",
            "Phiên đăng nhập đã hết hạn.",
            401,
          );
        }
      }
      const session = await repo.getSecret("SESSION", digest(token));
      ensure(
        session && session.expiresAt > Date.now() / 1000,
        "loginRequired",
        "Phiên đăng nhập đã hết hạn.",
        401,
      );
      const user = (await repo.read()).accounts.find(
        (a) => a.id === session.accountId,
      );
      ensure(
        user?.status === "active",
        "accountLocked",
        "Tài khoản đã bị khóa.",
        403,
      );
      const credential = await repo.getSecret(
        `AUTH#${user.email}`,
        "CREDENTIAL",
      );
      ensure(
        !session.credentialFingerprint ||
          (credential &&
            session.credentialFingerprint === digest(credential.hash)),
        "loginRequired",
        "Mật khẩu đã thay đổi. Vui lòng đăng nhập lại.",
        401,
      );
      return user;
    },
    async login(input) {
      const email = normalizeEmail(input.email);
      if (cognito) {
        const result = await cognito.send(
          new InitiateAuthCommand({
            ClientId: options.clientId,
            AuthFlow: "USER_PASSWORD_AUTH",
            AuthParameters: {
              USERNAME: email,
              PASSWORD: input.password,
              ...(secretHash(email) ? { SECRET_HASH: secretHash(email) } : {}),
            },
          }),
        );
        ensure(
          result.AuthenticationResult,
          "challengeRequired",
          "Hãy hoàn tất bước xác minh tài khoản trên Cognito.",
        );
        return {
          accessToken: result.AuthenticationResult.AccessToken,
          refreshToken: result.AuthenticationResult.RefreshToken,
          expiresIn: result.AuthenticationResult.ExpiresIn,
          user: safeUser(
            await ensureCognitoAccount(
              result.AuthenticationResult.AccessToken,
              true,
            ),
          ),
        };
      }
      const stored = await repo.getSecret(`AUTH#${email}`, "CREDENTIAL");
      ensure(
        passwordMatches(input.password, stored),
        "invalidCredentials",
        "Email hoặc mật khẩu chưa đúng.",
        401,
      );
      const user = (await repo.read()).accounts.find((a) => a.email === email);
      ensure(
        user?.status === "active",
        "accountLocked",
        "Tài khoản đã bị khóa.",
        403,
      );
      return localSession(user);
    },
    async register(input) {
      const email = normalizeEmail(input.email);
      const fullName = String(input.fullName || "").trim();
      ensure(
        fullName.length >= 2 && fullName.length <= 100,
        "invalidInput",
        "Họ tên cần 2–100 ký tự.",
      );
      passwordHash(input.password);
      if (cognito) {
        await cognito.send(
          new SignUpCommand({
            ClientId: options.clientId,
            Username: email,
            Password: input.password,
            SecretHash: secretHash(email),
            UserAttributes: [
              { Name: "email", Value: email },
              { Name: "name", Value: fullName },
            ],
          }),
        );
        return {
          confirmationRequired: true,
          message: "Kiểm tra email để lấy mã xác minh.",
        };
      }
      const hash = passwordHash(input.password);
      const id = randomUUID();
      try {
        await repo.putSecret(`AUTH#${email}`, "CREDENTIAL", hash, true);
      } catch (error) {
        if (error.name === "ConditionalCheckFailedException")
          throw new ServiceError(
            "accountExists",
            "Email đã được đăng ký.",
            409,
          );
        throw error;
      }
      try {
        const result = await repo.mutate(
          id,
          randomUUID(),
          { type: "register", email },
          (state) => {
            ensure(
              !state.accounts.some((a) => a.email === email),
              "accountExists",
              "Email đã được đăng ký.",
              409,
            );
            const user = {
              id,
              email,
              fullName,
              role: "reader",
              status: "active",
              createdAt: nowIso(),
            };
            state.accounts.push(user);
            return { state, result: { id } };
          },
        );
        return localSession(result.state.accounts.find((a) => a.id === id));
      } catch (error) {
        await repo.deleteSecret(`AUTH#${email}`, "CREDENTIAL");
        throw error;
      }
    },
    async confirm(input) {
      ensure(
        cognito,
        "notRequired",
        "Bản chạy local không yêu cầu xác minh email.",
      );
      const email = normalizeEmail(input.email);
      await cognito.send(
        new ConfirmSignUpCommand({
          ClientId: options.clientId,
          Username: email,
          ConfirmationCode: String(input.code),
          SecretHash: secretHash(email),
        }),
      );
      return { ok: true };
    },
    async forgot(input) {
      const email = normalizeEmail(input.email);
      if (cognito)
        await cognito.send(
          new ForgotPasswordCommand({
            ClientId: options.clientId,
            Username: email,
            SecretHash: secretHash(email),
          }),
        );
      else {
        const stored = await repo.getSecret(`AUTH#${email}`, "CREDENTIAL");
        if (stored) {
          const code = String(randomInt(100000, 1000000));
          await repo.putSecret(`RESET#${email}`, "CODE", {
            hash: digest(code),
            attempts: 0,
            expiresAt: Math.floor(Date.now() / 1000) + 600,
          });
          await repo.putSecret("OUTBOX", randomUUID(), {
            email,
            subject: "Mã khôi phục mật khẩu Cloud Library",
            text: `Mã: ${code}. Có hiệu lực trong 10 phút.`,
            createdAt: nowIso(),
            localOnly: true,
          });
        }
      }
      return {
        ok: true,
        message:
          "Nếu tài khoản tồn tại, mã khôi phục đã được gửi. Bản local lưu thư trong hộp thư thử nghiệm của quản trị viên.",
      };
    },
    async reset(input) {
      const email = normalizeEmail(input.email);
      const hash = passwordHash(input.password);
      if (cognito)
        await cognito.send(
          new ConfirmForgotPasswordCommand({
            ClientId: options.clientId,
            Username: email,
            ConfirmationCode: String(input.code),
            Password: input.password,
            SecretHash: secretHash(email),
          }),
        );
      else {
        const row = await repo.getSecret(`RESET#${email}`, "CODE");
        ensure(
          row && row.expiresAt > Date.now() / 1000 && row.attempts < 5,
          "invalidCode",
          "Mã không hợp lệ hoặc đã hết hạn.",
        );
        await repo.putSecret(`RESET#${email}`, "CODE", {
          ...row,
          PK: undefined,
          SK: undefined,
          attempts: row.attempts + 1,
        });
        ensure(
          row.hash === digest(String(input.code)),
          "invalidCode",
          "Mã xác minh không đúng.",
        );
        await repo.putSecret(`AUTH#${email}`, "CREDENTIAL", hash);
        await repo.deleteSecret(`RESET#${email}`, "CODE");
      }
      return { ok: true };
    },
    async changePassword(user, input, token) {
      passwordHash(input.password);
      if (cognito)
        await cognito.send(
          new ChangePasswordCommand({
            AccessToken: token,
            PreviousPassword: input.currentPassword,
            ProposedPassword: input.password,
          }),
        );
      else {
        const old = await repo.getSecret(`AUTH#${user.email}`, "CREDENTIAL");
        ensure(
          passwordMatches(input.currentPassword, old),
          "invalidCredentials",
          "Mật khẩu hiện tại chưa đúng.",
          401,
        );
        await repo.putSecret(
          `AUTH#${user.email}`,
          "CREDENTIAL",
          passwordHash(input.password),
        );
      }
      return { ok: true };
    },
    async logout(token, refreshToken) {
      if (!cognito && token) await repo.deleteSecret("SESSION", digest(token));
      if (cognito && refreshToken)
        await cognito.send(
          new RevokeTokenCommand({
            ClientId: options.clientId,
            Token: refreshToken,
          }),
        );
      return { ok: true };
    },
    async refresh(refreshToken) {
      ensure(
        cognito && refreshToken,
        "loginRequired",
        "Vui lòng đăng nhập lại.",
        401,
      );
      if (options.cognitoDomain) {
        const response = await fetch(`${options.cognitoDomain}/oauth2/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: options.clientId,
            refresh_token: refreshToken,
          }),
          signal: AbortSignal.timeout(15000),
        });
        const value = await response.json();
        ensure(
          response.ok && value.access_token,
          "loginRequired",
          "Vui lòng đăng nhập lại.",
          401,
        );
        await ensureCognitoAccount(value.access_token, true);
        return { accessToken: value.access_token, expiresIn: value.expires_in };
      }
      const result = await cognito.send(
        new InitiateAuthCommand({
          ClientId: options.clientId,
          AuthFlow: "REFRESH_TOKEN_AUTH",
          AuthParameters: { REFRESH_TOKEN: refreshToken },
        }),
      );
      return {
        accessToken: result.AuthenticationResult.AccessToken,
        expiresIn: result.AuthenticationResult.ExpiresIn,
      };
    },
  };
}
export const safeUser = (user) => {
  if (!user) return null;
  const { credential: _credential, ...safe } = user;
  return safe;
};

export async function syncCognitoRole(account, options = config) {
  if (options.mode !== "aws" || !account?.cognitoSub) return;
  const client = new CognitoIdentityProviderClient({ region: options.region });
  const input = { UserPoolId: options.poolId, Username: account.cognitoSub };
  const result = await client.send(new AdminListGroupsForUserCommand(input));
  const roles = ["reader", "author", "librarian", "admin"];
  for (const group of result.Groups || []) {
    if (roles.includes(group.GroupName) && group.GroupName !== account.role)
      await client.send(
        new AdminRemoveUserFromGroupCommand({
          ...input,
          GroupName: group.GroupName,
        }),
      );
  }
  if (!(result.Groups || []).some((g) => g.GroupName === account.role))
    await client.send(
      new AdminAddUserToGroupCommand({ ...input, GroupName: account.role }),
    );
}
