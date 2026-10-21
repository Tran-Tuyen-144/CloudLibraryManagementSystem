export const PERMISSIONS = Object.freeze({
  MANAGEMENT: "management.enter",
  DASHBOARD: "dashboard.read",
  CATALOG: "catalog.read",
  BOOKS_MANAGE: "books.manage",
  READERS_READ: "readers.read.limited",
  READERS_MANAGE: "readers.manage",
  LOANS_READ: "loans.read.all",
  LOAN_CREATE: "loans.create.own",
  LOAN_CANCEL: "loans.cancel.own",
  LOAN_CANCEL_ANY: "loans.cancel.any",
  LOAN_APPROVE: "loans.approve",
  LOAN_REJECT: "loans.reject",
  LOAN_HANDOVER: "loans.handover",
  LOAN_RETURN: "loans.return",
  ACCOUNTS_MANAGE: "accounts.manage",
  SETTINGS_MANAGE: "settings.manage",
  AUDIT_OWN: "audit.read.own",
  AUDIT_ALL: "audit.read.all",
  ACCESS_OWN: "access.read.own",
  ACCESS_ALL: "access.read.all",
  REPORTS_READ: "reports.read.operational",
  REPORTS_EXPORT: "reports.export",
  PROFILE_OWN: "profile.update.own",
  PERMISSIONS_OWN: "permissions.read.own",
  DEMO_SEED: "demo.seed",
});

const P = PERMISSIONS;

export const ROLE_PERMISSIONS = Object.freeze({
  reader: Object.freeze([
    P.CATALOG,
    P.LOAN_CREATE,
    P.LOAN_CANCEL,
    P.PROFILE_OWN,
  ]),

  librarian: Object.freeze([
    P.MANAGEMENT,
    P.DASHBOARD,
    P.CATALOG,
    P.READERS_READ,
    P.LOANS_READ,
    P.LOAN_APPROVE,
    P.LOAN_REJECT,
    P.LOAN_HANDOVER,
    P.LOAN_RETURN,
    P.AUDIT_OWN,
    P.ACCESS_OWN,
    P.REPORTS_READ,
    P.PROFILE_OWN,
    P.PERMISSIONS_OWN,
  ]),

  admin: Object.freeze(Object.values(P)),
});

export function hasPermission(user, permission) {
  return Boolean(
    user &&
      user.status === "active" &&
      ROLE_PERMISSIONS[user.role]?.includes(permission),
  );
}

export function isManagementUser(user) {
  return hasPermission(user, P.MANAGEMENT);
}