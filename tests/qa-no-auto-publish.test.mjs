import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';

const root = new URL('../', import.meta.url);
const workflow = new URL('.github/workflows/refresh-lts-porti-snapshots.yml', root);
const circle = readFileSync(new URL('.circleci/config.yml', root), 'utf8');
const publisher = readFileSync(new URL('cloudflare/public-snapshot-publisher/index.mjs', root), 'utf8');
const mirror = readFileSync(new URL('scripts/refresh_porti_from_worker.py', root), 'utf8');
const freshness = readFileSync(new URL('scripts/check_public_snapshot_freshness.py', root), 'utf8');

test('legacy GitHub Actions scheduled/manual Porti publisher has been retired', () => {
  assert.equal(existsSync(workflow), false, 'Legacy scheduled/manual publisher must not exist');
});

test('offline snapshot and Cloudflare publisher contracts remain in CircleCI', () => {
  assert.match(circle, /- snapshot-publisher-contract\b/);
  assert.match(circle, /- cloudflare-publisher-contract\b/);
  assert.match(circle, /node --test tests\/qa-porti-cloudflare-direct-publisher\.test\.mjs/);
  // The full 'test_*.py' discovery is a superset of both prior targeted suites.
  const fullPythonSuite = circle.includes("python -m unittest discover -s tests -p 'test_*.py' -v");
  for (const file of ['test_refresh_porti_from_worker.py','test_public_snapshot_freshness.py']) {
    const individuallyListed = circle.includes("python -m unittest discover -s tests -p '"+file+"'");
    const inFullSuite = fullPythonSuite && existsSync(new URL('tests/'+file, root));
    assert.ok(individuallyListed || inFullSuite, 'Missing Python snapshot contract: '+file);
  }
  assert.match(circle, /node --test[^\n]*qa-no-auto-publish\.test\.mjs/);
});

test('Cloudflare scheduled() publisher stays fail-closed and atomic', () => {
  assert.match(publisher, /async scheduled\(_event,env,ctx\)/);
  assert.match(publisher, /ctx\.waitUntil\(publish\(env\)/);
  assert.match(publisher, /env\?\.PUBLISH_ENABLED==='yes'/);
  assert.match(publisher, /GITHUB_PUBLIC_CONTENTS_TOKEN/);
  assert.match(publisher, /await readAll\(env,now,old\)/);
  assert.match(publisher, /force:false/);
  assert.match(publisher, /PUBLIC_PORTI_PUBLISH_ERROR/);
  assert.doesNotMatch(publisher, /SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|booking_token/i);
});

test('offline public snapshot validators retain freshness and private-data gates', () => {
  assert.match(mirror, /class SnapshotRejected\(ValueError\)/);
  assert.match(mirror, /MAX_AGE = timedelta\(minutes=45\)/);
  assert.match(mirror, /if payload\.get\("stale"\) is not False/);
  assert.match(mirror, /if terminal == "tfg" and not source_updated/);
  assert.match(mirror, /ROOT_FIELDS = /);
  assert.doesNotMatch(mirror, /SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|booking_token/i);
  assert.match(freshness, /MAX_AGE = timedelta\(minutes=65\)/);
  assert.match(freshness, /STALE_OR_FUTURE_SNAPSHOT/);
});
