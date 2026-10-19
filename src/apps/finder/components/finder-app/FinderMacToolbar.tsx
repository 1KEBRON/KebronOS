import { startTransition, useState } from "react";
import {
  CaretLeft,
  CaretRight,
  SquaresFour,
  List,
  GearSix,
  CaretDown,
} from "@phosphor-icons/react";
import { SearchInput } from "@/components/ui/search-input";
import { ToolbarButton, ToolbarButtonGroup } from "@/components/ui/toolbar-button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { ViewType } from "../FinderMenuBar";
import type { TFunction } from "i18next";

export interface FinderMacToolbarProps {
  t: TFunction;
  isAirDropView: boolean;
  currentPath: string;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  viewType: ViewType;
  setViewType: (view: ViewType) => void;
  /** Offer List | Map (the folder's documents link to each other). */
  canShowMap: boolean;
  canNavigateBack: () => boolean;
  canNavigateForward: () => boolean;
  canCreateFolder: boolean;
  navigateBack: () => void;
  navigateForward: () => void;
  navigateAwayFromAirDrop: () => void;
  navigateUp: () => void;
  handleNewFolder: () => void;
  handleImportFile: () => void;
  handleNewWindow: () => void;
}

export function FinderMacToolbar({
  t,
  isAirDropView,
  currentPath,
  searchQuery,
  setSearchQuery,
  viewType,
  setViewType,
  canShowMap,
  canNavigateBack,
  canNavigateForward,
  canCreateFolder,
  navigateBack,
  navigateForward,
  navigateAwayFromAirDrop,
  navigateUp,
  handleNewFolder,
  handleImportFile,
  handleNewWindow,
}: FinderMacToolbarProps) {
  return (
    <div
      className="flex items-center justify-between py-1.5 gap-2 px-1"
      style={{ background: "transparent" }}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <ToolbarButtonGroup>
          <ToolbarButton
            icon
            onClick={() => {
              if (isAirDropView) {
                navigateAwayFromAirDrop();
              } else {
                navigateBack();
              }
            }}
            disabled={!isAirDropView && !canNavigateBack()}
          >
            <CaretLeft size={14} weight="fill" className="scale-x-150 scale-y-90" />
          </ToolbarButton>
          <ToolbarButton icon onClick={navigateForward} disabled={!canNavigateForward()}>
            <CaretRight size={14} weight="fill" className="scale-x-150 scale-y-90" />
          </ToolbarButton>
        </ToolbarButtonGroup>
        {/* List | Map, only for folders whose documents link to each other (North Star). */}
        {canShowMap && (
          <ToolbarButtonGroup role="radiogroup" aria-label={t("apps.finder.view.map")}>
            {(["list", "map"] as const).map((mode) => {
              const on = (viewType === "map") === (mode === "map");
              return (
                <ToolbarButton
                  key={mode}
                  role="radio"
                  aria-checked={on}
                  data-state={on ? "on" : "off"}
                  data-finder-view-mode={mode}
                  className="px-2.5 text-[12px] font-medium"
                  onClick={() => {
                    if (!on) setViewType(mode);
                  }}
                >
                  {t(`apps.finder.view.${mode}`)}
                </ToolbarButton>
              );
            })}
          </ToolbarButtonGroup>
        )}
        {viewType !== "map" && (
          <ToolbarButtonGroup className={canShowMap ? "max-sm:hidden" : undefined}>
            <ToolbarButton
              icon
              aria-label={t("apps.finder.menu.byIcon")}
              data-state={viewType === "large" || viewType === "small" ? "on" : "off"}
              onClick={() => setViewType("large")}
            >
              <SquaresFour size={14} />
            </ToolbarButton>
            <ToolbarButton
              icon
              aria-label={t("apps.finder.menu.byList")}
              data-state={viewType === "list" ? "on" : "off"}
              onClick={() => setViewType("list")}
            >
              <List size={14} />
            </ToolbarButton>
          </ToolbarButtonGroup>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <ToolbarButtonGroup>
              <ToolbarButton icon className="gap-0.5">
                <GearSix size={14} weight="fill" style={{ transform: "rotate(30deg)" }} />
                <CaretDown size={8} weight="bold" />
              </ToolbarButton>
            </ToolbarButtonGroup>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              className="text-md h-6 px-3"
              onClick={handleNewFolder}
              disabled={!canCreateFolder}
            >
              {t("apps.finder.contextMenu.newFolder")}
            </DropdownMenuItem>
            <DropdownMenuItem className="text-md h-6 px-3" onClick={handleImportFile}>
              {t("apps.finder.menu.import")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-md h-6 px-3"
              onClick={navigateUp}
              disabled={currentPath === "/"}
            >
              {t("apps.finder.menu.goUp")}
            </DropdownMenuItem>
            <DropdownMenuItem className="text-md h-6 px-3" onClick={handleNewWindow}>
              {t("apps.finder.menu.newWindow")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex-1" />
      <FinderSearchInput
        initialValue={searchQuery}
        onChange={setSearchQuery}
        className="w-[150px] max-sm:w-[88px]"
      />
    </div>
  );
}

// Keep keystrokes local; filtering and the rest of the Finder tree can yield.
function FinderSearchInput({ initialValue, onChange, className }: {
  initialValue: string;
  onChange: (query: string) => void;
  className: string;
}) {
  const [value, setValue] = useState(initialValue);
  return <SearchInput value={value} className={className} onChange={(query) => {
    setValue(query);
    startTransition(() => onChange(query));
  }} />;
}
