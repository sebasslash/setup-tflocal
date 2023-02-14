/**
 * Copyright (c) HashiCorp, Inc.
 * SPDX-License-Identifier: MPL-2.0
 */

import { TfRunner } from "./tfrunner";
import { MockTFEClient, newMockTFEClient } from "./tfe-client.test";
import { RunCreateOptions } from "./tfe-client";

export interface MockTfRunner {
  runner: TfRunner;
  tfeClient: MockTFEClient;
  defaultRunOpts: RunCreateOptions;
}

export const newMockTfRunner = (): MockTfRunner => {
  const runner = new TfRunner(
    "hashicorp",
    "foobar",
    "app.terraform.io",
    "foobar"
  );

  const tfeClient = newMockTFEClient();
  Reflect.set(runner, "client", tfeClient.client);

  const defaultRunOpts: RunCreateOptions = {
    autoApply: true,
    isDestroy: false,
    message: "Foobar",
    workspaceID: tfeClient.defaultWorkspaceID,
  };

  return {
    runner,
    tfeClient,
    defaultRunOpts,
  };
};

describe("Tfrunner", () => {
  let mockRunner: MockTfRunner;
  jest.useFakeTimers();

  beforeAll(() => {
    mockRunner = newMockTfRunner();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  test("creates run but does not wait", async () => {
    try {
      const runID = await mockRunner.runner.createRun(
        mockRunner.defaultRunOpts,
        false
      );
      expect(runID).toBe(mockRunner.tfeClient.defaultRunID);
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
      mockRunner.tfeClient.adapter
        .onGet(
          `https://app.terraform.io/api/v2/runs/${mockRunner.tfeClient.defaultRunID}`
        )
        .replyOnce(200, run);
    }, 5000);

    mockRunner.runner
      .createRun(mockRunner.defaultRunOpts, true)
      .then(runID => {
        expect(runID).toBe(mockRunner.tfeClient.defaultRunID);
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

  test("creates run and waits, but run errors", async () => {
    const mockRunProgress = setTimeout(() => {
      const run = require("./test-fixtures/read-run.json");
      // Lets modify the status of the run to "errored" as to
      // mimic some run failure in TFC
      run["data"]["attributes"]["status"] = "errored";

      // Update the existing endpoint mock to return the updated
      // run object
      mockRunner.tfeClient.adapter
        .onGet(
          `https://app.terraform.io/api/v2/runs/${mockRunner.tfeClient.defaultRunID}`
        )
        .replyOnce(200, run);
    }, 5000);

    mockRunner.runner
      .createRun(mockRunner.defaultRunOpts, true)
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

  test("fetches outputs from TFC workspace", async () => {
    const mockResourcesProcessed = setTimeout(() => {
      const sv = require("./test-fixtures/sv-with-outputs.json");
      // Lets modify the status of the state version to "resources-processed: true" as to
      // mimic that TFC has successfully parsed the SV generated from the run.
      sv["data"]["attributes"]["resources-processed"] = true;

      // Update the mock to return the updated state version
      mockRunner.tfeClient.adapter
        .onGet(
          `https://app.terraform.io/api/v2/workspaces/${mockRunner.tfeClient.defaultWorkspaceID}/current-state-version`
        )
        .reply(200, sv);
    }, 3000);
    mockRunner.runner
      .outputs()
      .then(resolved => {
        expect(resolved.length).toEqual(3); // Number of outputs in test fixture
      })
      .finally(() => clearTimeout(mockResourcesProcessed));

    for (let i = 0; i < 10; i++) {
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
    }
  });
});
