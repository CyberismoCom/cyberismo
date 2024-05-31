import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

/**
 * Handles reading of a JSON file.
 * @param file file name (and path) to read.
 * @returns Parsed JSON content.
 * @throws if file is not found, or file is not a JSON file.
 */
export function readJsonFileSync(file: string) {
    try {
        const raw = readFileSync(file, { flag: 'rs', encoding: 'utf-8' });
        const returnValue = JSON.parse(raw);
        return returnValue;
    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Error while handling JSON file '${file}' : ${error.message}`);
        }
    }
}

/**
 * Handles reading of a JSON file.
 * @param file file name (and path) to read.
 * @returns Parsed JSON content.
 * @throws if file is not found, or file is not a JSON file.
 */
export async function readJsonFile(file: string) {
    try {
        const raw = await readFile(file, { encoding: 'utf-8' });
        return JSON.parse(raw);
    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Error while handling JSON file '${file}' : ${error.message}`);
        }
    }
}

/**
 * Reads ADOC file.
 * @param file file name (and path) to read.
 * @returns ADOC file content.
 * @throws if file is not found.
 */
export function readADocFileSync(file: string) {
    try {
        const raw = readFileSync(file, { encoding: 'utf-8' });
        return raw;
    } catch {
        throw new Error(`Adoc file '${file}' not found`);
    }
}

/**
 * Format an object with JSON.stringify
 *
 * The purpose of this function is to format the JSON output in a centralised function
 * so that the format can be controlled in a single location.
 *
 * @param json JSON object to format.
 * @returns Formatted JSON string
 */
export function formatJson(json: object) {
    return JSON.stringify(json, null, 4);
}