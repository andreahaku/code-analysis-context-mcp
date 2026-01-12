/**
 * Dependency Vulnerability Detector
 *
 * Scans project dependencies for known security vulnerabilities using:
 * - OSV (Open Source Vulnerabilities) API
 *
 * Maps to OWASP A06:2021 - Vulnerable and Outdated Components
 */

import * as fs from "fs";
import * as path from "path";
import type { FrameworkType } from "../../types/index.js";
import type {
  PackageJson,
  PackageLockJson,
  DependencyInfo,
  DependencyVulnerability,
  DependencyScanResult,
  SecurityVulnerability,
  PositiveSecurityPractice,
} from "./types.js";
import {
  queryOSVBatch,
  extractSeverity,
  extractCVEs,
  extractFixedVersion,
  extractReferenceUrl,
} from "./osv-client.js";

// Re-export types for external use
export type { DependencyScanResult, DependencyVulnerability, DependencyInfo };

// ====================== Constants ======================

const INVALID_VERSION = "0.0.0";
const DEFAULT_CONFIDENCE = 0.95;

// Paths to check for dependency automation tools
const DEPENDENCY_AUTOMATION_PATHS = [
  "renovate.json",
  "renovate.json5",
  ".renovaterc",
  ".renovaterc.json",
  ".github/renovate.json",
  ".github/dependabot.yml",
  ".github/dependabot.yaml",
];

// ====================== Version Parsing ======================

/**
 * Parse a version string, handling ranges and special characters
 */
function parseVersion(versionSpec: string): string {
  // Remove common prefixes (^, ~, >=, etc.)
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

  // Handle git URLs - can't check these
  if (version.includes("git") || version.includes("github")) {
    return INVALID_VERSION;
  }

  // Handle file URLs
  if (version.startsWith("file:")) {
    return INVALID_VERSION;
  }

  // Handle latest/next tags
  if (version === "latest" || version === "next" || version === "*") {
    return INVALID_VERSION;
  }

  return version || INVALID_VERSION;
}

/**
 * Check if a version string is valid for vulnerability checking
 */
function isValidVersion(version: string): boolean {
  return version !== INVALID_VERSION && /^\d+\.\d+/.test(version);
}

// ====================== Dependency Collection ======================

/**
 * Collect dependencies from package.json
 */
function collectDependencies(
  packageJson: PackageJson,
  options: { includeDev: boolean; includeOptional: boolean }
): DependencyInfo[] {
  const dependencies: DependencyInfo[] = [];
  const { includeDev, includeOptional } = options;

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

  return dependencies;
}

/**
 * Update dependency versions from lockfile for accuracy
 */
function updateVersionsFromLockfile(
  dependencies: DependencyInfo[],
  lockfile: PackageLockJson
): void {
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

// ====================== Positive Patterns Detection ======================

/**
 * Detect positive security patterns in the project
 */
function detectPositivePatterns(
  projectPath: string,
  packageJson: PackageJson,
  hasLockfile: boolean,
  framework: FrameworkType
): PositiveSecurityPractice[] {
  const patterns: PositiveSecurityPractice[] = [];

  // Check for lockfile (good practice)
  if (hasLockfile) {
    patterns.push({
      id: "DEP-POS-001",
      category: "dependencies",
      title: "Package Lockfile Present",
      description: "Project uses package-lock.json to lock dependency versions",
      location: { file: "package-lock.json" },
      benefit: "Ensures consistent, reproducible builds and prevents supply chain attacks",
      framework,
    });
  }

  // Check for engine constraints
  if (packageJson.engines) {
    patterns.push({
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
    patterns.push({
      id: "DEP-POS-003",
      category: "dependencies",
      title: "Dependency Overrides/Resolutions",
      description: "Project uses overrides/resolutions to patch transitive dependencies",
      location: { file: "package.json" },
      benefit: "Allows fixing vulnerabilities in nested dependencies",
      framework,
    });
  }

  // Check for .npmrc with security settings
  detectNpmrcPatterns(projectPath, framework, patterns);

  // Check for Snyk configuration
  const snykPath = path.join(projectPath, ".snyk");
  if (fs.existsSync(snykPath)) {
    patterns.push({
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
  detectDependencyAutomation(projectPath, framework, patterns);

  return patterns;
}

/**
 * Detect .npmrc security patterns
 */
function detectNpmrcPatterns(
  projectPath: string,
  framework: FrameworkType,
  patterns: PositiveSecurityPractice[]
): void {
  const npmrcPath = path.join(projectPath, ".npmrc");
  if (!fs.existsSync(npmrcPath)) return;

  const npmrcContent = fs.readFileSync(npmrcPath, "utf-8");

  if (npmrcContent.includes("audit=true") || !npmrcContent.includes("audit=false")) {
    patterns.push({
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
    patterns.push({
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

/**
 * Detect dependency automation tools (Renovate, Dependabot)
 */
function detectDependencyAutomation(
  projectPath: string,
  framework: FrameworkType,
  patterns: PositiveSecurityPractice[]
): void {
  for (const configPath of DEPENDENCY_AUTOMATION_PATHS) {
    const fullPath = path.join(projectPath, configPath);
    if (fs.existsSync(fullPath)) {
      const toolName = configPath.includes("dependabot") ? "Dependabot" : "Renovate";
      patterns.push({
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
  } = {}
): Promise<DependencyScanResult> {
  const { includeDev = true, includeOptional = false } = options;

  const emptyResult: DependencyScanResult = {
    dependencies: { total: 0, production: 0, development: 0, vulnerable: 0 },
    vulnerabilities: [],
    positivePatterns: [],
    dependencyVulnerabilities: [],
  };

  // Read package.json
  const packageJsonPath = path.join(projectPath, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return emptyResult;
  }

  let packageJson: PackageJson;
  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  } catch {
    return emptyResult;
  }

  // Collect all dependencies
  const dependencies = collectDependencies(packageJson, { includeDev, includeOptional });

  // Try to get exact versions from lockfile
  const lockfilePath = path.join(projectPath, "package-lock.json");
  let hasLockfile = false;
  if (fs.existsSync(lockfilePath)) {
    try {
      const lockfile: PackageLockJson = JSON.parse(fs.readFileSync(lockfilePath, "utf-8"));
      updateVersionsFromLockfile(dependencies, lockfile);
      hasLockfile = true;
    } catch {
      // Continue with package.json versions
    }
  }

  // Filter out packages with invalid versions
  const validDependencies = dependencies.filter((dep) => isValidVersion(dep.version));

  // Query OSV for all dependencies
  const packagesToQuery = validDependencies.map((dep) => ({
    name: dep.name,
    version: dep.version,
  }));

  let vulnMap: Map<string, import("./types.js").OSVVulnerability[]>;
  try {
    vulnMap = await queryOSVBatch(packagesToQuery);
  } catch {
    vulnMap = new Map();
  }

  // Process results
  const vulnerabilities: SecurityVulnerability[] = [];
  const dependencyVulnerabilities: DependencyVulnerability[] = [];
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
      const cveInfo = cves.length > 0 ? ` (${cves.join(", ")})` : "";
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
        risk: `Using ${dep.name}@${dep.version} which has a known ${severity} severity vulnerability${cveInfo}`,
        remediation: depVuln.recommendation,
        cweId: cves.length > 0 ? cves[0] : undefined,
        confidence: DEFAULT_CONFIDENCE,
        framework,
        autoFixable: !!fixedVersion,
        autoFixSuggestion: fixedVersion ? `npm update ${dep.name}` : undefined,
        references: refUrl ? [refUrl] : [],
      };

      vulnerabilities.push(secVuln);
    }
  }

  // Detect positive patterns
  const positivePatterns = detectPositivePatterns(
    projectPath,
    packageJson,
    hasLockfile,
    framework
  );

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

// Re-export summary generator
export { generateDependencySummary } from "./summary.js";
