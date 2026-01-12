/**
 * Mobile Security Detector
 * React Native / Expo Specific
 *
 * Detects:
 * - Insecure data storage (AsyncStorage for sensitive data)
 * - Missing certificate pinning
 * - Debuggable builds
 * - Insecure deep linking
 * - Console logging in production
 * - Clipboard security issues
 * - Missing biometric authentication for sensitive operations
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
  return `MOBILE-${String(++vulnIdCounter).padStart(3, "0")}`;
}

function generatePositiveId(): string {
  return `MOBILE-POS-${String(++positiveIdCounter).padStart(3, "0")}`;
}

/**
 * Main mobile security detector
 */
export async function detectMobileVulnerabilities(
  ctx: SecurityDetectionContext
): Promise<SecurityDetectorResult> {
  const { framework } = ctx;

  // Only run for mobile frameworks
  if (framework !== "react-native" && framework !== "expo") {
    return { vulnerabilities: [], positivePatterns: [] };
  }

  const vulnerabilities: SecurityVulnerability[] = [];
  const positivePatterns: PositiveSecurityPractice[] = [];

  // Run all sub-detectors
  vulnerabilities.push(...detectInsecureStorage(ctx));
  vulnerabilities.push(...detectMissingCertPinning(ctx));
  vulnerabilities.push(...detectDeepLinkVulnerabilities(ctx));
  vulnerabilities.push(...detectMobileConsoleLogging(ctx));
  vulnerabilities.push(...detectClipboardIssues(ctx));
  vulnerabilities.push(...detectDebuggableConfig(ctx));

  // Detect positive patterns
  positivePatterns.push(...detectPositiveMobilePatterns(ctx));

  return { vulnerabilities, positivePatterns };
}

/**
 * Detect insecure storage of sensitive data
 */
function detectInsecureStorage(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath, imports, framework } = ctx;

  // Check if AsyncStorage is used for sensitive data
  const hasAsyncStorage = imports.some(
    (imp) =>
      imp.source === "@react-native-async-storage/async-storage" ||
      imp.source === "react-native" && imp.specifiers.includes("AsyncStorage")
  );

  if (hasAsyncStorage) {
    // Pattern for storing sensitive data in AsyncStorage
    const sensitiveStoragePatterns = [
      { regex: /AsyncStorage\.setItem\s*\(\s*['"`][^'"`]*token/gi, data: "token" },
      { regex: /AsyncStorage\.setItem\s*\(\s*['"`][^'"`]*password/gi, data: "password" },
      { regex: /AsyncStorage\.setItem\s*\(\s*['"`][^'"`]*secret/gi, data: "secret" },
      { regex: /AsyncStorage\.setItem\s*\(\s*['"`][^'"`]*auth/gi, data: "auth data" },
      { regex: /AsyncStorage\.setItem\s*\(\s*['"`][^'"`]*session/gi, data: "session" },
      { regex: /AsyncStorage\.setItem\s*\(\s*['"`][^'"`]*credential/gi, data: "credential" },
      { regex: /AsyncStorage\.setItem\s*\(\s*['"`][^'"`]*apiKey/gi, data: "API key" },
    ];

    for (const pattern of sensitiveStoragePatterns) {
      const matches = content.matchAll(pattern.regex);
      for (const match of matches) {
        const lineNumber = content.substring(0, match.index).split("\n").length;

        vulnerabilities.push({
          id: generateVulnId(),
          category: "mobile",
          owasp: "A02:2021-Cryptographic Failures",
          severity: "high",
          status: "needs_fix",
          title: `Insecure Storage of ${pattern.data}`,
          description: `Sensitive ${pattern.data} stored in AsyncStorage which is unencrypted`,
          location: {
            file: relativePath,
            line: lineNumber,
            codeSnippet: match[0],
          },
          risk: "AsyncStorage data can be extracted from device backups, rooted devices, or malware",
          remediation: framework === "expo"
            ? "Use expo-secure-store: SecureStore.setItemAsync(key, value)"
            : "Use react-native-keychain or react-native-encrypted-storage",
          cweId: "CWE-922",
          confidence: 0.9,
          framework,
          autoFixable: false,
          references: ["https://docs.expo.dev/versions/latest/sdk/securestore/"],
        });
      }
    }
  }

  // Check for MMKV without encryption for sensitive data
  const hasMMKV = imports.some((imp) => imp.source === "react-native-mmkv");
  if (hasMMKV) {
    const mmkvSensitivePatterns = [
      { regex: /\.set\s*\(\s*['"`][^'"`]*token/gi, data: "token" },
      { regex: /\.set\s*\(\s*['"`][^'"`]*password/gi, data: "password" },
      { regex: /\.set\s*\(\s*['"`][^'"`]*secret/gi, data: "secret" },
    ];

    // Check if MMKV encryption is configured
    const hasMMKVEncryption = content.includes("encryptionKey");

    if (!hasMMKVEncryption) {
      for (const pattern of mmkvSensitivePatterns) {
        const matches = content.matchAll(pattern.regex);
        for (const match of matches) {
          const lineNumber = content.substring(0, match.index).split("\n").length;

          vulnerabilities.push({
            id: generateVulnId(),
            category: "mobile",
            owasp: "A02:2021-Cryptographic Failures",
            severity: "medium",
            status: "needs_fix",
            title: `MMKV Without Encryption Storing ${pattern.data}`,
            description: "MMKV storing sensitive data without encryption enabled",
            location: {
              file: relativePath,
              line: lineNumber,
              codeSnippet: match[0],
            },
            risk: "MMKV data without encryption can be read if device is compromised",
            remediation: "Enable MMKV encryption: new MMKV({ id: 'secure', encryptionKey: 'key' })",
            cweId: "CWE-311",
            confidence: 0.75,
            framework,
            autoFixable: false,
          });
        }
      }
    }
  }

  return vulnerabilities;
}

/**
 * Detect missing certificate pinning
 */
function detectMissingCertPinning(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath, imports, framework } = ctx;

  // Check if network requests are made
  const hasNetworkRequests =
    content.includes("fetch(") ||
    content.includes("axios") ||
    imports.some((imp) => imp.source === "axios");

  if (!hasNetworkRequests) return vulnerabilities;

  // Check for SSL pinning libraries/configuration
  const hasCertPinning =
    imports.some((imp) =>
      imp.source === "react-native-ssl-pinning" ||
      imp.source === "react-native-cert-pinner" ||
      imp.source === "ssl-pinning"
    ) ||
    content.includes("sslPinning") ||
    content.includes("certPin");

  // Check if this is a network config file
  const isNetworkFile =
    relativePath.includes("api") ||
    relativePath.includes("network") ||
    relativePath.includes("http") ||
    relativePath.includes("client");

  if (isNetworkFile && !hasCertPinning) {
    vulnerabilities.push({
      id: generateVulnId(),
      category: "mobile",
      owasp: "A02:2021-Cryptographic Failures",
      severity: "medium",
      status: "review",
      title: "Missing Certificate Pinning",
      description: "Network requests do not appear to use SSL certificate pinning",
      location: { file: relativePath, line: 0 },
      risk: "Without cert pinning, MITM attacks can intercept traffic with rogue certificates",
      remediation: "Implement certificate pinning using react-native-ssl-pinning or native config",
      cweId: "CWE-295",
      confidence: 0.5,
      framework,
      autoFixable: false,
    });
  }

  return vulnerabilities;
}

/**
 * Detect deep link vulnerabilities
 */
function detectDeepLinkVulnerabilities(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath, imports, ast, framework } = ctx;

  // Check for deep linking usage
  const hasDeepLinking =
    imports.some((imp) => imp.source === "expo-linking" || imp.specifiers?.includes("Linking")) ||
    content.includes("Linking.addEventListener") ||
    content.includes("Linking.openURL");

  if (!hasDeepLinking) return vulnerabilities;

  // Check for URL validation
  const hasUrlValidation =
    content.includes("validateUrl") ||
    content.includes("isValidUrl") ||
    content.includes("allowedSchemes") ||
    content.includes("allowedHosts") ||
    content.includes("whitelist");

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // Linking.openURL without validation
    if (
      node.type === "CallExpression" &&
      node.callee?.type === "MemberExpression" &&
      node.callee?.property?.name === "openURL"
    ) {
      // Check if the URL is a variable (potentially user-controlled)
      const urlArg = node.arguments?.[0];
      if (urlArg?.type === "Identifier" && !hasUrlValidation) {
        vulnerabilities.push({
          id: generateVulnId(),
          category: "mobile",
          owasp: "A01:2021-Broken Access Control",
          severity: "medium",
          status: "needs_fix",
          title: "Deep Link Without URL Validation",
          description: "Linking.openURL called with variable URL without apparent validation",
          location: {
            file: relativePath,
            line: node.loc?.start?.line || 0,
            codeSnippet: getCodeSnippet(content, node.loc?.start?.line),
          },
          risk: "Malicious deep links can redirect users to phishing sites or trigger unintended actions",
          remediation: "Validate URL scheme and host against allowlist before opening",
          cweId: "CWE-601",
          confidence: 0.7,
          framework,
          autoFixable: false,
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

  // Check for deep link handler without validation (event listener pattern)
  if (content.includes("Linking.addEventListener") && !hasUrlValidation) {
    vulnerabilities.push({
      id: generateVulnId(),
      category: "mobile",
      owasp: "A01:2021-Broken Access Control",
      severity: "medium",
      status: "review",
      title: "Deep Link Handler Without Validation",
      description: "Deep link event handler does not appear to validate incoming URLs",
      location: { file: relativePath, line: 0 },
      risk: "Malicious apps can send deep links to trigger unintended behavior",
      remediation: "Validate incoming URL scheme, host, and parameters before processing",
      cweId: "CWE-20",
      confidence: 0.6,
      framework,
      autoFixable: false,
    });
  }

  return vulnerabilities;
}

/**
 * Detect console logging in production mobile code
 */
function detectMobileConsoleLogging(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath, framework } = ctx;

  // Skip test files
  if (relativePath.includes(".test.") || relativePath.includes(".spec.")) {
    return vulnerabilities;
  }

  // Check for __DEV__ guard
  const hasDevGuard = content.includes("__DEV__") || content.includes("if (__DEV__)");

  // Count console statements
  const consoleMatches = content.matchAll(/console\.(log|debug|info|trace)\s*\(/g);
  const consoleOccurrences = [];
  for (const match of consoleMatches) {
    const lineNumber = content.substring(0, match.index).split("\n").length;
    consoleOccurrences.push({ line: lineNumber, match: match[0] });
  }

  if (consoleOccurrences.length > 3 && !hasDevGuard) {
    vulnerabilities.push({
      id: generateVulnId(),
      category: "mobile",
      owasp: "A09:2021-Logging Failures",
      severity: "low",
      status: "review",
      title: "Console Logging Without __DEV__ Guard",
      description: `Found ${consoleOccurrences.length} console.log statements without __DEV__ check`,
      location: {
        file: relativePath,
        line: consoleOccurrences[0]?.line || 0,
      },
      risk: "Console logs in production mobile apps can be read via device logs, leaking sensitive info",
      remediation: "Wrap console.log in __DEV__ check: if (__DEV__) console.log(...)",
      cweId: "CWE-532",
      confidence: 0.6,
      framework,
      autoFixable: true,
      autoFixSuggestion: "Wrap with: if (__DEV__) { console.log(...) }",
    });
  }

  // Check for sensitive data logging
  const sensitiveLogPatterns = [
    /console\.log\s*\([^)]*token/gi,
    /console\.log\s*\([^)]*password/gi,
    /console\.log\s*\([^)]*secret/gi,
    /console\.log\s*\([^)]*user/gi,
    /console\.log\s*\([^)]*auth/gi,
  ];

  for (const pattern of sensitiveLogPatterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const lineNumber = content.substring(0, match.index).split("\n").length;

      vulnerabilities.push({
        id: generateVulnId(),
        category: "mobile",
        owasp: "A09:2021-Logging Failures",
        severity: "medium",
        status: "needs_fix",
        title: "Sensitive Data in Console Log",
        description: "Console log may contain sensitive data",
        location: {
          file: relativePath,
          line: lineNumber,
          codeSnippet: match[0],
        },
        risk: "Sensitive data in logs can be accessed via device diagnostic tools",
        remediation: "Remove sensitive data from logs or use __DEV__ guard",
        cweId: "CWE-532",
        confidence: 0.7,
        framework,
        autoFixable: false,
      });
    }
  }

  return vulnerabilities;
}

/**
 * Detect clipboard security issues
 */
function detectClipboardIssues(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath, imports, framework } = ctx;

  // Check for clipboard usage
  const hasClipboard =
    imports.some((imp) =>
      imp.source === "@react-native-clipboard/clipboard" ||
      imp.source === "expo-clipboard"
    ) ||
    content.includes("Clipboard.setString") ||
    content.includes("setStringAsync");

  if (!hasClipboard) return vulnerabilities;

  // Check for sensitive data being copied to clipboard
  const clipboardSensitivePatterns = [
    { regex: /Clipboard\.setString\s*\([^)]*token/gi, data: "token" },
    { regex: /Clipboard\.setString\s*\([^)]*password/gi, data: "password" },
    { regex: /Clipboard\.setString\s*\([^)]*secret/gi, data: "secret" },
    { regex: /setStringAsync\s*\([^)]*token/gi, data: "token" },
    { regex: /setStringAsync\s*\([^)]*password/gi, data: "password" },
  ];

  for (const pattern of clipboardSensitivePatterns) {
    const matches = content.matchAll(pattern.regex);
    for (const match of matches) {
      const lineNumber = content.substring(0, match.index).split("\n").length;

      vulnerabilities.push({
        id: generateVulnId(),
        category: "mobile",
        owasp: "A02:2021-Cryptographic Failures",
        severity: "medium",
        status: "review",
        title: `Sensitive Data Copied to Clipboard: ${pattern.data}`,
        description: `${pattern.data} may be copied to clipboard where other apps can access it`,
        location: {
          file: relativePath,
          line: lineNumber,
          codeSnippet: match[0],
        },
        risk: "Clipboard data can be read by other apps on the device",
        remediation: "Avoid copying sensitive data to clipboard, or clear it after a timeout",
        cweId: "CWE-200",
        confidence: 0.7,
        framework,
        autoFixable: false,
      });
    }
  }

  return vulnerabilities;
}

/**
 * Detect debuggable configuration
 */
function detectDebuggableConfig(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath, framework } = ctx;

  // Check for Expo config files
  if (relativePath.includes("app.json") || relativePath.includes("app.config")) {
    // Check for missing production config
    if (!content.includes('"android"') && !content.includes("'android'")) {
      return vulnerabilities; // Not an app config we care about
    }

    // Check for debug flags
    if (content.includes('"debuggable": true') || content.includes('"enableHermes": false')) {
      vulnerabilities.push({
        id: generateVulnId(),
        category: "mobile",
        owasp: "A05:2021-Security Misconfiguration",
        severity: "high",
        status: "needs_fix",
        title: "Debuggable Build Configuration",
        description: "App configuration has debug options enabled",
        location: { file: relativePath, line: 0 },
        risk: "Debuggable apps can be analyzed and manipulated by attackers",
        remediation: "Ensure debuggable is false in production builds",
        cweId: "CWE-489",
        confidence: 0.9,
        framework,
        autoFixable: false,
      });
    }
  }

  return vulnerabilities;
}

/**
 * Detect positive mobile security patterns
 */
function detectPositiveMobilePatterns(ctx: SecurityDetectionContext): PositiveSecurityPractice[] {
  const patterns: PositiveSecurityPractice[] = [];
  const { imports, relativePath, content, framework } = ctx;

  // Check for SecureStore usage (Expo)
  if (imports.some((imp) => imp.source === "expo-secure-store")) {
    patterns.push({
      id: generatePositiveId(),
      category: "mobile",
      title: "Secure Storage with expo-secure-store",
      description: "Uses expo-secure-store for sensitive data storage",
      location: { file: relativePath },
      benefit: "Data stored securely using iOS Keychain / Android Keystore",
      framework,
    });
  }

  // Check for react-native-keychain
  if (imports.some((imp) => imp.source === "react-native-keychain")) {
    patterns.push({
      id: generatePositiveId(),
      category: "mobile",
      title: "Secure Credentials with react-native-keychain",
      description: "Uses react-native-keychain for credential storage",
      location: { file: relativePath },
      benefit: "Credentials stored in device secure enclave",
      framework,
    });
  }

  // Check for biometric authentication
  if (
    imports.some(
      (imp) =>
        imp.source === "expo-local-authentication" ||
        imp.source === "react-native-biometrics" ||
        imp.source === "react-native-touch-id"
    )
  ) {
    patterns.push({
      id: generatePositiveId(),
      category: "mobile",
      title: "Biometric Authentication",
      description: "Uses biometric authentication for sensitive operations",
      location: { file: relativePath },
      benefit: "Strong user authentication using device biometrics",
      framework,
    });
  }

  // Check for __DEV__ guards
  if (content.includes("if (__DEV__)") || content.includes("__DEV__ &&")) {
    patterns.push({
      id: generatePositiveId(),
      category: "mobile",
      title: "Development-Only Guards",
      description: "Uses __DEV__ flag to guard development-only code",
      location: { file: relativePath },
      benefit: "Ensures debug code is stripped in production builds",
      framework,
    });
  }

  // Check for certificate pinning
  if (
    imports.some((imp) => imp.source === "react-native-ssl-pinning") ||
    content.includes("sslPinning")
  ) {
    patterns.push({
      id: generatePositiveId(),
      category: "mobile",
      title: "SSL Certificate Pinning",
      description: "Implements SSL certificate pinning for network requests",
      location: { file: relativePath },
      benefit: "Prevents MITM attacks with rogue certificates",
      framework,
    });
  }

  // Check for deep link validation
  if (content.includes("allowedSchemes") || content.includes("validateUrl") || content.includes("isValidDeepLink")) {
    patterns.push({
      id: generatePositiveId(),
      category: "mobile",
      title: "Deep Link Validation",
      description: "Validates deep links before processing",
      location: { file: relativePath },
      benefit: "Prevents malicious deep link exploitation",
      framework,
    });
  }

  return patterns;
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
export function resetMobileCounters(): void {
  vulnIdCounter = 0;
  positiveIdCounter = 0;
}
