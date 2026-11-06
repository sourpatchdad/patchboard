// What you're reading: Hardcover's "Currently Reading" through its API, or a
// Goodreads "currently-reading" shelf through its public RSS feed (Goodreads
// closed its API). Covers go through Patchboard's image proxy, so the
// browser never calls either site.

import { createHash } from 'node:crypto';
import { rememberArt } from '../art.ts';
import type { Book, BooksData } from '../../shared/types.ts';
import { config } from '../config.ts';
import { getJson, request } from '../http.ts';
import { type Adapter, MINUTE } from './adapter.ts';
import { blocks, tag } from './qnap.ts';

/** A stable numeric id for a cover URL, for /api/art/book/:id. */
const coverId = (url: string) => String(parseInt(createHash('sha1').update(url).digest('hex').slice(0, 7), 16));

function withCover(b: Omit<Book, 'cover'>, url?: string): Book {
  if (!url) return b;
  const id = coverId(url);
  rememberArt(`book:${id}`, url);
  return { ...b, cover: `/api/art/book/${id}` };
}

type HcBook = { book?: { title?: string; image?: { url?: string } | null; contributions?: { author?: { name?: string } }[] } };

export function fromHardcover(r: { data?: { me?: { user_books?: HcBook[] }[] }; errors?: { message: string }[] }): Book[] {
  if (r.errors?.length) throw new Error(`Hardcover: ${r.errors[0].message}`);
  return (r.data?.me?.[0]?.user_books ?? []).map((u) => withCover({ title: u.book?.title ?? 'A book', author: u.book?.contributions?.[0]?.author?.name }, u.book?.image?.url ?? undefined));
}

export function fromGoodreads(xml: string): Book[] {
  return blocks(xml, 'item').map((i) => withCover({ title: (tag(i, 'title') ?? 'A book').replace(/&amp;/g, '&'), author: tag(i, 'author_name') }, tag(i, 'book_large_image_url') || tag(i, 'book_medium_image_url') || tag(i, 'book_image_url')));
}

const QUERY = '{ me { user_books(where: {status_id: {_eq: 2}}, limit: 12, order_by: {updated_at: desc}) { book { title image { url } contributions(limit: 1) { author { name } } } } } }';

export function booksAdapter(): Adapter<BooksData> {
  const { hardcoverToken, goodreadsUser } = config.books!;
  return {
    id: 'books',
    label: hardcoverToken ? 'Hardcover' : 'Goodreads',
    intervalMs: 30 * MINUTE,
    async fetch() {
      if (hardcoverToken) {
        const auth = /^bearer /i.test(hardcoverToken) ? hardcoverToken : `Bearer ${hardcoverToken}`;
        const r = await getJson<Parameters<typeof fromHardcover>[0]>('https://api.hardcover.app/v1/graphql', { method: 'POST', headers: { 'content-type': 'application/json', authorization: auth }, body: JSON.stringify({ query: QUERY }) });
        return { books: fromHardcover(r), source: 'Hardcover', webUrl: 'https://hardcover.app' };
      }
      const id = goodreadsUser!.match(/\d+/)?.[0];
      if (!id) throw new Error('The Goodreads user is the number in your profile address');
      const xml = await (await request(`https://www.goodreads.com/review/list_rss/${id}?shelf=currently-reading`)).text();
      return { books: fromGoodreads(xml), source: 'Goodreads', webUrl: `https://www.goodreads.com/review/list/${id}?shelf=currently-reading` };
    },
  };
}
