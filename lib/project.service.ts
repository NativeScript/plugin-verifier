import { MarketplaceService } from './marketplace.service';
import { existsSync, mkdir, readFileSync, writeFileSync, rename } from 'fs';
import * as path from 'path';
import * as rimraf from 'rimraf';
import { ncp } from 'ncp';
import { Logger } from './log.service';
import { execPromise } from './execPromise';

const testDirectory = 'test';
const testProject = 'baseNG';
const testProjectOriginalSuffix = '_original';
const exceptions = {
    'kinvey-nativescript-sdk': {
        command: 'npm i rxjs-compat'
    },
    'nativescript-fingerprint-auth': {
        command: 'sed -i -- \'s/defaultConfig ./defaultConfig {\\n    minSdkVersion 23/g\' app/App_Resources/Android/app.gradle'
    },
    'nativescript-plugin-gplaces': {
        file: 'google-places.config.json',
        content: `{
            "ios_key": "ios_key",
            "android_key": "android_key",
            "browser_key": "browser_key",
            "location": true,
            "images": true
        }`
    },
    'nativescript-plugin-google-places': {
        file: 'google-places.config.json',
        content: `{
            "ios_key": "ios_key",
            "android_key": "android_key",
            "browser_key": "browser_key",
            "location": true,
            "images": true
        }`
    },
    'nativescript-push-notifications': {
        command: 'sed -i -- \'s/defaultConfig ./defaultConfig {\\n    minSdkVersion 19/g\' app/App_Resources/Android/app.gradle',
        file: 'app/App_Resources/Android/google-services.json',
        content: `{
            "project_info": {
              "project_number": "424050927453",
              "firebase_url": "https://pptest-53916.firebaseio.com",
              "project_id": "pptest-53916",
              "storage_bucket": "pptest-53916.appspot.com"
            },
            "client": [
              {
                "client_info": {
                  "mobilesdk_app_id": "1:424050927453:android:21d2dd8987e1e3d1",
                  "android_client_info": {
                    "package_name": "org.nativescript.baseNG"
                  }
                },
                "oauth_client": [
                  {
                    "client_id": "424050927453-o7gv6bcmknujjoaaoa5r4d452cutb9jf.apps.googleusercontent.com",
                    "client_type": 3
                  }
                ],
                "api_key": [
                  {
                    "current_key": "AIzaSyDr3fqH7Z8-vhBNpAges_KFTA7oOoylGvU"
                  }
                ],
                "services": {
                  "analytics_service": {
                    "status": 1
                  },
                  "appinvite_service": {
                    "status": 1,
                    "other_platform_oauth_client": []
                  },
                  "ads_service": {
                    "status": 2
                  }
                }
              }
            ],
            "configuration_version": "1"
          }`
    },
    'nativescript-wikitude': {
        command: 'sed -i -- \'s/defaultConfig ./defaultConfig {\\n    minSdkVersion 19/g\' app/App_Resources/Android/app.gradle'
    },
};

export namespace ProjectService {
    export let cloudEnabled = false;
    export async function setup(cloud: boolean) {
        cloudEnabled = cloud;
        if (existsSync(testDirectory)) {
            await _removeDirectory(testDirectory);
        }

        await _createTestDirectory();
        await _createProject(testProject);
        await _renameTestProject();
    }
    export async function prepareProject(plugin: MarketplaceService.PluginModel) {
        try {
            await _copyTestProject(testProject);
            await _installPlugin(plugin, testProject);
        } catch (errExec) {
            Logger.error('Error while preparing project:' + errExec && errExec.message);
        }
    }

    export async function cleanProject() {
        try {
            await new Promise((resolve) => {
                setTimeout(() => {
                    resolve();
                }, 2000);
            });
            await _removeDirectory(path.join(testDirectory, testProject));
        } catch (errExec) {
            Logger.error('Error while cleaning project:' + errExec && errExec.message);
        }
    }

    export async function testWebpack(plugin: MarketplaceService.PluginModel) {
        Logger.log('WEBPACK BUILD:');
        return await testPlugin(plugin, {
            android: '--bundle',
            ios: '--bundle'
        });
    }

    export async function testSnapshot(plugin: MarketplaceService.PluginModel) {
        Logger.log('SNAPSHOT BUILD:');
        const signKeystore = cloudEnabled ? '../../debug.p12' : '~/.android/debug.keystore';
        return await testPlugin(plugin, {
            android: `--bundle --release --env.snapshot --key-store-path ${signKeystore} --key-store-password android --key-store-alias androiddebugkey --key-store-alias-password android`
        });
    }

    export async function testUglify(plugin: MarketplaceService.PluginModel) {
        Logger.log('UGLIFY BUILD:');
        return await testPlugin(plugin, {
            android: '--bundle --env.uglify',
            ios: '--bundle --env.uglify'
        });
    }

    export async function testAot(plugin: MarketplaceService.PluginModel) {
        Logger.log('AOT BUILD:');
        return await testPlugin(plugin, {
            android: '--bundle --env.aot',
            ios: '--bundle --env.aot'
        });
    }

    export async function testBuild(plugin: MarketplaceService.PluginModel) {
        Logger.log('NORMAL BUILD:');
        return await testPlugin(plugin, {
            android: ' ',
            ios: ' '
        });
    }

    async function testPlugin(plugin: MarketplaceService.PluginModel, options: { android?: string, ios?: string }) {
        const result: { android?: boolean, ios?: boolean } = {};
        const isDarwin = process.platform === 'darwin';
        let skipBuild = false;
        try {
            skipBuild = isDarwin || !plugin.badges || (!plugin.badges.androidVersion && plugin.badges.iosVersion);
            if (!skipBuild && options.android) {
                result.android = !!(await _buildProject(testProject, 'android', options.android));
            } else {
                Logger.error('Skipping android build! Plugin only has ios support or no options supplied.');
            }

            skipBuild = !isDarwin || !plugin.badges || (!plugin.badges.iosVersion && plugin.badges.androidVersion);
            if (!skipBuild && options.ios) {
                result.ios = !!(await _buildProject(testProject, 'ios', options.ios));
            } else {
                Logger.error('Skipping ios build! Plugin only has android support or no options supplied.');
            }
        } catch (errExec) {
            Logger.error('Error while building project:' + errExec && errExec.message);
        }
        return result;
    }

    async function _buildProject(projectName: string, platform: string, options: string) {
        Logger.log(`building project for ${platform} ...`);
        const cwd = path.join(testDirectory, projectName);
        if (platform === 'ios' && cloudEnabled) {
            // TODO: change this after it expires in August 2019
            options += ' --provision /tns-official/CodeSign/ios/Icenium_QA_Development.mobileprovision --certificate /tns-official/CodeSign/ios/iPhone\\ Developer\\ Dragon\\ Telerikov\\ \\(R58QAA9NR8\\).p12 --certificatePassword 1';
        }
        const command = cloudEnabled ? `tns cloud build ${platform} --accountId 1 ${options}` : `tns build ${platform} ${options}`;
        const result = await execPromise(cwd, command);
        return result;
    }

    async function _installPlugin(plugin: MarketplaceService.PluginModel, projectName: string) {
        const name = plugin.name;
        const isDev = name && name.indexOf('-dev-') !== -1;
        Logger.log(`installing ${name} plugin ...`);
        const cwd = path.join(testDirectory, projectName);

        if (exceptions[name]) {
            try {
                Logger.log(`Applying plugin exception for ${name}`);
                if (exceptions[name].file) {
                    writeFileSync(path.join(cwd, exceptions[name].file), exceptions[name].content, 'utf8');
                }
                if (exceptions[name].command) {
                    await execPromise(cwd, exceptions[name].command);
                }
            } catch (ex) {
                Logger.log('Error when applying plugin exception: ' + ex.message);
            }
        }

        let command = `tns plugin add ${name}`;
        if (isDev) {
            // dev plugin (e.g. nativescript-dev-typescript)
            command = `npm i ${name} --save-dev`;
        } else if (!plugin.badges || (!plugin.badges.androidVersion && !plugin.badges.iosVersion)) {
            // regular (not nativescript specific) plugin
            command = `npm i ${name} --save`;
        }

        await execPromise(cwd, command);
        if (!isDev) {
            _modifyProject(cwd, plugin);
        }
    }

    function _modifyProject(appRoot: string, plugin: MarketplaceService.PluginModel) {
        const name = plugin.name;

        try {
            const packagePath = path.join(appRoot, 'src', 'package.json');
            let packageJson = readFileSync(packagePath, 'utf8');
            packageJson = packageJson.replace('"android": {', `"android": {\n"requireModules": ["${name}"],`);
            if (packageJson.indexOf(name) === -1) {
                throw new Error('package.json content has changed! Plugin test script needs to be updated.');
            }
            writeFileSync(packagePath, packageJson, 'utf8');
        } catch (e) {
            Logger.error('error while updating package.json in app folder! ' + (e && e.message));
        }

        try {
            const mainTsPath = path.join(appRoot, 'src', 'app', 'home', 'home.component.ts');
            let mainTs = readFileSync(mainTsPath, 'utf8');
            if (plugin.badges && plugin.badges.typings) {
                mainTs = `import * as testPlugin from '${name}';\n` + mainTs;
            } else {
                mainTs = `const testPlugin = require('${name}');\n` + mainTs;
            }
            mainTs = mainTs.replace('constructor() {', 'constructor() {\nfor (let testExport in testPlugin) {console.log(testExport);}\n');
            if (mainTs.indexOf('console.log(testExport)') === -1) {
                throw new Error('Template component content has changed! Plugin test script needs to be updated.');
            }
            writeFileSync(mainTsPath, mainTs, 'utf8');
        } catch (e) {
            Logger.error('error while updating main-view-model.ts in app folder! ' + (e && e.message));
        }
    }

    async function _copyTestProject(name: string) {
        const newPath = path.join(testDirectory, name);
        if (existsSync(newPath)) {
            Logger.log('Removing old test project...');
            await _removeDirectory(newPath);
        }

        ncp.limit = 16;
        Logger.log('Copying test project to new directory...');
        return new Promise((resolve, reject) => {
            ncp(path.join(testDirectory, testProject + testProjectOriginalSuffix), newPath, err => {
                return err ? reject(err) : resolve();
            });
        });
    }

    async function _renameTestProject() {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                rename(path.join(testDirectory, testProject), path.join(testDirectory, testProject + testProjectOriginalSuffix), err => {
                    return err ? reject(err) : resolve();
                });
            }, 2000);

        });
    }

    async function _createProject(name: string) {
        Logger.log(`creating project ${name} ...`);
        const baseProjectDir = path.join(testDirectory, name);
        await execPromise(testDirectory, `tns create ${name} --template tns-template-blank-ng`);
        await execPromise(baseProjectDir, 'npm i');
        await execPromise(baseProjectDir, 'tns platform add android');
        await execPromise(baseProjectDir, 'tns platform add ios');
    }

    async function _removeDirectory(name: string) {
        return new Promise((resolve, reject) => {
            Logger.log(`removing ${name} project root`);
            rimraf(name, errR => {
                return errR ? reject(errR) : resolve();
            });
        });
    }

    async function _createTestDirectory() {
        Logger.log(`creating ${testDirectory} project root`);
        return new Promise((resolve, reject) => {
            mkdir(testDirectory, errM => {
                return errM ? reject(errM) : resolve();
            });
        });
    }
}