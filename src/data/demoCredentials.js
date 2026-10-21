// Browser-only prototype verifier. Server authentication will replace this.
const iterations = 210000;

const hex = (bytes) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export function isDemoCredential(value) {
  return (
    value?.scheme === "pbkdf2-sha256" &&
    value.iterations === iterations &&
    /^[a-f0-9]{32}$/.test(value.salt) &&
    /^[a-f0-9]{64}$/.test(value.hash)
  );
}

async function derive(password, salt) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("cryptoUnavailable");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const bytes = Uint8Array.from(salt.match(/../g), (part) =>
    parseInt(part, 16),
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: bytes,
      iterations,
      hash: "SHA-256",
    },
    key,
    256,
  );

  return hex(new Uint8Array(bits));
}

export async function createDemoCredential(password) {
  if (
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 128
  ) {
    throw new Error("invalidPassword");
  }

  if (!globalThis.crypto?.subtle) {
    throw new Error("cryptoUnavailable");
  }

  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));

  return {
    scheme: "pbkdf2-sha256",
    iterations,
    salt,
    hash: await derive(password, salt),
  };
}

export async function verifyDemoCredential(password, credential) {
  if (!isDemoCredential(credential)) return false;

  return (await derive(password, credential.salt)) === credential.hash;
}