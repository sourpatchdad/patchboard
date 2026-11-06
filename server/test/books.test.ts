import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { fromGoodreads, fromHardcover } from '../adapters/books.ts';

test('Hardcover: currently reading with authors and proxied covers; API errors surface', () => {
  const b = fromHardcover({ data: { me: [{ user_books: [{ book: { title: 'Dune', image: { url: 'https://assets.hardcover.app/x.jpg' }, contributions: [{ author: { name: 'Frank Herbert' } }] } }, { book: { title: 'No cover', image: null } }] }] } });
  assert.equal(b[0].author, 'Frank Herbert');
  assert.match(b[0].cover!, /^\/api\/art\/book\/\d+$/);
  assert.equal(b[1].cover, undefined);
  assert.throws(() => fromHardcover({ errors: [{ message: 'invalid token' }] }), /invalid token/);
});

test('Goodreads: the shelf feed gives titles, authors and covers', () => {
  const b = fromGoodreads('<rss><channel><item><title><![CDATA[Piranesi]]></title><author_name>Susanna Clarke</author_name><book_medium_image_url><![CDATA[https://i.gr-assets.com/p.jpg]]></book_medium_image_url></item></channel></rss>');
  assert.deepEqual([b[0].title, b[0].author, !!b[0].cover], ['Piranesi', 'Susanna Clarke', true]);
});
