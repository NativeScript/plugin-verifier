import { exec } from 'child_process';
import { MarketplaceService } from './marketplace.service';
import { existsSync, mkdir, readFileSync } from 'fs';
import * as path from 'path';
import * as rimraf from 'rimraf';

const testDirectory = 'testGit';
export namespace GithubService {

    export async function testPlugin(plugin: MarketplaceService.PluginModel) {
        if (!plugin || !plugin.badges || !plugin.badges.demos) {
            console.error('plugin has no demos badge');
            return false;
        }

        try {
            await _checkTestDirectory();
            let projectName = 'test' + plugin.name;
            // NativeScript max project name length
            projectName = projectName.substr(0, 30);
            await _cloneProject(plugin.repositoryUrl, projectName);
            const platform = _getPlatform(plugin);
            const demoDir = _getDemoDir(path.join(testDirectory, projectName), plugin);
            if (platform) {
                const result = await _buildProject(demoDir, platform);
                return result;
            } else {
                console.error('plugin has no platform');
            }
        } catch (errExec) {
            console.error(JSON.stringify(errExec));
        }
        return false;
    }

    function _getDemoDir(name: string, plugin: MarketplaceService.PluginModel) {
        const dirs = ['demo', 'demo-ts', 'demo-angular', 'demo-ng', 'ng-demo', 'demo-vue'];
        for (let index = 0; index < dirs.length; index++) {
            const element = dirs[index];
            if (existsSync(path.join(name, element))) {
                name = path.join(name, element);
                break;
            }
        }

        return name;
    }

    async function _buildProject(name: string, platform: string) {
        // TODO: run "tns update" / detect and build webpack
        console.debug(`building project in ${name} for ${platform} ...`);
        // let pkgFile: any;
        // const pkgFileStr = readFileSync(path.join(name, 'package.json'), 'utf8');
        // pkgFile = JSON.parse(pkgFileStr);
        // if (!pkgFile) return false;

        // if there is a plugin build script, execute it
        await _execPromise(name, `npm run build.plugin --if-present`);

        await _execPromise(name, 'npm i');
        const result = await _execPromise(name, `tns build ${platform}`);
        return result;
    }

    function _getPlatform(plugin: MarketplaceService.PluginModel): string {
        const platform = plugin.badges && plugin.badges.androidVersion ? 'android' : plugin.badges && plugin.badges.iosVersion ? 'ios' : '';
        return platform;
    }

    async function _cloneProject(repositoryUrl: string, name: string) {
        console.debug(`cloning into ${name} ...`);
        await _execPromise(null, `git clone ${repositoryUrl} ${name}`);
    }

    function _execPromise(project: string, command: string) {
        const cwd = project ? project : testDirectory;
        const cp = exec(command, { cwd: cwd });

        return new Promise((resolve, reject) => {
            cp.addListener('error', reject);
            cp.addListener('exit', (code, signal) => {
                resolve(code === 0);
            });
            let hasError = false;
            cp.stderr.on('data', function (data) {
                if (!hasError) {
                    console.error(`error while executing ${command}:`);
                    hasError = true;
                }
                console.error(data);
            });
        });
    }

    async function _checkTestDirectory() {
        if (existsSync(testDirectory)) {
            return new Promise((resolve, reject) => {
                console.debug(`removing ${testDirectory} project root`);
                rimraf(testDirectory, errR => {
                    if (errR) {
                        return reject(errR);
                    }

                    _createTestDirectory().then(resolve).catch(reject);
                });
            });
        } else {
            return await _createTestDirectory();
        }

    }

    async function _createTestDirectory() {
        console.debug(`creating ${testDirectory} project root`);
        return new Promise((resolve, reject) => {
            mkdir(testDirectory, errM => {
                return errM ? reject(errM) : resolve();
            });
        });
    }
}