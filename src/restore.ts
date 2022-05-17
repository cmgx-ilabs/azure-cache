import * as core from "@actions/core";

import { Events, Inputs, State } from "./constants";
import * as utils from "./utils/actionUtils";

async function run(): Promise<void> {
    try {
        // Validate inputs, this can cause task failure
        if (!utils.isValidEvent()) {
            utils.logWarning(
                `Event Validation Error: The event type ${
                    process.env[Events.Key]
                } is not supported because it's not tied to a branch or tag ref.`
            );
            return;
        }

        const primaryKey = core.getInput(Inputs.Key, { required: true });
        core.saveState(State.CachePrimaryKey, primaryKey);

        const container = await utils.getContainerClient();

        try {
            const cacheKey = await utils.unpackCache(container, primaryKey);
            if (!cacheKey) {
                core.info(`Cache not found for input keys: ${primaryKey}`);
                return;
            }

            utils.setCacheHit(true);
            core.info(`Cache restored from key: ${cacheKey}`);
        } catch (error: unknown) {
            const typedError = error as Error;
            utils.logWarning(typedError.message);
            utils.setCacheHit(false);
        }
    } catch (error: unknown) {
        core.setFailed((error as Error).message);
    }
}

run();

export default run;
