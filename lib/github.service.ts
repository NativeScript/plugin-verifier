import { MarketplaceService } from './marketplace.service';
import { existsSync, mkdir, readFileSync, writeFileSync } from 'fs';
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
            const demoDirs = _getDemoDirs(path.join(testDirectory, projectName));
            for (let i = 0; i < demoDirs.length; i++) {
                const demoDir = demoDirs[i];
                result.demoDirectory = demoDir;
                if (plugin.badges.androidVersion || plugin.badges.iosVersion) {
                    await _prepareDemoProject(demoDir, plugin.name);
                }

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
                    break;
                }

                if (result.android || result.ios) {
                    // successful demo build
                    break;
                }
            }
        } catch (errExec) {
            Logger.error(JSON.stringify(errExec.message || errExec));
        }

        return result;
    }

    function _getDemoDirs(parentDir: string) {
        const dirs = ['demo', 'demo-ts', 'demo-angular', 'demo-ng', 'ng-demo', 'demo-vue'];
        const available = [];
        for (let index = 0; index < dirs.length; index++) {
            const element = dirs[index];
            if (existsSync(path.join(parentDir, element))) {
                available.push(path.join(parentDir, element));
            }
        }

        return available;
    }

    async function _prepareDemoProject(cwd: string, name: string) {
        // TODO: run 'tns update' / detect and build webpack
        Logger.debug(`preparing project in ${cwd}...`);

        // replace plugin version in package.json with latest(*)
        const pkgFilePath = path.join(cwd, 'package.json');
        let pkgFile: any;
        try {
            const pkgFileStr = readFileSync(pkgFilePath, 'utf8');
            pkgFile = JSON.parse(pkgFileStr);
        } catch (e) {
            Logger.error(e.message || e);
            return;
        }

        if (pkgFile) {
            if (pkgFile.dependencies && pkgFile.dependencies[name]) {
                pkgFile.dependencies[name] = '*';
            }

            if (pkgFile.devDependencies && pkgFile.devDependencies[name]) {
                pkgFile.devDependencies[name] = '*';
            }

            try {
                writeFileSync(pkgFilePath, JSON.stringify(pkgFile, null, 4), 'utf8');
            } catch (e) {
                Logger.error(e.message || e);
                return;
            }
        }

        const srcDir = path.join(cwd, '..', 'src');
        if (existsSync(srcDir)) {
            // npm i from source directory so references can be used
            await execPromise(srcDir, 'npm i');
        }

        await execPromise(cwd, 'npm i');
    }

    async function _buildProject(cwd: string, platform: string) {
        Logger.debug(`building project in ${cwd} for ${platform}...`);
        const result = await execPromise(cwd, `tns build ${platform}`);
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