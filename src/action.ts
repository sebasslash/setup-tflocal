/**
 * Copyright (c) HashiCorp, Inc.
 * SPDX-License-Identifier: MPL-2.0
 */

import * as core from "@actions/core";
import { configureRunner } from "./tfrunner";

async function run(): Promise<void> {
  const { runner, opts } = configureRunner();
  const shouldWait = core.getBooleanInput("wait-for-run");
  const skipRun = core.getBooleanInput("skip-run");

  let runID = "";
  if (!skipRun) {
    core.debug(`Creating run in workspace: ${core.getInput("workspace")}`);
    runID = await runner.createRun(opts, shouldWait);
    core.debug(
      `Run (${runID}) has been created ${
        shouldWait
          ? "and been applied successfully"
          : "but has not yet been applied"
      }`
    );
  }

  // Outputs are only fetched if:
  // The action creates an apply run and waits for it to complete
  // The action simply does not create a run (i.e skip-run: true)
  if (skipRun || (!opts.isDestroy && shouldWait)) {
    core.debug("Fetching outputs from workspace");
    await runner.outputs();
  }

  core.setOutput("run-id", runID);
}

(async () => {
  try {
    await core.group("terraform-cloud-run", () => run());
  } catch (err) {
    core.setFailed(err.message);
  }
})();
