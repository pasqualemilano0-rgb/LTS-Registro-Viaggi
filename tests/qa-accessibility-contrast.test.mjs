import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../visual-theme.css',import.meta.url),'utf8');
const luminance=color=>{
 const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255);
 const linear=rgb.map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
 return .2126*linear[0]+.7152*linear[1]+.0722*linear[2];
};
const contrast=(foreground,background)=>{
 const a=luminance(foreground),b=luminance(background);
 return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
};
test('LTS secondary text stays above WCAG AA contrast 4.5:1',()=>{
 const styles=[
  ['global secondary',/--lts-muted:\s*(#[a-f0-9]{6})/i],
  ['trip location',/\.trip-card \.trip-location\s*\{\s*color:\s*(#[a-f0-9]{6})/i],
  ['trip footer',/\.trip-card \.trip-breakdown\s*\{\s*color:\s*(#[a-f0-9]{6})/i],
  ['quality hint',/#admin-records-panel \.records-quality-item small\s*\{[^}]*color:\s*(#[a-f0-9]{6})/i],
  ['customer address',/#admin-records-panel \.records-customer-address\s*\{[^}]*color:\s*(#[a-f0-9]{6})/i]
 ];
 for(const [name,pattern] of styles){
  const foreground=css.match(pattern)?.[1];
  assert.ok(foreground,name+' must have a fixed accessible color');
  for(const background of ['#ffffff','#f6fbfb']){
   const ratio=contrast(foreground,background);
   assert.ok(ratio>=4.5,name+' contrast '+ratio.toFixed(2)+' is below AA on '+background);
  }
 }
});
test('quality indicators remain readable on narrow mobile screens',()=>{
 assert.match(css,/#admin-records-panel \.records-quality-item small \{[^}]*font-size:11px/);
 assert.match(css,/#admin-records-panel \.records-quality-item\s*\{[^}]*padding:13px/);
 assert.match(css,/@media\(max-width:390px\)/);
});
