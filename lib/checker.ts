import { MarketplaceService } from './marketplace.service';
import { ProjectService } from './project.service';
import { GithubService } from './github.service';
import { writeFileSync } from 'fs';
import { execPromise } from './execPromise';
import { Logger } from './log.service';

interface ResultsInterface {
    name: string;
    webpackBuild: boolean;
    webpackTime: number;
    demosBuild: boolean;
    demoTime: number;
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

    await ProjectService.setup();
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
        const startDate = new Date().getTime();
        // Test if the plugin builds when added to an app
        const resultWP = await ProjectService.testPlugin(plugin);
        const midDate = new Date().getTime();
        // Test if the plugin builds its demo (if available)
        const resultD = await GithubService.testPlugin(plugin);
        const endDate = new Date().getTime();
        results.push({
            name: plugin.name,
            webpackBuild: !!resultWP,
            webpackTime: Math.round((midDate - startDate) / 1000),
            demosBuild: !!resultD,
            demoTime: Math.round((endDate - midDate) / 1000)
        });
        Logger.log(JSON.stringify(results[results.length - 1]));
    }

    output.data = results;
    writeFileSync('results.json', JSON.stringify(output, null, 4), 'utf8');
}