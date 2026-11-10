// The "What's new" sheet: what each release changed and, where Patchboard
// can update itself, the button that does it. Loaded only when opened, so
// the Markdown renderer stays out of the first page load.

import DOMPurify from "dompurify";
import { marked } from "marked";
import type { SelfRelease } from "../../shared/types.ts";
import { useModal } from "../lib/modal.ts";
import { containerMap } from "../lib/services.ts";
import { useStore } from "../lib/store.tsx";
import { SelfUpdate } from "./Updater.tsx";

const RELEASES = "https://github.com/sourpatchdad/patchboard/releases";

const html = (md: string) =>
  DOMPurify.sanitize(marked.parse(md, { async: false, gfm: true }) as string);
const day = (at: number) =>
  at
    ? new Date(at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

export default function WhatsNew({
  version,
  releases,
  newer,
  newImage,
  onClose,
}: {
  version: string;
  releases: SelfRelease[];
  newer: SelfRelease[];
  newImage: boolean;
  onClose: () => void;
}) {
  const { snap } = useStore();
  const modal = useModal<HTMLDivElement>(onClose);
  const me = snap!.self!;
  const image = me.container
    ? containerMap(snap).get(me.container)?.image
    : undefined;
  const tag = image?.split(":").pop() ?? "";
  // An exact version tag never moves, so the newer release needs a new tag, not a pull.
  const pinned = /^\d+\.\d+\.\d+(-slim)?$/.test(tag);
  const canUpdate =
    !snap!.readOnly && !!me.container && !!snap!.features?.includes("updates");
  const shown = newer.length
    ? newer
    : releases.filter((r) => r.version === version);
  const title = newer.length
    ? `Update to v${newer[0].version}`
    : newImage
      ? "A newer image is out"
      : `What's new in v${version}`;

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div
        className="palette drawer whats-new"
        ref={modal}
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer-head">
          <h2>{title}</h2>
          <button type="button" className="text-button" onClick={onClose}>
            Close
          </button>
        </header>
        <p className="settings-note">
          You're on v{version}
          {tag ? `, from the ${tag} tag` : ""}.
        </p>
        <div className="whats-new-body">
          {shown.map((r) => (
            <section key={r.version} className="whats-new-release">
              <h3>
                v{r.version} <span className="whats-new-date">{day(r.at)}</span>
              </h3>
              <div
                className="prose"
                dangerouslySetInnerHTML={{ __html: html(r.notes) }}
              />
            </section>
          ))}
          {!shown.length && (
            <p className="settings-note">
              {newImage
                ? "No release notes for this build yet. It's the newest image on your tag."
                : "Patchboard shows release notes once it can reach GitHub."}
            </p>
          )}
        </div>
        <footer className="whats-new-foot">
          {(newer.length > 0 || newImage) &&
            (pinned ? (
              <p className="settings-note">
                Your compose file pins <code>{tag}</code>, which never moves.
                Change it to <code>latest</code> or <code>1</code>, then run{" "}
                <code>docker compose pull &amp;&amp; docker compose up -d</code>
                .
              </p>
            ) : canUpdate ? (
              <SelfUpdate name={me.container!} waiting={newImage} />
            ) : (
              <p className="settings-note">
                Run{" "}
                <code>docker compose pull &amp;&amp; docker compose up -d</code>{" "}
                where Patchboard's compose file lives.
              </p>
            ))}
          <a
            className="text-button"
            href={RELEASES}
            target="_blank"
            rel="noreferrer"
          >
            All releases
          </a>
        </footer>
      </div>
    </div>
  );
}
