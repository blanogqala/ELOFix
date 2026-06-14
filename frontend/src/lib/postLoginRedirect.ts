const PUBLIC_OR_INVALID_PATHS = ['/', '/login', '/register', '/unauthorized', '/auth/google/callback'];

/** Detail routes should not be restored after login — the resource may no longer exist. */
function isEntityDetailPath(role: string, path: string): boolean {
  if (role === 'provider') {
    return /^\/provider\/(?:jobs|requests)\/[^/]+/.test(path);
  }
  if (role === 'user') {
    return /^\/user\/(?:jobs|delivery-requests|material-orders|orders)\/[^/]+/.test(path);
  }
  if (role === 'admin') {
    return /^\/admin\/(?:jobs|payments|providers|customers|suppliers)\/[^/]+/.test(path);
  }
  if (role === 'supplier' || role === 'branch_staff') {
    return /^\/supplier\/(?:branches|earnings\/branch)\/[^/]+/.test(path);
  }
  return false;
}

export function getDefaultDashboardPath(role: string): string {
  switch (role) {
    case 'admin':
      return '/admin/dashboard';
    case 'provider':
      return '/provider/dashboard';
    case 'supplier':
    case 'branch_staff':
      return '/supplier/dashboard';
    default:
      return '/user/dashboard';
  }
}

export function resolvePostLoginPath(
  role: string,
  attemptedPath: string,
  defaultPath = getDefaultDashboardPath(role),
): string {
  if (!attemptedPath || PUBLIC_OR_INVALID_PATHS.includes(attemptedPath)) {
    return defaultPath;
  }

  const rolePrefix =
    role === 'admin'
      ? '/admin/'
      : role === 'provider'
        ? '/provider/'
        : role === 'supplier' || role === 'branch_staff'
          ? '/supplier/'
          : '/user/';

  const roleRoot =
    role === 'admin'
      ? '/admin'
      : role === 'provider'
        ? '/provider'
        : role === 'supplier' || role === 'branch_staff'
          ? '/supplier'
          : '/user';

  if (attemptedPath !== roleRoot && !attemptedPath.startsWith(rolePrefix)) {
    return defaultPath;
  }

  if (isEntityDetailPath(role, attemptedPath)) {
    return defaultPath;
  }

  return attemptedPath;
}
