import MockAdapter from "axios-mock-adapter";
import { TFEClient, Output } from "./tfe-client";

export interface MockTFEClient {
  client: TFEClient;
  adapter: MockAdapter;
  defaultRunID: string;
  defaultWorkspaceID: string;
}

export const newMockTFEClient = (): MockTFEClient => {
  const client = new TFEClient("app.terraform.io", "foobar");
  const adapter = new MockAdapter(Reflect.get(client, "_client"));
  const defaultRunID = "run-CZcmD7eagjhyX0vN";
  const defaultWorkspaceID = "ws-noZcaGXsac6aZSJR";

  adapter
    .onPost(`https://app.terraform.io/api/v2/runs`)
    .reply(201, require("./test-fixtures/create-run.json"));

  adapter
    .onGet(
      `https://app.terraform.io/api/v2/organizations/hashicorp/workspaces/foobar`
    )
    .reply(200, require("./test-fixtures/read-workspace.json"));

  adapter
    .onGet(`https://app.terraform.io/api/v2/runs/${defaultRunID}`)
    .reply(200, require("./test-fixtures/read-run.json"));

  adapter
    .onGet(
      `https://app.terraform.io/api/v2/workspaces/${defaultWorkspaceID}/current-state-version`
    )
    .reply(200, require("./test-fixtures/sv-with-outputs.json"));

  return {
    client,
    adapter,
    defaultRunID,
    defaultWorkspaceID,
  };
};

describe("TFE Client", () => {
  let mockClient: MockTFEClient;

  beforeAll(() => {
    mockClient = newMockTFEClient();
  });

  test("returns run ID when run is created", done => {
    mockClient.client
      .createRun({
        destroy: false,
        autoApply: true,
        message: "Some message!",
        workspaceID: "ws-foobar1234",
      })
      .then(runID => {
        expect(runID).toEqual(mockClient.defaultRunID);
        done();
      });
  });

  test("returns workspace ID when fetched with org name pair", done => {
    const expected = require("./test-fixtures/read-workspace.json");
    mockClient.client
      .readWorkspaceID("hashicorp", "foobar")
      .then(workspaceID => {
        expect(workspaceID).toEqual(expected["data"]["id"]);
        done();
      });
  });

  test("returns runs status when run is read", done => {
    const expected = require("./test-fixtures/read-run.json");
    // Lets modify the status of the run to "applying"
    expected["data"]["attributes"]["status"] = "applying";

    // Mock a separate endpoint so we don't conflict with the status
    // read from the fixture
    mockClient.adapter
      .onGet(`https://app.terraform.io/api/v2/runs/run-foobar`)
      .reply(200, expected);

    mockClient.client.readRunStatus("run-foobar").then(runStatus => {
      expect(runStatus).toEqual("applying");
      done();
    });
  });

  test("returns outputs when latest state version is read from workspace", done => {
    const expectedOutputNames = ["foo", "bar", "foobar"];

    mockClient.client
      .readStateVersionOutputs(mockClient.defaultWorkspaceID)
      .then((outputs: Output[]) => {
        outputs.forEach(output => {
          expect(expectedOutputNames).toContain(output.name);
          expect(output.value).toBeDefined();
        });
        done();
      })
      .catch(err => {
        expect(err).toBe(null);
      });
  });
});
