import axios, { AxiosInstance } from "axios";
import * as querystring from "querystring";

export interface RunCreateOptions {
  destroy: boolean;
  message: string;
  workspaceID: string;
  autoApply: boolean;
  replaceAddrs?: string[];
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
        "is-destroy": opts.destroy,
      };

      if (opts.replaceAddrs && opts.replaceAddrs.length > 0) {
        attributes["replace-addrs"] = opts.replaceAddrs;
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
    return null;
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
      const url = `workspaces/${querystring.escape(
        workspaceID
      )}/current-state-version`;
      const resp = await this._client.get(url, {
        params: {
          include: "outputs",
        },
      });

      const outputs: Output[] = resp.data["data"]["relationships"]["outputs"][
        "data"
      ].map(x => x["attributes"] as Output);
      return outputs;
    } catch (err) {
      throw new Error(
        `Failed to latest state version outputs in workspace ${workspaceID}: ${err.message}`
      );
    }
  }
}
