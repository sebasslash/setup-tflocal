import { RunCreateOptions, TFEClient } from "./tfe-client";
import * as core from "@actions/core";

export class TflocalInstance {
  private readonly defaultRunMsg: string =
    "Run queued via setup-tflocal Github action";
  private readonly instanceAddr: string =
    "module.tflocal.module.tfbox.aws_instance.tfbox";
  private readonly tokenAddr: string =
    "module.tflocal.var.tflocal_cloud_admin_token";
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

  public async build(shouldWait: boolean): Promise<string> {
    try {
      const runID = await this.createRun();
      if (shouldWait) {
        await this.waitForRun(runID, 10000);
      }
      return runID;
    } catch (err) {
      throw new Error(`Failed building tflocal instance: ${err.message}`);
    }
  }

  public async destroy(shouldWait: boolean): Promise<string> {
    try {
      const runID = await this.createRun(true);
      if (shouldWait) {
        await this.waitForRun(runID, 10000);
      }
      return runID;
    } catch (err) {
      throw new Error(`Failed destroying tflocal instance: ${err.message}`);
    }
  }

  public async outputs() {
    try {
      const workspaceID = await this.client.readWorkspaceID(
        this.organization,
        this.workspace
      );
      const svOutputs = await this.client.readStateVersionOutputs(workspaceID);
      if (svOutputs.length == 0) {
        throw new Error(
          `state version in workspace ${workspaceID} has no available outputs.`
        );
      }

      svOutputs.forEach(output => {
        let key = output.name;
        if (key == "ngrok_domain") {
          key = "tfe_hostname";
        }

        core.setOutput(key, output.value);
        if (output.sensitive) {
          core.setSecret(key);
        }
      });

      // Set TFE_USER
      core.setOutput("tfe_user1", "tfe-provider-user1");
      core.setOutput("tfe_user2", "tfe-provider-user2");
    } catch (err) {
      throw new Error(`Failed reading outputs: ${err.message}`);
    }
  }

  private async createRun(isDestroy: boolean = false): Promise<string> {
    try {
      const workspaceID = await this.client.readWorkspaceID(
        this.organization,
        this.workspace
      );
      const opts: RunCreateOptions = {
        autoApply: true,
        destroy: isDestroy,
        message: this.defaultRunMsg,
        workspaceID: workspaceID,
      };

      // If the run is not set to destroy, we'll add the replace addresses. For now,
      // these are default values.
      if (!isDestroy) {
        opts.replaceAddrs = [this.tokenAddr, this.instanceAddr];
      }

      const runID = await this.client.createRun({
        autoApply: true,
        destroy: isDestroy,
        message: this.defaultRunMsg,
        workspaceID: workspaceID,
      });
      return runID;
    } catch (err) {
      throw new Error(`Failed to create run: ${err.message}`);
    }
  }

  private waitForRun(runID: string, interval: number) {
    const poll = async (resolve, reject) => {
      const status = await this.client.readRunStatus(runID);
      switch (status) {
        case "canceled":
        case "errored":
        case "discarded":
          reject(new Error(`run exited unexpectedly with status: ${status}`));
        case "applied":
          // run has completed successfully
          resolve();
        default:
          setTimeout(poll, interval, resolve, reject);
      }
    };

    return new Promise(poll);
  }
}
