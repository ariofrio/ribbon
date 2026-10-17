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
const args=process.argv.slice(2);const command=args[1];
const option=(name)=>args[args.indexOf(name)+1];
const root=path.join(process.env.BB_DATA_DIR,'skills');
if(['list','install','update'].includes(command)&&option('--dir')!==root)throw new Error('Wrong installation destination');
fs.mkdirSync(root,{recursive:true});
const positional=args.includes('--')?args.slice(args.indexOf('--')+1):[];
const inventory=()=>fs.readdirSync(root).filter(name=>fs.existsSync(path.join(root,name,'fixture.json'))).map(name=>JSON.parse(fs.readFileSync(path.join(root,name,'fixture.json'),'utf8')));
const save=(entry)=>{fs.mkdirSync(entry.path,{recursive:true});fs.writeFileSync(path.join(entry.path,'fixture.json'),JSON.stringify(entry));fs.writeFileSync(path.join(entry.path,'SKILL.md'),'# Fixture skill\\n\\nInstalled on the server: '+entry.version+'\\n');};
if(command==='list')console.log(JSON.stringify(inventory()));
else if(command==='search')console.log(JSON.stringify([{skillName:'demo',namespace:'',repo:'example/skills',path:'skills/demo/SKILL.md',description:'A searchable fixture skill',stars:12}]));
else if(command==='preview')console.log('Preview from GitHub before installation');
else if(command==='install'){
 if(positional.length===1&&!args.includes('--all'))console.log('demo\\tA fixture skill');
 else {save({skillName:'demo',sourceURL:'https://github.com/example/skills',version:args.includes('--pin')?option('--pin'):'v1',pinned:args.includes('--pin'),path:path.join(root,'demo')});console.log('Installed demo');}
}else if(command==='update'){
 if(args.includes('--dry-run'))console.log('Fixture update available');
 else {for(const entry of inventory()){if(entry.pinned&&!args.includes('--unpin'))continue;save({...entry,version:'v2',pinned:false});}console.log('Updated demo');}
}else {console.error('Unsupported fixture command');process.exitCode=1;}
`;
  await writeFile(join(bin, "gh"), source);
  await chmod(join(bin, "gh"), 0o755);
  return { PATH: `${bin}${delimiter}${process.env.PATH}` };
}

export async function verifyGhSkills({ stack }) {
  const browser = await chromium.launch({ args: ["--mute-audio"] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(new URL('/plugins/gh-skills/skills/installed', stack.serverUrl).href);
    const panel = page.locator('[data-gh-skills]');
    await panel.getByText('No skills installed', { exact: true }).waitFor();
    const install = panel.getByRole('button', { name: 'Install skill', exact: true });
    const style = await install.evaluate(node => ({ background: getComputedStyle(node).backgroundColor, height: node.getBoundingClientRect().height }));
    assert.notEqual(style.background, 'rgba(0, 0, 0, 0)');
    assert.ok(style.height >= 28, JSON.stringify(style));
    await install.click();
    let dialog = page.getByRole('dialog', { name: 'Install skill', exact: true });
    await dialog.getByRole('textbox', { name: 'Repository', exact: true }).fill('example/skills');
    await dialog.getByRole('textbox', { name: 'Skill name or path' }).fill('demo');
    await dialog.getByRole('button', { name: 'Install', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await panel.getByRole('button', { name: 'Open demo' }).waitFor();
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
    await check.getByText('Fixture update available', { exact: true }).waitFor();
    await check.getByRole('button', { name: 'Done' }).click();
    await panel.getByRole('button', { name: 'Actions for demo' }).click();
    await page.getByRole('menuitem', { name: 'Update', exact: true }).click();
    const update = page.getByRole('dialog', { name: 'Update demo?' });
    await update.getByRole('button', { name: 'Update skill', exact: true }).click();
    await update.waitFor({ state: 'hidden' });
    await panel.getByText('v2', { exact: true }).waitFor();
    await panel.getByRole('button', { name: 'Actions for demo' }).click();
    await page.getByRole('menuitem', { name: 'Uninstall', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Remove demo?' });
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await panel.getByRole('button', { name: 'Open demo' }).waitFor();
    await panel.getByRole('button', { name: 'Actions for demo' }).click();
    await page.getByRole('menuitem', { name: 'Uninstall', exact: true }).click();
    await dialog.getByRole('button', { name: 'Remove skill', exact: true }).click();
    await panel.getByText('No skills installed', { exact: true }).waitFor();
    await panel.getByRole('tab', { name: 'Browse', exact: true }).click();
    await panel.getByRole('textbox', { name: 'Search GitHub skills' }).fill('demo');
    await panel.getByText('A searchable fixture skill', { exact: true }).waitFor();
    await panel.getByRole('button', { name: 'Open demo' }).click();
    await panel.getByText('Preview from GitHub before installation', { exact: true }).waitFor();
    await panel.getByRole('button', { name: 'Back to browse' }).click();
    await panel.getByRole('button', { name: 'Install demo' }).waitFor();
    await panel.getByRole('button', { name: 'Install demo' }).click();
    await panel.getByLabel('demo is installed', { exact: true }).waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0);
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
    assert.deepEqual(errors, []);
  } catch (cause) {
    throw new Error(`Skills workflow failed at ${page.url()}\n${(await page.locator('[data-gh-skills]').innerText()).slice(0, 8000)}`, { cause });
  } finally { await browser.close(); }
}
