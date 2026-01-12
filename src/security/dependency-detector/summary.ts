/**
 * Dependency Vulnerability Summary Generator
 *
 * Generates formatted reports of dependency vulnerabilities
 */

import type { DependencyScanResult, DependencyVulnerability, SecuritySeverity } from "./types.js";

// Severity display configuration
const SEVERITY_ORDER: SecuritySeverity[] = ["critical", "high", "medium", "low", "info"];
const SEVERITY_LABELS: Record<SecuritySeverity, string> = {
  critical: "[CRITICAL]",
  high: "[HIGH]",
  medium: "[MEDIUM]",
  low: "[LOW]",
  info: "[INFO]",
};

/**
 * Generate summary of dependency vulnerabilities for reporting
 */
export function generateDependencySummary(result: DependencyScanResult): string {
  const { dependencies, dependencyVulnerabilities } = result;

  const lines: string[] = [];
  lines.push("## Dependency Vulnerability Summary\n");
  lines.push(`**Total Dependencies:** ${dependencies.total}`);
  lines.push(`- Production: ${dependencies.production}`);
  lines.push(`- Development: ${dependencies.development}`);
  lines.push(`- Vulnerable: ${dependencies.vulnerable}\n`);

  if (dependencyVulnerabilities.length === 0) {
    lines.push("No known vulnerabilities found in dependencies.\n");
    return lines.join("\n");
  }

  // Group by severity
  const bySeverity = groupBySeverity(dependencyVulnerabilities);

  // Output by severity
  for (const severity of SEVERITY_ORDER) {
    const vulns = bySeverity[severity];
    if (vulns.length === 0) continue;

    lines.push(`### ${SEVERITY_LABELS[severity]} ${severity.toUpperCase()} (${vulns.length})\n`);

    for (const vuln of vulns) {
      formatVulnerability(vuln, lines);
    }
  }

  return lines.join("\n");
}

/**
 * Group vulnerabilities by severity
 */
function groupBySeverity(
  vulnerabilities: DependencyVulnerability[]
): Record<SecuritySeverity, DependencyVulnerability[]> {
  const grouped: Record<SecuritySeverity, DependencyVulnerability[]> = {
    critical: [],
    high: [],
    medium: [],
    low: [],
    info: [],
  };

  for (const vuln of vulnerabilities) {
    grouped[vuln.severity].push(vuln);
  }

  return grouped;
}

/**
 * Format a single vulnerability for output
 */
function formatVulnerability(vuln: DependencyVulnerability, lines: string[]): void {
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
