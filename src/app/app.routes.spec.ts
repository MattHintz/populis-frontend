import { routes } from './app.routes';

describe('admin portal route boundary', () => {
  it('keeps the deterministic genesis desk available', () => {
    expect(routes.some((route) => route.path === 'admin/genesis')).toBeTrue();
  });

  it('keeps the standalone Safe evidence page behind administrator auth', () => {
    const route = routes.find((candidate) => candidate.path === 'admin/omnichain-activation');
    expect(route).toBeDefined();
    expect(route?.canActivate).toBeDefined();
  });

  it('routes the admin home to the consolidated operations dashboard', () => {
    const route = routes.find((candidate) => candidate.path === 'admin');
    expect(route).toBeDefined();
    expect(route?.canActivate).toBeDefined();
    expect(routes.some((candidate) => candidate.path === 'admin/sales')).toBeTrue();
    expect(routes.some((candidate) => candidate.path === 'admin/system-health')).toBeTrue();
  });

  it('does not expose retired one-off bootstrap or authority launch screens', () => {
    const active = new Set(routes.map((route) => route.path));
    for (const path of [
      'admin/recovery',
      'admin/launch-protocol-config',
      'admin/launch-authority-v2',
      'admin/authority-v2/add-admin-slot',
      'admin/authority-v2/roster-spend-package-review',
    ]) {
      expect(active.has(path)).withContext(path).toBeFalse();
    }
  });
});
