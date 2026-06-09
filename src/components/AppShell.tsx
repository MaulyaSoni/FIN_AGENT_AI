import { Link, useLocation } from "@tanstack/react-router";
import { Plus, Settings, FileText, MessageSquare, Sun, Moon, Sparkles, LayoutDashboard, Wrench, ClipboardCheck, Home, History } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { useTheme } from "@/context/ThemeContext";

function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, toggle } = useTheme();
  return (
    <button onClick={toggle} aria-label="Toggle theme" title={theme === "dark" ? "Switch to light" : "Switch to dark"}
      className={compact
        ? "p-1 text-muted-foreground hover:text-foreground transition"
        : "flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-sidebar-accent transition w-full"}>
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      {!compact && <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>}
    </button>
  );
}

const NAV = [
  { to: "/", label: "Home", icon: Home },
  { to: "/chat", label: "Chat", icon: MessageSquare },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/tools", label: "Tools", icon: Wrench },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/traces", label: "Traces", icon: History },
  { to: "/evals", label: "Evals", icon: ClipboardCheck },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { sessions, currentId, selectSession, newSession } = useSession();
  const loc = useLocation();
  const isChat = loc.pathname === "/chat";

  return (
    <div className="flex min-h-screen w-full text-foreground">
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar/80 backdrop-blur-xl">
        <Link to="/" className="flex items-center gap-2.5 px-4 py-4 border-b border-sidebar-border">
          <div className="relative size-9 rounded-xl bg-gradient-primary grid place-items-center text-primary-foreground font-bold shadow-elegant">
            <Sparkles className="size-4" />
          </div>
          <div className="leading-tight">
            <div className="font-semibold tracking-tight text-gradient">FinAgent</div>
            <div className="text-[11px] text-muted-foreground">Autonomous research</div>
          </div>
        </Link>

        <nav className="px-2 py-3 space-y-0.5">
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = loc.pathname === n.to;
            return (
              <Link key={n.to} to={n.to}
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition ${active ? "bg-sidebar-accent text-primary font-medium" : "text-sidebar-foreground hover:bg-sidebar-accent"}`}>
                <Icon className="size-4" /> {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-2 border-t border-sidebar-border">
          <button onClick={newSession}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-gradient-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 shadow-elegant transition">
            <Plus className="size-4" /> New session
          </button>
        </div>
        <div className="px-3 pt-3 pb-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Sessions</div>
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
          {sessions.map((s) => (
            <button key={s.id} onClick={() => selectSession(s.id)}
              className={`group w-full flex items-start gap-2 rounded-md px-2 py-2 text-left text-sm transition hover:bg-sidebar-accent ${s.id === currentId && isChat ? "bg-sidebar-accent ring-1 ring-primary/30" : ""}`}>
              <MessageSquare className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
              <span className="line-clamp-2">{s.title}</span>
            </button>
          ))}
        </div>

        <div className="border-t border-sidebar-border p-2 space-y-1">
          <Link to="/settings" className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-sidebar-accent"
            activeProps={{ className: "flex items-center gap-2 rounded-md px-2 py-2 text-sm bg-sidebar-accent text-primary" }}>
            <Settings className="size-4" /> Settings
          </Link>
          <ThemeToggle />
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between border-b border-border px-4 py-3 bg-card/70 backdrop-blur-xl">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <span className="size-7 rounded-lg bg-gradient-primary grid place-items-center text-primary-foreground"><Sparkles className="size-3.5" /></span>
            <span className="text-gradient">FinAgent</span>
          </Link>
          <div className="flex items-center gap-2 text-muted-foreground">
            <ThemeToggle compact />
            <Link to="/chat" aria-label="Chat" className="p-1"><MessageSquare className="size-5" /></Link>
            <Link to="/dashboard" aria-label="Dashboard" className="p-1"><LayoutDashboard className="size-5" /></Link>
            <Link to="/reports" aria-label="Reports" className="p-1"><FileText className="size-5" /></Link>
            <Link to="/settings" aria-label="Settings" className="p-1"><Settings className="size-5" /></Link>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
