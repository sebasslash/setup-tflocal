import * as core from "@actions/core";
import { TflocalInstance } from "./instance";

function initInstance(): TflocalInstance {
  return new TflocalInstance(
    core.getInput("organization"),
    core.getInput("workspace"),
    core.getInput("tfe_hostname"),
    core.getInput("tfe_token")
  );
}

async function run() {
  const instance = initInstance();
  const shouldBuild = core.getBooleanInput("build");
  const shouldDestroy = core.getBooleanInput("destroy");
  const shouldWait = core.getBooleanInput("wait-for-run");

  // We cannot set build and destroy to be true
  if (shouldBuild && shouldDestroy) {
    throw new Error(
      "You cannot set build and destroy to true in the same step."
    );
  }

  if (shouldBuild) {
    core.debug("Building tflocal instance");
    await instance.build(shouldWait);
  }

  // We shouldn't bother fetching outputs if the instance will be destroyed
  // or if the instance is set to build but we don't wait for it to complete.
  if (!shouldDestroy || (shouldBuild && shouldWait)) {
    core.debug("Fetching outputs from tflocal instance");
    await instance.outputs();
  }

  if (shouldDestroy) {
    core.debug("Destroying tflocal instance");
    await instance.destroy(shouldWait);
  }
}

(async () => {
  try {
    await run();
  } catch (err) {
    core.setFailed(err.message);
  }
})();
