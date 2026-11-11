import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync(new URL('../.github/workflows/refresh-lts-porti-snapshots.yml',import.meta.url),'utf8');
const mirror=readFileSync(new URL('../scripts/refresh_porti_from_worker.py',import.meta.url),'utf8');
const freshness=readFileSync(new URL('../scripts/check_public_snapshot_freshness.py',import.meta.url),'utf8');
const [header,scheduledJob]=workflow.split('\n  prepare-snapshot-candidate:');

test('Porti PR checks remain read-only and cannot publish vessel snapshots',()=>{
 assert.ok(scheduledJob,'Scheduled publication job must exist');
 assert.match(header,/permissions:\s*\n  contents: read\b/);
 assert.match(header,/\n  pull_request:\s*\n    branches: \[main\]/);
 assert.doesNotMatch(header,/git\s+push\b|git\s+commit\b|contents:\s+write\b/);
 assert.match(scheduledJob,/if: github\.event_name == 'schedule' \|\| github\.event_name == 'workflow_dispatch'/);
 assert.match(scheduledJob,/if: github\.ref == 'refs\/heads\/main'/);
});

test('Porti scheduled release has the narrowest write scope and a mandatory freshness gate',()=>{
 assert.match(scheduledJob,/permissions:\s*\n      contents: write\b/);
 assert.match(scheduledJob,/persist-credentials: true/);
 assert.match(scheduledJob,/ref: main/);
 assert.match(scheduledJob,/python scripts\/refresh_porti_from_worker\.py/);
 assert.match(scheduledJob,/python scripts\/check_public_snapshot_freshness\.py/);
 assert.match(scheduledJob,/git add -- porti\/data\/conateco\.json porti\/data\/tfg_schedule\.json porti\/data\/sct\.json/);
 assert.match(scheduledJob,/git push origin HEAD:main/);
 assert.ok(scheduledJob.indexOf('python scripts/check_public_snapshot_freshness.py') <
           scheduledJob.indexOf('git push origin HEAD:main'),
           'Publication must happen only after passing the freshness gate');
 assert.match(scheduledJob,/actions\/upload-artifact@v4/);
 assert.match(scheduledJob,/retention-days: 7/);
});

test('Porti publisher uses only allowlisted public vessel fields and fails closed',()=>{
 assert.match(mirror,/class SnapshotRejected\(ValueError\)/);
 assert.match(mirror,/MAX_AGE = timedelta\(minutes=45\)/);
 assert.match(mirror,/if payload\.get\("stale"\) is not False/);
 assert.match(mirror,/if terminal == "tfg" and not source_updated/);
 assert.match(mirror,/ROOT_FIELDS = /);
 assert.doesNotMatch(mirror,/SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|booking_token/i);
 assert.match(freshness,/MAX_AGE = timedelta\(minutes=65\)/);
 assert.match(freshness,/STALE_OR_FUTURE_SNAPSHOT/);
});
