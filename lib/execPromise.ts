import { exec } from 'child_process';
import { Logger } from './log.service';
import * as sanitize from 'sanitize-filename';
import * as path from 'path';

let _localNativeScript = '';
function _getLocalNativeScript() {
    if (!_localNativeScript) {
        _localNativeScript = path.join(path.resolve('.'), 'node_modules', '.bin') + path.sep;
        _localNativeScript = _localNativeScript.replace(/ /g, '\\ ');
    }

    return _localNativeScript;
}

export function execPromise(cwd: string, command: string, returnOutput = false) {
    if (command.startsWith('tns')) {
        // HACK: using local nativescript installation here
        command = _getLocalNativeScript() + command;
    }
    const cp = exec(command, { cwd: cwd });
    let hasError = false;
    let stdout = '';

    return new Promise((resolve, reject) => {
        cp.addListener('error', reject);
        cp.addListener('exit', (code, signal) => {
            resolve(returnOutput ? stdout : code === 0);
        });

        cp.stdout.on('data', function (data) {
            stdout += data;
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

export function dirNameFromPluginName(name: string): string {
    let dirName = 'test' + name;
    // remove / and other invalid chars from plugin name
    dirName = sanitize(dirName);
    // NativeScript max project name length
    dirName = dirName.substr(0, 30);
    return dirName;
}