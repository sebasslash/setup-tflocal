import axios, { AxiosInstance } from "axios";
import * as querystring from "querystring";

export interface RunCreateOptions {
  autoApply: boolean;
  isDestroy: boolean;
  message: string;
  workspaceID: string;
  replaceAddrs?: string[];
  targetAddrs?: string[];
}

export interface Output {
  name: string;
  sensitive: boolean;
  type: string;
  value: any;
}

export class TFEClient {
  private token: string;
  private hostname: string;
  private _client: AxiosInstance;

  constructor(hostname: string, token: string) {
    this.token = token;
    this.hostname = hostname;

    this._client = axios.create({
      baseURL: `https://${this.hostname}/api/v2/`,
      timeout: 30000,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
      },
    });
  }

  public async createRun(opts: RunCreateOptions): Promise<string> {
    try {
      const attributes = {
        message: opts.message,
        "auto-apply": opts.autoApply,
        "is-destroy": opts.isDestroy,
      };

      if (opts.replaceAddrs) {
        attributes["replace-addrs"] = opts.replaceAddrs;
      }

      if (opts.targetAddrs) {
        attributes["target-addrs"] = opts.targetAddrs;
      }

      const resp = await this._client.post("runs", {
        data: {
          attributes: attributes,
          type: "runs",
          relationships: {
            workspace: {
              data: {
                type: "workspaces",
                id: opts.workspaceID,
              },
            },
          },
        },
      });

      return resp.data["data"]["id"];
    } catch (err) {
      throw new Error(
        `Failed to create run on workspace ${opts.workspaceID}: ${err.message}`
      );
    }
  }

  public async readWorkspaceID(
    organization: string,
    workspace: string
  ): Promise<string> {
    try {
      const url = `organizations/${querystring.escape(
        organization
      )}/workspaces/${querystring.escape(workspace)}`;
      const resp = await this._client.get(url);

      return resp.data["data"]["id"];
    } catch (err) {
      throw new Error(
        `Failed to read workspace ${organization}/${workspace}: ${err.message}`
      );
    }
  }

  public async readRunStatus(runID: string): Promise<string> {
    try {
      const url = `runs/${querystring.escape(runID)}`;
      const resp = await this._client.get(url);

      return resp.data["data"]["attributes"]["status"];
    } catch (err) {
      throw new Error(`Failed to read run status ${runID}: ${err.message}`);
    }
  }

  public async readStateVersionOutputs(workspaceID: string): Promise<Output[]> {
    try {
      const resp = await this.readCurrentSV(workspaceID, {
        params: {
          include: "outputs",
        },
      });
      return resp.data["included"].map(x => x["attributes"] as Output);
    } catch (err) {
      throw new Error(
        `Failed to read latest state version outputs in workspace ${workspaceID}: ${err.message}`
      );
    }
  }

  public async readResourcesProcessed(workspaceID: string): Promise<boolean> {
    try {
      const resp = await this.readCurrentSV(workspaceID, {});
      return resp.data["data"]["attributes"]["resources-processed"] as boolean;
    } catch (err) {
      throw new Error(`Failed to read resources processed: ${err.message}`);
    }
  }

  private async readCurrentSV(workspaceID: string, opts: any) {
    try {
      const url = `workspaces/${querystring.escape(
        workspaceID
      )}/current-state-version`;
      return await this._client.get(url, opts);
    } catch (err) {
      throw new Error(`Failed reading current state version: ${err.message}`);
    }
  }
}
