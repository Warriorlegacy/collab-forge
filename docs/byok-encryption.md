# BYOK Encryption in a Multi-Provider AI Gateway

Most AI products store API keys server-side. That's a single point of failure
and a privacy risk. Here's how I built a Bring Your Own Key (BYOK) system where
the server never sees raw keys.

## The Threat Model

If an attacker gets read access to the database, they shouldn't get usable API
keys. Server-side encryption isn't enough — the server holds the key.

## The Solution: Dual-Layer AES-256-GCM

### Layer 1: Client-Side Encryption (Browser)

Keys are encrypted in the browser using WebCrypto before they ever leave:

```typescript
async function encryptKey(rawKey: string, provider: string): Promise<string> {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(rawKey)
  );
  // Store encrypted blob + IV; key stays in sessionStorage
  return btoa(JSON.stringify({ iv: Array.from(iv), data: Array.from(new Uint8Array(encrypted)) }));
}
```

The raw key lives in `sessionStorage` — it's never sent to the server, only the
encrypted blob is.

### Layer 2: Server-Side Encryption (Legacy Support)

For keys stored before client-side encryption was added, the server can decrypt
using a master key derived from `SECRETS_MASTER_KEY`:

```typescript
export function decryptSecret(encryptedBase64: string, masterKey: string): string {
  const key = crypto.createHash("sha256").update(masterKey).digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  return decipher.update(encryptedData, "base64", "utf8");
}
```

## Audit Logging

Keys never appear in logs. Only provider name + userId:

```typescript
logger.info("BYOK key test", { provider, userId }); // ✓
logger.info("BYOK key test", { key: rawKey });       // ✗ Never do this
```

## The Gateway

The multi-provider gateway uses priority-based fallback with 3-strike cooldown:

1. LovableAI (priority 1, auto-provisioned)
2. Groq (priority 2, fastest free Llama)
3. Cerebras (priority 3, wafer-scale)
4. NVIDIA (priority 4, Nemotron)
5. OpenRouter (priority 5, DeepSeek)
6. Gemini (priority 6)
7. Ollama (priority 7, self-hosted)
8. Mistral (priority 8)

After 3 failures, a provider is disabled for 5 minutes. Health checks run every
30 minutes to re-enable recovered providers.

## Full Code

See **[Signhify_Studio](https://github.com/Warriorlegacy/Signhify_Studio)** for
the complete implementation, including the `byok-client.ts` and
`robust-ai-service.ts` modules.
