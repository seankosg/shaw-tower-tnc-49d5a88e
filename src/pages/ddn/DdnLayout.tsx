import { Outlet, NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const subnav = [
  { to: '/ddn/input', label: '오늘의 입력' },
  { to: '/ddn/preview', label: '미리보기' },
  { to: '/ddn/history', label: '출력·이력' },
  { to: '/ddn/settings', label: '설정' },
];

export default function DdnLayout() {
  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">Daily Default Notice</h1>
        <p className="text-sm text-muted-foreground">일일 디폴트 통보 — Puretech 정기 통보문 자동 생성</p>
      </div>
      <nav className="flex gap-1 border-b">
        {subnav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) =>
              cn(
                'px-3 py-2 text-sm border-b-2 -mb-px transition-colors',
                isActive
                  ? 'border-primary text-primary font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )
            }
          >
            {n.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
