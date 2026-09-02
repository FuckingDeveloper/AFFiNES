import test from 'ava';

import {
  Action,
  DOC_ACTION_TO_MINIMAL_ROLE_MAP,
  DocRole,
  fixupDocRole,
  mapDocRoleToPermissions,
  mapWorkspaceRoleToPermissions,
  WORKSPACE_ACTION_TO_MINIMAL_ROLE_MAP,
  workspaceActionRequiredRole,
  WorkspaceRole,
} from '../types';

test('should be able to get the correct action path', t => {
  t.is(Action.Workspace.CreateDoc, 'Workspace.CreateDoc');
  t.is(Action.Workspace.Users.Read, 'Workspace.Users.Read');
  t.is(Action.Doc.Copy, 'Doc.Copy');
  t.is(Action.Doc.Users.Manage, 'Doc.Users.Manage');
  t.is(Action.Workspace.TrackWork.Write, 'Workspace.TrackWork.Write');
  t.is(
    Action.Workspace.TrackWork.Integrations.Manage,
    'Workspace.TrackWork.Integrations.Manage'
  );

  t.not(Action.Workspace.Delete, 'Wrong.Action.Name');

  function test(_action: Action) {}
  // Action visitor result can be passed to function that accepts [ActionName]
  test(Action.Workspace.CreateDoc);
  // @ts-expect-error make sure type checked
  test('Wrong.Action.Name');
});

test('TrackWork capabilities map to the intended workspace roles', t => {
  t.is(
    workspaceActionRequiredRole('Workspace.TrackWork.Write'),
    WorkspaceRole.Collaborator
  );
  t.is(
    workspaceActionRequiredRole('Workspace.TrackWork.Integrations.Manage'),
    WorkspaceRole.Owner
  );
  t.true(
    mapWorkspaceRoleToPermissions(WorkspaceRole.Collaborator)[
      'Workspace.TrackWork.Write'
    ]
  );
  t.false(
    mapWorkspaceRoleToPermissions(WorkspaceRole.Admin)[
      'Workspace.TrackWork.Integrations.Manage'
    ]
  );
  t.true(
    mapWorkspaceRoleToPermissions(WorkspaceRole.Owner)[
      'Workspace.TrackWork.Integrations.Manage'
    ]
  );
});

const workspaceRoles = Object.values(WorkspaceRole).filter(
  r => typeof r === 'number'
) as WorkspaceRole[];
const docRoles = Object.values(DocRole).filter(
  r => typeof r === 'number'
) as DocRole[];

test(`should be able to fixup doc role from workspace role and doc role`, t => {
  for (const workspaceRole of workspaceRoles) {
    for (const docRole of docRoles) {
      const fixedDocRole = fixupDocRole(workspaceRole, docRole);
      t.snapshot(
        fixedDocRole === null ? null : DocRole[fixedDocRole],
        `WorkspaceRole: ${WorkspaceRole[workspaceRole]}, DocRole: ${DocRole[docRole]}`
      );
    }
  }
});

test(`should be able to get correct permissions from WorkspaceRole`, t => {
  for (const workspaceRole of workspaceRoles) {
    t.snapshot(
      mapWorkspaceRoleToPermissions(workspaceRole),
      `WorkspaceRole: ${WorkspaceRole[workspaceRole]}`
    );
  }
});

test(`should be able to get correct permissions from DocRole`, t => {
  for (const docRole of docRoles) {
    t.snapshot(
      mapDocRoleToPermissions(docRole),
      `DocRole: ${DocRole[docRole]}`
    );
  }
});

test('should be able to find minimal workspace role from action', t => {
  t.snapshot(
    Object.fromEntries(
      Array.from(WORKSPACE_ACTION_TO_MINIMAL_ROLE_MAP.entries()).map(
        ([action, role]) => [action, WorkspaceRole[role]]
      )
    )
  );
});

test('should be able to find minimal doc role from action', t => {
  t.snapshot(
    Object.fromEntries(
      Array.from(DOC_ACTION_TO_MINIMAL_ROLE_MAP.entries()).map(
        ([action, role]) => [action, DocRole[role]]
      )
    )
  );
});
