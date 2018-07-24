import { MarketplaceService } from './marketplace.service';
import { ProjectService } from './project.service';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { execPromise } from './execPromise';
import { Logger } from './log.service';

interface ResultsInterface {
    name: string;
    webpack?: any;
    webpackTime?: number;
    build?: any;
    buildTime?: number;
    snapshot?: any;
    snapshotTime?: number;
    aot?: any;
    aotTime?: number;
    uglify?: any;
    uglifyTime?: number;
}

class OutputModel {
    data: Array<ResultsInterface>;
    time: number;
    tnsVersion: string;
    nodeVersion: string;
    npmVersion: string;
}

async function _setup(out: OutputModel) {
    Logger.debug('running setup...');
    const tnsVersion: string = await execPromise('.', 'tns --version', true) as string;
    const npmVersion = await execPromise('.', 'npm --version', true) as string;
    out.time = new Date().getTime();
    out.tnsVersion = tnsVersion.trim();
    out.nodeVersion = process.version;
    out.npmVersion = npmVersion.trim();
    const args = process.argv;
    const user = args.length > 4 ? args[4] : '';
    const pass = args.length > 5 ? args[5] : '';
    const cloudEnabled = !!(user && pass);
    if (cloudEnabled) {
        await execPromise('.', 'tns extension install nativescript-cloud');
        await execPromise('.', 'tns accept eula');
        await execPromise('.', 'tns config apply test --apiVersion test');
        await execPromise('.', `tns dev-login ${user} ${pass}`);
        // setup android signing
        if (existsSync('debug.p12')) {
            unlinkSync('debug.p12');
        }
        await execPromise('.', 'echo android | keytool -importkeystore -srckeystore ~/.android/debug.keystore -destkeystore debug.p12 -srcstoretype JKS -deststoretype PKCS12 -deststorepass android -srcalias androiddebugkey -destalias androiddebugkey');
    }
    await ProjectService.setup(cloudEnabled);
}

export async function run() {
    const results: Array<ResultsInterface> = [];
    const output = new OutputModel();
    await _setup(output);
    const args = process.argv;
    let skip = 0, take = 10;
    if (args.length > 2) {
        skip = parseInt(args[2], 10);
    }
    if (args.length > 3) {
        take = parseInt(args[3], 10);
    }
    const plugins = await MarketplaceService.getPlugins(skip, take);
    Logger.log(`Asked for ${take} plugins starting from ${skip}. Received ${plugins.length} results.`);

    for (let index = 0; index < plugins.length; index++) {
        const plugin = plugins[index];
        Logger.log(`Start check ${plugin.name}`);

        // Test if the plugin builds when added to an app
        await ProjectService.prepareProject(plugin);
        const actions = ['testWebpack', 'testBuild', 'testSnapshot']; // removed for speed , 'testUglify', 'testAot'];
        const result: ResultsInterface = {
            name: plugin.name
        };

        for (let index = 0; index < actions.length; index++) {
            const action = actions[index];
            const startDate = new Date().getTime();
            const actionResult = await ProjectService[action](plugin);
            const endDate = new Date().getTime();
            const resultName = action.replace('test', '').toLowerCase();
            result[resultName] = actionResult;
            result[resultName + 'Time'] = Math.round((endDate - startDate) / 1000);
        }

        await ProjectService.cleanProject();
        results.push(result);
        Logger.log(JSON.stringify(results[results.length - 1], null, 4));
        Logger.log('---------------------------------------------------------------------------');
    }

    output.data = results;
    writeFileSync('results.json', JSON.stringify(output, null, 4), 'utf8');
}