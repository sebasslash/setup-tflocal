/**
 * Copyright (c) HashiCorp, Inc.
 * SPDX-License-Identifier: MPL-2.0
 */

import { TFEClient, RunCreateOptions, Output } from "./tfe-client";
import { DefaultLogger as log } from "./logger";

const pollIntervalRunMs = 3000;
const pollIntervalOutputsMs = 1000;

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
        await this.waitForRun(runID);
      }

      return runID;
    } catch (err) {
      throw new Error(`Failed to create run: ${err.message}`);
    }
  }

  public async outputs(): Promise<Output[]> {
    try {
      const workspaceID = await this.client.readWorkspaceID(
        this.organization,
        this.workspace
      );

      await this.waitForOutputs(workspaceID, pollIntervalOutputsMs);
      return await this.client.readStateVersionOutputs(workspaceID);
    } catch (err) {
      throw new Error(`Failed reading outputs: ${err.message}`);
    }
  }

  private async waitForRun(runID: string) {
    while (true) {
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
          log.debug(`Waiting for run ${runID} to complete, polling`);
          await this.sleep(pollIntervalRunMs);
      }
    }
  }

  private async waitForOutputs(workspaceID: string, interval: number) {
    while (true) {
      const resourcesProcessed = await this.client.readResourcesProcessed(
        workspaceID
      );

      if (!resourcesProcessed) {
        log.debug(`Waiting for workspace outputs to be ready, polling`);
        await this.sleep(interval);
        continue;
      }

      return;
    }
  }

  private async sleep(interval: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}
