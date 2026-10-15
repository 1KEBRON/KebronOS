import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
} from "@/components/ui/menubar";
import { MENUBAR_SEPARATOR_CLASS } from "@/components/shared/menubar/menubarStyles";
import { LibraryTrackBrowser } from "@/components/shared/menubar/LibraryTrackBrowser";
import { IpodMenuBarLibrarySourceActions } from "./IpodMenuBarLibrarySourceActions";
import { IpodMenuBarLibrarySwitchItem } from "./IpodMenuBarLibrarySwitchItem";
import type { IpodMenuBarViewModel } from "./useIpodMenuBar";
import { HAS_API } from "@/config/kebronSite";

export function IpodMenuBarLibraryMenu({ vm }: { vm: IpodMenuBarViewModel }) {
  const { t, tracks, currentIndex, artists, tracksByArtist, handlePlayTrack, onAddSong } = vm;
  return (
    <>
      <MenubarMenu>
        <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
          {t("apps.ipod.menu.library")}
        </MenubarTrigger>
        <MenubarContent
          align="start"
          sideOffset={1}
          className="px-0 max-w-[260px] sm:max-w-[280px]"
        >
          {HAS_API && (
            <>
              <MenubarItem
                onClick={onAddSong}
                className="text-md h-6 px-3 whitespace-nowrap"
              >
                {t("apps.ipod.menu.addToLibrary")}
              </MenubarItem>

              <IpodMenuBarLibrarySourceActions vm={vm} />

              <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
            </>
          )}

          {tracks.length > 0 && (
            <>
              <LibraryTrackBrowser
                tracks={tracks}
                currentIndex={currentIndex}
                tracksByArtist={tracksByArtist}
                artists={artists}
                onPlayTrack={handlePlayTrack}
                t={t}
              />

              {HAS_API && <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />}
            </>
          )}

          {HAS_API && <IpodMenuBarLibrarySwitchItem vm={vm} />}
        </MenubarContent>
      </MenubarMenu>
    </>
  );
}
