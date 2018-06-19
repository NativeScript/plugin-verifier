import { MarketplaceService } from './marketplace.service';
import { ProjectService } from './project.service';

export async function run() {
    const plugins = await MarketplaceService.getPopularPlugins();
    console.log(`received ${plugins.length} plugins from Marketplace`);
    for (let index = 0; index < plugins.length; index++) {
        const plugin = plugins[index];
        console.log(`Start check ${plugin.name}`);
        const startDate = new Date().getTime();
        const result = await ProjectService.testPlugin(plugin);
        console.log(`End check ${plugin.name}. Elapsed ${Math.round((new Date().getTime() - startDate) / 1000)}s. Result is ${result}`);
    }
}