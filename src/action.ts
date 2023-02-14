/**
 * Copyright (c) HashiCorp, Inc.
 * SPDX-License-Identifier: MPL-2.0
 */

import * as core from "@actions/core";
import { TfRunner } from "./tfrunner";
import { RunCreateOptions } from "./tfe-client";
import { DefaultLogger as log } from "./logger";

function configureRunner() {
  const runner = new TfRunner(
    core.getInput("organization"),
    core.getInput("workspace"),
    core.getInput("tfe_hostname"),
    core.getInput("tfe_token")
  );

  return runner;
}

function configureRunOptions(): RunCreateOptions {
  const opts: RunCreateOptions = {
    autoApply: core.getBooleanInput("auto-apply"),
    isDestroy: core.getBooleanInput("is-destroy"),
    message: core.getInput("message"),
    workspaceID: "",
  };

  if (core.getMultilineInput("replace-addrs").length > 0) {
    opts.replaceAddrs = core.getMultilineInput("replace-addrs");
  }

  if (core.getMultilineInput("target-addrs").length > 0) {
    opts.targetAddrs = core.getMultilineInput("target-addrs");
  }

  return opts;
}

async function run(): Promise<void> {
  const runner = configureRunner();
  const shouldWait = core.getBooleanInput("wait-for-run");
  const skipRun = core.getBooleanInput("skip-run");
  const opts = configureRunOptions();

  let runID = "";
  if (!skipRun) {
    log.debug(`Creating run in workspace: ${core.getInput("workspace")}`);
    runID = await runner.createRun(opts, shouldWait);
    log.debug(
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
  if (!opts.isDestroy) {
    log.debug("Fetching outputs from workspace");
    const workspaceOutputs = await runner.outputs();

    // Tell github actions which values are secret and should be redacted
    workspaceOutputs.forEach(output => {
      if (output.sensitive) {
        core.setSecret(output.value);
      }
    });

    // Transform outputs to a name/value dictionary
    const outputsAsObject = workspaceOutputs.reduce(
      (acc: { [key: string]: any }, output) => {
        acc[output.name] = output.value;
        return acc;
      },
      {}
    );

    // Transform Output
    core.setOutput("workspace-outputs", JSON.stringify(outputsAsObject));
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
