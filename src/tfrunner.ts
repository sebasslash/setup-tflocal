import { RunCreateOptions, TFEClient } from "./tfe-client";
import * as core from "@actions/core";

export function configureRunner() {
  const runner = new TfRunner(
    core.getInput("organization"),
    core.getInput("workspace"),
    core.getInput("tfe_hostname"),
    core.getInput("tfe_token")
  );

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

  return {
    runner,
    opts,
  };
}

export class TfRunner {
  private client: TFEClient;
  private organization: string;
  private workspace: string;

  constructor(
    organization: string,
    workspace: string,
    hostname: string,
    token: string
  ) {
    this.organization = organization;
    this.workspace = workspace;
    this.client = new TFEClient(hostname, token);
  }

  public async createRun(
    opts: RunCreateOptions,
    waitForRun: boolean
  ): Promise<string> {
    try {
      const workspaceID = await this.client.readWorkspaceID(
        this.organization,
        this.workspace
      );
      opts.workspaceID = workspaceID;

      const runID = await this.client.createRun(opts);

      if (waitForRun) {
        await this.waitForRun(runID, 5000);
      }

      return runID;
    } catch (err) {
      throw new Error(`Failed to create run: ${err.message}`);
    }
  }

  public async outputs() {
    try {
      const workspaceID = await this.client.readWorkspaceID(
        this.organization,
        this.workspace
      );

      await this.waitForOutputs(workspaceID, 2000);

      const svOutputs = await this.client.readStateVersionOutputs(workspaceID);
      if (svOutputs.length == 0) {
        throw new Error(
          `state version in workspace ${workspaceID} has no available outputs.`
        );
      }

      svOutputs.forEach(output => {
        let key = output.name;

        if (typeof output.value != "string") {
          output.value = JSON.stringify(output.value);
        }

        core.setOutput(key, output.value);
        if (output.sensitive) {
          core.setSecret(output.value);
        }

        core.debug(`Fetched output: ${key}`);
      });
    } catch (err) {
      throw new Error(`Failed reading outputs: ${err.message}`);
    }
  }

  private async waitForRun(runID: string, interval: number) {
    const status = await this.client.readRunStatus(runID);
    switch (status) {
      case "canceled":
      case "errored":
      case "discarded":
        throw new Error(`run exited unexpectedly with status: ${status}`);
      case "planned_and_finished":
      case "applied":
        // run has completed successfully
        return;
      default:
        core.debug(`Waiting for run ${runID} to complete, polling`);
        await new Promise(resolve => setTimeout(resolve, interval));
        await this.waitForRun(runID, interval);
    }
  }

  private async waitForOutputs(workspaceID: string, interval: number) {
    const resourcesProcessed = await this.client.readResourcesProcessed(
      workspaceID
    );

    if (!resourcesProcessed) {
      core.debug(`Waiting for workspace outputs to be ready, polling`);
      await new Promise(resolve => setTimeout(resolve, interval));
      await this.waitForOutputs(workspaceID, interval);
    }

    return;
  }
}
