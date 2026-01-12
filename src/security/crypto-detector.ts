/**
 * Cryptographic Failures Detector
 * OWASP A02:2021 - Cryptographic Failures
 *
 * Detects:
 * - Hardcoded secrets (API keys, passwords, JWT secrets, AWS credentials)
 * - Weak crypto algorithms (MD5, SHA1, DES)
 * - Insecure random (Math.random for security purposes)
 * - Missing HTTPS enforcement
 * - Exposed credentials in code
 */

import type {
  SecurityDetectionContext,
  SecurityDetectorResult,
  SecurityVulnerability,
  PositiveSecurityPractice,
} from "../types/index.js";

let vulnIdCounter = 0;
let positiveIdCounter = 0;

function generateVulnId(): string {
  return `CRYPTO-${String(++vulnIdCounter).padStart(3, "0")}`;
}

function generatePositiveId(): string {
  return `CRYPTO-POS-${String(++positiveIdCounter).padStart(3, "0")}`;
}

// Patterns for detecting hardcoded secrets
const SECRET_PATTERNS = [
  // API Keys
  { regex: /['"`](sk_live_[a-zA-Z0-9]{20,})['"`]/g, type: "Stripe Secret Key", severity: "critical" as const },
  { regex: /['"`](pk_live_[a-zA-Z0-9]{20,})['"`]/g, type: "Stripe Publishable Key", severity: "high" as const },
  { regex: /['"`](sk_test_[a-zA-Z0-9]{20,})['"`]/g, type: "Stripe Test Key", severity: "medium" as const },
  { regex: /['"`](AKIA[0-9A-Z]{16})['"`]/g, type: "AWS Access Key", severity: "critical" as const },
  { regex: /['"`]([a-zA-Z0-9/+=]{40})['"`]/g, type: "AWS Secret Key (potential)", severity: "high" as const, minLength: 40, maxLength: 40 },
  { regex: /['"`](ghp_[a-zA-Z0-9]{36})['"`]/g, type: "GitHub Personal Access Token", severity: "critical" as const },
  { regex: /['"`](gho_[a-zA-Z0-9]{36})['"`]/g, type: "GitHub OAuth Token", severity: "critical" as const },
  { regex: /['"`](xox[baprs]-[a-zA-Z0-9-]{10,})['"`]/g, type: "Slack Token", severity: "critical" as const },
  { regex: /['"`](eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*)['"`]/g, type: "JWT Token", severity: "high" as const },

  // Generic patterns
  { regex: /api[_-]?key\s*[:=]\s*['"`]([^'"`]{16,})['"`]/gi, type: "API Key", severity: "high" as const },
  { regex: /api[_-]?secret\s*[:=]\s*['"`]([^'"`]{16,})['"`]/gi, type: "API Secret", severity: "critical" as const },
  { regex: /secret[_-]?key\s*[:=]\s*['"`]([^'"`]{8,})['"`]/gi, type: "Secret Key", severity: "critical" as const },
  { regex: /private[_-]?key\s*[:=]\s*['"`]([^'"`]{20,})['"`]/gi, type: "Private Key", severity: "critical" as const },
  { regex: /auth[_-]?token\s*[:=]\s*['"`]([^'"`]{16,})['"`]/gi, type: "Auth Token", severity: "critical" as const },
  { regex: /access[_-]?token\s*[:=]\s*['"`]([^'"`]{16,})['"`]/gi, type: "Access Token", severity: "critical" as const },
];

// Password patterns
const PASSWORD_PATTERNS = [
  { regex: /password\s*[:=]\s*['"`]([^'"`]{4,})['"`]/gi, type: "Hardcoded Password", severity: "critical" as const },
  { regex: /passwd\s*[:=]\s*['"`]([^'"`]{4,})['"`]/gi, type: "Hardcoded Password", severity: "critical" as const },
  { regex: /pwd\s*[:=]\s*['"`]([^'"`]{4,})['"`]/gi, type: "Hardcoded Password", severity: "critical" as const },
  { regex: /db[_-]?password\s*[:=]\s*['"`]([^'"`]{4,})['"`]/gi, type: "Database Password", severity: "critical" as const },
];

// Weak crypto patterns
const WEAK_CRYPTO_PATTERNS = [
  { regex: /createHash\s*\(\s*['"`]md5['"`]\s*\)/gi, algorithm: "MD5", severity: "medium" as const },
  { regex: /createHash\s*\(\s*['"`]sha1['"`]\s*\)/gi, algorithm: "SHA1", severity: "medium" as const },
  { regex: /createCipher\s*\(\s*['"`]des['"`]/gi, algorithm: "DES", severity: "high" as const },
  { regex: /createCipher\s*\(\s*['"`]des-ede['"`]/gi, algorithm: "3DES", severity: "medium" as const },
  { regex: /createCipher\s*\(\s*['"`]rc4['"`]/gi, algorithm: "RC4", severity: "high" as const },
  { regex: /createCipheriv?\s*\(\s*['"`]aes-128-ecb['"`]/gi, algorithm: "AES-ECB", severity: "high" as const },
];

/**
 * Main cryptographic failures detector
 */
export async function detectCryptoVulnerabilities(
  ctx: SecurityDetectionContext
): Promise<SecurityDetectorResult> {
  const vulnerabilities: SecurityVulnerability[] = [];
  const positivePatterns: PositiveSecurityPractice[] = [];

  // Run all sub-detectors
  vulnerabilities.push(...detectHardcodedSecrets(ctx));
  vulnerabilities.push(...detectHardcodedPasswords(ctx));
  vulnerabilities.push(...detectWeakCrypto(ctx));
  vulnerabilities.push(...detectInsecureRandom(ctx));
  vulnerabilities.push(...detectInsecureHTTP(ctx));
  vulnerabilities.push(...detectWeakJWT(ctx));

  // Detect positive patterns
  positivePatterns.push(...detectPositiveCryptoPatterns(ctx));

  return { vulnerabilities, positivePatterns };
}

/**
 * Detect hardcoded secrets in code
 */
function detectHardcodedSecrets(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath } = ctx;

  // Skip test files and mock data
  if (
    relativePath.includes(".test.") ||
    relativePath.includes(".spec.") ||
    relativePath.includes("__tests__") ||
    relativePath.includes("__mocks__") ||
    relativePath.includes("mock") ||
    relativePath.includes("fixture")
  ) {
    return vulnerabilities;
  }

  for (const pattern of SECRET_PATTERNS) {
    const matches = content.matchAll(pattern.regex);
    for (const match of matches) {
      const secret = match[1] || match[0];

      // Skip obvious placeholders
      if (
        secret.includes("xxx") ||
        secret.includes("XXX") ||
        secret.includes("your-") ||
        secret.includes("YOUR_") ||
        secret.includes("example") ||
        secret.includes("placeholder") ||
        secret === "undefined" ||
        secret === "null" ||
        /^[a-z_]+$/i.test(secret) // All lowercase with underscores (likely variable name)
      ) {
        continue;
      }

      // Check length constraints if specified
      if (pattern.minLength && secret.length < pattern.minLength) continue;
      if (pattern.maxLength && secret.length > pattern.maxLength) continue;

      const lineNumber = content.substring(0, match.index).split("\n").length;

      vulnerabilities.push({
        id: generateVulnId(),
        category: "crypto",
        owasp: "A02:2021-Cryptographic Failures",
        severity: pattern.severity,
        status: "needs_fix",
        title: `Hardcoded ${pattern.type}`,
        description: `Potential ${pattern.type.toLowerCase()} found in source code`,
        location: {
          file: relativePath,
          line: lineNumber,
          codeSnippet: maskSecret(match[0]),
        },
        risk: "Secrets in source code can be extracted from version control, builds, or decompiled code",
        remediation: "Move secrets to environment variables or a secure secrets manager (e.g., AWS Secrets Manager, HashiCorp Vault)",
        cweId: "CWE-798",
        confidence: 0.85,
        autoFixable: false,
        references: ["https://owasp.org/Top10/A02_2021-Cryptographic_Failures/"],
      });
    }
  }

  return vulnerabilities;
}

/**
 * Detect hardcoded passwords
 */
function detectHardcodedPasswords(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath } = ctx;

  // Skip test files
  if (
    relativePath.includes(".test.") ||
    relativePath.includes(".spec.") ||
    relativePath.includes("__tests__") ||
    relativePath.includes("mock")
  ) {
    return vulnerabilities;
  }

  for (const pattern of PASSWORD_PATTERNS) {
    const matches = content.matchAll(pattern.regex);
    for (const match of matches) {
      const password = match[1] || match[0];

      // Skip common false positives
      if (
        password.includes("process.env") ||
        password.includes("${") ||
        password === "password" ||
        password === "Password" ||
        /^[a-z_]+$/i.test(password)
      ) {
        continue;
      }

      const lineNumber = content.substring(0, match.index).split("\n").length;

      vulnerabilities.push({
        id: generateVulnId(),
        category: "crypto",
        owasp: "A02:2021-Cryptographic Failures",
        severity: pattern.severity,
        status: "needs_fix",
        title: pattern.type,
        description: "Password appears to be hardcoded in source code",
        location: {
          file: relativePath,
          line: lineNumber,
          codeSnippet: maskSecret(match[0]),
        },
        risk: "Hardcoded passwords can be extracted and used for unauthorized access",
        remediation: "Use environment variables: process.env.DB_PASSWORD",
        cweId: "CWE-259",
        confidence: 0.8,
        autoFixable: false,
      });
    }
  }

  return vulnerabilities;
}

/**
 * Detect weak cryptographic algorithms
 */
function detectWeakCrypto(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath, imports } = ctx;

  // Check if crypto is imported
  const hasCrypto = imports.some(
    (imp) => imp.source === "crypto" || imp.source === "node:crypto"
  );

  if (!hasCrypto) return vulnerabilities;

  for (const pattern of WEAK_CRYPTO_PATTERNS) {
    const matches = content.matchAll(pattern.regex);
    for (const match of matches) {
      const lineNumber = content.substring(0, match.index).split("\n").length;

      vulnerabilities.push({
        id: generateVulnId(),
        category: "crypto",
        owasp: "A02:2021-Cryptographic Failures",
        severity: pattern.severity,
        status: "needs_fix",
        title: `Weak Cryptographic Algorithm: ${pattern.algorithm}`,
        description: `Using ${pattern.algorithm} algorithm which is considered cryptographically weak`,
        location: {
          file: relativePath,
          line: lineNumber,
          codeSnippet: match[0],
        },
        risk: `${pattern.algorithm} is vulnerable to attacks and should not be used for security purposes`,
        remediation: getWeakCryptoRemediation(pattern.algorithm),
        cweId: "CWE-327",
        confidence: 0.95,
        autoFixable: false,
      });
    }
  }

  return vulnerabilities;
}

/**
 * Detect insecure random number generation
 */
function detectInsecureRandom(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { ast, relativePath, content } = ctx;

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // Math.random() in security context
    if (
      node.type === "CallExpression" &&
      node.callee?.type === "MemberExpression" &&
      node.callee?.object?.name === "Math" &&
      node.callee?.property?.name === "random"
    ) {
      // Check if it's used in a security context by looking at surrounding code
      const lineNumber = node.loc?.start?.line || 0;
      const lines = content.split("\n");
      const surroundingCode = lines.slice(Math.max(0, lineNumber - 3), lineNumber + 2).join(" ").toLowerCase();

      const securityContexts = ["token", "password", "secret", "key", "salt", "nonce", "id", "session", "random"];
      const isSecurityContext = securityContexts.some((ctx) => surroundingCode.includes(ctx));

      if (isSecurityContext) {
        vulnerabilities.push({
          id: generateVulnId(),
          category: "crypto",
          owasp: "A02:2021-Cryptographic Failures",
          severity: "medium",
          status: "needs_fix",
          title: "Insecure Random Number Generation",
          description: "Math.random() is not cryptographically secure and should not be used for security purposes",
          location: {
            file: relativePath,
            line: lineNumber,
            codeSnippet: getCodeSnippet(content, lineNumber),
          },
          risk: "Math.random() output can be predicted, making tokens/keys vulnerable to attack",
          remediation: "Use crypto.randomBytes() or crypto.randomUUID() for secure random values",
          cweId: "CWE-338",
          confidence: 0.75,
          autoFixable: true,
          autoFixSuggestion: "Replace with: crypto.randomBytes(32).toString('hex')",
        });
      }
    }

    // Recurse
    for (const key in node) {
      if (Array.isArray(node[key])) {
        node[key].forEach(checkNode);
      } else if (typeof node[key] === "object") {
        checkNode(node[key]);
      }
    }
  };

  checkNode(ast);
  return vulnerabilities;
}

/**
 * Detect insecure HTTP usage
 */
function detectInsecureHTTP(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath } = ctx;

  // Skip config files that might legitimately have http for local dev
  if (relativePath.includes("config") && relativePath.includes("dev")) {
    return vulnerabilities;
  }

  // Detect hardcoded HTTP URLs (not localhost)
  const httpUrlRegex = /['"`](http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)[^'"`\s]+)['"`]/g;
  const matches = content.matchAll(httpUrlRegex);

  for (const match of matches) {
    const url = match[1];

    // Skip obvious test/example URLs
    if (url.includes("example.com") || url.includes("test.") || url.includes("localhost")) {
      continue;
    }

    const lineNumber = content.substring(0, match.index).split("\n").length;

    vulnerabilities.push({
      id: generateVulnId(),
      category: "crypto",
      owasp: "A02:2021-Cryptographic Failures",
      severity: "medium",
      status: "review",
      title: "Insecure HTTP URL",
      description: "Non-HTTPS URL found which transmits data without encryption",
      location: {
        file: relativePath,
        line: lineNumber,
        codeSnippet: match[0],
      },
      risk: "Data transmitted over HTTP can be intercepted and modified (MITM attacks)",
      remediation: "Use HTTPS URLs for all external communication",
      cweId: "CWE-319",
      confidence: 0.7,
      autoFixable: true,
      autoFixSuggestion: `Replace with: ${url.replace("http://", "https://")}`,
    });
  }

  return vulnerabilities;
}

/**
 * Detect weak JWT configurations
 */
function detectWeakJWT(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { ast, relativePath, content, imports } = ctx;

  // Check if jsonwebtoken is imported
  const hasJWT = imports.some((imp) => imp.source === "jsonwebtoken" || imp.source === "jose");
  if (!hasJWT) return vulnerabilities;

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // jwt.sign() or jwt.verify() calls
    if (
      node.type === "CallExpression" &&
      node.callee?.type === "MemberExpression" &&
      (node.callee?.property?.name === "sign" || node.callee?.property?.name === "verify")
    ) {
      const options = node.arguments?.[2]; // Third argument is usually options

      if (options?.type === "ObjectExpression") {
        const algorithmProp = options.properties?.find(
          (p: any) => p.key?.name === "algorithm" || p.key?.value === "algorithm"
        );

        if (algorithmProp) {
          const algorithm = algorithmProp.value?.value;

          // Check for weak algorithms
          if (algorithm === "none") {
            vulnerabilities.push({
              id: generateVulnId(),
              category: "crypto",
              owasp: "A02:2021-Cryptographic Failures",
              severity: "critical",
              status: "needs_fix",
              title: "JWT with 'none' Algorithm",
              description: "JWT is configured to use 'none' algorithm which disables signature verification",
              location: {
                file: relativePath,
                line: node.loc?.start?.line || 0,
                codeSnippet: getCodeSnippet(content, node.loc?.start?.line),
              },
              risk: "Anyone can forge valid JWTs, bypassing authentication entirely",
              remediation: "Use a secure algorithm like RS256 or HS256 with a strong secret",
              cweId: "CWE-327",
              confidence: 0.95,
              autoFixable: false,
            });
          } else if (algorithm === "HS256" || algorithm === "HS384" || algorithm === "HS512") {
            // HMAC is OK but check if secret is weak
            const secretArg = node.arguments?.[1];
            if (secretArg?.type === "StringLiteral" && secretArg.value?.length < 32) {
              vulnerabilities.push({
                id: generateVulnId(),
                category: "crypto",
                owasp: "A02:2021-Cryptographic Failures",
                severity: "high",
                status: "needs_fix",
                title: "Weak JWT Secret",
                description: "JWT secret appears to be short or hardcoded",
                location: {
                  file: relativePath,
                  line: node.loc?.start?.line || 0,
                  codeSnippet: getCodeSnippet(content, node.loc?.start?.line),
                },
                risk: "Short secrets can be brute-forced, allowing JWT forgery",
                remediation: "Use a cryptographically random secret of at least 256 bits (32 bytes)",
                cweId: "CWE-326",
                confidence: 0.85,
                autoFixable: false,
              });
            }
          }
        }
      }
    }

    // Recurse
    for (const key in node) {
      if (Array.isArray(node[key])) {
        node[key].forEach(checkNode);
      } else if (typeof node[key] === "object") {
        checkNode(node[key]);
      }
    }
  };

  checkNode(ast);
  return vulnerabilities;
}

/**
 * Detect positive cryptographic patterns
 */
function detectPositiveCryptoPatterns(ctx: SecurityDetectionContext): PositiveSecurityPractice[] {
  const patterns: PositiveSecurityPractice[] = [];
  const { imports, relativePath, content } = ctx;

  // Check for bcrypt/argon2 password hashing
  const passwordHashingLibs = [
    { lib: "bcrypt", name: "bcrypt" },
    { lib: "bcryptjs", name: "bcrypt.js" },
    { lib: "argon2", name: "Argon2" },
    { lib: "scrypt", name: "scrypt" },
  ];

  for (const { lib, name } of passwordHashingLibs) {
    if (imports.some((imp) => imp.source === lib)) {
      patterns.push({
        id: generatePositiveId(),
        category: "crypto",
        title: `Secure Password Hashing with ${name}`,
        description: `Uses ${name} library for password hashing`,
        location: { file: relativePath },
        benefit: "Properly hashes passwords with salt, resistant to rainbow table attacks",
      });
      break;
    }
  }

  // Check for crypto.randomBytes usage
  if (content.includes("randomBytes") || content.includes("randomUUID")) {
    patterns.push({
      id: generatePositiveId(),
      category: "crypto",
      title: "Cryptographically Secure Random Generation",
      description: "Uses crypto.randomBytes() or crypto.randomUUID() for random values",
      location: { file: relativePath },
      benefit: "Generates unpredictable random values suitable for security tokens",
    });
  }

  // Check for environment variable usage for secrets
  const envPatterns = [
    /process\.env\.[A-Z_]*(?:KEY|SECRET|TOKEN|PASSWORD|API)/i,
    /import\.meta\.env\.[A-Z_]*(?:KEY|SECRET|TOKEN|PASSWORD)/i,
  ];

  for (const pattern of envPatterns) {
    if (pattern.test(content)) {
      patterns.push({
        id: generatePositiveId(),
        category: "crypto",
        title: "Secrets from Environment Variables",
        description: "Secrets are loaded from environment variables instead of hardcoding",
        location: { file: relativePath },
        benefit: "Separates secrets from code, enabling secure configuration management",
      });
      break;
    }
  }

  return patterns;
}

/**
 * Helper to mask secrets in output
 */
function maskSecret(text: string): string {
  // Keep first 4 and last 4 characters, mask the rest
  if (text.length <= 12) {
    return text.substring(0, 4) + "****";
  }
  return text.substring(0, 4) + "****" + text.substring(text.length - 4);
}

/**
 * Get remediation advice for weak crypto
 */
function getWeakCryptoRemediation(algorithm: string): string {
  const remediations: Record<string, string> = {
    MD5: "Use SHA-256 or SHA-3 for hashing, bcrypt/Argon2 for passwords",
    SHA1: "Use SHA-256 or SHA-3 for cryptographic hashing",
    DES: "Use AES-256-GCM for symmetric encryption",
    "3DES": "Use AES-256-GCM for symmetric encryption",
    RC4: "Use AES-256-GCM or ChaCha20-Poly1305",
    "AES-ECB": "Use AES-GCM or AES-CBC with proper IV handling",
  };
  return remediations[algorithm] || "Use modern cryptographic algorithms (AES-256-GCM, SHA-256, etc.)";
}

/**
 * Helper to get code snippet around a line
 */
function getCodeSnippet(content: string, line: number | undefined, context: number = 1): string {
  if (!line) return "";
  const lines = content.split("\n");
  const start = Math.max(0, line - 1 - context);
  const end = Math.min(lines.length, line + context);
  return lines.slice(start, end).join("\n").substring(0, 200);
}

/**
 * Reset counters (useful for testing)
 */
export function resetCryptoCounters(): void {
  vulnIdCounter = 0;
  positiveIdCounter = 0;
}
