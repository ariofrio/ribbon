import assert from "node:assert/strict";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { delimiter, join, resolve } from "node:path";
import { chromium } from "playwright";

export async function prepareGhSkills({ scratch }) {
  const bin = resolve(scratch, "gh-fixture-bin");
  await mkdir(bin, { recursive: true });
  const source = `#!${process.execPath}
import fs from 'node:fs';
import path from 'node:path';
const args=process.argv.slice(2);const command=args[0]==='api'?'api':args[1];
const controlFile=path.join(process.env.BB_DATA_DIR,'gh-skill-control.json');
const control=fs.existsSync(controlFile)?JSON.parse(fs.readFileSync(controlFile,'utf8'))[command]??{}:{};
if(control.delay)await new Promise(resolve=>setTimeout(resolve,control.delay));
const failure=control.error??(!args.includes('--dry-run')?control.applyError:undefined);
if(failure){console.error(failure);process.exit(1);}
const option=(name)=>args[args.indexOf(name)+1];
const root=path.join(process.env.BB_DATA_DIR,'skills');
if(['list','install','update'].includes(command)&&option('--dir')!==root)throw new Error('Wrong installation destination');
fs.mkdirSync(root,{recursive:true});
const positional=args.includes('--')?args.slice(args.indexOf('--')+1):[];
const inventory=()=>fs.readdirSync(root).filter(name=>fs.existsSync(path.join(root,name,'fixture.json'))).map(name=>JSON.parse(fs.readFileSync(path.join(root,name,'fixture.json'),'utf8')));
const save=(entry)=>{fs.mkdirSync(entry.path,{recursive:true});fs.writeFileSync(path.join(entry.path,'fixture.json'),JSON.stringify(entry));fs.writeFileSync(path.join(entry.path,'SKILL.md'),'---\\nname: demo\\ndescription: A searchable fixture skill\\nmetadata:\\n  github-path: skills/demo\\n---\\n# Fixture skill\\n\\nInstalled on the server: '+entry.version+'\\n');};
if(command==='api'){
 if(args[1].endsWith('/releases/latest'))console.log(JSON.stringify({tag_name:'v1'}));
 else if(args[1].includes('/contents/'))console.log('---\\nname: demo\\ndescription: A searchable fixture skill\\n---\\n# Remote guide\\n\\nPreview from GitHub before installation\\n');
 else {console.error('Unsupported API fixture request');process.exitCode=1;}
}else if(command==='list')console.log(JSON.stringify(inventory()));
else if(command==='search'){
 const amount=positional[0]==='many'?(option('--page')==='2'?3:20):1;
 const offset=option('--page')==='2'?20:0;
 console.log(JSON.stringify(Array.from({length:amount},(_,i)=>({skillName:positional[0]==='many'?'demo-'+(offset+i+1):'demo',namespace:'',repo:'example/skills',path:positional[0]==='many'?'skills/demo-'+(offset+i+1)+'/SKILL.md':'skills/demo/SKILL.md',description:'A searchable fixture skill',stars:12}))));
}
else if(command==='preview')console.log('Preview from GitHub before installation');
else if(command==='install'){
 if(positional.length===1&&!args.includes('--all'))console.log('demo\\tA fixture skill');
 else {save({skillName:'demo',sourceURL:'https://github.com/example/skills',version:args.includes('--pin')?option('--pin'):'v1',pinned:args.includes('--pin'),path:path.join(root,'demo')});console.log('Installed demo');}
}else if(command==='update'){
 if(args.includes('--dry-run')){if(inventory().some(entry=>entry.version==='v1'&&!entry.pinned))console.log('  • demo (example/skills) abc1234 > def5678 [v2]');else console.log('All skills are up to date.');}
 else {for(const entry of inventory()){if(entry.pinned&&!args.includes('--unpin'))continue;save({...entry,version:'v2',pinned:false});}console.log('Updated demo');}
}else {console.error('Unsupported fixture command');process.exitCode=1;}
`;
  await writeFile(join(bin, "gh"), source);
  await chmod(join(bin, "gh"), 0o755);
  return { PATH: `${bin}${delimiter}${process.env.PATH}` };
}

export async function verifyGhSkills({ stack, fixture }) {
  const browser = await chromium.launch({ args: ["--mute-audio"] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(new URL('/', stack.serverUrl).href);
    const rail = page.locator('[data-nav-rail-item="gh-skills/skills"]');
    await rail.getByRole('button', { name: 'Skills', exact: true }).click();
    const panel = page.locator('[data-gh-skills]');
    const sidebar = page.locator('[data-gh-skills-sidebar]');
    await sidebar.getByRole('link', { name: 'Browse', exact: true }).waitFor();
    const discovery = panel.locator('[data-gh-skills-discovery]');
    await discovery.getByRole('heading', { name: 'Code review', exact: true }).waitFor();
    const shelf = discovery.locator('section').first();
    await shelf.getByRole('button', { name: 'Open demo', exact: true }).waitFor();
    const shelfLayout = await shelf.evaluate(node => {
      const header = node.firstElementChild.getBoundingClientRect();
      const cards = node.lastElementChild.getBoundingClientRect();
      return { gap: cards.top - header.bottom, width: cards.width };
    });
    assert.ok(shelfLayout.gap > 0 && shelfLayout.width > 200, JSON.stringify(shelfLayout));
    assert.equal(await panel.getByRole('tab').count(), 0);
    const nativeVisibility = await page.locator('[data-testid="app-sidebar-body"] [data-sidebar="content"]').evaluate(node =>
      Array.from(node.children).filter(child => !child.hasAttribute('data-gh-skills-sidebar-host')).map(child => getComputedStyle(child).display));
    assert.ok(nativeVisibility.length > 0);
    assert.ok(nativeVisibility.every(display => display === 'none'), JSON.stringify(nativeVisibility));
    await sidebar.getByRole('link', { name: 'Installed', exact: true }).focus();
    await page.keyboard.press('Enter');
    await panel.getByText('No skills installed', { exact: true }).waitFor();
    const activeStyle = await sidebar.getByRole('link', { name: 'Installed', exact: true }).evaluate(node => ({ background: getComputedStyle(node).backgroundColor, height: node.getBoundingClientRect().height }));
    assert.notEqual(activeStyle.background, 'rgba(0, 0, 0, 0)');
    assert.ok(activeStyle.height >= 28, JSON.stringify(activeStyle));
    await page.goBack();
    await panel.getByRole('textbox', { name: 'Search GitHub skills', exact: true }).waitFor();
    await page.goBack();
    await page.waitForFunction(() => {
      const content = document.querySelector('[data-testid="app-sidebar-body"] [data-sidebar="content"]');
      return content?.firstElementChild && !document.querySelector('[data-gh-skills-sidebar]') && getComputedStyle(content.firstElementChild).display !== 'none';
    });
    await page.goForward();
    await sidebar.getByRole('link', { name: 'Browse', exact: true }).waitFor();
    await page.goForward();
    await panel.getByText('No skills installed', { exact: true }).waitFor();
    const resize = page.locator('[data-testid="app-sidebar-resize-handle"]');
    const oldWidth = await page.locator('[data-testid="app-sidebar-body"]').evaluate(node => node.getBoundingClientRect().width);
    const handle = await resize.boundingBox();
    assert.ok(handle);
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 40, handle.y + handle.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForFunction(width => document.querySelector('[data-testid="app-sidebar-body"]').getBoundingClientRect().width >= width + 20, oldWidth);
    const install = panel.getByRole('button', { name: 'Install skill', exact: true });
    const style = await install.evaluate(node => ({ background: getComputedStyle(node).backgroundColor, height: node.getBoundingClientRect().height }));
    assert.notEqual(style.background, 'rgba(0, 0, 0, 0)');
    assert.ok(style.height >= 28, JSON.stringify(style));
    await install.click();
    let dialog = page.getByRole('dialog', { name: 'Install skill', exact: true });
    await dialog.getByRole('textbox', { name: 'Repository', exact: true }).fill('https://github.com/example/skills');
    await dialog.getByRole('textbox', { name: 'Skill name or path' }).fill('demo');
    await dialog.getByRole('button', { name: 'Install', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await panel.getByRole('button', { name: 'Open demo' }).waitFor();
    await panel.getByText('A searchable fixture skill', { exact: true }).waitFor();
    await panel.getByRole('textbox', { name: 'Search installed skills' }).fill('missing');
    await panel.getByText('No skills match "missing".', { exact: true }).waitFor();
    await panel.getByRole('textbox', { name: 'Search installed skills' }).fill('');
    await panel.getByRole('button', { name: 'Open demo' }).click();
    await page.waitForURL('**/skills/installed/demo');
    await panel.getByRole('heading', { name: 'demo', exact: true }).waitFor();
    await panel.getByText('Installed on the server: v1', { exact: true }).waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0);
    await page.goBack();
    await panel.getByRole('button', { name: 'Open demo' }).waitFor();
    await panel.getByRole('button', { name: 'Skill actions' }).click();
    await page.getByRole('menuitem', { name: 'Check for updates', exact: true }).click();
    const check = page.getByRole('dialog', { name: 'Skill update check' });
    await check.getByText('abc1234 → def5678 (v2)', { exact: false }).waitFor();
    await check.getByRole('button', { name: 'Done' }).click();
    await panel.getByRole('button', { name: 'Open demo' }).click();
    await panel.getByText('Installed on the server: v1', { exact: true }).waitFor();
    await panel.getByRole('button', { name: 'Actions for demo' }).click();
    await page.getByRole('menuitem', { name: 'Update', exact: true }).click();
    const update = page.getByRole('dialog', { name: 'Update demo?' });
    await update.getByText('Available: def5678 (v2)', { exact: true }).waitFor();
    await writeFile(join(stack.dataDir, 'gh-skill-control.json'), JSON.stringify({ update: { delay: 5000 } }));
    await update.getByRole('button', { name: 'Update skill', exact: true }).click();
    await panel.getByText('Updating demo on the BB server…', { exact: true }).waitFor();
    const other = await context.newPage();
    try {
      await other.goto(new URL('/plugins/gh-skills/skills/installed', stack.serverUrl).href);
      const second = other.locator('[data-gh-skills]');
      await second.getByText('Updating demo on the BB server…', { exact: true }).waitFor();
      assert.equal(await second.getByRole('button', { name: 'Install skill', exact: true }).isEnabled(), false);
      await second.getByText('Last operation details', { exact: true }).click();
      await second.getByText('Updated demo', { exact: true }).waitFor();
      assert.equal(await second.getByRole('button', { name: 'Install skill', exact: true }).isEnabled(), true);
    } finally { await other.close(); await writeFile(join(stack.dataDir, 'gh-skill-control.json'), '{}'); }
    await update.waitFor({ state: 'hidden' });
    await panel.getByText('Installed on the server: v2', { exact: true }).waitFor();
    await writeFile(join(stack.dataDir, 'gh-skill-control.json'), JSON.stringify({ update: { applyError: 'Upstream unavailable; try again' } }));
    await panel.getByRole('button', { name: 'Actions for demo' }).click();
    await page.getByRole('menuitem', { name: 'Update', exact: true }).click();
    await page.getByRole('dialog', { name: 'Update demo?' }).getByRole('button', { name: 'Update skill', exact: true }).click();
    const failedUpdate = page.getByRole('dialog', { name: 'Update demo?' });
    await failedUpdate.getByRole('alert').getByText('Upstream unavailable; try again', { exact: true }).waitFor();
    await failedUpdate.getByRole('button', { name: 'Cancel', exact: true }).click();
    await panel.getByText('Installed on the server: v2', { exact: true }).waitFor();
    await panel.getByRole('button', { name: 'Dismiss', exact: true }).click();
    await writeFile(join(stack.dataDir, 'gh-skill-control.json'), '{}');
    await panel.getByRole('button', { name: 'Back to installed skills', exact: true }).click();
    await panel.getByRole('button', { name: 'Actions for demo' }).click();
    await page.getByRole('menuitem', { name: 'Uninstall', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Uninstall demo?' });
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await panel.getByRole('button', { name: 'Open demo' }).waitFor();
    await panel.getByRole('button', { name: 'Actions for demo' }).click();
    await page.getByRole('menuitem', { name: 'Uninstall', exact: true }).click();
    await dialog.getByRole('button', { name: 'Uninstall skill', exact: true }).click();
    await panel.getByText('No skills installed', { exact: true }).waitFor();
    await sidebar.getByRole('link', { name: 'Browse', exact: true }).click();
    await panel.getByRole('textbox', { name: 'Search GitHub skills' }).fill('demo');
    await panel.getByText('A searchable fixture skill', { exact: true }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('query'), 'demo');
    await page.locator('[data-nav-rail-item="__bb__/extensions"]').getByRole('button').click();
    await panel.waitFor({ state: 'hidden' });
    await rail.getByRole('button', { name: 'Skills', exact: true }).click();
    await panel.getByRole('button', { name: 'Open demo' }).waitFor();
    assert.equal(await panel.getByRole('textbox', { name: 'Search GitHub skills' }).inputValue(), 'demo');
    await page.reload();
    await panel.getByRole('button', { name: 'Open demo' }).waitFor();
    assert.equal(await panel.getByRole('textbox', { name: 'Search GitHub skills' }).inputValue(), 'demo');
    await panel.getByRole('button', { name: 'Open demo' }).click();
    await panel.getByRole('heading', { name: 'Remote guide', exact: true }).waitFor();
    await panel.getByRole('paragraph').filter({ hasText: /^Preview from GitHub before installation$/ }).waitFor();
    await panel.getByRole('button', { name: 'Back to browse' }).click();
    await panel.getByRole('button', { name: 'Install demo' }).waitFor();
    assert.equal(await panel.getByRole('textbox', { name: 'Search GitHub skills' }).inputValue(), 'demo');
    await panel.getByRole('button', { name: 'Install demo' }).click();
    await panel.getByLabel('demo is installed', { exact: true }).waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0);
    await panel.getByRole('textbox', { name: 'Search GitHub skills' }).fill('many');
    await panel.getByRole('button', { name: 'Open demo-20', exact: true }).waitFor();
    await panel.locator('[data-gh-skills-load-more]').scrollIntoViewIfNeeded();
    await panel.getByRole('button', { name: 'Open demo-23', exact: true }).waitFor();
    await panel.getByRole('button', { name: 'Open demo-23', exact: true }).click();
    await panel.getByRole('heading', { name: 'Remote guide', exact: true }).waitFor();
    await page.goBack();
    await panel.getByRole('button', { name: 'Open demo-23', exact: true }).waitFor();
    assert.ok(await panel.locator('[data-resource-collection-scroll]').evaluate(node => node.scrollTop > 0));
    await panel.getByRole('textbox', { name: 'Search GitHub skills' }).fill('demo');
    await panel.getByLabel('demo is installed', { exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => {
      const node = document.querySelector('[data-gh-skills]');
      return node && node.getBoundingClientRect().width > 0 && document.documentElement.scrollWidth <= window.innerWidth;
    });
    await panel.getByRole('button', { name: 'Install skill', exact: true }).click();
    const mobileDialog = page.getByRole('dialog', { name: 'Install skill', exact: true });
    await mobileDialog.getByRole('textbox', { name: 'Repository', exact: true }).fill('example/skills');
    await mobileDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await mobileDialog.waitFor({ state: 'hidden' });
    await page.locator('[data-sidebar="trigger"]').filter({ visible: true }).first().click();
    await sidebar.getByRole('link', { name: 'Installed', exact: true }).click();
    await page.waitForFunction(() => {
      const main = document.querySelector('[data-gh-skills]');
      return main && Math.abs(main.getBoundingClientRect().left) <= 1;
    });
    await panel.getByRole('button', { name: 'Open demo', exact: true }).click();
    await panel.getByRole('heading', { name: 'demo', exact: true }).waitFor();
    await panel.getByRole('button', { name: 'Back to installed skills', exact: true }).click();
    await page.setViewportSize({ width: 1280, height: 900 });
    await sidebar.getByRole('link', { name: 'Installed', exact: true }).waitFor();
    const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    try {
      const mobile = await touch.newPage();
      await mobile.goto(new URL('/plugins/gh-skills/skills/installed', stack.serverUrl).href);
      const mobilePanel = mobile.locator('[data-gh-skills]');
      await mobilePanel.getByRole('button', { name: 'Open demo', exact: true }).waitFor();
      await mobilePanel.getByRole('button', { name: 'Install skill', exact: true }).click();
      const sourceDialog = mobile.getByRole('dialog', { name: 'Install skill', exact: true });
      await sourceDialog.getByRole('textbox', { name: 'Repository', exact: true }).fill('https://github.com/example/skills');
      await sourceDialog.getByRole('button', { name: 'List repository skills', exact: true }).click();
      await sourceDialog.getByRole('button', { name: 'Use demo', exact: true }).click();
      await sourceDialog.getByRole('button', { name: 'Preview', exact: true }).click();
      await sourceDialog.getByRole('region', { name: 'Skill preview' }).getByText('Preview from GitHub before installation', { exact: true }).waitFor();
      const skillDialogs = mobile.locator('[data-bb-plugin="gh-skills"] [role="dialog"], [data-bb-plugin="gh-skills"][role="dialog"]');
      assert.equal(await skillDialogs.count(), 1);
      const dialogLayout = await sourceDialog.evaluate(node => {
        const box = node.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom, width: box.width, overflow: document.documentElement.scrollWidth > innerWidth };
      });
      assert.ok(dialogLayout.top >= 0 && dialogLayout.bottom <= 844 && !dialogLayout.overflow, JSON.stringify(dialogLayout));
      await sourceDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await sourceDialog.waitFor({ state: 'hidden' });
      await mobile.locator('[data-sidebar="trigger"]').filter({ visible: true }).first().click();
      await mobile.locator('[data-gh-skills-sidebar]').getByRole('link', { name: 'Browse', exact: true }).click();
      await mobilePanel.locator('[data-gh-skills-discovery]').getByRole('heading', { name: 'Code review', exact: true }).waitFor();
      await mobile.waitForFunction(() => {
        const panel = document.querySelector('[data-gh-skills]');
        return panel && Math.abs(panel.getBoundingClientRect().left) <= 1;
      });
    } finally { await touch.close(); }
    fixture.run(['plugin', 'disable', 'gh-skills']);
    await page.waitForFunction(() => {
      const content = document.querySelector('[data-testid="app-sidebar-body"] [data-sidebar="content"]');
      return content?.firstElementChild && !document.querySelector('[data-gh-skills-sidebar-host]') && getComputedStyle(content.firstElementChild).display !== 'none';
    });
    assert.deepEqual(errors, []);
  } catch (cause) {
    const content = await page.locator('[data-gh-skills]').innerText({ timeout: 1000 }).catch(() => 'Skills page unmounted');
    throw new Error(`Skills workflow failed at ${page.url()}\n${content.slice(0, 8000)}`, { cause });
  } finally { await browser.close(); }
}
