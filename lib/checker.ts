import { MarketplaceService } from './marketplace.service';
import { ProjectService } from './project.service';
import { GithubService } from './github.service';
import { writeFileSync } from 'fs';
import execPromise from './execPromise';

interface resultsInterface {
    name: string;
    webpackBuild: boolean;
    webpackTime: number;
    demosBuild: boolean;
    demoTime: number;
}

export async function run() {
    const tnsVersion:string  = await execPromise('.', 'tns --version', true) as string;
    const npmVersion = await execPromise('.', 'npm --version', true) as string;
    const plugins = await MarketplaceService.getPopularPlugins();
    console.log(`received ${plugins.length} plugins from Marketplace`);
    const results: Array<resultsInterface> = [];

    for (let index = 0; index < plugins.length; index++) {
        const plugin = plugins[index];
        console.log(`Start check ${plugin.name}`);
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
        console.log(JSON.stringify(results[results.length - 1]));
    }

    const output = {
        data: results,
        time: new Date().getTime(),
        tnsVersion: tnsVersion.trim(),
        nodeVersion: process.version,
        npmVersion: npmVersion.trim()
    }

    writeFileSync('results.json', JSON.stringify(output, null, 4), 'utf8');
}