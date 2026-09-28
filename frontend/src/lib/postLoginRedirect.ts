const PAYMENT_RETURN_PATH = '/payments/return';
const PAYMENT_CANCEL_PATH = '/payments/cancel';

const PUBLIC_OR_INVALID_PATHS = [
  '/',
  '/login',
  '/register',
  '/unauthorized',
  '/auth/google/callback',
  '/forgot-password',
  '/reset-password',
  '/auth/success',
];

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

export function splitInternalPath(value: string): { pathname: string; search: string; hash: string } {
  const empty = { pathname: '/', search: '', hash: '' };
  const trimmed = String(value || '').trim();
  if (!trimmed) return empty;

  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    decoded = trimmed;
  }

  if (!decoded.startsWith('/') || decoded.startsWith('//') || decoded.includes('\\') || decoded.includes('://')) {
    return empty;
  }

  let hash = '';
  let path = decoded;
  const hashIndex = path.indexOf('#');
  if (hashIndex >= 0) {
    hash = path.slice(hashIndex);
    path = path.slice(0, hashIndex);
  }

  let search = '';
  const queryIndex = path.indexOf('?');
  if (queryIndex >= 0) {
    search = path.slice(queryIndex);
    path = path.slice(0, queryIndex);
  }

  if (!path.startsWith('/') || path.split('/').includes('..')) return empty;
  return { pathname: path || '/', search, hash };
}

function withLocation(pathname: string, search: string, hash: string): string {
  const query = search ? (search.startsWith('?') ? search : `?${search}`) : '';
  const fragment = hash ? (hash.startsWith('#') ? hash : `#${hash}`) : '';
  return `${pathname}${query}${fragment}`;
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
  search = '',
  hash = '',
): string {
  const parsed = splitInternalPath(attemptedPath);
  const pathname = parsed.pathname;
  const query = search || parsed.search;
  const fragment = hash || parsed.hash;

  if (
    pathname === PAYMENT_RETURN_PATH &&
    (role === 'user' || role === 'provider')
  ) {
    return withLocation(pathname, query, fragment);
  }

  if (pathname === PAYMENT_CANCEL_PATH && role === 'user') {
    return withLocation(pathname, query, fragment);
  }

  if (!pathname || PUBLIC_OR_INVALID_PATHS.includes(pathname)) {
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

  if (pathname !== roleRoot && !pathname.startsWith(rolePrefix)) {
    return defaultPath;
  }

  if (isEntityDetailPath(role, pathname)) {
    return defaultPath;
  }

  return withLocation(pathname, query, fragment);
}
