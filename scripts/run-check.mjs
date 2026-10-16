import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
const directory=path.resolve('.local','temp');await mkdir(directory,{recursive:true});
const mode=process.argv[2];const args=mode==='test'?['node_modules/vitest/vitest.mjs','run']:['--import','tsx','scripts/browser-check.ts'];
const child=spawn(process.execPath,[...args,...process.argv.slice(3)],{stdio:'inherit',env:{...process.env,TEMP:directory,TMP:directory}});
child.on('error',()=>{console.error('Unable to start checks');process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
