import { Compass } from "lucide-react";
import { ButtonLink } from "../components/ui/Button";
import { Logo } from "../components/ui/Logo";
import { useAuth } from "../app/AuthProvider";

export default function NotFound() {
  const { session } = useAuth();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 p-6 text-center">
      <Logo />
      <div className="panel max-w-md p-8">
        <Compass className="mx-auto mb-4 size-10 text-cyan" aria-hidden />
        <p className="font-mono text-sm text-muted">404</p>
        <h1 className="mt-1 text-2xl font-semibold">This page isn't in the vault</h1>
        <p className="mt-2 text-sm text-muted">The address may be mistyped, or the page has moved.</p>
        <ButtonLink to={session ? "/dashboard" : "/"} className="mt-6">
          {session ? "Back to dashboard" : "Back to home"}
        </ButtonLink>
      </div>
    </div>
  );
}
