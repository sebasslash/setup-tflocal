import { TflocalInstance } from "./instance";
import { MockTFEClient, newMockTFEClient } from "./tfe-client.test";
import * as core from "@actions/core";

export interface MockTflocalInstance {
  tflocal: TflocalInstance;
  tfeClient: MockTFEClient;
}

export const newMockTflocalInstance = (): MockTflocalInstance => {
  const tflocal = new TflocalInstance(
    "hashicorp",
    "foobar",
    "app.terraform.io",
    "foobar"
  );
  const tfeClient = newMockTFEClient();
  Reflect.set(tflocal, "client", tfeClient.client);

  return {
    tflocal,
    tfeClient,
  };
};

describe("Tflocal instance", () => {
  let mockInstance: MockTflocalInstance;
  jest.useFakeTimers();

  beforeAll(() => {
    mockInstance = newMockTflocalInstance();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  test("builds instance but does not wait", async () => {
    try {
      const runID = await mockInstance.tflocal.build(false);
      expect(runID).toBe(mockInstance.tfeClient.defaultRunID);
    } catch (err) {
      console.log(err);
    }
  });

  test("destroys instance but does not wait", async () => {
    try {
      const runID = await mockInstance.tflocal.destroy(false);
      expect(runID).toBe(mockInstance.tfeClient.defaultRunID);
    } catch (err) {
      console.log(err);
    }
  });

  test("builds instance and waits for run", async () => {
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
      .build(true)
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
      .build(true)
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
    let outputs = {};
    let secrets = [];
    const outputSpy = jest.spyOn(core, "setOutput");
    outputSpy.mockImplementation((name, value) => (outputs[name] = value));

    // Lol
    const secretSpy = jest.spyOn(core, "setSecret");
    secretSpy.mockImplementation(name => secrets.push(name));

    await mockInstance.tflocal.outputs();
    // These outputs are derived from test-fixtures/sv-with-outputs.json
    // The output names/value are hardcoded in the response.
    expect(outputs["foo"]).toEqual("example-output");
    expect(outputs["bar"]).toEqual("some-sensitive-output");
    expect(outputs["foobar"]).toEqual(["some", "arr", "val"]);
    expect(outputs["tfe_user1"]).toEqual("tfe-provider-user1");
    expect(outputs["tfe_user2"]).toEqual("tfe-provider-user2");
    expect(secrets).toContain("bar");
  });
});
