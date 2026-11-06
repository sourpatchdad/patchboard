import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { redact } from '../redact.ts';

// Shapes taken from real Sonarr, Plex and qBittorrent logs, values made up.
test('keys in URLs, headers, JSON and userinfo are masked; the rest of the line stays', () => {
  assert.equal(
    redact('[Warn] HttpClient: HTTP Error - Res: [GET] http://10.0.0.5:9696/7/api?t=tvsearch&cat=5000&apikey=0123456789abcdef&offset=0'),
    '[Warn] HttpClient: HTTP Error - Res: [GET] http://10.0.0.5:9696/7/api?t=tvsearch&cat=5000&apikey=••••&offset=0',
  );
  assert.equal(
    redact('Release pushed: Show S01E09 - https://tracker.example/download.php/1?torrent_pass=deadbeefcafe'),
    'Release pushed: Show S01E09 - https://tracker.example/download.php/1?torrent_pass=••••',
  );
  assert.equal(redact('GET /library/sections?X-Plex-Token=AbC123xYz HTTP/1.1'), 'GET /library/sections?X-Plex-Token=•••• HTTP/1.1');
  assert.equal(redact('Authorization: Bearer eyJhbGciOi.abc.def'), 'Authorization: Bearer ••••');
  assert.equal(redact('X-Api-Key: 5060da5352e1'), 'X-Api-Key: ••••');
  assert.equal(redact('{"apiKey": "s3cr3t", "port": 8989}'), '{"apiKey": "••••", "port": 8989}');
  assert.equal(redact('connecting to postgres://app:hunter2@db:5432/app'), 'connecting to postgres://app:••••@db:5432/app');
  assert.equal(redact('login failed for user admin, password=letmein'), 'login failed for user admin, password=••••');
});

test('ordinary lines are left alone', () => {
  for (const line of [
    '[Info] RssSyncService: RSS Sync Completed. Reports found: 63, Reports grabbed: 0',
    'Keyboard layout set to us; monkey=banana',
    'GET /api/v3/queue?page=1&pageSize=20 200',
    'https://github.com/sourpatchdad/patchboard',
  ]) assert.equal(redact(line), line);
});
