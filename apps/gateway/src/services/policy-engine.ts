import type {
  AdminPolicyDetectorMatch,
  AdminPolicyException,
  AdminPolicyPackSimulationScope,
  AdminTenantGovernanceSettings,
} from '@agentifui/shared/admin';

type PolicyEvaluationInput = {
  appId?: string | null;
  content: string;
  exceptions: AdminPolicyException[];
  governance: AdminTenantGovernanceSettings | null;
  groupId?: string | null;
  runtimeId?: string | null;
  scope: AdminPolicyPackSimulationScope;
};

export type PolicyEvaluationResult = {
  detectorMatches: AdminPolicyDetectorMatch[];
  exceptionIds: string[];
  outcome: 'allowed' | 'blocked' | 'flagged';
  reasons: string[];
};

const REGULATED_TERMS = [
  'hipaa',
  'ferpa',
  'gdpr',
  'export controlled',
  'itar',
  'pci',
  'trade secret',
] as const;

const EXFILTRATION_PATTERNS = [
  /dump (?:the )?(?:entire|full|whole)/i,
  /export (?:all|every|the entire)/i,
  /send .* external/i,
  /copy .* offsite/i,
  /bypass .* restrictions/i,
] as const;

function toPreview(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();

  if (normalized.length <= 32) {
    return normalized;
  }

  return `${normalized.slice(0, 29)}...`;
}

function detectSecrets(content: string): AdminPolicyDetectorMatch[] {
  const matches = [
    {
      label: 'API key-like token',
      match: content.match(/\b(?:sk|rk)-[a-z0-9]{12,}\b/i),
    },
    {
      label: 'AWS access key',
      match: content.match(/\bAKIA[0-9A-Z]{16}\b/),
    },
    {
      label: 'Private key material',
      match: content.match(/-----BEGIN [A-Z ]*PRIVATE KEY-----/),
    },
  ].flatMap(candidate =>
    candidate.match
      ? [
          {
            detector: 'secret' as const,
            label: candidate.label,
            severity: 'critical' as const,
            valuePreview: toPreview(candidate.match[0]),
          },
        ]
      : []
  );

  return matches;
}

function detectPii(content: string): AdminPolicyDetectorMatch[] {
  const matches = [
    {
      label: 'Possible SSN',
      match: content.match(/\b\d{3}-\d{2}-\d{4}\b/),
    },
    {
      label: 'Possible payment card',
      match: content.match(/\b(?:\d[ -]*?){13,16}\b/),
    },
  ].flatMap(candidate =>
    candidate.match
      ? [
          {
            detector: 'pii' as const,
            label: candidate.label,
            severity: 'critical' as const,
            valuePreview: toPreview(candidate.match[0]),
          },
        ]
      : []
  );

  return matches;
}

function detectRegulatedTerms(content: string): AdminPolicyDetectorMatch[] {
  const normalized = content.toLowerCase();

  return REGULATED_TERMS.flatMap(term =>
    normalized.includes(term)
      ? [
          {
            detector: 'regulated_term' as const,
            label: `Regulated term: ${term}`,
            severity: 'warning' as const,
            valuePreview: term,
          },
        ]
      : []
  );
}

function detectExfiltration(content: string): AdminPolicyDetectorMatch[] {
  return EXFILTRATION_PATTERNS.flatMap(pattern => {
    const match = content.match(pattern);

    return match
      ? [
          {
            detector: 'exfiltration_pattern' as const,
            label: 'Possible bulk export / exfiltration phrasing',
            severity: 'warning' as const,
            valuePreview: toPreview(match[0]),
          },
        ]
      : [];
  });
}

export function detectPolicyMatches(content: string): AdminPolicyDetectorMatch[] {
  return [
    ...detectSecrets(content),
    ...detectPii(content),
    ...detectRegulatedTerms(content),
    ...detectExfiltration(content),
  ];
}

function isExceptionActive(exception: AdminPolicyException) {
  if (!exception.expiresAt) {
    return true;
  }

  const expiresAt = new Date(exception.expiresAt);

  return Number.isNaN(expiresAt.getTime()) ? true : expiresAt.getTime() > Date.now();
}

function matchesExceptionScope(
  exception: AdminPolicyException,
  input: Pick<PolicyEvaluationInput, 'appId' | 'groupId' | 'runtimeId'>
) {
  if (exception.scope === 'tenant') {
    return true;
  }

  if (exception.scope === 'group') {
    return Boolean(input.groupId) && exception.scopeId === input.groupId;
  }

  if (exception.scope === 'app') {
    return Boolean(input.appId) && exception.scopeId === input.appId;
  }

  return Boolean(input.runtimeId) && exception.scopeId === input.runtimeId;
}

function resolveOutcomeForMatches(
  governance: AdminTenantGovernanceSettings | null,
  scope: AdminPolicyPackSimulationScope,
  matches: AdminPolicyDetectorMatch[]
): PolicyEvaluationResult['outcome'] {
  if (scope === 'export' && governance?.policyPack.exportMode === 'blocked') {
    return 'blocked';
  }

  if (scope === 'export' && governance?.policyPack.exportMode === 'approval_required') {
    return 'blocked';
  }

  if (matches.length === 0) {
    return 'allowed';
  }

  const hasCritical = matches.some(match => match.severity === 'critical');

  if (scope === 'retrieval') {
    if (governance?.policyPack.retrievalMode === 'blocked') {
      return 'blocked';
    }

    if (governance?.policyPack.retrievalMode === 'flagged') {
      return 'flagged';
    }

    return hasCritical ? 'flagged' : 'allowed';
  }

  if (scope === 'export') {
    if (governance?.policyPack.exportMode === 'blocked') {
      return 'blocked';
    }

    if (governance?.policyPack.exportMode === 'approval_required') {
      return 'blocked';
    }

    return hasCritical ? 'flagged' : 'allowed';
  }

  if (scope === 'chat') {
    if (governance?.policyPack.runtimeMode === 'strict' && hasCritical) {
      return 'blocked';
    }

    if (governance?.policyPack.runtimeMode === 'strict') {
      return 'flagged';
    }

    if (governance?.policyPack.runtimeMode === 'degraded' || hasCritical) {
      return 'flagged';
    }

    return 'allowed';
  }

  return hasCritical ? 'blocked' : 'flagged';
}

export function evaluatePolicy(input: PolicyEvaluationInput): PolicyEvaluationResult {
  const detectorMatches = detectPolicyMatches(input.content);
  const governance = input.governance;
  const matchedExceptions = input.exceptions.filter(
    exception =>
      isExceptionActive(exception) &&
      matchesExceptionScope(exception, input) &&
      detectorMatches.some(match => match.detector === exception.detector)
  );
  const exceptionIds = matchedExceptions.map(exception => exception.id);
  const uncoveredMatches = detectorMatches.filter(
    match => !matchedExceptions.some(exception => exception.detector === match.detector)
  );
  const outcome = resolveOutcomeForMatches(input.governance, input.scope, uncoveredMatches);
  const reasons: string[] = [];

  if (uncoveredMatches.length > 0) {
    reasons.push(
      `Matched ${uncoveredMatches.length} policy detector${uncoveredMatches.length === 1 ? '' : 's'}.`
    );
  }

  if (input.scope === 'export' && governance?.policyPack.exportMode === 'approval_required') {
    reasons.push('Exports require approval under the current tenant policy pack.');
  } else if (input.scope === 'export' && governance?.policyPack.exportMode === 'blocked') {
    reasons.push('Exports are blocked under the current tenant policy pack.');
  } else if (
    input.scope === 'retrieval' &&
    governance?.policyPack.retrievalMode !== 'allowed' &&
    uncoveredMatches.length > 0
  ) {
    reasons.push(`Retrieval mode is set to ${governance?.policyPack.retrievalMode ?? 'allowed'}.`);
  } else if (
    input.scope === 'chat' &&
    governance?.policyPack.runtimeMode !== 'standard' &&
    uncoveredMatches.length > 0
  ) {
    reasons.push(`Runtime mode is set to ${governance?.policyPack.runtimeMode ?? 'standard'}.`);
  }

  if (exceptionIds.length > 0) {
    reasons.push(`Applied ${exceptionIds.length} active exception${exceptionIds.length === 1 ? '' : 's'}.`);
  }

  if (reasons.length === 0) {
    reasons.push('No policy detector matches were found.');
  }

  return {
    outcome,
    reasons,
    detectorMatches,
    exceptionIds,
  };
}
