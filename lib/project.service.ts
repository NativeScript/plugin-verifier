import { MarketplaceService } from './marketplace.service';
import { existsSync, mkdir, readFileSync, writeFileSync, rename } from 'fs';
import * as path from 'path';
import * as rimraf from 'rimraf';
import { ncp } from 'ncp';
import { Logger } from './log.service';
import { execPromise, dirNameFromPluginName } from './execPromise';

const testDirectory = 'test';
const testProject = 'baseTS';
const testProjectOriginalSuffix = '_original';

export namespace ProjectService {

    export async function setup() {
        if (existsSync(testDirectory)) {
            await _removeDirectory(testDirectory);
        }

        await _createTestDirectory();
        await _createProject(testProject);
        await _renameTestProject();
    }

    export async function testPlugin(plugin: MarketplaceService.PluginModel) {
        const result = { android: false, ios: false };
        let hasPlatform = false;
        try {
            await _copyTestProject(testProject);
            await _installPlugin(plugin.name, testProject, _isDev(plugin.name));
            if (plugin.badges.androidVersion) {
                result.android = !!(await _buildProject(testProject, 'android'));
                hasPlatform = true;
            }

            if (plugin.badges.iosVersion) {
                result.ios = !!(await _buildProject(testProject, 'ios'));
                hasPlatform = true;
            }

            if (!hasPlatform) {
                Logger.error('plugin has no platform');
            }

            await _removeDirectory(path.join(testDirectory, testProject));
        } catch (errExec) {
            Logger.error(JSON.stringify(errExec));
        }
        return result;
    }

    async function _buildProject(projectName: string, platform: string) {
        Logger.debug(`building project for ${platform} ...`);
        const cwd = path.join(testDirectory, projectName);
        const result = await execPromise(cwd, `tns build ${platform} --bundle`);
        return result;
    }

    function _isDev(name: string): boolean {
        return name && name.indexOf('-dev-') !== -1;
    }

    async function _installPlugin(name: string, projectName: string, isDev: boolean) {
        Logger.debug(`installing ${name} plugin ...`);
        const cwd = path.join(testDirectory, projectName);
        const command = isDev ? `npm i ${name} --save-dev` : `tns plugin add ${name}`;
        await execPromise(cwd, command);
        if (!isDev) {
            _modifyProject(cwd, name);
        }
    }

    function _modifyProject(appRoot: string, name: string) {
        const mainTsPath = path.join(appRoot, 'app', 'main-view-model.ts');
        let mainTs = readFileSync(mainTsPath, 'utf8');
        mainTs = `import * as testPlugin from '${name}';\n` + mainTs;
        mainTs = mainTs.replace('public onTap() {', 'public onTap() {\nfor (let testExport in testPlugin) {console.log(testExport);}\n');
        if (mainTs.indexOf('testExport') === -1) {
            throw new Error('Template content has changed! Plugin test script needs to be updated.');
        }
        writeFileSync(mainTsPath, mainTs, 'utf8');
    }

    async function _copyTestProject(name: string) {
        const newPath = path.join(testDirectory, name);
        if (existsSync(newPath)) {
            await _removeDirectory(newPath);
        }

        ncp.limit = 16;
        return new Promise((resolve, reject) => {
            ncp(path.join(testDirectory, testProject + testProjectOriginalSuffix), newPath, err => {
                return err ? reject(err) : resolve();
            });
        });
    }

    async function _renameTestProject() {
        return new Promise((resolve, reject) => {
            rename(path.join(testDirectory, testProject), path.join(testDirectory, testProject + testProjectOriginalSuffix), err => {
                return err ? reject(err) : resolve();
            });
        });
    }

    async function _createProject(name: string) {
        Logger.debug(`creating project ${name} ...`);
        const baseProjectDir = path.join(testDirectory, name);
        await execPromise(testDirectory, `tns create ${name} --tsc`);
        await execPromise(baseProjectDir, 'npm i --save-dev nativescript-dev-webpack');
        await execPromise(baseProjectDir, 'npm i');
        await execPromise(baseProjectDir, 'tns platform add android');
        await execPromise(baseProjectDir, 'tns platform add ios');
    }

    async function _removeDirectory(name: string) {
        return new Promise((resolve, reject) => {
            Logger.debug(`removing ${name} project root`);
            rimraf(name, errR => {
                return errR ? reject(errR) : resolve();
            });
        });
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