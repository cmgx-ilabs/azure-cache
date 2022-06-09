import * as core from "@actions/core";
import {
    DefaultAzureCredential,
    DefaultAzureCredentialOptions
} from "@azure/identity";
import { BlobServiceClient, ContainerClient } from "@azure/storage-blob";
import { execa } from "execa";
import { promises } from "fs";

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

    const from = (await execa("mktemp")).stdout;

    try {
        core.info(`Downloading cache for: ${key}`);
        const downloadResult = await blob.downloadToFile(from);
        if (downloadResult.errorCode) {
            throw new Error(`Failed to download: ${downloadResult.errorCode}`);
        }

        const tar = await execa("tar", ["-xf", from, "--zstd"], {
            stderr: "inherit"
        });
        if (tar.exitCode !== 0) {
            throw new Error(`tar exited with ${tar.exitCode}`);
        }
    } finally {
        for (let i = 1; i <= 10; i++) {
            try {
                await promises.rm(from, {
                    force: true
                });
                // eslint-disable-next-line no-empty
            } catch {
                core.warning(
                    `failed to delete delete temporary file (attempt ${i} of 10): ${from}`
                );
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
    }

    return true;
}

export async function storeCache(
    container: ContainerClient,
    key: string,
    files: string[]
): Promise<void> {
    core.debug(`Connecting to blob with key: ${key}`);
    const blob = container.getBlockBlobClient(key);
    await blob.deleteIfExists();

    core.debug(`Starting compression with primary key: ${key}`);

    const to = (await execa("mktemp")).stdout;
    const from = (await execa("mktemp")).stdout;

    await promises.writeFile(from, files.join("\n"));

    const zstd = await execa(
        "tar",
        ["-cf", to, `--files-from=${from}`, `--zstd`],
        {
            stderr: "inherit"
        }
    );

    if (zstd.exitCode != 0) {
        throw new Error(`zstd exited with ${zstd.exitCode}`);
    }

    core.debug(`Starting upload with primary key: ${key}`);
    const uploadResult = await blob.uploadFile(to);

    if (uploadResult.errorCode) {
        throw new Error(`Failed to upload: ${uploadResult.errorCode}`);
    }

    core.debug(`Upload completed, marking as valid: ${key}`);
    await blob.setMetadata({
        valid: "true"
    });
}

export async function getContainerClient(): Promise<ContainerClient> {
    try {
        const connectionString = core.getInput(Inputs.ConnectionString, {
            required: false
        });

        if (connectionString === "") {
            return await getDefaultContainerClient();
        }

        const containerName = core.getInput(Inputs.Container, {
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

export async function getDefaultContainerClient(): Promise<ContainerClient> {
    try {
        const url = core.getInput(Inputs.Url, {
            required: true
        });

        const containerName = core.getInput(Inputs.Container, {
            required: true
        });

        const clientId = core.getInput(Inputs.Container, {
            required: false
        });

        const options = {} as DefaultAzureCredentialOptions;
        if (clientId !== "") {
            options.managedIdentityClientId = clientId;
        }

        const credential = new DefaultAzureCredential(options);

        const blobServiceClient = new BlobServiceClient(url, credential);

        core.info(`Connecting to storage account container: ${containerName}`);
        const container = blobServiceClient.getContainerClient(containerName);
        if (!(await container.exists())) {
            throw new Error(`Container '${containerName}' does not exist.`);
        }

        return container;
    } catch (e: unknown) {
        const m = e as Error;
        throw new Error(`Unable to connect to container: ${m.message}`);
    }
}

export function expand(envValue: string) {
    const matches = envValue.match(/(.?\${*[\w]*(?::-[\w/]*)?}*)/g) || [];
    return matches.reduce(function (newEnv, match, index) {
        const parts = /(.?)\${*([\w]*(?::-[\w/]*)?)?}*/g.exec(match);
        if (!parts || parts.length === 0) {
            return newEnv;
        }

        const prefix = parts[1];
        let value: string, replacePart: string;

        if (prefix === "\\") {
            replacePart = parts[0];
            value = replacePart.replace("\\$", "$");
        } else {
            const keyParts = parts[2].split(":-");
            const key = keyParts[0];
            replacePart = parts[0].substring(prefix.length);
            value = process.env[key] || "";

            // If the value is found, remove nested expansions.
            if (keyParts.length > 1 && value) {
                const replaceNested = matches[index + 1];
                matches[index + 1] = "";

                newEnv = newEnv.replace(replaceNested, "");
            }
            // Resolve recursive interpolations
            value = expand(value);
        }

        return newEnv.replace(replacePart, value);
    }, envValue);
}
