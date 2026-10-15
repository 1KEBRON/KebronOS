import { useEffect, useMemo, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import "@fontsource-variable/geist/wght.css";
import "../paper.css";
import type { AppProps } from "@/apps/base/types";
import type { PreviewInitialData } from "..";
import { AppHelpAboutDialogs } from "@/components/shared/AppHelpAboutDialogs";
import { AppWindowShell } from "@/components/shared/AppWindowShell";
import { SaveFileDialog } from "@/components/dialogs/SaveFileDialog";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { cn } from "@/lib/utils";
import { PREVIEW_FILE_ACCEPT } from "@/utils/fileAssociations";
import { appMetadata } from "../metadata";
import { useImageZoomGestures } from "../hooks/useImageZoomGestures";
import { usePreviewLogic } from "../hooks/usePreviewLogic";
import { PreviewMenuBar } from "./PreviewMenuBar";
import { useFilesStore } from "@/stores/useFilesStore";
import { parentFolder, parseFrontMatter } from "@/apps/finder/map/frontMatter";
import { loadFolderDocuments } from "@/apps/finder/map/folderDocuments";
import {
  documentMarkdown,
  relatedDocuments,
  type RelatedDocument,
} from "@/apps/finder/map/documentMarkdown";

export function PreviewAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  initialData,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps<PreviewInitialData>) {
  const {
    t,
    translatedHelpItems,
    isWindowsTheme,
    isAquaGlass,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    currentPath,
    displayName,
    displayText,
    kind,
    objectUrl,
    isLoading,
    error,
    zoom,
    setZoom,
    fitToWindow,
    setFitToWindow,
    isSaveAsDialogOpen,
    setIsSaveAsDialogOpen,
    saveAsFileName,
    setSaveAsFileName,
    isSaving,
    fileInputRef,
    handleOpen,
    handleImport,
    handleSaveAs,
    handleSaveAsSubmit,
    handleExport,
    handleFileInputChange,
    handleDrop,
    openWithApps,
    handleOpenWith,
  } = usePreviewLogic({ initialData, instanceId, isWindowOpen });

  const launchApp = useLaunchApp();
  const isImage = kind === "image";

  // Linked documents (North Star): front matter becomes a title and byline, and
  // links in both directions stay navigable at the foot of the page.
  const parsedDocument = useMemo(
    () => (kind === "markdown" ? parseFrontMatter(displayText) : null),
    [kind, displayText]
  );
  const [related, setRelated] = useState<{ path: string; items: RelatedDocument[] }>({
    path: "",
    items: [],
  });
  useEffect(() => {
    if (kind !== "markdown" || !currentPath) return;
    let cancelled = false;
    const folder = parentFolder(currentPath);
    void loadFolderDocuments(folder).then((docs) => {
      if (cancelled) return;
      if (parsedDocument) docs.set(currentPath, parsedDocument);
      const candidates = useFilesStore
        .getState()
        .getItemsInPath(folder)
        .filter((item) => item.status !== "trashed")
        .map((item) => item.path);
      setRelated({ path: currentPath, items: relatedDocuments(currentPath, folder, docs, candidates) });
    });
    return () => {
      cancelled = true;
    };
  }, [kind, currentPath, parsedDocument]);
  const markdownText = useMemo(() => {
    if (!parsedDocument || !currentPath) return displayText;
    const links = related.path === currentPath ? related.items : [];
    return documentMarkdown(displayText, parsedDocument, currentPath.split("/").pop() ?? "", links);
  }, [displayText, parsedDocument, currentPath, related]);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [naturalSize, setNaturalSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    setNaturalSize(null);
  }, [objectUrl]);

  const { zoomIn, zoomOut, zoomToActualSize, setFitMode } =
    useImageZoomGestures(containerRef, imageRef, {
      enabled: isImage && Boolean(objectUrl),
      zoom,
      fitToWindow,
      onZoomChange: setZoom,
      onFitToWindowChange: setFitToWindow,
    });

  const menuBar = (
    <PreviewMenuBar
      onClose={onClose}
      onOpen={handleOpen}
      onSaveAs={handleSaveAs}
      onImport={() => void handleImport()}
      onExport={() => void handleExport()}
      hasDocument={Boolean(currentPath) && !isLoading && !error}
      onOpenWith={(appId) => void handleOpenWith(appId)}
      openWithApps={openWithApps}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      isImage={isImage}
      zoom={zoom}
      onZoomIn={zoomIn}
      onZoomOut={zoomOut}
      onActualSize={zoomToActualSize}
      fitToWindow={fitToWindow}
      onSetFitToWindow={setFitMode}
    />
  );

  const previewContent = (() => {
    if (isLoading) {
      return (
        <div className="flex h-full items-center justify-center text-os-text-secondary">
          {t("apps.preview.status.loading")}
        </div>
      );
    }

    if (!currentPath) {
      return (
        <button
          type="button"
          onClick={() => void handleImport()}
          className="flex h-full w-full flex-col items-center justify-center gap-3 text-os-text-secondary hover:text-os-text-primary"
        >
          <img
            src={appMetadata.icon}
            alt=""
            className="size-24 object-contain drop-shadow-md"
          />
          <span className="text-lg font-semibold text-os-text-primary">
            {t("apps.preview.empty.title")}
          </span>
          <span>{t("apps.preview.empty.hint")}</span>
        </button>
      );
    }

    if (error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
          <span className="text-4xl" aria-hidden="true">
            ⚠️
          </span>
          <strong>{t("apps.preview.status.loadFailed")}</strong>
          <span className="text-os-text-secondary">{error}</span>
        </div>
      );
    }

    if (kind === "image" && objectUrl) {
      return (
        <div
          className={cn(
            "flex p-6",
            fitToWindow
              ? "h-full w-full items-center justify-center"
              : "min-h-full min-w-full",
          )}
        >
          <img
            ref={imageRef}
            src={objectUrl}
            alt={displayName}
            draggable={false}
            onLoad={(event) => {
              const image = event.currentTarget;
              setNaturalSize({
                width: image.naturalWidth || image.width,
                height: image.naturalHeight || image.height,
              });
            }}
            className={
              fitToWindow
                ? "max-h-full max-w-full object-contain drop-shadow-lg"
                : "m-auto max-w-none object-contain drop-shadow-lg"
            }
            style={
              !fitToWindow && naturalSize
                ? {
                    width: (naturalSize.width * zoom) / 100,
                    height: (naturalSize.height * zoom) / 100,
                  }
                : undefined
            }
          />
        </div>
      );
    }

    if (kind === "pdf" && objectUrl) {
      return (
        <iframe
          src={objectUrl}
          title={displayName}
          className="h-full w-full border-0 bg-white"
        />
      );
    }

    if (kind === "html") {
      return (
        <iframe
          srcDoc={displayText}
          sandbox=""
          title={displayName}
          className="h-full w-full border-0 bg-white"
        />
      );
    }

    if (kind === "markdown") {
      return (
        <div className="preview-paper">
          <article
            className="preview-paper__page"
            onClick={(event) => {
              // Links to site documents (e.g. /Documents/Projects/Delalos.md) open
              // in their own Preview window; other links leave the site.
              const href = (event.target as HTMLElement)
                .closest("a")
                ?.getAttribute("href");
              if (!href?.startsWith("/Documents/")) return;
              event.preventDefault();
              const path = decodeURIComponent(href);
              // Folders (e.g. /Documents/North Star) open in Finder; files open in Preview.
              if (!/\.[a-z0-9]+$/i.test(path)) {
                launchApp("finder", { initialPath: path });
                return;
              }
              launchApp("preview", { initialData: { path } });
            }}
          >
            <Streamdown
              controls={false}
              mode="static"
              skipHtml
              linkSafety={{ enabled: false }}
            >
              {markdownText}
            </Streamdown>
          </article>
        </div>
      );
    }

    if (kind === "text") {
      return (
        <pre className="min-h-full whitespace-pre-wrap break-words p-6 font-os-mono text-sm text-os-text-primary">
          {displayText}
        </pre>
      );
    }

    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <span className="text-5xl" aria-hidden="true">
          📄
        </span>
        <strong>{t("apps.preview.status.unsupported")}</strong>
        <span className="text-os-text-secondary">
          {t("apps.preview.status.unsupportedDescription")}
        </span>
      </div>
    );
  })();

  return (
    <AppWindowShell
      isWindowOpen={isWindowOpen}
      isWindowsTheme={isWindowsTheme}
      isForeground={isForeground}
      menuBar={menuBar}
      windowFrameProps={{
        title: displayName,
        onClose,
        isForeground,
        appId: "preview",
        skipInitialSound,
        instanceId,
        onNavigateNext,
        onNavigatePrevious,
      }}
      leading={
        <input
          ref={fileInputRef}
          type="file"
          accept={PREVIEW_FILE_ACCEPT}
          className="hidden"
          onChange={handleFileInputChange}
        />
      }
      trailing={
        <>
          <SaveFileDialog
            isOpen={isSaveAsDialogOpen}
            onOpenChange={setIsSaveAsDialogOpen}
            onSubmit={(value, directoryPath) =>
              void handleSaveAsSubmit(value, directoryPath)
            }
            title={t("apps.preview.saveAs.title")}
            description={t("apps.preview.saveAs.description")}
            value={saveAsFileName}
            onChange={setSaveAsFileName}
            defaultDirectory={isImage ? "/Images" : "/Documents"}
            isLoading={isSaving}
          />
          <AppHelpAboutDialogs
            appId="preview"
            helpItems={translatedHelpItems}
            metadata={appMetadata}
            isHelpOpen={isHelpDialogOpen}
            onHelpOpenChange={setIsHelpDialogOpen}
            isAboutOpen={isAboutDialogOpen}
            onAboutOpenChange={setIsAboutDialogOpen}
          />
        </>
      }
    >
      <div
        ref={containerRef}
        className={cn(
          "relative h-full w-full overflow-auto font-os-ui text-os-text-primary",
          isAquaGlass ? "bg-transparent" : "bg-os-panel-bg",
          // Let the browser handle one-finger panning but keep pinch and
          // double-tap for the image zoom gestures (not page zoom).
          isImage &&
            Boolean(objectUrl) &&
            "select-none touch-pan-x touch-pan-y overscroll-contain",
        )}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        {previewContent}
      </div>
    </AppWindowShell>
  );
}
