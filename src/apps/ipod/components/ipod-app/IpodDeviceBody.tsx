import { cn } from "@/lib/utils";
import { IpodWheel } from "../IpodWheel";
import { IpodScreenArea } from "./IpodScreenArea";
import type { IpodAppController } from "./useIpodAppController";

type IpodDeviceBodyProps = {
  c: IpodAppController;
};

/** Device finish for the stored iPod theme: classic = Pearl, black = Graphite, u2 = U2. */
export function getIpodFinish(theme: string): "pearl" | "graphite" | "u2" {
  if (theme === "black") return "graphite";
  if (theme === "u2") return "u2";
  return "pearl";
}

/**
 * The iPod hardware: polished body with a stainless rim, a recessed screen
 * under a glass lens, and the click wheel. Styled in src/styles/ipod-device.css.
 * In frameless mode (Kebron's theme) the device is the whole window: it is
 * draggable by its body, casts its own shadow onto the desktop and carries a
 * hover close button at its top-left corner.
 */
export function IpodDeviceBody({ c }: IpodDeviceBodyProps) {
  const {
    t,
    containerRef,
    theme,
    scale,
    handleWheelClick,
    handleWheelRotation,
    handleMenuButton,
    handleCenterLongPress,
    isFramelessDevice,
    handleClose,
  } = c;

  return (
    <div
      ref={containerRef}
      className={cn(
        "ipod-device-surface ipod-force-font flex flex-col items-center justify-center w-full h-full select-none",
        !isFramelessDevice && "p-4"
      )}
      style={
        isFramelessDevice
          ? // Let the device shadow fall outside the window box.
            { position: "relative" }
          : { position: "relative", overflow: "hidden", contain: "layout style paint" }
      }
    >
      <div
        className="ipod-device ipod-force-font"
        data-finish={getIpodFinish(theme)}
        data-frameless={isFramelessDevice ? "" : undefined}
        data-window-drag-region={isFramelessDevice ? "" : undefined}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "center",
          // A frameless device is rasterized at its final scale so text and
          // edges stay crisp; the windowed one keeps the cheaper layer.
          willChange: isFramelessDevice ? undefined : "transform",
        }}
      >
        {isFramelessDevice && (
          <button
            type="button"
            className="ipod-device__close"
            aria-label={t("common.window.close")}
            title={t("common.window.close")}
            data-no-window-drag=""
            onClick={(e) => {
              e.stopPropagation();
              handleClose();
            }}
          >
            <svg viewBox="0 0 10 10" width="8" height="8" aria-hidden="true">
              <path
                d="M1.5 1.5 8.5 8.5 M8.5 1.5 1.5 8.5"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </button>
        )}
        <div className="ipod-device__well" data-no-window-drag="">
          <IpodScreenArea c={c} />
          <div className="ipod-device__glass" aria-hidden="true" />
        </div>
        <IpodWheel
          theme={theme}
          onWheelClick={handleWheelClick}
          onWheelRotation={handleWheelRotation}
          onMenuButton={handleMenuButton}
          onCenterLongPress={handleCenterLongPress}
        />
      </div>
    </div>
  );
}
