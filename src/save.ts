import * as core from "@actions/core";
import { globby } from "globby";
import { join } from "path";

import { Events, Inputs, State } from "./constants";
import * as utils from "./utils/actionUtils";

// Catch and log any unhandled exceptions.  These exceptions can leak out of the uploadChunk method in
// @actions/toolkit when a failed upload closes the file descriptor causing any in-process reads to
// throw an uncaught exception.  Instead of failing this action, just warn.
process.on("uncaughtException", e => utils.logWarning(e.message));

async function run(): Promise<void> {
    try {
        if (!utils.isValidEvent()) {
            utils.logWarning(
                `Event Validation Error: The event type ${
                    process.env[Events.Key]
                } is not supported because it's not tied to a branch or tag ref.`
            );
            return;
        }

        // Inputs are re-evaluted before the post action, so we want the original key used for restore
        const primaryKey = core.getState(State.CachePrimaryKey);
        if (!primaryKey) {
            utils.logWarning(`Error retrieving key from state.`);
            return;
        }

        if (utils.getCacheHit()) {
            core.info(
                `Cache hit occurred on the primary key ${primaryKey}, not saving cache.`
            );
            return;
        }

        let cachePaths = utils.getInputAsArray(Inputs.Path, {
            required: true
        });

        cachePaths = cachePaths.map(x => {
            if (x.startsWith("~/")) {
                return utils.expand(`$HOME${x.substring(1)}`)
            }
            x = utils.expand(x);
            if (!x.startsWith("/")) {
                x = join(process.cwd(), x);
            }
            return x;
        })

        const files = await globby(cachePaths, {
            cwd: "/"
        });

        const container = await utils.getContainerClient();
        core.info(`Caching ${primaryKey} with ${files.length} files`);

        try {
            await utils.storeCache(container, primaryKey, files);
            core.info(`Cache saved with key: ${primaryKey}`);
        } catch (error: unknown) {
            const typedError = error as Error;
            utils.logWarning(typedError.message);
        }
    } catch (error: unknown) {
        utils.logWarning((error as Error).message);
    }
}

run();

export default run;
