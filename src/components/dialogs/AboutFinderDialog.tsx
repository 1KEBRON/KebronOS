import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useAppStore } from "@/stores/useAppStore";
import { KebronMark } from "@/components/shared/KebronMark";
import { KEBRON_SOURCE_URL } from "@/config/kebronSite";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface AboutFinderDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

// About Kebron OS: the mark, the name, and credits. ryOS's simulated memory
// readout is gone; a browser can't report anything meaningful there.
export function AboutFinderDialog({
  isOpen,
  onOpenChange,
}: AboutFinderDialogProps) {
  const { t } = useTranslation();
  const { isWindowsTheme, currentTheme } = useThemeFlags();
  const version = useAppStore((state) => state.ryOSVersion);
  const buildNumber = useAppStore((state) => state.ryOSBuildNumber);
  const buildTime = useAppStore((state) => state.ryOSBuildTime);
  const [versionDisplayMode, setVersionDisplayMode] = useState(0); // 0: site, 1: build, 2: date

  const aboutFinderSmallClass = cn(
    "about-finder-small",
    isWindowsTheme
      ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[10px]"
      : currentTheme === "macosx"
      ? "font-os-ui text-[13px]"
      : "text-[10px]"
  );

  const link = "text-os-link hover:underline";

  const dialogContent = (
    <div
      className={cn(
        "about-finder-dialog",
        isWindowsTheme ? "p-2 px-4" : "p-4"
      )}
    >
      <div className="flex flex-row items-center gap-4 p-2 px-4">
        <div className="about-finder-branding flex w-1/3 flex-col items-center">
          <KebronMark className="mb-1 size-10" />
          <div
            className={cn(
              isWindowsTheme
                ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[16px]"
                : currentTheme === "macosx"
                ? "font-apple-garamond text-2xl"
                : "font-os-ui text-xl"
            )}
          >
            Kebron OS
          </div>
          <div
            className={cn(
              aboutFinderSmallClass,
              "cursor-pointer select-none transition-opacity hover:opacity-70 text-neutral-500"
            )}
            onClick={() => setVersionDisplayMode((prev) => (prev + 1) % 3)}
            title={t("common.aboutThisMac.clickToToggle")}
          >
            {versionDisplayMode === 0
              ? "kebron.org"
              : versionDisplayMode === 1
              ? (buildNumber || version || "...")
              : (buildTime ? new Date(buildTime).toLocaleDateString() : "...")}
          </div>
        </div>

        <div className={cn(aboutFinderSmallClass, "flex-1 space-y-2")}>
          <p>By Kebron Solomon Zerie.</p>
          <p className="text-neutral-500">
            A fork of{" "}
            <a href="https://github.com/ryokun6/ryos" target="_blank" rel="noopener noreferrer" className={link}>
              ryOS
            </a>{" "}
            by Ryo Lu <span className="whitespace-nowrap">(AGPL-3.0).</span>
            <br />
            Ocean by{" "}
            <a href="https://github.com/noxellab/nagi-ocean-sim" target="_blank" rel="noopener noreferrer" className={link}>
              NAGI
            </a>{" "}
            (MIT).
            <br />
            <a href={KEBRON_SOURCE_URL} target="_blank" rel="noopener noreferrer" className={link}>
              Source code
            </a>
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("max-w-[400px]", isWindowsTheme && "p-0 overflow-hidden")}
        style={isWindowsTheme ? { fontSize: "11px" } : undefined}
        // About This Computer is a system reference panel, not an in-window
        // action sheet — always present as a centered modal even on Aqua.
        disableSheet
      >
        {isWindowsTheme ? (
          <>
            <DialogTitle className="sr-only">
              {t("common.aboutThisMac.title")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("common.aboutThisMac.description")}
            </DialogDescription>
            <DialogHeader>{t("common.aboutThisMac.title")}</DialogHeader>
            <div className="window-body">{dialogContent}</div>
          </>
        ) : currentTheme === "macosx" ? (
          <>
            <DialogTitle className="sr-only">
              {t("common.aboutThisMac.title")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("common.aboutThisMac.description")}
            </DialogDescription>
            <DialogHeader>{t("common.aboutThisMac.title")}</DialogHeader>
            {dialogContent}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-normal text-[16px]">
                {t("common.aboutThisMac.title")}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {t("common.aboutThisMac.description")}
              </DialogDescription>
            </DialogHeader>
            {dialogContent}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
