import * as core from "@actions/core";
import { configureRunner } from "./tfrunner";

async function run() {
  const { runner, opts } = configureRunner();
  const shouldWait = core.getBooleanInput("wait-for-run");
  const skipRun = core.getBooleanInput("skip-run");

  if (!skipRun) {
    core.debug(`Creating run in workspace: ${core.getInput("workspace")}`);
    const id = await runner.createRun(opts, shouldWait);
    core.debug(
      `Run (${id}) has been created ${
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
}

(async () => {
  try {
    await run();
  } catch (err) {
    core.setFailed(err.message);
  }
})();
