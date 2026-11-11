"use client";

// Images & videos — the photos and clips the public homepage shows.
//
// The pieces already existed (the `homepage-media` storage bucket, the upload
// route, the store the homepage reads); there was simply no screen to drive
// them, so the owner had no way to change their own homepage. This is that
// screen.
//
// Photos are converted to WebP in the browser before they are sent, because
// that is the only image type the bucket accepts. Videos go up as MP4.

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import {
  HOME_MEDIA_LIMITS,
  getHomeMediaServerSnapshot,
  getHomeMediaSnapshot,
  homeMediaFrom,
  saveHomeMedia,
  subscribeToHomeMedia,
  type HomeMedia,
} from "../../lib/homeMediaStore";
import { compressToWebp } from "../../lib/compressImage";
import { useAdmin } from "./Store";
import { Btn, Card, Empty, Icon, Page, PageHead, cx } from "./kit";

type Slot = "gallery" | "videos";

const SLOTS: { key: Slot; title: string; blurb: string; kind: "image" | "video"; max: number }[] = [
  { key: "gallery", title: "Images", blurb: "Four photos — one row on the homepage. Each one can carry a caption.", kind: "image", max: HOME_MEDIA_LIMITS.gallery },
  { key: "videos", title: "Videos", blurb: "Four short MP4 clips — one row on the homepage, under the photos. Up to 15 MB each.", kind: "video", max: HOME_MEDIA_LIMITS.videos },
];

/** Everything currently in a slot, as a list. */
function listOf(media: HomeMedia, slot: Slot): string[] {
  return media[slot];
}

function withSlot(media: HomeMedia, slot: Slot, urls: string[]): HomeMedia {
  return { ...media, [slot]: urls };
}

export default function MediaPage() {
  const { toast, confirm } = useAdmin();
  const rows = useSyncExternalStore(subscribeToHomeMedia, getHomeMediaSnapshot, getHomeMediaServerSnapshot);
  const media = homeMediaFrom(rows);
  const [busy, setBusy] = useState<Slot | null>(null);

  const upload = useCallback(
    async (slot: Slot, kind: "image" | "video", files: FileList | null) => {
      if (!files || files.length === 0) return;
      const max = SLOTS.find((s) => s.key === slot)!.max;
      const current = listOf(media, slot);
      const room = max - current.length;
      if (room <= 0) {
        toast({ kind: "err", title: `That slot already holds its ${max}. Remove one first.` });
        return;
      }
      setBusy(slot);
      const added: string[] = [];
      for (const file of Array.from(files).slice(0, room)) {
        try {
          // The bucket only takes WebP, so a JPEG or PNG is converted here
          // rather than bounced back at the owner with a file-type error.
          const body = new FormData();
          if (kind === "image") {
            const webp = await compressToWebp(file);
            body.append("file", new File([webp.blob], "photo.webp", { type: "image/webp" }));
          } else {
            body.append("file", file);
          }
          body.append("kind", kind);
          const res = await fetch("/api/upload-media", { method: "POST", body });
          const json = (await res.json()) as { url?: string; error?: { message?: string } };
          if (!res.ok || !json.url) throw new Error(json.error?.message || "Upload failed");
          added.push(json.url);
        } catch (e) {
          toast({ kind: "err", title: e instanceof Error ? e.message : "Could not upload that file." });
        }
      }
      setBusy(null);
      if (added.length === 0) return;
      saveHomeMedia(withSlot(media, slot, [...current, ...added]));
      toast({ kind: "ok", title: `${added.length} file${added.length === 1 ? "" : "s"} added. The homepage shows ${added.length === 1 ? "it" : "them"} now.` });
    },
    [media, toast],
  );

  const remove = useCallback(
    async (slot: Slot, url: string) => {
      if (!(await confirm({ title: "Remove this from the homepage?", body: "The file stays in storage — it just stops being shown.", ok: "Remove", danger: true }))) return;
      const captions = { ...media.captions };
      delete captions[url];
      saveHomeMedia({ ...withSlot(media, slot, listOf(media, slot).filter((u) => u !== url)), captions });
      toast({ kind: "ok", title: "Removed from the homepage." });
    },
    [media, confirm, toast],
  );

  /** Order matters on the homepage, so each tile can walk left or right. */
  const move = useCallback(
    (slot: Slot, url: string, by: -1 | 1) => {
      const cur = listOf(media, slot);
      const i = cur.indexOf(url);
      const j = i + by;
      if (i < 0 || j < 0 || j >= cur.length) return;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      saveHomeMedia(withSlot(media, slot, next));
    },
    [media],
  );

  /** The caption under a gallery photo. Keyed by URL, so removing or
   *  reordering a photo never drags somebody else's caption with it. */
  const setCaption = useCallback(
    (url: string, text: string) => {
      const captions = { ...media.captions };
      if (text.trim()) captions[url] = text.slice(0, 40);
      else delete captions[url];
      saveHomeMedia({ ...media, captions });
    },
    [media],
  );

  const nothingYet = SLOTS.every((s) => listOf(media, s.key).length === 0);

  return (
    <Page>
      <PageHead
        title="Images & videos"
        sub="What the public homepage shows. Changes appear on the site straight away — no deploy."
      />

      {nothingYet && (
        <p className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[12.5px] text-slate-600">
          Nothing has been set yet, so the homepage is showing the photos it ships with. Anything you add here replaces them.
        </p>
      )}

      <div className="space-y-5">
        {SLOTS.map((slot) => (
          <SlotCard
            key={slot.key}
            slot={slot}
            urls={listOf(media, slot.key)}
            busy={busy === slot.key}
            onUpload={(files) => upload(slot.key, slot.kind, files)}
            onRemove={(url) => remove(slot.key, url)}
            onMove={(url, by) => move(slot.key, url, by)}
            captions={slot.key === "gallery" ? media.captions : undefined}
            onCaption={slot.key === "gallery" ? setCaption : undefined}
          />
        ))}
      </div>
    </Page>
  );
}

function SlotCard({
  slot,
  urls,
  busy,
  onUpload,
  onRemove,
  onMove,
  captions,
  onCaption,
}: {
  slot: { key: Slot; title: string; blurb: string; kind: "image" | "video"; max: number };
  urls: string[];
  busy: boolean;
  onUpload: (files: FileList | null) => void;
  onRemove: (url: string) => void;
  onMove: (url: string, by: -1 | 1) => void;
  /** Only the gallery captions its photos. */
  captions?: Record<string, string>;
  onCaption?: (url: string, text: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const full = urls.length >= slot.max;

  return (
    <Card
      title={
        <span className="flex flex-wrap items-baseline gap-2">
          {slot.title}
          <span className="text-[11.5px] font-normal text-slate-500">{slot.blurb}</span>
        </span>
      }
      right={
        <span className="flex items-center gap-2">
          <span className={cx("adm-num text-[11.5px] font-bold", full ? "text-amber-600" : "text-slate-400")}>
            {urls.length} / {slot.max}
          </span>
          <Btn kind="soft" icon="plus" disabled={busy || full} onClick={() => input.current?.click()}>
            {busy ? "Uploading…" : slot.kind === "video" ? "Add video" : "Add photo"}
          </Btn>
        </span>
      }
    >
      <input
        ref={input}
        type="file"
        hidden
        multiple={slot.max > 1}
        accept={slot.kind === "video" ? "video/mp4" : "image/*"}
        onChange={(e) => {
          onUpload(e.target.files);
          e.target.value = "";
        }}
      />

      {urls.length === 0 ? (
        <Empty icon={slot.kind === "video" ? "external" : "box"} title={`No ${slot.kind === "video" ? "videos" : "photos"} here yet`}>
          {slot.kind === "video"
            ? "MP4 only, up to four, 10 MB each."
            : "JPG, PNG or WebP — they are converted and compressed automatically."}
        </Empty>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {urls.map((url, i) => (
            <li key={url} className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              <div className="aspect-[4/3] w-full">
                {slot.kind === "video" ? (
                  <video src={url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                )}
              </div>
              {onCaption && (
                <input
                  className="w-full border-t border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-slate-700 outline-none placeholder:font-normal placeholder:text-slate-400 focus:bg-amber-50"
                  defaultValue={captions?.[url] ?? ""}
                  maxLength={40}
                  placeholder="Caption (optional)"
                  aria-label="Caption for this photo"
                  // Saved when the field loses focus, not on every keystroke —
                  // one write per caption instead of one per letter typed.
                  onBlur={(e) => {
                    const next = e.target.value;
                    if (next !== (captions?.[url] ?? "")) onCaption(url, next);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                />
              )}
              <div className="flex items-center justify-between gap-1 border-t border-slate-200 bg-white px-2 py-1.5">
                <span className="adm-num text-[11px] font-bold text-slate-400">#{i + 1}</span>
                <span className="flex items-center gap-0.5">
                  <button
                    type="button"
                    aria-label="Move earlier"
                    disabled={i === 0}
                    onClick={() => onMove(url, -1)}
                    className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                  >
                    <Icon name="chevron" size={13} className="rotate-180" />
                  </button>
                  <button
                    type="button"
                    aria-label="Move later"
                    disabled={i === urls.length - 1}
                    onClick={() => onMove(url, 1)}
                    className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                  >
                    <Icon name="chevron" size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label="Remove"
                    onClick={() => onRemove(url)}
                    className="rounded-lg p-1 text-red-500 hover:bg-red-50"
                  >
                    <Icon name="trash" size={13} />
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
