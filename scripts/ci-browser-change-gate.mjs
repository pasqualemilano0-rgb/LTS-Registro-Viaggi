/**
 * Cheap, read-only front gate for the medium Playwright CircleCI job.
 * Avoid browser downloads when a branch changes only docs or public Porti JSON.
 * Any unknown change is intentionally treated as browser relevant (fail open).
 */
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export function browserRelevant(path) {
  if (typeof path !== 'string' || !path || path.includes('\0')) return true;
  const p=path.replaceAll('\\','/');
  if (/^porti\/data\/(?:conateco|sct|tfg_schedule)\.json$/u.test(p)) return false;
  if (/^docs\//u.test(p)) return false;
  if (/\.md$/iu.test(p)) return false;
  if (/^(?:LICENSE(?:\..*)?|\.gitignore|\.editorconfig)$/u.test(p)) return false;
  // Everything else, including .circleci, tests, HTML, JS, CSS, PWA and auth,
  // is treated as relevant to preserve coverage on unknown future code paths.
  return true;
}

export function shouldRunBrowser(paths,{branch=''}={}) {
  // A release branch is always a release gate, even for a docs-only change.
  if (/^release\//u.test(branch)) return true;
  if (!Array.isArray(paths)) return true; // Diff unavailable: never silently skip.
  return paths.some(browserRelevant);
}

function git(args){
  const result=spawnSync('git',args,{encoding:'utf8',timeout:25000,maxBuffer:2*1024*1024});
  if(result.error || result.status!==0) throw Error('GIT_COMPARE_UNAVAILABLE');
  return result.stdout;
}
function getChangedPaths(){
  git(['fetch','--quiet','--no-tags','origin','main']);
  return git(['diff','--name-only','-z','origin/main...HEAD']).split('\0').filter(Boolean);
}

function main(){
  const branch=process.env.CIRCLE_BRANCH||'';
  if(branch==='main'){
    console.log('BROWSER_SKIP: main is reserved for fast Cloudflare Porti snapshots; browser PR gate runs on review branches.');
    return 20;
  }
  if(!branch){
    console.log('BROWSER_RUN: unknown source branch; safer to run the browser suite.');
    return 0;
  }
  if(branch.startsWith('release/')){
    console.log('BROWSER_RUN: release branch must execute the browser suite.');
    return 0;
  }
  let paths;
  try{paths=getChangedPaths();}
  catch{
    console.log('BROWSER_RUN: git comparison unavailable; cannot safely skip browser QA.');
    return 0;
  }
  if(shouldRunBrowser(paths,{branch})){
    console.log('BROWSER_RUN: application or CI change detected ('+paths.filter(browserRelevant).length+' relevant file(s)).');
    return 0;
  }
  console.log('BROWSER_SKIP: '+paths.length+' documentation/snapshot-only file(s), no browser tests required.');
  return 20;
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  process.exitCode=main();
}
