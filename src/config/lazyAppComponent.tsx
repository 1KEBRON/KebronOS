import { lazy, Suspense, useState, type ComponentType } from "react";
import type { AppProps } from "@/apps/base/types";
import { ensureAppLanguageResources } from "@/lib/i18n";
import { LazyLoadSignal } from "./LazyLoadSignal";

// Cache for lazy components to maintain stable references across HMR
const lazyComponentCache = new Map<string, ComponentType<AppProps<unknown>>>();

/** Dynamic import functions registered per app id for intent-based prefetch. */
const appChunkLoaders = new Map<string, () => Promise<unknown>>();

/**
 * Start loading an app chunk before the window mounts (dock/desktop intent).
 */
export function prefetchAppChunk(appId: string): void {
  const loader = appChunkLoaders.get(appId);
  if (loader) {
    void loader().catch(() => { /* Opening the app retries and reports failures. */ });
  }
}

/** After boot, warm up to three distinct app chunks from a recent-app list (MRU order). */
export function prefetchLikelyAppChunks(appIds: readonly string[]): void {
  const ids = [...new Set(appIds.filter(Boolean))].slice(0, 3);
  void (async () => {
    for (const [index, id] of ids.entries()) {
      // Give the first desktop interaction priority over speculative app code.
      if (index > 0) await new Promise<void>(resolve => setTimeout(resolve, 500));
      await new Promise<void>(resolve => {
        if (typeof requestIdleCallback === "function") requestIdleCallback(() => resolve());
        else setTimeout(resolve, 0);
      });
      try {
        await appChunkLoaders.get(id)?.();
      } catch {
        // Speculative failures are retried when the app is opened.
      }
    }
  })();
}

// Helper to create a lazy-loaded component with Suspense
// Uses a cache to maintain stable component references across HMR
export function createLazyComponent<T = unknown>(
  importFn: () => Promise<{ default: ComponentType<AppProps<T>> }>,
  cacheKey: string
): ComponentType<AppProps<T>> {
  // Return cached component if it exists (prevents HMR issues)
  const cached = lazyComponentCache.get(cacheKey);
  if (cached) {
    return cached as ComponentType<AppProps<T>>;
  }

  let loaded: ComponentType<AppProps<T>> | undefined;
  let pending: Promise<{ default: ComponentType<AppProps<T>> }> | undefined;
  const loadApp = () => {
    pending ??= Promise.all([importFn(), ensureAppLanguageResources(cacheKey)])
      .then(([appModule]) => {
        loaded = appModule.default;
        return appModule;
      })
      .catch((error) => {
        pending = undefined;
        throw error;
      });
    return pending;
  };

  appChunkLoaders.set(cacheKey, loadApp);

  const LazyComponent = lazy(loadApp);

  // Wrap with Suspense to handle loading state
  const WrappedComponent = (props: AppProps<T>) => {
    // A warmed module is already usable: do not suspend again on an import
    // promise and incur React's fallback reveal delay on the first click.
    const [Component] = useState(() => loaded ?? LazyComponent);
    return (
      <Suspense fallback={null}>
        <Component {...props} />
        <LazyLoadSignal instanceId={props.instanceId} />
      </Suspense>
    );
  };

  // Cache the component
  lazyComponentCache.set(
    cacheKey,
    WrappedComponent as ComponentType<AppProps<unknown>>
  );

  return WrappedComponent;
}
