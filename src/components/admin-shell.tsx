import Link from "next/link";
import { signOut } from "@/app/back-office/actions";

type AdminShellProps = {
  children: React.ReactNode;
  user: {
    firstName: string | null;
    lastName: string | null;
    email: string;
    role: "ADMINISTRATOR" | "RECEPTIONIST" | "EMPLOYEE";
  };
  active: "dashboard" | "visits" | "team" | "settings";
};

const navigation = [
  { key: "dashboard", href: "/back-office/dashboard", label: "Overview", icon: "◫" },
  { key: "visits", href: "/back-office/visits", label: "Visitor records", icon: "▤" },
  { key: "team", href: "/back-office/team", label: "People", icon: "♧", admin: true },
  { key: "settings", href: "/back-office/settings", label: "Configuration", icon: "⚙", admin: true },
] as const;

function initials(firstName: string | null, lastName: string | null, email: string) {
  const nameInitials = `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.trim();
  return (nameInitials || email.slice(0, 2)).toUpperCase();
}

export function AdminShell({ children, user, active }: AdminShellProps) {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

  return (
    <div className="admin-frame">
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/back-office/dashboard">
          <span className="brand-mark">V</span>
          <span><strong>Visitor</strong><small>ADMINISTRATION</small></span>
        </Link>
        <div className="nav-label">WORKSPACE</div>
        <nav className="admin-nav" aria-label="Back office">
          {navigation.filter((item) => !("admin" in item && item.admin) || user.role === "ADMINISTRATOR").map((item) => (
            <Link key={item.key} className={`admin-nav-link${active === item.key ? " active" : ""}`} href={item.href}>
              <span aria-hidden="true" className="nav-icon">{item.icon}</span>{item.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-help">
          <span className="help-icon">?</span>
          <strong>Need a hand?</strong>
          <p>Contact your system administrator if you need help with the visitor desk.</p>
        </div>
        <div className="sidebar-account">
          <span className="avatar">{initials(user.firstName, user.lastName, user.email)}</span>
          <span className="account-copy"><strong>{fullName}</strong><small>{user.role.toLowerCase().replace("_", " ")}</small></span>
          <form action={signOut}><button className="signout-button" aria-label="Sign out" title="Sign out">↪</button></form>
        </div>
      </aside>
      <main className="admin-main">
        <header className="admin-topbar">
          <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>{navigation.find((item) => item.key === active)?.label}</strong></div>
          <span className="secure-indicator"><i /> Secure back office</span>
        </header>
        <div className="admin-content">{children}</div>
      </main>
    </div>
  );
}
