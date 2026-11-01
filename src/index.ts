#!/usr/bin/env node
import { finish, runCli } from "./cli.js";

finish(await runCli(process.argv.slice(2), process), process);
