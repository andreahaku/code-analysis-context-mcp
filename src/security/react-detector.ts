/**
 * React Web Security Detector
 * React / Next.js Specific
 *
 * Detects:
 * - XSS via dangerouslySetInnerHTML and innerHTML
 * - Unsafe ref usage with user data
 * - URL/href injection vulnerabilities
 * - Open redirect vulnerabilities
 * - CSRF issues in forms
 * - Sensitive data exposure in state/props
 * - Next.js server component data leaks
 * - Unsafe eval patterns in React context
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
  return `REACT-${String(++vulnIdCounter).padStart(3, "0")}`;
}

function generatePositiveId(): string {
  return `REACT-POS-${String(++positiveIdCounter).padStart(3, "0")}`;
}

/**
 * Main React security detector
 */
export async function detectReactVulnerabilities(
  ctx: SecurityDetectionContext
): Promise<SecurityDetectorResult> {
  const { framework, content } = ctx;

  // Only run for React (not React Native/Expo which have their own detector)
  if (framework !== "react" && framework !== "node") {
    // Check if it's a React file in a Node project
    const isReactFile = content.includes("from 'react'") ||
                        content.includes('from "react"') ||
                        content.includes("import React");
    if (!isReactFile) {
      return { vulnerabilities: [], positivePatterns: [] };
    }
  }

  const vulnerabilities: SecurityVulnerability[] = [];
  const positivePatterns: PositiveSecurityPractice[] = [];

  // Run all sub-detectors
  vulnerabilities.push(...detectDangerouslySetInnerHTML(ctx));
  vulnerabilities.push(...detectUnsafeRefUsage(ctx));
  vulnerabilities.push(...detectUrlInjection(ctx));
  vulnerabilities.push(...detectOpenRedirects(ctx));
  vulnerabilities.push(...detectCsrfIssues(ctx));
  vulnerabilities.push(...detectSensitiveStateExposure(ctx));
  vulnerabilities.push(...detectNextJsLeaks(ctx));
  vulnerabilities.push(...detectUnsafeEvalPatterns(ctx));

  // Detect positive patterns
  positivePatterns.push(...detectPositiveReactPatterns(ctx));

  return { vulnerabilities, positivePatterns };
}

/**
 * Detect dangerouslySetInnerHTML and innerHTML usage
 */
function detectDangerouslySetInnerHTML(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath } = ctx;

  // Check for dangerouslySetInnerHTML
  const dangerousMatches = content.matchAll(/dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html\s*:\s*([^}]+)\}/g);

  for (const match of dangerousMatches) {
    const lineNumber = content.substring(0, match.index).split("\n").length;
    const htmlSource = match[1].trim();

    // Check if the HTML source is from user input (variable, prop, state)
    const isUserControlled = !htmlSource.startsWith('"') &&
                             !htmlSource.startsWith("'") &&
                             !htmlSource.startsWith("`") &&
                             !htmlSource.includes("DOMPurify") &&
                             !htmlSource.includes("sanitize");

    if (isUserControlled) {
      vulnerabilities.push({
        id: generateVulnId(),
        category: "injection",
        owasp: "A03:2021-Injection",
        severity: "high",
        status: "needs_fix",
        title: "XSS via dangerouslySetInnerHTML",
        description: "dangerouslySetInnerHTML used with potentially unsanitized content",
        location: {
          file: relativePath,
          line: lineNumber,
          codeSnippet: match[0].substring(0, 100),
        },
        risk: "Attacker-controlled HTML can execute arbitrary JavaScript in user's browser",
        remediation: "Sanitize HTML with DOMPurify: dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }}",
        cweId: "CWE-79",
        confidence: 0.85,
        framework: "react",
        autoFixable: true,
        autoFixSuggestion: `import DOMPurify from 'dompurify';\ndangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(${htmlSource}) }}`,
        references: ["https://react.dev/reference/react-dom/components/common#dangerously-setting-the-inner-html"],
      });
    }
  }

  // Check for innerHTML via refs
  const innerHtmlRefPattern = /\.current\.innerHTML\s*=/g;
  const innerHtmlMatches = content.matchAll(innerHtmlRefPattern);

  for (const match of innerHtmlMatches) {
    const lineNumber = content.substring(0, match.index).split("\n").length;

    vulnerabilities.push({
      id: generateVulnId(),
      category: "injection",
      owasp: "A03:2021-Injection",
      severity: "high",
      status: "needs_fix",
      title: "XSS via ref.current.innerHTML",
      description: "Direct innerHTML assignment through React ref",
      location: {
        file: relativePath,
        line: lineNumber,
        codeSnippet: getCodeSnippet(content, lineNumber),
      },
      risk: "Bypasses React's XSS protections by directly manipulating DOM",
      remediation: "Use React's built-in rendering or sanitize with DOMPurify",
      cweId: "CWE-79",
      confidence: 0.9,
      framework: "react",
      autoFixable: false,
    });
  }

  return vulnerabilities;
}

/**
 * Detect unsafe ref usage patterns
 */
function detectUnsafeRefUsage(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath } = ctx;

  // Detect refs being passed user-controlled data for DOM manipulation
  const unsafeRefPatterns = [
    {
      regex: /\.current\.(outerHTML|insertAdjacentHTML)\s*[=(]/g,
      method: "outerHTML/insertAdjacentHTML"
    },
    {
      regex: /\.current\.setAttribute\s*\(\s*['"`]on\w+/gi,
      method: "setAttribute with event handler"
    },
    {
      regex: /\.current\.src\s*=\s*[^'"`;]+(?:props|state|params|query)/gi,
      method: "src with user data"
    },
  ];

  for (const pattern of unsafeRefPatterns) {
    const matches = content.matchAll(pattern.regex);
    for (const match of matches) {
      const lineNumber = content.substring(0, match.index).split("\n").length;

      vulnerabilities.push({
        id: generateVulnId(),
        category: "injection",
        owasp: "A03:2021-Injection",
        severity: "medium",
        status: "review",
        title: `Unsafe Ref DOM Manipulation: ${pattern.method}`,
        description: `Direct DOM manipulation via ref using ${pattern.method}`,
        location: {
          file: relativePath,
          line: lineNumber,
          codeSnippet: match[0],
        },
        risk: "Direct DOM manipulation can bypass React's security model",
        remediation: "Use React's declarative API instead of direct DOM manipulation",
        cweId: "CWE-79",
        confidence: 0.7,
        framework: "react",
        autoFixable: false,
      });
    }
  }

  return vulnerabilities;
}

/**
 * Detect URL/href injection vulnerabilities
 */
function detectUrlInjection(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath } = ctx;

  // Check for href with javascript: protocol possibility
  const hrefPatterns = [
    {
      regex: /href\s*=\s*\{([^}]+)\}/g,
      type: "dynamic href"
    },
    {
      regex: /<a[^>]*href\s*=\s*\{`[^`]*\$\{[^}]+\}[^`]*`\}/g,
      type: "template literal href"
    },
  ];

  for (const pattern of hrefPatterns) {
    const matches = content.matchAll(pattern.regex);
    for (const match of matches) {
      const lineNumber = content.substring(0, match.index).split("\n").length;
      const hrefContent = match[1] || match[0];

      // Check if there's URL validation
      const hasValidation = content.includes("isValidUrl") ||
                           content.includes("validateUrl") ||
                           content.includes("startsWith('http')") ||
                           content.includes('startsWith("http")') ||
                           content.includes("URL(") ||
                           content.includes("sanitizeUrl");

      // Skip if it's clearly a safe pattern
      if (hrefContent.includes("encodeURI") ||
          hrefContent.startsWith('"') ||
          hrefContent.startsWith("'") ||
          hrefContent.includes("route") ||
          hrefContent.includes("path")) {
        continue;
      }

      if (!hasValidation) {
        vulnerabilities.push({
          id: generateVulnId(),
          category: "injection",
          owasp: "A03:2021-Injection",
          severity: "medium",
          status: "review",
          title: "Potential URL Injection in href",
          description: `Dynamic href value without apparent URL validation`,
          location: {
            file: relativePath,
            line: lineNumber,
            codeSnippet: match[0].substring(0, 80),
          },
          risk: "javascript: URLs can execute arbitrary code; data: URLs can be used for phishing",
          remediation: "Validate URL protocol: url.startsWith('http://') || url.startsWith('https://')",
          cweId: "CWE-79",
          confidence: 0.6,
          framework: "react",
          autoFixable: false,
          references: ["https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html"],
        });
      }
    }
  }

  // Check for window.open with user data
  const windowOpenMatches = content.matchAll(/window\.open\s*\(\s*([^,)]+)/g);
  for (const match of windowOpenMatches) {
    const urlArg = match[1].trim();
    const lineNumber = content.substring(0, match.index).split("\n").length;

    if (!urlArg.startsWith('"') && !urlArg.startsWith("'") && !urlArg.startsWith("`")) {
      vulnerabilities.push({
        id: generateVulnId(),
        category: "injection",
        owasp: "A03:2021-Injection",
        severity: "medium",
        status: "review",
        title: "Dynamic URL in window.open",
        description: "window.open called with dynamic URL",
        location: {
          file: relativePath,
          line: lineNumber,
          codeSnippet: match[0],
        },
        risk: "Can be exploited for phishing or javascript: protocol attacks",
        remediation: "Validate URL protocol before opening",
        cweId: "CWE-601",
        confidence: 0.65,
        framework: "react",
        autoFixable: false,
      });
    }
  }

  return vulnerabilities;
}

/**
 * Detect open redirect vulnerabilities
 */
function detectOpenRedirects(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath } = ctx;

  // Check for redirect patterns with user input
  const redirectPatterns = [
    {
      regex: /window\.location(?:\.href)?\s*=\s*([^;]+)/g,
      method: "window.location"
    },
    {
      regex: /location\.replace\s*\(\s*([^)]+)\)/g,
      method: "location.replace"
    },
    {
      regex: /location\.assign\s*\(\s*([^)]+)\)/g,
      method: "location.assign"
    },
    {
      regex: /navigate\s*\(\s*([^)]+)\)/g,
      method: "navigate()"
    },
    {
      regex: /router\.push\s*\(\s*([^)]+)\)/g,
      method: "router.push"
    },
    {
      regex: /redirect\s*\(\s*([^)]+)\)/g,
      method: "redirect()"
    },
  ];

  for (const pattern of redirectPatterns) {
    const matches = content.matchAll(pattern.regex);
    for (const match of matches) {
      const lineNumber = content.substring(0, match.index).split("\n").length;
      const redirectTarget = match[1].trim();

      // Check if redirect target comes from user input
      const isUserControlled =
        redirectTarget.includes("searchParams") ||
        redirectTarget.includes("query") ||
        redirectTarget.includes("params") ||
        redirectTarget.includes("redirect") ||
        redirectTarget.includes("returnUrl") ||
        redirectTarget.includes("next") ||
        redirectTarget.includes("callback");

      // Check for validation
      const hasValidation =
        content.includes("isInternalUrl") ||
        content.includes("validateRedirect") ||
        content.includes("allowedRedirects") ||
        content.includes("isSafeUrl");

      if (isUserControlled && !hasValidation) {
        vulnerabilities.push({
          id: generateVulnId(),
          category: "access_control",
          owasp: "A01:2021-Broken Access Control",
          severity: "high",
          status: "needs_fix",
          title: `Open Redirect via ${pattern.method}`,
          description: "Redirect destination from user input without validation",
          location: {
            file: relativePath,
            line: lineNumber,
            codeSnippet: match[0].substring(0, 100),
          },
          risk: "Attackers can redirect users to malicious sites for phishing",
          remediation: "Validate redirect URLs against allowlist of internal paths",
          cweId: "CWE-601",
          confidence: 0.8,
          framework: "react",
          autoFixable: false,
          references: ["https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html"],
        });
      }
    }
  }

  return vulnerabilities;
}

/**
 * Detect CSRF issues in forms
 */
function detectCsrfIssues(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath } = ctx;

  // Check for forms with POST/PUT/DELETE without CSRF tokens
  const formMatches = content.matchAll(/<form[^>]*method\s*=\s*['"]?(post|put|delete)['"]?[^>]*>/gi);

  for (const match of formMatches) {
    const formStartIndex = match.index!;
    const lineNumber = content.substring(0, formStartIndex).split("\n").length;

    // Find the closing form tag
    const formEndMatch = content.substring(formStartIndex).match(/<\/form>/);
    if (!formEndMatch) continue;

    const formContent = content.substring(formStartIndex, formStartIndex + formEndMatch.index! + 7);

    // Check for CSRF token
    const hasCsrfToken =
      formContent.includes("csrf") ||
      formContent.includes("_token") ||
      formContent.includes("authenticity_token") ||
      formContent.includes("xsrf");

    if (!hasCsrfToken) {
      vulnerabilities.push({
        id: generateVulnId(),
        category: "access_control",
        owasp: "A01:2021-Broken Access Control",
        severity: "medium",
        status: "review",
        title: "Form Without CSRF Protection",
        description: `${match[1].toUpperCase()} form without apparent CSRF token`,
        location: {
          file: relativePath,
          line: lineNumber,
          codeSnippet: match[0],
        },
        risk: "Forms without CSRF protection can be exploited by malicious sites",
        remediation: "Add CSRF token to form or use SameSite cookies",
        cweId: "CWE-352",
        confidence: 0.6,
        framework: "react",
        autoFixable: false,
      });
    }
  }

  // Check for fetch/axios POST without CSRF headers
  const fetchPostMatches = content.matchAll(/fetch\s*\([^)]+,\s*\{[^}]*method\s*:\s*['"`](POST|PUT|DELETE)['"`][^}]*\}/gi);

  for (const match of fetchPostMatches) {
    const lineNumber = content.substring(0, match.index).split("\n").length;
    const fetchContent = match[0];

    const hasCsrfHeader =
      fetchContent.includes("csrf") ||
      fetchContent.includes("X-XSRF") ||
      fetchContent.includes("X-CSRF");

    // Check if credentials are included (which would require CSRF)
    const hasCredentials = fetchContent.includes("credentials");

    if (hasCredentials && !hasCsrfHeader) {
      vulnerabilities.push({
        id: generateVulnId(),
        category: "access_control",
        owasp: "A01:2021-Broken Access Control",
        severity: "medium",
        status: "review",
        title: "Fetch Request Without CSRF Header",
        description: "Credentialed fetch request without CSRF token header",
        location: {
          file: relativePath,
          line: lineNumber,
          codeSnippet: fetchContent.substring(0, 80),
        },
        risk: "Cross-origin requests with credentials need CSRF protection",
        remediation: "Add X-CSRF-Token header to requests",
        cweId: "CWE-352",
        confidence: 0.5,
        framework: "react",
        autoFixable: false,
      });
    }
  }

  return vulnerabilities;
}

/**
 * Detect sensitive data exposure in state/props
 */
function detectSensitiveStateExposure(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath } = ctx;

  // Check for sensitive data in useState
  const useStatePatterns = [
    { regex: /useState\s*<[^>]*>\s*\(\s*['"`][^'"`]*password/gi, data: "password" },
    { regex: /useState\s*\(\s*['"`][^'"`]*password/gi, data: "password" },
    { regex: /useState\s*<[^>]*>\s*\(\s*['"`][^'"`]*secret/gi, data: "secret" },
    { regex: /useState\s*<[^>]*>\s*\(\s*['"`][^'"`]*apiKey/gi, data: "API key" },
    { regex: /useState\s*<[^>]*>\s*\(\s*['"`][^'"`]*token/gi, data: "token" },
  ];

  for (const pattern of useStatePatterns) {
    const matches = content.matchAll(pattern.regex);
    for (const match of matches) {
      const lineNumber = content.substring(0, match.index).split("\n").length;

      vulnerabilities.push({
        id: generateVulnId(),
        category: "data_exposure",
        owasp: "A02:2021-Cryptographic Failures",
        severity: "medium",
        status: "review",
        title: `Sensitive Data (${pattern.data}) in React State`,
        description: `${pattern.data} stored in React state, visible in DevTools`,
        location: {
          file: relativePath,
          line: lineNumber,
          codeSnippet: match[0],
        },
        risk: "React DevTools in production can expose state values to attackers",
        remediation: "Avoid storing sensitive data in state; use secure session management",
        cweId: "CWE-200",
        confidence: 0.6,
        framework: "react",
        autoFixable: false,
      });
    }
  }

  // Check for sensitive data in component props interface/type
  const propsPatterns = [
    { regex: /interface\s+\w*Props[^{]*\{[^}]*password\s*:/gi, data: "password" },
    { regex: /type\s+\w*Props[^=]*=\s*\{[^}]*password\s*:/gi, data: "password" },
    { regex: /interface\s+\w*Props[^{]*\{[^}]*secret\s*:/gi, data: "secret" },
    { regex: /interface\s+\w*Props[^{]*\{[^}]*apiKey\s*:/gi, data: "API key" },
  ];

  for (const pattern of propsPatterns) {
    const matches = content.matchAll(pattern.regex);
    for (const match of matches) {
      const lineNumber = content.substring(0, match.index).split("\n").length;

      vulnerabilities.push({
        id: generateVulnId(),
        category: "data_exposure",
        owasp: "A02:2021-Cryptographic Failures",
        severity: "low",
        status: "review",
        title: `Sensitive Data (${pattern.data}) in Component Props`,
        description: `Component accepts ${pattern.data} as prop`,
        location: {
          file: relativePath,
          line: lineNumber,
        },
        risk: "Props containing sensitive data can be logged or exposed in error boundaries",
        remediation: "Avoid passing sensitive data through props; use secure context or API calls",
        cweId: "CWE-200",
        confidence: 0.5,
        framework: "react",
        autoFixable: false,
      });
    }
  }

  return vulnerabilities;
}

/**
 * Detect Next.js specific security issues
 */
function detectNextJsLeaks(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath, imports } = ctx;

  // Check if this is a Next.js file
  const isNextJs = imports.some(imp =>
    imp.source.startsWith("next/") ||
    imp.source === "next"
  ) || relativePath.includes("/pages/") ||
     relativePath.includes("/app/");

  if (!isNextJs) return vulnerabilities;

  // Check for server-side secrets exposed to client in getServerSideProps/getStaticProps
  const serverPropsPatterns = [
    /export\s+(async\s+)?function\s+getServerSideProps[^{]*\{[\s\S]*?return\s*\{[\s\S]*?props\s*:\s*\{([^}]+)\}/g,
    /export\s+(async\s+)?function\s+getStaticProps[^{]*\{[\s\S]*?return\s*\{[\s\S]*?props\s*:\s*\{([^}]+)\}/g,
  ];

  for (const pattern of serverPropsPatterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const propsContent = match[2] || "";
      const lineNumber = content.substring(0, match.index).split("\n").length;

      // Check for sensitive data in returned props
      if (propsContent.includes("secret") ||
          propsContent.includes("password") ||
          propsContent.includes("apiKey") ||
          propsContent.includes("privateKey") ||
          propsContent.includes("DATABASE")) {
        vulnerabilities.push({
          id: generateVulnId(),
          category: "data_exposure",
          owasp: "A02:2021-Cryptographic Failures",
          severity: "high",
          status: "needs_fix",
          title: "Server Secret Exposed to Client",
          description: "Server-side props may contain sensitive data sent to client",
          location: {
            file: relativePath,
            line: lineNumber,
          },
          risk: "Secrets in getServerSideProps/getStaticProps are serialized and sent to browser",
          remediation: "Never return secrets in props; use API routes for sensitive operations",
          cweId: "CWE-200",
          confidence: 0.8,
          framework: "react",
          autoFixable: false,
        });
      }
    }
  }

  // Check for 'use client' components accessing server-only imports
  if (content.includes("'use client'") || content.includes('"use client"')) {
    const serverOnlyImports = [
      "server-only",
      "fs",
      "path",
      "crypto",
      "child_process",
      "@/lib/db",
      "prisma",
      "mongoose",
    ];

    for (const serverImport of serverOnlyImports) {
      if (imports.some(imp => imp.source.includes(serverImport))) {
        const lineNumber = content.indexOf(serverImport);
        vulnerabilities.push({
          id: generateVulnId(),
          category: "misconfiguration",
          owasp: "A05:2021-Security Misconfiguration",
          severity: "high",
          status: "needs_fix",
          title: "Server-Only Import in Client Component",
          description: `'use client' component imports server-only module: ${serverImport}`,
          location: {
            file: relativePath,
            line: content.substring(0, lineNumber).split("\n").length,
          },
          risk: "Server-only code bundled in client can expose internals or cause errors",
          remediation: "Move server-only logic to Server Components or API routes",
          cweId: "CWE-200",
          confidence: 0.9,
          framework: "react",
          autoFixable: false,
        });
      }
    }
  }

  // Check for exposed environment variables in client code
  const envPatterns = [
    /process\.env\.(?!NEXT_PUBLIC_)\w+/g,
  ];

  if (content.includes("'use client'") || content.includes('"use client"')) {
    for (const pattern of envPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const lineNumber = content.substring(0, match.index).split("\n").length;

        vulnerabilities.push({
          id: generateVulnId(),
          category: "data_exposure",
          owasp: "A02:2021-Cryptographic Failures",
          severity: "medium",
          status: "review",
          title: "Non-Public Env Var in Client Component",
          description: `Accessing ${match[0]} in client component (won't work, may indicate intent to expose)`,
          location: {
            file: relativePath,
            line: lineNumber,
            codeSnippet: match[0],
          },
          risk: "Attempting to access server env vars in client indicates possible misconfiguration",
          remediation: "Use NEXT_PUBLIC_ prefix for client-safe env vars only",
          cweId: "CWE-200",
          confidence: 0.7,
          framework: "react",
          autoFixable: false,
        });
      }
    }
  }

  return vulnerabilities;
}

/**
 * Detect unsafe eval patterns in React context
 */
function detectUnsafeEvalPatterns(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath } = ctx;

  // Check for eval and Function constructor
  const evalPatterns = [
    { regex: /eval\s*\(\s*([^)]+)\)/g, method: "eval()" },
    { regex: /new\s+Function\s*\([^)]*\)/g, method: "new Function()" },
    { regex: /setTimeout\s*\(\s*['"`][^'"`]+['"`]/g, method: "setTimeout with string" },
    { regex: /setInterval\s*\(\s*['"`][^'"`]+['"`]/g, method: "setInterval with string" },
  ];

  for (const pattern of evalPatterns) {
    const matches = content.matchAll(pattern.regex);
    for (const match of matches) {
      const lineNumber = content.substring(0, match.index).split("\n").length;

      vulnerabilities.push({
        id: generateVulnId(),
        category: "injection",
        owasp: "A03:2021-Injection",
        severity: "high",
        status: "needs_fix",
        title: `Code Injection Risk: ${pattern.method}`,
        description: `${pattern.method} can execute arbitrary code`,
        location: {
          file: relativePath,
          line: lineNumber,
          codeSnippet: match[0].substring(0, 60),
        },
        risk: "Dynamic code execution can lead to XSS and remote code execution",
        remediation: "Avoid eval/Function; use JSON.parse for data, proper parsing for expressions",
        cweId: "CWE-95",
        confidence: 0.9,
        framework: "react",
        autoFixable: false,
      });
    }
  }

  return vulnerabilities;
}

/**
 * Detect positive React security patterns
 */
function detectPositiveReactPatterns(ctx: SecurityDetectionContext): PositiveSecurityPractice[] {
  const patterns: PositiveSecurityPractice[] = [];
  const { content, relativePath, imports } = ctx;

  // Check for DOMPurify usage
  if (imports.some(imp => imp.source === "dompurify" || imp.source === "isomorphic-dompurify")) {
    patterns.push({
      id: generatePositiveId(),
      category: "input_validation",
      title: "HTML Sanitization with DOMPurify",
      description: "Uses DOMPurify for sanitizing HTML content",
      location: { file: relativePath },
      benefit: "Prevents XSS attacks from user-generated HTML",
      framework: "react",
    });
  }

  // Check for proper error boundaries
  if (content.includes("componentDidCatch") || content.includes("ErrorBoundary")) {
    patterns.push({
      id: generatePositiveId(),
      category: "error_handling",
      title: "React Error Boundary",
      description: "Implements error boundary for graceful error handling",
      location: { file: relativePath },
      benefit: "Prevents error details from leaking to users",
      framework: "react",
    });
  }

  // Check for Content Security Policy meta tag
  if (content.includes("Content-Security-Policy") || content.includes("contentSecurityPolicy")) {
    patterns.push({
      id: generatePositiveId(),
      category: "headers",
      title: "Content Security Policy",
      description: "Implements Content Security Policy headers",
      location: { file: relativePath },
      benefit: "Mitigates XSS and data injection attacks",
      framework: "react",
    });
  }

  // Check for CSRF token handling
  if (content.includes("csrf") || content.includes("X-XSRF-TOKEN") || content.includes("X-CSRF-TOKEN")) {
    patterns.push({
      id: generatePositiveId(),
      category: "csrf_protection",
      title: "CSRF Token Implementation",
      description: "Implements CSRF token handling",
      location: { file: relativePath },
      benefit: "Protects against cross-site request forgery",
      framework: "react",
    });
  }

  // Check for URL validation utilities
  if (content.includes("isValidUrl") || content.includes("validateUrl") || content.includes("sanitizeUrl")) {
    patterns.push({
      id: generatePositiveId(),
      category: "input_validation",
      title: "URL Validation",
      description: "Implements URL validation before navigation",
      location: { file: relativePath },
      benefit: "Prevents open redirect and javascript: URL attacks",
      framework: "react",
    });
  }

  // Check for Helmet usage (security headers)
  if (imports.some(imp => imp.source === "react-helmet" || imp.source === "react-helmet-async")) {
    patterns.push({
      id: generatePositiveId(),
      category: "headers",
      title: "React Helmet for Security Headers",
      description: "Uses React Helmet for managing document head",
      location: { file: relativePath },
      benefit: "Enables proper security header configuration",
      framework: "react",
    });
  }

  // Check for authentication state protection patterns
  if (content.includes("useAuth") && (content.includes("isAuthenticated") || content.includes("isLoggedIn"))) {
    patterns.push({
      id: generatePositiveId(),
      category: "auth",
      title: "Authentication State Check",
      description: "Implements authentication state verification",
      location: { file: relativePath },
      benefit: "Ensures protected routes check authentication status",
      framework: "react",
    });
  }

  // Check for secure cookie handling
  if (content.includes("httpOnly") || content.includes("sameSite") || content.includes("Secure")) {
    patterns.push({
      id: generatePositiveId(),
      category: "cookies",
      title: "Secure Cookie Configuration",
      description: "Configures secure cookie attributes",
      location: { file: relativePath },
      benefit: "Protects cookies from XSS and CSRF attacks",
      framework: "react",
    });
  }

  return patterns;
}

/**
 * Helper to get code snippet around a line
 */
function getCodeSnippet(content: string, line: number, context: number = 1): string {
  const lines = content.split("\n");
  const start = Math.max(0, line - 1 - context);
  const end = Math.min(lines.length, line + context);
  return lines.slice(start, end).join("\n").substring(0, 200);
}

/**
 * Reset counters (useful for testing)
 */
export function resetReactCounters(): void {
  vulnIdCounter = 0;
  positiveIdCounter = 0;
}
