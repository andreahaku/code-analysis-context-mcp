/**
 * Type definitions for Dependency Vulnerability Detector
 *
 * Maps to OWASP A06:2021 - Vulnerable and Outdated Components
 */

import type {
  SecurityVulnerability,
  PositiveSecurityPractice,
  SecurityDetectorResult,
  SecuritySeverity,
} from "../../types/index.js";

// ====================== Package JSON Types ======================

export interface PackageJson {
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

export interface PackageLockDependency {
  version: string;
  resolved?: string;
  integrity?: string;
  dev?: boolean;
  optional?: boolean;
  dependencies?: Record<string, PackageLockDependency>;
}

export interface PackageLockJson {
  name?: string;
  version?: string;
  lockfileVersion?: number;
  packages?: Record<
    string,
    {
      version?: string;
      resolved?: string;
      integrity?: string;
      dev?: boolean;
      dependencies?: Record<string, string>;
    }
  >;
  dependencies?: Record<string, PackageLockDependency>;
}

// ====================== OSV API Types ======================

export interface OSVVulnerability {
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

export interface OSVQueryResponse {
  vulns?: OSVVulnerability[];
}

export interface OSVBatchResponse {
  results: OSVQueryResponse[];
}

// ====================== Dependency Info Types ======================

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

// Re-export for convenience
export type { SecurityVulnerability, PositiveSecurityPractice, SecuritySeverity };
