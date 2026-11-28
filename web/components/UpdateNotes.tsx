// What an update brings, under a container's "Update available": the
// releases of its project since the version it runs, read from the image's
// own source label. Marks a security fix or a breaking change up front, the
// two things worth knowing before pressing Update. Loaded only when a
// container has an update waiting, so the Markdown renderer stays out of the
// first page load.

import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useEffect, useState } from 'react';
import type { ReleaseNote } from '../../shared/types.ts';
import { t as tr } from '../lib/i18n.ts';
import { locale } from '../lib/region.ts';

// Text and links only: someone else writes these notes, so no pictures that
// call home or reach into the LAN, no styling that could cover the page, no
// forms. Links open in a new tab and send no referrer.
const purify = DOMPurify();
purify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});
const html = (md: string) =>
  purify.sanitize(marked.parse(md, { async: false, gfm: true }) as string, {
    FORBID_TAGS: ['img', 'picture', 'source', 'video', 'audio', 'iframe', 'style', 'form', 'input', 'button', 'svg', 'math'],
    FORBID_ATTR: ['style', 'srcset'],
  });

/** Words a release uses when it fixes a hole or breaks something you rely on. */
const SECURITY = /\b(security|vulnerabilit(y|ies)|CVE-\d{4}-\d+|GHSA-[\w-]+)\b/i;
const BREAKING = /\b(breaking( change)?s?|BREAKING|migration required|no longer supported)\b/i;

export default function UpdateNotes({ name }: { name: string }) {
  const [data, setData] = useState<{ repo: string | null; running: string | null; releases: ReleaseNote[] | null } | null>(null);
  useEffect(() => {
    let gone = false;
    fetch(`/api/containers/${encodeURIComponent(name)}/notes`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !gone && setData(d))
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [name]);
  if (!data?.repo || !data.releases?.length) return null;
  const all = data.releases.map((r) => `${r.name ?? ''}\n${r.body}`).join('\n');
  const security = SECURITY.test(all);
  const breaking = BREAKING.test(all);
  const day = (at: number) => (at ? new Date(at).toLocaleDateString(locale(), { month: 'short', day: 'numeric' }) : '');
  return (
    <details className="update-notes">
      <summary>
        {data.running ? tr("What's new since {version}", { version: data.running }) : tr("What's new")}
        {security && <span className="quiet-tag">{tr('Security fix')}</span>}
        {breaking && <span className="quiet-tag warn-text">{tr('Breaking change')}</span>}
      </summary>
      {data.releases.map((r) => (
        <section key={r.version} className="update-note">
          <h4>
            <a href={r.url} target="_blank" rel="noreferrer">
              {r.version}
            </a>{' '}
            <span className="update-note-day">{day(r.at)}</span>
            {r.prerelease && <span className="quiet-tag">{tr('Pre-release')}</span>}
          </h4>
          {r.body.trim() ? <div className="prose" dangerouslySetInnerHTML={{ __html: html(r.body) }} /> : <p className="settings-note">{tr('No notes for this release.')}</p>}
        </section>
      ))}
    </details>
  );
}
