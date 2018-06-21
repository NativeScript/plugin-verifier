import { exec } from 'child_process';
import { Logger } from './log.service';

export default function execPromise(cwd: string, command: string, returnOutput = false) {
    const cp = exec(command, { cwd: cwd });
    let hasError = false;
    let stdout = '';
    
    return new Promise((resolve, reject) => {
        cp.addListener('error', reject);
        cp.addListener('exit', (code, signal) => {
            resolve(returnOutput ? stdout : code === 0);
        });
        
        cp.stdout.on('data', function (data) {
            stdout+=data;
        });
        cp.stderr.on('data', function (data) {
            if (!hasError) {
                Logger.error(`error while executing ${command}:`);
                hasError = true;
            }
            Logger.error(data.toString());
        });
    });
}