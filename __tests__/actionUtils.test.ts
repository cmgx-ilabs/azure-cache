import * as core from "@actions/core";

import { Events, Outputs, RefKey, State } from "../src/constants";
import * as actionUtils from "../src/utils/actionUtils";
import * as testUtils from "../src/utils/testUtils";

jest.mock("@actions/core");

beforeAll(() => {
    jest.spyOn(core, "getInput").mockImplementation((name, options) => {
        return jest.requireActual("@actions/core").getInput(name, options);
    });
});

afterEach(() => {
    delete process.env[Events.Key];
    delete process.env[RefKey];
});

test("setCacheHit with true", () => {
    const setOutputMock = jest.spyOn(core, "setOutput");
    const saveStateMock = jest.spyOn(core, "saveState");

    actionUtils.setCacheHit(true);

    expect(setOutputMock).toHaveBeenCalledWith(Outputs.CacheHit, "true");
    expect(setOutputMock).toHaveBeenCalledTimes(1);
    expect(saveStateMock).toHaveBeenCalledWith(State.CacheHit, "true");
    expect(saveStateMock).toHaveBeenCalledTimes(1);
});

test("setCacheHit with false", () => {
    const setOutputMock = jest.spyOn(core, "setOutput");
    const saveStateMock = jest.spyOn(core, "saveState");

    actionUtils.setCacheHit(false);

    expect(setOutputMock).toHaveBeenCalledWith(Outputs.CacheHit, "false");
    expect(setOutputMock).toHaveBeenCalledTimes(1);
    expect(saveStateMock).toHaveBeenCalledWith(State.CacheHit, "false");
    expect(saveStateMock).toHaveBeenCalledTimes(1);
});

test("getCacheHit with hit", () => {
    const getStateMock = jest.spyOn(core, "getState");
    getStateMock.mockImplementation(() => {
        return "true";
    });

    const state = actionUtils.getCacheHit();

    expect(state).toEqual(true);

    expect(getStateMock).toHaveBeenCalledWith(State.CacheHit);
    expect(getStateMock).toHaveBeenCalledTimes(1);
});

test("getCacheHit with no hit", () => {
    const getStateMock = jest.spyOn(core, "getState");
    getStateMock.mockImplementation(() => {
        return "false";
    });

    const state = actionUtils.getCacheHit();

    expect(state).toEqual(false);

    expect(getStateMock).toHaveBeenCalledWith(State.CacheHit);
    expect(getStateMock).toHaveBeenCalledTimes(1);
});

test("logWarning logs a message with a warning prefix", () => {
    const message = "A warning occurred.";

    const infoMock = jest.spyOn(core, "info");

    actionUtils.logWarning(message);

    expect(infoMock).toHaveBeenCalledWith(`[warning]${message}`);
});

test("isValidEvent returns false for event that does not have a branch or tag", () => {
    const event = "foo";
    process.env[Events.Key] = event;

    const isValidEvent = actionUtils.isValidEvent();

    expect(isValidEvent).toBe(false);
});

test("isValidEvent returns true for event that has a ref", () => {
    const event = Events.Push;
    process.env[Events.Key] = event;
    process.env[RefKey] = "ref/heads/feature";

    const isValidEvent = actionUtils.isValidEvent();

    expect(isValidEvent).toBe(true);
});

test("getInputAsArray returns empty array if not required and missing", () => {
    expect(actionUtils.getInputAsArray("foo")).toEqual([]);
});

test("getInputAsArray throws error if required and missing", () => {
    expect(() =>
        actionUtils.getInputAsArray("foo", { required: true })
    ).toThrowError();
});

test("getInputAsArray handles single line correctly", () => {
    testUtils.setInput("foo", "bar");
    expect(actionUtils.getInputAsArray("foo")).toEqual(["bar"]);
});

test("getInputAsArray handles multiple lines correctly", () => {
    testUtils.setInput("foo", "bar\nbaz");
    expect(actionUtils.getInputAsArray("foo")).toEqual(["bar", "baz"]);
});

test("getInputAsArray handles different new lines correctly", () => {
    testUtils.setInput("foo", "bar\r\nbaz");
    expect(actionUtils.getInputAsArray("foo")).toEqual(["bar", "baz"]);
});

test("getInputAsArray handles empty lines correctly", () => {
    testUtils.setInput("foo", "\n\nbar\n\nbaz\n\n");
    expect(actionUtils.getInputAsArray("foo")).toEqual(["bar", "baz"]);
});

test("getInputAsInt returns undefined if input not set", () => {
    expect(actionUtils.getInputAsInt("undefined")).toBeUndefined();
});

test("getInputAsInt returns value if input is valid", () => {
    testUtils.setInput("foo", "8");
    expect(actionUtils.getInputAsInt("foo")).toBe(8);
});

test("getInputAsInt returns undefined if input is invalid or NaN", () => {
    testUtils.setInput("foo", "bar");
    expect(actionUtils.getInputAsInt("foo")).toBeUndefined();
});

test("getInputAsInt throws if required and value missing", () => {
    expect(() =>
        actionUtils.getInputAsInt("undefined", { required: true })
    ).toThrowError();
});
