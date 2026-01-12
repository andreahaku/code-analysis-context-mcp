/**
 * Dependency Vulnerability Detector
 *
 * Scans project dependencies for known security vulnerabilities using:
 * - OSV (Open Source Vulnerabilities) API
 * - npm audit (fallback)
 *
 * Maps to OWASP A06:2021 - Vulnerable and Outdated Components
 */

import * as fs from "fs";
import * as path from "path";
import type {
  SecurityVulnerability,
  PositiveSecurityPractice,
  SecurityDetectorResult,
  SecuritySeverity,
  FrameworkType,
} from "../types/index.js";

// ====================== Types ======================

interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  engines?: Record<string, string>;
  resolutions?: Record<string, string>;
  overrides?: Record<string, string>;
}

interface PackageLockDependency {
  version: string;
  resolved?: string;
  integrity?: string;
  dev?: boolean;
  optional?: boolean;
  dependencies?: Record<string, PackageLockDependency>;
}

interface PackageLockJson {
  name?: string;
  version?: string;
  lockfileVersion?: number;
  packages?: Record<string, {
    version?: string;
    resolved?: string;
    integrity?: string;
    dev?: boolean;
    dependencies?: Record<string, string>;
  }>;
  dependencies?: Record<string, PackageLockDependency>;
}

interface OSVVulnerability {
  id: string;
  summary?: string;
  details?: string;
  aliases?: string[];
  modified: string;
  published?: string;
  database_specific?: Record<string, unknown>;
  references?: Array<{
    type: string;
    url: string;
  }>;
  affected?: Array<{
    package: {
      ecosystem: string;
      name: string;
    };
    ranges?: Array<{
      type: string;
      events: Array<{ introduced?: string; fixed?: string }>;
    }>;
    versions?: string[];
    severity?: Array<{
      type: string;
      score: string;
    }>;
  }>;
  severity?: Array<{
    type: string;
    score: string;
  }>;
}

interface OSVQueryResponse {
  vulns?: OSVVulnerability[];
}

export interface DependencyInfo {
  name: string;
  version: string;
  isDev: boolean;
  isOptional: boolean;
  isPeer: boolean;
}

export interface DependencyVulnerability {
  package: string;
  installedVersion: string;
  vulnerableVersions?: string;
  severity: SecuritySeverity;
  cveIds: string[];
  ghsaId?: string;
  osvId?: string;
  title: string;
  description: string;
  fixedIn?: string;
  recommendation: string;
  url?: string;
  cwes?: string[];
}

export interface DependencyScanResult extends SecurityDetectorResult {
  dependencies: {
    total: number;
    production: number;
    development: number;
    vulnerable: number;
  };
  vulnerabilities: SecurityVulnerability[];
  dependencyVulnerabilities: DependencyVulnerability[];
}

// ====================== OSV API Client ======================

const OSV_API_URL = "https://api.osv.dev/v1/query";
const OSV_BATCH_URL = "https://api.osv.dev/v1/querybatch";

/**
 * Query OSV API for vulnerabilities in a single package
 */
async function queryOSV(
  packageName: string,
  version: string
): Promise<OSVVulnerability[]> {
  try {
    const response = await fetch(OSV_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        package: {
          ecosystem: "npm",
          name: packageName,
        },
        version: version,
      }),
    });

    if (!response.ok) {
      console.error(`OSV API error for ${packageName}: ${response.status}`);
      return [];
    }

    const data = (await response.json()) as OSVQueryResponse;
    return data.vulns || [];
  } catch (error) {
    console.error(`Failed to query OSV for ${packageName}:`, error);
    return [];
  }
}

/**
 * Batch query OSV API for multiple packages
 */
async function queryOSVBatch(
  packages: Array<{ name: string; version: string }>
): Promise<Map<string, OSVVulnerability[]>> {
  const results = new Map<string, OSVVulnerability[]>();

  // OSV batch endpoint accepts up to 1000 queries
  const batchSize = 1000;
  for (let i = 0; i < packages.length; i += batchSize) {
    const batch = packages.slice(i, i + batchSize);

    try {
      const response = await fetch(OSV_BATCH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          queries: batch.map((pkg) => ({
            package: {
              ecosystem: "npm",
              name: pkg.name,
            },
            version: pkg.version,
          })),
        }),
      });

      if (!response.ok) {
        console.error(`OSV batch API error: ${response.status}`);
        // Fall back to individual queries
        for (const pkg of batch) {
          const vulns = await queryOSV(pkg.name, pkg.version);
          results.set(`${pkg.name}@${pkg.version}`, vulns);
        }
        continue;
      }

      const data = (await response.json()) as { results: OSVQueryResponse[] };
      batch.forEach((pkg, index) => {
        const key = `${pkg.name}@${pkg.version}`;
        results.set(key, data.results[index]?.vulns || []);
      });
    } catch (error) {
      console.error("OSV batch query failed:", error);
      // Fall back to individual queries for this batch
      for (const pkg of batch) {
        const vulns = await queryOSV(pkg.name, pkg.version);
        results.set(`${pkg.name}@${pkg.version}`, vulns);
      }
    }
  }

  return results;
}

// ====================== Helpers ======================

/**
 * Parse a version string, handling ranges and special characters
 */
function parseVersion(versionSpec: string): string {
  // Remove common prefixes
  let version = versionSpec
    .replace(/^[\^~>=<]+/, "")
    .replace(/\s+\|\|.*$/, "") // Remove || alternatives
    .replace(/\s+-\s+.*$/, "") // Remove range end
    .trim();

  // Handle workspace protocol
  if (version.startsWith("workspace:")) {
    version = version.replace("workspace:", "").replace(/[\^~*]/, "");
  }

  // Handle npm protocol
  if (version.startsWith("npm:")) {
    const match = version.match(/@([\d.]+)/);
    if (match) version = match[1];
  }

  // Handle git URLs
  if (version.includes("git") || version.includes("github")) {
    return "0.0.0"; // Can't check git URLs
  }

  // Handle file URLs
  if (version.startsWith("file:")) {
    return "0.0.0";
  }

  // Handle latest/next tags
  if (version === "latest" || version === "next" || version === "*") {
    return "0.0.0";
  }

  return version || "0.0.0";
}

/**
 * Map CVSS score to severity level
 */
function cvssToSeverity(score: number): SecuritySeverity {
  if (score >= 9.0) return "critical";
  if (score >= 7.0) return "high";
  if (score >= 4.0) return "medium";
  if (score >= 0.1) return "low";
  return "info";
}

/**
 * Extract severity from OSV vulnerability
 */
function extractSeverity(vuln: OSVVulnerability): SecuritySeverity {
  // Check severity array first
  const severities = vuln.severity || vuln.affected?.[0]?.severity;
  if (severities && severities.length > 0) {
    for (const sev of severities) {
      if (sev.type === "CVSS_V3" || sev.type === "CVSS_V2") {
        const match = sev.score.match(/(\d+\.?\d*)/);
        if (match) {
          return cvssToSeverity(parseFloat(match[1]));
        }
      }
    }
  }

  // Check database_specific for npm severity
  const dbSpecific = vuln.database_specific as Record<string, unknown> | undefined;
  if (dbSpecific?.severity) {
    const sev = String(dbSpecific.severity).toLowerCase();
    if (sev === "critical") return "critical";
    if (sev === "high") return "high";
    if (sev === "moderate" || sev === "medium") return "medium";
    if (sev === "low") return "low";
  }

  // Default based on ID prefix
  if (vuln.id.startsWith("GHSA-")) return "high";
  return "medium";
}

/**
 * Extract CVE IDs from OSV vulnerability
 */
function extractCVEs(vuln: OSVVulnerability): string[] {
  const cves: string[] = [];

  // Check aliases
  if (vuln.aliases) {
    for (const alias of vuln.aliases) {
      if (alias.startsWith("CVE-")) {
        cves.push(alias);
      }
    }
  }

  // Check ID itself
  if (vuln.id.startsWith("CVE-")) {
    cves.push(vuln.id);
  }

  return [...new Set(cves)];
}

/**
 * Extract fixed version from OSV vulnerability
 */
function extractFixedVersion(vuln: OSVVulnerability): string | undefined {
  for (const affected of vuln.affected || []) {
    for (const range of affected.ranges || []) {
      for (const event of range.events) {
        if (event.fixed) {
          return event.fixed;
        }
      }
    }
  }
  return undefined;
}

/**
 * Extract reference URL from OSV vulnerability
 */
function extractReferenceUrl(vuln: OSVVulnerability): string | undefined {
  // Prefer GitHub advisory URLs
  for (const ref of vuln.references || []) {
    if (ref.url.includes("github.com/advisories")) {
      return ref.url;
    }
  }

  // Then npm audit URLs
  for (const ref of vuln.references || []) {
    if (ref.url.includes("npmjs.com/advisories")) {
      return ref.url;
    }
  }

  // Any advisory URL
  for (const ref of vuln.references || []) {
    if (ref.type === "ADVISORY") {
      return ref.url;
    }
  }

  // First URL
  return vuln.references?.[0]?.url;
}

// ====================== Main Detection Function ======================

/**
 * Scan dependencies for vulnerabilities
 */
export async function detectDependencyVulnerabilities(
  projectPath: string,
  framework: FrameworkType,
  options: {
    includeDev?: boolean;
    includeOptional?: boolean;
    maxConcurrent?: number;
  } = {}
): Promise<DependencyScanResult> {
  const { includeDev = true, includeOptional = false } = options;

  const vulnerabilities: SecurityVulnerability[] = [];
  const positivePatterns: PositiveSecurityPractice[] = [];
  const dependencyVulnerabilities: DependencyVulnerability[] = [];

  // Read package.json
  const packageJsonPath = path.join(projectPath, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return {
      dependencies: { total: 0, production: 0, development: 0, vulnerable: 0 },
      vulnerabilities: [],
      positivePatterns: [],
      dependencyVulnerabilities: [],
    };
  }

  let packageJson: PackageJson;
  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  } catch {
    return {
      dependencies: { total: 0, production: 0, development: 0, vulnerable: 0 },
      vulnerabilities: [],
      positivePatterns: [],
      dependencyVulnerabilities: [],
    };
  }

  // Collect all dependencies
  const dependencies: DependencyInfo[] = [];

  // Production dependencies
  for (const [name, version] of Object.entries(packageJson.dependencies || {})) {
    dependencies.push({
      name,
      version: parseVersion(version),
      isDev: false,
      isOptional: false,
      isPeer: false,
    });
  }

  // Development dependencies
  if (includeDev) {
    for (const [name, version] of Object.entries(packageJson.devDependencies || {})) {
      dependencies.push({
        name,
        version: parseVersion(version),
        isDev: true,
        isOptional: false,
        isPeer: false,
      });
    }
  }

  // Peer dependencies
  for (const [name, version] of Object.entries(packageJson.peerDependencies || {})) {
    dependencies.push({
      name,
      version: parseVersion(version),
      isDev: false,
      isOptional: false,
      isPeer: true,
    });
  }

  // Optional dependencies
  if (includeOptional) {
    for (const [name, version] of Object.entries(packageJson.optionalDependencies || {})) {
      dependencies.push({
        name,
        version: parseVersion(version),
        isDev: false,
        isOptional: true,
        isPeer: false,
      });
    }
  }

  // Try to get exact versions from lockfile
  const lockfilePath = path.join(projectPath, "package-lock.json");
  let lockfile: PackageLockJson | undefined;
  if (fs.existsSync(lockfilePath)) {
    try {
      lockfile = JSON.parse(fs.readFileSync(lockfilePath, "utf-8"));

      // Update versions from lockfile for accuracy
      if (lockfile) {
        for (const dep of dependencies) {
          // Check v2/v3 lockfile format (packages)
          if (lockfile.packages) {
            const pkgKey = `node_modules/${dep.name}`;
            const pkgInfo = lockfile.packages[pkgKey];
            if (pkgInfo?.version) {
              dep.version = pkgInfo.version;
            }
          }
          // Check v1 lockfile format (dependencies)
          else if (lockfile.dependencies) {
            const depInfo = lockfile.dependencies[dep.name];
            if (depInfo?.version) {
              dep.version = depInfo.version;
            }
          }
        }
      }
    } catch {
      // Continue with package.json versions
    }
  }

  // Filter out packages with invalid versions
  const validDependencies = dependencies.filter(
    (dep) => dep.version !== "0.0.0" && /^\d+\.\d+/.test(dep.version)
  );

  // Query OSV for all dependencies
  const packagesToQuery = validDependencies.map((dep) => ({
    name: dep.name,
    version: dep.version,
  }));

  let vulnMap: Map<string, OSVVulnerability[]>;
  try {
    vulnMap = await queryOSVBatch(packagesToQuery);
  } catch {
    // If batch fails, return empty results
    vulnMap = new Map();
  }

  // Process results
  let vulnIdCounter = 1;
  const prodCount = dependencies.filter((d) => !d.isDev).length;
  const devCount = dependencies.filter((d) => d.isDev).length;
  let vulnerableCount = 0;

  for (const dep of validDependencies) {
    const key = `${dep.name}@${dep.version}`;
    const vulns = vulnMap.get(key) || [];

    if (vulns.length > 0) {
      vulnerableCount++;
    }

    for (const vuln of vulns) {
      const severity = extractSeverity(vuln);
      const cves = extractCVEs(vuln);
      const fixedVersion = extractFixedVersion(vuln);
      const refUrl = extractReferenceUrl(vuln);

      const depVuln: DependencyVulnerability = {
        package: dep.name,
        installedVersion: dep.version,
        severity,
        cveIds: cves,
        ghsaId: vuln.id.startsWith("GHSA-") ? vuln.id : undefined,
        osvId: vuln.id,
        title: vuln.summary || `Vulnerability in ${dep.name}`,
        description: vuln.details || vuln.summary || "No description available",
        fixedIn: fixedVersion,
        recommendation: fixedVersion
          ? `Upgrade ${dep.name} to version ${fixedVersion} or later`
          : `Review the vulnerability and consider alternatives to ${dep.name}`,
        url: refUrl,
      };

      dependencyVulnerabilities.push(depVuln);

      // Create SecurityVulnerability for integration with security analyzer
      const secVuln: SecurityVulnerability = {
        id: `DEP-${String(vulnIdCounter++).padStart(3, "0")}`,
        category: "crypto", // A06 maps closest to crypto in our categories
        owasp: "A06:2021-Vulnerable Components",
        severity,
        status: "needs_fix",
        title: `${dep.name}@${dep.version}: ${vuln.summary || "Known vulnerability"}`,
        description: vuln.details || vuln.summary || `Vulnerability found in ${dep.name}`,
        location: {
          file: "package.json",
          line: 0,
          codeSnippet: `"${dep.name}": "${dep.version}"`,
        },
        risk: `Using ${dep.name}@${dep.version} which has a known ${severity} severity vulnerability${cves.length > 0 ? ` (${cves.join(", ")})` : ""}`,
        remediation: depVuln.recommendation,
        cweId: cves.length > 0 ? cves[0] : undefined,
        confidence: 0.95, // High confidence - from vulnerability database
        framework,
        autoFixable: !!fixedVersion,
        autoFixSuggestion: fixedVersion ? `npm update ${dep.name}` : undefined,
        references: refUrl ? [refUrl] : [],
      };

      vulnerabilities.push(secVuln);
    }
  }

  // Detect positive patterns
  // Check for lockfile (good practice)
  if (lockfile) {
    positivePatterns.push({
      id: "DEP-POS-001",
      category: "dependencies",
      title: "Package Lockfile Present",
      description: "Project uses package-lock.json to lock dependency versions",
      location: { file: "package-lock.json" },
      benefit: "Ensures consistent, reproducible builds and prevents supply chain attacks from dependency updates",
      framework,
    });
  }

  // Check for engine constraints
  if (packageJson.engines) {
    positivePatterns.push({
      id: "DEP-POS-002",
      category: "dependencies",
      title: "Node.js Engine Constraints",
      description: `Project specifies Node.js version constraints: ${JSON.stringify(packageJson.engines)}`,
      location: { file: "package.json" },
      benefit: "Ensures compatibility and security by enforcing minimum runtime versions",
      framework,
    });
  }

  // Check for npm overrides or yarn resolutions (security patches)
  if (packageJson.overrides || packageJson.resolutions) {
    positivePatterns.push({
      id: "DEP-POS-003",
      category: "dependencies",
      title: "Dependency Overrides/Resolutions",
      description: "Project uses overrides/resolutions to patch transitive dependencies",
      location: { file: "package.json" },
      benefit: "Allows fixing vulnerabilities in nested dependencies without waiting for upstream updates",
      framework,
    });
  }

  // Check for .npmrc with security settings
  const npmrcPath = path.join(projectPath, ".npmrc");
  if (fs.existsSync(npmrcPath)) {
    const npmrcContent = fs.readFileSync(npmrcPath, "utf-8");

    if (npmrcContent.includes("audit=true") || !npmrcContent.includes("audit=false")) {
      positivePatterns.push({
        id: "DEP-POS-004",
        category: "dependencies",
        title: "npm Audit Enabled",
        description: "npm audit is enabled (default or explicit)",
        location: { file: ".npmrc" },
        benefit: "Automatically checks for known vulnerabilities during install",
        framework,
      });
    }

    if (npmrcContent.includes("ignore-scripts=true")) {
      positivePatterns.push({
        id: "DEP-POS-005",
        category: "dependencies",
        title: "npm Scripts Disabled",
        description: "npm install scripts are disabled for security",
        location: { file: ".npmrc" },
        benefit: "Prevents malicious code execution during package installation",
        framework,
      });
    }
  }

  // Check for Snyk or other security tools
  const snykPath = path.join(projectPath, ".snyk");
  if (fs.existsSync(snykPath)) {
    positivePatterns.push({
      id: "DEP-POS-006",
      category: "dependencies",
      title: "Snyk Security Configuration",
      description: "Project has Snyk configuration for dependency scanning",
      location: { file: ".snyk" },
      benefit: "Continuous monitoring and automated fixes for vulnerabilities",
      framework,
    });
  }

  // Check for renovate/dependabot config
  const renovatePaths = [
    "renovate.json",
    "renovate.json5",
    ".renovaterc",
    ".renovaterc.json",
    ".github/renovate.json",
    ".github/dependabot.yml",
    ".github/dependabot.yaml",
  ];

  for (const configPath of renovatePaths) {
    const fullPath = path.join(projectPath, configPath);
    if (fs.existsSync(fullPath)) {
      const toolName = configPath.includes("dependabot") ? "Dependabot" : "Renovate";
      positivePatterns.push({
        id: "DEP-POS-007",
        category: "dependencies",
        title: `${toolName} Automated Updates`,
        description: `Project uses ${toolName} for automated dependency updates`,
        location: { file: configPath },
        benefit: "Automatically creates PRs for dependency updates including security patches",
        framework,
      });
      break;
    }
  }

  return {
    dependencies: {
      total: dependencies.length,
      production: prodCount,
      development: devCount,
      vulnerable: vulnerableCount,
    },
    vulnerabilities,
    positivePatterns,
    dependencyVulnerabilities,
  };
}

/**
 * Generate summary of dependency vulnerabilities for reporting
 */
export function generateDependencySummary(
  result: DependencyScanResult
): string {
  const { dependencies, dependencyVulnerabilities } = result;

  const lines: string[] = [];
  lines.push("## Dependency Vulnerability Summary\n");
  lines.push(`**Total Dependencies:** ${dependencies.total}`);
  lines.push(`- Production: ${dependencies.production}`);
  lines.push(`- Development: ${dependencies.development}`);
  lines.push(`- Vulnerable: ${dependencies.vulnerable}\n`);

  if (dependencyVulnerabilities.length === 0) {
    lines.push("✅ No known vulnerabilities found in dependencies.\n");
    return lines.join("\n");
  }

  // Group by severity
  const bySeverity: Record<SecuritySeverity, DependencyVulnerability[]> = {
    critical: [],
    high: [],
    medium: [],
    low: [],
    info: [],
  };

  for (const vuln of dependencyVulnerabilities) {
    bySeverity[vuln.severity].push(vuln);
  }

  // Output by severity
  for (const severity of ["critical", "high", "medium", "low", "info"] as SecuritySeverity[]) {
    const vulns = bySeverity[severity];
    if (vulns.length === 0) continue;

    const emoji =
      severity === "critical" ? "🔴" :
      severity === "high" ? "🟠" :
      severity === "medium" ? "🟡" :
      severity === "low" ? "🟢" : "🔵";

    lines.push(`### ${emoji} ${severity.toUpperCase()} (${vulns.length})\n`);

    for (const vuln of vulns) {
      lines.push(`#### ${vuln.package}@${vuln.installedVersion}`);
      lines.push(`- **${vuln.title}**`);
      if (vuln.cveIds.length > 0) {
        lines.push(`- CVE: ${vuln.cveIds.join(", ")}`);
      }
      if (vuln.ghsaId) {
        lines.push(`- GHSA: ${vuln.ghsaId}`);
      }
      if (vuln.fixedIn) {
        lines.push(`- Fixed in: ${vuln.fixedIn}`);
      }
      lines.push(`- **Recommendation:** ${vuln.recommendation}`);
      if (vuln.url) {
        lines.push(`- [More info](${vuln.url})`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}
