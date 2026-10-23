import { lazy, Suspense, useMemo } from "react";
import type { FileItem, VaultStatus } from "../lib/types";
import { VAULT_LABEL, versionColor } from "../lib/status";
import { use3D, useMediaQuery } from "../lib/browser";
import { VaultFallback } from "./vault/VaultFallback";
import { ErrorBoundary } from "./ErrorBoundary";
import type { OrbitBlock } from "./vault/VaultScene";

// three.js and React Three Fiber are only downloaded when a vault is actually rendered in 3D.
const VaultScene = lazy(() => import("./vault/VaultScene"));

interface Vault3DProps {
  status: VaultStatus;
  /** Real files to orbit the vault (max 20, fewer on small screens). */
  files?: FileItem[];
  /** Decorative block count for the landing hero, where there is no user data. */
  decorativeBlocks?: number;
  spin?: number;
  showLabel?: boolean;
  className?: string;
}

export function Vault3D({ status, files, decorativeBlocks = 0, spin, showLabel = true, className = "" }: Vault3DProps) {
  const can3D = use3D();
  const small = useMediaQuery("(max-width: 640px)");
  const maxBlocks = small ? 10 : 20;

  const blocks = useMemo<OrbitBlock[]>(() => {
    if (files) {
      return files.slice(0, maxBlocks).map((f) => ({ id: f.id, color: versionColor(f.latest_version?.status) }));
    }
    const palette = ["#22d3ee", "#34d399", "#8b5cf6"];
    return Array.from({ length: Math.min(decorativeBlocks, maxBlocks) }, (_, i) => ({
      id: `deco-${i}`,
      color: palette[i % palette.length]!,
    }));
  }, [files, decorativeBlocks, maxBlocks]);

  const fallback = <VaultFallback status={status} />;

  return (
    <div className={`relative ${className}`} role="img" aria-label={`Vault status: ${VAULT_LABEL[status]}`}>
      {can3D ? (
        <ErrorBoundary fallback={fallback}>
          <Suspense fallback={fallback}>
            <VaultScene status={status} blocks={blocks} spin={spin} cameraZ={small ? 7 : 6.2} />
          </Suspense>
        </ErrorBoundary>
      ) : (
        fallback
      )}
      {showLabel && (
        <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-line bg-bg/70 px-3 py-1 text-xs font-medium text-muted backdrop-blur">
          {VAULT_LABEL[status]}
        </span>
      )}
    </div>
  );
}
