import { MarketplaceService } from './marketplace.service';
import { existsSync, mkdir, readFileSync } from 'fs';
import * as path from 'path';
import * as rimraf from 'rimraf';
import { Logger } from './log.service';
import execPromise from './execPromise';

const testDirectory = 'testGit';
export namespace GithubService {

    export async function testPlugin(plugin: MarketplaceService.PluginModel) {
        if (!plugin || !plugin.badges || !plugin.badges.demos) {
            Logger.error('plugin has no demos badge');
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
                Logger.error('plugin has no platform');
            }
        } catch (errExec) {
            Logger.error(JSON.stringify(errExec));
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
        Logger.debug(`building project in ${name} for ${platform} ...`);
        // let pkgFile: any;
        // const pkgFileStr = readFileSync(path.join(name, 'package.json'), 'utf8');
        // pkgFile = JSON.parse(pkgFileStr);
        // if (!pkgFile) return false;

        // if there is a plugin build script, execute it
        await execPromise(name, `npm run build.plugin --if-present`);

        await execPromise(name, 'npm i');
        const result = await execPromise(name, `tns build ${platform}`);
        return result;
    }

    function _getPlatform(plugin: MarketplaceService.PluginModel): string {
        const platform = plugin.badges && plugin.badges.androidVersion ? 'android' : plugin.badges && plugin.badges.iosVersion ? 'ios' : '';
        return platform;
    }

    async function _cloneProject(repositoryUrl: string, name: string) {
        Logger.debug(`cloning into ${name} ...`);
        await execPromise(testDirectory, `git clone ${repositoryUrl} ${name}`);
    }

    async function _checkTestDirectory() {
        if (existsSync(testDirectory)) {
            return new Promise((resolve, reject) => {
                Logger.debug(`removing ${testDirectory} project root`);
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
        Logger.debug(`creating ${testDirectory} project root`);
        return new Promise((resolve, reject) => {
            mkdir(testDirectory, errM => {
                return errM ? reject(errM) : resolve();
            });
        });
    }
}