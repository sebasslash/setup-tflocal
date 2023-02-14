import * as core from "@actions/core";

interface Logger {
  debug(msg: string): void;
}

export const DefaultLogger: Logger = core;
