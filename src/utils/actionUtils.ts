import * as core from "@actions/core";
import { BlobServiceClient, ContainerClient } from "@azure/storage-blob";
import { execa } from "execa";

import { Inputs, Outputs, RefKey, State } from "../constants";

export function setCacheHit(isCacheHit: boolean): void {
    core.setOutput(Outputs.CacheHit, isCacheHit.toString());
    core.saveState(State.CacheHit, isCacheHit.toString());
}

export function getCacheHit(): boolean {
    return core.getState(State.CacheHit) === "true";
}

export function logWarning(message: string): void {
    const warningPrefix = "[warning]";
    core.info(`${warningPrefix}${message}`);
}

// Cache token authorized for all events that are tied to a ref
// See GitHub Context https://help.github.com/actions/automating-your-workflow-with-github-actions/contexts-and-expression-syntax-for-github-actions#github-context
export function isValidEvent(): boolean {
    return RefKey in process.env && Boolean(process.env[RefKey]);
}

export function getInputAsArray(
    name: string,
    options?: core.InputOptions
): string[] {
    return core
        .getInput(name, options)
        .split("\n")
        .map(s => s.trim())
        .filter(x => x !== "");
}

export function getInputAsInt(
    name: string,
    options?: core.InputOptions
): number | undefined {
    const value = parseInt(core.getInput(name, options));
    if (isNaN(value) || value < 0) {
        return undefined;
    }
    return value;
}

export async function unpackCache(
    container: ContainerClient,
    key: string
): Promise<boolean> {
    const blob = container.getBlockBlobClient(key);
    if (!(await blob.exists())) {
        return false;
    }

    if ((await blob.getProperties()).metadata?.valid !== "true") {
        return false;
    }

    const downloadResult = await blob.download();
    if (downloadResult.errorCode !== null) {
        throw new Error(`Failed to upload: ${downloadResult.errorCode}`);
    }
    if (typeof downloadResult.readableStreamBody === "undefined") {
        throw new Error(`This is somehow running in a browser.`);
    }
    const body = downloadResult.readableStreamBody;

    const tar = execa("tar", ["-xzf", "-", "--zstd", "-C", "/"]);
    if (tar.stdin === null) {
        throw new Error((await tar).stderr.toString());
    }
    body.pipe(tar.stdin);
    await new Promise((resolve, reject) => {
        body.on("error", reject);
        body.on("end", resolve);
    });
    await tar;

    return true;
}

export async function storeCache(
    container: ContainerClient,
    key: string,
    files: string[]
): Promise<void> {
    core.debug(`Starting compression with primary key: ${key}`);
    const tar = execa("tar", ["-czf", "--zstd", ...files]);
    if (tar.stdout === null) {
        throw new Error((await tar).stderr.toString());
    }

    core.debug(`Starting upload with primary key: ${key}`);
    const blob = container.getBlockBlobClient(key);
    await blob.deleteIfExists();
    const uploadResult = await blob.uploadStream(tar.stdout);

    if (uploadResult.errorCode !== null) {
        throw new Error(`Failed to upload: ${uploadResult.errorCode}`);
    }
    await tar;

    core.debug(`Upload completed, marking as valid: ${key}`);
    await blob.setMetadata({
        valid: "true"
    });
}

export async function getContainerClient(): Promise<ContainerClient> {
    try {
        const connectionString = core.getInput(Inputs.ConnectionString, {
            required: true
        });

        const containerName = core.getInput(Inputs.ConnectionString, {
            required: true
        });

        core.info(`Connecting to storage account container: ${containerName}`);
        const container = new ContainerClient(connectionString, containerName);
        if (!(await container.exists())) {
            throw new Error(`Container '${containerName}' does not exist.`);
        }

        return container;
    } catch (e: unknown) {
        const m = e as Error;
        throw new Error(`Unable to connect to container: ${m.message}`);
    }
}
