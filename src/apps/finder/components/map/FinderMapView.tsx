import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Article,
  BookOpen,
  File,
  FileText,
  FilmSlate,
  Folder,
  Lightbulb,
  LinkSimple,
  Play,
  Question,
  X,
} from "@phosphor-icons/react";
import { useThemeStore } from "@/stores/useThemeStore";
import type { FileItem } from "../file-list/types";
import { buildFolderMap } from "../../map/folderGraph";
import { useFolderDocuments } from "../../map/folderDocuments";
import { youTubeId } from "../../map/frontMatter";
import {
  SHEET_HEIGHT,
  isCompact,
  layout,
  mapCentre,
  nodeHues,
  scatter,
  type MapNodeKind,
  type Tier,
} from "../../map/layout";

// Finder's Map view: any folder as an idea map (the former Constellation app).
// Visual language: Apple's 2013 "Intention" film — a flat canvas, solid colour
// discs, hairlines, thin type, and motion that gathers and re-forms.

const KIND_LABEL: Record<MapNodeKind, string> = {
  folder: "Folder",
  question: "Question",
  thought: "Thought",
  video: "Video",
  film: "Film",
  book: "Book",
  post: "Post",
  link: "Link",
  document: "Document",
  file: "File",
};

const KIND_ICON = {
  folder: Folder,
  question: Question,
  thought: Lightbulb,
  video: Play,
  film: FilmSlate,
  book: BookOpen,
  post: Article,
  link: LinkSimple,
  document: FileText,
  file: File,
} as const;

const DISC_SIZE: Record<Tier, number> = { focus: 56, near: 30, far: 7, hidden: 7 };
const TIER_OPACITY: Record<Tier, number> = { focus: 1, near: 1, far: 0.45, hidden: 0 };

function folderName(path: string) {
  if (path === "/") return "Macintosh HD";
  return path.split("/").filter(Boolean).pop() ?? path;
}

export interface FinderMapViewProps {
  files: FileItem[];
  folderPath: string;
  isForeground?: boolean;
  onFileOpen: (file: FileItem) => void;
}

export function FinderMapView({ files, folderPath, isForeground = true, onFileOpen }: FinderMapViewProps) {
  const isDark = useThemeStore((s) => s.isDark);
  const reduceMotion = useReducedMotion();

  const { docs, ready } = useFolderDocuments(useMemo(() => files.map((f) => f.path), [files]));
  const { graph, start } = useMemo(
    () => buildFolderMap(folderPath, folderName(folderPath), files, docs),
    [folderPath, files, docs]
  );
  const hues = useMemo(() => nodeHues(graph), [graph]);
  const fileByPath = useMemo(() => new Map(files.map((f) => [f.path, f])), [files]);

  const [trailState, setTrail] = useState<string[]>([]);
  const trail = useMemo(() => {
    const kept = trailState.filter((id) => graph.nodes.has(id));
    return kept.length ? kept : start ? [start] : [];
  }, [trailState, graph, start]);
  const focusId = trail[trail.length - 1] ?? null;
  const focus = focusId ? graph.nodes.get(focusId) ?? null : null;

  const [playing, setPlaying] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [focusId]);

  const canvasRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const placements = useMemo(
    () => (size.width && focusId ? layout(graph, focusId, size.width, size.height) : null),
    [graph, focusId, size]
  );
  const initialPositions = useMemo(
    () => (size.width ? scatter(graph, size.width, size.height) : null),
    // New nodes gather from their own scattered spot; the opening size is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph, size.width > 0]
  );

  const [ripple, setRipple] = useState<{ x: number; y: number; key: number } | null>(null);

  const openNode = useCallback(
    (id: string) => {
      const file = fileByPath.get(id);
      if (file) onFileOpen(file);
    },
    [fileByPath, onFileOpen]
  );

  const goTo = useCallback(
    (id: string) => {
      if (!placements) return;
      if (id === focusId) {
        // Tapping the focused item plays a video, or opens anything else.
        if (youTubeId(graph.nodes.get(id)?.url)) setPlaying(id);
        else openNode(id);
        return;
      }
      const target = placements.get(id);
      if (target) setRipple({ x: target.x, y: target.y, key: Date.now() });
      setPlaying(null);
      setTrail(() => {
        const existing = trail.indexOf(id);
        return existing >= 0 ? trail.slice(0, existing + 1) : [...trail, id];
      });
    },
    [focusId, placements, graph, openNode, trail]
  );
  const goBack = useCallback(() => {
    if (playing) {
      setPlaying(null);
      return;
    }
    setTrail(trail.length > 1 ? trail.slice(0, -1) : trail);
  }, [playing, trail]);

  useEffect(() => {
    if (!isForeground) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      if (!playing && trail.length <= 1) return;
      event.preventDefault();
      goBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isForeground, goBack, playing, trail.length]);

  const spring = reduceMotion ? { duration: 0 } : { type: "spring" as const, stiffness: 110, damping: 20, mass: 0.9 };

  const compact = isCompact(size.width);
  const ink = isDark ? "#f5f5f7" : "#1d1d1f";
  const muted = isDark ? "rgba(245,245,247,0.6)" : "rgba(29,29,31,0.55)";
  const hairline = isDark ? "rgba(255,255,255,0.26)" : "rgba(0,0,0,0.18)";
  const canvasBg = isDark ? "#111113" : "#ffffff";
  const thin = { fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', fontWeight: 300 };
  const centre = mapCentre(size.width, size.height);
  const focusVideoId = youTubeId(focus?.url);
  const playingNode = playing ? graph.nodes.get(playing) : undefined;
  const playingId = youTubeId(playingNode?.url);
  const focusHue = focusId ? hues.get(focusId) : undefined;
  const canOpenFocus = Boolean(focusId && fileByPath.has(focusId));

  return (
    <div
      ref={canvasRef}
      className="finder-map relative h-full w-full select-none overflow-hidden"
      style={{ background: canvasBg, color: ink, ...thin }}
      data-finder-view="map"
    >
      {ready && graph.nodes.size === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-[13px]" style={{ color: muted }}>
          This folder is empty.
        </div>
      )}
      {ready && placements && initialPositions && focus && focusId && (
        <>
          <svg className="pointer-events-none absolute inset-0" width={size.width} height={size.height} aria-hidden="true">
            {graph.edges.map(([a, b]) => {
              const pa = placements.get(a)!;
              const pb = placements.get(b)!;
              const touchesFocus = a === focusId || b === focusId;
              // Only lines that touch the focus, plus faint ones out to second-degree dots.
              const toFar = (pa.tier === "near" && pb.tier === "far") || (pa.tier === "far" && pb.tier === "near");
              const opacity = touchesFocus ? 1 : toFar ? 0.35 : 0;
              const sa = initialPositions.get(a) ?? pa;
              const sb = initialPositions.get(b) ?? pb;
              return (
                <motion.line
                  key={`${a}|${b}`}
                  initial={{ x1: sa.x, y1: sa.y, x2: sb.x, y2: sb.y, opacity: 0 }}
                  animate={{ x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, opacity }}
                  transition={spring}
                  stroke={hairline}
                  strokeWidth={1}
                />
              );
            })}
          </svg>

          {ripple && !reduceMotion && (
            <motion.span
              key={ripple.key}
              className="pointer-events-none absolute rounded-full"
              style={{ left: ripple.x - 24, top: ripple.y - 24, width: 48, height: 48, border: `1.5px solid ${focusHue}` }}
              initial={{ scale: 0.5, opacity: 0.8 }}
              animate={{ scale: 2.6, opacity: 0 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            />
          )}

          {[...graph.nodes.values()].map((node) => {
            const place = placements.get(node.id)!;
            const startAt = initialPositions.get(node.id) ?? place;
            const disc = DISC_SIZE[place.tier];
            const hue = hues.get(node.id)!;
            const showFace = place.tier === "focus" || place.tier === "near";
            const thumb = node.kind === "video" ? youTubeId(node.url) : null;
            const Icon = KIND_ICON[node.kind];
            const labelSide = place.x >= size.width / 2 ? "right" : "left";
            const showLabel = place.tier === "near";
            return (
              <motion.button
                key={node.id}
                type="button"
                aria-label={node.title}
                aria-current={place.tier === "focus" ? "true" : undefined}
                tabIndex={place.tier === "hidden" ? -1 : 0}
                onClick={() => goTo(node.id)}
                className="absolute left-0 top-0 flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-1"
                style={{ pointerEvents: place.tier === "hidden" ? "none" : "auto" }}
                data-map-node={node.id}
                initial={{ x: startAt.x - 22, y: startAt.y - 22, opacity: 0 }}
                animate={{ x: place.x - 22, y: place.y - 22, opacity: TIER_OPACITY[place.tier] }}
                transition={spring}
              >
                {place.tier === "focus" && (
                  <motion.span
                    className="absolute rounded-full"
                    style={{ width: 72, height: 72, border: `1.5px solid ${hue}` }}
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={spring}
                  />
                )}
                <motion.span
                  className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full"
                  style={{ background: hue }}
                  animate={{ width: disc, height: disc }}
                  transition={spring}
                >
                  {showFace && thumb && (
                    <img
                      src={`https://i.ytimg.com/vi/${thumb}/mqdefault.jpg`}
                      alt=""
                      loading="lazy"
                      draggable={false}
                      className="absolute inset-0 size-full object-cover"
                    />
                  )}
                  {showFace && (
                    <Icon
                      weight="fill"
                      className="relative"
                      size={place.tier === "focus" ? 22 : 13}
                      color="#fff"
                      style={thumb ? { filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.6))" } : undefined}
                    />
                  )}
                </motion.span>
                <AnimatePresence>
                  {showLabel && (
                    <motion.span
                      className={
                        compact
                          ? "absolute left-1/2 w-max max-w-[118px] -translate-x-1/2 text-center text-[11.5px] leading-snug"
                          : "absolute top-1/2 w-max max-w-[170px] -translate-y-1/2 text-[12.5px] leading-snug"
                      }
                      style={
                        compact
                          ? place.y < centre.y
                            ? { bottom: 40 }
                            : { top: 40 }
                          : labelSide === "right"
                            ? { left: 44, textAlign: "left" }
                            : { right: 44, textAlign: "right" }
                      }
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: reduceMotion ? 0 : 0.35 }}
                    >
                      {node.title}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            );
          })}

          {/* Trail: where you came from. */}
          {trail.length > 1 && (
            <nav
              aria-label="Trail"
              className="absolute left-4 top-3 flex max-w-[80%] flex-wrap items-center gap-x-1.5 text-[12px]"
              style={{ color: muted }}
            >
              {trail.slice(0, -1).map((id) => (
                <span key={id} className="flex items-center gap-1.5">
                  <button type="button" onClick={() => goTo(id)} className="max-w-[160px] truncate hover:underline">
                    {graph.nodes.get(id)?.title}
                  </button>
                  <span aria-hidden="true">›</span>
                </span>
              ))}
            </nav>
          )}

          {/* Caption: the focused item's name, small, just above its disc. */}
          <AnimatePresence mode="wait">
            <motion.div
              key={`caption-${focusId}`}
              className="pointer-events-none absolute line-clamp-2 text-center text-[12.5px] leading-snug"
              style={{ left: centre.x - (compact ? 80 : 100), width: compact ? 160 : 200, bottom: size.height - centre.y + 44 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.3 }}
            >
              {focus.title}
            </motion.div>
          </AnimatePresence>

          {/* Bottom sheet: the focused item in full. Thumb-reachable on phones. */}
          <motion.section
            aria-live="polite"
            className="absolute inset-x-0 bottom-0 z-[5] flex flex-col"
            style={{
              background: canvasBg,
              borderTop: `1px solid ${hairline}`,
              boxShadow: expanded ? "0 -12px 40px rgba(0,0,0,0.12)" : "none",
            }}
            initial={false}
            animate={{ height: expanded ? Math.min(size.height * 0.62, 420) : SHEET_HEIGHT }}
            transition={spring}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={focusId}
                className="flex min-h-0 flex-1 flex-col px-5 pb-4 pt-3 sm:px-8"
                initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.25 }}
              >
                <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.16em]" style={{ color: focusHue }}>
                  <span className="size-2 rounded-full" style={{ background: focusHue }} />
                  {KIND_LABEL[focus.kind]}
                  {focus.by ? ` · ${focus.by}` : ""}
                </div>
                <div className="mt-1 flex items-start gap-3">
                  <h2 className="min-w-0 flex-1 text-[18px] leading-snug sm:text-[20px]" style={{ fontWeight: 300 }}>
                    {focus.title}
                  </h2>
                  {focusVideoId && (
                    <button
                      type="button"
                      onClick={() => setPlaying(focusId)}
                      className="flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] text-white"
                      style={{ background: focusHue }}
                    >
                      <Play weight="fill" size={12} /> Play
                    </button>
                  )}
                  {!focusVideoId && canOpenFocus && (
                    <button
                      type="button"
                      onClick={() => openNode(focusId)}
                      className="flex shrink-0 items-center gap-1 rounded-full px-3.5 py-1.5 text-[13px]"
                      style={{ color: focusHue, boxShadow: `inset 0 0 0 1px ${focusHue}` }}
                    >
                      Open ›
                    </button>
                  )}
                </div>
                {focus.body && (
                  <>
                    <p
                      className={`mt-1.5 min-h-0 whitespace-pre-line text-[13.5px] leading-relaxed ${
                        expanded ? "overflow-y-auto" : "line-clamp-2"
                      }`}
                      style={{ color: muted }}
                    >
                      {focus.body}
                    </p>
                    <button
                      type="button"
                      onClick={() => setExpanded((v) => !v)}
                      className="mt-1 self-start text-[12.5px] hover:underline"
                      style={{ color: focusHue }}
                    >
                      {expanded ? "Less" : "More"}
                    </button>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.section>

          {/* In-app video player. */}
          <AnimatePresence>
            {playing && playingId && playingNode && (
              <motion.div
                className="absolute inset-0 z-10 flex items-center justify-center p-4 sm:p-8"
                style={{ background: isDark ? "rgba(10,10,12,0.86)" : "rgba(255,255,255,0.9)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.25 }}
                onClick={() => setPlaying(null)}
              >
                <motion.div
                  className="relative aspect-video w-full max-w-[860px] overflow-hidden rounded-xl bg-black shadow-2xl"
                  initial={{ scale: reduceMotion ? 1 : 0.94 }}
                  animate={{ scale: 1 }}
                  transition={spring}
                  onClick={(event) => event.stopPropagation()}
                >
                  <iframe
                    title={playingNode.title}
                    src={`https://www.youtube-nocookie.com/embed/${playingId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
                    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                    allowFullScreen
                    className="absolute inset-0 size-full border-0"
                  />
                </motion.div>
                <a
                  href={playingNode.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  className="absolute bottom-3 text-[12.5px] hover:underline"
                  style={{ color: muted }}
                >
                  Watch on YouTube ↗
                </a>
                <button
                  type="button"
                  aria-label="Close video"
                  onClick={() => setPlaying(null)}
                  className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full"
                  style={{ color: ink, background: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)" }}
                >
                  <X size={16} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
