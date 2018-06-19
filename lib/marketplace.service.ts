const marketplaceApiUrl = 'https://market.nativescript.org/api/plugins?&skip=%s&take=%s';

import * as util from 'util';
import * as request from 'request-promise-native';

const pluginCount = 20;

export namespace MarketplaceService {
    export interface PluginModel {
        displayName: string;
        authorName: string;
        authorNpm: string;
        version: string;
        name: string;
        description: string;
        repositoryUrl: string;
        lastUploaded: Date;
        type: string;
        isDeprecated: boolean;
        badges: any;
    }

    export async function getPopularPlugins() {
        const options = {
            uri: util.format(marketplaceApiUrl, 0, pluginCount),
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'nspluginchecker'
            }
        };
        try {
            const result = await request(options);
            const parsed = JSON.parse(result);
            return parsed.data as Array<PluginModel>;
        } catch (err) {
            console.log("error while downloading plugins info from marketplace");
            return [];
        }
    }
}