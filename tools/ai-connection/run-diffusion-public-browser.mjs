#!/usr/bin/env node
// No model bytes pass through Node. The Python host reuses the frozen owner's
// private-input reader and selects the retained model paths as browser Files.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const helper=fileURLToPath(new URL('./run-diffusion-public-browser.py',import.meta.url));
const child=spawn(process.env.PYTHON??'python3',[helper,...process.argv.slice(2)],{stdio:'inherit'});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',(code,signal)=>{process.exitCode=signal?1:code??1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
