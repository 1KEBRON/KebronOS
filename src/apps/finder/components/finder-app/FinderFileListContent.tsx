import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { FileList, type FileItem, type FileListProps } from "../FileList";
import { FinderMapView } from "../map/FinderMapView";
import type { TFunction } from "i18next";

export interface FinderFileListContentProps {
  t: TFunction;
  isLoading: boolean;
  error: string | null | undefined;
  sortedFiles: FileItem[];
  listClassName?: string;
  listStyle?: CSSProperties;
  /** Whether this Finder window is in front (the Map view listens for Escape). */
  isForeground?: boolean;
  fileListProps: Pick<
    FileListProps,
    | "viewType"
    | "selectedFile"
    | "selectedFiles"
    | "selectionAnchorPath"
    | "currentPath"
    | "canDropFiles"
    | "onFileOpen"
    | "onFileSelect"
    | "getFileType"
    | "onFileDrop"
    | "onDropToCurrentDirectory"
    | "onRenameRequest"
    | "onItemContextMenu"
  >;
}

export function FinderFileListContent({
  t,
  isLoading,
  error,
  sortedFiles,
  listClassName,
  listStyle,
  isForeground,
  fileListProps,
}: FinderFileListContentProps) {
  const { viewType } = fileListProps;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        {t("apps.finder.messages.loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-500">
        {error}
      </div>
    );
  }

  const folderPath = fileListProps.currentPath ?? "/";

  if (viewType === "map") {
    return (
      <div className={cn(listClassName, "relative min-h-0 overflow-hidden")} style={listStyle}>
        <FinderMapView
          key={folderPath}
          files={sortedFiles}
          folderPath={folderPath}
          isForeground={isForeground}
          onFileOpen={(file) => fileListProps.onFileOpen(file)}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        listClassName,
        viewType === "list" ? "overflow-auto" : "overflow-y-auto overflow-x-hidden"
      )}
      style={listStyle}
    >
      <FileList files={sortedFiles} {...fileListProps} />
    </div>
  );
}
