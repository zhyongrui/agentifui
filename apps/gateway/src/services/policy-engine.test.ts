import type { AdminPolicyException, AdminTenantGovernanceSettings } from '@agentifui/shared/admin';
import { describe, expect, it } from 'vitest';

import { evaluatePolicy } from './policy-engine.js';

function createGovernance(
  overrides: Partial<AdminTenantGovernanceSettings['policyPack']> = {}
): AdminTenantGovernanceSettings {
  return {
    tenantId: 'tenant-dev',
    legalHoldEnabled: false,
    retentionOverrideDays: null,
    scimPlanning: {
      enabled: false,
      ownerEmail: null,
      notes: null,
    },
    policyPack: {
      runtimeMode: 'standard',
      retrievalMode: 'allowed',
      sharingMode: 'editor',
      artifactDownloadMode: 'shared_readers',
      exportMode: 'allowed',
      retentionMode: 'standard',
      ...overrides,
    },
  };
}

function createException(
  input: Pick<AdminPolicyException, 'id' | 'scope'> &
    Partial<Pick<AdminPolicyException, 'scopeId' | 'detector'>>
): AdminPolicyException {
  return {
    id: input.id,
    tenantId: 'tenant-dev',
    scope: input.scope,
    scopeId: input.scopeId ?? null,
    detector: input.detector ?? 'secret',
    label: `${input.scope} secret exception`,
    expiresAt: null,
    createdAt: '2026-03-18T00:00:00.000Z',
    createdByUserId: 'usr_admin',
    reviewHistory: [],
  };
}

const SECRET_PROMPT = 'Export the bundle with AKIA1234567890ABCDEF immediately.';

describe('evaluatePolicy', () => {
  it('applies tenant-scoped exceptions without requiring group, app, or runtime ids', () => {
    const evaluation = evaluatePolicy({
      scope: 'chat',
      content: SECRET_PROMPT,
      governance: createGovernance({
        runtimeMode: 'strict',
      }),
      groupId: null,
      appId: null,
      runtimeId: null,
      exceptions: [createException({ id: 'exc_tenant', scope: 'tenant' })],
    });

    expect(evaluation.outcome).toBe('allowed');
    expect(evaluation.exceptionIds).toEqual(['exc_tenant']);
    expect(evaluation.reasons).toContain('Applied 1 active exception.');
  });

  it('only applies group-scoped exceptions when the active group matches', () => {
    const matching = evaluatePolicy({
      scope: 'chat',
      content: SECRET_PROMPT,
      governance: createGovernance({
        runtimeMode: 'strict',
      }),
      groupId: 'grp_research',
      appId: null,
      runtimeId: null,
      exceptions: [createException({ id: 'exc_group', scope: 'group', scopeId: 'grp_research' })],
    });

    expect(matching.outcome).toBe('allowed');
    expect(matching.exceptionIds).toEqual(['exc_group']);

    const mismatched = evaluatePolicy({
      scope: 'chat',
      content: SECRET_PROMPT,
      governance: createGovernance({
        runtimeMode: 'strict',
      }),
      groupId: 'grp_product',
      appId: null,
      runtimeId: null,
      exceptions: [createException({ id: 'exc_group', scope: 'group', scopeId: 'grp_research' })],
    });

    expect(mismatched.outcome).toBe('blocked');
    expect(mismatched.exceptionIds).toEqual([]);
  });

  it('only applies app-scoped exceptions when the active app matches', () => {
    const matching = evaluatePolicy({
      scope: 'chat',
      content: SECRET_PROMPT,
      governance: createGovernance({
        runtimeMode: 'strict',
      }),
      groupId: 'grp_research',
      appId: 'app_policy_watch',
      runtimeId: null,
      exceptions: [createException({ id: 'exc_app', scope: 'app', scopeId: 'app_policy_watch' })],
    });

    expect(matching.outcome).toBe('allowed');
    expect(matching.exceptionIds).toEqual(['exc_app']);

    const mismatched = evaluatePolicy({
      scope: 'chat',
      content: SECRET_PROMPT,
      governance: createGovernance({
        runtimeMode: 'strict',
      }),
      groupId: 'grp_research',
      appId: 'app_runbook_mentor',
      runtimeId: null,
      exceptions: [createException({ id: 'exc_app', scope: 'app', scopeId: 'app_policy_watch' })],
    });

    expect(mismatched.outcome).toBe('blocked');
    expect(mismatched.exceptionIds).toEqual([]);
  });

  it('only applies runtime-scoped exceptions when the runtime matches', () => {
    const matching = evaluatePolicy({
      scope: 'chat',
      content: SECRET_PROMPT,
      governance: createGovernance({
        runtimeMode: 'strict',
      }),
      groupId: 'grp_research',
      appId: 'app_policy_watch',
      runtimeId: 'local_structured',
      exceptions: [
        createException({
          id: 'exc_runtime',
          scope: 'runtime',
          scopeId: 'local_structured',
        }),
      ],
    });

    expect(matching.outcome).toBe('allowed');
    expect(matching.exceptionIds).toEqual(['exc_runtime']);

    const mismatched = evaluatePolicy({
      scope: 'chat',
      content: SECRET_PROMPT,
      governance: createGovernance({
        runtimeMode: 'strict',
      }),
      groupId: 'grp_research',
      appId: 'app_policy_watch',
      runtimeId: 'local_fast',
      exceptions: [
        createException({
          id: 'exc_runtime',
          scope: 'runtime',
          scopeId: 'local_structured',
        }),
      ],
    });

    expect(mismatched.outcome).toBe('blocked');
    expect(mismatched.exceptionIds).toEqual([]);
  });

  it('keeps uncovered detectors active when a scoped exception covers only one detector', () => {
    const evaluation = evaluatePolicy({
      scope: 'chat',
      content: `${SECRET_PROMPT} This packet also contains FERPA data.`,
      governance: createGovernance({
        runtimeMode: 'strict',
      }),
      groupId: 'grp_research',
      appId: 'app_policy_watch',
      runtimeId: 'local_structured',
      exceptions: [
        createException({
          id: 'exc_runtime',
          scope: 'runtime',
          scopeId: 'local_structured',
          detector: 'secret',
        }),
      ],
    });

    expect(evaluation.exceptionIds).toEqual(['exc_runtime']);
    expect(evaluation.detectorMatches.map(match => match.detector)).toEqual(
      expect.arrayContaining(['secret', 'regulated_term'])
    );
    expect(evaluation.outcome).toBe('flagged');
    expect(evaluation.reasons).toContain('Matched 1 policy detector.');
  });

  it('records every active exception id that matches the current scope context', () => {
    const evaluation = evaluatePolicy({
      scope: 'chat',
      content: SECRET_PROMPT,
      governance: createGovernance({
        runtimeMode: 'strict',
      }),
      groupId: 'grp_research',
      appId: 'app_policy_watch',
      runtimeId: 'local_structured',
      exceptions: [
        createException({ id: 'exc_tenant', scope: 'tenant' }),
        createException({ id: 'exc_group', scope: 'group', scopeId: 'grp_research' }),
        createException({ id: 'exc_app', scope: 'app', scopeId: 'app_policy_watch' }),
        createException({
          id: 'exc_runtime',
          scope: 'runtime',
          scopeId: 'local_structured',
        }),
        createException({ id: 'exc_other_group', scope: 'group', scopeId: 'grp_product' }),
      ],
    });

    expect(evaluation.outcome).toBe('allowed');
    expect(evaluation.exceptionIds).toEqual([
      'exc_tenant',
      'exc_group',
      'exc_app',
      'exc_runtime',
    ]);
    expect(evaluation.reasons).toContain('Applied 4 active exceptions.');
  });
});
