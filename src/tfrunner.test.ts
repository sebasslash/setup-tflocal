import { TfRunner } from "./tfrunner";
import { MockTFEClient, newMockTFEClient } from "./tfe-client.test";
import * as core from "@actions/core";
import { RunCreateOptions } from "./tfe-client";

export interface MockTfRunner {
  tflocal: TfRunner;
  tfeClient: MockTFEClient;
  defaultRunOpts: RunCreateOptions;
}

export const newMockTflocalInstance = (): MockTfRunner => {
  const tflocal = new TfRunner(
    "hashicorp",
    "foobar",
    "app.terraform.io",
    "foobar"
  );

  const tfeClient = newMockTFEClient();
  Reflect.set(tflocal, "client", tfeClient.client);

  const defaultRunOpts: RunCreateOptions = {
    autoApply: true,
    isDestroy: false,
    message: "Foobar",
    workspaceID: tfeClient.defaultWorkspaceID,
  };

  return {
    tflocal,
    tfeClient,
    defaultRunOpts,
  };
};

describe("Tfrunner", () => {
  let mockInstance: MockTfRunner;
  jest.useFakeTimers();

  beforeAll(() => {
    mockInstance = newMockTflocalInstance();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  test("creates run but does not wait", async () => {
    try {
      const runID = await mockInstance.tflocal.createRun(
        mockInstance.defaultRunOpts,
        false
      );
      expect(runID).toBe(mockInstance.tfeClient.defaultRunID);
    } catch (err) {
      console.log(err);
    }
  });

  test("creates run and waits for run", async () => {
    const mockRunProgress = setTimeout(() => {
      const run = require("./test-fixtures/read-run.json");
      // Lets modify the status of the run to "applied" as to
      // mimic run success in TFC
      run["data"]["attributes"]["status"] = "applied";

      // Update the existing endpoint mock to return the updated
      // run object
      mockInstance.tfeClient.adapter
        .onGet(
          `https://app.terraform.io/api/v2/runs/${mockInstance.tfeClient.defaultRunID}`
        )
        .replyOnce(200, run);
    }, 5000);

    mockInstance.tflocal
      .createRun(mockInstance.defaultRunOpts, true)
      .then(runID => {
        expect(runID).toBe(mockInstance.tfeClient.defaultRunID);
      })
      .catch(err => {
        expect(err).toBeNull();
      })
      .finally(() => {
        clearTimeout(mockRunProgress);
      });

    for (let i = 0; i < 15; i++) {
      jest.advanceTimersByTime(1000);
      // Flush out any pending promises
      await Promise.resolve();
    }
  });

  test("builds instance and waits, but run errors", async () => {
    const mockRunProgress = setTimeout(() => {
      const run = require("./test-fixtures/read-run.json");
      // Lets modify the status of the run to "errored" as to
      // mimic some run failure in TFC
      run["data"]["attributes"]["status"] = "errored";

      // Update the existing endpoint mock to return the updated
      // run object
      mockInstance.tfeClient.adapter
        .onGet(
          `https://app.terraform.io/api/v2/runs/${mockInstance.tfeClient.defaultRunID}`
        )
        .replyOnce(200, run);
    }, 5000);

    mockInstance.tflocal
      .createRun(mockInstance.defaultRunOpts, true)
      .catch(err => {
        expect(err.message).toMatch(
          /run exited unexpectedly with status: errored/
        );
      })
      .finally(() => {
        clearTimeout(mockRunProgress);
      });

    for (let i = 0; i < 15; i++) {
      jest.advanceTimersByTime(1000);
      // Flush out any pending promises
      await Promise.resolve();
    }
  });

  test("fetches outputs from tflocal instance", async () => {
    const mockResourcesProcessed = setTimeout(() => {
      const sv = require("./test-fixtures/sv-with-outputs.json");
      // Lets modify the status of the state version to "resources-processed: true" as to
      // mimic that TFC has successfully parsed the SV generated from the run.
      sv["data"]["attributes"]["resources-processed"] = true;

      // Update the mock to return the updated state version
      mockInstance.tfeClient.adapter
        .onGet(
          `https://app.terraform.io/api/v2/workspaces/${mockInstance.tfeClient.defaultWorkspaceID}/current-state-version`
        )
        .reply(200, sv);
    }, 3000);

    let outputs = {};
    let secrets = [];
    const outputSpy = jest.spyOn(core, "setOutput");
    outputSpy.mockImplementation((name, value) => (outputs[name] = value));

    // Lol
    const secretSpy = jest.spyOn(core, "setSecret");
    secretSpy.mockImplementation(name => secrets.push(name));

    mockInstance.tflocal
      .outputs()
      .then(() => {
        // These outputs are derived from test-fixtures/sv-with-outputs.json
        // The output names/value are hardcoded in the response.
        expect(outputs["foo"]).toEqual("example-output");
        expect(outputs["bar"]).toEqual("some-sensitive-output");
        expect(outputs["foobar"]).toEqual(
          JSON.stringify(["some", "arr", "val"])
        );
        expect(secrets).toContain("bar");
      })
      .finally(() => clearTimeout(mockResourcesProcessed));

    for (let i = 0; i < 10; i++) {
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
    }
  });
});
