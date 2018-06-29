import { MarketplaceService } from './marketplace.service';
import { existsSync, mkdir, readFileSync } from 'fs';
import * as path from 'path';
import * as rimraf from 'rimraf';
import { Logger } from './log.service';
import { execPromise, dirNameFromPluginName } from './execPromise';

const testDirectory = 'testGit';
export namespace GithubService {

    export async function testPlugin(plugin: MarketplaceService.PluginModel) {
        const result = { android: false, ios: false, demoDirectory: '' };
        let hasPlatform = false;
        if (!plugin || !plugin.badges || !plugin.badges.demos) {
            Logger.error('plugin has no demos badge');
            return result;
        }

        try {
            await _checkTestDirectory();
            const projectName = dirNameFromPluginName(plugin.name);
            await _cloneProject(plugin.repositoryUrl, projectName);
            const demoDir = _getDemoDir(path.join(testDirectory, projectName), plugin);
            result.demoDirectory = demoDir;

            // if there is a plugin build script, execute it
            await execPromise(demoDir, `npm run build.plugin --if-present`);

            if (plugin.badges.androidVersion) {
                result.android = !!(await _buildProject(demoDir, 'android'));
                hasPlatform = true;
            }

            if (plugin.badges.iosVersion) {
                result.ios = !!(await _buildProject(demoDir, 'ios'));
                hasPlatform = true;
            }

            if (!hasPlatform) {
                Logger.error('plugin has no platform');
            }
        } catch (errExec) {
            Logger.error(JSON.stringify(errExec.message || errExec));
        }

        return result;
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
        // TODO: run 'tns update' / detect and build webpack
        Logger.debug(`building project in ${name} for ${platform} ...`);
        await execPromise(name, 'npm i');
        const result = await execPromise(name, `tns build ${platform}`);
        return result;
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