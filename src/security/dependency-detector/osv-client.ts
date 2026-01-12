/**
 * OSV (Open Source Vulnerabilities) API Client
 *
 * Queries the OSV database for npm package vulnerabilities.
 * OSV aggregates vulnerabilities from multiple sources including:
 * - GitHub Security Advisories (GHSA)
 * - National Vulnerability Database (NVD)
 * - npm Registry Advisories
 */

import type {
  OSVVulnerability,
  OSVQueryResponse,
  OSVBatchResponse,
  SecuritySeverity,
} from "./types.js";

// ====================== Constants ======================

const OSV_API_URL = "https://api.osv.dev/v1/query";
const OSV_BATCH_URL = "https://api.osv.dev/v1/querybatch";
const OSV_BATCH_SIZE = 1000;

// CVSS score thresholds for severity mapping
const CVSS_CRITICAL_THRESHOLD = 9.0;
const CVSS_HIGH_THRESHOLD = 7.0;
const CVSS_MEDIUM_THRESHOLD = 4.0;
const CVSS_LOW_THRESHOLD = 0.1;

// ====================== API Functions ======================

/**
 * Query OSV API for vulnerabilities in a single package
 */
export async function queryOSV(
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
      // Silently return empty on API errors - don't block the analysis
      return [];
    }

    const data = (await response.json()) as OSVQueryResponse;
    return data.vulns || [];
  } catch {
    // Network errors are expected in some environments - return empty
    return [];
  }
}

/**
 * Batch query OSV API for multiple packages
 * More efficient than individual queries for large dependency lists
 */
export async function queryOSVBatch(
  packages: Array<{ name: string; version: string }>
): Promise<Map<string, OSVVulnerability[]>> {
  const results = new Map<string, OSVVulnerability[]>();

  for (let i = 0; i < packages.length; i += OSV_BATCH_SIZE) {
    const batch = packages.slice(i, i + OSV_BATCH_SIZE);

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
        // Fall back to individual queries on batch API error
        await fallbackToIndividualQueries(batch, results);
        continue;
      }

      const data = (await response.json()) as OSVBatchResponse;
      batch.forEach((pkg, index) => {
        const key = `${pkg.name}@${pkg.version}`;
        results.set(key, data.results[index]?.vulns || []);
      });
    } catch {
      // Fall back to individual queries on network error
      await fallbackToIndividualQueries(batch, results);
    }
  }

  return results;
}

/**
 * Fallback to individual queries when batch API fails
 */
async function fallbackToIndividualQueries(
  packages: Array<{ name: string; version: string }>,
  results: Map<string, OSVVulnerability[]>
): Promise<void> {
  for (const pkg of packages) {
    const vulns = await queryOSV(pkg.name, pkg.version);
    results.set(`${pkg.name}@${pkg.version}`, vulns);
  }
}

// ====================== Extraction Helpers ======================

/**
 * Map CVSS score to severity level
 */
export function cvssToSeverity(score: number): SecuritySeverity {
  if (score >= CVSS_CRITICAL_THRESHOLD) return "critical";
  if (score >= CVSS_HIGH_THRESHOLD) return "high";
  if (score >= CVSS_MEDIUM_THRESHOLD) return "medium";
  if (score >= CVSS_LOW_THRESHOLD) return "low";
  return "info";
}

/**
 * Extract severity from OSV vulnerability
 */
export function extractSeverity(vuln: OSVVulnerability): SecuritySeverity {
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

  // Default based on ID prefix - GHSA IDs are typically high severity
  if (vuln.id.startsWith("GHSA-")) return "high";
  return "medium";
}

/**
 * Extract CVE IDs from OSV vulnerability
 */
export function extractCVEs(vuln: OSVVulnerability): string[] {
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
export function extractFixedVersion(vuln: OSVVulnerability): string | undefined {
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
 * Prefers GitHub advisory URLs, then npm audit URLs
 */
export function extractReferenceUrl(vuln: OSVVulnerability): string | undefined {
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

  // First URL as fallback
  return vuln.references?.[0]?.url;
}
