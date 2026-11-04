// Fastmail over JMAP (RFC 8620/8621). Read-only: inbox unread count and the
// newest messages. Create the token in Fastmail under Settings > Privacy &
// Security > API tokens with "Email" read-only access.

import type { FastmailData } from '../../shared/types.ts';
import { config } from '../config.ts';
import { getJson } from '../http.ts';
import { type Adapter, MINUTE } from './adapter.ts';

const SESSION_URL = 'https://api.fastmail.com/jmap/session';
const USING = ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'];

interface Session {
  apiUrl: string;
  primaryAccounts: Record<string, string>;
}

type MethodResponse = [string, Record<string, unknown>, string];

interface EmailObj {
  id: string;
  subject?: string;
  preview?: string;
  receivedAt: string;
  keywords?: Record<string, boolean>;
  from?: { name?: string; email: string }[];
}

export function fastmailAdapter(): Adapter<FastmailData> {
  const { token, webUrl } = config.fastmail!;
  const auth = { Authorization: `Bearer ${token}` };
  let session: { apiUrl: string; accountId: string; inboxId: string } | null = null;

  async function jmap(calls: unknown[]): Promise<MethodResponse[]> {
    const r = await getJson<{ methodResponses: MethodResponse[] }>(session!.apiUrl, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ using: USING, methodCalls: calls }),
    });
    for (const [name, args] of r.methodResponses) {
      if (name === 'error') throw new Error(`JMAP ${String(args.type)}`);
    }
    return r.methodResponses;
  }

  async function connect() {
    const s = await getJson<Session>(SESSION_URL, { headers: auth });
    const accountId = s.primaryAccounts['urn:ietf:params:jmap:mail'];
    session = { apiUrl: s.apiUrl, accountId, inboxId: '' };
    const [[, q]] = await jmap([['Mailbox/query', { accountId, filter: { role: 'inbox' } }, 'q']]);
    const ids = q.ids as string[];
    if (!ids?.length) throw new Error('No inbox found');
    session.inboxId = ids[0];
  }

  return {
    id: 'fastmail',
    label: 'Mail',
    intervalMs: 2 * MINUTE,
    async fetch() {
      if (!session) await connect();
      const { accountId, inboxId } = session!;
      let responses: MethodResponse[];
      try {
        responses = await jmap([
          ['Mailbox/get', { accountId, ids: [inboxId], properties: ['unreadEmails'] }, 'm'],
          [
            'Email/query',
            {
              accountId,
              filter: { inMailbox: inboxId },
              sort: [{ property: 'receivedAt', isAscending: false }],
              collapseThreads: true,
              limit: 8,
            },
            'q',
          ],
          [
            'Email/get',
            {
              accountId,
              '#ids': { resultOf: 'q', name: 'Email/query', path: '/ids' },
              properties: ['id', 'subject', 'preview', 'receivedAt', 'keywords', 'from'],
            },
            'g',
          ],
        ]);
      } catch (err) {
        session = null; // session URLs can rotate; reconnect next poll
        throw err;
      }
      const mailbox = (responses[0][1].list as { unreadEmails: number }[])[0];
      const emails = responses[2][1].list as EmailObj[];
      return {
        unread: mailbox?.unreadEmails ?? 0,
        webUrl,
        messages: emails.map((e) => ({
          id: e.id,
          from: e.from?.[0]?.name || e.from?.[0]?.email || 'Unknown sender',
          subject: e.subject || '(no subject)',
          preview: e.preview ?? '',
          receivedAt: e.receivedAt,
          unread: !e.keywords?.$seen,
        })),
      };
    },
  };
}
