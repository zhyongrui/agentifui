import type { AuthUser } from '@agentifui/shared/auth';
import type { WorkspaceCatalog } from '@agentifui/shared/apps';

import {
  WORKSPACE_APPS,
  WORKSPACE_GROUPS,
  buildWorkspaceCatalog,
  resolveDefaultMemberGroupIds,
} from './workspace-catalog-fixtures.js';

type WorkspaceService = {
  getCatalogForUser(user: AuthUser): WorkspaceCatalog | Promise<WorkspaceCatalog>;
};

export function createWorkspaceService(): WorkspaceService {
  return {
    getCatalogForUser(user) {
      const memberGroupIds = resolveDefaultMemberGroupIds(user.email);

      return buildWorkspaceCatalog(user, {
        groups: WORKSPACE_GROUPS.filter(group => memberGroupIds.includes(group.id)),
        apps: WORKSPACE_APPS.filter(app =>
          app.grantedGroupIds.some(groupId => memberGroupIds.includes(groupId))
        ),
        memberGroupIds,
      });
    },
  };
}

export type { WorkspaceService };
