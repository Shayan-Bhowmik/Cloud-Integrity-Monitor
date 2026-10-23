import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Activity, FolderLock, LayoutDashboard, LogOut, Menu, X } from "lucide-react";
import { useAuth } from "../app/AuthProvider";
import { api } from "../lib/api";
import { useResource } from "../hooks/useResource";
import { Logo } from "./ui/Logo";

const LINKS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/files", label: "Files", icon: FolderLock },
  { to: "/activity", label: "Activity", icon: Activity },
] as const;

function linkClass({ isActive }: { isActive: boolean }) {
  return `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
    isActive ? "bg-cyan/10 text-cyan" : "text-muted hover:bg-white/5 hover:text-text"
  }`;
}

export function Navbar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const summary = useResource((signal) => api.getSummary(signal));
  const openAlerts = summary.data?.open_alerts ?? 0;

  useEffect(() => setOpen(false), [location.pathname]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      navigate("/", { replace: true });
    } finally {
      setSigningOut(false);
    }
  };

  const alertBadge =
    openAlerts > 0 ? (
      <span className="ml-auto rounded-full bg-danger/15 px-1.5 py-px text-[11px] font-semibold text-danger md:ml-1" aria-label={`${openAlerts} open alerts`}>
        {openAlerts > 99 ? "99+" : openAlerts}
      </span>
    ) : null;

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6" aria-label="Main">
        <Link to="/dashboard" className="rounded-lg" aria-label="Cairn dashboard">
          <Logo />
        </Link>

        <div className="ml-6 hidden items-center gap-1 md:flex">
          {LINKS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={linkClass}>
              <Icon className="size-4" aria-hidden />
              {label}
              {to === "/activity" && alertBadge}
            </NavLink>
          ))}
        </div>

        <div className="ml-auto hidden items-center gap-3 md:flex">
          <span className="max-w-[16rem] truncate text-sm text-muted" title={user?.email ?? undefined}>
            {user?.email}
          </span>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-muted transition hover:border-line-strong hover:text-text disabled:opacity-50"
          >
            <LogOut className="size-4" aria-hidden />
            Log out
          </button>
        </div>

        <button
          type="button"
          className="ml-auto grid size-10 place-items-center rounded-lg text-muted hover:bg-white/5 hover:text-text md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </nav>

      {open && (
        <div id="mobile-nav" className="border-t border-line/70 bg-bg/95 px-4 pb-4 pt-2 md:hidden animate-fade-in">
          <div className="flex flex-col gap-1">
            {LINKS.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={(s) => `${linkClass(s)} min-h-11`}>
                <Icon className="size-4" aria-hidden />
                {label}
                {to === "/activity" && alertBadge}
              </NavLink>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-line/70 pt-3">
            <span className="min-w-0 truncate text-sm text-muted">{user?.email}</span>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex min-h-11 items-center gap-2 rounded-lg border border-line px-3 text-sm text-text"
            >
              <LogOut className="size-4" aria-hidden />
              Log out
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
