import { MarketplaceService } from './marketplace.service';
import { existsSync, mkdir, readFileSync, writeFileSync } from 'fs';
import * as path from 'path';
import * as rimraf from 'rimraf';
import { ncp } from 'ncp';
import { Logger } from './log.service';
import execPromise from './execPromise';

const testDirectory = 'test';
const testProject = 'baseTS';

export namespace ProjectService {

    export async function setup() {
        if (existsSync(testDirectory)) {
            await _removeDirectory(testDirectory);
        }

        await _createTestDirectory();
        await _createProject(testProject);
    }

    export async function testPlugin(plugin: MarketplaceService.PluginModel) {
        let result = false;
        try {
            let projectName = 'test' + plugin.name;
            // NativeScript max project name length
            projectName = projectName.substr(0, 30);
            await _copyTestProject(projectName);
            await _installPlugin(plugin.name, projectName, _isDev(plugin.name));
            const platform = _getPlatform(plugin);
            if (platform) {
                result = !!(await _buildProject(projectName, platform));
            } else {
                Logger.error('plugin has no platform');
            }
            await _removeDirectory(path.join(testDirectory, projectName));
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

    function _getPlatform(plugin: MarketplaceService.PluginModel): string {
        const platform = plugin.badges && plugin.badges.androidVersion ? 'android' : plugin.badges && plugin.badges.iosVersion ? 'ios' : '';
        return platform;
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
            // Install webpack, modify project to include plugin code
            await execPromise(cwd, 'npm i --save-dev nativescript-dev-webpack');
            await execPromise(cwd, 'npm i');
            _modifyProject(cwd, name);
        }
    }

    function _modifyProject(appRoot: string, name: string) {
        const mainTsPath = path.join(appRoot, 'app', 'main-view-model.ts')
        let mainTs = readFileSync(mainTsPath, 'utf8');
        mainTs = `import * as testPlugin from '${name}';\n` + mainTs;
        mainTs = mainTs.replace('public onTap() {', 'public onTap() {\nfor (let testExport in testPlugin) {console.log(testExport);}\n');
        if (mainTs.indexOf('testExport') === -1) {
            throw new Error('Template content has changed! Plugin test script needs to be updated.')
        }
        writeFileSync(mainTsPath, mainTs, 'utf8');
    }

    async function _copyTestProject(name: string) {
        ncp.limit = 16;
        return new Promise((resolve, reject) => {
            ncp(path.join(testDirectory, testProject), path.join(testDirectory, name), err => {
                return err ? reject(err) : resolve();
            })
        });
    }

    async function _createProject(name: string) {
        Logger.debug(`creating project ${name} ...`);
        await execPromise(testDirectory, `tns create ${name} --tsc`);
        await execPromise(path.join(testDirectory, name), 'npm i');
        await execPromise(path.join(testDirectory, name), 'tns platform add android');
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