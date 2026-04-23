const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const distDir = path.join(process.cwd(), ".next");
const backupDir = path.join(process.cwd(), ".next-dev-backup");

function readCommand(command, args) {
  return childProcess.execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
}

function stopStaleProjectMapperOnPort3000() {
  let output;

  try {
    output = readCommand("lsof", ["-nP", "-iTCP:3000", "-sTCP:LISTEN", "-Fp"]);
  } catch {
    return;
  }

  const pid = output
    .split("\n")
    .find((line) => line.startsWith("p"))
    ?.slice(1)
    .trim();

  if (!pid) {
    return;
  }

  let cwdOutput;

  try {
    cwdOutput = readCommand("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"]);
  } catch {
    return;
  }

  const cwd = cwdOutput
    .split("\n")
    .find((line) => line.startsWith("n"))
    ?.slice(1)
    .trim();

  if (!cwd || path.resolve(cwd) !== process.cwd()) {
    return;
  }

  process.kill(Number(pid), "SIGKILL");
  process.stdout.write(`Stopped stale ProjectMapper server on port 3000 (pid ${pid}).\n`);
}

stopStaleProjectMapperOnPort3000();

if (!fs.existsSync(distDir)) {
  process.exit(0);
}

const devDir = path.join(distDir, "dev");

if (fs.existsSync(devDir)) {
  process.exit(0);
}

fs.rmSync(backupDir, { recursive: true, force: true, maxRetries: 3 });
fs.renameSync(distDir, backupDir);

process.stdout.write("Moved existing .next output to .next-dev-backup before starting next dev.\n");